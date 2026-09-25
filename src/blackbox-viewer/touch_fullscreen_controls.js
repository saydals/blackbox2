import { GRAPH_MIN_ZOOM, GRAPH_MAX_ZOOM } from "./stores/graph.js";

/**
 * Android touch gesture layer for the graph canvas.
 *
 * This module gives the graph canvas a touch gesture set, active
 * whenever a log is loaded on an Android device (not just in
 * fullscreen):
 *
 *   Gesture zone — the RIGHT HALF of the canvas only (x >= 50 % of the
 *   width). The left half is reserved for the analyser overlay (#analyser:
 *   spectrum type select, zoom sliders, PSD inputs — real touch targets),
 *   so the gesture layer ignores every touch that begins there.
 *
 *   tap  50–65 %   → playback rate one STEP down the shared ladder
 *                    (10·25·50·75·100·150·200 %, see stores/playback.js)
 *   tap  65–85 %   → play / pause toggle
 *   tap  85–100 %  → playback rate one STEP up the shared ladder
 *   two-finger drag (anchored in the zone) → pinch zoom of the time window
 *   one-finger drag (starts in the zone)   → pan the graph through time
 *
 * Gesture recognition lives here; every action is a callback supplied by
 * main.js, so playback, rate and zoom run through the exact same pipeline
 * (playback_controls.js → video sync) the hidden toolbar buttons use.
 * In particular the pan callback feeds `graph.onSeek` — the offset formula
 * and the ×2 "seek faster" factor stay identical to the desktop mouse drag.
 *
 * The grapher's own single-finger drag-to-seek handler (grapher.js
 * onTouchStart) is disabled on Android since this layer owns all
 * touch interactions on the right half of the canvas.
 */

/* A touch counts as a tap only while it stays inside this pixel budget and
 * this time budget; anything else is a pan and must not fire a zone action. */
const TAP_SLOP_PX = 10;
const TAP_MAX_MS = 350;

/* Gesture zone — right half of the canvas, as a fraction of its width.
 * Touches that begin left of this line are not gestures: they belong to
 * the analyser overlay (frequency box) and stay untouched by this layer.
 * The decorative craft/stick canvases that used to swallow touches inside
 * the right half are made click-through in main.css (pointer-events:none),
 * so the zone below is guaranteed reachable edge to edge (50–100 %). */
export const TOUCH_ZONE_START = 0.5;

/* Tap verdict bounds INSIDE the gesture zone, still expressed as fractions
 * of the FULL canvas width: 50–65 slow, 65–85 play/pause, 85–100 fast.
 * The verdict uses where the finger WENT DOWN (not where it lifted), so
 * the zone under the finger at touch time decides the action. */
export const TOUCH_ZONE_SLOW_END = 0.65;
export const TOUCH_ZONE_CENTER_END = 0.85;

/**
 * @param {Object} ctx
 * @param {HTMLCanvasElement} ctx.canvas - #graphCanvas (fills .log-graph)
 * @param {Object} ctx.graphStore - graph Pinia store (isFullscreen, graphZoom, graph)
 * @param {Object} ctx.logStore - log Pinia store (hasLog)
 * @param {Object} ctx.actions
 * @param {Function} ctx.actions.onGraphSeek - offset micros (same units as graph.onSeek)
 * @param {Function} ctx.actions.onPlayPause
 * @param {Function} ctx.actions.onRateDown - playback rate one ladder step down
 * @param {Function} ctx.actions.onRateUp - playback rate one ladder step up
 * @param {Function} ctx.actions.onZoom - zoom factor in percent units, clamped by the caller
 * @returns {Function} destroy — removes the listeners
 */
