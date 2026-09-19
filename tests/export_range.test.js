import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { FlightLog } from "../src/blackbox-viewer/flightlog.js";
import { isMarkTime, resolveExportRange, formatExportRangeText } from "../src/blackbox-viewer/export_range.js";
import { pinia } from "../src/js/pinia_instance.js";
import { usePlaybackStore } from "../src/blackbox-viewer/stores/playback.js";
import { setVideoInTime, setVideoOutTime } from "../src/blackbox-viewer/video_handler.js";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

// 고정 타임스탬프로 계산하는 단위 테스트용 값 (마이크로초)
const MIN = 68_512_246;
const MAX = 102_042_279;
const rangeOf = (inTime, outTime) =>
    resolveExportRange({
        inTime,
        outTime,
        getMinTime: () => MIN,
        getMaxTime: () => MAX,
    });

describe("export_range 마크 해석", () => {
    it("유한한 타임스탬프만 마크로 인정", () => {
        expect(isMarkTime(MIN)).toBe(true);
        expect(isMarkTime(0)).toBe(true);
        expect(isMarkTime(null)).toBe(false);
        expect(isMarkTime(false)).toBe(false);
        expect(isMarkTime(undefined)).toBe(false);
        expect(isMarkTime(Number.NaN)).toBe(false);
    });

    it("마크가 없으면 로그 전체 구간을 사용한다", () => {
        for (const [inTime, outTime] of [
            [null, null],
            [false, false],
            [undefined, undefined],
            [Number.NaN, Number.NaN],
        ]) {
            const range = rangeOf(inTime, outTime);
            expect(range.start).toBe(MIN);
            expect(range.end).toBe(MAX);
            expect(range.hasIn).toBe(false);
            expect(range.hasOut).toBe(false);
        }
    });

    it("그래프의 false 센티넬을 마크 없음으로 취급한다 (회귀 방지)", () => {
        // main.js 는 로그 로딩 시 setVideoInTime(false) 로 마크를 비운다. 이 값이
        // 마크로 오인되면 종료시간 대신 0 기준의 잘못된 구간이 표시된다.
        const range = rangeOf(false, false);
        expect(formatExportRangeText(range.start, range.end, range.minTime)).toBe("0:00 – 0:33");
    });

    it("in/out 이 모두 있으면 그대로 사용한다", () => {
        const range = rangeOf(MIN + 2_000_000, MIN + 5_000_000);
        expect(range.start).toBe(MIN + 2_000_000);
        expect(range.end).toBe(MIN + 5_000_000);
        expect(formatExportRangeText(range.start, range.end, range.minTime)).toBe("0:02 – 0:05");
    });

    it("한쪽 마크만 있으면 나머지는 로그 시작/끝으로 채운다", () => {
        const inOnly = rangeOf(MIN + 2_000_000, null);
        expect(inOnly.start).toBe(MIN + 2_000_000);
        expect(inOnly.end).toBe(MAX);
        expect(inOnly.hasOut).toBe(false);

        const outOnly = rangeOf(null, MIN + 10_000_000);
        expect(outOnly.start).toBe(MIN);
        expect(outOnly.end).toBe(MIN + 10_000_000);
        expect(outOnly.hasIn).toBe(false);
    });
});

describe("formatExportRangeText", () => {
    it("로그 시작 기준 m:ss 로 표시한다", () => {
        expect(formatExportRangeText(MIN, MAX, MIN)).toBe("0:00 – 0:33");
        expect(formatExportRangeText(MIN, MIN + 90_000_000, MIN)).toBe("0:00 – 1:30");
    });

    it("해석할 수 없는 값은 대시로 표시하고 음수는 0:00 으로 클램프한다", () => {
        expect(formatExportRangeText(Number.NaN, MAX, MIN)).toContain("—");
        expect(formatExportRangeText(MIN, Number.NaN, MIN)).toContain("—");
        expect(formatExportRangeText(MIN - 5_000_000, MIN, MIN)).toBe("0:00 – 0:00");
    });
});

describe("export_range 실제 로그 연동", () => {
    it("sample.bbl 을 마크 없이 열면 0:00 – 종료시간이 된다", () => {
        const bytes = readFileSync(path.join(rootDir, "..", "sample.bbl"));
        const data = new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        const log = new FlightLog(data);
        expect(log.openLog(0)).toBe(true);

        // 로그 로딩 시 main.js 가 넘기는 값과 동일한 false 센티넬
        const range = resolveExportRange({
            inTime: false,
            outTime: false,
            getMinTime: () => log.getMinTime(),
            getMaxTime: () => log.getMaxTime(),
        });

        expect(range.start).toBe(log.getMinTime());
        expect(range.end).toBe(log.getMaxTime());
        expect(formatExportRangeText(range.start, range.end, range.minTime)).toBe("0:00 – 0:33");
    });
});

describe("video_handler 마크 정규화", () => {
    it("그래프 센티넬 false 는 store 에 null(마크 없음)로 저장된다", () => {
        const playbackStore = usePlaybackStore(pinia);

        setVideoInTime(false);
        setVideoOutTime(false);
        expect(playbackStore.videoExportInTime).toBeNull();
        expect(playbackStore.videoExportOutTime).toBeNull();

        setVideoInTime(null);
        setVideoOutTime(null);
        expect(playbackStore.videoExportInTime).toBeNull();
        expect(playbackStore.videoExportOutTime).toBeNull();
    });

    it("실제 시간 값은 그대로 저장된다", () => {
        const playbackStore = usePlaybackStore(pinia);

        setVideoInTime(1_234_567);
        setVideoOutTime(7_654_321);
        expect(playbackStore.videoExportInTime).toBe(1_234_567);
        expect(playbackStore.videoExportOutTime).toBe(7_654_321);
    });
});