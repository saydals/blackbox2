<template>
    <div class="fft-panel">
        <!-- View Header & Controls (ported from vibanalyse FftSpectrumView) -->
        <div class="fft-header">
            <div class="fft-title">
                <span class="fft-title-icon"><UIcon name="i-lucide-activity" class="size-4" /></span>
                <span class="fft-title-text">FFT Vibration Frequency Spectrum</span>
                <span class="fft-title-field">{{ gyroSourceLabel.value === 'raw' ? 'gyroRAW' : 'gyroADC' }}</span>
            </div>

            <div class="fft-controls">
                <!-- Axis toggles -->
                <div class="fft-seg">
                    <button class="fft-chip" :class="{ 'is-on': showRoll, 'roll': showRoll }" @click="showRoll = !showRoll">
                        <span class="dot dot-roll"></span>Roll
                    </button>
                    <button class="fft-chip" :class="{ 'is-on': showPitch, 'pitch': showPitch }" @click="showPitch = !showPitch">
                        <span class="dot dot-pitch"></span>Pitch
                    </button>
                    <button class="fft-chip" :class="{ 'is-on': showYaw, 'yaw': showYaw }" @click="showYaw = !showYaw">
                        <span class="dot dot-yaw"></span>Yaw
                    </button>
                </div>

                <!-- Data source toggle: Raw / Filtered gyro — left of the Mark button -->
                <button
                    class="fft-chip"
                    :class="{ 'is-on': activeGyroSource === 'raw' }"
                    :title="
                        (activeGyroSource === 'raw'
                            ? 'Analysis data: Raw Gyro — gyroRAW (before the gyro filters)'
                            : 'Analysis data: Filtered Gyro — gyroADC (after the gyro filters)') +
                        gyroSourceWarning.value
                    "
                    @click="toggleGyroSource"
                >
                    {{ gyroSourceLabel.value }}
                </button>

                <!-- Peak markers toggle -->
                <button
                    class="fft-chip"
                    :class="{ 'is-on': showPeakMarkers }"
                    title="Toggle all peak frequency markers (up to 9) on/off"
                    @click="showPeakMarkers = !showPeakMarkers"
                >
                    Mark
                </button>

                <!-- Y-axis preset -->
                <div class="fft-field" title="Set the Y-axis subdivision step based on the vibration magnitude">
                    <span>Y-axis</span>
                    <select v-model="yScalePreset" class="fft-select">
                        <option value="auto">Auto ({{ yAxisStep }}°)</option>
                        <option value="0.01">0.01°</option>
                        <option value="0.02">0.02°</option>
                        <option value="0.05">0.05°</option>
                        <option value="0.2">0.2°</option>
                        <option value="0.5">0.5°</option>
                        <option value="1.0">1.0°</option>
                        <option value="2.0">2.0°</option>
                        <option value="5.0">5.0°</option>
                    </select>
                </div>

                <!-- Head speed RPM -->
                <div class="fft-field" :title="rpmSourceTip">
                    <span>Head speed</span>
                    <input
                        v-model="headSpeedInput"
                        class="fft-input"
                        type="text"
                        inputmode="numeric"
                        @change="onHeadSpeedChange"
                    />
                    <span>RPM</span>
                    <span v-if="rpmBadge" class="fft-badge" :class="rpmBadge.cls">{{ rpmBadge.text }}</span>
                </div>

                <!-- Max frequency range -->
                <div class="fft-field">
                    <select v-model.number="maxFreqRange" class="fft-select">
                        <option :value="250">250Hz</option>
                        <option :value="500">500Hz</option>
                        <option :value="1000">1000Hz</option>
                    </select>
                </div>

                <!-- Skip Hz -->
                <div class="fft-field" title="Sets the X-axis zero point (start frequency). Raise it to hide excessive low-frequency vibration below 25Hz.">
                    <span>Skip Hz</span>
                    <select v-model.number="skipHz" class="fft-select">
                        <option v-for="v in 11" :key="(v - 1) * 5" :value="(v - 1) * 5">{{ (v - 1) * 5 }}Hz</option>
                    </select>
                </div>
            </div>
        </div>

        <!-- Main Canvas Area -->
        <div ref="containerRef" class="fft-canvas-wrap">
            <canvas ref="canvasRef" class="fft-canvas" @pointermove="onPointerMove" @pointerleave="onPointerLeave" />

            <!-- Analysis unavailable notice (e.g. selected window < 30s) -->
            <div v-if="analysisNotice" class="fft-notice">
                <UIcon name="i-lucide-shield-alert" class="size-8" />
                <p>{{ analysisNotice }}</p>
            </div>

            <!-- Interactive Tooltip Card -->
            <div
                v-if="hoverInfo"
                class="fft-tooltip"
                :style="{
                    left: tooltipLeft,
                    top: '15px',
                }"
            >
                <div class="fft-tooltip-head">
                    <span class="fft-tooltip-freq">{{ hoverInfo.freq }} Hz</span>
                    <span class="fft-tooltip-rpm">~{{ Math.round(hoverInfo.freq * 60) }} RPM</span>
                </div>
                <span v-if="hoverInfo.nearestHarmonic" class="fft-tooltip-harmonic">🎯 {{ hoverInfo.nearestHarmonic }}</span>
                <div class="fft-tooltip-grid">
                    <div v-if="showRoll" class="v-roll"><span>R:</span>{{ hoverInfo.rollVal }}°/s</div>
                    <div v-if="showPitch" class="v-pitch"><span>P:</span>{{ hoverInfo.pitchVal }}°/s</div>
                    <div v-if="showYaw" class="v-yaw"><span>Y:</span>{{ hoverInfo.yawVal }}°/s</div>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>
