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
                :title="
                    hasGpsFlag
                        ? 'This log has GPS; estimation replay is unnecessary'
                        : estWithoutGps
                            ? 'Estimation replay without GPS — can switch back to GPS replay in settings'
                            : 'Replay without GPS: path estimated from collective + attitude'
                "
                @click="onWithoutGps"
            >
                {{ "No GPS" }}
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
import {
    FreshMorningEnvironment,
    HELIPAD_MARK_HEIGHT,
    HELIPAD_SURFACE_Y,
} from "../three/freshMorningEnvironment.js";
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
// v4: runs when the log carries no GPS fixes OR when the user deliberately
// forces it ("No GPS" button → estimate switch) to compare the estimated
// path against the logged GPS path — sample.bbl verification workflow.
// ---------------------------------------------------------------------------
const EST_KEY = "blackbox3dEstimatorSettings4"; // v4: quadratic home bias (3 m/s²), maneuver damping, vertical limits
// v4 default parameters — tuning basis: sample.bbl GPS path matching (100% within 15m,
// mean error 6.3m — v3 defaults had mean 26.7m, max 79m drift).
const EST_DEFAULTS = {
    verticalSource: "baroSmooth", // "none" = collective estimate, "baro" = raw, "baroSmooth" = smoothed
    baroSmoothing: 0.8, // 0..0.95 EMA strength (baroSmooth only)
    autoHover: true, // calibrate the hover point from the log's collective median
    hoverCollective: 0, // manual hover point (autoHover=false only)
    fullPitchAccel: 10, // m/s² extra accel at 100% collective
    drag: 0.2, // linear velocity damping (1/s) — bounds drift (v3: 0.15)
    startAltitude: 3, // m above ground at t=0 (no GPS, collective mode)
    // --- v3: heli-like motion refinement ---
    neutralBand: 10, // collective units around the hover point that count as neutral
    axisNeutralBand: 8, // deg of tilt below which no horizontal translation is driven
    gravityRelief: 0.7, // 0..1 — vertical accel cancelled at the start of the hang
    floatTime: 2, // s the craft "hangs" after collective returns to neutral
    reversePause: 0.6, // s of extra horizontal damping after a cyclic reversal
    // --- v4: containment + acro ---
    homeBias: 3, // m/s² max acceleration toward home (v3: 1, linear ramp)
    homeSoftRadius: 0.15, // fraction of HOME_LIMIT (150m) where the bias starts — 22.5m (v3: 0.6)
    maneuverDamp: 1, // 0..1 — damping of horizontal motion during 3D maneuvers (flip/roll)
};
// EST_DEFAULTS is also defined inside the ESTIMATOR-CORE block (tests extract it from
// the .vue file for verification, so defaults and algorithm must be extracted together to prevent drift).
function loadEstimatorSettings() {
    const stored = configStorageGet(EST_KEY);
    return { ...EST_DEFAULTS, ...(stored[EST_KEY] || {}) };
}
const estSettings = ref(loadEstimatorSettings());
const settingsOpen = ref(false);
// Reactive mirrors of non-reactive build state for the template.
const hasGpsFlag = ref(false);
const hasBaro = ref(false);
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
let morningEnvironment = null;
let airplane = null;
let modelGeneration = 0;
let propellers = [];
let propAngle = 0;
let lastTs = 0;
let environmentElapsed = 0;
// Graph-panel parity (craft_heli_3d.js rotateTo): heli.glb nose points +Z while
// yaw=0 expects -Z, so a constant 180° (PI) trim is needed at load.
// The "Heading 90" button adds manual trim on top via onYaw().
let yawOffset = Math.PI;
let camTargetY = 0.4;
let initialFrameYaw = 0; // 첫 프레임의 yaw를 저장하여 모델 로드 시 초기 회전 적용
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
const WORLD_SCALE = 1.0;
const S = WORLD_SCALE;
// Camera START position: the (0, 5, 11) home point rotated 180° about the
// heli's yaw axis (Y) — X and Z negated — so the opening view looks at the
// craft from the opposite side. Used by init(), applyFixedView() and the
// onResetView() fallback.
const CAM_HOME = new THREE.Vector3(0, 5 * S, -11 * S);

