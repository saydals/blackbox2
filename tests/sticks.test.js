import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { createPinia, setActivePinia } from "pinia";

import { FlightLogSticks } from "../src/blackbox-viewer/sticks.js";
import { useSettingsStore } from "../src/blackbox-viewer/stores/settings.js";

const RF = 5;
const BF = 3;
const RC_COMMAND_NAMES = ["rcCommand[0]", "rcCommand[1]", "rcCommand[2]", "rcCommand[3]"];

/** Minimal flight log stub: sticks.js only needs sysConfig + field names. */
function stubLog(firmwareType) {
    return {
        getSysConfig: () => ({ blackbox_high_resolution: 0, rcRate: 100, firmwareType }),
        getMainFieldIndexByName: (name) => RC_COMMAND_NAMES.indexOf(name),
        getMainFieldNames: () => RC_COMMAND_NAMES,
    };
}

/** Canvas 2d stub that records the stick dot positions (arc calls). */
function stubCanvas(rec) {
    const noop = () => undefined;
    const handler = {
        get(_target, prop) {
            if (prop === "arc") {
                return (x, y, r) => rec.arcs.push([x, y, r]);
            }
            if (prop === "fillText") {
                return (text) => rec.texts.push(text);
            }
            return noop;
        },
        set() {
            return true;
        },
    };
    const ctx = new Proxy({}, handler);
    return { width: 200, height: 150, getContext: () => ctx };
}

/**
 * Render one frame and return the recorded arcs.
 * arcs[0] is the left stick dot (x = stickPositions[0], y = stickPositions[1]),
 * arcs[1] is the right stick dot (x = stickPositions[2], y = stickPositions[3]).
 */
function renderSticks(firmwareType, frameValues, settings) {
    const store = useSettingsStore();
    Object.assign(store.userSettings, {
        stickMode: 2,
        stickUnits: false,
        stickTrails: false,
        eraseBackground: false,
        ...settings,
    });

    const rec = { arcs: [], texts: [] };
    const canvas = stubCanvas(rec);
    const sticks = new FlightLogSticks(stubLog(firmwareType), [0, 1, 2, 3], canvas);
    sticks.resize(canvas.width, canvas.height);
    sticks.render({ 0: frameValues[0], 1: frameValues[1], 2: frameValues[2], 3: frameValues[3] }, null, null, 0);
    return rec;
}

/**
 * Expected scale factor for the 200x150 test canvas.
 * render() computes stickSurroundRadius = min(width/4 - spacing, height/2 - spacing - fontSize).
 * fontSizeValueLabel = max(8, 150/15) = 10; spacing = min(15, 20, 16) = 15;
 * radius = min(200/4 - 15, 150/2 - 15 - 10) = min(35, 50) = 35.
 */
const EXPECTED_SCALE = 35;

describe("stick overlay", () => {
    beforeEach(() => {
        setActivePinia(createPinia());
    });

    it("yaw 기본값(stickInvertYaw=false)은 비반전(raw +rcCommand[2]) 사용", () => {
        // 앱 규약: 기본값에서 yaw는 비반전 (default false → +rcCommand[2])
        const full = renderSticks(RF, [0, 0, 500, 0], { stickInvertYaw: false });
        expect(full.arcs).toHaveLength(2);
        expect(full.arcs[0][0]).toBeCloseTo(1 * EXPECTED_SCALE, 10); // yaw +500 → +1 × 35 (비반전)

        const inverted = renderSticks(RF, [0, 0, 500, 0], { stickInvertYaw: true });
        expect(inverted.arcs[0][0]).toBeCloseTo(-1 * EXPECTED_SCALE, 10);

        // 반대 극도 동일 규칙
        const negative = renderSticks(RF, [0, 0, -500, 0], { stickInvertYaw: false });
        expect(negative.arcs[0][0]).toBeCloseTo(-1 * EXPECTED_SCALE, 10);
    });

    it("yaw 극성은 펌웨어와 무관하게 비반전 기본 동작(BF 회귀)", () => {
        const bf = renderSticks(BF, [0, 0, 500, 1500], { stickInvertYaw: false });
        expect(bf.arcs[0][0]).toBeCloseTo(1 * EXPECTED_SCALE, 10);
    });

    it("수직축: RF는 collective(-rcCommand[3]/500), BF는 throttle((1500-rcCommand[3])/500) 유지", () => {
        // ref: rfblackbox/js/sticks.js:224 — -rcCommand[3] / 500 (Collective, ±500)
        expect(renderSticks(RF, [0, 0, 0, 500], {}).arcs[0][1]).toBeCloseTo(-1 * EXPECTED_SCALE, 10);
        expect(renderSticks(RF, [0, 0, 0, -500], {}).arcs[0][1]).toBeCloseTo(1 * EXPECTED_SCALE, 10);
        expect(renderSticks(RF, [0, 0, 0, 0], {}).arcs[0][1]).toBeCloseTo(0, 10);

        // BF 회귀: 기존 (1500 - value) / 500 그대로
        expect(renderSticks(BF, [0, 0, 0, 2000], {}).arcs[0][1]).toBeCloseTo(-1 * EXPECTED_SCALE, 10);
        expect(renderSticks(BF, [0, 0, 0, 1000], {}).arcs[0][1]).toBeCloseTo(1 * EXPECTED_SCALE, 10);
        expect(renderSticks(BF, [0, 0, 0, 1500], {}).arcs[0][1]).toBeCloseTo(0, 10);
    });

    it("구버그(기본값에서 yaw 미반전) 재발 방지 정적 검증", () => {
        const src = readFileSync("src/blackbox-viewer/sticks.js", "utf8");
        expect(src).toContain("(userSettings.stickInvertYaw ? -1 : 1) * rcCommand[2]");
        expect(src).not.toContain("(userSettings.stickInvertYaw ? 1 : -1) * rcCommand[2]");
    });
});