/*
 * FFT Vibration Frequency Spectrum — ported from /home/betaflight/vibanalyse
 * (FftSpectrumView.tsx). The vibanalyse header parsing, sample .bbl files and
 * its own timeline are deliberately NOT ported: samples come from the flight
 * log already open in this viewer, and the log's own in/out marks select the
 * analyzed window (auto-centered when opened — see App.vue).
 */
import { ref, computed, watch, onMounted, onBeforeUnmount } from "vue";
import { useLogStore } from "../stores/log.js";
import { usePlaybackStore } from "../stores/playback.js";
import { useAppStore } from "../stores/app.js";
import { computeGyroFft } from "../vib_fft.js";
import { estimateRpmFromGyro, logHeadSpeedOverSelection } from "../vib_rpm.js";

const logStore = useLogStore();
const playbackStore = usePlaybackStore();
const appStore = useAppStore();

const canvasRef = ref(null);
const containerRef = ref(null);

// View state (vibanalyse defaults)
const showRoll = ref(true);
const showPitch = ref(true);
const showYaw = ref(true);
const showPeakMarkers = ref(true);
const yScalePreset = ref("auto");
const maxFreqRange = ref(250);
const skipHz = ref(25);

const headSpeedInput = ref(String(appStore.fftHeadSpeedRpm ?? 2300));
const fftResult = ref(null);
const analysisNotice = ref(null);
const hoverInfo = ref(null);
// Where the current head-speed value came from: "log" (eRPM field averaged over
// the selection), "estimate" (gyro STFT estimator), "manual" (user typed it) or
// "auto" before the first resolution pass.
const rpmSource = ref("auto");
const rpmBusy = ref(false);

const tooltipLeft = computed(() => {
    const el = containerRef.value;
    if (!el || !hoverInfo.value) return "15px";
    return `${Math.min(hoverInfo.value.xPx + 15, el.clientWidth - 190)}px`;
});

function onHeadSpeedChange() {
    const digits = headSpeedInput.value.replace(/[^0-9]/g, "").slice(0, 5);
    const val = digits === "" ? 0 : Math.max(0, Math.min(10000, parseInt(digits, 10)));
    headSpeedInput.value = String(val);
    appStore.fftHeadSpeedRpm = val;
    // A manual edit takes precedence — stop auto-updating from log/estimate
    rpmSource.value = "manual";
}

function toggleGyroSource() {
    gyroSource.value = activeGyroSource.value === 'raw' ? 'filtered' : 'raw';
}

// Small chip next to the head-speed input telling where the value came from
const rpmBadge = computed(() => {
    switch (rpmSource.value) {
        case "log":
            return { text: "LOG", cls: "badge-log" };
        case "estimate":
            return { text: rpmBusy.value ? "…" : "EST", cls: "badge-est" };
        case "unavailable":
            return { text: "N/A", cls: "badge-na" };
        default:
            return null;
    }
});

const rpmSourceTip = computed(() => {
    switch (rpmSource.value) {
        case "log":
            return "Head speed read from the log's own RPM record (headspeed / eRPM[0]) over the selected window — typing a value overrides it";
        case "estimate":
            return "Head speed estimated from the roll/pitch gyro spectrum (this log has no RPM record) — typing a value overrides it";
        case "unavailable":
            return "No RPM record in this log and the gyro sample rate is too low for the 20~80Hz estimator band — enter the head speed manually";
        default:
            return "Entering the head speed RPM also updates the harmonic marker frequencies";
    }
});

const mainRpm = computed(() => appStore.fftHeadSpeedRpm ?? 0);
const main1P = computed(() => (mainRpm.value > 0 ? mainRpm.value / 60 : 0));
const main2P = computed(() => main1P.value * 2);
const tail1P = computed(() => main1P.value * 4.45); // vibanalyse default tailGearRatio
const motor1P = computed(() => main1P.value * 10.0);
const bladeCount = 2;

// ---- Gyro data source: Filtered (gyroADC, after filters) vs Raw (gyroRAW, before filters) ----
// The user can toggle between them; if the chosen one is not logged we fall back automatically.
const gyroSource = ref<'filtered' | 'raw'>('filtered');
const gyroSourceAvailable = computed(() => {
    const log = logStore.flightLog;
    if (!log) return { filtered: false, raw: false };
    return {
        filtered: log.getMainFieldIndexByName('gyroADC[0]') !== undefined,
        raw: log.getMainFieldIndexByName('gyroRAW[0]') !== undefined,
    };
});
// Effective source — falls back to whichever is available when the chosen one is missing.
const activeGyroSource = computed(() => {
    if (gyroSourceAvailable.value[gyroSource.value]) return gyroSource.value;
    return gyroSourceAvailable.value.filtered ? 'filtered' : gyroSourceAvailable.value.raw ? 'raw' : 'filtered';
});
const gyroSourceLabel = computed(() => activeGyroSource.value === 'raw' ? 'Raw' : 'Filtered');
const gyroSourceWarning = computed(() => gyroSourceAvailable.value[gyroSource.value] ? '' : ' ⚠ Not logged in this log');

