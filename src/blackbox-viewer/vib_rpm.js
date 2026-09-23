/**
 * Gyro STFT based RPM estimation — ported from the vibanalyse project
 * (rpmEstimator.ts). Estimates the headspeed RPM over time from the
 * Roll/Pitch gyro STFT for logs WITHOUT an RPM (eRPM) sensor.
 *
 * Frequency-range rationale (kept from vibanalyse):
 * - Keep 20~80Hz: normal high-RPM helicopters reach 1P 70~80Hz (4200~4800RPM),
 *   and the harmonic product score eliminates 79.5Hz false detections.
 */

import { complexFft } from "./vib_fft.js";

export const STFT_WINDOW_SEC = 0.5;
export const STFT_STEP_SEC = 0.1;
export const STFT_FREQ_MIN_HZ = 20;
export const STFT_FREQ_MAX_HZ = 80;
export const STFT_SNR_THRESHOLD = 3;
/** Tolerance (Hz) for validating the 2P (blade passage) harmonic */
export const STFT_HARMONIC_TOL_HZ = 3;
/** Minimum power ratio of the 2P harmonic to a 1P candidate for it to be accepted as 1P */
export const STFT_HARMONIC_MIN_RATIO = 0.15;

export function nextPow2(n) {
    let p = 1;
    while (p < n) p <<= 1;
    return p;
}

