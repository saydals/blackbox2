import { GRAPH_MIN_ZOOM, GRAPH_MAX_ZOOM } from "./stores/graph.js";

/**
 * Android fullscreen touch gesture layer for the graph canvas.
 *
 * In graph-only fullscreen the toolbar, the seek bar and the status bar are
 * all hidden (the `.is-fullscreen` rules in main.css) and an Android APK has
 * no keyboard, so nothing can play/pause, change the rate or zoom the graph
 * any more. This module gives the graph canvas a touch gesture set, active
 * only while the graph-only fullscreen is on and a log is loaded:
 *
 *   tap  left third   → slow playback (TOUCH_SLOW_RATE, plays if paused)
 *   tap  center third → play / pause toggle
 *   tap  right third  → fast playback (TOUCH_FAST_RATE, plays if paused)
 *   two-finger drag   → pinch zoom of the graph time window
 *   one-finger drag   → pan the graph through time
 *
 * Gesture recognition lives here; every action is a callback supplied by
 * main.js, so playback, rate and zoom run through the exact same pipeline
 * (playback_controls.js → video sync) the hidden toolbar buttons use. In
 * particular the pan callback feeds `graph.onSeek` — the offset formula and
 * the ×2 "seek faster" factor stay identical to the desktop mouse drag.
 *
 * The grapher's own single-finger drag-to-seek handler (grapher.js
 * onTouchStart) must stand down while this layer owns the canvas; main.js
 * flips `graph.touchSeekEnabled` to false for the
 * fullscreen+Android combination and restores it otherwise.
 */

/* "%" playback rates for the left / right tap zones. Both are members of the
 * SpeedPanel STEPS list so the hidden Speed readout stays on a known step:
 * 25 % is the slowest practical watch-speed step, 200 % is the fastest one. */
export const TOUCH_SLOW_RATE = 25;
export const TOUCH_FAST_RATE = 200;

/* A touch counts as a tap only while it stays inside this pixel budget and
 * this time budget; anything else is a pan and must not fire a zone action. */
const TAP_SLOP_PX = 10;
const TAP_MAX_MS = 350;

/**
 * @param {Object} ctx
 * @param {HTMLCanvasElement} ctx.canvas - #graphCanvas (fills .log-graph)
 * @param {Object} ctx.graphStore - graph Pinia store (isFullscreen, graphZoom, graph)
 * @param {Object} ctx.logStore - log Pinia store (hasLog)
 * @param {Object} ctx.actions
 * @param {Function} ctx.actions.onGraphSeek - offset micros (same units as graph.onSeek)
 * @param {Function} ctx.actions.onPlayPause
 * @param {Function} ctx.actions.onSlowPlay
 * @param {Function} ctx.actions.onFastPlay
 * @param {Function} ctx.actions.onZoom - zoom factor in percent units, clamped by the caller
 * @returns {Function} destroy — removes the listeners
 */
export function attachFullscreenTouchControls({ canvas, graphStore, logStore, actions }) {
    const { onGraphSeek, onPlayPause, onSlowPlay, onFastPlay, onZoom } = actions;

    // idle → deciding → (tap | pan) → idle, or deciding|pan → pinch → idle.
    let mode = "idle";
    let startX = 0;
    let startY = 0;
    let startTime = 0;
    let lastX = 0;
    let pinchStartDist = 0;
    let pinchStartZoom = 0;

    function active() {
        return graphStore.isFullscreen && logStore.hasLog && graphStore.graph != null;
    }

    function pinchDistance(e) {
        const a = e.touches[0];
        const b = e.touches[1];
        return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    }

    function beginDecision(e) {
        mode = "deciding";
        startX = lastX = e.touches[0].pageX;
        startY = e.touches[0].pageY;
        startTime = Date.now();
    }

    function onTouchStart(e) {
        if (!active()) {
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
            // Zone verdict from where the finger LIFTED (changedTouches), in
            // CSS pixels relative to the on-screen canvas box.
            const rect = canvas.getBoundingClientRect();
            const x = (e.changedTouches[0].clientX - rect.left) / rect.width;
            if (x < 1 / 3) {
                onSlowPlay();
            } else if (x < 2 / 3) {
                onPlayPause();
            } else {
                onFastPlay();
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