// ---- FFT calculation over the currently selected in/out window ----

function selectionSeconds() {
    const log = logStore.flightLog;
    if (!log) return { start: 0, end: 0 };

    const startMark = playbackStore.videoExportInTime;
    const endMark = playbackStore.videoExportOutTime;

    if (Number.isFinite(startMark) && Number.isFinite(endMark) && endMark > startMark) {
        return { start: startMark / 1e6, end: endMark / 1e6 };
    }

    return { start: log.getMinTime() / 1e6, end: log.getMaxTime() / 1e6 };
}

function recalculate() {
    const log = logStore.flightLog;
    if (!log) {
        fftResult.value = null;
        analysisNotice.value = "Open a blackbox log to analyze vibrations.";
        return;
    }

    const { start, end } = selectionSeconds();

    // Field lookup — gyroADC (filtered) or gyroRAW (raw), chosen by the user toggle.
    const sourceName = activeGyroSource.value;
    const fieldName = sourceName === 'raw' ? 'gyroRAW' : 'gyroADC';
    const gyroIdx = [0, 1, 2].map((i) => log.getMainFieldIndexByName(`${fieldName}[${i}]`));
    if (gyroIdx.some((i) => i === undefined)) {
        fftResult.value = null;
        analysisNotice.value = `${
            sourceName === 'raw' ? 'Raw Gyro (gyroRAW)' : 'Filtered Gyro (gyroADC)'
        } is not logged in this log, so it cannot be analyzed.`;
        return;
    }
    const blackboxRate = log.getBlackboxRate() || log.getActualLogRate();
    if (!blackboxRate || blackboxRate <= 0) {
        fftResult.value = null;
        analysisNotice.value = "Log sample rate could not be determined.";
        return;
    }

    // Collect samples in [start, end] (seconds → microseconds), raw → °/s
    const startUs = start * 1e6;
    const endUs = end * 1e6;
    const chunks = log.getChunksInTimeRange(startUs, endUs);

    let frameCount = 0;
    for (const chunk of chunks) {
        frameCount += chunk.frames.length;
    }

    if (frameCount < 1024) {
        fftResult.value = null;
        analysisNotice.value = `Not enough samples (${frameCount}) in the selected window for a reliable FFT.`;
        return;
    }

    const roll = new Float32Array(frameCount);
    const pitch = new Float32Array(frameCount);
    const yaw = new Float32Array(frameCount);

    // Same conversion as FlightLog.gyroRawToDegreesPerSecond
    const gyroScale = (log.getSysConfig().gyroScale * 1000000) / (Math.PI / 180);

    let n = 0;
    for (const chunk of chunks) {
        for (const frame of chunk.frames) {
            roll[n] = frame[gyroIdx[0]] * gyroScale;
            pitch[n] = frame[gyroIdx[1]] * gyroScale;
            yaw[n] = frame[gyroIdx[2]] * gyroScale;
            n++;
        }
    }

    // Frame time base (seconds) — needed by the RPM estimator for resampling
    const timeIdx = log.getMainFieldIndexByName("time") ?? 1; // 1 = FLIGHT_LOG_FIELD_INDEX_TIME
    const frameTimeSec = new Float32Array(frameCount);
    n = 0;
    for (const chunk of chunks) {
        for (const frame of chunk.frames) {
            frameTimeSec[n++] = frame[timeIdx] / 1e6;
        }
    }

    try {
        fftResult.value = computeGyroFft(roll, pitch, yaw, blackboxRate, 1024);
        analysisNotice.value = null;
    } catch (e) {
        fftResult.value = null;
        analysisNotice.value = `FFT analysis failed: ${e?.message ?? e}`;
        return;
    }

    resolveHeadSpeed(log, roll, pitch, frameTimeSec, blackboxRate, startUs, endUs);
}

/**
 * Head-speed resolution: the log's own RPM record (headspeed / eRPM)
 * wins — read from the narrow window around the current playback
 * position (the red timeline bar) so it reflects where the user is
 * looking. Without a log RPM record the gyro-STFT estimator
 * (vibanalyse rpmEstimator) runs over the selected analysis window.
 * A manual value set by the user is never overwritten.
 */
