import { defineStore } from "pinia";
import { ref, shallowRef } from "vue";

export const useAppStore = defineStore("app", () => {
    const legendHidden = ref(false);
    const viewVideo = ref(true);
    const darkThemeEnabled = ref(false);

    // 3D BLACKBOX overlay — replaces the graph area (graph + legend) while
    // open. Independent of the graph renderers; the page replays the
    // already-open viewer log with its own controls.
    const blackbox3DOpen = ref(false);

    // FFT VIBRATION overlay — replaces the graph area (same slot as the 3D
    // page) while open, showing the FFT Vibration Frequency Spectrum of the
    // currently selected in/out window. Head speed (RPM) feeds the harmonic
    // markers; persisted only for the session.
    const fftOpen = ref(false);
    const fftHeadSpeedRpm = ref(2300);

    // True while the viewer is the visible tab. Embedded, the host tab flips this on
    // activate/deactivate so the viewer's document-level handlers (keyboard, wheel, drag) go
    // dormant behind other tabs. Defaults true so the standalone viewer is unaffected.
    const viewerActive = ref(true);

    // Filename of loaded log (pushed from legacy code)
    const logFilename = ref("");

    // Status bar display strings (pushed from legacy code)
    const statusVersion = ref("-");
    const statusCells = ref("");
    const statusLooptime = ref("-");
    const statusLograte = ref("-");
    const statusLograteWarning = ref(null);
    const statusFlightMode = ref("-");
    const statusMarkerOffset = ref("00:00.000");
    const statusViewerVersion = ref("-");
    const graphTimeDisplay = ref("1.0");
    const videoOffsetDisplay = ref("+0.0");

    // Dialog open states (shared between legacy JS and Vue)
    const graphConfigDialogOpen = ref(false);
    const headerDialogOpen = ref(false);
    const settingsDialogOpen = ref(false);
    const keysDialogOpen = ref(false);
    const videoExportDialogOpen = ref(false);
    const bblExportDialogOpen = ref(false);

    // Callbacks registered by main.js (closure-dependent operations)
    const loadFiles = shallowRef(null);
    const newGraphConfig = shallowRef(null);
    const exportCsv = shallowRef(null);
    const exportGpx = shallowRef(null);
    const exportBbl = shallowRef(null);
    const exportWorkspaces = shallowRef(null);
    const saveUserSettings = shallowRef(null);
    const refreshGraph = shallowRef(null);

    function setLegendHidden(hidden) {
        legendHidden.value = hidden;
    }

    function setViewVideo(visible) {
        viewVideo.value = visible;
    }

    return {
        legendHidden,
        viewVideo,
        darkThemeEnabled,
        blackbox3DOpen,
        fftOpen,
        fftHeadSpeedRpm,
        viewerActive,
        logFilename,
        statusVersion,
        statusCells,
        statusLooptime,
        statusLograte,
        statusLograteWarning,
        statusFlightMode,
        statusMarkerOffset,
        statusViewerVersion,
        graphTimeDisplay,
        videoOffsetDisplay,
        graphConfigDialogOpen,
        headerDialogOpen,
        settingsDialogOpen,
        keysDialogOpen,
        videoExportDialogOpen,
        bblExportDialogOpen,
        loadFiles,
        newGraphConfig,
        exportCsv,
        exportGpx,
        exportBbl,
        exportWorkspaces,
        saveUserSettings,
        refreshGraph,
        setLegendHidden,
        setViewVideo,
    };
});
