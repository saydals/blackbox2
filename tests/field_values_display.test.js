import { beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createPinia, setActivePinia } from "pinia";

import { pinia } from "../src/js/pinia_instance.js";
import { FlightLog } from "../src/blackbox-viewer/flightlog.js";
import { updateValuesChart } from "../src/blackbox-viewer/values_display.js";
import { showValueTable } from "../src/blackbox-viewer/playback_controls.js";
import { useGraphStore } from "../src/blackbox-viewer/stores/graph.js";
import { useLogStore } from "../src/blackbox-viewer/stores/log.js";
import { defaultUserSettings } from "../src/blackbox-viewer/user_settings_data.js";

function loadSampleLog() {
    const bytes = readFileSync(new URL("../sample.bbl", import.meta.url));
    const log = new FlightLog(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength));
    expect(log.openLog(0)).toBe(true);
    return log;
}

function createStores(flightLog) {
    return {
        logStore: {
            flightLog,
            currentBlackboxTime: flightLog.getMinTime(),
            fieldValues: [],
            fieldStats: [],
        },
        graphStore: {
            hasTableOverlay: true,
            hasMarker: false,
            markerTime: null,
        },
        appStore: {},
    };
}

describe("Field Values timeline display", () => {
    beforeEach(() => {
        setActivePinia(createPinia());
    });

    it("fills every logged field from the current RF frame", () => {
        const flightLog = loadSampleLog();
        const { logStore, graphStore, appStore } = createStores(flightLog);

        expect(() => updateValuesChart(logStore, graphStore, appStore, defaultUserSettings)).not.toThrow();

        const fieldNames = flightLog.getMainFieldNames();
        expect(logStore.fieldValues).toHaveLength(fieldNames.length);
        expect(logStore.fieldValues.every(({ name, raw, decoded }) => name && raw !== undefined && decoded !== undefined)).toBe(true);
    });

    it("populates immediately when the View table control opens the panel", () => {
        const flightLog = loadSampleLog();
        const logStore = useLogStore(pinia);
        const graphStore = useGraphStore(pinia);
        logStore.flightLog = flightLog;
        logStore.currentBlackboxTime = flightLog.getMinTime();
        logStore.fieldValues = [];
        logStore.fieldStats = [];
        graphStore.hasTableOverlay = false;

        showValueTable();

        expect(graphStore.hasTableOverlay).toBe(true);
        expect(logStore.fieldValues).toHaveLength(flightLog.getMainFieldNames().length);
        expect(logStore.fieldValues.some(({ decoded }) => decoded !== "")).toBe(true);
    });


    it("replaces the displayed values when the timeline seeks to another frame", () => {
        const flightLog = loadSampleLog();
        const { logStore, graphStore, appStore } = createStores(flightLog);
        const firstFrame = flightLog.getSmoothedFrameAtTime(logStore.currentBlackboxTime);

        const seekTime = Math.min(flightLog.getMaxTime(), flightLog.getMinTime() + 1_000_000);
        logStore.currentBlackboxTime = seekTime;
        updateValuesChart(logStore, graphStore, appStore, defaultUserSettings);

        const secondFrame = flightLog.getSmoothedFrameAtTime(seekTime);
        const changedIndex = firstFrame.findIndex((value, index) => value !== secondFrame[index]);
        expect(changedIndex).toBeGreaterThanOrEqual(0);
        expect(logStore.fieldValues[changedIndex].raw).not.toBe(firstFrame[changedIndex]);
    });
});