function resolveHeadSpeed(log, roll, pitch, frameTimeSec, blackboxRate, _startUs, _endUs) {
    if (rpmSource.value === "manual") {
        return;
    }

    // 1) Log RPM record (headspeed / eRPM[0]) at the red timeline
    // bar position (±1 s window so the nearest recorded value wins).
    const nowUs = logStore.currentBlackboxTime;
    const logRpm = logHeadSpeedOverSelection(log, nowUs - 1e6, nowUs + 1e6);
    if (Number.isFinite(logRpm) && logRpm > 0) {
        appStore.fftHeadSpeedRpm = Math.round(logRpm);
        headSpeedInput.value = String(Math.round(logRpm));
        rpmSource.value = "log";
        return;
    }

    // 2) Gyro STFT estimate — for logs without an RPM sensor
    rpmBusy.value = true;
    try {
        const estimated = estimateRpmFromGyro(roll, pitch, frameTimeSec, blackboxRate);
        let sum = 0;
        let count = 0;
        for (const v of estimated) {
            if (Number.isFinite(v) && v > 0) {
                sum += v;
                count++;
            }
        }
        if (count > 0) {
            const rpm = Math.round(sum / count);
            appStore.fftHeadSpeedRpm = rpm;
            headSpeedInput.value = String(rpm);
            rpmSource.value = "estimate";
        } else {
            // Nothing worked (e.g. a 50Hz log whose Nyquist is below the 20~80Hz
            // estimator band) — keep the current value and say where it stands.
            rpmSource.value = "unavailable";
        }
    } finally {
        rpmBusy.value = false;
    }
}

// ---- Peak detection (vibanalyse: harmonic-anchored, up to 9 markers) ----

const detectedPeaks = computed(() => {
    const list = [];
    const fft = fftResult.value;
    if (!fft) return list;

    const limitIdx = Math.min(
        fft.frequencies.length,
        Math.floor((maxFreqRange.value / (fft.sampleRate / 2)) * fft.frequencies.length),
    );

    const channels = [
        { name: "Roll", data: fft.roll, color: "#38bdf8", bg: "#0284c7", active: showRoll.value },
        { name: "Pitch", data: fft.pitch, color: "#f59e0b", bg: "#d97706", active: showPitch.value },
        { name: "Yaw", data: fft.yaw, color: "#10b981", bg: "#059669", active: showYaw.value },
    ];

    const targets = [];
    if (main1P.value > 0) {
        targets.push({ freq: main1P.value, tol: 4.5 });
        targets.push({ freq: main2P.value, tol: 7.0 });
        targets.push({ freq: tail1P.value, tol: 14.0 });
    }

    const peakNear = (data, center, tol) => {
        let best = null;
        for (let i = 2; i < limitIdx - 1; i++) {
            const f = fft.frequencies[i];
            if (f < Math.max(skipHz.value, 15) || f > maxFreqRange.value) continue;
            if (Math.abs(f - center) > tol) continue;
            const val = data[i];
            if (val > data[i - 1] && val > data[i + 1]) {
                if (!best || val > best.amp) best = { freq: f, amp: val };
            }
        }
        if (!best) {
            for (let i = 2; i < limitIdx; i++) {
                const f = fft.frequencies[i];
                if (f < Math.max(skipHz.value, 15) || f > maxFreqRange.value) continue;
                if (Math.abs(f - center) > tol) continue;
                const val = data[i];
                if (!best || val > best.amp) best = { freq: f, amp: val };
            }
        }
        if (!best || best.amp < 0.04) return null;
        return best;
    };

    channels.forEach((ch) => {
        if (!ch.active) return;
        targets.forEach((target) => {
            if (target.freq < Math.max(skipHz.value, 15) || target.freq > maxFreqRange.value) return;
            const found = peakNear(ch.data, target.freq, target.tol);
            if (!found) return;
            list.push({
                axis: ch.name,
                freq: Math.round(found.freq * 10) / 10,
                amp: Math.round(found.amp * 100) / 100,
                color: ch.color,
                bg: ch.bg,
            });
        });
    });

    // De-duplicate: same axis + nearly same frequency (keep strongest)
    const deduped = [];
    list
        .sort((a, b) => b.amp - a.amp)
        .forEach((p) => {
            if (!deduped.some((q) => q.axis === p.axis && Math.abs(q.freq - p.freq) < 8)) {
                deduped.push(p);
            }
        });

    return deduped.slice(0, 9);
});

const globalMaxPeak = computed(() => detectedPeaks.value[0] || null);

// Max observed amplitude across the visible frequency band (Y-axis autoscale input)
const maxObservedAmp = computed(() => {
    const fft = fftResult.value;
    if (!fft) return 0;

    let max = 0;
    const channels = [];
    if (showRoll.value) channels.push(fft.roll);
    if (showPitch.value) channels.push(fft.pitch);
    if (showYaw.value) channels.push(fft.yaw);

    for (const data of channels) {
        for (let i = 1; i < fft.frequencies.length; i++) {
            const f = fft.frequencies[i];
            if (f < skipHz.value) continue;
            if (f > maxFreqRange.value) break;
            if (data[i] > max) max = data[i];
        }
    }
    return max;
});

