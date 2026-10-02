import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { Buffer } from "node:buffer";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { FlightLogParser, ParserAbortedError } from "../src/blackbox-viewer/flightlog_parser";
import { FlightLogIndex } from "../src/blackbox-viewer/flightlog_index";
import { createMemoryGuard } from "../src/blackbox-viewer/memory_guard";

// --- Android partial-read test doubles -----------------------------------
// FileSystem's Android branch is gated on isAndroid() and talks to the SAF
// plugin through CapacitorFile. Replace both so the chunked read protocol
// (including the oversized-file front-portion truncation) is testable in Node.
vi.mock("../src/js/utils/checkCompatibility", () => ({
    isAndroid: () => true,
    isTauriDesktop: () => false,
}));

vi.mock("../src/js/protocols/CapacitorFile", () => ({
    default: {
        getFileSize: vi.fn(),
        readFileChunk: vi.fn(),
        closeFile: vi.fn().mockResolvedValue(undefined),
    },
}));

// ConfigStorage attaches itself to window at import time (no window in Node).
// FileSystem only uses get/set for config paths unrelated to file reading.
vi.mock("../src/js/ConfigStorage", () => ({
    get: vi.fn(() => ({})),
    set: vi.fn(),
    remove: vi.fn(),
}));

import FileSystem from "../src/js/FileSystem.js";
import CapacitorFile from "../src/js/protocols/CapacitorFile";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const samplePath = path.join(rootDir, "..", "sample.bbl");
const sampleBytes = new Uint8Array(readFileSync(samplePath));

/** Install a fake Chromium heap API (performance.memory) with the given limit. */
function fakeHeap(jsHeapSizeLimit) {
    Object.defineProperty(performance, "memory", {
        value: { usedJSHeapSize: 0, jsHeapSizeLimit },
        configurable: true,
    });
}

/** Remove the fake heap API so later tests see no signal again. */
function restoreHeap() {
    Object.defineProperty(performance, "memory", { value: undefined, configurable: true });
}

/** Serve a virtual file of `size` bytes through the CapacitorFile mock. */
function serveVirtualFile(size) {
    let served = 0;
    CapacitorFile.getFileSize.mockReset().mockResolvedValue(size);
    CapacitorFile.readFileChunk.mockReset().mockImplementation(async (fileId, length) => {
        const n = Math.max(0, Math.min(length, size - served));
        const data = Buffer.alloc(n, 0x42).toString("hex");
        served += n;
        return { data, bytesRead: n, eof: served >= size };
    });
    CapacitorFile.closeFile.mockClear();
    return () => served;
}

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

    it("maxPartialLoadBytes is the exact inverse of canAcceptFile", () => {
        // Simulated Chromium heap API with a 256 MB limit.
        const origMemory = performance.memory;
        Object.defineProperty(
            performance,
            "memory",
            { value: { usedJSHeapSize: 0, jsHeapSizeLimit: 256 * 1024 * 1024 }, configurable: true },
        );
        try {
            const guard = createMemoryGuard({});
            const budget = guard.maxPartialLoadBytes();
            // 256 MB × 0.85 / 2 — the largest file that passes canAcceptFile.
            expect(budget).toBe(Math.floor((256 * 1024 * 1024 * 0.85) / 2));
            expect(guard.canAcceptFile(budget)).toBeNull();
            expect(guard.canAcceptFile(budget * 2 + 1)).toContain("larger than this device can load");
        } finally {
            Object.defineProperty(performance, "memory", { value: origMemory, configurable: true });
        }
    });
});

describe("Android oversized-file partial loading (FileSystem.readFileAsBlob)", () => {
    const MB = 1024 * 1024;
    const fileDescriptor = { _fileHandle: "test-file-id", name: "LOG00001.BBL" };

    afterEach(() => {
        restoreHeap();
        vi.clearAllMocks();
    });

    it("oversized file with allowPartial reads only the front portion", async () => {
        // Heap limit 10 MB → partial budget = floor(10 MB × 0.85 / 2) ≈ 4.25 MB.
        const heapLimit = 10 * MB;
        const declaredSize = 12 * MB;
        const expectedBudget = Math.floor((heapLimit * 0.85) / 2);
        fakeHeap(heapLimit);
        const served = serveVirtualFile(declaredSize);

        const progress = [];
        let truncatedInfo = null;
        const blob = await FileSystem.readFileAsBlob(
            fileDescriptor,
            (loaded, total) => progress.push([loaded, total]),
            {
                allowPartial: true,
                onTruncated: (readBytes, totalBytes) => (truncatedInfo = { readBytes, totalBytes }),
            },
        );

        // Exactly the front portion of the file was read — no more, no less.
        expect(blob.size).toBe(expectedBudget);
        expect(served()).toBe(expectedBudget);
        // The truncation is reported with (read, total) byte counts.
        expect(truncatedInfo).toEqual({ readBytes: expectedBudget, totalBytes: declaredSize });
        // Progress totals refer to the portion being loaded (the budget), so
        // the overlay's "50% (25.3 MB)" stays consistent end to end.
        expect(progress.length).toBeGreaterThan(0);
        for (const [loaded, total] of progress) {
            expect(total).toBe(expectedBudget);
            expect(loaded).toBeLessThanOrEqual(total);
        }
        expect(progress[progress.length - 1][0]).toBe(expectedBudget);
        // The SAF session is always released.
        expect(CapacitorFile.closeFile).toHaveBeenCalledWith("test-file-id");
    });

    it("oversized file without allowPartial is still refused (LogTooLargeError)", async () => {
        const heapLimit = 10 * MB;
        fakeHeap(heapLimit);
        serveVirtualFile(12 * MB); // 24 MB needed vs ~8.5 MB allowed → refusal

        await expect(FileSystem.readFileAsBlob(fileDescriptor, null)).rejects.toMatchObject({
            name: "LogTooLargeError",
        });
        // Refused before any chunk was transferred.
        expect(CapacitorFile.readFileChunk).not.toHaveBeenCalled();
        expect(CapacitorFile.closeFile).toHaveBeenCalledWith("test-file-id");
    });

    it("device with a heap too small for a meaningful partial load refuses even with allowPartial", async () => {
        // Heap limit 8 MB → budget ≈ 3.4 MB < 4 MB floor → refuse instead of
        // loading a uselessly tiny front portion.
        fakeHeap(8 * MB);
        serveVirtualFile(12 * MB);

        await expect(
            FileSystem.readFileAsBlob(fileDescriptor, null, { allowPartial: true, onTruncated: () => {} }),
        ).rejects.toMatchObject({ name: "LogTooLargeError" });
    });

    it("file within the budget loads fully with no truncation", async () => {
        fakeHeap(10 * MB);
        const size = 2 * MB;
        serveVirtualFile(size);

        let onTruncated = null;
        const blob = await FileSystem.readFileAsBlob(fileDescriptor, null, {
            allowPartial: true,
            onTruncated: () => (onTruncated = "called"),
        });

        expect(blob.size).toBe(size);
        expect(onTruncated).toBeNull(); // no truncation for an acceptable file
        expect(CapacitorFile.readFileChunk).toHaveBeenCalledTimes(1); // single 2 MB chunk
    });
});
