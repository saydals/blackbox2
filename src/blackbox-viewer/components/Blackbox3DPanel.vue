<template>
    <div ref="rootRef" class="blackbox-3d-replay">
        <div id="toolbar" class="b3d-toolbar">
            <button id="b3dReplayBtn" class="b3d-btn" :disabled="!hasLog" @click="onReplay">
                {{ replayLabel }}
            </button>
            <div class="b3d-viewmenu">
                <button class="b3d-btn" @click="viewMenuOpen = !viewMenuOpen" :title="'관찰자 시점: ' + viewModeLabel">
                    👁 {{ viewModeLabel }} ▾
                </button>
                <div v-if="viewMenuOpen" class="b3d-viewmenu-list">
                    <button
                        class="b3d-btn b3d-viewmenu-item"
                        :class="{ 'b3d-btn--active': viewMode === 'fixed' }"
                        @click="onSelectView('fixed')"
                        title="관찰자는 지상에 고정, 기체를 바라봄 (기본)"
                    >
                        📍 Fixed View (고정시점)
                    </button>
                    <button
                        class="b3d-btn b3d-viewmenu-item"
                        :class="{ 'b3d-btn--active': viewMode === 'dynamic' }"
                        @click="onSelectView('dynamic')"
                        title="기체를 따라다니며 멀어지면 확대/축소"
                    >
                        🎥 Dynamic View (추적)
                    </button>
                </div>
            </div>
            <button class="b3d-btn" @click="onFullScreen">Full Screen</button>
            <button class="b3d-btn" @click="onYaw">Heading 90</button>
            <button
                class="b3d-btn"
                :class="{ 'b3d-btn--active': estWithoutGps }"
                :disabled="hasGpsFlag"
                :title="hasGpsFlag ? 'Log has GPS — estimated replay not needed' : 'Replay without GPS: estimate the flight path from collective + attitude'"
                @click="onWithoutGps"
            >
                No GPS
            </button>
            <button class="b3d-btn b3d-btn--close" title="Close 3D view" @click="emit('close')">X</button>
            <span id="b3dStatus" class="b3d-status">{{ status }}</span>
        </div>

        <div id="seekWrap" class="b3d-seek">
            <button class="b3d-btn" :disabled="!hasLog" @click="onTogglePlay">{{ playing ? "⏸" : "▶" }}</button>
            <input
                id="b3dSeek"
                ref="seekRef"
                class="b3d-seek-input"
                type="range"
                min="0"
                max="1000"
                value="0"
                :disabled="!hasLog"
                @input="onSeek"
            />
            <span id="b3dTime" class="b3d-time">{{ timeLabel }}</span>
        </div>

        <div id="b3dHud" class="b3d-hud">
            <div>Altitude: <span id="b3dAltRel">0.0</span> m</div>
            <div>Craft Speed: <span id="b3dSpeed">0.0</span> m/s</div>
            <div>Dist to home: <span id="b3dHome">0</span> m</div>
            <div>Position: <span id="b3dPos">0, 0</span></div>
            <div>Mode: <span id="b3dMode" class="b3d-mode">Manual</span></div>
            <div class="b3d-file">Log: <span id="b3dFile">—</span></div>
        </div>

        <Blackbox3DSettingsDialog
            v-model:open="settingsOpen"
            :settings="estSettings"
            :has-baro="hasBaro"
            @apply="onSettingsApply"
        />

        <div v-if="!hasLog" class="b3d-empty">
            <p>Open a blackbox log (.bbl) in the viewer to replay the flight in 3D.</p>
        </div>
    </div>
</template>

<script setup>
import { computed, ref, onMounted, onBeforeUnmount, nextTick, watch } from "vue";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { useLogStore } from "../stores/log.js";
import { useAppStore } from "../stores/app.js";
import { buildReplayDataFromFlightLog } from "../blackbox3d_adapter.js";
import { get as configStorageGet, set as configStorageSet } from "../../js/ConfigStorage.js";
import Blackbox3DSettingsDialog from "./Blackbox3DSettingsDialog.vue";
// @ts-expect-error Vite ?url asset import for the bundled heli model
import heliModelUrl from "../models/heli.glb?url";

const emit = defineEmits(["close"]);

const rootRef = ref(null);
const seekRef = ref(null);
const logStore = useLogStore();
const appStore = useAppStore();

// ---------------------------------------------------------------------------
// Fixed model: blackbox2 built-in heli (models/heli.glb). No model picker —
// this panel always flies the single bundled helicopter.
// ---------------------------------------------------------------------------
const HELI_MODEL_KEY = "heli";
// heli.glb node names carry no rotor/prop tags (Blender Layer/Cylinder
// names), so rotor spin is disabled: the whole craft follows attitude/GPS.
// Keep the collector API (empty list) so the animate loop stays unchanged.
const PROP_RULES = {};
const PROP_AXES = {};
const PROP_TAIL_AXES = {};
const currentModel = ref(HELI_MODEL_KEY);

// File name without its extension, for display in the status bar / HUD.
// blackbox2 has no local file input — the name comes from the shared app store.
function stripExt(name) {
    return (name || "").replace(/\.[^./\\]+$/, "");
}
const displayName = computed(() => (appStore.logFilename ? stripExt(appStore.logFilename) : "—"));

// blackbox2: replay the already-open viewer log only. No local Load BBL.
const hasLog = computed(() => logStore.hasLog && !!logStore.flightLog);

// Return the log to replay WITHOUT writing into the shared viewer store.
function ensureActiveLog() {
    return logStore.flightLog;
}

const status = ref("Load a blackbox log, then press Replay");
const timeLabel = ref("0.0s");
const playing = ref(false);
const replayLabel = ref("▶ Replay");

// ---------------------------------------------------------------------------
// Camera view mode: 'fixed' (default) = 관찰자는 지상에 고정, 기체를 바라봄.
// 'dynamic' = 기체를 따라다니며 거리 따라 확대/축소 (기존 Reset View 동작).
// ---------------------------------------------------------------------------
const VIEW_KEY = "blackbox3dViewMode";
const viewMode = ref(configStorageGet(VIEW_KEY)?.[VIEW_KEY] || "fixed");
const viewMenuOpen = ref(false);
const viewModeLabel = computed(() => (viewMode.value === "dynamic" ? "Dynamic View" : "Fixed View"));
function onSelectView(mode) {
    viewMode.value = mode;
    configStorageSet({ [VIEW_KEY]: mode });
    viewMenuOpen.value = false;
    if (mode === "fixed") applyFixedView();
    else onResetView();
}

