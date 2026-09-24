import * as THREE from "three";

const FIELD_SIZE = 30000;
const FIELD_SEGMENTS = 96;
const SKY_RADIUS = 20000;
const WATER_X = 92;
const WATER_Z = 58;
const WATER_RADIUS = 18;
const GRASS_COUNT = 9000;
const FLOWER_COUNT_PER_SPECIES = 650;
const TREE_COUNT = 78;
const CLOUD_COUNT = 18;
const BUTTERFLY_COUNT = 16;
const POLLEN_COUNT = 140;
const WIND_SPEED = 4.8;
const WIND_DIRECTION = 15;

function smoothStep(value, min, max) {
  const t = THREE.MathUtils.clamp((value - min) / (max - min), 0, 1);
  return t * t * (3 - 2 * t);
}

function createSeededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function disposeResource(resource) {
  if (!resource) return;
  if (resource.isTexture) resource.dispose();
  else if (resource.isMaterial) resource.dispose();
  else if (resource.isBufferGeometry) resource.dispose();
  else if (resource.isWebGLRenderTarget) resource.dispose();
}

function createColorTexture(width, height, draw, random) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  draw(context, width, height, random);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

function createGrassGeometry() {
  const positions = [];
  const normals = [];
  const angles = [0, Math.PI / 3, (Math.PI * 2) / 3];
  const addTriangle = (a, b, c) => {
    positions.push(...a, ...b, ...c);
    for (let i = 0; i < 3; i++) normals.push(0, 1, 0);
  };
  for (const angle of angles) {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const wBottom = 0.11;
    const wMid = 0.08;
    const hMid = 0.32;
    const hTop = 0.72;
    const lean = 0.08;
    const p0 = [-wBottom * c, 0, -wBottom * s];
    const p1 = [wBottom * c, 0, wBottom * s];
    const p2 = [-wMid * c + lean * s, hMid, -wMid * s - lean * c];
    const p3 = [wMid * c + lean * s, hMid, wMid * s - lean * c];
    const p4 = [lean * 2.3 * s, hTop, -lean * 2.3 * c];
    addTriangle(p0, p1, p2);
    addTriangle(p1, p3, p2);
    addTriangle(p2, p3, p4);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.computeBoundingSphere();
  return geometry;
}

function createFlowerGeometry() {
  const positions = [];
  const normals = [];
  const addTriangle = (a, b, c) => {
    positions.push(...a, ...b, ...c);
    for (let i = 0; i < 3; i++) normals.push(0, 1, 0);
  };
  const stemHeight = 0.58;
  addTriangle([-0.018, 0, 0], [0.018, 0, 0], [-0.018, stemHeight, 0]);
  addTriangle([0.018, 0, 0], [0.018, stemHeight, 0], [-0.018, stemHeight, 0]);
  for (let i = 0; i < 6; i++) {
    const a0 = (i / 6) * Math.PI * 2;
    const a1 = ((i + 0.72) / 6) * Math.PI * 2;
    const am = (a0 + a1) * 0.5;
    const inner = [0, stemHeight + 0.03, 0];
    const left = [Math.cos(a0) * 0.2, stemHeight + 0.07, Math.sin(a0) * 0.2];
    const right = [Math.cos(a1) * 0.2, stemHeight + 0.07, Math.sin(a1) * 0.2];
    const tip = [Math.cos(am) * 0.25, stemHeight + 0.1, Math.sin(am) * 0.25];
    addTriangle(inner, left, tip);
    addTriangle(inner, tip, right);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.computeBoundingSphere();
  return geometry;
}

export class FreshMorningEnvironment {
  constructor(scene, worldGroup, camera) {
    this.scene = scene;
    this.worldGroup = worldGroup;
    this.camera = camera;
    this.random = createSeededRandom(0x4d3a17b2);
    this.resources = new Set();
    this.windUniforms = { uTime: { value: 0 } };
    this.clouds = [];
    this.butterflies = [];
    this.water = null;
    this.windsockPivot = null;
    this.pollen = null;
    this.butterflyTarget = new THREE.Vector3();
    this.previousBackground = scene.background;
    this.previousFog = scene.fog;
    this.sceneBackground = new THREE.Color("#87ceeb");
    this.fog = new THREE.FogExp2("#b9dcff", 0.00008);
    scene.background = this.sceneBackground;
    scene.fog = this.fog;

    this.skyRoot = new THREE.Group();
    this.cloudRoot = new THREE.Group();
    this.lightRoot = new THREE.Group();
    this.environmentRoot = new THREE.Group();
    this.cloudRoot.position.set(camera.position.x, 0, camera.position.z);
    scene.add(this.skyRoot, this.cloudRoot, this.lightRoot);
    worldGroup.add(this.environmentRoot);

    this.terrainColors = {
      infield: new THREE.Color("#4d8c40"),
      meadow: new THREE.Color("#3f7d36"),
      golden: new THREE.Color("#699c44"),
      hill: new THREE.Color("#2f632b"),
      mountain: new THREE.Color("#274e2b"),
      sand: new THREE.Color("#9c8e6e"),
    };
    this.sunDirection = this.computeSunDirection(26, 108);
    this._buildSkyAndLights();
    this._buildTerrain();
    this._buildAirfield();
    this._buildGrass();
    this._buildFlowers();
    this._buildTrees();
    this._buildClouds();
    this._buildAmbientLife();
  }

  _track(resource) {
    if (resource) this.resources.add(resource);
    return resource;
  }

  _material(options) {
    const material = this._track(new THREE.MeshLambertMaterial(options));
    for (const value of Object.values(material)) {
      if (value?.isTexture) this._track(value);
    }
    return material;
  }

  _standardMaterial(options) {
    const material = this._track(new THREE.MeshStandardMaterial(options));
    for (const value of Object.values(material)) {
      if (value?.isTexture) this._track(value);
    }
    return material;
  }

  _windMaterial(options, height) {
    const material = this._material(options);
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = this.windUniforms.uTime;
      shader.vertexShader = `uniform float uTime;\n${shader.vertexShader}`;
      shader.vertexShader = shader.vertexShader.replace(
        "#include <begin_vertex>",
        `
                #include <begin_vertex>
                #ifdef USE_INSTANCING
                    vec3 instanceOrigin = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
                #else
                    vec3 instanceOrigin = vec3(0.0);
                #endif
                float heightFactor = clamp(position.y / ${height.toFixed(2)}, 0.0, 1.0);
                float gust = sin(dot(instanceOrigin.xz, vec2(0.14, 0.11)) - uTime * 2.0);
                float flutter = cos(instanceOrigin.x * 0.7 + instanceOrigin.z * 0.5 + uTime * 3.1);
                float bend = heightFactor * heightFactor * (0.018 + 0.012 * gust + 0.006 * flutter);
                transformed.x += bend;
                transformed.z += bend * 0.55;
            `,
      );
    };
    material.customProgramCacheKey = () =>
      `fresh-morning-wind-${height.toFixed(2)}`;
    return material;
  }

  computeSunDirection(elevation, azimuth) {
    const elevationRad = THREE.MathUtils.degToRad(elevation);
    const azimuthRad = THREE.MathUtils.degToRad(azimuth);
    return new THREE.Vector3(
      Math.cos(elevationRad) * Math.cos(azimuthRad),
      Math.sin(elevationRad),
      Math.cos(elevationRad) * Math.sin(azimuthRad),
    ).normalize();
  }

  _buildSkyAndLights() {
    const zenith = new THREE.Color("#2563eb");
    const zenithEnd = new THREE.Color("#1d4ed8");
    const horizon = new THREE.Color("#bae6fd");
    const horizonEnd = new THREE.Color("#dff2fe");
    const fogColor = new THREE.Color("#bae6fd");
    const fogEnd = new THREE.Color("#d8f0ff");
    const dayBlend = THREE.MathUtils.clamp((26 - 24) / 45, 0, 1);
    zenith.lerp(zenithEnd, dayBlend);
    horizon.lerp(horizonEnd, dayBlend);
    fogColor.lerp(fogEnd, dayBlend);
    this.fog.color.copy(fogColor);

    const skyUniforms = {
      uSunDirection: { value: this.sunDirection.clone() },
      uZenithColor: { value: zenith },
      uHorizonColor: { value: horizon },
      uGroundColor: { value: new THREE.Color("#658554") },
      uSunColor: { value: new THREE.Color("#fff8e7") },
    };
    const skyGeometry = this._track(
      new THREE.SphereGeometry(SKY_RADIUS, 40, 24),
    );
    const skyMaterial = this._track(
      new THREE.ShaderMaterial({
        uniforms: skyUniforms,
        side: THREE.BackSide,
        depthWrite: false,
        depthTest: false,
        vertexShader: `
                    varying vec3 vDirection;
                    void main() {
                        vDirection = normalize((modelMatrix * vec4(position, 0.0)).xyz);
                        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                    }
                `,
        fragmentShader: `
                    uniform vec3 uSunDirection;
                    uniform vec3 uZenithColor;
                    uniform vec3 uHorizonColor;
                    uniform vec3 uGroundColor;
                    uniform vec3 uSunColor;
                    varying vec3 vDirection;
                    void main() {
                        vec3 dir = normalize(vDirection);
                        float y = dir.y;
                        float horizonFactor = pow(clamp(1.0 - max(y, 0.0), 0.0, 1.0), 2.2);
                        vec3 skyColor = mix(uZenithColor, uHorizonColor, horizonFactor);
                        if (y < 0.0) {
                            skyColor = mix(uHorizonColor, uGroundColor, clamp(-y * 4.0, 0.0, 1.0));
                        }
                        vec3 sunDir = normalize(uSunDirection);
                        float sunDot = max(dot(dir, sunDir), 0.0);
                        float halo = pow(sunDot, 12.0) * 0.38 + pow(sunDot, 96.0) * 0.55;
                        float disc = smoothstep(0.9992, 0.9998, sunDot);
                        skyColor += uSunColor * halo;
                        skyColor = mix(skyColor, uSunColor * 1.35, disc);
                        gl_FragColor = vec4(skyColor, 1.0);
                        #include <tonemapping_fragment>
                        #include <colorspace_fragment>
                    }
                `,
      }),
    );
    this.sky = new THREE.Mesh(skyGeometry, skyMaterial);
    this.sky.position.copy(this.camera.position);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -1000;
    this.skyRoot.add(this.sky);

    this.ambientLight = new THREE.AmbientLight("#ffffff", 0.45);
    this.hemiLight = new THREE.HemisphereLight("#bfe3ff", "#4d6b3c", 0.85);
    this.hemiLight.position.set(0, 120, 0);
    this.sunLight = new THREE.DirectionalLight("#fff8e7", 2.2);
    this.sunLight.position.copy(this.sunDirection).multiplyScalar(1200);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(1024, 1024);
    this.sunLight.shadow.camera.near = 1;
    this.sunLight.shadow.camera.far = 3000;
    this.sunLight.shadow.camera.left = -700;
    this.sunLight.shadow.camera.right = 700;
    this.sunLight.shadow.camera.top = 700;
    this.sunLight.shadow.camera.bottom = -700;
    this.sunLight.shadow.bias = -0.0004;
    this.sunLight.target.position.set(0, 0, 0);
    this.lightRoot.add(
      this.ambientLight,
      this.hemiLight,
      this.sunLight,
      this.sunLight.target,
    );
  }

  terrainHeight(x, z) {
    const distance = Math.hypot(x, z);
    const edgeX = Math.max(0, Math.abs(x) - 1800);
    const edgeZ = Math.max(0, Math.abs(z) - 1800);
    const plateauDistance = Math.hypot(edgeX, edgeZ);
    const plateauBlend = smoothStep(plateauDistance, 0, 1400);
    const wave =
      Math.sin(x * 0.021 + 0.4) * Math.cos(z * 0.021 - 0.2) * 1.1 +
      Math.sin((x + z) * 0.014) * 0.65 +
      0.45;
    const hill = Math.min(7, Math.max(0, distance - 2600) * 0.0026);
    const pondX = (x - WATER_X) / 25;
    const pondZ = (z - WATER_Z) / 16;
    const pondDistance = pondX * pondX + pondZ * pondZ;
    const pond = pondDistance < 1.8 ? -0.9 * Math.exp(-pondDistance * 1.4) : 0;
    return plateauBlend * (Math.max(0, wave) + hill) + pond;
  }

  isExcluded(x, z) {
    if (Math.abs(x) < 22 && Math.abs(z) < 126) return true;
    if ((Math.abs(x - 28) < 8 || Math.abs(x + 28) < 8) && z > 4 && z < 78)
      return true;
    if (Math.abs(x) < 42 && z > 92 && z < 116) return true;
    if (Math.hypot(x - WATER_X, z - WATER_Z) < WATER_RADIUS + 5) return true;
    return false;
  }

  _buildTerrain() {
    const geometry = this._track(
      new THREE.PlaneGeometry(
        FIELD_SIZE,
        FIELD_SIZE,
        FIELD_SEGMENTS,
        FIELD_SEGMENTS,
      ),
    );
    geometry.rotateX(-Math.PI / 2);
    const positions = geometry.attributes.position;
    const colors = [];
    const color = new THREE.Color();
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i);
      const z = positions.getZ(i);
      const y = this.terrainHeight(x, z);
      positions.setY(i, y);
      const noise =
        Math.sin(x * 0.07) * Math.cos(z * 0.07) * 0.5 +
        Math.sin((x - z) * 0.04) * 0.5;
      if (y < -0.06) {
        color
          .copy(this.terrainColors.meadow)
          .lerp(
            this.terrainColors.sand,
            THREE.MathUtils.clamp(-y / 0.85, 0, 1),
          );
      } else if (y < 0.25 && Math.abs(x) < 150 && Math.abs(z) < 150) {
        const stripe = Math.sin(x * 0.65) > 0 ? 0.04 : -0.02;
        color.copy(this.terrainColors.infield).offsetHSL(0, 0, stripe);
      } else if (y < 6.5) {
        color
          .copy(this.terrainColors.meadow)
          .lerp(
            this.terrainColors.golden,
            THREE.MathUtils.clamp(noise * 0.45 + 0.35, 0, 1),
          );
      } else {
        const t = THREE.MathUtils.clamp((y - 6.5) / 18, 0, 1);
        color
          .copy(this.terrainColors.hill)
          .lerp(this.terrainColors.mountain, t);
      }
      colors.push(color.r, color.g, color.b);
    }
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    const material = this._material({ vertexColors: true });
    const terrain = new THREE.Mesh(geometry, material);
    terrain.receiveShadow = true;
    this.environmentRoot.add(terrain);

    const waterGeometry = this._track(
      new THREE.CircleGeometry(WATER_RADIUS, 40),
    );
    waterGeometry.rotateX(-Math.PI / 2);
    waterGeometry.scale(1.2, 1, 0.72);
    const waterMaterial = this._standardMaterial({
      color: "#38bdf8",
      roughness: 0.12,
      metalness: 0.55,
      transparent: true,
      opacity: 0.82,
    });
    this.water = new THREE.Mesh(waterGeometry, waterMaterial);
    this.water.position.set(WATER_X, 0.02, WATER_Z);
    this.water.receiveShadow = true;
    this.environmentRoot.add(this.water);

    const rockGeometry = this._track(new THREE.DodecahedronGeometry(0.8, 1));
    const rockMaterial = this._standardMaterial({
      color: "#78716c",
      roughness: 0.85,
    });
    const rocks = new THREE.InstancedMesh(rockGeometry, rockMaterial, 24);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < 24; i++) {
      const angle = (i / 24) * Math.PI * 2 + (this.random() - 0.5) * 0.2;
      const radius = WATER_RADIUS + 1 + this.random() * 3;
      const x = WATER_X + Math.cos(angle) * radius;
      const z = WATER_Z + Math.sin(angle) * radius * 0.72;
      dummy.position.set(x, this.terrainHeight(x, z) + 0.18, z);
      dummy.rotation.set(
        this.random() * 0.3,
        this.random() * Math.PI,
        this.random() * 0.2,
      );
      dummy.scale.set(
        0.55 + this.random() * 1.2,
        0.35 + this.random() * 0.5,
        0.6 + this.random(),
      );
      dummy.updateMatrix();
      rocks.setMatrixAt(i, dummy.matrix);
    }
    rocks.instanceMatrix.needsUpdate = true;
    rocks.computeBoundingSphere();
    rocks.castShadow = true;
    rocks.receiveShadow = true;
    this.environmentRoot.add(rocks);
  }

  _canvasTexture(width, height, draw) {
    const texture = createColorTexture(width, height, draw, this.random);
    this._track(texture);
    return texture;
  }

  _buildAirfield() {
    const runwayTexture = this._canvasTexture(
      1024,
      256,
      (ctx, w, h, random) => {
        ctx.fillStyle = "#2d3138";
        ctx.fillRect(0, 0, w, h);
        const gradient = ctx.createLinearGradient(0, 0, 0, h);
        gradient.addColorStop(0, "rgba(15, 18, 22, 0.35)");
        gradient.addColorStop(0.5, "rgba(65, 70, 78, 0.12)");
        gradient.addColorStop(1, "rgba(15, 18, 22, 0.35)");
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, w, h);
        for (let i = 0; i < 5000; i++) {
          const value = 30 + Math.floor(random() * 36);
          ctx.fillStyle = `rgba(${value}, ${value + 2}, ${value + 5}, ${0.12 + random() * 0.2})`;
          ctx.fillRect(random() * w, random() * h, 2, 2);
        }
        ctx.fillStyle = "#e8edf2";
        ctx.fillRect(28, 25, w - 56, 7);
        ctx.fillRect(28, h - 32, w - 56, 7);
        for (let i = 0; i < 6; i++) {
          const y = 48 + i * 27;
          ctx.fillRect(42, y, 60, 12);
          ctx.fillRect(w - 102, y, 60, 12);
        }
        ctx.font = "800 52px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.save();
        ctx.translate(180, h / 2);
        ctx.rotate(Math.PI / 2);
        ctx.fillText("09", 0, 0);
        ctx.restore();
        ctx.save();
        ctx.translate(w - 180, h / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText("27", 0, 0);
        ctx.restore();
        for (let x = 310; x < w - 310; x += 105)
          ctx.fillRect(x, h / 2 - 4, 58, 8);
        ctx.strokeStyle = "rgba(250, 204, 21, 0.75)";
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(w / 2, h / 2, 43, 0, Math.PI * 2);
        ctx.stroke();
      },
    );
    runwayTexture.wrapS = THREE.ClampToEdgeWrapping;
    runwayTexture.wrapT = THREE.ClampToEdgeWrapping;
    runwayTexture.center.set(0.5, 0.5);
    runwayTexture.rotation = Math.PI / 2;
    runwayTexture.needsUpdate = true;
    const runwayMaterial = this._standardMaterial({
      map: runwayTexture,
      roughness: 0.78,
      metalness: 0.06,
    });
    const shoulderMaterial = this._standardMaterial({
      color: "#57534e",
      roughness: 0.92,
    });
    const lineMaterial = this._material({ color: "#f8fafc" });
    const yellowMaterial = this._material({ color: "#facc15" });
    const darkMaterial = this._standardMaterial({
      color: "#334155",
      roughness: 0.8,
    });
    const steelMaterial = this._standardMaterial({
      color: "#94a3b8",
      roughness: 0.38,
      metalness: 0.55,
    });
    const roofMaterial = this._standardMaterial({
      color: "#1e3a2f",
      roughness: 0.55,
      metalness: 0.25,
    });
    const woodMaterial = this._standardMaterial({
      color: "#92400e",
      roughness: 0.8,
    });

    const addBox = (
      size,
      position,
      material,
      receiveShadow = true,
      castShadow = false,
    ) => {
      const geometry = this._track(
        new THREE.BoxGeometry(size[0], size[1], size[2]),
      );
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(position[0], position[1], position[2]);
      mesh.receiveShadow = receiveShadow;
      mesh.castShadow = castShadow;
      this.environmentRoot.add(mesh);
      return mesh;
    };

    addBox([24, 0.08, 232], [0, 0.04, 0], shoulderMaterial);
    addBox([18, 0.1, 220], [0, 0.1, 0], runwayMaterial);
    for (let z = -98; z <= 98; z += 14)
      addBox([0.55, 0.035, 7], [0, 0.17, z], lineMaterial);
    addBox([0.35, 0.035, 216], [-8.3, 0.17, 0], lineMaterial);
    addBox([0.35, 0.035, 216], [8.3, 0.17, 0], lineMaterial);
    for (let z = -104; z <= 104; z += 16) {
      addBox([1.1, 0.035, 7], [-7.2, 0.17, z], lineMaterial);
      addBox([1.1, 0.035, 7], [7.2, 0.17, z], lineMaterial);
    }

    for (const x of [-28, 28]) {
      addBox([8, 0.08, 74], [x, 0.08, 40], shoulderMaterial);
      addBox([6, 0.1, 70], [x, 0.13, 40], runwayMaterial);
      addBox([0.3, 0.035, 68], [x - 2.8, 0.2, 40], yellowMaterial);
      addBox([0.3, 0.035, 68], [x + 2.8, 0.2, 40], yellowMaterial);
    }
    addBox([64, 0.1, 12], [0, 0.08, 104], shoulderMaterial);
    addBox([62, 0.12, 10], [0, 0.14, 104], darkMaterial);
    for (const x of [-14, -7, 0, 7, 14]) {
      addBox([2.6, 0.1, 2.2], [x, 0.24, 88], darkMaterial);
      addBox([2.5, 0.04, 0.15], [x, 0.31, 86.95], yellowMaterial);
      addBox([2.5, 0.04, 0.15], [x, 0.31, 89.05], yellowMaterial);
    }

    const shelter = new THREE.Group();
    shelter.position.set(0, 0.08, 104);
    this.environmentRoot.add(shelter);
    const postGeometry = this._track(
      new THREE.CylinderGeometry(0.12, 0.12, 3.8, 10),
    );
    for (const x of [-12, -4, 4, 12]) {
      for (const z of [-3, 3]) {
        const post = new THREE.Mesh(postGeometry, steelMaterial);
        post.position.set(x, 1.9, z);
        post.castShadow = true;
        shelter.add(post);
      }
    }
    const roofGeometry = this._track(new THREE.BoxGeometry(26.5, 0.12, 3.65));
    const frontRoof = new THREE.Mesh(roofGeometry, roofMaterial);
    frontRoof.position.set(0, 4.05, -1.68);
    frontRoof.rotation.x = 0.16;
    frontRoof.castShadow = true;
    shelter.add(frontRoof);
    const backRoof = new THREE.Mesh(roofGeometry, roofMaterial);
    backRoof.position.set(0, 4.05, 1.68);
    backRoof.rotation.x = -0.16;
    backRoof.castShadow = true;
    shelter.add(backRoof);
    for (const x of [-8, 0, 8])
      addBox([4.8, 0.06, 0.16], [x, 0.08, 88.9], lineMaterial);

    const signTexture = this._canvasTexture(512, 256, (ctx, w, h) => {
      ctx.fillStyle = "#0f291e";
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = "#34d399";
      ctx.lineWidth = 8;
      ctx.strokeRect(12, 12, w - 24, h - 24);
      ctx.fillStyle = "#fef3c7";
      ctx.fillRect(96, 82, 320, 18);
      ctx.fillRect(144, 126, 224, 18);
      ctx.fillStyle = "#34d399";
      ctx.fillRect(216, 168, 80, 12);
    });
    const signMaterial = this._standardMaterial({
      map: signTexture,
      roughness: 0.55,
    });
    const signGroup = new THREE.Group();
    signGroup.position.set(-18, 0, 107);
    signGroup.rotation.y = -0.18;
    const signPostGeometry = this._track(
      new THREE.CylinderGeometry(0.09, 0.09, 2.6, 8),
    );
    for (const x of [-1.4, 1.4]) {
      const post = new THREE.Mesh(signPostGeometry, woodMaterial);
      post.position.set(x, 1.3, 0);
      post.castShadow = true;
      signGroup.add(post);
    }
    const signBoardGeometry = this._track(new THREE.BoxGeometry(3.6, 1.8, 0.1));
    const signBoard = new THREE.Mesh(signBoardGeometry, [
      woodMaterial,
      woodMaterial,
      woodMaterial,
      woodMaterial,
      signMaterial,
      signMaterial,
    ]);
    signBoard.position.y = 1.8;
    signBoard.castShadow = true;
    signGroup.add(signBoard);
    this.environmentRoot.add(signGroup);

    const windsock = new THREE.Group();
    windsock.position.set(-23, 0, -30);
    const windsockBase = new THREE.Mesh(
      this._track(new THREE.CylinderGeometry(2.1, 2.2, 0.08, 20)),
      shoulderMaterial,
    );
    windsockBase.position.y = 0.04;
    windsockBase.receiveShadow = true;
    windsock.add(windsockBase);
    const poleGeometry = this._track(
      new THREE.CylinderGeometry(0.1, 0.13, 6.4, 10),
    );
    const pole = new THREE.Mesh(poleGeometry, steelMaterial);
    pole.position.y = 3.2;
    pole.castShadow = true;
    windsock.add(pole);
    this.windsockPivot = new THREE.Group();
    this.windsockPivot.position.set(0, 6.3, 0);
    windsock.add(this.windsockPivot);
    for (let i = 0; i < 6; i++) {
      const segmentGeometry = this._track(
        new THREE.CylinderGeometry(
          0.36 - i * 0.045,
          0.4 - i * 0.045,
          0.48,
          10,
          1,
          true,
        ),
      );
      segmentGeometry.rotateZ(-Math.PI / 2);
      segmentGeometry.translate(0.24, 0, 0);
      const segmentMaterial = this._material({
        color: i % 2 === 0 ? "#ff4500" : "#f8fafc",
        side: THREE.DoubleSide,
      });
      const segment = new THREE.Mesh(segmentGeometry, segmentMaterial);
      segment.position.x = i * 0.48;
      segment.rotation.z = -0.08;
      segment.castShadow = true;
      this.windsockPivot.add(segment);
    }
    this.environmentRoot.add(windsock);

    const coneGeometry = this._track(new THREE.ConeGeometry(0.22, 0.6, 10));
    const coneMaterial = this._standardMaterial({
      color: "#f97316",
      roughness: 0.45,
    });
    const cones = new THREE.InstancedMesh(coneGeometry, coneMaterial, 8);
    const conePositions = [
      [-10, -112],
      [10, -112],
      [-10, 112],
      [10, 112],
      [-31, 8],
      [-25, 8],
      [25, 8],
      [31, 8],
    ];
    const dummy = new THREE.Object3D();
    conePositions.forEach(([x, z], index) => {
      dummy.position.set(x, 0.35, z);
      dummy.updateMatrix();
      cones.setMatrixAt(index, dummy.matrix);
    });
    cones.instanceMatrix.needsUpdate = true;
    cones.computeBoundingSphere();
    cones.castShadow = true;
    this.environmentRoot.add(cones);
  }

  _placeFieldInstances(count, isValid) {
    const placed = [];
    let attempts = 0;
    while (placed.length < count && attempts < count * 5) {
      attempts++;
      const x = (this.random() - 0.5) * 1300;
      const z = (this.random() - 0.5) * 1300;
      if (!isValid(x, z)) continue;
      placed.push({ x, z, y: this.terrainHeight(x, z), value: this.random() });
    }
    return placed;
  }

  _buildGrass() {
    const geometry = this._track(createGrassGeometry());
    const material = this._windMaterial(
      { color: "#ffffff", side: THREE.DoubleSide },
      0.72,
    );
    const grass = new THREE.InstancedMesh(geometry, material, GRASS_COUNT);
    const positions = this._placeFieldInstances(GRASS_COUNT, (x, z) => {
      const y = this.terrainHeight(x, z);
      return !this.isExcluded(x, z) && y > -0.05 && y < 8;
    });
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    const palette = ["#4d943e", "#5ca346", "#3e7e34", "#6db349", "#78ad44"];
    positions.forEach((entry, index) => {
      dummy.position.set(entry.x, entry.y, entry.z);
      dummy.rotation.set(0, entry.value * Math.PI * 2, 0);
      const scale = 0.72 + entry.value * 0.65;
      dummy.scale.set(scale, 0.65 + entry.value * 0.8, scale);
      dummy.updateMatrix();
      grass.setMatrixAt(index, dummy.matrix);
      color
        .set(palette[index % palette.length])
        .offsetHSL((entry.value - 0.5) * 0.04, 0, (entry.value - 0.5) * 0.07);
      grass.setColorAt(index, color);
    });
    grass.count = positions.length;
    grass.instanceMatrix.needsUpdate = true;
    if (grass.instanceColor) grass.instanceColor.needsUpdate = true;
    grass.computeBoundingSphere();
    grass.receiveShadow = true;
    this.environmentRoot.add(grass);
  }

  _buildFlowers() {
    const geometry = this._track(createFlowerGeometry());
    const palettes = [
      ["#f472b6", "#ec4899", "#fbcfe8", "#db2777"],
      ["#fbbf24", "#f59e0b", "#fde047", "#eab308"],
      ["#fffbeb", "#fef9c3", "#f8fafc", "#fef08a"],
      ["#60a5fa", "#a78bfa", "#38bdf8", "#c084fc"],
      ["#fb7185", "#f43f5e", "#fdba74", "#ef4444"],
    ];
    const patches = [
      [-78, 74],
      [-48, 96],
      [66, 82],
      [88, 38],
      [42, 126],
      [-112, 38],
      [118, 104],
      [-18, 132],
    ];
    palettes.forEach((palette) => {
      const material = this._windMaterial(
        { color: "#ffffff", side: THREE.DoubleSide },
        0.62,
      );
      const flowers = new THREE.InstancedMesh(
        geometry,
        material,
        FLOWER_COUNT_PER_SPECIES,
      );
      const dummy = new THREE.Object3D();
      const color = new THREE.Color();
      let placed = 0;
      let attempts = 0;
      while (
        placed < FLOWER_COUNT_PER_SPECIES &&
        attempts < FLOWER_COUNT_PER_SPECIES * 8
      ) {
        attempts++;
        let x;
        let z;
        if (this.random() < 0.82) {
          const patch = patches[(this.random() * patches.length) | 0];
          const angle = this.random() * Math.PI * 2;
          const radius = Math.sqrt(this.random()) * (10 + this.random() * 16);
          x = patch[0] + Math.cos(angle) * radius;
          z = patch[1] + Math.sin(angle) * radius;
        } else {
          x = (this.random() - 0.5) * 1250;
          z = (this.random() - 0.5) * 1250;
        }
        const y = this.terrainHeight(x, z);
        if (this.isExcluded(x, z) || y < -0.05 || y > 12) continue;
        dummy.position.set(x, y, z);
        dummy.rotation.set(
          (this.random() - 0.5) * 0.22,
          this.random() * Math.PI * 2,
          (this.random() - 0.5) * 0.22,
        );
        const scale = 0.65 + this.random() * 0.9;
        dummy.scale.set(scale, scale * (0.82 + this.random() * 0.38), scale);
        dummy.updateMatrix();
        flowers.setMatrixAt(placed, dummy.matrix);
        color
          .set(palette[(this.random() * palette.length) | 0])
          .offsetHSL(
            (this.random() - 0.5) * 0.03,
            0,
            (this.random() - 0.5) * 0.06,
          );
        flowers.setColorAt(placed, color);
        placed++;
      }
      flowers.count = placed;
      flowers.instanceMatrix.needsUpdate = true;
      if (flowers.instanceColor) flowers.instanceColor.needsUpdate = true;
      flowers.computeBoundingSphere();
      flowers.receiveShadow = true;
      this.environmentRoot.add(flowers);
    });
  }

  _buildTrees() {
    const treeData = [];
    const curated = [
      [-74, 62, "oak"],
      [-58, 84, "cherry"],
      [-34, 78, "birch"],
      [44, 72, "cherry"],
      [66, 74, "birch"],
      [82, 28, "oak"],
      [42, 118, "pine"],
      [-32, 124, "pine"],
      [-88, -62, "pine"],
      [-58, -74, "oak"],
      [-30, -82, "birch"],
      [4, -92, "pine"],
      [36, -78, "oak"],
      [68, -64, "cherry"],
      [94, -46, "pine"],
    ];
    const addTree = (x, z, type, scale) => {
      if (treeData.length >= TREE_COUNT || this.isExcluded(x, z)) return;
      treeData.push({ x, z, type, scale });
    };
    curated.forEach(([x, z, type]) =>
      addTree(x, z, type, 0.9 + this.random() * 0.5),
    );
    let attempts = 0;
    while (treeData.length < TREE_COUNT && attempts < TREE_COUNT * 8) {
      attempts++;
      const angle = this.random() * Math.PI * 2;
      const radius = 90 + this.random() * 440;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const type = ["oak", "pine", "oak", "birch", "cherry"][
        treeData.length % 5
      ];
      addTree(x, z, type, 0.75 + this.random() * 0.9);
    }

    const trunkGeometry = this._track(
      new THREE.CylinderGeometry(0.3, 0.46, 3.2, 8),
    );
    const crownGeometry = this._track(new THREE.DodecahedronGeometry(1, 1));
    const pineGeometry = this._track(new THREE.ConeGeometry(1, 2.2, 9));
    const trunkMaterial = this._standardMaterial({
      color: "#5c4033",
      roughness: 0.9,
    });
    const crownMaterial = this._windMaterial({ color: "#ffffff" }, 2.1);
    const pineMaterial = this._windMaterial({ color: "#1b4332" }, 2.2);
    const trunkData = [];
    const crownData = [];
    const pineData = [];
    const crownPalette = [
      "#2d6a32",
      "#3b7a38",
      "#498c3e",
      "#265828",
      "#fbcfe8",
      "#65a30d",
    ];
    treeData.forEach((tree, index) => {
      const y = this.terrainHeight(tree.x, tree.z);
      trunkData.push({
        x: tree.x,
        y,
        z: tree.z,
        scale: tree.scale,
        phase: index * 0.7,
      });
      if (tree.type === "pine") {
        for (let tier = 0; tier < 3; tier++) {
          pineData.push({
            x: tree.x,
            y: y + (2.5 + tier * 1.15) * tree.scale,
            z: tree.z,
            scale: tree.scale * (1 - tier * 0.16),
            phase: index * 0.7,
          });
        }
      } else {
        const offsets = [
          [0, 4.1, 0, 2.0],
          [-1.2, 3.55, 0.7, 1.55],
          [1.15, 3.7, -0.7, 1.6],
          [0.2, 4.7, 0.1, 1.4],
        ];
        offsets.forEach(([dx, dy, dz, size], offset) => {
          crownData.push({
            x: tree.x + dx * tree.scale,
            y: y + dy * tree.scale,
            z: tree.z + dz * tree.scale,
            scale: size * tree.scale,
            phase: index * 0.7 + offset,
            color:
              tree.type === "cherry"
                ? "#f9a8d4"
                : tree.type === "birch"
                  ? "#84cc16"
                  : crownPalette[index % 4],
          });
        });
      }
    });

    const trunks = new THREE.InstancedMesh(
      trunkGeometry,
      trunkMaterial,
      trunkData.length,
    );
    const crowns = new THREE.InstancedMesh(
      crownGeometry,
      crownMaterial,
      crownData.length,
    );
    const pines = new THREE.InstancedMesh(
      pineGeometry,
      pineMaterial,
      pineData.length,
    );
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    trunkData.forEach((entry, index) => {
      dummy.position.set(entry.x, entry.y + 1.6 * entry.scale, entry.z);
      dummy.rotation.set(0, entry.phase, 0);
      dummy.scale.set(entry.scale, entry.scale, entry.scale);
      dummy.updateMatrix();
      trunks.setMatrixAt(index, dummy.matrix);
    });
    crownData.forEach((entry, index) => {
      dummy.position.set(entry.x, entry.y, entry.z);
      dummy.rotation.set(entry.phase * 0.7, entry.phase * 1.1, 0);
      dummy.scale.set(entry.scale, entry.scale * 0.82, entry.scale);
      dummy.updateMatrix();
      crowns.setMatrixAt(index, dummy.matrix);
      color.set(entry.color).offsetHSL(0, 0, (entry.phase % 1) * 0.08 - 0.04);
      crowns.setColorAt(index, color);
    });
    pineData.forEach((entry, index) => {
      dummy.position.set(entry.x, entry.y, entry.z);
      dummy.rotation.set(0, entry.phase, 0);
      dummy.scale.set(entry.scale, entry.scale, entry.scale);
      dummy.updateMatrix();
      pines.setMatrixAt(index, dummy.matrix);
    });
    for (const mesh of [trunks, crowns, pines]) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.environmentRoot.add(mesh);
    }
  }

  _buildClouds() {
    const geometry = this._track(new THREE.DodecahedronGeometry(1, 1));
    const material = this._material({
      color: "#ffffff",
      emissive: "#475569",
      emissiveIntensity: 0.18,
      transparent: true,
      opacity: 0.93,
    });
    for (let i = 0; i < CLOUD_COUNT; i++) {
      const group = new THREE.Group();
      const puffCount = 3 + Math.floor(this.random() * 3);
      for (let p = 0; p < puffCount; p++) {
        const puff = new THREE.Mesh(geometry, material);
        puff.position.set(
          (p - (puffCount - 1) * 0.5) * (4 + this.random() * 2),
          Math.cos((p / puffCount - 0.5) * Math.PI) * 2.2 +
            (this.random() - 0.5) * 1.2,
          (this.random() - 0.5) * 7,
        );
        puff.scale.set(
          4.5 + this.random() * 4,
          2.8 + this.random() * 2.5,
          4 + this.random() * 3,
        );
        puff.rotation.y = this.random() * Math.PI;
        group.add(puff);
      }
      group.position.set(
        (this.random() - 0.5) * 1000,
        72 + this.random() * 70,
        (this.random() - 0.5) * 1000,
      );
      const baseScale = 0.72 + this.random() * 0.7;
      group.scale.setScalar(baseScale);
      this.cloudRoot.add(group);
      this.clouds.push({
        group,
        baseY: group.position.y,
        baseScale,
        speed: 0.65 + this.random() * 0.7,
        phase: this.random() * Math.PI * 2,
      });
    }
  }

  _buildAmbientLife() {
    const wingGeometry = this._track(new THREE.PlaneGeometry(0.14, 0.18));
    wingGeometry.translate(0.07, 0, 0);
    const butterflyMaterials = [
      "#fbbf24",
      "#38bdf8",
      "#f472b6",
      "#a78bfa",
      "#fb7185",
    ].map((color) => this._material({ color, side: THREE.DoubleSide }));
    for (let i = 0; i < BUTTERFLY_COUNT; i++) {
      const group = new THREE.Group();
      const left = new THREE.Mesh(
        wingGeometry,
        butterflyMaterials[i % butterflyMaterials.length],
      );
      const right = new THREE.Mesh(
        wingGeometry,
        butterflyMaterials[i % butterflyMaterials.length],
      );
      right.scale.x = -1;
      group.add(left, right);
      const angle = (i / BUTTERFLY_COUNT) * Math.PI * 2;
      const radius = 22 + this.random() * 72;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const center = new THREE.Vector3(x, this.terrainHeight(x, z) + 1.1, z);
      group.position.copy(center);
      this.environmentRoot.add(group);
      this.butterflies.push({
        group,
        left,
        right,
        center,
        radius: 1.8 + this.random() * 3.2,
        speed: 0.7 + this.random() * 0.9,
        phase: this.random() * Math.PI * 2,
        flapSpeed: 12 + this.random() * 6,
      });
    }

    const pollenGeometry = this._track(new THREE.BufferGeometry());
    const positions = new Float32Array(POLLEN_COUNT * 3);
    for (let i = 0; i < POLLEN_COUNT; i++) {
      positions[i * 3] = (this.random() - 0.5) * 190;
      positions[i * 3 + 1] = 0.8 + this.random() * 14;
      positions[i * 3 + 2] = (this.random() - 0.5) * 190;
    }
    pollenGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(positions, 3),
    );
    const pollenMaterial = this._track(
      new THREE.PointsMaterial({
        color: "#fef9c3",
        size: 0.16,
        transparent: true,
        opacity: 0.65,
      }),
    );
    this.pollen = new THREE.Points(pollenGeometry, pollenMaterial);
    this.environmentRoot.add(this.pollen);
  }

  update(delta, elapsed) {
    if (!this.scene || !this.camera) return;
    const step = THREE.MathUtils.clamp(delta, 0, 0.1);
    this.windUniforms.uTime.value = elapsed;
    this.sky.position.copy(this.camera.position);
    this.cloudRoot.position.x = this.camera.position.x;
    this.cloudRoot.position.z = this.camera.position.z;
    const windRad = THREE.MathUtils.degToRad(WIND_DIRECTION);
    const windCos = Math.cos(windRad);
    const windSin = Math.sin(windRad);
    for (const cloud of this.clouds) {
      cloud.group.position.x +=
        windCos * step * (0.7 + WIND_SPEED * 0.55) * cloud.speed;
      cloud.group.position.z +=
        windSin * step * (0.7 + WIND_SPEED * 0.55) * cloud.speed;
      if (cloud.group.position.x > 500) cloud.group.position.x = -500;
      if (cloud.group.position.x < -500) cloud.group.position.x = 500;
      if (cloud.group.position.z > 500) cloud.group.position.z = -500;
      if (cloud.group.position.z < -500) cloud.group.position.z = 500;
      cloud.group.position.y =
        cloud.baseY + Math.sin(elapsed * 0.28 + cloud.phase) * 1.2;
      cloud.group.scale.setScalar(cloud.baseScale);
    }
    if (this.water)
      this.water.position.y = 0.02 + Math.sin(elapsed * 1.8) * 0.015;
    if (this.windsockPivot) {
      this.windsockPivot.rotation.y = -windRad + Math.sin(elapsed * 2.4) * 0.05;
    }
    for (const butterfly of this.butterflies) {
      const t = elapsed * butterfly.speed + butterfly.phase;
      const x = butterfly.center.x + Math.cos(t) * butterfly.radius;
      const z = butterfly.center.z + Math.sin(t * 2) * butterfly.radius * 0.65;
      const y = butterfly.center.y + Math.sin(t * 3.1) * 0.35;
      butterfly.group.position.set(x, y, z);
      this.butterflyTarget.set(
        x + Math.cos(t + Math.PI / 2),
        y,
        z + Math.sin(t + Math.PI / 2),
      );
      this.environmentRoot.localToWorld(this.butterflyTarget);
      butterfly.group.lookAt(this.butterflyTarget);
      const flap =
        Math.sin(elapsed * butterfly.flapSpeed + butterfly.phase) * 0.85;
      butterfly.left.rotation.y = flap;
      butterfly.right.rotation.y = -flap;
    }
    if (this.pollen) {
      const attribute = this.pollen.geometry.attributes.position;
      const pollenSpeed = step * (0.3 + WIND_SPEED * 0.28);
      for (let i = 0; i < attribute.count; i++) {
        let x = attribute.getX(i) + windCos * pollenSpeed;
        let y = attribute.getY(i) + Math.sin(elapsed * 1.2 + i) * 0.006;
        let z = attribute.getZ(i) + windSin * pollenSpeed;
        if (x > 95) x = -95;
        if (x < -95) x = 95;
        if (z > 95) z = -95;
        if (z < -95) z = 95;
        attribute.setXYZ(i, x, y, z);
      }
      attribute.needsUpdate = true;
    }
  }

  dispose() {
    if (!this.scene) return;
    this.environmentRoot.traverse((object) => {
      if (object.isInstancedMesh) object.dispose();
    });
    this.skyRoot.parent?.remove(this.skyRoot);
    this.cloudRoot.parent?.remove(this.cloudRoot);
    this.lightRoot.parent?.remove(this.lightRoot);
    this.environmentRoot.parent?.remove(this.environmentRoot);
    this.scene.background = this.previousBackground;
    this.scene.fog = this.previousFog;
    for (const resource of this.resources) disposeResource(resource);
    this.resources.clear();
    this.clouds.length = 0;
    this.butterflies.length = 0;
    this.sky = null;
    this.water = null;
    this.pollen = null;
    this.butterflyTarget = null;
    this.windsockPivot = null;
    this.scene = null;
    this.worldGroup = null;
    this.camera = null;
  }
}