// Adaptive Y-axis configuration (vibanalyse logic): peaks appear at 90% height in auto mode
const yAxisConfig = computed(() => {
    let step = 0.2;
    let maxAmp = 1.0;

    if (yScalePreset.value !== "auto") {
        step = parseFloat(yScalePreset.value);
        maxAmp = Math.max(step * 3, Math.ceil(maxObservedAmp.value / 0.9 / step) * step);
    } else {
        const a = maxObservedAmp.value;
        if (a <= 0.1) {
            step = 0.02;
            maxAmp = Math.max(0.06, Math.ceil(a / 0.9 / 0.02) * 0.02);
        } else if (a <= 0.35) {
            step = 0.05;
            maxAmp = Math.max(0.15, Math.ceil(a / 0.9 / 0.05) * 0.05);
        } else if (a <= 1.1) {
            step = 0.1;
            maxAmp = Math.max(0.3, Math.ceil(a / 0.9 / 0.1) * 0.1);
        } else if (a <= 2.4) {
            step = 0.2;
            maxAmp = Math.max(0.6, Math.ceil(a / 0.9 / 0.2) * 0.2);
        } else if (a <= 6.0) {
            step = 0.5;
            maxAmp = Math.max(1.5, Math.ceil(a / 0.9 / 0.5) * 0.5);
        } else if (a <= 14.0) {
            step = 1.0;
            maxAmp = Math.max(3.0, Math.ceil(a / 0.9 / 1.0) * 1.0);
        } else if (a <= 35.0) {
            step = 2.0;
            maxAmp = Math.max(8.0, Math.ceil(a / 0.9 / 2.0) * 2.0);
        } else {
            step = 5.0;
            maxAmp = Math.max(15.0, Math.ceil(a / 0.9 / 5.0) * 5.0);
        }
    }

    const ticks = [];
    const numSteps = Math.round(maxAmp / step);
    const decimals = step < 0.1 ? 2 : step < 1 ? 1 : 0;
    for (let i = 0; i <= numSteps; i++) {
        ticks.push(+(i * step).toFixed(decimals));
    }
    const tickStride = Math.max(1, Math.ceil(numSteps / 40));

    return { step, maxAmp, ticks, decimals, numSteps, tickStride };
});

const yAxisStep = computed(() => yAxisConfig.value.step);

// ---- Canvas rendering (vibanalyse draw logic) ----

