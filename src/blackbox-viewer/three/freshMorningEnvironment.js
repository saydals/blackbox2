import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

// ---------------------------------------------------------------------------
// Fresh morning airfield — Three.js port of the rf3d Babylon.js scene
// (rf3d/src/scene/createAirfield.ts and friends).
//
// The same airfield: a circular grass helipad with a painted "H", rolling
// terrain with a level apron, distant hills, low-poly vegetation, wooden
// fences, a windsock and the pilot area. Layout, colours, sizes and the
// deterministic RNG seed mirror the Babylon original so both viewers show the
// same field. The scene is metric (1 unit = 1 m) and is added under the world
// group, so the airfield alignment rotation of Blackbox3DPanel applies to it.
// ---------------------------------------------------------------------------

/** Terrain quad size in metres. */
export const TERRAIN_SIZE = 1400;
/** The airfield is completely level inside this radius (m). */
export const FLAT_RADIUS = 60;
/** Circular grass helipad radius (m). */
export const HELIPAD_RADIUS = 15;
/** Height of the painted "H" on the helipad (m). The model length of the
 *  helicopter is scaled to half of it (see Blackbox3DPanel.vue). */
export const HELIPAD_MARK_HEIGHT = 9;
/** Height of the helipad surface above the terrain (m). It keeps the pad clear
 *  of the ground plane; the helicopter rests on exactly this height. */
export const HELIPAD_SURFACE_Y = 0.04;

/**
 * Deterministic (seeded) PRNG — the layout is identical on every reload.
 * mulberry32, same as rf3d/src/scene/utils.ts.
 * @param {number} seed
 * @returns {() => number} values in [0, 1)
 */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = (rng, min, max) => min + (max - min) * rng();
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const lerp = (a, b, t) => a + (b - a) * t;

function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function hash2(ix, iz) {
  let h = (ix * 374761393 + iz * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** 2D value noise, result in [-1, 1]. */
function valueNoise(x, z) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz);
  const b = hash2(ix + 1, iz);
  const c = hash2(ix, iz + 1);
  const d = hash2(ix + 1, iz + 1);
  return lerp(lerp(a, b, ux), lerp(c, d, ux), uz) * 2 - 1;
}

/** Fractal brownian motion, result roughly in [-1, 1]. */
function fbm(x, z, octaves = 4) {
  let amp = 0.5;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise(x * freq + i * 17.17, z * freq - i * 9.3);
    norm += amp;
    amp *= 0.5;
    freq *= 2.03;
  }
  return sum / norm;
}

/**
 * Terrain height in metres. The terrain mesh, the tree/bush/flower placement
 * and the fence/hay-bale placement all share this function (rf3d terrain.ts).
 */
export function terrainHeight(x, z) {
  const r = Math.hypot(x, z);
  const blend = smoothstep(FLAT_RADIUS, 170, r);
  if (blend <= 0) return 0;
  let h =
    5.5 * fbm(x * 0.011 + 3.1, z * 0.011 - 7.7, 3) +
    1.4 * fbm(x * 0.045 - 1.3, z * 0.045 + 2.2, 2);
  const far = smoothstep(230, 480, r);
  h += far * (16 * fbm(x * 0.0055 + 11.2, z * 0.0055 + 5.9, 3) + 5);
  return blend * h;
}

// ---------------------------------------------------------------------------
// Geometry helpers (rf3d/src/scene/meshUtils.ts)
// ---------------------------------------------------------------------------

/**
 * Paints per-vertex colours, driven by the local vertex positions.
 * @param {THREE.BufferGeometry} geometry
 * @param {THREE.Color | ((x: number, y: number, z: number) => THREE.Color)} color
 */
function paintVertices(geometry, color) {
  const position = geometry.attributes.position;
  const array = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i++) {
    const c =
      typeof color === "function"
        ? color(position.getX(i), position.getY(i), position.getZ(i))
        : color;
    array[i * 3] = c.r;
    array[i * 3 + 1] = c.g;
    array[i * 3 + 2] = c.b;
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(array, 3));
  return geometry;
}

/**
 * Paints whole triangles — used for the crisp colour borders of the umbrella
 * and the hay bale. The geometry is flattened in place (Babylon's
 * convertToFlatShadedMesh) so triangles no longer share vertices.
 * @returns {THREE.BufferGeometry} the geometry to keep using
 */
function paintFaces(geometry, color) {
  if (geometry.index) {
    const flat = geometry.toNonIndexed();
    for (const name of Object.keys(flat.attributes)) {
      geometry.setAttribute(name, flat.attributes[name]);
    }
    geometry.setIndex(null);
  }
  const position = geometry.attributes.position;
  const array = new Float32Array(position.count * 3);
  for (let t = 0; t < position.count; t += 3) {
    const cx =
      (position.getX(t) + position.getX(t + 1) + position.getX(t + 2)) / 3;
    const cy =
      (position.getY(t) + position.getY(t + 1) + position.getY(t + 2)) / 3;
    const cz =
      (position.getZ(t) + position.getZ(t + 1) + position.getZ(t + 2)) / 3;
    const c = typeof color === "function" ? color(cx, cy, cz) : color;
    for (let i = 0; i < 3; i++) {
      array[(t + i) * 3] = c.r;
      array[(t + i) * 3 + 1] = c.g;
      array[(t + i) * 3 + 2] = c.b;
    }
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(array, 3));
  return geometry;
}

/** Dark → light gradient driven by the local Y of a vertex. */
function shadeByHeight(base, minY, maxY, dark = 0.72, light = 1.12) {
  return (_x, y) => {
    const t = clamp((y - minY) / (maxY - minY), 0, 1);
    const k = dark + (light - dark) * t;
    return new THREE.Color(
      Math.min(1, base.r * k),
      Math.min(1, base.g * k),
      Math.min(1, base.b * k),
    );
  };
}

/** Slight random variation of a colour (rf3d jitterColor). */
function jitterColor(color, rng, amount) {
  const k = 1 + (rng() * 2 - 1) * amount;
  const g = 1 + (rng() * 2 - 1) * amount * 0.5;
  return new THREE.Color(
    Math.min(1, color.r * k),
    Math.min(1, color.g * k * g),
    Math.min(1, color.b * k),
  );
}

/**
 * Merges parts into a single, flat-shaded, vertex-coloured geometry. Parts
 * without a colour attribute default to white, and any index buffer is dropped
 * so the merged normals come out per-triangle (low-poly look).
 * @param {THREE.BufferGeometry[]} parts
 * @returns {THREE.BufferGeometry}
 */
function mergeParts(parts) {
  const prepared = parts.map((part) => {
    const flat = part.index ? part.toNonIndexed() : part.clone();
    if (!flat.attributes.color) {
      const count = flat.attributes.position.count;
      flat.setAttribute(
        "color",
        new THREE.BufferAttribute(new Float32Array(count * 3).fill(1), 3),
      );
    }
    return flat;
  });
  const merged = mergeGeometries(prepared, false);
  merged.computeVertexNormals();
  return merged;
}

/**
 * Cheap vertex-colour material — Babylon's StandardMaterial equivalent. The
 * tiny specular of the Babylon original is dropped (Babylon's specularColor
 * values are 0…0.06, i.e. invisible), `emissive` is kept for the clouds.
 */
