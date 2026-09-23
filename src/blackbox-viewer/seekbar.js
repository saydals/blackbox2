import { ThemeColors } from "./theme_colors";

// Theme-aware color functions
function getBackgroundStyle() {
    return ThemeColors.getGraphBackground();
}

function getEventBarStyle() {
    return "#8d8"; // Green color works in both themes
}

function getOutsideExportRangeStyle() {
    return "rgba(100, 100, 100, 0.5)"; // Dimming overlay works in both themes
}

function getSelectedRangeStyle() {
    return "rgba(120, 120, 120, 0.32)"; // Highlight for the selected export range
}

function getCursorStyle() {
    return "rgba(255, 64, 64, 0.75)"; // Red cursor works in both themes
}

function getCursorStyleWindow() {
    return "rgba(255, 65, 64, 0.15)"; // Red window overlay works in both themes
}

function getSelectionLineStyle() {
    return "rgba(30, 120, 255, 0.95)"; // Blue selection boundary lines work in both themes
}

export function SeekBar(canvas) {
    const that = this;
    //Times:
    let min;
    let max;
    let current;
    let currentWindow = 0;
    //Activity to display on bar:
    let activityStrength;
    let activityTime;
    //Whether a special event exists at the given time:
    let hasEvent;
    //Expect to be plotting PWM-like data by default:
    let activityMin = 1000;
    let activityMax = 2000;
    const canvasContext = canvas.getContext("2d");
    const background = document.createElement("canvas");
    const backgroundContext = background.getContext("2d");
    let inTime = false;
    let outTime = false;
    let backgroundValid = false;
    let dirtyRegion = false;
    //Severity badge (noise modes): absolute vibration score + its band colour. null when
    //the plotted value has no absolute scale (e.g. collective pitch).
    let severityScore = null;
    let severityColor = null;
    //Current time cursor:
    let CURSOR_WIDTH = 1;
    // The bar begins a couple of px inset from the left to allow the cursor to hang over the edge at start&end
    let BAR_INSET = CURSOR_WIDTH;
    // In/out boundary lines: 8px (2x the previous 4px, 8x the original 1px hairline), DPR-scaled
    let MARK_LINE_WIDTH = 8;
    // Distance (canvas px) from a boundary line within which a press starts a drag instead of a seek
    let MARK_GRAB_THRESHOLD = 8;
    //null while no mark is being dragged, otherwise "in" or "out"
    let markDragMode = null;

    this.onSeek = false;
    // Called with the new time while the user drags the in/out boundary line (wired to
    // setVideoInTime/setVideoOutTime in main.js so the store, graph and dialogs stay in sync)
    this.onSetInTime = false;
    this.onSetOutTime = false;

    function domXToCanvasX(domX) {
        const bounding = canvas.getBoundingClientRect();

        // Compensate for canvas being stretched on the page
        return (domX / (bounding.right - bounding.left)) * canvas.width;
    }

    function canvasXToTime(x) {
        return ((x - BAR_INSET) * (max - min)) / (canvas.width - 1 - BAR_INSET * 2) + min;
    }

    function timeToCanvasX(time) {
        const pixelTimeStep = (max - min) / (canvas.width - BAR_INSET * 2);

        return (time - min) / pixelTimeStep + BAR_INSET;
    }

    //Returns "in"/"out" when a press at the given document X starts a boundary-line drag, else null
    function markAt(domX) {
        if (typeof min !== "number" || typeof max !== "number" || !(max > min)) {
            return null;
        }

        const x = domXToCanvasX(domX);
        const inX = inTime !== false ? timeToCanvasX(inTime) : null;
        const outX = outTime !== false ? timeToCanvasX(outTime) : null;
        const nearIn = inX !== null && Math.abs(x - inX) <= MARK_GRAB_THRESHOLD;
        const nearOut = outX !== null && Math.abs(x - outX) <= MARK_GRAB_THRESHOLD;

        if (nearIn && nearOut) {
            //Both lines under the pointer: grab whichever is closer
            return Math.abs(x - inX) <= Math.abs(x - outX) ? "in" : "out";
        }

        if (nearIn) {
            return "in";
        }

        if (nearOut) {
            return "out";
        }

        return null;
    }

    function seekToDOMPixel(x) {
        if (typeof min !== "number" || typeof max !== "number" || !(max > min)) {
            return;
        }

        let time = canvasXToTime(domXToCanvasX(x));

        if (time < min) {
            time = min;
        }

        if (time > max) {
            time = max;
        }

        if (that.onSeek) {
            that.onSeek(time);
        }

        that.repaint();
    }

    function invalidateBackground() {
        backgroundValid = false;
    }

    function getCanvasOffsetLeft() {
        return canvas.getBoundingClientRect().left + window.scrollX;
    }

    let cancelMouseDrag = null;
    let cancelTouchDrag = null;

    function onMouseMove(e) {
        if (e.button === 0) {
            seekToDOMPixel(e.pageX - getCanvasOffsetLeft());
        }
    }

    function onMouseDown(e) {
        e.preventDefault();

        if (e.button === 0) {
            const domX = e.pageX - getCanvasOffsetLeft();
            const grabbed = markAt(domX);

            if (grabbed) {
                markDragMode = grabbed;

                function onMarkMouseMove(e) {
                    if (markDragMode && e.button === 0) {
                        dragMarkToDOMPixel(markDragMode, e.pageX - getCanvasOffsetLeft());
                    }
                }

                function onMarkMouseUp() {
                    markDragMode = null;
                    document.body.removeEventListener("mousemove", onMarkMouseMove);
                    document.body.removeEventListener("mouseup", onMarkMouseUp);
                    cancelMouseDrag = null;
                }
                cancelMouseDrag = onMarkMouseUp;
                document.body.addEventListener("mousemove", onMarkMouseMove);
                document.body.addEventListener("mouseup", onMarkMouseUp);

                return;
            }

            seekToDOMPixel(domX);
            document.body.addEventListener("mousemove", onMouseMove);

            function onMouseUp() {
                document.body.removeEventListener("mousemove", onMouseMove);
                document.body.removeEventListener("mouseup", onMouseUp);
                cancelMouseDrag = null;
            }
            cancelMouseDrag = onMouseUp;
            document.body.addEventListener("mouseup", onMouseUp);
        }
    }

    canvas.addEventListener("mousedown", onMouseDown);

    function updateHoverCursor(e) {
        if (markDragMode) {
            canvas.style.cursor = "ew-resize";
            return;
        }

        const domX = e.clientX - canvas.getBoundingClientRect().left;
        canvas.style.cursor = markAt(domX) ? "ew-resize" : "";
    }

    canvas.addEventListener("mousemove", updateHoverCursor);
    canvas.addEventListener("mouseleave", () => {
        if (!markDragMode) {
            canvas.style.cursor = "";
        }
    });

    function dragMarkToDOMPixel(which, domX) {
        const time = canvasXToTime(domXToCanvasX(domX));
        const mark = Number.isFinite(time) ? time : null;

        if (mark === null) {
            return;
        }

        // Clamp to the log range, then keep the selection valid (in must stay ≤ out)
        if (which === "in") {
            const clamped = Math.min(Math.max(mark, min), outTime !== false ? Math.min(outTime, max) : max);

            if (that.onSetInTime) {
                that.onSetInTime(clamped);
            }
            that.setInTime(clamped);
        } else {
            const clamped = Math.min(Math.max(mark, inTime !== false ? Math.max(inTime, min) : min), max);

            if (that.onSetOutTime) {
                that.onSetOutTime(clamped);
            }
            that.setOutTime(clamped);
        }

        that.repaint();
    }

    function onTouchMove(e) {
        seekToDOMPixel(e.touches[0].pageX - getCanvasOffsetLeft());
    }

    function onTouchStart(e) {
        e.preventDefault();

        const domX = e.touches[0].pageX - getCanvasOffsetLeft();
        const grabbed = markAt(domX);

        if (grabbed) {
            markDragMode = grabbed;

            function onMarkTouchMove(e) {
                if (markDragMode) {
                    dragMarkToDOMPixel(markDragMode, e.touches[0].pageX - getCanvasOffsetLeft());
                }
            }

            function onMarkTouchEnd() {
                markDragMode = null;
                document.body.removeEventListener("touchmove", onMarkTouchMove);
                document.body.removeEventListener("touchend", onMarkTouchEnd);
                document.body.removeEventListener("touchcancel", onMarkTouchEnd);
                cancelTouchDrag = null;
            }
            cancelTouchDrag = onMarkTouchEnd;
            document.body.addEventListener("touchmove", onMarkTouchMove);
            document.body.addEventListener("touchend", onMarkTouchEnd);
            document.body.addEventListener("touchcancel", onMarkTouchEnd);

            return;
        }

        seekToDOMPixel(domX);
        document.body.addEventListener("touchmove", onTouchMove);

        function onTouchEnd() {
            document.body.removeEventListener("touchmove", onTouchMove);
            document.body.removeEventListener("touchend", onTouchEnd);
            document.body.removeEventListener("touchcancel", onTouchEnd);
            cancelTouchDrag = null;
        }
        cancelTouchDrag = onTouchEnd;
        document.body.addEventListener("touchend", onTouchEnd);
        document.body.addEventListener("touchcancel", onTouchEnd);
    }

    canvas.addEventListener("touchstart", onTouchStart);

    this.destroy = function () {
        canvas.removeEventListener("mousedown", onMouseDown);
        canvas.removeEventListener("touchstart", onTouchStart);
        canvas.removeEventListener("mousemove", updateHoverCursor);
        if (cancelMouseDrag) {
            cancelMouseDrag();
        }
        if (cancelTouchDrag) {
            cancelTouchDrag();
        }
    };

    this.resize = function (width, height) {
        const ratio = globalThis.devicePixelRatio ? globalThis.devicePixelRatio : 1;

        canvas.width = width * ratio;
        canvas.height = height * ratio;

        background.width = width * ratio;
        background.height = height * ratio;

        CURSOR_WIDTH = 2.5 * ratio;
        BAR_INSET = CURSOR_WIDTH;
        MARK_LINE_WIDTH = 4 * ratio;
        MARK_GRAB_THRESHOLD = 8 * ratio;

        invalidateBackground();

        that.repaint();
    };

    // Activity bar colour: the severity band colour when available (noise modes — the whole
    // graph is tinted by the log's absolute vibration level), otherwise the theme default.
    function barStyle() {
        if (severityColor) {
            return severityColor;
        }
        return ThemeColors.isDarkTheme() ? "rgba(200,200,255, 0.9)" : "rgba(170,170,255, 0.9)";
    }

    this.setSeverity = function (score, color) {
        severityScore = score;
        severityColor = color;
        invalidateBackground();
    };

    this.setActivityRange = function (min, max) {
        activityMin = min;
        activityMax = max;

        invalidateBackground();
    };

    this.setTimeRange = function (newMin, newMax, newCurrent) {
        min = newMin;
        max = newMax;
        current = newCurrent;

        invalidateBackground();
    };

    this.setActivity = function (newActivityTimes, newActivityStrengths, newHasEvent) {
        activityTime = newActivityTimes;
        activityStrength = newActivityStrengths;
        hasEvent = newHasEvent;

        invalidateBackground();
    };

    this.setCurrentTime = function (newTime) {
        current = newTime;
    };

    this.setWindow = function (newTime) {
        currentWindow = newTime;
    };

    function rebuildBackground() {
        let x, activityIndex, activity, pixelTimeStep, time;

        backgroundContext.fillStyle = getBackgroundStyle();
        backgroundContext.fillRect(0, 0, canvas.width, canvas.height);

        if (max > min) {
            pixelTimeStep = (max - min) / (canvas.width - BAR_INSET * 2);

            if (activityTime.length) {
                //Draw events
                backgroundContext.strokeStyle = getEventBarStyle();
                backgroundContext.beginPath();

                time = min;
                activityIndex = 0;

                for (x = BAR_INSET; x < canvas.width - BAR_INSET; x++) {
                    //Advance to the right entry in the activity array for this time
                    while (activityIndex < activityTime.length && time >= activityTime[activityIndex]) {
                        activityIndex++;
                    }

                    activityIndex--;

                    if (activityIndex > 0) {
                        if (hasEvent[activityIndex]) {
                            backgroundContext.moveTo(x, canvas.height);
                            backgroundContext.lineTo(x, 0);
                        }
                    }

                    time += pixelTimeStep;
                }

                backgroundContext.stroke();

                //Draw activity bars
                backgroundContext.strokeStyle = barStyle();
                backgroundContext.beginPath();

                time = min;
                activityIndex = 0;

                for (x = BAR_INSET; x < canvas.width - BAR_INSET; x++) {
                    //Advance to the right entry in the activity array for this time
                    while (activityIndex < activityTime.length && time >= activityTime[activityIndex]) {
                        activityIndex++;
                    }

                    activityIndex--;

                    if (activityIndex > 0) {
                        activity =
                            ((activityStrength[activityIndex] - activityMin) / (activityMax - activityMin)) *
                            canvas.height;
                        // Clamp: values outside the normalisation range (e.g. noise spikes above
                        // the p95 headroom) must not draw outside the bar.
                        activity = Math.max(0, Math.min(canvas.height, activity));
                        backgroundContext.moveTo(x, canvas.height);
                        backgroundContext.lineTo(x, canvas.height - activity);
                    }

                    time += pixelTimeStep;
                }

                backgroundContext.stroke();
            }

            // Severity score badge (noise modes): the log's absolute vibration level, drawn
            // boldly at the start of the graph in its band colour. Dark outline keeps it
            // readable over the bars in both themes.
            if (severityScore !== null && severityColor) {
                const scoreText = String(severityScore);
                backgroundContext.font = "bold 12px sans-serif";
                backgroundContext.textBaseline = "top";
                backgroundContext.lineWidth = 3;
                backgroundContext.strokeStyle = "rgba(0, 0, 0, 0.85)";
                backgroundContext.strokeText(scoreText, 5, 3);
                backgroundContext.fillStyle = severityColor;
                backgroundContext.fillText(scoreText, 5, 3);
            }

            // Paint selected export range (highlighted) instead of dimming the outside
            if (inTime !== false && outTime !== false) {
                backgroundContext.fillStyle = getSelectedRangeStyle();
                const barStartX = (inTime - min) / pixelTimeStep + BAR_INSET;
                const barEndX = (outTime - min) / pixelTimeStep + BAR_INSET;
                backgroundContext.fillRect(barStartX, 0, barEndX - barStartX, canvas.height);
            }

            // Draw in/out boundary lines in the cached background — blue and 4x thicker
            if (inTime !== false) {
                const inX = (inTime - min) / pixelTimeStep + BAR_INSET;
                backgroundContext.fillStyle = getSelectionLineStyle();
                backgroundContext.fillRect(inX - MARK_LINE_WIDTH / 2, 0, MARK_LINE_WIDTH, canvas.height);
            }
            if (outTime !== false) {
                const outX = (outTime - min) / pixelTimeStep + BAR_INSET;
                backgroundContext.fillStyle = getSelectionLineStyle();
                backgroundContext.fillRect(outX - MARK_LINE_WIDTH / 2, 0, MARK_LINE_WIDTH, canvas.height);
            }

            backgroundValid = true;
        }
    }

    this.repaint = function () {
        if (canvas.width === 0 || canvas.height === 0) {
            return;
        }

        if (!backgroundValid) {
            dirtyRegion = false;
            rebuildBackground();
        }

        if (dirtyRegion === false) {
            canvasContext.drawImage(background, 0, 0);
        } else {
            canvasContext.drawImage(
                background,
                dirtyRegion.x,
                dirtyRegion.y,
                dirtyRegion.width,
                dirtyRegion.height,
                dirtyRegion.x,
                dirtyRegion.y,
                dirtyRegion.width,
                dirtyRegion.height,
            );
        }

        //Draw cursor
        const pixelTimeStep = (max - min) / (canvas.width - BAR_INSET * 2);
        const cursorX = (current - min) / pixelTimeStep + BAR_INSET;
        let cursorWidth = 0;

        if (currentWindow !== 0) {
            cursorWidth = currentWindow / 2 / pixelTimeStep;
        }

        canvasContext.fillStyle = getCursorStyle();
        if (cursorWidth < CURSOR_WIDTH) {
            cursorWidth = CURSOR_WIDTH;
            canvasContext.fillRect(cursorX - CURSOR_WIDTH, 0, CURSOR_WIDTH * 2, canvas.height);
        } else {
            canvasContext.fillRect(cursorX - CURSOR_WIDTH, 0, CURSOR_WIDTH * 2, canvas.height);

            canvasContext.fillStyle = getCursorStyleWindow(); // paint window
            canvasContext.fillRect(cursorX - cursorWidth, 0, cursorWidth * 2, canvas.height);
        }

        dirtyRegion = {
            x: Math.max(Math.floor(cursorX - cursorWidth - 1), 0),
            y: 0,
            width: Math.ceil(cursorWidth * 2 + 2),
            height: canvas.height,
        };
    };

    this.setInTime = function (newInTime) {
        inTime = newInTime;
        invalidateBackground();
    };

    this.setOutTime = function (newOutTime) {
        outTime = newOutTime;
        invalidateBackground();
    };

    this.refreshTheme = function () {
        invalidateBackground();
        that.repaint();
    };

    background.width = canvas.width;
    background.height = canvas.height;
}
