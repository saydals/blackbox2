/**
 * Helpers for the export in/out markers shared by the BBL and video export dialogs.
 *
 * The graph and seek bar use the `false` sentinel for "no mark", while the Pinia
 * playback store uses `null`. Only a finite timestamp is a real mark, so anything
 * else (`null`, `false`, `undefined`, `NaN`, ...) must fall back to the log's own
 * start/end. Without this, a cleared mark would be treated as a mark at time 0.
 */

/** A marker is usable only when it holds a finite timestamp (microseconds). */
export function isMarkTime(value) {
    return Number.isFinite(value);
}

/**
 * Resolve the marked in/out times into a concrete `[start, end]` range, falling
 * back to the whole log for any bound that is not a real mark. This mirrors the
 * `exportRange()` normalisation used by the video exporter.
 *
 * @param {Object} range
 * @param {number|null|false|undefined} range.inTime - Marked in-point (microseconds)
 * @param {number|null|false|undefined} range.outTime - Marked out-point (microseconds)
 * @param {Function|number} range.getMinTime - Log start time (function or value)
 * @param {Function|number} range.getMaxTime - Log end time (function or value)
 * @returns {{start: number, end: number, minTime: number, maxTime: number, hasIn: boolean, hasOut: boolean}}
 */
export function resolveExportRange({ inTime, outTime, getMinTime, getMaxTime } = {}) {
    const minTime = typeof getMinTime === "function" ? getMinTime() : getMinTime;
    const maxTime = typeof getMaxTime === "function" ? getMaxTime() : getMaxTime;
    const hasIn = isMarkTime(inTime);
    const hasOut = isMarkTime(outTime);

    return {
        start: hasIn ? inTime : minTime,
        end: hasOut ? outTime : maxTime,
        minTime,
        maxTime,
        hasIn,
        hasOut,
    };
}

/**
 * Format an export range relative to the log start as `m:ss – m:ss`
 * (e.g. `0:00 – 0:33`). With no marks the range is the whole log, so it starts
 * at `0:00`; a bound that cannot be resolved is rendered as an em dash.
 *
 * @param {number} start - Range start (microseconds, absolute log time)
 * @param {number} end - Range end (microseconds, absolute log time)
 * @param {number} [baseTime] - Log start used as the 0:00 reference
 * @returns {string}
 */
export function formatExportRangeText(start, end, baseTime = 0) {
    const fmt = (t) => {
        if (!Number.isFinite(t)) return "—";
        const sec = Math.max(0, (t - (Number.isFinite(baseTime) ? baseTime : 0)) / 1000000);
        const m = Math.floor(sec / 60);
        const s = Math.floor(sec % 60);
        return `${m}:${String(s).padStart(2, "0")}`;
    };
    return `${fmt(start)} – ${fmt(end)}`;
}