function render() {
    const canvas = canvasRef.value;
    const container = containerRef.value;
    if (!canvas || !container) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Size the canvas EXACTLY to the container (the graph-area slot) —
    // requirement: height/width must match precisely.
    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));

    if (canvas.width !== Math.floor(width * dpr) || canvas.height !== Math.floor(height * dpr)) {
        canvas.width = Math.floor(width * dpr);
        canvas.height = Math.floor(height * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const isDark = appStore.darkThemeEnabled;

    const padLeft = 52;
    const padRight = 30;
    const padTop = 32;
    const padBottom = 32;
    const plotW = width - padLeft - padRight;
    const plotH = height - padTop - padBottom;

    // Clear background
    ctx.fillStyle = isDark ? "#090d16" : "#f8fafc";
    ctx.fillRect(0, 0, width, height);

    const fft = fftResult.value;

    // Grid Lines & X-Axis (Frequency)
    ctx.lineWidth = 1;
    ctx.strokeStyle = isDark ? "#1e293b" : "#e2e8f0";
    ctx.fillStyle = isDark ? "#64748b" : "#475569";
    ctx.font = "11px sans-serif";
    ctx.textAlign = "center";

    if (fft) {
        const freqSpan = Math.max(1, maxFreqRange.value - skipHz.value);
        const freqToX = (f) => padLeft + ((f - skipHz.value) / freqSpan) * plotW;

        const freqStep = maxFreqRange.value <= 250 ? 25 : maxFreqRange.value <= 500 ? 50 : 100;
        // Draw the skip point (X-axis start) as the origin
        const originX = freqToX(skipHz.value);
        ctx.beginPath();
        ctx.moveTo(originX, padTop);
        ctx.lineTo(originX, padTop + plotH);
        ctx.stroke();
        ctx.fillText(`${skipHz.value}Hz`, originX, padTop + plotH + 18);

        // Other ticks at integer multiples of the step after skipHz
        let startTick = Math.ceil(skipHz.value / freqStep) * freqStep;
        if (startTick === skipHz.value) startTick += freqStep;
        for (let f = startTick; f <= maxFreqRange.value; f += freqStep) {
            const x = freqToX(f);
            ctx.beginPath();
            ctx.moveTo(x, padTop);
            ctx.lineTo(x, padTop + plotH);
            ctx.stroke();

            ctx.fillText(`${f} Hz`, x, padTop + plotH + 18);
        }

        // Y-Axis
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";
        yAxisConfig.value.ticks.forEach((yVal, idx) => {
            if (idx % yAxisConfig.value.tickStride !== 0 && idx !== yAxisConfig.value.ticks.length - 1) return;
            const y = padTop + plotH - (yVal / yAxisConfig.value.maxAmp) * plotH;

            ctx.beginPath();
            ctx.moveTo(padLeft, y);
            ctx.lineTo(padLeft + plotW, y);
            ctx.stroke();

            const label = `${yVal.toFixed(yAxisConfig.value.decimals)}°/s`;
            ctx.fillText(label, padLeft - 6, y);
        });

        // Max Peak Horizontal Guideline
        const gap = globalMaxPeak.value;
        if (gap && gap.amp > 0.05) {
            const yPeak = padTop + plotH - Math.min(plotH, (gap.amp / yAxisConfig.value.maxAmp) * plotH);
            ctx.save();
            ctx.setLineDash([3, 3]);
            ctx.strokeStyle = isDark ? "rgba(56, 189, 248, 0.45)" : "rgba(2, 132, 199, 0.45)";
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.moveTo(padLeft, yPeak);
            ctx.lineTo(padLeft + plotW, yPeak);
            ctx.stroke();
            ctx.restore();

            // Right-edge tag for maximum peak
            ctx.fillStyle = isDark ? "rgba(15, 23, 42, 0.9)" : "rgba(241, 245, 249, 0.9)";
            const tagText = `▲ ${gap.amp.toFixed(2)}°/s`;
            const tagW = ctx.measureText(tagText).width + 8;
            ctx.beginPath();
            ctx.roundRect(padLeft + plotW - tagW, yPeak - 9, tagW, 16, 3);
            ctx.fill();
            ctx.fillStyle = isDark ? "#38bdf8" : "#0284c7";
            ctx.font = "bold 9px monospace";
            ctx.textAlign = "center";
            ctx.fillText(tagText, padLeft + plotW - tagW / 2, yPeak + 1);
        }

        // Harmonics Vertical Markers
        if (main1P.value > 0) {
            const markers = [
                { freq: main1P.value, label: "1P Main", color: "#38bdf8", bg: "#0369a1" },
                { freq: main2P.value, label: `${bladeCount}P Blade`, color: "#a855f7", bg: "#7e22ce" },
                { freq: tail1P.value, label: "Tail 1P", color: "#f59e0b", bg: "#b45309" },
                { freq: motor1P.value, label: "Motor", color: "#ec4899", bg: "#be185d" },
            ];

            markers.forEach(({ freq, label, color, bg }) => {
                if (freq >= skipHz.value && freq <= maxFreqRange.value) {
                    const x = freqToX(freq);

                    // Dotted harmonic line
                    ctx.save();
                    ctx.setLineDash([4, 4]);
                    ctx.strokeStyle = color;
                    ctx.lineWidth = 1.5;
                    ctx.beginPath();
                    ctx.moveTo(x, padTop);
                    ctx.lineTo(x, padTop + plotH);
                    ctx.stroke();
                    ctx.restore();

                    // Label pill at top
                    ctx.fillStyle = bg;
                    const txtW = ctx.measureText(label).width + 10;
                    ctx.beginPath();
                    ctx.roundRect(x - txtW / 2, padTop - 24, txtW, 16, 4);
                    ctx.fill();

                    ctx.fillStyle = "#ffffff";
                    ctx.textAlign = "center";
                    ctx.font = "bold 10px sans-serif";
                    ctx.fillText(label, x, padTop - 12);
                }
            });
        }

        drawSpectrumAndPeaks(ctx, { freqToX, padLeft, padTop, plotW, plotH });
    }

    // Hover Line & Marker
    if (hoverInfo.value && hoverInfo.value.xPx >= padLeft && hoverInfo.value.xPx <= padLeft + plotW) {
        ctx.save();
        ctx.strokeStyle = "#94a3b8";
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 2]);
        ctx.beginPath();
        ctx.moveTo(hoverInfo.value.xPx, padTop);
        ctx.lineTo(hoverInfo.value.xPx, padTop + plotH);
        ctx.stroke();
        ctx.restore();
    }
}

// Spectrum curves + on-canvas peak markers
function drawSpectrumAndPeaks(ctx, geo) {
    const fft = fftResult.value;
    if (!fft) return;

    const { freqToX, padLeft, padTop, plotW, plotH } = geo;

    const drawSpectrumLine = (data, color) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = 2.0;
        ctx.beginPath();

        const numPoints = fft.frequencies.length;
        let first = true;

        for (let i = 1; i < numPoints; i++) {
            const f = fft.frequencies[i];
            if (f < skipHz.value) continue; // Do not draw the band below skip Hz
            if (f > maxFreqRange.value) break;

            const val = data[i];
            const x = freqToX(f);
            const y = padTop + plotH - Math.min(plotH, (val / yAxisConfig.value.maxAmp) * plotH);

            if (first) {
                ctx.moveTo(x, y);
                first = false;
            } else {
                ctx.lineTo(x, y);
            }
        }
        ctx.stroke();
    };

    if (showRoll.value) drawSpectrumLine(fft.roll, "#38bdf8");
    if (showPitch.value) drawSpectrumLine(fft.pitch, "#f59e0b");
    if (showYaw.value) drawSpectrumLine(fft.yaw, "#10b981");

    drawPeakMarkers(ctx, { freqToX, padLeft, padTop, plotW, plotH });
}

