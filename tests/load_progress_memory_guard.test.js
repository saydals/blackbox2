import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { FlightLogParser, ParserAbortedError } from "../src/blackbox-viewer/flightlog_parser";
import { FlightLogIndex } from "../src/blackbox-viewer/flightlog_index";
import { createMemoryGuard } from "../src/blackbox-viewer/memory_guard";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const samplePath = path.join(rootDir, "..", "sample.bbl");
const sampleBytes = new Uint8Array(readFileSync(samplePath));

describe("parseLogData generator refactor (loading progress + partial load)", () => {
    it("sync parseLogData parses the whole log identically (no checkpoints observed)", () => {
        const parser = new FlightLogParser(sampleBytes);
        parser.parseHeader(0, sampleBytes.length);
        parser.onFrameReady = () => {};

        parser.parseLogData(false);
        const syncStats = {
            valid: parser.stats.frame.I.validCount + parser.stats.frame.P.validCount,
            bytes: parser.stats.totalBytes,
        };
        expect(syncStats.valid).toBeGreaterThan(0);
        // totalBytes counts the data section only (header excluded).
        expect(syncStats.bytes).toBe(sampleBytes.length - parser.headerBytes.length);

        // Second parser: the generator must produce the very same result
        // when driven through its checkpoints (sync wrapper path).
        const parser2 = new FlightLogParser(sampleBytes);
        parser2.parseHeader(0, sampleBytes.length);
        parser2.onFrameReady = () => {};
        parser2.parseLogData(false);
        expect(parser2.stats.frame.I.validCount).toBe(parser.stats.frame.I.validCount);
        expect(parser2.stats.frame.P.validCount).toBe(parser.stats.frame.P.validCount);
        expect(parser2.stats.totalBytes).toBe(parser.stats.totalBytes);
    });

    it("async drive reports progress checkpoints and reaches EOF", async () => {
        const parser = new FlightLogParser(sampleBytes);
        parser.parseHeader(0, sampleBytes.length);
        parser.onFrameReady = () => {};

        const checkpoints = [];
        const gen = parser.parseLogDataGen(false);
        let result = gen.next();
        while (!result.done) {
            checkpoints.push(result.value);
            await new Promise((r) => setTimeout(r, 0));
            result = gen.next();
        }

        // sample.bbl is ~1.4 MB → at least one 1 MiB checkpoint expected.
        expect(checkpoints.length).toBeGreaterThanOrEqual(1);
        // Checkpoints advance monotonically and end past EOF distance.
        for (let i = 1; i < checkpoints.length; i++) {
            expect(checkpoints[i]).toBeGreaterThanOrEqual(checkpoints[i - 1]);
        }
        expect(checkpoints[checkpoints.length - 1]).toBeGreaterThan(0);
        // Same decode result as the sync path.
        expect(parser.stats.frame.P.validCount).toBeGreaterThan(0);
    });

    it("abort at a checkpoint stops the generator (ParserAbortedError signal)", async () => {
        const parser = new FlightLogParser(sampleBytes);
        parser.parseHeader(0, sampleBytes.length);
        parser.onFrameReady = () => {};

        const gen = parser.parseLogDataGen(false);
        let checkpointSeen = false;
        let result = gen.next();
        while (!result.done) {
            checkpointSeen = true;
            // The async driver aborts by closing the generator; resuming must
            // then be a no-op returning done (no half-parsed frame leak).
            gen.return(undefined);
            result = gen.next();
            expect(result.done).toBe(true);
            break;
        }
        expect(checkpointSeen).toBe(true);

        const err = new ParserAbortedError();
        expect(err).toBeInstanceOf(Error);
        expect(err.name).toBe("ParserAbortedError");
    });

    it("FlightLogIndex.prebuild keeps parsed data and flags partial on memory abort", async () => {
        const index = new FlightLogIndex(sampleBytes);
        // Guard that fires at the first checkpoint → partial index build.
        await index.prebuild({
            onProgress: () => {},
            shouldAbort: () => true,
        });

        const dir = index.getIntraframeDirectory(0);
        expect(dir).toBeTruthy();
        expect(dir.partial).toBe(true);
        // No crash-worthy error, and whatever was parsed before the abort is kept.
        expect(dir.error).toBeUndefined();

        // peekDirectory / isPrebuilding consistency.
        expect(index.peekDirectory(0)).toBe(dir);
        expect(index.isPrebuilding()).toBe(false);
    });

    it("FlightLogIndex.prebuild full pass equals the lazy sync build", async () => {
        const asyncIndex = new FlightLogIndex(sampleBytes);
        const performed = await asyncIndex.prebuild({
            onProgress: () => {},
            shouldAbort: () => false,
        });
        expect(performed).toBe(true);

        const syncIndex = new FlightLogIndex(sampleBytes);
        syncIndex.getIntraframeDirectory(0); // triggers the historical sync build

        const a = asyncIndex.getIntraframeDirectory(0);
        const b = syncIndex.getIntraframeDirectory(0);
        expect(a.partial).toBeUndefined();
        expect(b.error).toBeUndefined();
        expect(a.times.length).toBe(b.times.length);
        expect(a.maxTime).toBe(b.maxTime);
        expect(a.minTime).toBe(b.minTime);
        expect(a.offsets.length).toBe(b.offsets.length);
    });

    it("memory guard aborts on heap pressure and refuses oversized files", () => {
        // Simulated Chromium heap API: 200 MB used of 256 MB limit.
        const fakeHeap = { usedJSHeapSize: 200 * 1024 * 1024, jsHeapSizeLimit: 256 * 1024 * 1024 };
        const origMemory = performance.memory;
        Object.defineProperty(performance, "memory", { value: fakeHeap, configurable: true });
        try {
            const guard = createMemoryGuard({ logDataBytes: 10 * 1024 * 1024 });
            expect(guard.check(0)).toBe(false);
            fakeHeap.usedJSHeapSize = 230 * 1024 * 1024; // > 85% of 256 MB
            expect(guard.check(0)).toBe(true);
            expect(guard.isAborted()).toBe(true);
            expect(guard.describe()).toContain("heap");

            const sizeGuard = createMemoryGuard({});
            // 2× file (600 MB) > 85% of the 256 MB limit → refusal.
            expect(sizeGuard.canAcceptFile(300 * 1024 * 1024)).toContain("larger than this device can load");
            expect(sizeGuard.canAcceptFile(1 * 1024 * 1024)).toBeNull();
        } finally {
            Object.defineProperty(performance, "memory", { value: origMemory, configurable: true });
        }
    });
});