// ---------------------------------------------------------------------------
// Without-GPS flight estimation (dead reckoning from collective + attitude).
// Runs automatically whenever the log carries no GPS fixes; the toolbar
// "Without GPS" button just opens the parameter dialog.
// ---------------------------------------------------------------------------
const EST_KEY = "blackbox3dEstimatorSettings3"; // v3: neutral bands, hang, settle, drift control
const EST_DEFAULTS = {
    verticalSource: "baroSmooth", // "none" = collective estimate, "baro" = raw, "baroSmooth" = smoothed
    baroSmoothing: 0.8, // 0..0.95 EMA strength (baroSmooth only)
    autoHover: true, // calibrate the hover point from the log's collective median
    hoverCollective: 0, // manual hover point (autoHover=false only)
    fullPitchAccel: 10, // m/s² extra accel at 100% collective
    drag: 0.15, // linear velocity damping (1/s) — bounds drift
    startAltitude: 3, // m above ground at t=0 (no GPS)
    // --- v3: heli-like motion refinement ---
    neutralBand: 10, // collective units around the hover point that count as neutral
    axisNeutralBand: 8, // deg of tilt below which no horizontal translation is driven
    gravityRelief: 0.7, // 0..1 — vertical accel cancelled at the start of the hang
    floatTime: 2, // s the craft "hangs" after collective returns to neutral
    reversePause: 0.6, // s of extra horizontal damping after a cyclic reversal
    homeBias: 1, // m/s² max acceleration steering the craft back to home
    homeSoftRadius: 0.6, // fraction of HOME_LIMIT where the home bias starts
};
function loadEstimatorSettings() {
    const stored = configStorageGet(EST_KEY);
    return { ...EST_DEFAULTS, ...(stored[EST_KEY] || {}) };
}
const estSettings = ref(loadEstimatorSettings());
const settingsOpen = ref(false);
// Reactive mirrors of non-reactive build state for the template.
const hasGpsFlag = ref(false);
const hasBaro = ref(false);
// True while the current frames were produced by the estimator (no-GPS log).
const estWithoutGps = ref(false);
function onWithoutGps() {
    settingsOpen.value = true;
}
function onSettingsApply(next) {
    estSettings.value = { ...estSettings.value, ...next };
    configStorageSet({ [EST_KEY]: estSettings.value });
    settingsOpen.value = false;
    // Rebuild frames with the new parameters (keeps the panel paused at 0).
    if (hasLog.value && logStore.flightLog) {
        resetPlayback();
        prepareFromActiveLog(false);
    }
}

// ---------------------------------------------------------------------------
// Scene setup
// ---------------------------------------------------------------------------
let scene, camera, renderer, controls;
let resizeObserver = null;
let worldGroup = null;
let airplane = null;
let modelGeneration = 0;
let propellers = [];
let propAngle = 0;
let lastTs = 0;
// Graph-panel parity (craft_heli_3d.js rotateTo): heli.glb nose points +Z while
// yaw=0 expects -Z, so a constant 180° (PI) trim is needed at load.
// The "Heading 90" button adds manual trim on top via onYaw().
let yawOffset = Math.PI;
let camTargetY = 0.4;
// ---------------------------------------------------------------------------
// World scale — 모든 사물의 크기를 1/5로 줄여 GPS 움직임이 상대적으로
// 5배 크게 보이게 한다.
//
// 핵심 원칙: "눈에 보이는 것만" 줄이고, "물리량"은 절대 손대지 않는다.
//  - 줄이는 것: 헬기 모델, 지면/활주로/나무/꽃, 마커 스프라이트, 카메라,
//    조명, 안개, 그림자 카메라
//  - 손대지 않는 것: frames x/z/alt (GPS 미터), HUD 숫자, 추정기 물리량,
//    degToMeters 변환. 시선 처리(applyFrame/animate)는 줄인 좌표계에서
//    그대로 동작하므로 추가 변환이 필요 없다.
// ---------------------------------------------------------------------------
const WORLD_SCALE = 0.2;
const S = WORLD_SCALE;
const CAM_HOME = new THREE.Vector3(0, 5, 11);

// playback state
let frames = [];
let startTime = 0,
    endTime = 0;
let homeLat = null,
    homeLon = null,
    homeAsl = 0;
let hasGps = false;
let playingFlag = false;
let playT = 0;
let lastPlayWall = 0;
// Without-GPS flight estimation: dead-reckoned paths drift fast, so the
// estimated craft is fenced to this radius (metres) around the home point.
// v3: raised 100 → 150 so arena-sized flights stay inside the fence.
const HOME_LIMIT = 150;
// v3: hang/settle trigger thresholds and the settle damping spike.
const FLOAT_VZ_TRIGGER = 0.4; // m/s of vertical speed for the hang to trigger
const REVERSE_SPEED_TRIGGER = 1; // m/s of ground speed for the settle to trigger
const SETTLE_DRAG_MAX = 6; // 1/s extra horizontal damping right after a reversal

let sourceRows = [];
let gpsFixes = [];
// Build summary for the status line (set by buildFrames).
let lastBuildEstimator = false;
let lastBuildBaroMode = "";
let lastBuildHover = 0;
const PLAYBACK_HZ = 50;
const PLAYBACK_STEP_US = 1e6 / PLAYBACK_HZ;

// HUD elements (kept as refs for fast updates)
let hudAltRel, hudHome, hudPos, hudMode, hudFile, hudSpeed;

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------
function buildEnvironment() {
    const parent = worldGroup;
    const GROUND_SIZE = 600 * S;
    const ground = new THREE.Mesh(
        new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE),
        new THREE.MeshStandardMaterial({ color: 0x5a9e3f }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    parent.add(ground);

    const runway = new THREE.Mesh(
        new THREE.BoxGeometry(12 * S, 0.2 * S, 160 * S),
        new THREE.MeshStandardMaterial({ color: 0x33363b }),
    );
    runway.position.set(0, 0.1 * S, 0);
    runway.receiveShadow = true;
    parent.add(runway);
    for (let z = -70 * S; z <= 70 * S + 1e-6; z += 14 * S) {
        const dash = new THREE.Mesh(
            new THREE.BoxGeometry(0.6 * S, 0.05 * S, 5 * S),
            new THREE.MeshStandardMaterial({ color: 0xffffff }),
        );
        dash.position.set(0, 0.22 * S, z);
        parent.add(dash);
    }

    const rand = (a, b) => a + Math.random() * (b - a);
    const treeGroup = new THREE.Group();
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4423 });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x2f7d32 });
    // 나무 배치도 WORLD_SCALE(1/5)에 맞춰 비행장 안쪽으로 당긴다.
    // (위치 그대로면 280m 밖에 있어 비행장에선 거의 안 보임)
    for (let i = 0; i < 80; i++) {
        // 배치 위치도 1/5 (GPS 궤적 공간이 아니라 배경 장식이므로 함께 축소)
        const x = rand(-280, 280) * S,
            z = rand(-280, 280) * S;
        if (Math.abs(x) < 18 * S && Math.abs(z) < 175 * S) continue;
        const t = new THREE.Group();
        const h = rand(7, 10) * S;
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.4 * S, 0.6 * S, h, 6), trunkMat);
        trunk.position.y = h / 2;
        trunk.castShadow = true;
        const leaves = new THREE.Mesh(new THREE.SphereGeometry(rand(2.2, 3.6) * S, 8, 6), leafMat);
        leaves.position.y = h + 1.2 * S;
        leaves.castShadow = true;
        t.add(trunk);
        t.add(leaves);
        t.position.set(x, 0, z);
        treeGroup.add(t);
    }
    parent.add(treeGroup);

    const flowerColors = [0xff5d8f, 0xffd166, 0x9b5de5, 0xffffff, 0xf15bb5];
    const flowerGeo = new THREE.SphereGeometry(0.35 * S, 6, 5);
    for (let i = 0; i < 240; i++) {
        // 꽃 배치도 1/5로 당긴다 (나무와 동일 이유).
        const x = rand(-290, 290) * S,
            z = rand(-290, 290) * S;
        if (Math.abs(x) < 14 * S && Math.abs(z) < 170 * S) continue;
        const f = new THREE.Mesh(
            flowerGeo,
            new THREE.MeshStandardMaterial({
                color: flowerColors[(Math.random() * flowerColors.length) | 0],
            }),
        );
        f.position.set(x, 0.35 * S, z);
        parent.add(f);
    }
}

// Align the static airfield (runway long axis = world +Z) so its direction
// matches the A→B bearing in the ground plane. The airplane and A/B markers
// live in the GPS frame, so they stay consistent with each other; only the
// environment is rotated. If A or B is missing, leave the airfield unrotated.
function applyAirfieldAlignment() {
    if (!worldGroup) return;
    const a = abFirstSeen.a;
    const b = abFirstSeen.b;
    if (!a || !b) {
        worldGroup.rotation.y = 0;
        return;
    }
    const ma = degToMeters(a.latDeg, a.lonDeg);
    const mb = degToMeters(b.latDeg, b.lonDeg);
    const dx = mb.x - ma.x;
    const dz = mb.z - ma.z;
    if (Math.abs(dx) < 1e-6 && Math.abs(dz) < 1e-6) {
        worldGroup.rotation.y = 0;
        return;
    }
    // Angle of the A→B vector measured from world +Z about the Y axis. Rotating
    // +Z by this angle yields (sin, cos) in (x, z), i.e. the runway bearing.
    worldGroup.rotation.y = Math.atan2(dx, dz);
}