// On-canvas vibration peak markers (vibanalyse: up to 9, collision-avoiding pills)
function drawPeakMarkers(ctx, geo) {
    if (!showPeakMarkers.value || detectedPeaks.value.length === 0) return;

    const { freqToX, padLeft, padTop, plotW, plotH } = geo;
    const placed = [];

    detectedPeaks.value.forEach((peak, rank) => {
        const x = freqToX(peak.freq);
        const y = padTop + plotH - Math.min(plotH, (peak.amp / yAxisConfig.value.maxAmp) * plotH);

        if (x < padLeft || x > padLeft + plotW) return;

        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, 6, 0, 2 * Math.PI);
        ctx.fillStyle = `${peak.color}44`;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(x, y, 3.5, 0, 2 * Math.PI);
        ctx.fillStyle = peak.color;
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = "#ffffff";
        ctx.stroke();

        // Callout pill tag
        const text = `${peak.freq}Hz(${peak.amp.toFixed(2)}°/s)`;
        ctx.font = "bold 10px sans-serif";
        const tw = ctx.measureText(text).width + 12;
        const pillX = Math.max(padLeft + 4, Math.min(padLeft + plotW - tw - 4, x - tw / 2));

        let calloutY = Math.max(padTop + 14, y - 26 - rank * 2);
        for (let attempt = 0; attempt < 6; attempt++) {
            const overlap = placed.some(
                (p) =>
                    Math.abs(pillX + tw / 2 - (p.x0 + p.x1) / 2) < (tw + (p.x1 - p.x0)) / 2 + 2 &&
                    Math.abs(calloutY - p.y) < 20,
            );
            if (!overlap) break;
            calloutY = Math.max(padTop + 14, calloutY - 20);
        }
        placed.push({ x0: pillX, x1: pillX + tw, y: calloutY });

        // Pin line up to callout
        ctx.beginPath();
        ctx.setLineDash([2, 2]);
        ctx.strokeStyle = peak.color;
        ctx.lineWidth = 1;
        ctx.moveTo(x, y - 4);
        ctx.lineTo(x, calloutY + 8);
        ctx.stroke();

        // Pointer triangle
        ctx.beginPath();
        ctx.moveTo(x - 4, y - 5);
        ctx.lineTo(x + 4, y - 5);
        ctx.lineTo(x, y - 1);
        ctx.closePath();
        ctx.fillStyle = peak.color;
        ctx.fill();

        ctx.fillStyle = peak.bg;
        ctx.beginPath();
        ctx.roundRect(pillX, calloutY - 9, tw, 18, 5);
        ctx.fill();

        ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.fillStyle = "#ffffff";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(text, pillX + tw / 2, calloutY);
        ctx.restore();
    });
}

// ---- Pointer handling ----

function onPointerMove(e) {
    const canvas = canvasRef.value;
    const fft = fftResult.value;
    if (!canvas || !fft) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;

    const padLeft = 52;
    const padRight = 30;
    const plotW = rect.width - padLeft - padRight;

    if (x < padLeft || x > padLeft + plotW) {
        hoverInfo.value = null;
        return;
    }

    const freqFrac = (x - padLeft) / plotW;
    const targetFreq = skipHz.value + freqFrac * (maxFreqRange.value - skipHz.value);

    const freqStep = fft.sampleRate / (fft.frequencies.length * 2);
    const binIdx = Math.max(0, Math.min(fft.frequencies.length - 1, Math.round(targetFreq / freqStep)));

    const actualFreq = fft.frequencies[binIdx];

    // Check nearest harmonic
    let nearestHarmonic;
    if (Math.abs(actualFreq - main1P.value) < 3) nearestHarmonic = "Main 1P (imbalance)";
    else if (Math.abs(actualFreq - main2P.value) < 4) nearestHarmonic = "Main 2P (blade passage)";
    else if (Math.abs(actualFreq - tail1P.value) < 6) nearestHarmonic = "Tail 1P (tail vibration)";
    else if (motor1P.value > 0 && Math.abs(actualFreq - motor1P.value) < 10) nearestHarmonic = "Motor rotational frequency";

    hoverInfo.value = {
        xPx: x,
        freq: Math.round(actualFreq * 10) / 10,
        rollVal: Math.round(fft.roll[binIdx] * 100) / 100,
        pitchVal: Math.round(fft.pitch[binIdx] * 100) / 100,
        yawVal: Math.round(fft.yaw[binIdx] * 100) / 100,
        nearestHarmonic,
    };
}

function onPointerLeave() {
    hoverInfo.value = null;
}

// ---- Resize observation (exact graph-area fit) & lifecycle ----

let resizeObserver = null;

onMounted(() => {
    resizeObserver = new ResizeObserver(() => render());
    if (containerRef.value) {
        resizeObserver.observe(containerRef.value);
    }
    render();
});

onBeforeUnmount(() => {
    if (resizeObserver) {
        resizeObserver.disconnect();
        resizeObserver = null;
    }
});

// Redraw when any display input changes
watch(
    [
        fftResult,
        maxFreqRange,
        skipHz,
        showRoll,
        showPitch,
        showYaw,
        hoverInfo,
        detectedPeaks,
        () => appStore.darkThemeEnabled,
        () => appStore.fftHeadSpeedRpm,
    ],
    () => render(),
);

// Recalculate when the analyzed window (in/out marks) or the log changes while open
watch(
    () => [logStore.flightLog, playbackStore.videoExportInTime, playbackStore.videoExportOutTime],
    () => recalculate(),
);
</script>

