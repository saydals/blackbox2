import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { FlightLog } from "../src/blackbox-viewer/flightlog.js";
import {
    STFT_FREQ_MAX_HZ,
    STFT_FREQ_MIN_HZ,
    interpolateNaN,
    nextPow2,
    pickRpmCombined,
    resampleRpmToFrameTime,
    resolveLogRpmField,
    logHeadSpeedOverSelection,
    estimateRpmTimeSeries,
    estimateRpmFromGyro,
    smoothRpm,
    scoreSpectrumPeaks,
} from "../src/blackbox-viewer/vib_rpm.js";
import { complexFft } from "../src/blackbox-viewer/vib_fft.js";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const samplePath = path.join(rootDir, "..", "sample.bbl");

function loadSampleLog() {
    const bytes = readFileSync(samplePath);
    const data = new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const log = new FlightLog(data);
    if (!log.openLog(0)) throw new Error("sample.bbl openLog(0) failed");
    return log;
}

describe("vib_rpm: 기본 유틸", () => {
    it("nextPow2", () => {
        expect(nextPow2(1)).toBe(1);
        expect(nextPow2(1000)).toBe(1024);
        expect(nextPow2(1024)).toBe(1024);
    });

    it("interpolateNaN: 앞/뒤 채움 + 내부 선형 보간", () => {
        const rpm = [NaN, 1000, NaN, NaN, 2000, NaN];
        interpolateNaN(rpm);
        expect(rpm[0]).toBe(1000);
        expect(rpm[2]).toBeCloseTo(1333.333, 2);
        expect(rpm[3]).toBeCloseTo(1666.667, 2);
        expect(rpm[5]).toBe(2000);
    });

    it("smoothRpm: 스파이크 제거, 완만한 변화는 유지", () => {
        const base = new Array(60).fill(2400);
        base[30] = 5400; // 단일 스파이크
        const smoothed = smoothRpm(base, 5, 3);
        expect(smoothed[30]).toBeCloseTo(2400, 0);

        // 40 샘플에 걸친 200RPM 증가는 보존 (< 250RPM/윈도우)
        const ramp = Array.from({ length: 60 }, (_, i) => 2300 + (i < 20 ? 0 : ((i - 20) / 40) * 200));
        const rampOut = smoothRpm(ramp, 5, 3);
        expect(rampOut[59] - rampOut[0]).toBeGreaterThan(150);
    });
});


describe("vib_rpm: 스펙트럼 후보 선택", () => {
    it("1P와 2P 하모닉이 있는 신호에서 1P 주파수를 고른다", () => {
        const sampleRate = 1000;
        const fftSize = 2048;
        const windowSize = 1000;
        const f1 = 30;
        const real = new Float32Array(fftSize);
        const imag = new Float32Array(fftSize);
        for (let i = 0; i < windowSize; i++) {
            const t = i / sampleRate;
            const w = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (windowSize - 1)));
            real[i] = (Math.sin(2 * Math.PI * f1 * t) + 0.7 * Math.sin(2 * Math.PI * 2 * f1 * t)) * w;
        }
        complexFft(real, imag);
        const powers = new Float32Array(fftSize / 2);
        for (let k = 0; k < powers.length; k++) powers[k] = real[k] * real[k] + imag[k] * imag[k];

        const picks = scoreSpectrumPeaks(powers, sampleRate, fftSize);
        expect(picks.size).toBeGreaterThan(0);

        const best = pickRpmCombined(powers, powers, sampleRate, fftSize);
        expect(best.rpm).toBeCloseTo(f1 * 60, 0);
        expect(best.peakHz).toBeGreaterThanOrEqual(STFT_FREQ_MIN_HZ);
        expect(best.peakHz).toBeLessThanOrEqual(STFT_FREQ_MAX_HZ);
    });
});