// ---------------------------------------------------------------------------
// Airplane (loaded from the program's resources/models/airplane.gltf)
// ---------------------------------------------------------------------------

// Collect the nodes that should spin, using the model's explicit name rule.
// Each matched object is wrapped in a pivot Group whose origin sits at the
// prop's rotation centre, so it spins in place instead of orbiting the model
// origin (some models bake prop geometry in world space). For the drone each
// "propN" blade mesh is paired with its hub "cN" (prop1 <-> c1, ...) and the
// pivot is placed at cN's centre; for other craft the prop's own bounding-box
// centre is used. The pivot is parented to the (unrotated) model so the prop
// stays in the craft's hierarchy and moves with it, while its local Y still
// equals world Y so the spin axis is correct. Returns [] when model has no rule.
// spinProp is PROP_RULES[key] or null.
function collectPropellers(model, spinProp) {
    if (!spinProp) return [];
    const matched = [];
    model.traverse((o) => {
        if (spinProp.test((o.name || "").toLowerCase())) matched.push(o);
    });
    const pivots = [];
    for (const o of matched) {
        let centerObj = o;
        const pm = /^prop([1-4])$/i.exec(o.name || "");
        if (pm) {
            const cName = `c${pm[1]}`;
            model.traverse((c) => {
                if (centerObj === o && (c.name || "").toLowerCase() === cName) centerObj = c;
            });
        }
        const box = new THREE.Box3().setFromObject(centerObj);
        const center = box.getCenter(new THREE.Vector3());
        const parent = model;
        const pivot = new THREE.Group();
        parent.add(pivot);
        pivot.position.copy(parent.worldToLocal(center.clone()));
        pivot.attach(o);
        const modelKey = currentModel.value;
        const isTail = modelKey in PROP_TAIL_AXES && /tail_rotor/i.test(o.name || "");
        const axis = isTail ? PROP_TAIL_AXES[modelKey] : PROP_AXES[modelKey] || "y";
        pivot.userData.axis = axis;
        pivot.userData.reverse = !!isTail;
        pivots.push(pivot);
    }
    return pivots;
}

function loadAirplane() {
    // Async guard: GLTFLoader.load() resolves later. If Replay is pressed
    // twice quickly (or auto-prepare + manual Replay overlap), the first
    // response must not add a second heli under the newer one.
    const generation = ++modelGeneration;
    if (airplane) {
        scene.remove(airplane);
        airplane.traverse((o) => {
            if (o.geometry) o.geometry.dispose();
            if (o.material) o.material.dispose();
        });
    }
    airplane = null;
    propellers = [];

    // Fixed heli: no spinning rotor rule (see PROP_RULES above).
    const spinProp = PROP_RULES[currentModel.value] || null;

    const onLoaded = (gltf) => {
        if (generation !== modelGeneration) return; // superseded by a newer load
        airplane = gltf.scene;
        // heli.glb raw bounds ≈ 390 units (Blender 단위). WORLD_SCALE=0.2 로
        // 모든 사물과 함께 1/5 축소 (0.05625 → 0.01125).
        airplane.scale.set(0.05625 * S, 0.05625 * S, 0.05625 * S);
        airplane.traverse((o) => {
            if (o.isMesh) o.castShadow = true;
        });
        airplane.position.y = 4 * S;
        scene.add(airplane);
        airplane.updateMatrixWorld(true);
        propellers = collectPropellers(airplane, spinProp);
    };
    const onError = (err) => {
        console.error("model load failed", err);
        status.value = "Failed to load model";
    };

    // Single bundled model — Vite ?url import, works in web + Capacitor.
    const loader = new GLTFLoader();
    loader.load(heliModelUrl, onLoaded, undefined, onError);
}

