import { describe, it, expect, beforeAll, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { FlightLog } from "../src/blackbox-viewer/flightlog.js";
import { FlightLogParser } from "../src/blackbox-viewer/flightlog_parser.js";
import { CsvExporter } from "../src/blackbox-viewer/csv-exporter.js";
import { getAvailableSampleRates, BBL_UPSAMPLING_ERROR_MESSAGE } from "../src/blackbox-viewer/bbl-exporter.js";
import { suggestedName } from "../src/blackbox-viewer/export_utils.js";

// export_utils → FileSystem → ConfigStorage 체인이 모듈 스코프에서
// window.ConfigStorage 를 설정한다. node 테스트 환경에는 window 가 없으므로
// import 평가보다 먼저 전역 window 를 내어준다.
vi.hoisted(() => {
    if (typeof globalThis.window === "undefined") {
        globalThis.window = globalThis;
    }
});

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const samplePath = path.join(rootDir, "..", "sample.bbl");

// --- csv-export-worker 스텁 --------------------------------------------------
// node 테스트 환경에는 Worker가 없다. 실제 worker 모듈을 동적 import해 그
// onmessage로 데이터를 흘려보냄으로써, 실제 CSV 변환 코드를 그대로 검증한다.
class WorkerStub {
    constructor() {
        WorkerStub.instances.push(this);
        this.onmessage = null;
        this.onerror = null;
        this.onmessageerror = null;
    }
    postMessage(data) {
        void Promise.resolve().then(async () => {
            await import("../src/js/webworkers/csv-export-worker.js");
            globalThis.onmessage({ data });
        });
    }
    terminate() {}
}
WorkerStub.instances = [];

beforeAll(() => {
    // worker 모듈의 top-level `onmessage = ...` / `postMessage(...)`가 전역에
    // 붙을 수 있도록 먼저 정의해 둔다 (worker 스코프 시뮬레이션).
    globalThis.onmessage = null;
    globalThis.postMessage = (message) => {
        const worker = WorkerStub.instances.at(-1);
        worker?.onmessage?.({ data: message });
    };
    vi.stubGlobal("Worker", WorkerStub);
});

function loadSample() {
    const bytes = readFileSync(samplePath);
    const data = new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const log = new FlightLog(data);
    if (!log.openLog(0)) throw new Error("sample.bbl openLog(0) failed");
    return { log, data };
}

function exportCsvAsync(log, opts) {
    return new Promise((resolve, reject) => {
        CsvExporter(log, opts).dump(
            (csv) => resolve(csv),
            (err) => reject(err instanceof Error ? err : new Error(String(err))),
        );
    });
}

function decodeMains(data) {
    const parser = new FlightLogParser(data);
    parser.parseHeader(0, data.length);
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

const TIME_INDEX = FlightLogParser.prototype.FLIGHT_LOG_FIELD_INDEX_TIME;

function parseCsvRows(csv, fieldNames) {
    const lines = csv.split("\n");
    const headerLine = fieldNames.map((name) => `"${name}"`).join(",");
    const headerIndex = lines.indexOf(headerLine);
    expect(headerIndex).toBeGreaterThanOrEqual(0);
    return lines
        .slice(headerIndex + 1)
        .filter((line) => line.length > 0)
        .map((line) => line.split(",").map((v) => (v === "NaN" ? Number.NaN : Number(v))));
}

// CsvExporter가 실제로 받는 프레임(청크 경계 포함 → 구간 필터링)을 그대로 본뜬 행 목록
function sourceRowsInRange(log, start, end) {
    return log
        .getChunksInTimeRange(start, end)
        .map((chunk) => chunk.frames)
        .flat()
        .filter((frame) => frame[TIME_INDEX] >= start && frame[TIME_INDEX] <= end);
}

describe("CSV export 전체 내보내기 (기존 동작 유지)", () => {
    it("옵션 없이 내보내면 헤더 + 전체 프레임 행이 나온다", async () => {
        const { log, data } = loadSample();
        const csv = await exportCsvAsync(log);
        const rows = parseCsvRows(csv, log.getMainFieldNames());
        const { mains } = decodeMains(data);
        expect(rows.length).toBe(mains.length);
        expect(rows.length).toBeGreaterThan(0);
    });
});

describe("CSV export 선택 구간", () => {
    it("구간을 지정하면 그 구간의 프레임만 나온다", async () => {
        const { log } = loadSample();
        const min = log.getMinTime();
        const span = log.getMaxTime() - min;
        const start = min + Math.floor(span * 0.2);
        const end = start + Math.floor(span * 0.2);
        const csv = await exportCsvAsync(log, { startTime: start, endTime: end });
        const rows = parseCsvRows(csv, log.getMainFieldNames());
        const src = sourceRowsInRange(log, start, end);
        expect(rows.length).toBe(src.length);
        expect(rows.length).toBeGreaterThan(0);
        for (let i = 0; i < rows.length; i++) {
            expect(rows[i][TIME_INDEX]).toBe(src[i][TIME_INDEX]);
            expect(rows[i][TIME_INDEX]).toBeGreaterThanOrEqual(start);
            expect(rows[i][TIME_INDEX]).toBeLessThanOrEqual(end);
        }
    });

    it("빈 구간은 실패한다", async () => {
        const { log } = loadSample();
        const min = log.getMinTime();
        await expect(
            exportCsvAsync(log, { startTime: min + 2_000_000, endTime: min + 1_000_000 }),
        ).rejects.toThrow("Selected range contains no frames");
    });
});

describe("CSV export 다운샘플링 (BBL과 같은 규칙)", () => {
    it("격자 선택으로 행이 줄고 평균 간격이 목표 샘플레이트를 따른다", async () => {
        const { log } = loadSample();
        const original = log.getBlackboxRate();
        const target = getAvailableSampleRates(original).find((r) => r < original);
        expect(target).toBeDefined();
        const min = log.getMinTime();
        const span = log.getMaxTime() - min;
        const start = min + Math.floor(span * 0.1);
        const end = log.getMaxTime() - Math.floor(span * 0.1);
        const src = sourceRowsInRange(log, start, end);
        expect(src.length).toBeGreaterThan(10);

        const csv = await exportCsvAsync(log, { startTime: start, endTime: end, sampleRate: target });
        const rows = parseCsvRows(csv, log.getMainFieldNames());
        expect(rows.length).toBeLessThan(src.length);

        // 격자는 첫 프레임에 고정되므로 첫 행은 원본 첫 행과 동일하다
        expect(rows[0].length).toBe(src[0].length);
        for (let i = 0; i < rows[0].length; i++) {
            expect(rows[0][i]).toBe(src[0][i]);
        }
        // 단조 증가
        for (let i = 1; i < rows.length; i++) {
            expect(rows[i][TIME_INDEX]).toBeGreaterThan(rows[i - 1][TIME_INDEX]);
        }
        // 평균 간격이 1/target (±5%)
        const meanInterval = (rows[rows.length - 1][TIME_INDEX] - rows[0][TIME_INDEX]) / (rows.length - 1);
        const expectedInterval = 1e6 / target;
        expect(Math.abs(meanInterval - expectedInterval) / expectedInterval).toBeLessThan(0.05);
    });

    it("원본과 같은 샘플레이트면 행 수가 그대로다", async () => {
        const { log } = loadSample();
        const original = log.getBlackboxRate();
        const start = log.getMinTime();
        const end = log.getMaxTime();
        const csv = await exportCsvAsync(log, { startTime: start, endTime: end, sampleRate: original });
        const rows = parseCsvRows(csv, log.getMainFieldNames());
        expect(rows.length).toBe(sourceRowsInRange(log, start, end).length);
    });

    it("업샘플링 요청은 BBL과 같은 한국어 안내로 실패한다", async () => {
        const { log } = loadSample();
        const original = log.getBlackboxRate();
        const higher = original >= 1000 ? original * 2 : 1000;
        await expect(
            exportCsvAsync(log, { startTime: log.getMinTime(), endTime: log.getMaxTime(), sampleRate: higher }),
        ).rejects.toThrow(BBL_UPSAMPLING_ERROR_MESSAGE);
    });
});

describe("CSV 파일명 규칙 (BBL과 동일)", () => {
    it("구간/샘플레이트 정보가 있으면 BBL과 같은 패턴이 붙는다", () => {
        const base = 1_000_000;
        const options = {
            flightIndex: 0,
            startTime: base + 11_000_000,
            endTime: base + 21_000_000,
            baseTime: base,
            sampleRate: 100,
        };
        expect(suggestedName("log.bbl", "csv", options)).toBe("log_Flight1_11.0s-21.0s_100Hz.csv");
        // 기존 BBL 파일명 규칙 회귀 방지
        expect(suggestedName("log.bbl", "bbl", options)).toBe("log_Flight1_11.0s-21.0s_100Hz.bbl");
    });

    it("옵션이 없으면 기존처럼 확장자만 붙는다", () => {
        expect(suggestedName("log.bbl", "csv")).toBe("log.csv");
    });
});