// GPS motion exaggeration (user request): the craft's logged displacement —
// x/z and altitude — is rendered 1.5× larger so flights read clearly without
// resizing the world. Visual ONLY: HUD numbers, A/B/waypoint markers, the
// airfield and heli attitude keep their true scale, and the estimator/physics
// still work in raw metres. Constant lifts (groundLift, pad rest offset) are
// not motion, so they are left untouched — the heli still sits on the pad.
const GPS_MOTION_SCALE = 1.5;

// ---------------------------------------------------------------------------
// Airfield model sizing (see three/freshMorningEnvironment.js)
//
// heli.glb measures 179.1 raw units nose→tail and its origin sits 21.5 units
// above the lowest point (the skids). On the rf3d airfield the helicopter is
// scaled so its total length equals half the height of the "H" painted on the
// 15 m grass helipad, and it is lifted so the skids rest on the pad surface.
// ---------------------------------------------------------------------------
const HELI_RAW_LENGTH = 179.1;
const HELI_RAW_BOTTOM = 21.5;
const HELI_SCALE = HELIPAD_MARK_HEIGHT / 2 / HELI_RAW_LENGTH; // 4.5 m long
const HELI_GROUND_OFFSET = HELI_RAW_BOTTOM * HELI_SCALE + HELIPAD_SURFACE_Y;

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
// Without-GPS fence/estimator constants now live in the estimator core block
// below (ESTIMATOR-CORE-START … END) so tests can extract and verify them.

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
        // heli.glb 179.1 units nose→tail → HELI_SCALE gives it the target
        // 4.5 m length (half the "H" painted on the helipad).
        airplane.scale.setScalar(HELI_SCALE);
        airplane.traverse((o) => {
            if (o.isMesh) o.castShadow = true;
        });
        airplane.position.y = HELI_GROUND_OFFSET * S;
        // 첫 프레임의 yaw에 맞춰 초기 회전을 설정하여 applyFrame에서 180도 점프 방지
        airplane.rotation.y = -initialFrameYaw + yawOffset;
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
//
// v4 — the estimator core below is a self-contained pure block delimited by
// ESTIMATOR-CORE-START/END markers. Tests (tests/zz_final_verify.test.js)
// extract this exact region out of the .vue file and run it against the
// sample.bbl GPS ground truth, so the shipped code is literally the verified
// code (no copy drift).
// ---------------------------------------------------------------------------
function validGpsRow(row) {
    return row.lat != null && row.lon != null && Number.isFinite(row.lat) && Number.isFinite(row.lon);
}
// ESTIMATOR-CORE-START
// v4 default parameters are defined in EST_DEFAULTS.
// Tuning basis: sample.bbl GPS path matching (100% within 15m,
// mean error 6.3m — v3 defaults had mean 26.7m, max 79m drift).
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
function interpolateGpsAt(fixes, t) {
    if (!fixes || !fixes.length) return null;
    if (t <= fixes[0].t) return fixes[0];
    if (t >= fixes[fixes.length - 1].t) return fixes[fixes.length - 1];
    let lo = 0,
        hi = fixes.length - 1;
    while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (fixes[mid].t < t) lo = mid;
        else hi = mid;
    }
    const a = fixes[lo],
        b = fixes[hi];
    const f = (t - a.t) / (b.t - a.t || 1);
    return {
        lat: a.lat + (b.lat - a.lat) * f,
        lon: a.lon + (b.lon - a.lon) * f,
        gpsAlt: (a.gpsAlt ?? 0) + ((b.gpsAlt ?? 0) - (a.gpsAlt ?? 0)) * f,
    };
}