// ---------------------------------------------------------------------------
// Markers
// ---------------------------------------------------------------------------
let markersGroup = null;
function makeTextSprite(text, color, heightM) {
    const pad = 24,
        fontPx = 96;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    ctx.font = `bold ${fontPx}px system-ui, sans-serif`;
    const w = Math.ceil(ctx.measureText(text).width) + pad * 2;
    const h = fontPx + pad * 2;
    canvas.width = w;
    canvas.height = h;
    ctx.font = `bold ${fontPx}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 10;
    ctx.strokeStyle = "rgba(0,0,0,0.85)";
    ctx.strokeText(text, w / 2, h / 2);
    ctx.fillStyle = color;
    ctx.fillText(text, w / 2, h / 2);
    const tex = new THREE.CanvasTexture(canvas);
    tex.anisotropy = 4;
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: true });
    const sprite = new THREE.Sprite(mat);
    const aspect = w / h;
    sprite.scale.set(heightM * aspect, heightM, 1);
    return sprite;
}
function clearMarkers() {
    if (markersGroup) {
        scene.remove(markersGroup);
        markersGroup.traverse((o) => {
            if (o.material) {
                if (o.material.map) o.material.map.dispose();
                o.material.dispose();
            }
            if (o.geometry) o.geometry.dispose();
        });
    }
    markersGroup = new THREE.Group();
    scene.add(markersGroup);
}
function degToMeters(lat, lon) {
    const dLat = (lat - homeLat) * 111320;
    const dLon = (lon - homeLon) * 111320 * Math.cos((homeLat * Math.PI) / 180);
    return { x: dLon, z: -dLat };
}
let abMarker = { a: null, b: null };
let abFirstSeen = { a: null, b: null };
function buildMarkers(data) {
    clearMarkers();
    abMarker = { a: null, b: null };
    abFirstSeen = { a: null, b: null };
    const { out, wpLat, wpLon, wpAlt, iALat, iALon, iBLat, iBLon } = data;
    const num = (vals, k) => {
        if (k < 0) return null;
        const v = parseFloat(vals[k]);
        return Number.isNaN(v) ? null : v;
    };
    const toAltM = (cm) => (cm == null ? 0 : cm / 100);
    // 마커 스프라이트 자체(글자 크기)도 1/5로 줄인다. 위치(m.x/m.z)는
    // GPS 미터 그대로 — 시각적 크기만 축소.
    const addMarker = (latDeg, lonDeg, text, color, heightM, altCm) => {
        const m = degToMeters(latDeg, lonDeg);
        const sprite = makeTextSprite(text, color, heightM * S);
        sprite.position.set(m.x, toAltM(altCm) + heightM * 0.6 * S, m.z);
        markersGroup.add(sprite);
        return sprite;
    };
    const wpDrawn = new Set();
    for (const row of out) {
        const vals = row._raw;
        if (!vals) continue;
        for (let i = 0; i < 15; i++) {
            if (wpDrawn.has(i)) continue;
            const lat = num(vals, wpLat[i]),
                lon = num(vals, wpLon[i]);
            if (lat != null && lon != null && (lat !== 0 || lon !== 0)) {
                const altCm = num(vals, wpAlt[i]);
                addMarker(lat / 1e7, lon / 1e7, String(i), "#ffd166", 4, altCm);
                wpDrawn.add(i);
            }
        }
        if (wpDrawn.size === 15) break;
    }
    for (const row of out) {
        const vals = row._raw;
        if (!vals) continue;
        const aLat = num(vals, iALat),
            aLon = num(vals, iALon);
        if (abFirstSeen.a === null) abFirstSeen.a = { latDeg: 0, lonDeg: 0 };
        if (aLat != null && aLat !== 0) abFirstSeen.a.latDeg = aLat / 1e7;
        if (aLon != null && aLon !== 0) abFirstSeen.a.lonDeg = aLon / 1e7;
        const bLat = num(vals, iBLat),
            bLon = num(vals, iBLon);
        if (abFirstSeen.b === null) abFirstSeen.b = { latDeg: 0, lonDeg: 0 };
        if (bLat != null && bLat !== 0) abFirstSeen.b.latDeg = bLat / 1e7;
        if (bLon != null && bLon !== 0) abFirstSeen.b.lonDeg = bLon / 1e7;
    }
    return wpDrawn.size + (abFirstSeen.a ? 1 : 0) + (abFirstSeen.b ? 1 : 0);
}
function updateABMarkers(fr) {
    if (!fr) return;
    for (const point of ["a", "b"]) {
        const seen = abFirstSeen[point];
        if (!seen) continue;
        const altCm = point === "a" ? fr.aAlt || 0 : fr.bAlt || 0;
        let entry = abMarker[point];
        if (!entry) {
            const m = degToMeters(seen.latDeg, seen.lonDeg);
            const sprite = makeTextSprite(point.toUpperCase(), "#ff3b3b", 5 * S);
            sprite.position.set(m.x, 0, m.z);
            sprite.visible = altCm !== 0;
            markersGroup.add(sprite);
            entry = abMarker[point] = { sprite, latDeg: seen.latDeg, lonDeg: seen.lonDeg };
        }
        entry.sprite.visible = altCm !== 0;
        const m = degToMeters(seen.latDeg, seen.lonDeg);
        entry.sprite.position.set(m.x, altCm / 100 + 5 * 0.6 * S, m.z);
    }
}
// ---------------------------------------------------------------------------
// Frame building (from adapted FlightLog data)
// ---------------------------------------------------------------------------
function validGpsRow(row) {
    return row.lat != null && row.lon != null && Number.isFinite(row.lat) && Number.isFinite(row.lon);
}
function shortestAngleDiff(target, current) {
    let d = (target - current) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return d;
}
function interpolateRowsAt(rows, t) {
    if (!rows.length) return null;
    if (t <= rows[0].t) return rows[0];
    if (t >= rows[rows.length - 1].t) return rows[rows.length - 1];
    let lo = 0,
        hi = rows.length - 1;
    while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (rows[mid].t < t) lo = mid;
        else hi = mid;
    }
    const a = rows[lo],
        b = rows[hi];
    const f = (t - a.t) / (b.t - a.t || 1);
    return {
        t,
        roll: a.roll + shortestAngleDiff(b.roll, a.roll) * f,
        pitch: a.pitch + shortestAngleDiff(b.pitch, a.pitch) * f,
        yaw: a.yaw + shortestAngleDiff(b.yaw, a.yaw) * f,
        throttle: a.throttle + (b.throttle - a.throttle) * f,
        velN: a.velN + (b.velN - a.velN) * f,
        velE: a.velE + (b.velE - a.velE) * f,
        // Estimator inputs: collective (%) is always linearly interpolated;
        // baro (cm) keeps the previous value when either neighbour is missing.
        collective: (a.collective ?? 0) + ((b.collective ?? 0) - (a.collective ?? 0)) * f,
        baro: a.baro == null || b.baro == null ? a.baro ?? null : a.baro + (b.baro - a.baro) * f,
        baroAlt: a.baroAlt + (b.baroAlt - a.baroAlt) * f,
        gpsAlt: a.gpsAlt + (b.gpsAlt - a.gpsAlt) * f,
    };
}
function interpolateGpsAt(t) {
    if (!gpsFixes.length) return null;
    if (t <= gpsFixes[0].t) return gpsFixes[0];
    if (t >= gpsFixes[gpsFixes.length - 1].t) return gpsFixes[gpsFixes.length - 1];
    let lo = 0,
        hi = gpsFixes.length - 1;
    while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (gpsFixes[mid].t < t) lo = mid;
        else hi = mid;
    }
    const a = gpsFixes[lo],
        b = gpsFixes[hi];
    const f = (t - a.t) / (b.t - a.t || 1);
    return {
        lat: a.lat + (b.lat - a.lat) * f,
        lon: a.lon + (b.lon - a.lon) * f,
        gpsAlt: a.gpsAlt + (b.gpsAlt - a.gpsAlt) * f,
    };
}
function buildFrames(data) {
    const { out, iAAlt, iBAlt, iMode } = data;
    sourceRows = out.slice().sort((a, b) => a.t - b.t);

    const rawAbAt = (t, k) => {
        if (k < 0 || !sourceRows.length) return 0;
        let lo = 0,
            hi = sourceRows.length - 1;
        if (t <= sourceRows[0].t) lo = hi = 0;
        else if (t >= sourceRows[hi].t) lo = hi = hi;
        else {
            while (hi - lo > 1) {
                const m = (lo + hi) >> 1;
                if (sourceRows[m].t < t) lo = m;
                else hi = m;
            }
        }
        const pick = (i) => {
            const v = sourceRows[i]._raw ? parseFloat(sourceRows[i]._raw[k]) : NaN;
            return Number.isNaN(v) ? 0 : v;
        };
        const a = pick(lo),
            b = pick(hi);
        const f = (t - sourceRows[lo].t) / (sourceRows[hi].t - sourceRows[lo].t || 1);
        return a + (b - a) * (hi === lo ? 0 : f);
    };
    frames = [];
    hasGps = sourceRows.some(validGpsRow);

    const rawModeAt = (t) => {
        if (iMode < 0 || !sourceRows.length) return 0;
        let lo = 0,
            hi = sourceRows.length - 1;
        if (t <= sourceRows[0].t) lo = hi = 0;
        else if (t >= sourceRows[hi].t) lo = hi = hi;
        else {
            while (hi - lo > 1) {
                const m = (lo + hi) >> 1;
                if (sourceRows[m].t < t) lo = m;
                else hi = m;
            }
        }
        const pick = (i) => {
            const raw = sourceRows[i]._raw ? String(sourceRows[i]._raw[iMode] ?? "").trim() : "";
            if (!raw || raw === "NaN") return 0;
            const v = /^0x/i.test(raw) ? parseInt(raw, 16) : parseFloat(raw);
            return Number.isNaN(v) ? 0 : v | 0;
        };
        return pick(lo);
    };

    gpsFixes = [];
    for (const row of sourceRows) {
        if (!validGpsRow(row)) continue;
        const previous = gpsFixes[gpsFixes.length - 1];
        if (!previous || row.lat !== previous.lat || row.lon !== previous.lon || row.gpsAlt !== previous.gpsAlt) {
            gpsFixes.push({ t: row.t, lat: row.lat, lon: row.lon, gpsAlt: row.gpsAlt ?? 0 });
        }
    }

    const first = gpsFixes[0];
    if (first) {
        homeLat = first.lat / 1e7;
        homeLon = first.lon / 1e7;
    }
    homeAsl = 0;

    const firstTime = sourceRows[0]?.t ?? 0;
    const lastTime = sourceRows[sourceRows.length - 1]?.t ?? firstTime;
    startTime = firstTime;
    endTime = lastTime;

    // Without-GPS flight estimation: dead-reckon the flight path from
    // collective + attitude when the log carries no GPS fixes. Attitude is
    // exactly what the graph-panel heli shows; the thrust model is
    //   a_body = g + (coll% - hoverColl%) / 100 * fullPitchAccel
    // rotated into the world frame by R(yaw,pitch,roll) — see the Without-GPS
    // estimator block inside the frame loop below.
    const useEstimator = !hasGps;
    estWithoutGps.value = useEstimator;
    hasGpsFlag.value = hasGps;
    hasBaro.value = sourceRows.some((r) => r.baro != null);
    const s = estSettings.value;
    // Auto-calibrate the hover point: RC collective fields are stick-centred
    // (≈ -100..100 with hover near the log median, NOT 0..100 with hover at
    // 50). Using the raw median makes "more collective than usual → climb"
    // hold for any FC's units. The dialog checkbox turns this off to use the
    // manually entered value instead.
    let hoverColl = s.hoverCollective;
    if (s.autoHover) {
        const cols = sourceRows.map((r) => r.collective).filter((v) => v != null && Number.isFinite(v)).sort((a, b) => a - b);
        if (cols.length) hoverColl = cols[Math.floor(cols.length / 2)];
    }
    lastBuildHover = Math.round(hoverColl * 10) / 10;
    lastBuildEstimator = useEstimator;
    lastBuildBaroMode =
        useEstimator && s.verticalSource !== "none" && hasBaro.value
            ? s.verticalSource === "baro"
                ? "raw"
                : "smoothed"
            : "off";
    const G_ACCEL = 9.80665;
    const est = useEstimator
        ? { x: 0, y: 0, z: s.startAltitude, vx: 0, vy: 0, vz: 0 } // world ENU; z starts at the configured altitude
        : null;
    const baroMode = useEstimator && s.verticalSource !== "none" && hasBaro.value;
    const baroAlpha = Math.max(0.05, 1 - Math.min(0.95, Math.max(0, s.baroSmoothing)));
    let baroBase = null;
    let baroSmooth = null;
    const estDt = PLAYBACK_STEP_US / 1e6; // integration step (frames are exactly PLAYBACK_HZ apart)
    // --- v3 hang/settle state (per build) ---
    let floatT = 0; // remaining seconds of the "hang" (gravity relief) window
    let settleT = 0; // remaining seconds of the reversal-settle damping spike
    let collNeutralPrev = true; // collective was inside the neutral band on the previous frame
    let floatAltHold = null; // displayed altitude captured when the hang started (baro modes)

    for (let t = startTime; t <= endTime + 0.5; t += PLAYBACK_STEP_US) {
        const row = interpolateRowsAt(sourceRows, Math.min(t, endTime));
        if (!row) continue;
        let frameX = 0;
        let frameZ = 0;
        let frameAlt = 0;
        if (useEstimator) {
            // --- Thrust from collective (body frame, up axis) ---
            // v3: collective neutral band — within ±neutralBand of the hover
            // point the collective counts as neutral (pure hover thrust), so
            // the tiny stick jitter around centre no longer pumps the
            // altitude. A soft knee (the band is subtracted from the delta
            // magnitude) keeps the thrust continuous at the band edge.
            const collDelta = (row.collective ?? 0) - hoverColl;
            const collEff = Math.sign(collDelta) * Math.max(0, Math.abs(collDelta) - Math.max(0, s.neutralBand));
            const aThrust = G_ACCEL + collEff * 0.01 * s.fullPitchAccel;
            // --- Rotate body-up into the world (ENU) via attitude ---
            const cP = Math.cos(row.roll);
            const sP = Math.sin(row.roll);
            const sT = Math.sin(row.pitch);
            const cY = Math.cos(row.yaw);
            const sY = Math.sin(row.yaw);
            const ux = cY * sT * cP + sY * sP;
            const uy = sY * sT * cP - cY * sP;
            // v3: attitude neutral band — tilt inside axisNeutralBand (deg)
            // drives no horizontal translation (thrust treated as straight
            // up), the same soft knee as the collective band. The DISPLAYED
            // attitude stays raw — only the translation input is banded.
            const tiltMag = Math.hypot(ux, uy);
            const tiltNeutral = Math.sin((Math.max(0, s.axisNeutralBand) * Math.PI) / 180);
            const tiltEff = Math.max(0, tiltMag - tiltNeutral);
            const uxT = tiltMag > 1e-9 ? (ux / tiltMag) * tiltEff : 0;
            const uyT = tiltMag > 1e-9 ? (uy / tiltMag) * tiltEff : 0;
            const uzT = Math.sqrt(Math.max(0, 1 - Math.min(1, tiltEff * tiltEff)));
            // v3: hang window — the collective just returned to neutral while
            // the craft was climbing or descending. Real helis hang for a beat
            // (rotor inertia + collective cushioning) instead of ballooning or
            // dropping; model it as decaying gravity relief that fades the net
            // vertical acceleration out and bleeds the vertical velocity to
            // zero over floatTime seconds.
            const collNeutral = Math.abs(collDelta) <= Math.max(0, s.neutralBand);
            if (collNeutral && !collNeutralPrev && Math.abs(est.vz) > FLOAT_VZ_TRIGGER) {
                floatT = s.floatTime;
                floatAltHold = null; // re-capture the displayed altitude at the hang
            }
            collNeutralPrev = collNeutral;
            // v3: reversal settle — the rotor tilt now points against the
            // current motion (cyclic reversal): the real heli decelerates
            // hard and sits still for a beat before translating the other
            // way. Model it with a short-lived extra horizontal drag that
            // spikes on the reversal and decays over reversePause seconds.
            const hSpeed = Math.hypot(est.vx, est.vy);
            if (hSpeed > REVERSE_SPEED_TRIGGER && tiltEff > 0.02) {
                const dirDot = (est.vx * uxT + est.vy * uyT) / (hSpeed * tiltEff);
                if (dirDot < -0.25) settleT = s.reversePause;
            }
            let settleDrag = 0;
            if (settleT > 0) {
                settleDrag = SETTLE_DRAG_MAX * (settleT / Math.max(0.01, s.reversePause));
                settleT -= estDt;
            }
            const hDrag = s.drag + settleDrag;
            // --- Net world accel = thrust - gravity - linear drag, integrate ---
            let az = aThrust * uzT - G_ACCEL - s.drag * est.vz;
            if (floatT > 0) {
                const frac = floatT / Math.max(0.01, s.floatTime); // 1 → 0
                const relief = Math.min(1, s.gravityRelief) * frac;
                az *= 1 - relief; // gravity/thrust overshoot fade out
                est.vz -= est.vz * Math.min(0.9, relief * 8 * estDt); // bleed vertical velocity → hang
                floatT -= estDt;
            }
            const ax = aThrust * uxT - hDrag * est.vx;
            const ay = aThrust * uyT - hDrag * est.vy;
            est.vx += ax * estDt;
            est.vy += ay * estDt;
            est.vz += az * estDt;
            est.x += est.vx * estDt;
            est.y += est.vy * estDt;
            est.z += est.vz * estDt;
            if (est.z < 0) {
                est.z = 0;
                if (est.vz < 0) est.vz = 0;
            }
            // --- v3 drift control: steer the craft back toward the home
            // (starting) point once it drifts past the soft radius, so
            // dead-reckoned paths bend back toward the field instead of
            // wandering away for good.
            const dist = Math.hypot(est.x, est.y);
            const softRadius = Math.min(HOME_LIMIT - 1, Math.max(0, s.homeSoftRadius) * HOME_LIMIT);
            if (dist > softRadius && dist > 1e-6) {
                const w = Math.min(1, (dist - softRadius) / Math.max(1, HOME_LIMIT - softRadius));
                const bias = Math.max(0, s.homeBias) * w; // m/s² toward home
                est.vx -= (est.x / dist) * bias * estDt;
                est.vy -= (est.y / dist) * bias * estDt;
            }
            // --- Field fence: keep the craft inside HOME_LIMIT metres of the
            // home point. On reaching the fence, zero the outward velocity
            // component so the craft slides along the boundary instead of
            // sticking to it.
            const distFence = Math.hypot(est.x, est.y);
            if (distFence > HOME_LIMIT) {
                const nx = est.x / distFence;
                const ny = est.y / distFence;
                est.x = nx * HOME_LIMIT;
                est.y = ny * HOME_LIMIT;
                const outward = est.vx * nx + est.vy * ny;
                if (outward > 0) {
                    est.vx -= outward * nx;
                    est.vy -= outward * ny;
                }
            }
            // The estimated horizontal path IS displayed: the craft moves in
            // the direction the rotor tilts (thrust vector integration).
            // Visibility is guaranteed by the chase camera, not by pinning
            // the craft to the home point.
            frameX = est.x;
            frameZ = -est.y; // scene north → -z (same as the GPS path)
            frameAlt = est.z;
            // --- Barometer vertical override (preferred when available) ---
            if (baroMode && row.baro != null) {
                if (baroBase == null) baroBase = row.baro;
                baroSmooth = baroSmooth == null ? row.baro : baroSmooth + baroAlpha * (row.baro - baroSmooth);
                const baroVal = s.verticalSource === "baro" ? row.baro : baroSmooth;
                frameAlt = (baroVal - baroBase) / 100; // RF altitude is cm → m
                // v3: the hang must stay visible in baro modes too — during
                // the relief window blend the displayed altitude toward the
                // value captured when the collective returned to neutral,
                // then release it smoothly as the relief decays.
                if (floatT > 0) {
                    const frac = floatT / Math.max(0.01, s.floatTime);
                    const relief = Math.min(1, s.gravityRelief) * frac;
                    if (floatAltHold == null) floatAltHold = frameAlt;
                    frameAlt = floatAltHold + (frameAlt - floatAltHold) * (1 - relief);
                } else {
                    floatAltHold = null;
                }
            }
        } else {
            const gps = interpolateGpsAt(Math.min(t, endTime));
            const lat = gps ? gps.lat / 1e7 : homeLat;
            const lon = gps ? gps.lon / 1e7 : homeLon;
            const dLat = (lat - homeLat) * 111320;
            const dLon = (lon - homeLon) * 111320 * Math.cos((homeLat * Math.PI) / 180);
            frameX = dLon;
            frameZ = -dLat;
            const baroAltM = (row.baro ?? 0) / 100;
            frameAlt = baroAltM;
        }
        frames.push({
            t: Math.min(t, endTime),
            x: frameX,
            z: frameZ,
            alt: frameAlt,
            roll: row.roll,
            pitch: row.pitch,
            yaw: row.yaw,
            throttle: row.throttle,
            vx: 0,
            vz: 0,
            baroAltM: frameAlt,
            gpsAltM: frameAlt,
            aAlt: rawAbAt(Math.min(t, endTime), iAAlt),
            bAlt: rawAbAt(Math.min(t, endTime), iBAlt),
            mode: rawModeAt(Math.min(t, endTime)),
        });
    }
    // Always derive ground speed from the displacement between consecutive
    // frames. The playback step is fixed (PLAYBACK_STEP_US at PLAYBACK_HZ), so dt
    // is known exactly — this works whether or not the log carries GPS_velned.
    const dtSec = PLAYBACK_STEP_US / 1e6;
    for (let i = 0; i < frames.length; i++) {
        const a = frames[Math.max(0, i - 1)];
        const b = frames[Math.min(frames.length - 1, i + 1)];
        const span = (b.t - a.t) / 1e6 || dtSec;
        frames[i].vx = (frames[i].x - a.x) / span;
        frames[i].vz = (frames[i].z - a.z) / span;
    }
    if (frames.length) {
        startTime = frames[0].t;
        endTime = frames[frames.length - 1].t;
    }
}

// ---------------------------------------------------------------------------
// Playback
// ---------------------------------------------------------------------------
function frameAt(t) {
    if (!frames.length) return null;
    if (t <= frames[0].t) return frames[0];
    if (t >= frames[frames.length - 1].t) return frames[frames.length - 1];
    let lo = 0,
        hi = frames.length - 1;
    while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (frames[mid].t < t) lo = mid;
        else hi = mid;
    }
    const a = frames[lo],
        b = frames[hi];
    const f = (t - a.t) / (b.t - a.t || 1);
    return {
        x: a.x + (b.x - a.x) * f,
        z: a.z + (b.z - a.z) * f,
        roll: a.roll + shortestAngleDiff(b.roll, a.roll) * f,
        pitch: a.pitch + shortestAngleDiff(b.pitch, a.pitch) * f,
        yaw: a.yaw + shortestAngleDiff(b.yaw, a.yaw) * f,
        throttle: a.throttle + (b.throttle - a.throttle) * f,
        alt: a.alt + (b.alt - a.alt) * f,
        baroAltM: a.baroAltM + (b.baroAltM - a.baroAltM) * f,
        gpsAltM: a.gpsAltM + (b.gpsAltM - a.gpsAltM) * f,
        vx: a.vx + (b.vx - a.vx) * f,
        vz: a.vz + (b.vz - a.vz) * f,
        aAlt: a.aAlt + (b.aAlt - a.aAlt) * f,
        bAlt: a.bAlt + (b.bAlt - a.bAlt) * f,
        mode: a.mode,
    };
}

// ---------------------------------------------------------------------------
// Contrail (removed per user request — no smoke trail)
// ---------------------------------------------------------------------------

function applyFrame(fr, opts = {}) {
    if (!airplane || !fr) return;
    // GPS 궤적(미터)은 원본 그대로 — 사물만 1/5라서 상대적으로 5배 크게 보인다.
    airplane.position.x = fr.x;
    airplane.position.z = fr.z;
    const altRel = (fr.alt || 0) * 1;
    // With GPS the craft follows the logged altitude (starts on the ground).
    // Without GPS the estimator already starts at the configured start
    // altitude, so no extra lift; the +3 lift only applies to the legacy
    // flat-at-origin case (estimator unavailable).
    const groundLift = hasGps || estWithoutGps.value ? 0 : 3;
    // User spec (no-GPS seek): when the barometer is not being used, scrubbing
    // the timeline must KEEP the previously displayed height instead of
    // following the (unreliable) collective-integrated altitude.
    const holdAlt = !!opts.holdAlt && estWithoutGps.value && lastBuildBaroMode === "off";
    if (!holdAlt) {
        // 지면 리프트 상수(3/1.5)는 줄인 헬기(1/5)에 맞춰 스케일. altRel(GPS 미터)는 원본.
        airplane.position.y = altRel + groundLift * S + 1.5 * S;
        if (hudAltRel) hudAltRel.textContent = altRel.toFixed(1);
    }
    const speed = Math.sqrt((fr.vx || 0) * (fr.vx || 0) + (fr.vz || 0) * (fr.vz || 0));
    if (hudSpeed) hudSpeed.textContent = speed.toFixed(1);
    const distToHome = Math.sqrt((fr.x || 0) * (fr.x || 0) + (fr.z || 0) * (fr.z || 0));
    if (hudHome) hudHome.textContent = distToHome.toFixed(1);
    if (hudPos) hudPos.textContent = `${fr.x.toFixed(1)}, ${fr.z.toFixed(1)}`;

    const modeVal = fr && fr.mode != null ? fr.mode | 0 : 0;
    const isAuto = (modeVal & ~1) !== 0;
    if (hudMode) {
        hudMode.textContent = isAuto ? "Autopilot" : "Manual";
        hudMode.classList.toggle("b3d-mode--auto", isAuto);
    }

    // Graph-panel parity: craft_heli_3d.js rotateTo(x=-pitch, y=-yaw, z=-roll)
    // where x=attitude[1], y=attitude[2], z=attitude[0] — heading[] is already
    // radians (unlike attitude[] decideg), so no unit conversion here.
    // YXZ order + yawOffset trim matches the modelWrapper/model split in the
    // graph panel (yaw on the wrapper, pitch/roll on the model).
    airplane.rotation.order = "YXZ";
    airplane.rotation.set(-fr.pitch, -fr.yaw + yawOffset, -fr.roll, "YXZ");

    updateABMarkers(fr);
}
function updatePropellers(dt, throttle) {
    const maxRpm = 400;
    const speed = 20 + Math.min(1, Math.max(0, throttle)) * maxRpm;
    propAngle += speed * dt;
    for (const p of propellers) p.rotation[p.userData.axis || "y"] = p.userData.reverse ? -propAngle : propAngle;
}
function setPlaying(p) {
    playingFlag = p;
    playing.value = p;
    replayLabel.value = p ? "⏸ Pause" : "▶ Replay";
    if (p) lastPlayWall = performance.now();
}

// Reset the bottom playback controls (play button + seek bar + time) and any
// in-flight replay state when a new log is loaded.
function resetPlayback() {
    setPlaying(false);
    playT = 0;
    frames = [];
    gpsFixes = [];
    startTime = 0;
    endTime = 0;
    clearMarkers();
    if (seekRef.value) seekRef.value.value = 0;
    timeLabel.value = "0.0s";
    if (hudFile) hudFile.textContent = displayName.value;
    const fr = frameAt(playT);
    applyFrame(fr);
}

// ---------------------------------------------------------------------------
// Load from the active FlightLog (blackbox2: the already-open viewer log.
// Auto-prepared on mount / log change; Replay rebuilds on demand.)
// ---------------------------------------------------------------------------
function prepareFromActiveLog(autoplay) {
    if (!ensureActiveLog()) {
        status.value = "Open a blackbox log in the viewer first";
        return;
    }
    try {
        const data = buildReplayDataFromFlightLog(ensureActiveLog());
        const { out } = data;
        if (!out.length) throw new Error("No data rows found");
        loadAirplane();
        buildFrames(data);
        const markerCount = buildMarkers(data);
        applyAirfieldAlignment();
        playT = startTime;
        if (seekRef.value) seekRef.value.value = 0;
        const fr = frameAt(playT);
        applyFrame(fr);
        status.value = `Loaded: ${frames.length} frames (${PLAYBACK_HZ}Hz), ${lastBuildEstimator ? `flight estimated from collective+attitude (hover≈${lastBuildHover}, baro: ${lastBuildBaroMode})` : `GPS interpolated from ${gpsFixes.length} fixes`}${markerCount ? `, ${markerCount} markers` : ""}`;
        timeLabel.value = "0.0s";
        setPlaying(!!autoplay);
    } catch (err) {
        console.error(err);
        status.value = `Parse failed: ${err.message}`;
    }
}

function onReplay() {
    if (playingFlag) {
        setPlaying(false);
        return;
    }
    if (frames.length) {
        // Frames already prepared (auto-load on open) — resume from start.
        // Do NOT reload the model: loadAirplane() is async and would add a
        // second heli while the old one is still in the scene.
        playT = startTime;
        if (seekRef.value) seekRef.value.value = 0;
        timeLabel.value = "0.0s";
        applyFrame(frameAt(startTime), { holdAlt: true });
        if (viewMode.value === "fixed") applyFixedView();
        else snapCameraToCraft();
        setPlaying(true);
        return;
    }
    prepareFromActiveLog(true);
}

function onTogglePlay() {
    if (!frames.length) {
        onReplay();
        return;
    }
    setPlaying(!playingFlag);
}
// Fixed View: 관찰자는 지상(CAM_HOME)에 고정, 기체를 바라봄.
// 카메라 위치는 움직이지 않고 controls.target만 기체를 향해 회전한다.
// 기체가 멀어지면 작게 보이는 것이 실제와 같음 — 확대/축소(줌)는
// Dynamic 모드에서만 수행한다.
function applyFixedView() {
    if (!camera || !controls) return;
    camera.position.copy(CAM_HOME);
    if (airplane) {
        controls.target.copy(airplane.position);
        camTargetY = airplane.position.y;
    } else {
        controls.target.set(0, 2 * S, 0);
        camTargetY = 2 * S;
    }
    controls.update();
    camera.position.copy(CAM_HOME);
}
// Snap the chase camera onto the craft's current position (keeping the
// user's orbit offset). Used when scrubbing the timeline / resetting the
// view while paused, where the lerp-based playback chase doesn't run.
function snapCameraToCraft() {
    if (!camera || !controls || !airplane) return;
    if (viewMode.value === "fixed") {
        // 고정시점: 카메라 위치는 그대로, 바라보는 방향만 기체로.
        controls.target.copy(airplane.position);
        camTargetY = airplane.position.y;
        controls.update();
        camera.position.copy(CAM_HOME);
        return;
    }
    const t = airplane.position.clone();
    const delta = t.clone().sub(controls.target);
    controls.target.copy(t);
    camera.position.add(delta);
    camTargetY = t.y;
}
function onResetView() {
    if (!camera) return;
    if (airplane) {
        // Re-frame the craft wherever it is on the (possibly long) estimated
        // path — a fixed home viewpoint would leave it out of frame.
        // WORLD_SCALE 적용: 오프셋도 1/5 (25/55 → 5/11).
        camera.position.set(airplane.position.x, airplane.position.y + 25 * S, airplane.position.z + 55 * S);
        controls.target.copy(airplane.position);
        camTargetY = airplane.position.y;
    } else {
        camera.position.copy(CAM_HOME);
        controls.target.set(0, 2 * S, 0);
        camTargetY = 2 * S;
    }
}
function onFullScreen() {
    const el = rootRef.value;
    if (!document.fullscreenElement) el.requestFullscreen();
    else document.exitFullscreen();
}
function onYaw() {
    yawOffset += Math.PI / 2;
    if (!frames.length) return;
    const fr = frameAt(playT);
    applyFrame(fr);
}
function onSeek() {
    if (!frames.length || !seekRef.value) return;
    const frac = seekRef.value.value / 1000;
    playT = startTime + (endTime - startTime) * frac;
    setPlaying(false);
    const fr = frameAt(playT);
    applyFrame(fr, { holdAlt: true });
    snapCameraToCraft();
    timeLabel.value = `${((playT - startTime) / 1e6).toFixed(1)}s`;
}

// ---------------------------------------------------------------------------
// Loop
// ---------------------------------------------------------------------------
let rafId = null;
let disposed = false;
function animate(ts) {
    if (disposed || !renderer || !scene || !camera) {
        rafId = null;
        return;
    }
    rafId = requestAnimationFrame(animate);
    const dt = lastTs ? (ts - lastTs) / 1000 : 0;
    lastTs = ts;

    if (playingFlag && frames.length) {
        const wallDt = (ts - lastPlayWall) / 1000;
        lastPlayWall = ts;
        playT += wallDt * 1e6;
        if (playT >= endTime) {
            playT = endTime;
            setPlaying(false);
        }
        const frac = (playT - startTime) / (endTime - startTime || 1);
        if (seekRef.value) seekRef.value.value = Math.max(0, Math.min(1000, frac * 1000));
        const fr = frameAt(playT);
        applyFrame(fr);
        if (airplane) {
            if (viewMode.value === "fixed") {
                // 고정시점: 관찰자 위치 고정, 시선만 기체를 따라 회전.
                // 카메라를 옮기지 않으므로 멀어지면 작게 보이는 것이 실제와 같음.
                controls.target.copy(airplane.position);
                camTargetY = airplane.position.y;
            } else {
                const tx = airplane.position.x;
                const tz = airplane.position.z;
                let dy = airplane.position.y - camTargetY;
                if (Math.abs(dy) < 0.5 * S) dy = 0;
                const ty = camTargetY + dy * 0.01;
                camTargetY = ty;
                // Dynamic: chase — 기체를 따라다니며 거리 따라 확대/축소.
                // (사용자 orbit 오프셋은 유지)
                const before = controls.target.clone();
                controls.target.lerp(new THREE.Vector3(tx, ty, tz), 0.25);
                camera.position.add(controls.target.clone().sub(before));
            }
        }
        timeLabel.value = `${((playT - startTime) / 1e6).toFixed(1)}s`;
    }

    const thr = frames.length ? frameAt(playT)?.throttle || 0 : 0;
    updatePropellers(dt, thr);

    controls.update();
    if (viewMode.value === "fixed") {
        camera.position.copy(CAM_HOME);
    }
    renderer.clear();
    renderer.render(scene, camera);
}

function resize() {
    if (!renderer || !camera || !rootRef.value) return;
    const w = rootRef.value.clientWidth;
    const h = rootRef.value.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
}

function init() {
    disposed = false;
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87b9e6);
    scene.fog = new THREE.Fog(0x87b9e6, 60 * S, 400 * S);

    const w = rootRef.value.clientWidth || 800;
    const h = rootRef.value.clientHeight || 600;
    camera = new THREE.PerspectiveCamera(55, w / h, 0.1 * S, 5000);
    camera.position.copy(CAM_HOME);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.autoClear = true;
    rootRef.value.appendChild(renderer.domElement);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(0, 2 * S, 0);

    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const sun = new THREE.DirectionalLight(0xffffff, 1.1);
    sun.position.set(50 * S, 100 * S, 30 * S);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -150 * S;
    sun.shadow.camera.right = 150 * S;
    sun.shadow.camera.top = 150 * S;
    sun.shadow.camera.bottom = -150 * S;
    scene.add(sun);

    worldGroup = new THREE.Group();
    scene.add(worldGroup);
    buildEnvironment();
    loadAirplane();

    hudAltRel = rootRef.value.querySelector("#b3dAltRel");
    hudSpeed = rootRef.value.querySelector("#b3dSpeed");
    hudHome = rootRef.value.querySelector("#b3dHome");
    hudPos = rootRef.value.querySelector("#b3dPos");
    hudMode = rootRef.value.querySelector("#b3dMode");
    hudFile = rootRef.value.querySelector("#b3dFile");
    if (hudFile) hudFile.textContent = displayName.value;

    window.addEventListener("resize", resize);
    rafId = requestAnimationFrame(animate);
    // Keep the renderer sized to the host even if layout settles after mount or
    // the tab pane resizes — otherwise the canvas can stay 0px tall and the
    // airfield never becomes visible.
    resizeObserver = new ResizeObserver(() => resize());
    resizeObserver.observe(rootRef.value);
    resize();
}

function dispose() {
    disposed = true;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
    window.removeEventListener("resize", resize);
    if (resizeObserver) {
        resizeObserver.disconnect();
        resizeObserver = null;
    }
    setPlaying(false);
    if (worldGroup) {
        worldGroup.traverse((o) => {
            if (o.geometry) o.geometry.dispose();
            if (o.material) o.material.dispose();
        });
        scene.remove(worldGroup);
        worldGroup = null;
    }
    if (airplane) {
        scene.remove(airplane);
        airplane.traverse((o) => {
            if (o.geometry) o.geometry.dispose();
            if (o.material) o.material.dispose();
        });
    }
    if (renderer) {
        renderer.dispose();
        // Release the WebGL context so switching tabs doesn't exhaust the
        // browser's context limit (which breaks other canvas-based tabs).
        if (renderer.forceContextLoss) renderer.forceContextLoss();
        if (renderer.domElement && renderer.domElement.parentNode) {
            renderer.domElement.parentNode.removeChild(renderer.domElement);
        }
    }
    scene = null;
    camera = null;
    renderer = null;
    controls = null;
    airplane = null;
}

onMounted(async () => {
    await nextTick();
    init();
    // Auto-read the already-open viewer log so Replay is ready immediately.
    if (hasLog.value) {
        prepareFromActiveLog(false);
    }
});
// A different log opened while the panel stays mounted → rebuild frames.
watch(
    () => logStore.flightLog,
    () => {
        if (!rootRef.value || !renderer) return;
        resetPlayback();
        if (hasLog.value) {
            prepareFromActiveLog(false);
        } else {
            status.value = "Open a blackbox log in the viewer first";
        }
    },
);
onBeforeUnmount(() => {
    dispose();
});
</script>

<style scoped>
.blackbox-3d-replay {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
    background: #87b9e6;
}
.b3d-toolbar {
    position: absolute;
    top: 10px;
    left: 10px;
    right: 10px;
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
    background: rgba(20, 24, 30, 0.82);
    color: #eee;
    padding: 8px 12px;
    border-radius: 8px;
    z-index: 10;
}
.b3d-btn {
    background: #2db0e3 !important;
    color: #fff !important;
    border: none;
    padding: 6px 12px;
    border-radius: 5px;
    cursor: pointer;
    font-size: 13px;
    line-height: 18px;
    height: 30px;
    box-sizing: border-box;
}
.b3d-btn:hover {
    background: #1e8fc0 !important;
}
.b3d-btn:disabled {
    background: #55606c !important;
    color: #b9c2cc !important;
    cursor: not-allowed;
    opacity: 0.75;
}
.b3d-btn--close {
    background: #64748b !important;
}
.b3d-btn--close:hover {
    background: #475569 !important;
}
.b3d-btn--active {
    background: #1e8fc0 !important;
    box-shadow:
        inset 0 0 0 2px #ffd54a,
        0 0 0 1px rgba(0, 0, 0, 0.4);
}
.b3d-viewmenu {
    position: relative;
}
.b3d-viewmenu-list {
    position: absolute;
    top: calc(100% + 6px);
    left: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
    background: rgba(20, 24, 30, 0.95);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 8px;
    padding: 8px;
    min-width: 220px;
    z-index: 20;
}
.b3d-viewmenu-item {
    text-align: left;
    white-space: nowrap;
}
.b3d-sep {
    width: 1px;
    height: 22px;
    background: #444;
}
.b3d-status {
    font-size: 12.5px;
    color: #e6f0fb;
    font-weight: 600;
}
.b3d-seek {
    position: absolute;
    bottom: 14px;
    left: 10px;
    right: 10px;
    background: rgba(20, 24, 30, 0.82);
    padding: 8px 12px;
    border-radius: 8px;
    display: flex;
    gap: 10px;
    align-items: center;
    z-index: 10;
    color: #eee;
}
.b3d-seek-input {
    flex: 1;
}
.b3d-time {
    font-size: 12px;
    min-width: 90px;
    text-align: right;
    color: #9fb3c8;
}
.b3d-hud {
    position: absolute;
    top: 10px;
    right: 10px;
    z-index: 10;
    background: rgba(15, 18, 24, 0.92);
    color: #ffffff;
    padding: 9px 13px;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    font-size: 13.5px;
    line-height: 1.75;
    font-family:
        system-ui,
        -apple-system,
        "Segoe UI",
        Roboto,
        "Helvetica Neue",
        Arial,
        sans-serif;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    text-rendering: optimizeLegibility;
    font-weight: 700;
    letter-spacing: 0.2px;
}
.b3d-hud span {
    color: #ffd54a;
    font-weight: 800;
}
.b3d-mode {
    color: #ffffff;
    font-weight: 800;
}
.b3d-mode--auto {
    color: #ff5b5b;
}
.b3d-file {
    margin-top: 4px;
    font-size: 12.5px;
    color: #c7d6e6;
}
.b3d-file span {
    color: #cfe8ff;
}
.b3d-empty {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 0 20%;
    text-align: center;
    color: #fff;
    font-size: 15px;
    line-height: 1.6;
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.7);
    background: rgba(10, 20, 35, 0.28);
    z-index: 30;
    pointer-events: none;
}
</style>