describe("vib_rpm: STFT 추정 파이프라인", () => {
    it.each([1000, 4000])("%iHz 샘플레이트의 33Hz(1980RPM) 신호를 추정", (sampleRate) => {
        const { roll, pitch } = synthGyro(33, sampleRate, 30);
        const series = estimateRpmTimeSeries(roll, pitch, sampleRate);
        expect(series.rpm.length).toBeGreaterThan(100);

        const valid = series.rpm.filter((v) => Number.isFinite(v));
        expect(valid.length).toBe(series.rpm.length);
        const avg = valid.reduce((a, b) => a + b, 0) / valid.length;
        expect(avg).toBeGreaterThan(1900);
        expect(avg).toBeLessThan(2060);
    });

    it("estimateRpmFromGyro: 프레임 시간축에 맞춰 리샘플", () => {
        const sampleRate = 1000;
        const { roll, pitch } = synthGyro(40, sampleRate, 30);
        const frameTimeSec = new Float32Array(2000);
        for (let i = 0; i < frameTimeSec.length; i++) frameTimeSec[i] = (i * 30) / frameTimeSec.length;

        const out = estimateRpmFromGyro(roll, pitch, frameTimeSec, sampleRate);
        expect(out.length).toBe(frameTimeSec.length);
        for (const v of out) {
            expect(Number.isFinite(v)).toBe(true);
            expect(v).toBeGreaterThanOrEqual(1200);
            expect(v).toBeLessThanOrEqual(6000);
        }
        const avg = out.reduce((a, b) => a + b, 0) / out.length;
        expect(avg).toBeGreaterThan(2300);
        expect(avg).toBeLessThan(2500);
    });

    it("resampleRpmToFrameTime: 길이 유지 + 시계열 보간", () => {
        const series = { timeMs: [0, 1000, 2000], rpm: [2000, 2400, 2800] };
        const frameTimeSec = new Float32Array([0, 0.5, 1, 1.5, 2, 3]);
        const out = resampleRpmToFrameTime(series, frameTimeSec);
        expect(out.length).toBe(frameTimeSec.length);
        expect(out[0]).toBeCloseTo(2000, 3);
        expect(out[1]).toBeCloseTo(2200, 3);
        expect(out[2]).toBeCloseTo(2400, 3);
        expect(out[3]).toBeCloseTo(2600, 3);
        expect(out[4]).toBeCloseTo(2800, 3);
        expect(out[5]).toBeCloseTo(2800, 3); // 범위 밖은 마지막 값 유지

        const single = resampleRpmToFrameTime({ timeMs: [0], rpm: [2500] }, frameTimeSec);
        expect(Array.from(single)).toEqual([2500, 2500, 2500, 2500, 2500, 2500]);
    });

    it("estimateRpmFromGyro: 입력이 비어 있으면 빈 배열", () => {
        expect(estimateRpmFromGyro(new Float32Array(0), new Float32Array(0), new Float32Array(0), 1000).length).toBe(0);
    });
});

describe("vib_rpm: 로그 RPM 필드 연동 (sample.bbl)", () => {
    it("headspeed 필드를 찾아 선택 구간 평균 RPM을 낸다", () => {
        const log = loadSampleLog();
        const source = resolveLogRpmField(log);
        // sample.bbl(RF 4.6 heli)은 headspeed 필드를 기록한다 (eRPM/tailspeed 없음)
        expect(source).toBeTruthy();
        expect(source.fieldName).toBe("headspeed");
        expect(source.index).toBe(log.getMainFieldIndexByName("headspeed"));

        const startUs = log.getMinTime();
        const endUs = Math.min(log.getMaxTime(), startUs + 30e6);
        const rpm = logHeadSpeedOverSelection(log, startUs, endUs);
        // 전체 로그 구간이 아니어서 값 자체는 ±10% 정도만 고정한다
        expect(rpm).toBeGreaterThan(1700);
        expect(rpm).toBeLessThan(2100);
    });

    it("50Hz 로그는 자이로 추정이 불가능해 빈 배열 (Nyquist 25Hz < 20~80Hz 대역)", () => {
        const log = loadSampleLog();
        const gyroIdx = [0, 1, 2].map((i) => log.getMainFieldIndexByName(`gyroADC[${i}]`));
        expect(gyroIdx.every((i) => i !== undefined)).toBe(true);
        const timeIdx = log.getMainFieldIndexByName("time");
        expect(timeIdx).toBe(1); // FLIGHT_LOG_FIELD_INDEX_TIME

        const startUs = log.getMinTime();
        const endUs = Math.min(log.getMaxTime(), startUs + 30e6);
        const chunks = log.getChunksInTimeRange(startUs, endUs);
        const count = chunks.reduce((a, c) => a + c.frames.length, 0);
        expect(count).toBeGreaterThan(1024);

        const roll = new Float32Array(count);
        const pitch = new Float32Array(count);
        const frameTimeSec = new Float32Array(count);
        const gyroScale = (log.getSysConfig().gyroScale * 1000000) / (Math.PI / 180);
        let n = 0;
        for (const chunk of chunks) {
            for (const frame of chunk.frames) {
                roll[n] = frame[gyroIdx[0]] * gyroScale;
                pitch[n] = frame[gyroIdx[1]] * gyroScale;
                frameTimeSec[n] = frame[timeIdx] / 1e6;
                n++;
            }
        }

        const rate = log.getBlackboxRate() || log.getActualLogRate();
        expect(rate).toBe(50);

        expect(estimateRpmTimeSeries(roll, pitch, rate).rpm.length).toBe(0);
        expect(estimateRpmFromGyro(roll, pitch, frameTimeSec, rate).length).toBe(0);
    });
});



/** Synthetic gyro trace: 1P at `f1`Hz plus a 2P harmonic, in °/s. */
function synthGyro(f1, sampleRate, seconds, amp2p = 0.6) {
    const n = Math.floor(sampleRate * seconds);
    const roll = new Float32Array(n);
    const pitch = new Float32Array(n);
    for (let i = 0; i < n; i++) {
        const t = i / sampleRate;
        roll[i] = 1.0 * Math.sin(2 * Math.PI * f1 * t) + amp2p * Math.sin(2 * Math.PI * 2 * f1 * t);
        pitch[i] = 0.8 * Math.sin(2 * Math.PI * f1 * t + 0.3) + amp2p * Math.sin(2 * Math.PI * 2 * f1 * t + 0.3);
    }
    return { roll, pitch };
}
