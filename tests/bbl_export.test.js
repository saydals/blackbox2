import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { FlightLog } from "../src/blackbox-viewer/flightlog.js";
import { FlightLogParser } from "../src/blackbox-viewer/flightlog_parser.js";
import {
    BblExporter,
    getAvailableSampleRates,
    BBL_SUPPORTED_SAMPLE_RATES,
    BBL_UPSAMPLING_ERROR_MESSAGE,
} from "../src/blackbox-viewer/bbl-exporter.js";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const samplePath = path.join(rootDir, "..", "sample.bbl");

function loadSample() {
    const bytes = readFileSync(samplePath);
    const data = new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const log = new FlightLog(data);
    if (!log.openLog(0)) throw new Error("sample.bbl openLog(0) failed");
    return { log, data };
}

function exportAsync(log, data, start, end, rate) {
    return new Promise((resolve, reject) => {
        BblExporter(log, data, start, end, rate).dump(
            (buf) => resolve(new Uint8Array(buf)),
            (err) => reject(err instanceof Error ? err : new Error(String(err))),
        );
    });
}

function decodeMains(bytes) {
    const parser = new FlightLogParser(bytes);
    parser.parseHeader(0, bytes.length);
    const mains = [];
    parser.onFrameReady = (isValid, frame, frameType) => {
        if (!isValid) return;
        const m = typeof frameType === "string" ? frameType : frameType?.marker;
        if (m === "I" || m === "P") mains.push(Array.from(frame));
    };
    try {
        parser.resetDataState();
        parser.parseLogData(false);
    } finally {
        parser.onFrameReady = null;
    }
    return { parser, mains };
}

describe("BBL export rate 옵션", () => {
    it("지원 샘플레이트 상수", () => {
        expect(BBL_SUPPORTED_SAMPLE_RATES).toEqual([1000, 500, 250, 100, 50, 10]);
    });
    it("원본 이하의 Hz만 선택 가능", () => {
        expect(getAvailableSampleRates(1000)).toEqual([1000, 500, 250, 100, 50, 10]);
        expect(getAvailableSampleRates(500)).toEqual([500, 250, 100, 50, 10]);
        expect(getAvailableSampleRates(100)).toEqual([100, 50, 10]);
        expect(getAvailableSampleRates(2000)[0]).toBe(2000);
        expect(getAvailableSampleRates(null)).toEqual([]);
    });
});

describe("BBL export 무결성", () => {
    it("업샘플링 요청은 생성 없이 한국어 안내로 실패", async () => {
        const { log, data } = loadSample();
        const original = log.getBlackboxRate();
        const higher = original >= 1000 ? original * 2 : 1000;
        await expect(exportAsync(log, data, log.getMinTime(), log.getMaxTime(), higher)).rejects.toThrow(
            BBL_UPSAMPLING_ERROR_MESSAGE,
        );
    });
    it("출력=원본이면 구간만 추출되고 재오픈된다", async () => {
        const { log, data } = loadSample();
        const original = log.getBlackboxRate();
        const out = await exportAsync(log, data, log.getMinTime(), log.getMaxTime(), original);
        expect(out.length).toBeGreaterThan(1000);
        const { mains } = decodeMains(out);
        expect(mains.length).toBeGreaterThan(0);
        for (let i = 1; i < mains.length; i++) expect(mains[i][1]).toBeGreaterThan(mains[i - 1][1]);
        expect(new FlightLog(out).openLog(0)).toBe(true);
    });
    it("다운샘플링: 프레임 감소 + 단조 + P interval 갱신", async () => {
        const { log, data } = loadSample();
        const original = log.getBlackboxRate();
        const target = getAvailableSampleRates(original).find((r) => r < original);
        expect(target).toBeDefined();
        const out = await exportAsync(log, data, log.getMinTime(), log.getMaxTime(), target);
        const src = decodeMains(data);
        const dst = decodeMains(out);
        expect(dst.mains.length).toBeGreaterThan(0);
        expect(dst.mains.length).toBeLessThan(src.mains.length);
        for (let i = 1; i < dst.mains.length; i++) expect(dst.mains[i][1]).toBeGreaterThan(dst.mains[i - 1][1]);
        expect(dst.mains[0]).toEqual(src.mains[0]);
        const factor = Math.round(original / target);
        expect(dst.parser.sysConfig.frameIntervalPDenom).toBe(src.parser.sysConfig.frameIntervalPDenom * factor);
        expect(new FlightLog(out).openLog(0)).toBe(true);
        // S 프레임이 유지되는지 확인 (원본에 S 정의가 있을 때)
        if (src.parser.frameDefs.S) {
            expect(dst.parser.frameDefs.S).toBeTruthy();
        }
    });
    it("시간 구간 + 다운샘플링 조합", async () => {
        const { log, data } = loadSample();
        const original = log.getBlackboxRate();
        const target = getAvailableSampleRates(original).find((r) => r < original);
        const min = log.getMinTime();
        const span = log.getMaxTime() - min;
        expect(span).toBeGreaterThan(2 * 1000000);
        const start = min + Math.floor(span * 0.2);
        const end = start + Math.floor(span * 0.2);
        const out = await exportAsync(log, data, start, end, target);
        const { mains } = decodeMains(out);
        expect(mains.length).toBeGreaterThan(0);
        expect(mains[0][1]).toBeGreaterThanOrEqual(start - 100000);
        expect(mains[mains.length - 1][1]).toBeLessThanOrEqual(end + 100000);
    });
});