// --- v4 vertical safety & containment (fixed spec) ---
// (2) Altitude ceiling: rise acceleration gradually damped from 15 m AGL → fully clamped at 50 m.
// (3) Ground cushion: descent speed gradually damped below 5 m → 0 m hard floor.
// (1)/(4) 150 m hard fence maintained + quadratic-weighted home bias (max 3 m/s²) starting from
//     the soft radius (default 22.5 m) for a natural return to home.
const EST_HZ = 50; // estimator integration frequency (same as playback frame rate)
const EST_STEP_US = 1e6 / EST_HZ;
const EST_G = 9.80665; // m/s²
const HOME_LIMIT = 150; // m — hard fence from helipad center
const ALT_SOFT_START = 15; // m AGL — rise damping start
const ALT_HARD_LIMIT = 50; // m AGL — hard ceiling
const GROUND_CUSHION_ALT = 5; // m AGL — ground cushion start
const GROUND_CUSHION_KEEP = 0.35; // residual descent ratio at z→0 (0=instant stop, 1=no damping)
const MANEUVER_TILT_START = 30; // deg — maneuver damping start (flips/rolls)
const MANEUVER_TILT_FULL = 50; // deg — maneuver damping saturation
const MANEUVER_ACCEL_SUPPRESS = 0.85; // horizontal accel suppression during maneuvers (0..1)
const MANEUVER_EXTRA_DRAG = 3.5; // 1/s — extra horizontal damping during maneuvers
const THRUST_LPF_ALPHA = 0.5; // thrust vector 1st-order lag (rotor response) — EMA coeff per 50Hz frame
const FLOAT_VZ_TRIGGER = 0.4; // m/s — hang trigger descent/rise speed
const REVERSE_SPEED_TRIGGER = 1; // m/s — settle trigger ground speed
const SETTLE_DRAG_MAX = 6; // 1/s — peak extra damping right after reversal
const EST_DEG = Math.PI / 180;