<style scoped>
.fft-panel {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px;
    background: var(--surface-0, #fff);
    z-index: 5;
}

.blackbox-viewer-root.dark .fft-panel {
    background: var(--surface-800, #101010);
}

.fft-header {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--border-color, #e5e5e5);
}

.fft-title {
    display: flex;
    align-items: center;
    gap: 8px;
}

.fft-title-icon {
    display: inline-flex;
    padding: 5px;
    border-radius: 8px;
    background: color-mix(in srgb, var(--text-secondary, #888) 10%, transparent);
    color: var(--text-secondary, #888);
}

.fft-title-text {
    font-size: 13px;
    font-weight: 600;
}

.fft-title-field {
    padding: 1px 5px;
    border-radius: 4px;
    border: 1px solid var(--border-color, #ccc);
    font-family: var(--font-mono, monospace);
    font-size: 10px;
    color: var(--text-secondary, #888);
}

.fft-controls {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    font-size: 12px;
}

.fft-seg {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 2px;
    border-radius: 8px;
    border: 1px solid var(--border-color, #e5e5e5);
}

.fft-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 8px;
    border-radius: 6px;
    border: 1px solid var(--border-color, #ccc);
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    color: var(--text-secondary, #888);
    background: var(--surface-50, #f5f5f5);
    transition: background 0.15s, color 0.15s;
}

.fft-chip:hover {
    color: var(--text-primary, #333);
    background: var(--surface-100, #eee);
}

.fft-chip.is-on {
    border-color: var(--border-color, #ccc);
    background: var(--surface-100, #f5f5f5);
    color: var(--text-primary, #222);
}

.dot {
    width: 8px;
    height: 8px;
    border-radius: 9999px;
}

.dot-roll {
    background: #38bdf8;
}

.dot-pitch {
    background: #f59e0b;
}

.dot-yaw {
    background: #10b981;
}

.fft-field {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 3px 8px;
    border-radius: 8px;
    border: 1px solid var(--border-color, #e5e5e5);
}

.fft-select,
.fft-input {
    border-radius: 4px;
    border: 1px solid var(--border-color, #ccc);
    background: transparent;
    color: var(--text-primary, #222);
    font-family: var(--font-mono, monospace);
    font-size: 12px;
    padding: 1px 4px;
    outline: none;
}

.fft-input {
    width: 56px;
    text-align: right;
}

/* Head-speed origin badge: LOG = read from the log's eRPM record, EST = gyro estimator */
.fft-badge {
    font-family: var(--font-mono, monospace);
    font-size: 9px;
    font-weight: 700;
    line-height: 1;
    padding: 2px 4px;
    border-radius: 4px;
    letter-spacing: 0.04em;
}

.badge-log {
    color: #059669;
    background: rgba(16, 185, 129, 0.14);
    border: 1px solid rgba(16, 185, 129, 0.35);
}

.badge-est {
    color: #0284c7;
    background: rgba(56, 189, 248, 0.14);
    border: 1px solid rgba(56, 189, 248, 0.35);
}

/* No RPM record + sample rate too low for the estimator */
.badge-na {
    color: var(--text-secondary, #888);
    background: color-mix(in srgb, var(--text-secondary, #888) 12%, transparent);
    border: 1px solid var(--border-color, #ccc);
}

.fft-canvas-wrap {
    position: relative;
    flex: 1 1 auto;
    min-height: 0;
    border-radius: 10px;
    overflow: hidden;
    border: 1px solid var(--border-color, #e5e5e5);
    cursor: crosshair;
}

.fft-canvas {
    display: block;
    width: 100%;
    height: 100%;
    touch-action: none;
}

.fft-notice {
    position: absolute;
    inset: 0;
    z-index: 30;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    background: color-mix(in srgb, var(--surface-0, #fff) 80%, transparent);
    color: var(--text-primary, #333);
    font-size: 13px;
    font-weight: 600;
    text-align: center;
    padding: 0 16px;
}

.fft-tooltip {
    position: absolute;
    z-index: 20;
    min-width: 170px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 8px 12px;
    border-radius: 10px;
    border: 1px solid var(--border-color, #ccc);
    background: var(--surface-0, #fff);
    box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.2);
    font-size: 12px;
    pointer-events: none;
}

.fft-tooltip-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-bottom: 4px;
    border-bottom: 1px solid var(--border-color, #eee);
}

.fft-tooltip-freq {
    font-family: var(--font-mono, monospace);
    font-weight: 700;
    color: #06b6d4;
}

.fft-tooltip-rpm {
    font-family: var(--font-mono, monospace);
    font-size: 10px;
    color: var(--text-secondary, #888);
}

.fft-tooltip-harmonic {
    padding: 2px 6px;
    border-radius: 4px;
    border: 1px solid var(--border-color, #ccc);
    font-size: 11px;
    font-weight: 500;
}

.fft-tooltip-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 4px;
    padding-top: 2px;
    font-family: var(--font-mono, monospace);
    font-size: 11px;
}

.fft-tooltip-grid span {
    display: block;
    font-size: 9px;
    color: var(--text-secondary, #888);
}

.v-roll {
    color: #06b6d4;
}

.v-pitch {
    color: #f59e0b;
}

.v-yaw {
    color: #10b981;
}
</style>