function vertexColorMaterial({ emissive = 0, doubleSided = false } = {}) {
  return new THREE.MeshLambertMaterial({
    vertexColors: true,
    emissive:
      emissive > 0
        ? new THREE.Color(emissive, emissive, emissive)
        : new THREE.Color(0, 0, 0),
    side: doubleSided ? THREE.DoubleSide : THREE.FrontSide,
    flatShading: false,
  });
}

// ---------------------------------------------------------------------------
// Canvas textures (rf3d/src/scene/textures.ts)
// ---------------------------------------------------------------------------

/**
 * Draws a square canvas texture.
 * @param {number} size texture size in pixels (power of two)
 * @param {boolean} wrap tile the texture instead of clamping to its edge
 * @param {(ctx: CanvasRenderingContext2D, size: number) => void} draw
 * @returns {THREE.CanvasTexture}
 */
function createCanvasTexture(size, wrap, draw) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  draw(ctx, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = wrap ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  texture.wrapT = wrap ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  texture.anisotropy = 8;
  return texture;
}

/**
 * Draws a lot of short grass strokes. With `tile` every stroke is also drawn
 * on the wrapped positions so the texture tiles without a visible seam.
 */
function drawBlades(ctx, size, rng, count, options) {
  const offsets = options.tile ? [-size, 0, size] : [0];
  ctx.lineCap = "round";
  for (let i = 0; i < count; i++) {
    const x = rng() * size;
    const y = rng() * size;
    const len = rand(rng, options.len[0], options.len[1]);
    const angle = -Math.PI / 2 + rand(rng, -0.7, 0.7);
    const dx = Math.cos(angle) * len;
    const dy = Math.sin(angle) * len;
    ctx.strokeStyle = `hsl(${rand(rng, options.hue[0], options.hue[1])}, ${rand(rng, options.sat[0], options.sat[1])}%, ${rand(rng, options.light[0], options.light[1])}%)`;
    ctx.lineWidth = rand(rng, options.width[0], options.width[1]);
    for (const ox of offsets) {
      for (const oy of offsets) {
        const sx = x + ox;
        const sy = y + oy;
        if (sx < -len || sx > size + len || sy < -len || sy > size + len) {
          continue;
        }
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx + dx, sy + dy);
        ctx.stroke();
      }
    }
  }
}

/** Tiling field grass. */
function drawGrass(ctx, size) {
  const rng = mulberry32(1234);
  ctx.fillStyle = "hsl(103, 42%, 31%)";
  ctx.fillRect(0, 0, size, size);

  // Soft patches, repeated on the wrapped positions so they tile too.
  for (let i = 0; i < 28; i++) {
    const x = rng() * size;
    const y = rng() * size;
    const r = rand(rng, size * 0.12, size * 0.3);
    const light = rand(rng, 24, 40);
    const hue = rand(rng, 90, 116);
    for (const ox of [-size, 0, size]) {
      for (const oy of [-size, 0, size]) {
        const g = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
        g.addColorStop(0, `hsla(${hue}, 45%, ${light}%, 0.55)`);
        g.addColorStop(1, `hsla(${hue}, 45%, ${light}%, 0)`);
        ctx.fillStyle = g;
        ctx.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
      }
    }
  }

  drawBlades(ctx, size, rng, 9000, {
    hue: [84, 126],
    sat: [38, 60],
    light: [24, 46],
    len: [5, 14],
    width: [0.8, 1.8],
    tile: true,
  });
  drawBlades(ctx, size, rng, 1400, {
    hue: [70, 100],
    sat: [45, 65],
    light: [46, 58],
    len: [3, 8],
    width: [0.6, 1.2],
    tile: true,
  });
}

/** Circular helipad: mown grass, white rings and the big "H". */
function drawHelipad(ctx, size) {
  const rng = mulberry32(777);
  const ppm = size / (HELIPAD_RADIUS * 2); // pixels per metre
  const c = size / 2;

  ctx.fillStyle = "hsl(98, 48%, 40%)";
  ctx.fillRect(0, 0, size, size);

  // Mower stripes.
  const stripes = 12;
  const stripeWidth = size / stripes;
  for (let i = 0; i < stripes; i++) {
    ctx.fillStyle = i % 2 === 0 ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)";
    ctx.fillRect(i * stripeWidth, 0, stripeWidth + 1, size);
  }

  drawBlades(ctx, size, rng, 16000, {
    hue: [88, 118],
    sat: [42, 62],
    light: [30, 50],
    len: [3, 8],
    width: [0.7, 1.4],
    tile: false,
  });

  // White paint: outer ring and TLOF ring.
  ctx.lineCap = "butt";
  ctx.strokeStyle = "rgba(255,255,255,0.94)";
  ctx.lineWidth = 0.7 * ppm;
  ctx.beginPath();
  ctx.arc(c, c, HELIPAD_RADIUS * ppm - ctx.lineWidth / 2 - 1, 0, Math.PI * 2);
  ctx.stroke();

  ctx.lineWidth = 0.35 * ppm;
  ctx.beginPath();
  ctx.arc(c, c, 7.5 * ppm, 0, Math.PI * 2);
  ctx.stroke();

  // The big "H" — 9 m tall (HELIPAD_MARK_HEIGHT), 6 m wide, 1.5 m bars.
  ctx.fillStyle = "rgba(255,255,255,0.95)";
  const markHeight = HELIPAD_MARK_HEIGHT * ppm;
  const markWidth = 6 * ppm;
  const bar = 1.5 * ppm;
  ctx.fillRect(c - markWidth / 2, c - markHeight / 2, bar, markHeight);
  ctx.fillRect(c + markWidth / 2 - bar, c - markHeight / 2, bar, markHeight);
  ctx.fillRect(c - markWidth / 2 + bar, c - bar / 2, markWidth - 2 * bar, bar);

  // A little wear: grass showing through the paint.
  ctx.globalAlpha = 0.28;
  drawBlades(ctx, size, rng, 2500, {
    hue: [90, 115],
    sat: [40, 55],
    light: [34, 48],
    len: [2, 5],
    width: [0.6, 1.0],
    tile: false,
  });
  ctx.globalAlpha = 1;
}