// Without-GPS estimator v4 — integrates flight path from collective + attitude.
// Pure function (no THREE/Vue/store dependencies) — tests extract and verify it.
// Returns: { frames: [{t,x,z,alt,roll,pitch,yaw,throttle}], hoverColl, match }
//   - frames.x = East, frames.z = -North (same coordinate as GPS branch)
//   - match: error statistics when GPS playback is forced to be ignored
function buildEstimatedFrames(sourceRows, s, opts = {}) {
    const matchFixes = opts.matchFixes || null; // fix list for comparison when GPS is forced to be ignored
    const home = opts.home || null; // { lat, lon } (deg) — reference point for match calculation
    const hasBaro = !!opts.hasBaro;
    const startTime = sourceRows[0]?.t ?? 0;
    const endTime = sourceRows[sourceRows.length - 1]?.t ?? startTime;

    // Auto-calibrate the hover point: RC collective fields are stick-centred
    // (≈ -100..100 with hover near the log median, NOT 0..100 with hover at
    // 50). Using the raw median makes "more collective than usual → climb"
    // hold for any FC's units.
    let hoverColl = s.hoverCollective;
    if (s.autoHover) {
        const cols = sourceRows
            .map((r) => r.collective)
            .filter((v) => v != null && Number.isFinite(v))
            .sort((a, b) => a - b);
        if (cols.length) hoverColl = cols[Math.floor(cols.length / 2)];
    }

    const est = { x: 0, y: 0, z: s.startAltitude, vx: 0, vy: 0, vz: 0 }; // x=East, y=North, z=AGL
    const baroMode = s.verticalSource !== "none" && hasBaro;
    const baroAlpha = Math.max(0.05, 1 - Math.min(0.95, Math.max(0, s.baroSmoothing)));
    let baroBase = null;
    let baroSmooth = null;
    let prevBaroAlt = null; // v4: reference for cushion/ceiling conversion of displayed altitude
    const estDt = EST_STEP_US / 1e6;
    // --- v3 hang/settle state (per build) ---
    let floatT = 0;
    let settleT = 0;
    let collNeutralPrev = true;
    let floatAltHold = null;
    // --- v4: thrust vector/collective 1st-order lag state (rotor response model) ---
    let uxF = 0, uyF = 0, collF = 0;
    // --- v4: match statistics ---
    let mSum = 0, mMax = 0, mCov15 = 0, mCov10 = 0, mN = 0;
    const softRadius = Math.min(HOME_LIMIT - 1, Math.max(0, s.homeSoftRadius) * HOME_LIMIT);
    const maneuverScale = Math.min(1, Math.max(0, s.maneuverDamp ?? 1));
    const mnStart = Math.sin(MANEUVER_TILT_START * EST_DEG);
    const mnFull = Math.sin(MANEUVER_TILT_FULL * EST_DEG);
    const out = [];

    for (let t = startTime; t <= endTime + 0.5; t += EST_STEP_US) {
        const row = interpolateRowsAt(sourceRows, Math.min(t, endTime));
        if (!row) continue;

        // --- Thrust from collective (body frame, up axis) ---
        // collective neutral band — within ±neutralBand of the hover point
        // the collective counts as neutral (pure hover thrust); a soft knee
        // keeps the thrust continuous at the band edge.
        const collDelta = (row.collective ?? 0) - hoverColl;
        const collEff = Math.sign(collDelta) * Math.max(0, Math.abs(collDelta) - Math.max(0, s.neutralBand));
        const aThrust = EST_G + collEff * 0.01 * s.fullPitchAccel;

        // --- Rotate body-up into the world (East, North, Up) via attitude ---
// v4 sign fix: RF attitude[2] is the compass bearing (0°=North, clockwise),
// so for the Rz in the (E,N,U) coordinate system we use -yaw, and since the
// RF roll sign is opposite to the thrust east component, we must use -roll
// to match the actual movement direction.
// (Verified with sample.bbl GPS path matching: mean error 26.7m → 6.3m)
        const roll = -row.roll, pitch = row.pitch, yaw = -row.yaw;
        const cP = Math.cos(roll);
        const sP = Math.sin(roll);
        const sT = Math.sin(pitch);
        const cY = Math.cos(yaw);
        const sY = Math.sin(yaw);
        const ux = cY * sT * cP + sY * sP;
        const uy = sY * sT * cP - cY * sP;
        // attitude neutral band — tilt inside axisNeutralBand (deg) drives no
        // horizontal translation (soft knee). The DISPLAYED attitude stays raw.
        const tiltMag = Math.hypot(ux, uy);
        const tiltNeutral = Math.sin(Math.max(0, s.axisNeutralBand) * EST_DEG);
        const tiltEff = Math.max(0, tiltMag - tiltNeutral);
        const uxT = tiltMag > 1e-9 ? (ux / tiltMag) * tiltEff : 0;
        const uyT = tiltMag > 1e-9 ? (uy / tiltMag) * tiltEff : 0;
        const uzT = Math.sqrt(Math.max(0, 1 - Math.min(1, tiltEff * tiltEff)));

// --- v4 rotor lag: smooth the thrust vector/collective with 1st-order lag ---
// The actual rotor responds with tens of ms delay to stick input, so instantaneous
// attitude jitter does not get directly integrated into position.
        uxF += (uxT - uxF) * THRUST_LPF_ALPHA;
        uyF += (uyT - uyF) * THRUST_LPF_ALPHA;
        collF += (collEff - collF) * THRUST_LPF_ALPHA;
        const aThrustL = EST_G + collF * 0.01 * s.fullPitchAccel;

        // v3: hang window — the collective just returned to neutral while the
        // craft was climbing/descending; decaying gravity relief bleeds the
        // vertical velocity to zero over floatTime seconds.
        const collNeutral = Math.abs(collDelta) <= Math.max(0, s.neutralBand);
        if (collNeutral && !collNeutralPrev && Math.abs(est.vz) > FLOAT_VZ_TRIGGER) {
            floatT = s.floatTime;
            floatAltHold = null;
        }
        collNeutralPrev = collNeutral;

        // v3: reversal settle — the rotor tilt turned against the current motion.
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

// --- v4 maneuver damping: in tilt ≥ 30° segments (flips/rolls etc.),
// the craft is modeled as spinning in place — horizontal acceleration is
// suppressed and strong damping is applied. Without this, large tilts during
// flips would be integrated as false thrust, sending the craft far out of
// the helipad (the main cause of v3 drift).
        let mnAccel = 0, mnDrag = 0;
        if (maneuverScale > 0 && tiltMag > mnStart) {
            const f = maneuverScale * Math.min(1, Math.max(0, (tiltMag - mnStart) / (mnFull - mnStart)));
            mnAccel = MANEUVER_ACCEL_SUPPRESS * f;
            mnDrag = MANEUVER_EXTRA_DRAG * f;
        }
        const hDrag = s.drag + settleDrag;

        // --- Net world accel = thrust - gravity - linear drag, integrate ---
        let az = aThrust * uzT - EST_G - s.drag * est.vz;
        if (floatT > 0) {
            const frac = floatT / Math.max(0.01, s.floatTime); // 1 → 0
            const relief = Math.min(1, s.gravityRelief) * frac;
            az *= 1 - relief;
            est.vz -= est.vz * Math.min(0.9, relief * 8 * estDt);
            floatT -= estDt;
        }
        // v4 soft ceiling: rise acceleration gradually damped from 15 m AGL.
        if (est.z > ALT_SOFT_START && az > 0) {
            az *= 1 - Math.min(1, (est.z - ALT_SOFT_START) / (ALT_HARD_LIMIT - ALT_SOFT_START));
        }
        const ax = (aThrustL * uxF - hDrag * est.vx) * (1 - mnAccel);
        const ay = (aThrustL * uyF - hDrag * est.vy) * (1 - mnAccel);
        est.vx += ax * estDt - mnDrag * est.vx * estDt;
        est.vy += ay * estDt - mnDrag * est.vy * estDt;
        est.vz += az * estDt;
        est.x += est.vx * estDt;
        est.y += est.vy * estDt;
        est.z += est.vz * estDt;

        // v4 ground cushion: descent speed gradually damped below 5 m.
        if (est.z < GROUND_CUSHION_ALT && est.vz < 0) {
            const cf = Math.max(0, Math.min(1, est.z / GROUND_CUSHION_ALT));
            est.vz *= GROUND_CUSHION_KEEP + (1 - GROUND_CUSHION_KEEP) * cf;
        }
        // 0 m hard floor / 50 m hard ceiling.
        if (est.z < 0) {
            est.z = 0;
            if (est.vz < 0) est.vz = 0;
        }
        if (est.z > ALT_HARD_LIMIT) {
            est.z = ALT_HARD_LIMIT;
            if (est.vz > 0) est.vz = 0;
        }

// --- v4 drift control (enhanced): home bias with quadratic weighting starts
// from the soft radius (default 22.5 m), max acceleration raised to 3 m/s².
// Strong near the fence, gentle inside — returns naturally to helipad center
// (v3: linear w, max 1 m/s²). ---
        const dist = Math.hypot(est.x, est.y);
        if (dist > softRadius && dist > 1e-6) {
            const w = Math.min(1, (dist - softRadius) / Math.max(1, HOME_LIMIT - softRadius));
            const bias = Math.max(0, s.homeBias) * w * w; // quadratic ramp (v3: linear w)
            est.vx -= (est.x / dist) * bias * estDt;
            est.vy -= (est.y / dist) * bias * estDt;
        }

// --- Field fence (150 m, maintained): when touching the boundary, only
// the outward velocity component is removed so the craft slides along
// the fence. ---
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

        let frameAlt = est.z;
        // --- Barometer vertical override (preferred when available) ---
        if (baroMode && row.baro != null) {
            if (baroBase == null) baroBase = row.baro;
            baroSmooth = baroSmooth == null ? row.baro : baroSmooth + baroAlpha * (row.baro - baroSmooth);
            const baroVal = s.verticalSource === "baro" ? row.baro : baroSmooth;
            let baroAlt = (baroVal - baroBase) / 100; // RF altitude cm → m
            // v3: the hang stays visible in baro modes — blend the displayed
            // altitude toward the value captured when the collective returned
            // to neutral, then release it as the relief decays.
            if (floatT > 0) {
                const frac = floatT / Math.max(0.01, s.floatTime);
                const relief = Math.min(1, s.gravityRelief) * frac;
                if (floatAltHold == null) floatAltHold = baroAlt;
                baroAlt = floatAltHold + (baroAlt - floatAltHold) * (1 - relief);
            } else {
                floatAltHold = null;
            }
// v4: apply the same vertical safety limits to the displayed altitude —
// descent amounts below 5 m are reduced by the ground cushion ratio,
// rise amounts above 15 m are reduced by the soft ceiling ratio, then clamped to [0, 50].
            if (prevBaroAlt != null) {
                const d = baroAlt - prevBaroAlt;
                if (d < 0 && prevBaroAlt > 0 && prevBaroAlt < GROUND_CUSHION_ALT) {
                    const cf = Math.max(0, Math.min(1, prevBaroAlt / GROUND_CUSHION_ALT));
                    baroAlt = prevBaroAlt + d * (GROUND_CUSHION_KEEP + (1 - GROUND_CUSHION_KEEP) * cf);
                } else if (d > 0 && prevBaroAlt > ALT_SOFT_START) {
                    const cf = Math.min(1, (prevBaroAlt - ALT_SOFT_START) / (ALT_HARD_LIMIT - ALT_SOFT_START));
                    baroAlt = prevBaroAlt + d * (1 - cf);
                }
            }
            prevBaroAlt = baroAlt;
            frameAlt = Math.min(ALT_HARD_LIMIT, Math.max(0, baroAlt));
        }

// --- v4: GPS forced-ignore verification statistics — when replaying a log
// that has GPS with GPS ignored, measure how close the estimated path
// is to the actual GPS path. ---
        if (matchFixes && matchFixes.length && home) {
            const gps = interpolateGpsAt(matchFixes, Math.min(t, endTime));
            const dLat = (gps.lat / 1e7 - home.lat) * 111320;
            const dLon = (gps.lon / 1e7 - home.lon) * 111320 * Math.cos((home.lat * Math.PI) / 180);
            const err = Math.hypot(est.x - dLon, est.y - dLat);
            mSum += err;
            if (err > mMax) mMax = err;
            if (err <= 15) mCov15++;
            if (err <= 10) mCov10++;
            mN++;
        }

        out.push({
            t: Math.min(t, endTime),
            x: est.x, // East
            z: -est.y, // scene z = -North (same as GPS branch)
            alt: frameAlt,
            roll: row.roll,
            pitch: row.pitch,
            yaw: row.yaw,
            throttle: row.throttle,
        });
    }
    return {
        frames: out,
        hoverColl,
        match: mN
            ? { n: mN, meanErr: mSum / mN, maxErr: mMax, cov15: mCov15 / mN, cov10: mCov10 / mN }
            : null,
    };
}
// ESTIMATOR-CORE-END
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

    // v4: the estimator runs when the log carries no GPS fixes.
    // The physics core lives in buildEstimatedFrames() above — see the
    // ESTIMATOR-CORE block for the thrust model, the sign conventions and the
    // vertical/containment safety limits.
    const useEstimator = !hasGps;
    estWithoutGps.value = useEstimator;
    hasGpsFlag.value = hasGps;
    hasBaro.value = sourceRows.some((r) => r.baro != null);
    const s = estSettings.value;
    if (useEstimator) {
        const res = buildEstimatedFrames(sourceRows, s, {
            hasBaro: hasBaro.value,
        });
        lastBuildHover = Math.round(res.hoverColl * 10) / 10;
        lastBuildEstimator = true;
        lastBuildBaroMode =
            s.verticalSource !== "none" && hasBaro.value ? (s.verticalSource === "baro" ? "raw" : "smoothed") : "off";
        frames = res.frames.map((f) => ({
            ...f,
            vx: 0,
            vz: 0,
            baroAltM: f.alt,
            gpsAltM: f.alt,
            aAlt: rawAbAt(f.t, iAAlt),
            bAlt: rawAbAt(f.t, iBAlt),
            mode: rawModeAt(f.t),
        }));
    } else {
        lastBuildHover = 0;
        lastBuildEstimator = false;
        lastBuildBaroMode = "";
        for (let t = startTime; t <= endTime + 0.5; t += PLAYBACK_STEP_US) {
            const row = interpolateRowsAt(sourceRows, Math.min(t, endTime));
            if (!row) continue;
            const gps = interpolateGpsAt(gpsFixes, Math.min(t, endTime));
            const lat = gps ? gps.lat / 1e7 : homeLat;
            const lon = gps ? gps.lon / 1e7 : homeLon;
            const dLat = (lat - homeLat) * 111320;
            const dLon = (lon - homeLon) * 111320 * Math.cos((homeLat * Math.PI) / 180);
            const frameX = dLon;
            const frameZ = -dLat;
            const frameAlt = (row.baro ?? 0) / 100;
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
// Apply the GPS trajectory (metres) directly — WORLD_SCALE=1.0 keeps original size.
// GPS_MOTION_SCALE: only displacement (movement) is rendered 1.5× larger; this is a render-only scale.
    airplane.position.x = fr.x * S * GPS_MOTION_SCALE;
    airplane.position.z = fr.z * S * GPS_MOTION_SCALE;
    // Logs can report a slightly negative altitude (baro drift, landing dip).
    // Clamp to 0 so neither the HUD readout nor the craft ever shows a
    // height below the ground — 3D view only, the raw log is untouched.
    const altRel = Math.max(0, fr.alt || 0);
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
        // GPS metres applied directly — WORLD_SCALE=1.0 keeps original size.
        // GPS_MOTION_SCALE: only the logged altitude displacement is 1.5×
        // (groundLift·HELI_GROUND_OFFSET are constant lifts, so they stay
        // untouched → the heli still sits on the pad at landing).
        airplane.position.y = altRel * S * GPS_MOTION_SCALE + groundLift * S + HELI_GROUND_OFFSET * S;
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

// ---------------------------------------------------------------------------
// Playback
// ---------------------------------------------------------------------------
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
        initialFrameYaw = frames[0]?.yaw ?? 0;
        const markerCount = buildMarkers(data);
        applyAirfieldAlignment();
        playT = startTime;
        if (seekRef.value) seekRef.value.value = 0;
        const fr = frameAt(playT);
        applyFrame(fr);
        let estDesc = `flight estimated from collective+attitude (hover≈${lastBuildHover}, baro: ${lastBuildBaroMode})`;
        status.value = `Loaded: ${frames.length} frames (${PLAYBACK_HZ}Hz), ${lastBuildEstimator ? estDesc : `GPS interpolated from ${gpsFixes.length} fixes`}${markerCount ? `, ${markerCount} markers` : ""}`;
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
// Fixed View: the observer is fixed on the ground (CAM_HOME), looking at the craft.
// The camera position does not move; only controls.target rotates to face the craft.
// When the craft moves away, it appears smaller — just like in reality.
// Zooming is only performed in Dynamic mode.
// Fixed View: the camera position stays in place, only the look-at direction
// rotates toward the craft. When the craft moves away, it appears smaller
// — matching real-world perspective. Zooming is only done in Dynamic mode.
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
// camera position is reset to CAM_HOME, but the user can still move it
// with the mouse — the animate loop tracks the view via lookAt after
// controls.update().
}
// Snap the chase camera onto the craft's current position (keeping the
// user's orbit offset). Used when scrubbing the timeline / resetting the
// view while paused, where the lerp-based playback chase doesn't run.
function snapCameraToCraft() {
    if (!camera || !controls || !airplane) return;
    if (viewMode.value === "fixed") {
        // Fixed viewpoint: camera position stays the same, only the look-at direction
// changes to face the craft.
        controls.target.copy(airplane.position);
        camTargetY = airplane.position.y;
        controls.update();
        camera.lookAt(airplane.position);
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
         // WORLD_SCALE applied: offsets are also 1/1 (25/55).
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
    const environmentDelta = Math.min(Math.max(dt, 0), 0.1);
    environmentElapsed += environmentDelta;

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
// Fixed viewpoint: the user can move the camera with the mouse.
// controls.target is set to the craft, and after update the view is
// tracked via lookAt.
                controls.target.copy(airplane.position);
            } else {
                const tx = airplane.position.x;
                const tz = airplane.position.z;
                let dy = airplane.position.y - camTargetY;
                if (Math.abs(dy) < 0.5 * S) dy = 0;
                const ty = camTargetY + dy * 0.01;
                camTargetY = ty;
                controls.target.lerp(new THREE.Vector3(tx, ty, tz), 0.25);
                controls.update();
            }
        }
        timeLabel.value = `${((playT - startTime) / 1e6).toFixed(1)}s`;
    }

    const thr = frames.length ? frameAt(playT)?.throttle || 0 : 0;
    updatePropellers(dt, thr);

    controls.update();
    if (viewMode.value === "fixed" && airplane) {
        camera.lookAt(airplane.position);
    }
    morningEnvironment?.update(environmentDelta, environmentElapsed);
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
    lastTs = 0;
    environmentElapsed = 0;
    scene = new THREE.Scene();

    const w = rootRef.value.clientWidth || 800;
    const h = rootRef.value.clientHeight || 600;
    camera = new THREE.PerspectiveCamera(55, w / h, 0.5, 50000);
    camera.position.copy(CAM_HOME);

    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.autoClear = true;
    rootRef.value.appendChild(renderer.domElement);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(0, 2 * S, 0);

    worldGroup = new THREE.Group();
    scene.add(worldGroup);
    morningEnvironment = new FreshMorningEnvironment(scene, worldGroup, camera);
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
    if (morningEnvironment) {
        morningEnvironment.dispose();
        morningEnvironment = null;
    }
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
    lastTs = 0;
    environmentElapsed = 0;
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
    background: #87ceeb;
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

/* Small-resolution HUD: scale to 70% while keeping the same top-right
 * anchor so the corner position does not move. Triggers when the viewport
 * is narrower than 840 px OR shorter than 500 px (landscape phones, etc.). */
@media (max-width: 840px), (max-height: 500px) {
    .b3d-hud {
        transform: scale(0.7);
        transform-origin: top right;
    }

    .b3d-file {
        transform: scale(0.7);
        transform-origin: top right;
    }
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
