/**
 * Heap-pressure guard for the log loading pipeline.
 *
 * On Android the WebView renderer runs inside the app's per-process heap
 * limit (typically 256–512 MB). A large BBL already occupies that heap once
 * as the parsed log buffer, and the index pass allocates on top of it. When
 * the combined usage approaches the limit the renderer is killed outright —
 * the app "just closes" with no error and no partial result.
 *
 * This guard turns that hard crash into a graceful partial load: the async
 * index build (flightlog_index.prebuild) polls `check()` at parse
 * checkpoints and stops before the kill threshold, keeping everything
 * decoded so far.
 *
 * Signal sources, best to worst:
 *  1. performance.memory (Chromium / Android WebView): real heap usage vs
 *     the real limit. Primary mechanism — every Android device reports it.
 *  2. navigator.deviceMemory heuristic: when the heap API is missing,
 *     estimate a working-set budget from the device RAM class and stop once
 *     file bytes + estimated index bytes exceed it. Desktop browsers that
 *     expose neither signal simply get no guard (their heaps are large
 *     enough for any supported log).
 */

/* Fraction of the JS heap limit at which the index build aborts. The
 * remaining headroom covers chunk decoding, the graph render and the UI
 * after the load completes. */
const HEAP_ABORT_RATIO = 0.85;

/* Fallback budget (no performance.memory): estimated index bytes per parsed
 * log byte. The intraframe directory stores chunk summaries (times, offsets,
 * throttle/noise arrays, IMU snapshots) proportional to the data consumed;
 * ~0.7 measured on typical rotorflight logs with headroom. */
const ESTIMATED_INDEX_BYTES_PER_LOG_BYTE = 0.7;

/* Fallback budget: working set (log buffer + index + UI) allowed per GB of
 * reported device RAM, clamped to a floor for 1–2 GB class devices. */
const WORKING_SET_BYTES_PER_GB = 64 * 1024 * 1024;
const MIN_WORKING_SET_BYTES = 112 * 1024 * 1024;

export function createMemoryGuard({ logDataBytes = 0 } = {}) {
    const heap = typeof performance !== "undefined" ? performance.memory : null;
    const hasHeapApi = Boolean(heap && heap.jsHeapSizeLimit > 0);

    // navigator.deviceMemory exists on Chromium; undefined elsewhere.
    const deviceMemoryGB = typeof navigator !== "undefined" ? navigator.deviceMemory : undefined;
    const hasDeviceMemory = Number.isFinite(deviceMemoryGB) && deviceMemoryGB > 0;

    let lastUsed = 0;
    let lastLimit = 0;
    let aborted = false;

    function budgetBytes() {
        if (!hasDeviceMemory) {
            return Infinity;
        }
        return Math.max(MIN_WORKING_SET_BYTES, deviceMemoryGB * WORKING_SET_BYTES_PER_GB);
    }

    return {
        /**
         * Called at parse checkpoints with the absolute stream position
         * parsed so far. Returns true once — the caller must stop parsing.
         */
        check(bytesParsed = 0) {
            if (aborted) {
                return true;
            }

            if (hasHeapApi) {
                lastUsed = heap.usedJSHeapSize;
                lastLimit = heap.jsHeapSizeLimit;
                if (lastUsed > lastLimit * HEAP_ABORT_RATIO) {
                    aborted = true;
                }
            } else if (hasDeviceMemory) {
                // Estimated working set: the log buffer is already resident,
                // the index grows with the bytes parsed so far.
                lastUsed = logDataBytes + Math.round(bytesParsed * ESTIMATED_INDEX_BYTES_PER_LOG_BYTE);
                lastLimit = budgetBytes();
                if (lastUsed > lastLimit) {
                    aborted = true;
                }
            }
            // No signal at all → never abort (desktop browsers).

            return aborted;
        },

        /** True once the guard has fired. */
        isAborted() {
            return aborted;
        },

        /**
         * Human-readable reason for the abort / current pressure, for the
         * status notice: "used 198 MB of 256 MB heap" or "estimated 210 MB
         * of 192 MB working-set budget (2 GB RAM device)".
         */
        describe() {
            const mb = (n) => `${Math.max(1, Math.round(n / (1024 * 1024)))} MB`;
            if (hasHeapApi) {
                return `used ${mb(lastUsed)} of ${mb(lastLimit)} heap`;
            }
            if (hasDeviceMemory) {
                return `estimated ${mb(lastUsed)} of ${mb(lastLimit)} budget (${deviceMemoryGB} GB RAM device)`;
            }
            return "low memory";
        },

        /**
         * Can a file of `fileBytes` plausibly be loaded at all on this
         * device? Used before the (irreversible) full-file allocation: the
         * load pipeline needs the raw log plus transient copies, so allow
         * 2× the file within the heap/budget. Returns null when the file is
         * acceptable, or a short reason string when it must be refused.
         */
        canAcceptFile(fileBytes) {
            let limit = 0;
            if (hasHeapApi) {
                limit = heap.jsHeapSizeLimit;
            } else if (hasDeviceMemory) {
                limit = budgetBytes();
            } else {
                return null;
            }

            if (fileBytes * 2 > limit * HEAP_ABORT_RATIO) {
                const mb = Math.round(fileBytes / (1024 * 1024));
                const limitMb = Math.round((limit * HEAP_ABORT_RATIO) / (1024 * 1024)) / 2;
                return `File is ${mb} MB — larger than this device can load (~${limitMb} MB)`;
            }
            return null;
        },

        /**
         * The largest file size (in bytes) this device can plausibly load —
         * the exact inverse of the canAcceptFile() criterion. When a file is
         * too large, the caller can read only this many bytes from the FRONT
         * of the file and load that portion (partial load) instead of
         * refusing outright. Returns Infinity when no memory signal exists
         * (desktop browsers never refuse, so never truncate either).
         */
        maxPartialLoadBytes() {
            let limit = 0;
            if (hasHeapApi) {
                limit = heap.jsHeapSizeLimit;
            } else if (hasDeviceMemory) {
                limit = budgetBytes();
            } else {
                return Infinity;
            }

            return Math.floor((limit * HEAP_ABORT_RATIO) / 2);
        },
    };
}