export function attachFullscreenTouchControls({ canvas, graphStore, logStore, actions }) {
    const { onGraphSeek, onPlayPause, onRateDown, onRateUp, onZoom } = actions;

    // idle → deciding → (tap | pan) → idle, or deciding|pan → pinch → idle.
    let mode = "idle";
    let startX = 0;
    let startY = 0;
    let startTime = 0;
    let startXFraction = 0;
    let lastX = 0;
    let pinchStartDist = 0;
    let pinchStartZoom = 0;

    function active() {
        return logStore.hasLog && graphStore.graph != null;
    }

    function pinchDistance(e) {
        const a = e.touches[0];
        const b = e.touches[1];
        return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    }

    /* X of a client-space point as a fraction of the on-screen canvas box
     * (CSS pixels — the same space the tap zones are defined in). */
    function canvasXFraction(clientX) {
        const rect = canvas.getBoundingClientRect();
        return (clientX - rect.left) / rect.width;
    }

    function inGestureZone(clientX) {
        return canvasXFraction(clientX) >= TOUCH_ZONE_START;
    }

    function beginDecision(e) {
        const x = canvasXFraction(e.touches[0].clientX);
        if (x < TOUCH_ZONE_START) {
            // Survivor finger of a pinch drifted into the analyser half —
            // never start a tap decision from the left half.
            mode = "idle";
            return;
        }
        mode = "deciding";
        startXFraction = x;
        startX = lastX = e.touches[0].pageX;
        startY = e.touches[0].pageY;
        startTime = Date.now();
    }

    function onTouchStart(e) {
        if (!active()) {
            return;
        }
        // Zone gate — the FIRST touch of the list anchors the gesture. When
        // it starts on the left half this layer stands down entirely and
        // does NOT preventDefault(), so the analyser overlay and everything
        // under it keep their native touch behavior. (This also rejects a
        // pinch whose first finger landed on the analyser.)
        if (!inGestureZone(e.touches[0].clientX)) {
            return;
        }
        if (e.touches.length === 1) {
            beginDecision(e);
        } else if (e.touches.length === 2) {
            // Pinch takes over from whatever the first finger was doing; the
            // zoom is anchored on the spread the two fingers started with.
            mode = "pinch";
            pinchStartDist = pinchDistance(e);
            pinchStartZoom = graphStore.graphZoom;
        } else {
            // Three or more fingers — leave gesture mode entirely so a stray
            // extra finger can never keep a stale pan/pinch alive.
            mode = "idle";
        }
        e.preventDefault();
    }

    function onTouchMove(e) {
        if (mode === "deciding") {
            const dx = e.touches[0].pageX - startX;
            const dy = e.touches[0].pageY - startY;
            if (Math.hypot(dx, dy) <= TAP_SLOP_PX) {
                return; // still a candidate tap — wait for touchend
            }
            // Crossed the slop budget: this is a pan. Re-baseline lastX so the
            // jitter accumulated before the decision is not seeked away.
            mode = "pan";
            lastX = e.touches[0].pageX;
        }

        if (mode === "pan") {
            const x = e.touches[0].pageX;
            // Same formula and units as grapher.js onTouchMove: fraction of
            // the canvas width mapped onto the visible window width. main.js
            // applies the ×2 "seek faster" factor inside graph.onSeek.
            const windowWidth = graphStore.graph.getWindowWidthTime();
            onGraphSeek(((lastX - x) / canvas.width) * windowWidth);
            lastX = x;
        } else if (mode === "pinch") {
            if (e.touches.length >= 2 && pinchStartDist > 0) {
                const dist = pinchDistance(e);
                // 1:1 with the finger spread; the window stays centered on the
                // time cursor because grapher.render() always centers it.
                const zoom = Math.max(
                    GRAPH_MIN_ZOOM,
                    Math.min(GRAPH_MAX_ZOOM, pinchStartZoom * (dist / pinchStartDist)),
                );
                onZoom(zoom);
            }
        } else {
            return;
        }
        e.preventDefault();
    }

    function onTouchEnd(e) {
        if (mode === "deciding" && Date.now() - startTime <= TAP_MAX_MS) {
            // Zone verdict from where the finger WENT DOWN (startXFraction,
            // fraction of the full canvas width): 50–65 one rate step down,
            // 65–85 play/pause, 85–100 one rate step up. A deciding touch
            // always started in the gesture zone, so no left-half case can
            // reach here.
            if (startXFraction < TOUCH_ZONE_SLOW_END) {
                onRateDown();
            } else if (startXFraction < TOUCH_ZONE_CENTER_END) {
                onPlayPause();
            } else {
                onRateUp();
            }
        }

        if (e.touches.length === 0) {
            mode = "idle";
        } else if (e.touches.length === 1 && mode === "pinch") {
            // One finger lifted out of a pinch: the survivor restarts the tap
            // decision so a follow-up tap or pan works without re-touching.
            beginDecision(e);
        }
    }

    function onTouchCancel() {
        mode = "idle";
    }

    // passive: false — these handlers must be allowed to preventDefault(); the
    // gesture set below relies on blocking the WebView's default touch moves.
    canvas.addEventListener("touchstart", onTouchStart, { passive: false });
    canvas.addEventListener("touchmove", onTouchMove, { passive: false });
    canvas.addEventListener("touchend", onTouchEnd);
    canvas.addEventListener("touchcancel", onTouchCancel);

    return function destroy() {
        canvas.removeEventListener("touchstart", onTouchStart);
        canvas.removeEventListener("touchmove", onTouchMove);
        canvas.removeEventListener("touchend", onTouchEnd);
        canvas.removeEventListener("touchcancel", onTouchCancel);
    };
}