function median(values) {
    if (values.length === 0) return NaN;
    const s = [...values].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 === 1 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function interpolateNaN(rpm) {
    const n = rpm.length;
    if (n === 0) return;
    let firstValid = -1;
    for (let i = 0; i < n; i++) {
        if (Number.isFinite(rpm[i])) {
            firstValid = i;
            break;
        }
    }
    if (firstValid === -1) return;
    for (let i = 0; i < firstValid; i++) rpm[i] = rpm[firstValid];
    let prevIdx = firstValid;
    for (let i = firstValid + 1; i < n; i++) {
        if (Number.isFinite(rpm[i])) {
            if (i - prevIdx > 1) {
                const v0 = rpm[prevIdx];
                const v1 = rpm[i];
                for (let j = prevIdx + 1; j < i; j++) {
                    const t = (j - prevIdx) / (i - prevIdx);
                    rpm[j] = v0 + (v1 - v0) * t;
                }
            }
            prevIdx = i;
        }
    }
    for (let i = prevIdx + 1; i < n; i++) rpm[i] = rpm[prevIdx];
}

export function smoothRpm(rpm, medianWindow = 5, avgWindow = 3) {
    const n = rpm.length;
    if (n === 0) return [];
    // Pass 1: median filter — replace each sample with the neighbour median
    const half = Math.floor(medianWindow / 2);
    const med = new Array(n);
    for (let i = 0; i < n; i++) {
        const vals = [];
        for (let j = i - half; j <= i + half; j++) {
            if (j >= 0 && j < n && Number.isFinite(rpm[j])) vals.push(rpm[j]);
        }
        med[i] = vals.length > 0 ? median(vals) : rpm[i];
    }
    // Pass 2: moving average
    const h2 = Math.floor(avgWindow / 2);
    const avg = new Array(n);
    for (let i = 0; i < n; i++) {
        let s = 0;
        let c = 0;
        for (let j = i - h2; j <= i + h2; j++) {
            if (j >= 0 && j < n && Number.isFinite(med[j])) {
                s += med[j];
                c++;
            }
        }
        avg[i] = c > 0 ? s / c : med[i];
    }
    // Pass 3: Hampel pass — removes runs of spikes (≤4 samples) that leaked into
    // the moving average. Gradual throttle changes (< 250RPM within the window) preserved.
    const h3 = 4;
    const out = new Array(n);
    for (let i = 0; i < n; i++) {
        const vals = [];
        for (let j = i - h3; j <= i + h3; j++) {
            if (j >= 0 && j < n && Number.isFinite(avg[j])) vals.push(avg[j]);
        }
        const m = vals.length > 0 ? median(vals) : avg[i];
        const v = avg[i];
        if (Number.isFinite(v) && Number.isFinite(m) && Math.abs(v - m) > Math.max(250, m * 0.08)) {
            out[i] = m;
        } else {
            out[i] = v;
        }
    }
    return out;
}

/** Power lookup at a frequency: max within ±tolBins bins */
function makePowerAtHz(powers, sampleRate, fftSize, tolBins) {
    return (freqHz) => {
        const kc = Math.round((freqHz * fftSize) / sampleRate);
        let mx = 0;
        for (let j = kc - tolBins; j <= kc + tolBins; j++) {
            if (j >= 0 && j < powers.length && powers[j] > mx) mx = powers[j];
        }
        return mx;
    };
}

/**
 * Score candidates within a single spectrum (harmonic product + SNR gate + 2P skip).
 * Returns a Map keyed by bin index → { rpm, peakHz, peakPower, harmonicPower, multScore, addScore }.
 */
export function scoreSpectrumPeaks(
    powers,
    sampleRate,
    fftSize,
    freqMin = STFT_FREQ_MIN_HZ,
    freqMax = STFT_FREQ_MAX_HZ,
    snrThreshold = STFT_SNR_THRESHOLD,
) {
    const nyquist = sampleRate / 2;
    const kMin = Math.max(1, Math.floor((freqMin * fftSize) / sampleRate));
    const kMax = Math.min(Math.floor(powers.length) - 1, Math.ceil((freqMax * fftSize) / sampleRate));
    const binHz = sampleRate / fftSize;
    const picks = new Map();
    if (kMax <= kMin || !(binHz > 0)) return picks;

    // Average power over the range (used by the SNR gate)
    let sum = 0;
    for (let k = kMin; k <= kMax; k++) sum += powers[k];
    const meanPower = sum / Math.max(1, kMax - kMin + 1);
    if (!(meanPower > 0)) return picks;

    const tolBins = Math.max(2, Math.round(STFT_HARMONIC_TOL_HZ / binHz));
    const powerAtHz = makePowerAtHz(powers, sampleRate, fftSize, tolBins);

    const hPowerOf = (f1) => {
        const f2 = f1 * 2;
        return f2 < nyquist ? powerAtHz(f2) : 0;
    };

    const scorePeak = (k, p) => {
        let refinedK = k;
        const a = powers[k - 1];
        const b = powers[k];
        const c = powers[k + 1];
        const d = a - 2 * b + c;
        if (Math.abs(d) > 1e-12) {
            const delta = (0.5 * (a - c)) / d;
            if (Math.abs(delta) <= 1) refinedK = k + delta;
        }
        const f1 = (refinedK * sampleRate) / fftSize;
        if (!(f1 >= freqMin && f1 <= freqMax)) return;
        const hPower = hPowerOf(f1);
        const multScore = p * hPower;
        const hFloor = meanPower * STFT_HARMONIC_MIN_RATIO;
        const addScore = p + Math.max(0, hPower - hFloor) * 0.5;
        picks.set(k, { rpm: f1 * 60, peakHz: f1, peakPower: p, harmonicPower: hPower, multScore, addScore });
    };

    for (let k = kMin + 1; k <= kMax - 1; k++) {
        const p = powers[k];
        if (!(p > powers[k - 1]) || !(p >= powers[k + 1])) continue;

        // SNR gate: strong peaks always pass. Even a weak peak is accepted as a 1P
        // candidate when the doubled frequency carries above-average energy.
        if (!(p >= meanPower * snrThreshold)) {
            // Absolute floor: block the noise floor (below average × 0.5 is always dropped)
            if (!(p >= meanPower * 0.5)) continue;
            const f = (k * sampleRate) / fftSize;
            const fDouble = f * 2;
            if (fDouble >= freqMin && fDouble <= nyquist) {
                // The doubled-frequency test relies on the presence of a local peak
                const kd = Math.round((fDouble * fftSize) / sampleRate);
                let dblPeak = false;
                for (let j = kd - tolBins; j <= kd + tolBins; j++) {
                    if (j > kMin && j < powers.length - 1 && powers[j] > powers[j - 1] && powers[j] >= powers[j + 1]) {
                        if (powers[j] >= meanPower * 0.3) {
                            dblPeak = true;
                            break;
                        }
                    }
                }
                if (!dblPeak) continue;
            } else continue;
        }

        // When a strong peak f has above-average energy at f/2, treat f as 2P and skip it.
        const f = (k * sampleRate) / fftSize;
        const fSub = f / 2;
        if (fSub >= freqMin) {
            const kcSub = Math.round((fSub * fftSize) / sampleRate);
            let subMax = 0;
            for (let j = kcSub - 1; j <= kcSub + 1; j++) {
                if (j >= 0 && j < powers.length && powers[j] > subMax) subMax = powers[j];
            }
            if (subMax >= meanPower * 1.5) {
                const f2 = f * 2;
                const hMax = f2 < nyquist ? powerAtHz(f2) : 0;
                // Only skip f as 2P when f/2 is a local peak. Gentle slopes are never skipped.
                const kcS = kcSub;
                const isSubPeak =
                    kcS > 0 &&
                    kcS < powers.length - 1 &&
                    powers[kcS] >= powers[kcS - 1] &&
                    powers[kcS] > powers[kcS + 1];
                if (isSubPeak && (f2 > nyquist * 0.9 || hMax < p * 0.1)) continue;
            }
        }

        scorePeak(k, p);
    }

    return picks;
}

/** Select the RPM from a single spectrum (candidate with the highest harmonic product score). */
export function pickRpmFromSpectrum(
    powers,
    sampleRate,
    fftSize,
    freqMin = STFT_FREQ_MIN_HZ,
    freqMax = STFT_FREQ_MAX_HZ,
    snrThreshold = STFT_SNR_THRESHOLD,
) {
    const empty = { rpm: NaN, peakHz: NaN, peakPower: 0, harmonicPower: 0 };
    const picks = scoreSpectrumPeaks(powers, sampleRate, fftSize, freqMin, freqMax, snrThreshold);
    let bestScore = -1;
    let bestAdd = -1;
    let best = empty;
    for (const pk of picks.values()) {
        if (bestScore < 0 || pk.multScore > bestScore * 1.01) {
            bestScore = pk.multScore;
            bestAdd = pk.addScore;
            best = { rpm: pk.rpm, peakHz: pk.peakHz, peakPower: pk.peakPower, harmonicPower: pk.harmonicPower };
        } else if (bestScore > 0 && Math.abs(pk.multScore - bestScore) <= bestScore * 0.01 && pk.addScore > bestAdd) {
            bestAdd = pk.addScore;
            best = { rpm: pk.rpm, peakHz: pk.peakHz, peakPower: pk.peakPower, harmonicPower: pk.harmonicPower };
        }
    }
    return best;
}

/**
 * Roll+Pitch combined harmonic score: combinedScore(f) = rollMult(f) + pitchMult(f).
 * A structural resonance on one axis alone drops out. If neither axis has a candidate
 * the result is NaN; if only one does, it falls back to that axis.
 */
export function pickRpmCombined(
    rollPowers,
    pitchPowers,
    sampleRate,
    fftSize,
    freqMin = STFT_FREQ_MIN_HZ,
    freqMax = STFT_FREQ_MAX_HZ,
    snrThreshold = STFT_SNR_THRESHOLD,
) {
    const empty = { rpm: NaN, peakHz: NaN, peakPower: 0, harmonicPower: 0 };
    const rPicks = scoreSpectrumPeaks(rollPowers, sampleRate, fftSize, freqMin, freqMax, snrThreshold);
    const pPicks = scoreSpectrumPeaks(pitchPowers, sampleRate, fftSize, freqMin, freqMax, snrThreshold);
    const findNear = (m, k) => {
        if (m.has(k)) return m.get(k);
        if (m.has(k - 1)) return m.get(k - 1);
        if (m.has(k + 1)) return m.get(k + 1);
        return undefined;
    };
    const keys = new Set([...rPicks.keys(), ...pPicks.keys()]);
    let bestScore = -1;
    let bestAdd = -1;
    let best = empty;
    for (const k of keys) {
        const r = findNear(rPicks, k);
        const p = findNear(pPicks, k);
        if (!r || !p) continue;
        const mult = r.multScore + p.multScore;
        const add = r.addScore + p.addScore;
        const rep = r.multScore >= p.multScore ? r : p;
        if (bestScore < 0 || mult > bestScore * 1.01) {
            bestScore = mult;
            bestAdd = add;
            best = { rpm: rep.rpm, peakHz: rep.peakHz, peakPower: rep.peakPower, harmonicPower: rep.harmonicPower };
        } else if (bestScore > 0 && Math.abs(mult - bestScore) <= bestScore * 0.01 && add > bestAdd) {
            bestAdd = add;
            best = { rpm: rep.rpm, peakHz: rep.peakHz, peakPower: rep.peakPower, harmonicPower: rep.harmonicPower };
        }
    }
    if (!Number.isFinite(best.rpm)) {
        const rBest = pickRpmFromSpectrum(rollPowers, sampleRate, fftSize, freqMin, freqMax, snrThreshold);
        const pBest = pickRpmFromSpectrum(pitchPowers, sampleRate, fftSize, freqMin, freqMax, snrThreshold);
        const rOk = Number.isFinite(rBest.rpm);
        const pOk = Number.isFinite(pBest.rpm);
        if (rOk && !pOk) return rBest;
        if (pOk && !rOk) return pBest;
        if (rOk && pOk) {
            const rScore = rBest.peakPower * Math.max(rBest.harmonicPower, 1e-12);
            const pScore = pBest.peakPower * Math.max(pBest.harmonicPower, 1e-12);
            return rScore >= pScore ? rBest : pBest;
        }
    }
    return best;
}

/**
 * Estimate the RPM time series with a sliding-window STFT (synchronous).
 * DC removal + Hanning window on Roll and Pitch separately (keeps both axes
 * instead of winner-takes-all by RMS).
 */
export function estimateRpmTimeSeries(gyroRoll, gyroPitch, sampleRate, opts = {}) {
    const windowSec = opts.windowSec ?? STFT_WINDOW_SEC;
    const stepSec = opts.stepSec ?? STFT_STEP_SEC;
    const freqMin = opts.freqMinHz ?? STFT_FREQ_MIN_HZ;
    const freqMax = opts.freqMaxHz ?? STFT_FREQ_MAX_HZ;
    const snrThr = opts.snrThreshold ?? STFT_SNR_THRESHOLD;
    const total = Math.min(gyroRoll.length, gyroPitch.length);
    const windowSize = Math.max(64, Math.floor(windowSec * sampleRate));
    const stepSize = Math.max(1, Math.floor(stepSec * sampleRate));
    const fftSize = nextPow2(windowSize);
    const timeMs = [];
    const rpm = [];
    // The 20~80Hz search band must fit below Nyquist — a 50Hz log (Nyquist 25Hz)
    // can never represent it, and any candidate found there would be meaningless.
    if (total < windowSize || sampleRate <= 0 || sampleRate / 2 <= freqMax) return { timeMs, rpm };

    const real = new Float32Array(fftSize);
    const imag = new Float32Array(fftSize);
    const segR = new Float32Array(windowSize);
    const segP = new Float32Array(windowSize);

    for (let start = 0; start + windowSize <= total; start += stepSize) {
        let meanR = 0;
        let meanP = 0;
        for (let i = 0; i < windowSize; i++) {
            meanR += gyroRoll[start + i];
            meanP += gyroPitch[start + i];
        }
        meanR /= windowSize;
        meanP /= windowSize;
        const denom = windowSize - 1;
        for (let i = 0; i < windowSize; i++) {
            const w = 0.5 * (1 - Math.cos((2 * Math.PI * i) / denom));
            segR[i] = (gyroRoll[start + i] - meanR) * w;
            segP[i] = (gyroPitch[start + i] - meanP) * w;
        }
        const halfN = fftSize / 2;
        let pickRpm = NaN;
        try {
            real.fill(0);
            imag.fill(0);
            real.set(segR);
            complexFft(real, imag);
            const rollPowers = new Float32Array(halfN);
            for (let k = 0; k < halfN; k++) rollPowers[k] = real[k] * real[k] + imag[k] * imag[k];
            real.fill(0);
            imag.fill(0);
            real.set(segP);
            complexFft(real, imag);
            const pitchPowers = new Float32Array(halfN);
            for (let k = 0; k < halfN; k++) pitchPowers[k] = real[k] * real[k] + imag[k] * imag[k];
            pickRpm = pickRpmCombined(rollPowers, pitchPowers, sampleRate, fftSize, freqMin, freqMax, snrThr).rpm;
        } catch {
            pickRpm = NaN;
        }
        timeMs.push(((start + windowSize / 2) / sampleRate) * 1000);
        rpm.push(pickRpm);
    }
    interpolateNaN(rpm);
    return { timeMs, rpm };
}

/** Resample an RPM series onto the log frame time base (linear interpolation). */
export function resampleRpmToFrameTime(series, frameTimeSec) {
    const n = frameTimeSec.length;
    const out = new Float32Array(n);
    const m = series.timeMs.length;
    if (m === 0) return out;
    if (m === 1) {
        out.fill(series.rpm[0]);
        return out;
    }

    let j = 0;
    for (let i = 0; i < n; i++) {
        const tMs = frameTimeSec[i] * 1000;
        while (j < m - 2 && series.timeMs[j + 1] < tMs) j++;
        const t0 = series.timeMs[j];
        const t1 = series.timeMs[j + 1];
        const v0 = series.rpm[j];
        const v1 = series.rpm[j + 1];
        if (!Number.isFinite(v0) || !Number.isFinite(v1) || t1 <= t0) {
            out[i] = Number.isFinite(v0) ? v0 : v1;
        } else if (tMs <= t0) out[i] = v0;
        else if (tMs >= t1) {
            if (j >= m - 2) out[i] = tMs >= series.timeMs[m - 1] ? series.rpm[m - 1] : v1;
            else out[i] = v0 + ((v1 - v0) * (tMs - t0)) / (t1 - t0);
        } else out[i] = v0 + ((v1 - v0) * (tMs - t0)) / (t1 - t0);
    }
    return out;
}

/**
 * Pick the best rotor-RPM field in the log along with its raw → RPM conversion.
 * Rotorflight 2 logs record `headspeed` already in RPM (FlightLogFieldPresenter:
 * "headspeed" → `${value.toFixed(0)} rpm (${(value / 60).toFixed(1)} Hz)`).
 * ESC/eRPM logs record electrical RPM / 100 in `eRPM[0]`, converted with the
 * configured motor pole count exactly like the field presenter:
 * (value * 200) / motor_poles.
 * Returns null when the log has neither field.
 */
export function resolveLogRpmField(log) {
    const headSpeedIdx = log.getMainFieldIndexByName("headspeed");
    if (headSpeedIdx !== undefined) {
        return { fieldName: "headspeed", index: headSpeedIdx, convert: (v) => v };
    }

    const erpmIdx = log.getMainFieldIndexByName("eRPM[0]");
    if (erpmIdx === undefined) return null;

    const motorPoles = Number(log.getSysConfig()?.motor_poles);
    if (!Number.isFinite(motorPoles) || motorPoles <= 0) return null;

    return { fieldName: "eRPM[0]", index: erpmIdx, convert: (v) => (v * 200) / motorPoles };
}

/** Average the head speed recorded in the log over [startUs, endUs], in RPM. NaN when unavailable. */
export function logHeadSpeedOverSelection(log, startUs, endUs) {
    const source = resolveLogRpmField(log);
    if (!source) return NaN;

    const chunks = log.getChunksInTimeRange(startUs, endUs);
    let sum = 0;
    let count = 0;
    for (const chunk of chunks) {
        for (const frame of chunk.frames) {
            const raw = frame[source.index];
            if (!Number.isFinite(raw) || raw <= 0) continue;
            const rpm = source.convert(raw);
            if (rpm > 100 && rpm < 12000) {
                sum += rpm;
                count++;
            }
        }
    }
    return count > 0 ? sum / count : NaN;
}

/** Median of the finite values only (NaN when every value is invalid). */
function medianOfFinite(values) {
    const f = values.filter((v) => Number.isFinite(v));
    if (f.length === 0) return NaN;
    return median(f);
}

/**
 * Full estimation pipeline for the FFT panel: STFT → validity gate → smoothing
 * → clamp → frame resample. Returns a Float32Array aligned to the given frame
 * times (seconds), or an empty array when no valid estimate exists.
 *
 * Mirrors vibanalyse's estimateRpmForLogAsync (synchronous variant).
 */
export function estimateRpmFromGyro(gyroRoll, gyroPitch, frameTimeSec, sampleRate) {
    const total = Math.min(gyroRoll.length, gyroPitch.length);
    if (total === 0 || frameTimeSec.length === 0) return new Float32Array(0);

    const series = estimateRpmTimeSeries(gyroRoll, gyroPitch, sampleRate);
    if (series.rpm.length === 0) return new Float32Array(0);

    const valid = series.rpm.filter((v) => Number.isFinite(v) && v >= 1200 && v <= 6000);
    if (valid.length < Math.max(3, series.rpm.length * 0.2)) {
        if (valid.length > 0) return new Float32Array(frameTimeSec.length).fill(medianOfFinite(valid));
        return new Float32Array(0);
    }

    const smoothed = smoothRpm(series.rpm, 5, 3);
    const clamped = smoothed.map((v) => (Number.isFinite(v) ? Math.min(6000, Math.max(1200, v)) : v));

    const resampled = resampleRpmToFrameTime({ timeMs: series.timeMs, rpm: clamped }, frameTimeSec);
    if (resampled.length !== frameTimeSec.length) {
        const out = new Float32Array(frameTimeSec.length);
        const c = Math.min(out.length, resampled.length);
        out.set(resampled.subarray(0, c));
        if (c < out.length) out.fill(resampled.length > 0 ? resampled[resampled.length - 1] : 0, c);
        return out;
    }
    return resampled;
}