/** Tiling gravel for the pilot apron and the path to the pad. */
function drawGravel(ctx, size) {
  const rng = mulberry32(4242);
  ctx.fillStyle = "hsl(32, 10%, 60%)";
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 2600; i++) {
    const x = rng() * size;
    const y = rng() * size;
    const r = rand(rng, 1, 4);
    const ry = r * rand(rng, 0.6, 1);
    const rot = rng() * Math.PI;
    ctx.fillStyle = `hsl(${rand(rng, 20, 45)}, ${rand(rng, 6, 20)}%, ${rand(rng, 40, 78)}%)`;
    for (const ox of [-size, 0, size]) {
      for (const oy of [-size, 0, size]) {
        const sx = x + ox;
        const sy = y + oy;
        if (sx < -r * 2 || sx > size + r * 2 || sy < -r * 2 || sy > size + r * 2) {
          continue;
        }
        ctx.beginPath();
        ctx.ellipse(sx, sy, r, ry, rot, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

/**
 * @returns {{grass: THREE.CanvasTexture, helipad: THREE.CanvasTexture, gravel: THREE.CanvasTexture}}
 */
function createAirfieldTextures() {
  return {
    grass: createCanvasTexture(512, true, drawGrass),
    helipad: createCanvasTexture(1024, false, drawHelipad),
    gravel: createCanvasTexture(256, true, drawGravel),
  };
}

// ---------------------------------------------------------------------------
// Sky and distant hills (rf3d/src/scene/sky.ts, terrain.ts)
// ---------------------------------------------------------------------------

/** Sun direction — rf3d createAirfield.ts, normalised. */
export const SUN_DIRECTION = new THREE.Vector3(0.55, 0.72, -0.42).normalize();
/** Sky gradient of rf3d (zenith / horizon / nadir + sun tint). */
const SKY_ZENITH = new THREE.Color(0.27, 0.5, 0.9);
const SKY_HORIZON = new THREE.Color(0.8, 0.88, 0.96);
const SKY_NADIR = new THREE.Color(0.62, 0.72, 0.8);
const SKY_SUN_TINT = new THREE.Color(1.0, 0.92, 0.7);
/** Sky dome radius (m) — the dome is re-centred on the camera every frame. */
const SKY_RADIUS = 20000;

/**
 * Sky dome: the vertex-colour gradient of the Babylon original, painted in a
 * fragment shader instead so the sun glow and the sun disc stay smooth. The
 * glow weights (0.3·d⁶ + 0.55·d⁴⁸) and the sun tint are taken from rf3d's
 * createSky(); the additive sun billboard becomes the disc term below.
 * @returns {THREE.Mesh}
 */
function createSkyDome() {
  const geometry = new THREE.SphereGeometry(SKY_RADIUS, 48, 32);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uSunDir: { value: SUN_DIRECTION.clone() },
      uZenith: { value: SKY_ZENITH.clone() },
      uHorizon: { value: SKY_HORIZON.clone() },
      uNadir: { value: SKY_NADIR.clone() },
      uSunTint: { value: SKY_SUN_TINT.clone() },
    },
    vertexShader: `
      varying vec3 vDirection;

      void main() {
        vDirection = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uSunDir;
      uniform vec3 uZenith;
      uniform vec3 uHorizon;
      uniform vec3 uNadir;
      uniform vec3 uSunTint;

      varying vec3 vDirection;

      void main() {
        vec3 dir = normalize(vDirection);
        vec3 sky = mix(uHorizon, uNadir, clamp(-dir.y * 4.0, 0.0, 1.0));
        if (dir.y >= 0.0) {
          sky = mix(uHorizon, uZenith, pow(clamp(dir.y, 0.0, 1.0), 0.6));
        }
        float d = max(0.0, dot(dir, uSunDir));
        vec3 color = min(vec3(1.0), sky + uSunTint * (0.3 * pow(d, 6.0) + 0.55 * pow(d, 48.0)));
        color = mix(color, vec3(1.0, 0.99, 0.96), smoothstep(0.9975, 0.9985, d));
        gl_FragColor = vec4(color, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    side: THREE.BackSide,
    depthTest: false,
    depthWrite: false,
    fog: false,
  });
  const dome = new THREE.Mesh(geometry, material);
  dome.renderOrder = -1000;
  dome.frustumCulled = false;
  dome.matrixAutoUpdate = true;
  return dome;
}

/**
 * Silhouette hills that fill the horizon (they fade into the fog).
 * @param {() => number} rng
 * @returns {THREE.Mesh}
 */
function createDistantHills(rng) {
  const count = 14;
  const parts = [];
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + rand(rng, -0.15, 0.15);
    const distance = rand(rng, 600, 700);
    const hill = new THREE.SphereGeometry(1, 9, 7);
    hill.scale(
      rand(rng, 150, 300),
      rand(rng, 45, 95),
      rand(rng, 130, 240),
    );
    hill.rotateY(rng() * Math.PI);
    hill.translate(
      Math.cos(angle) * distance,
      -12,
      Math.sin(angle) * distance,
    );
    parts.push(hill);
  }
  const hills = mergeParts(parts);
  paintVertices(hills, (_x, y) =>
    new THREE.Color(0.36, 0.5, 0.42).lerp(
      new THREE.Color(0.5, 0.64, 0.5),
      smoothstep(-5, 70, y),
    ),
  );
  const material = vertexColorMaterial();
  const mesh = new THREE.Mesh(hills, material);
  mesh.matrixAutoUpdate = false;
  return mesh;
}

// ---------------------------------------------------------------------------
// Terrain and helipad (rf3d/src/scene/terrain.ts, helipad.ts)
// ---------------------------------------------------------------------------

/**
 * Rolling terrain with baked vertex colours: a mottled green field that turns
 * into golden crop fields further out. The texture tiles every 11 m.
 * @param {THREE.Texture} grassTexture
 * @returns {THREE.Mesh}
 */
function createTerrain(grassTexture) {
  const geometry = new THREE.PlaneGeometry(
    TERRAIN_SIZE,
    TERRAIN_SIZE,
    220,
    220,
  );
  geometry.rotateX(-Math.PI / 2); // XY plane → XZ ground plane
  const position = geometry.attributes.position;
  const colors = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const z = position.getZ(i);
    position.setY(i, terrainHeight(x, z));

    const r = Math.hypot(x, z);
    const patch = fbm(x * 0.03 + 5, z * 0.03 + 1, 3);
    const fields = fbm(x * 0.0045 - 8, z * 0.0045 + 3, 2);
    const v = 0.92 + 0.16 * patch;
    const wheat = smoothstep(0.12, 0.42, fields) * smoothstep(90, 150, r);
    colors[i * 3] = lerp(v, v * 1.45, wheat);
    colors[i * 3 + 1] = lerp(v, v * 1.22, wheat);
    colors[i * 3 + 2] = lerp(v, v * 0.62, wheat);
  }
  position.needsUpdate = true;
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();

  grassTexture.repeat.set(TERRAIN_SIZE / 11, TERRAIN_SIZE / 11);
  const material = new THREE.MeshLambertMaterial({
    map: grassTexture,
    vertexColors: true,
  });
  const terrain = new THREE.Mesh(geometry, material);
  terrain.receiveShadow = true;
  terrain.matrixAutoUpdate = false;
  return terrain;
}

/**
 * Circular grass helipad with the painted "H". The disc carries the pad
 * texture 1:1 (texture edge = HELIPAD_RADIUS), so the painted mark keeps its
 * real-world 9 m height.
 * @param {THREE.Texture} helipadTexture
 * @returns {THREE.Mesh}
 */
function createHelipad(helipadTexture) {
  const geometry = new THREE.CircleGeometry(HELIPAD_RADIUS, 96);
  geometry.rotateX(-Math.PI / 2);
  const material = new THREE.MeshLambertMaterial({ map: helipadTexture });
  const pad = new THREE.Mesh(geometry, material);
  pad.position.y = HELIPAD_SURFACE_Y; // keep clear of the terrain (z-fighting)
  pad.receiveShadow = true;
  return pad;
}

// ---------------------------------------------------------------------------
// Clouds (rf3d/src/scene/sky.ts, createClouds)
// ---------------------------------------------------------------------------

/** Clouds wrap around the field inside this radius (m). */
const CLOUD_BOUND = 720;

/**
 * Low-poly cumulus clouds: three variants built from overlapping spheres,
 * placed as instances and slowly blown along +X.
 * @param {() => number} rng
 * @param {number} count
 * @returns {{meshes: THREE.InstancedMesh[], update(dt: number): void}}
 */
function createClouds(rng, count) {
  const material = vertexColorMaterial({ emissive: 0.34 });
  const variants = [];

  for (let v = 0; v < 3; v++) {
    const parts = [];
    const blobs = 6 + Math.floor(rng() * 4);
    let x = 0;
    let maxRadius = 0;
    for (let i = 0; i < blobs; i++) {
      const t = blobs > 1 ? i / (blobs - 1) : 0.5;
      const envelope = 0.55 + 0.45 * Math.sin(Math.PI * t);
      const r = rand(rng, 2.2, 3.6) * envelope;
      const blob = new THREE.SphereGeometry(r, 7, 5);
      blob.scale(1, rand(rng, 0.55, 0.75), 1);
      blob.translate(x, rand(rng, -0.2, 0.5) * r, rand(rng, -1.5, 1.5));
      parts.push(blob);
      x += r * rand(rng, 0.8, 1.3);
      maxRadius = Math.max(maxRadius, r);
    }
    const half = x / 2;
    parts.forEach((part) => part.translate(-half, 0, 0));

    const cloud = mergeParts(parts);
    paintVertices(cloud, (_x, y) => {
      const k = lerp(0.74, 1.0, smoothstep(-maxRadius * 0.7, maxRadius * 0.9, y));
      return new THREE.Color(k, k, Math.min(1, k * 1.03));
    });
    variants.push(cloud);
  }

  const groups = variants.map(() => []);
  for (let i = 0; i < count; i++) {
    groups[i % variants.length].push({
      x: rand(rng, -CLOUD_BOUND, CLOUD_BOUND),
      y: rand(rng, 95, 170),
      z: rand(rng, -CLOUD_BOUND, CLOUD_BOUND),
      scale: rand(rng, 1.3, 2.8),
      yaw: rand(rng, -0.5, 0.5),
      speed: rand(rng, 1.5, 3.5),
    });
  }

  const dummy = new THREE.Object3D();
  const clouds = [];
  const writeMatrix = (instanced, item, index) => {
    dummy.position.set(item.x, item.y, item.z);
    dummy.rotation.set(0, item.yaw, 0);
    dummy.scale.setScalar(item.scale);
    dummy.updateMatrix();
    instanced.setMatrixAt(index, dummy.matrix);
  };

  groups.forEach((items, index) => {
    if (items.length === 0) return;
    const instanced = new THREE.InstancedMesh(
      variants[index],
      material,
      items.length,
    );
    instanced.frustumCulled = false;
    items.forEach((item, i) => writeMatrix(instanced, item, i));
    instanced.instanceMatrix.needsUpdate = true;
    clouds.push({ instanced, items });
  });

  return {
    meshes: clouds.map((entry) => entry.instanced),
    /** Drifts the clouds along +X and wraps them around (dt in seconds). */
    update(dt) {
      for (const { instanced, items } of clouds) {
        items.forEach((item, i) => {
          item.x += item.speed * dt;
          if (item.x > CLOUD_BOUND) item.x = -CLOUD_BOUND;
          writeMatrix(instanced, item, i);
        });
        instanced.instanceMatrix.needsUpdate = true;
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Vegetation (rf3d/src/scene/vegetation.ts)
// ---------------------------------------------------------------------------

const TRUNK_COLOR = new THREE.Color(0.4, 0.28, 0.17);
/** Scratch objects — Babylon's RotationYawPitchRoll equals Three's "YXZ". */
const scratchEuler = new THREE.Euler(0, 0, 0, "YXZ");
const scratchQuaternion = new THREE.Quaternion();

/** Pilot area, gravel path and fence lines — no vegetation is placed there. */
function isReservedArea(x, z) {
  if (x > -16 && x < 16 && z < -14 && z > -60) return true; // pilot area + path
  if (Math.abs(z + 46) < 4 && Math.abs(x) < 54) return true; // south fence
  if (Math.abs(Math.abs(x) - 50) < 4 && z > -50 && z < 10) return true; // side fences
  return false;
}

/**
 * Places instances of one geometry with a single draw call.
 * @param {THREE.BufferGeometry} geometry
 * @param {THREE.Material} material
 * @param {{x: number, y: number, z: number, scale?: number, scaleY?: number,
 *          yaw?: number, pitch?: number, roll?: number}[]} items
 * @returns {THREE.InstancedMesh}
 */
function createInstancedMesh(geometry, material, items) {
  const instanced = new THREE.InstancedMesh(geometry, material, items.length);
  const dummy = new THREE.Object3D();
  items.forEach((item, index) => {
    const scale = item.scale ?? 1;
    dummy.position.set(item.x, item.y, item.z);
    dummy.rotation.set(item.pitch ?? 0, item.yaw ?? 0, item.roll ?? 0, "YXZ");
    dummy.scale.set(scale, item.scaleY ?? scale, scale);
    dummy.updateMatrix();
    instanced.setMatrixAt(index, dummy.matrix);
  });
  instanced.instanceMatrix.needsUpdate = true;
  instanced.computeBoundingSphere();
  return instanced;
}

/** Round tree: cylinder trunk with a few icosphere leaf blobs. */
function buildRoundTree(rng, canopy) {
  const trunkHeight = rand(rng, 1.9, 2.7);
  const trunk = new THREE.CylinderGeometry(0.17, 0.275, trunkHeight, 6);
  paintVertices(
    trunk,
    shadeByHeight(TRUNK_COLOR, -trunkHeight / 2, trunkHeight / 2, 0.8, 1.05),
  );
  trunk.translate(0, trunkHeight / 2, 0);

  const parts = [trunk];
  const blobCount = 3 + Math.floor(rng() * 3);
  for (let b = 0; b < blobCount; b++) {
    const radius = rand(rng, 1.1, 1.9);
    const blob = new THREE.IcosahedronGeometry(radius, 1);
    const angle = rng() * Math.PI * 2;
    const offset = b === 0 ? 0 : rand(rng, 0.4, 1.1);
    const pitch = rng() * 0.6;
    const yaw = rng() * Math.PI;
    const roll = rng() * 0.6;
    const y =
      trunkHeight + radius * 0.55 + (b === 0 ? 0.6 : rand(rng, 0, 1.4));
    blob.scale(1, rand(rng, 0.8, 1.0), 1);
    scratchEuler.set(pitch, yaw, roll);
    blob.applyQuaternion(scratchQuaternion.setFromEuler(scratchEuler));
    paintVertices(
      blob,
      shadeByHeight(jitterColor(canopy, rng, 0.1), -radius, radius, 0.78, 1.12),
    );
    blob.translate(Math.cos(angle) * offset, y, Math.sin(angle) * offset);
    parts.push(blob);
  }
  return mergeParts(parts);
}

/** Conifer: trunk with stacked flat-shaded cone tiers. */
function buildConifer(rng, needle) {
  const trunkHeight = rand(rng, 1.2, 1.8);
  const trunk = new THREE.CylinderGeometry(0.15, 0.225, trunkHeight, 6);
  paintVertices(trunk, TRUNK_COLOR);
  trunk.translate(0, trunkHeight / 2, 0);

  const parts = [trunk];
  const tiers = 3 + Math.floor(rng() * 2);
  let y = trunkHeight * 0.75;
  let width = rand(rng, 2.6, 3.4);
  let height = rand(rng, 2.4, 3.0);
  for (let t = 0; t < tiers; t++) {
    const cone = new THREE.ConeGeometry(width / 2, height, 7);
    cone.rotateY(rng() * Math.PI);
    paintVertices(
      cone,
      shadeByHeight(jitterColor(needle, rng, 0.08), -height / 2, height / 2, 0.8, 1.1),
    );
    cone.translate(0, y + height / 2, 0);
    parts.push(cone);
    y += height * 0.45;
    width *= 0.78;
    height *= 0.85;
  }
  return mergeParts(parts);
}

/** Bush: two or three flattened blobs. */
function buildBush(rng, color) {
  const parts = [];
  const blobs = 2 + Math.floor(rng() * 2);
  for (let i = 0; i < blobs; i++) {
    const radius = rand(rng, 0.55, 0.95);
    const x = rand(rng, -0.5, 0.5);
    const z = rand(rng, -0.5, 0.5);
    const yaw = rng() * Math.PI;
    const tint = jitterColor(color, rng, 0.1);
    const blob = new THREE.IcosahedronGeometry(radius, 1);
    blob.scale(1, 0.75, 1);
    blob.rotateY(yaw);
    paintVertices(blob, shadeByHeight(tint, -radius, radius, 0.75, 1.1));
    blob.translate(x, radius * 0.65, z);
    parts.push(blob);
  }
  return mergeParts(parts);
}

/** Flower: stem, a ring of small petals and a centre. */
function buildFlower(rng, petal, center) {
  const stemHeight = 0.36;
  const stem = new THREE.CylinderGeometry(0.015, 0.015, stemHeight, 4);
  paintVertices(stem, new THREE.Color(0.27, 0.55, 0.22));
  stem.translate(0, stemHeight / 2, 0);

  const parts = [stem];
  const petals = 5 + Math.floor(rng() * 2);
  for (let p = 0; p < petals; p++) {
    const angle = (p / petals) * Math.PI * 2;
    const petalGeometry = new THREE.ConeGeometry(0.035, 0.07, 4, 1, true);
    petalGeometry.rotateZ(-Math.PI / 2 + 0.35); // cone axis → +X, tip tilted up
    petalGeometry.rotateY(-angle);
    paintVertices(petalGeometry, petal);
    petalGeometry.translate(
      Math.cos(angle) * 0.06,
      stemHeight + 0.01,
      Math.sin(angle) * 0.06,
    );
    parts.push(petalGeometry);
  }

  const core = new THREE.IcosahedronGeometry(0.0375, 0);
  core.scale(1, 0.6, 1);
  paintVertices(core, center);
  core.translate(0, stemHeight + 0.02, 0);
  parts.push(core);

  return mergeParts(parts);
}

/**
 * Trees: a dense forest belt on the north half of the field plus scattered
 * singles everywhere else.
 * @returns {THREE.InstancedMesh[]}
 */
function createTrees(
  rng,
  { heightAt, clearRadius, maxCount, castShadow, receiveShadow },
) {
  const material = vertexColorMaterial();
  const canopies = [
    new THREE.Color(0.33, 0.58, 0.24),
    new THREE.Color(0.42, 0.64, 0.25),
    new THREE.Color(0.27, 0.5, 0.23),
    new THREE.Color(0.55, 0.62, 0.22),
  ];
  const needles = [
    new THREE.Color(0.17, 0.4, 0.22),
    new THREE.Color(0.22, 0.46, 0.25),
  ];
  const roundTrees = canopies.map((color) => buildRoundTree(rng, color));
  const conifers = needles.map((color) => buildConifer(rng, color));
  const geometries = [...roundTrees, ...conifers];
  const items = geometries.map(() => []);

  const placed = [];
  const canPlace = (x, z, minDistance) => {
    for (const point of placed) {
      const dx = point.x - x;
      const dz = point.z - z;
      if (dx * dx + dz * dz < minDistance * minDistance) return false;
    }
    return true;
  };

  const rMin = clearRadius;
  const rMax = 430;
  for (let i = 0; i < 6000 && placed.length < maxCount; i++) {
    const angle = rng() * Math.PI * 2;
    const r = Math.sqrt(lerp(rMin * rMin, rMax * rMax, rng()));
    const x = Math.cos(angle) * r;
    const z = Math.sin(angle) * r;
    if (isReservedArea(x, z)) continue;

    // Forest belt towards the default view, sparse elsewhere.
    const arcMask =
      smoothstep(0, 0.2 * Math.PI, angle) *
      (1 - smoothstep(0.95 * Math.PI, 1.2 * Math.PI, angle));
    const beltMask = smoothstep(100, 160, r);
    const clump = 0.5 + 0.5 * fbm(x * 0.012 + 20, z * 0.012 - 4, 2);
    const density =
      0.05 +
      0.85 * arcMask * beltMask * smoothstep(0.35, 0.7, clump) +
      0.12 * (1 - beltMask) * smoothstep(0.5, 0.8, clump);
    if (rng() > density) continue;
    if (!canPlace(x, z, 3.2 + rng() * 2)) continue;
    placed.push({ x, z });

    const isConifer = rng() < 0.15 + 0.5 * beltMask * arcMask;
    const pool = isConifer ? conifers : roundTrees;
    const index = Math.floor(rng() * pool.length);
    const meshIndex = isConifer ? roundTrees.length + index : index;
    items[meshIndex].push({
      x,
      y: heightAt(x, z) - 0.15,
      z,
      scale: rand(rng, 0.85, 1.5) * (isConifer ? 1.25 : 1),
      yaw: rng() * Math.PI * 2,
    });
  }

  return instancedMeshes(geometries, material, items, (mesh) => {
    mesh.castShadow = castShadow;
    mesh.receiveShadow = receiveShadow;
  });
}

/**
 * Builds one instanced mesh per geometry from the collected placements; unused
 * geometries are dropped.
 * @returns {THREE.InstancedMesh[]}
 */
function instancedMeshes(geometries, material, items, configure) {
  return geometries
    .map((geometry, index) => {
      if (items[index].length === 0) {
        geometry.dispose();
        return null;
      }
      const mesh = createInstancedMesh(geometry, material, items[index]);
      configure(mesh);
      return mesh;
    })
    .filter(Boolean);
}

/** Bushes: clumped just outside the pad apron. @returns {THREE.InstancedMesh[]} */
function createBushes(rng, { heightAt, padRadius, count, castShadow }) {
  const material = vertexColorMaterial();
  const colors = [
    new THREE.Color(0.32, 0.55, 0.25),
    new THREE.Color(0.4, 0.6, 0.22),
  ];
  const geometries = colors.map((color) => buildBush(rng, color));
  const items = geometries.map(() => []);

  for (let i = 0, placed = 0; i < 3000 && placed < count; i++) {
    const angle = rng() * Math.PI * 2;
    const r = Math.sqrt(lerp(Math.pow(padRadius + 9, 2), 230 * 230, rng()));
    const x = Math.cos(angle) * r;
    const z = Math.sin(angle) * r;
    if (isReservedArea(x, z)) continue;
    const clump = 0.5 + 0.5 * fbm(x * 0.02 - 30, z * 0.02 + 12, 2);
    if (rng() > 0.12 + 0.6 * smoothstep(0.55, 0.8, clump)) continue;
    items[Math.floor(rng() * geometries.length)].push({
      x,
      y: heightAt(x, z) - 0.1,
      z,
      scale: rand(rng, 0.7, 1.4),
      yaw: rng() * Math.PI * 2,
    });
    placed++;
  }

  return instancedMeshes(geometries, material, items, (mesh) => {
    mesh.castShadow = castShadow;
  });
}

/**
 * Flowers: patches of one dominant colour plus scattered singles.
 * @returns {THREE.InstancedMesh[]}
 */
function createFlowers(rng, { heightAt, padRadius, count }) {
  const palette = [
    [new THREE.Color(0.93, 0.22, 0.2), new THREE.Color(0.98, 0.85, 0.2)],
    [new THREE.Color(0.98, 0.82, 0.18), new THREE.Color(0.55, 0.32, 0.1)],
    [new THREE.Color(0.97, 0.97, 0.95), new THREE.Color(0.98, 0.8, 0.2)],
    [new THREE.Color(0.62, 0.36, 0.86), new THREE.Color(0.98, 0.85, 0.3)],
    [new THREE.Color(0.98, 0.55, 0.72), new THREE.Color(0.98, 0.9, 0.4)],
    [new THREE.Color(0.98, 0.55, 0.16), new THREE.Color(0.5, 0.25, 0.08)],
  ];
  const geometries = palette.map(([petal, center]) =>
    buildFlower(rng, petal, center),
  );
  const material = vertexColorMaterial();
  const items = geometries.map(() => []);

  const blocked = (x, z) =>
    Math.hypot(x, z) < padRadius + 1.2 ||
    (x > -3.5 && x < 3.5 && z < -14 && z > -36) ||
    Math.hypot(x, z + 31) < 5;

  const patches = [];
  for (let i = 0; i < 16; i++) {
    const angle = rng() * Math.PI * 2;
    const distance = rand(rng, padRadius + 8, 62);
    patches.push({
      x: Math.cos(angle) * distance,
      z: Math.sin(angle) * distance,
      r: rand(rng, 3.5, 8),
      main: Math.floor(rng() * geometries.length),
    });
  }

  const perPatch = Math.floor((count * 0.8) / patches.length);
  for (const patch of patches) {
    for (let i = 0; i < perPatch; i++) {
      const angle = rng() * Math.PI * 2;
      const distance = Math.sqrt(rng()) * patch.r;
      const x = patch.x + Math.cos(angle) * distance;
      const z = patch.z + Math.sin(angle) * distance;
      if (blocked(x, z)) continue;
      const variant =
        rng() < 0.7 ? patch.main : Math.floor(rng() * geometries.length);
      items[variant].push({
        x,
        y: heightAt(x, z),
        z,
        scale: rand(rng, 0.8, 1.35),
        yaw: rng() * Math.PI * 2,
      });
    }
  }

  const scattered = count - perPatch * patches.length;
  for (let i = 0; i < scattered; i++) {
    const angle = rng() * Math.PI * 2;
    const distance = Math.sqrt(lerp(Math.pow(padRadius + 2, 2), 75 * 75, rng()));
    const x = Math.cos(angle) * distance;
    const z = Math.sin(angle) * distance;
    if (blocked(x, z)) continue;
    items[Math.floor(rng() * geometries.length)].push({
      x,
      y: heightAt(x, z),
      z,
      scale: rand(rng, 0.8, 1.3),
      yaw: rng() * Math.PI * 2,
    });
  }

  return instancedMeshes(geometries, material, items, () => {});
}

// ---------------------------------------------------------------------------
// Props: windsock, fences, pilot area, hay bales (rf3d/src/scene/props.ts)
// ---------------------------------------------------------------------------

const WOOD = new THREE.Color(0.52, 0.38, 0.24);
const WOOD_DARK = new THREE.Color(0.42, 0.3, 0.18);

/**
 * Windsock: base, pole, ring and a five-band sock that swings in the wind.
 * @returns {{root: THREE.Group, update(t: number): void}}
 */
function createWindsock() {
  const material = vertexColorMaterial({ doubleSided: true });
  const root = new THREE.Group();

  const base = new THREE.CylinderGeometry(0.35, 0.35, 0.3, 12);
  paintVertices(base, new THREE.Color(0.62, 0.62, 0.6));
  base.translate(0, 0.15, 0);

  const poleHeight = 6;
  const pole = new THREE.CylinderGeometry(0.06, 0.06, poleHeight, 8);
  paintVertices(pole, new THREE.Color(0.86, 0.87, 0.9));
  pole.translate(0, poleHeight / 2, 0);

  // Pivot at the top of the pole; its Euler order matches Babylon's yaw →
  // pitch → roll rotations.
  const pivot = new THREE.Group();
  pivot.position.y = poleHeight;
  pivot.rotation.order = "YXZ";

  // Three's torus already has its hole along +Z (Babylon rotated it by 90°).
  const ring = new THREE.TorusGeometry(0.36, 0.0175, 8, 16);
  paintVertices(ring, new THREE.Color(0.3, 0.3, 0.32));

  // Tapered sock made of five alternating orange/white bands so the colour
  // borders stay crisp.
  const sockHeight = 2.6;
  const bands = 5;
  const segmentHeight = sockHeight / bands;
  const segments = [];
  for (let i = 0; i < bands; i++) {
    const from = i / bands;
    const to = (i + 1) / bands;
    const segment = new THREE.CylinderGeometry(
      lerp(0.7, 0.26, to) / 2,
      lerp(0.7, 0.26, from) / 2,
      segmentHeight,
      14,
      1,
      true,
    );
    paintVertices(
      segment,
      i % 2 === 0
        ? new THREE.Color(1.0, 0.42, 0.05)
        : new THREE.Color(0.97, 0.97, 0.95),
    );
    segment.translate(0, -sockHeight / 2 + (i + 0.5) * segmentHeight, 0);
    segments.push(segment);
  }
  const sock = mergeParts(segments);
  sock.rotateX(Math.PI / 2); // local +Y (sock axis) → +Z
  sock.translate(0, 0, sockHeight / 2); // wide opening sits on the pivot

  const baseMesh = new THREE.Mesh(base, material);
  const poleMesh = new THREE.Mesh(pole, material);
  const ringMesh = new THREE.Mesh(ring, material);
  const sockMesh = new THREE.Mesh(sock, material);
  poleMesh.castShadow = true;
  sockMesh.castShadow = true;
  pivot.add(ringMesh, sockMesh);
  root.add(baseMesh, poleMesh, pivot);

  // The wind blows along +X — the same direction the clouds drift.
  const baseYaw = Math.PI / 2;
  return {
    root,
    /** t: elapsed seconds */
    update(t) {
      pivot.rotation.y =
        baseYaw + 0.2 * Math.sin(t * 0.8) + 0.07 * Math.sin(t * 2.9 + 1.3);
      pivot.rotation.x =
        0.38 + 0.13 * Math.sin(t * 1.4 + 0.7) + 0.04 * Math.sin(t * 4.1);
    },
  };
}

/**
 * Wooden fence built from 3 m segments placed along the given lines.
 * @param {[number, number, number, number][]} lines
 * @param {(x: number, z: number) => number} heightAt
 * @returns {THREE.InstancedMesh}
 */
function createFences(lines, heightAt, castShadow) {
  const segmentLength = 3;
  const makePost = (x) => {
    const post = new THREE.BoxGeometry(0.12, 1.15, 0.12);
    paintVertices(post, WOOD_DARK);
    post.translate(x, 0.575, 0);
    return post;
  };
  const makeRail = (y) => {
    const rail = new THREE.BoxGeometry(segmentLength, 0.08, 0.05);
    paintVertices(rail, WOOD);
    rail.translate(segmentLength / 2, y, 0);
    return rail;
  };
  const geometry = mergeParts([
    makePost(0),
    makePost(segmentLength - 0.002),
    makeRail(0.55),
    makeRail(0.98),
  ]);

  const items = [];
  for (const [x1, z1, x2, z2] of lines) {
    const dx = x2 - x1;
    const dz = z2 - z1;
    const length = Math.hypot(dx, dz);
    if (length < 0.01) continue;
    const ux = dx / length;
    const uz = dz / length;
    const count = Math.max(1, Math.round(length / segmentLength));
    const yaw = Math.atan2(-uz, ux); // yaw that maps local +X onto (ux, uz)
    for (let i = 0; i < count; i++) {
      const x = x1 + ux * segmentLength * i;
      const z = z1 + uz * segmentLength * i;
      items.push({ x, y: heightAt(x, z), z, yaw });
    }
  }

  const mesh = createInstancedMesh(geometry, vertexColorMaterial(), items);
  mesh.castShadow = castShadow;
  return mesh;
}

/**
 * Pilot area: gravel apron with the path to the pad, a table, a bench and a
 * parasol.
 * @returns {THREE.Object3D[]}
 */
function createPilotArea(gravelTexture, padRadius, castShadow) {
  const created = [];

  const apronTexture = gravelTexture.clone();
  apronTexture.repeat.set(4, 4);
  const apron = new THREE.Mesh(
    new THREE.CircleGeometry(4, 48).rotateX(-Math.PI / 2),
    new THREE.MeshLambertMaterial({ map: apronTexture }),
  );
  apron.position.set(0, 0.03, -31);
  apron.receiveShadow = true;
  created.push(apron);

  const pathLength = 31 - 4 - (padRadius + 0.5);
  const pathTexture = gravelTexture.clone();
  pathTexture.repeat.set(1.1, pathLength / 2);
  const path = new THREE.Mesh(
    new THREE.PlaneGeometry(2.2, pathLength).rotateX(-Math.PI / 2),
    new THREE.MeshLambertMaterial({ map: pathTexture }),
  );
  path.position.set(0, 0.03, -(padRadius + 0.5) - pathLength / 2);
  path.receiveShadow = true;
  created.push(path);

  const woodMaterial = vertexColorMaterial();

  const tableParts = [];
  const tableTop = new THREE.BoxGeometry(1.8, 0.06, 0.8);
  paintVertices(tableTop, WOOD);
  tableTop.translate(0, 0.82, 0);
  tableParts.push(tableTop);
  for (const sx of [-0.8, 0.8]) {
    for (const sz of [-0.32, 0.32]) {
      const leg = new THREE.BoxGeometry(0.07, 0.8, 0.07);
      paintVertices(leg, WOOD_DARK);
      leg.translate(sx, 0.4, sz);
      tableParts.push(leg);
    }
  }
  const table = new THREE.Mesh(mergeParts(tableParts), woodMaterial);
  table.position.set(-1.7, 0, -31.6);

  const benchParts = [];
  const seat = new THREE.BoxGeometry(1.8, 0.06, 0.42);
  paintVertices(seat, WOOD);
  seat.translate(0, 0.46, 0);
  benchParts.push(seat);
  for (const sx of [-0.75, 0.75]) {
    const leg = new THREE.BoxGeometry(0.08, 0.44, 0.4);
    paintVertices(leg, WOOD_DARK);
    leg.translate(sx, 0.22, 0);
    benchParts.push(leg);
  }
  const bench = new THREE.Mesh(mergeParts(benchParts), woodMaterial);
  bench.position.set(1.6, 0, -31.2);

  for (const mesh of [table, bench]) {
    mesh.castShadow = castShadow;
    created.push(mesh);
  }

  const pole = new THREE.CylinderGeometry(0.025, 0.025, 2.5, 8);
  paintVertices(pole, new THREE.Color(0.8, 0.8, 0.82));
  pole.translate(0, 1.25, 0);
  const canopy = new THREE.CylinderGeometry(0.02, 1.3, 0.55, 8, 1, true);
  paintFaces(canopy, (cx, _cy, cz) => {
    const sector =
      Math.floor(((Math.atan2(cz, cx) + Math.PI) / (Math.PI * 2)) * 8 + 0.5) % 8;
    return sector % 2 === 0
      ? new THREE.Color(0.9, 0.2, 0.18)
      : new THREE.Color(0.97, 0.96, 0.92);
  });
  const umbrella = new THREE.Mesh(
    mergeParts([pole, canopy]),
    vertexColorMaterial({ doubleSided: true }),
  );
  umbrella.position.set(-1.7, 0, -32.4);
  umbrella.castShadow = castShadow;
  created.push(umbrella);

  return created;
}

/**
 * Hay bales rolled out on the western fields.
 * @returns {THREE.InstancedMesh}
 */
function createHayBales(rng, heightAt, castShadow) {
  const bale = new THREE.CylinderGeometry(0.75, 0.75, 1.5, 14).toNonIndexed();
  bale.computeVertexNormals(); // flat shading, like Babylon's convertToFlatShadedMesh
  paintFaces(bale, (_x, y) =>
    Math.abs(y) > 0.74
      ? new THREE.Color(0.72, 0.56, 0.26)
      : new THREE.Color(0.88, 0.74, 0.38),
  );

  const items = [];
  for (let i = 0; i < 26; i++) {
    const x = -175 + rand(rng, -75, 75);
    const z = -70 + rand(rng, -60, 60);
    if (Math.hypot(x, z) < 72) continue;
    items.push({
      x,
      y: heightAt(x, z) + 0.72,
      z,
      yaw: rand(rng, 0, Math.PI * 2),
      roll: Math.PI / 2,
    });
  }

  const mesh = createInstancedMesh(bale, vertexColorMaterial(), items);
  mesh.castShadow = castShadow;
  mesh.receiveShadow = true;
  return mesh;
}

// ---------------------------------------------------------------------------
// FreshMorningEnvironment — the object Blackbox3DPanel talks to
// ---------------------------------------------------------------------------

/** Fence lines of the airfield (rf3d createAirfield.ts). */
const FENCE_LINES = [
  // Southern edge, with the centre left open as the entrance.
  [-50, -46, -4, -46],
  [4, -46, 50, -46],
  // East and west edges.
  [-50, -46, -50, 6],
  [50, -46, 50, 6],
  // Safety fence either side of the path to the pad.
  [-9, -19.5, -2, -19.5],
  [2, -19.5, 9, -19.5],
];

/** Rough low-end detection, same rule as rf3d createAirfield.ts. */
function isLowEndDevice() {
  const navigation = globalThis.navigator ?? {};
  const cores = navigation.hardwareConcurrency ?? 8;
  const memory = navigation.deviceMemory ?? 8;
  return cores <= 4 || memory <= 3;
}

export class FreshMorningEnvironment {
  /**
   * Builds the whole airfield.
   * @param {THREE.Scene} scene
   * @param {THREE.Object3D} worldGroup group that is rotated to line the
   *   airfield up with the flight direction — only the field goes in there
   * @param {THREE.Camera} camera used to keep the sky centred
   */
  constructor(scene, worldGroup, camera) {
    this.scene = scene;
    this.worldGroup = worldGroup;
    this.camera = camera;
    this.rng = mulberry32(20240601); // rf3d's seed → identical layout
    this.lowEnd = isLowEndDevice();
    this.elapsed = 0;
    this.resources = new Set();
    this.previousBackground = scene.background;
    this.previousFog = scene.fog;
    this.textures = null;
    this.clouds = null;
    this.windsock = null;
    this.sunLight = null;
    this.sky = null;

    // Atmosphere: the horizon colour is clear colour and fog at once.
    const horizon = new THREE.Color(0.8, 0.88, 0.96);
    scene.background = horizon;
    scene.fog = new THREE.FogExp2(horizon.clone(), 0.0022);

    // Sky, clouds and lights stay world aligned (they must not follow the
    // airfield alignment rotation); the field itself goes into the world group.
    this.skyRoot = new THREE.Group();
    this.lightRoot = new THREE.Group();
    this.cloudRoot = new THREE.Group();
    this.environmentRoot = new THREE.Group();
    scene.add(this.skyRoot, this.lightRoot, this.cloudRoot);
    worldGroup.add(this.environmentRoot);

    this._buildSky();
    this._buildLights();
    this._buildClouds();
    this._buildTerrain();
    this._buildVegetation();
    this._buildProps();
  }

  /**
   * Registers a geometry, material or texture for disposal.
   * @template T
   * @param {T} resource
   * @returns {T}
   */
  _track(resource) {
    if (resource) this.resources.add(resource);
    return resource;
  }

  /** Registers the geometries, materials and textures of an object tree. */
  _trackObject(object) {
    object.traverse((child) => {
      if (child.geometry) this._track(child.geometry);
      const material = child.material;
      if (!material) return;
      for (const value of Array.isArray(material) ? material : [material]) {
        this._track(value);
        for (const property of Object.values(value)) {
          if (property?.isTexture) this._track(property);
        }
      }
    });
    return object;
  }

  _buildSky() {
    this.sky = this._trackObject(createSkyDome());
    this.sky.position.copy(this.camera.position);
    this.skyRoot.add(this.sky);
  }

  _buildLights() {
    // Global brightness boost (user request: 전체 조명 30% 밝게).
    const LIGHT_GAIN = 1.3;
    // Main light: rf3d's directional "sun" including its shadow settings.
    const sun = new THREE.DirectionalLight(
      new THREE.Color(1.0, 0.96, 0.88),
      1.35 * LIGHT_GAIN,
    );
    sun.position.copy(SUN_DIRECTION).multiplyScalar(320);
    sun.castShadow = true;
    const size = this.lowEnd ? 1024 : 2048;
    sun.shadow.mapSize.set(size, size);
    sun.shadow.camera.left = -140;
    sun.shadow.camera.right = 140;
    sun.shadow.camera.top = 140;
    sun.shadow.camera.bottom = -140;
    sun.shadow.camera.near = 20;
    sun.shadow.camera.far = 700;
    sun.shadow.camera.updateProjectionMatrix();
    sun.shadow.bias = 0.0012;
    sun.shadow.normalBias = 0.03;
    this.sunLight = sun;
    this.lightRoot.add(sun, sun.target);

    // Sky/ground fill (Babylon's HemisphericLight) — it keeps the shadows
    // readable without a second shadow map.
    this.lightRoot.add(
      new THREE.HemisphereLight(
        new THREE.Color(0.62, 0.74, 0.92),
        new THREE.Color(0.36, 0.42, 0.26),
        0.6 * LIGHT_GAIN,
      ),
    );
  }

  _buildClouds() {
    this.clouds = createClouds(this.rng, this.lowEnd ? 12 : 18);
    for (const mesh of this.clouds.meshes) {
      this.cloudRoot.add(this._trackObject(mesh));
    }
  }

  _buildTerrain() {
    this.textures = createAirfieldTextures();
    for (const texture of Object.values(this.textures)) this._track(texture);
    this.environmentRoot.add(
      this._trackObject(createTerrain(this.textures.grass)),
      this._trackObject(createHelipad(this.textures.helipad)),
      this._trackObject(createDistantHills(this.rng)),
    );
  }

  _buildVegetation() {
    const heightAt = terrainHeight;
    const trees = createTrees(this.rng, {
      heightAt,
      clearRadius: 58,
      maxCount: this.lowEnd ? 220 : 400,
      castShadow: true,
      receiveShadow: !this.lowEnd,
    });
    const bushes = createBushes(this.rng, {
      heightAt,
      padRadius: HELIPAD_RADIUS,
      count: this.lowEnd ? 40 : 80,
      castShadow: true,
    });
    const flowers = createFlowers(this.rng, {
      heightAt,
      padRadius: HELIPAD_RADIUS,
      count: this.lowEnd ? 1200 : 2200,
    });
    for (const mesh of [...trees, ...bushes, ...flowers]) {
      this.environmentRoot.add(this._trackObject(mesh));
    }
  }

  _buildProps() {
    // Windsock beside the pad — the wind blows along +X, like the clouds.
    this.windsock = createWindsock();
    this.windsock.root.position.set(HELIPAD_RADIUS + 9, 0, -8);
    this.environmentRoot.add(this._trackObject(this.windsock.root));

    this.environmentRoot.add(
      this._trackObject(createFences(FENCE_LINES, terrainHeight, true)),
    );

    const pilotArea = createPilotArea(this.textures.gravel, HELIPAD_RADIUS, true);
    for (const mesh of pilotArea) {
      this.environmentRoot.add(this._trackObject(mesh));
    }

    this.environmentRoot.add(
      this._trackObject(createHayBales(this.rng, terrainHeight, true)),
    );
  }

  /**
   * Animates the environment. Called once per frame by the panel.
   * @param {number} delta seconds since the previous frame
   * @param {number} elapsed seconds since the panel was created
   */
  update(delta, elapsed) {
    if (!this.scene || !this.camera) return;
    const step = clamp(Number.isFinite(delta) ? delta : 0, 0, 0.1);
    this.elapsed = Number.isFinite(elapsed) ? elapsed : this.elapsed + step;
    this.sky.position.copy(this.camera.position);
    this.clouds.update(step);
    this.windsock.update(this.elapsed);
  }

  /** Removes every object this environment added and frees its resources. */
  dispose() {
    if (!this.scene) return;
    this.skyRoot.removeFromParent();
    this.lightRoot.removeFromParent();
    this.cloudRoot.removeFromParent();
    this.environmentRoot.removeFromParent();
    this.scene.background = this.previousBackground;
    this.scene.fog = this.previousFog;
    const shadow = this.sunLight?.shadow;
    if (shadow) {
      shadow.map?.dispose();
      shadow.map = null;
      shadow.dispose?.();
    }
    for (const resource of this.resources) resource.dispose();
    this.resources.clear();
    this.sky = null;
    this.clouds = null;
    this.windsock = null;
    this.sunLight = null;
    this.textures = null;
    this.scene = null;
    this.worldGroup = null;
    this.camera = null;
  }
}
















