<template>
    <UApp>
        <div id="blackbox-app">
            <div id="blackbox-viewer-root" ref="viewerRootRef" class="blackbox-viewer-root">
                <WelcomePage @files-selected="onFilesSelected" />

                <div class="app-main-pane">
                    <div class="video-top-controls">
                        <div class="toolbar-panel toolbar-panel--open">
                            <LogFileInput size="sm" label="Open" @files-selected="onFilesSelected" />
                        </div>
                        <div class="video-top-controls-scroll">
                        <ViewControls
                            :header-active="appStore.headerDialogOpen"
                            :table-active="graphStore.hasTableOverlay"
                            :craft-active="graphStore.hasCraft"
                            :sticks-active="graphStore.hasSticks"
                            :analyser-active="graphStore.hasAnalyser"
                            @toggle-header="onToggleHeader"
                            @toggle-table="onToggleTable"
                            @toggle-craft="onToggleCraft"
                            @toggle-sticks="onToggleSticks"
                            @toggle-analyser="onToggleAnalyser"
                        />
                        <PlaybackControls
                            @jump-start="onJumpStart"
                            @jump-end="onJumpEnd"
                            @step-back="onStepBack"
                            @step-forward="onStepForward"
                            @play-pause="onPlayPause"
                            @video-jump-start="onVideoJumpStart"
                            @video-jump-end="onVideoJumpEnd"
                        />
                        <SpeedPanel @rate-change="onRateChange" />
                        <ZoomPanel @zoom-change="onZoomChange" />
                        <TimePanel @time-change="onTimeChange" />
                        <SyncPanel
                            @sync-back="onSyncBack"
                            @sync-forward="onSyncForward"
                            @sync-here="onSyncHere"
                            @smart-sync="onSmartSync"
                            @offset-change="onOffsetChange"
                        />
                        <WorkspacePanel
                            @switch-workspace="onSwitchWorkspace"
                            @save-workspace="onSaveWorkspace"
                            @rename-workspace="onRenameWorkspace"
                        />
                        <LogPanel />
                        <Blackbox3DButton v-model="appStore.blackbox3DOpen" />
                        <FftButton v-model="appStore.fftOpen" />
                        </div>
                        <div class="toolbar-panel toolbar-panel--menu-wrap">
                            <AppMenu
                                @export-bbl="onExportBbl"
                                @export-csv="onExportCsv"
                                @export-video="appStore.videoExportDialogOpen = true"
                                @open-settings="onOpenSettings"
                                @open-keys="onOpenKeys"
                            />
                        </div>
                    </div>
                    <div id="screenshot-frame" class="graph-row">
                        <!-- 3D BLACKBOX fills the entire graph-row area while open:
                            the LegendPanel and the seek-bar timeline are hidden via the
                            .blackbox3d-open root class (main.css). v-if so the WebGL
                            renderer mounts only while visible and frees its context on close. -->
                        <Blackbox3DPanel
                            v-if="appStore.blackbox3DOpen"
                            class="blackbox-3d-overlay"
                            @close="appStore.blackbox3DOpen = false"
                        />
                        <!-- FFT VIBRATION replaces the graph area exactly like the
                            3D page (flex: 1 1 0 slot) while open. -->
                        <FftPanel v-if="appStore.fftOpen" class="blackbox-fft-overlay" />
                        <div v-show="!appStore.blackbox3DOpen && !appStore.fftOpen" id="log-graph" class="log-graph">
                            <!--
                                Graph-only fullscreen toggle. Sits in the top-left corner of the
                                graph canvas, immediately to the left of the filename overlay.
                                Toggling it adds the `is-fullscreen` class to the viewer root, which
                                collapses the .video-top-controls header and .log-seek-bar timeline
                                so .graph-row (and its flex sibling, LegendPanel) can absorb the
                                full viewport height — see the `.is-fullscreen.*` rules in main.css.
                            -->
                            <button
                                v-if="appStore.logFilename"
                                type="button"
                                class="graph-fullscreen-toggle"
                                :class="{ 'is-active': graphStore.isFullscreen }"
                                :title="graphStore.isFullscreen ? 'Exit fullscreen (Esc)' : 'Enter fullscreen (F)'"
                                :aria-label="graphStore.isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'"
                                :aria-pressed="graphStore.isFullscreen"
                                @click="graphStore.toggleFullscreen()"
                            >
                                <UIcon
                                    :name="graphStore.isFullscreen ? 'i-lucide-minimize-2' : 'i-lucide-maximize-2'"
                                    class="size-5"
                                />
                            </button>
                            <div v-if="appStore.logFilename" class="graph-filename-overlay" :title="appStore.logFilename">
                                {{ appStore.logFilename }}
                            </div>
                            <video id="logVideo"></video>
                            <canvas width="200" height="100" id="graphCanvas"></canvas>
                            <canvas width="0" height="0" id="craftCanvas"></canvas>
                            <SpectrumAnalyser />
                            <div id="mapContainer" class="map-container"></div>
                            <canvas width="0" height="0" id="stickCanvas"></canvas>
                        </div>
                        <!-- Legend is hidden via .blackbox3d-open / .fft-open CSS classes
                            while the 3D page or FFT page is open. -->
                        <LegendPanel />
                        <div id="mouseNotification" class="mouseNotification"></div>
                    </div>
                </div>

                <div id="log-seek-bar" class="log-seek-bar">
                    <canvas id="seekbarCanvas" width="200" height="100"></canvas>
                    <SeekBarToolbar />
                </div>

                <FieldValuesPanel />
                <ConfigurationPanel />

                <!-- Dialogs -->
                <KeysDialog v-model:open="appStore.keysDialogOpen" />
                <UserSettingsDialog v-model:open="appStore.settingsDialogOpen" @save="onSaveSettings" />
                <VideoExportDialog v-model:open="appStore.videoExportDialogOpen" />
                <BblExportDialog v-model:open="appStore.bblExportDialogOpen" />
                <GraphConfigDialog
                    v-model:open="appStore.graphConfigDialogOpen"
                    :flightLog="logStore.flightLog"
                    :graphConfig="graphStore.activeGraphConfig"
                    :grapher="graphStore.graph"
                    @save="onGraphConfigSave"
                    @update="onGraphConfigUpdate"
                />
                <HeaderDialog v-model:open="appStore.headerDialogOpen" :sysConfig="sysConfig" />
            </div>
        </div>
    </UApp>
</template>

<script setup>
import { computed, ref, watch, watchEffect, onMounted, onUnmounted } from "vue";
import { bootstrapViewer } from "./main.js";
import { setVideoInTime, setVideoOutTime } from "./video_handler.js";
import { showValueTable } from "./playback_controls.js";
import { useGraphStore } from "./stores/graph.js";
import { useAppStore } from "./stores/app.js";
import { useLogStore, FIRMWARE_CLASSES } from "./stores/log.js";
import { usePlaybackStore } from "./stores/playback.js";
import { useSettingsStore } from "./stores/settings.js";
import { useWorkspaceStore } from "./stores/workspace.js";
import AppMenu from "./components/AppMenu.vue";
import VideoExportDialog from "./components/VideoExportDialog.vue";
import BblExportDialog from "./components/BblExportDialog.vue";
import WelcomePage from "./components/WelcomePage.vue";
import ViewControls from "./components/ViewControls.vue";
import PlaybackControls from "./components/PlaybackControls.vue";
import TimePanel from "./components/TimePanel.vue";
import SpeedPanel from "./components/SpeedPanel.vue";
import ZoomPanel from "./components/ZoomPanel.vue";
import SyncPanel from "./components/SyncPanel.vue";
import WorkspacePanel from "./components/WorkspacePanel.vue";
import LogPanel from "./components/LogPanel.vue";
import Blackbox3DButton from "./components/Blackbox3DButton.vue";
import Blackbox3DPanel from "./components/Blackbox3DPanel.vue";
import FftButton from "./components/FftButton.vue";
import FftPanel from "./components/FftPanel.vue";
import KeysDialog from "./components/KeysDialog.vue";
import UserSettingsDialog from "./components/UserSettingsDialog.vue";
import GraphConfigDialog from "./components/GraphConfigDialog.vue";
import HeaderDialog from "./components/HeaderDialog.vue";
import SpectrumAnalyser from "./components/SpectrumAnalyser.vue";
import LegendPanel from "./components/LegendPanel.vue";
import FieldValuesPanel from "./components/FieldValuesPanel.vue";
import ConfigurationPanel from "./components/ConfigurationPanel.vue";
import SeekBarToolbar from "./components/SeekBarToolbar.vue";
import LogFileInput from "./components/LogFileInput.vue";

const graphStore = useGraphStore();
const appStore = useAppStore();
const logStore = useLogStore();
const playbackStore = usePlaybackStore();
const settingsStore = useSettingsStore();
const workspaceStore = useWorkspaceStore();

const viewerRootRef = ref(null);

// State classes live on the standalone viewer root, not the document.
watchEffect(() => {
    const el = viewerRootRef.value ?? document.getElementById("blackbox-viewer-root");
    if (!el) {
        return;
    }
    const cl = el.classList;
    cl.toggle("has-log", logStore.hasLog);
    cl.toggle("has-video", logStore.hasVideo);
    cl.toggle("has-gps", logStore.hasGps);
    cl.toggle("has-craft", graphStore.hasCraft);
    cl.toggle("has-sticks", graphStore.hasSticks);
    cl.toggle("has-analyser", graphStore.hasAnalyser);
    cl.toggle("has-analyser-fullscreen", graphStore.hasAnalyserFullscreen);
    cl.toggle("has-map", graphStore.hasMap);
    cl.toggle("has-marker", graphStore.hasMarker);
    cl.toggle("is-fullscreen", graphStore.isFullscreen);
    // FFT page marker class: compact media queries hide the Legend panel
    // while the FFT page is open — on a phone the legend's fixed flex-basis
    // starves the spectrum canvas down to a narrow sliver.
    cl.toggle("fft-open", appStore.fftOpen);
    // 3D page marker class: hides the Legend panel and the seek-bar timeline
    // so the 3D panel can fill the entire graph-row area.
    cl.toggle("blackbox3d-open", appStore.blackbox3DOpen);
    cl.toggle("video-hidden", !appStore.viewVideo);
    cl.toggle("has-expo-override", !!settingsStore.userSettings.graphExpoOverride);
    cl.toggle("has-smoothing-override", !!settingsStore.userSettings.graphSmoothOverride);
    cl.toggle("has-grid-override", !!settingsStore.userSettings.graphGridOverride);
    // Dark theme
    cl.toggle("dark", appStore.darkThemeEnabled);
    // Firmware type (map icon color filters)
    const fwClass = logStore.firmwareClass;
    for (const c of FIRMWARE_CLASSES) {
        cl.toggle(c, c === fwClass);
    }
});

// Derived state from stores
const sysConfig = computed(() => {
    // Read activeLogIndex so this re-evaluates when the active log changes: parser.sysConfig
    // is replaced per log, but logStore.flightLog keeps the same reference across logs in a
    // multi-log file.
    const activeLogIndex = logStore.activeLogIndex;
    return activeLogIndex >= 0 ? (logStore.flightLog?.getSysConfig?.() ?? null) : null;
});

function onFilesSelected(files) {
    appStore.loadFiles?.(files);
}

function onOpenSettings() {
    appStore.settingsDialogOpen = true;
}

function onOpenKeys() {
    appStore.keysDialogOpen = true;
}

function onExportCsv() {
    appStore.exportCsv?.();
}

function onExportBbl() {
    appStore.bblExportDialogOpen = true;
}

function onToggleHeader() {
    if (!appStore.headerDialogOpen) {
        graphStore.hasTableOverlay = false;
        graphStore.hasConfigOverlay = false;
    }
    appStore.headerDialogOpen = !appStore.headerDialogOpen;
}

function onToggleTable() {
    appStore.headerDialogOpen = false;
    showValueTable();
    graphStore.hasConfigOverlay = false;
    graphStore.invalidateGraph?.();
}

function onToggleCraft() {
    settingsStore.saveSetting("drawCraft", !settingsStore.userSettings.drawCraft);
}

function onToggleSticks() {
    settingsStore.saveSetting("drawSticks", !settingsStore.userSettings.drawSticks);
}

function onToggleAnalyser() {
    graphStore.toggleAnalyser();
}

function onRateChange(rate) {
    playbackStore.applyPlaybackRate?.(rate);
}

function onZoomChange(zoom) {
    graphStore.applyGraphZoom?.(zoom);
}

function onSyncBack() {
    playbackStore.logSyncBack?.();
}

function onSyncForward() {
    playbackStore.logSyncForward?.();
}

function onSyncHere() {
    playbackStore.logSyncHere?.();
}

function onSmartSync() {
    playbackStore.logSmartSync?.();
}

function onOffsetChange(val) {
    playbackStore.setVideoOffsetValue?.(val);
}

function onTimeChange(timeStr) {
    playbackStore.setGraphTime?.(timeStr);
}

function onPlayPause() {
    playbackStore.logPlayPause?.();
}

function onJumpStart() {
    playbackStore.logJumpStart?.();
}

function onJumpEnd() {
    playbackStore.logJumpEnd?.();
}

function onStepBack() {
    playbackStore.logJumpBack?.();
}

function onStepForward() {
    playbackStore.logJumpForward?.();
}

function onVideoJumpStart() {
    playbackStore.videoJumpStart?.();
}

function onVideoJumpEnd() {
    playbackStore.videoJumpEnd?.();
}

function onSaveSettings(newSettings) {
    appStore.saveUserSettings?.(newSettings);
}

function onGraphConfigSave(newConfig) {
    appStore.newGraphConfig?.(newConfig, true);
}

function onGraphConfigUpdate(newConfig) {
    appStore.newGraphConfig?.(newConfig, true);
}

function onSwitchWorkspace(id) {
    workspaceStore.switchWorkspace?.(id);
}

function onSaveWorkspace(id, title) {
    workspaceStore.saveWorkspace?.(id, title);
}

function onRenameWorkspace(id, title) {
    workspaceStore.renameWorkspace?.(id, title);
}

// Analysis window selection: the middle 3/5 of the timeline — the first 1/5
// (take-off) and the last 1/5 (landing) are excluded because those produce
// abnormally large noise.
// NOTE: the in/out marks are stored in MICROSECONDS everywhere else
// (keyboard I/O marks, PlaybackControls "select all", the bbl/video
// exporters and FftPanel.selectionSeconds all use log-time µs) — the
// previous code wrote seconds here, so the marks landed at the far left
// edge of the timeline and the FFT window came out effectively empty.

function selectFftAnalysisWindow() {
    const log = logStore.flightLog;
    if (!log) {
        return;
    }

    const minUs = log.getMinTime();
    const maxUs = log.getMaxTime();
    const durationUs = maxUs - minUs;

    // Middle 3/5 — skip the first 1/5 and the last 1/5 of the timeline
    setVideoInTime(minUs + durationUs / 5);
    setVideoOutTime(maxUs - durationUs / 5);
}

// FFT Vibration toggle: opening it auto-selects the analysis window.
// The 3D page and the FFT page share the same graph-area slot, so
// they are mutually exclusive — opening one closes the other.
watch(() => appStore.fftOpen, (open) => {
    if (!open) {
        return;
    }

    if (appStore.blackbox3DOpen) {
        appStore.blackbox3DOpen = false;
    }

    selectFftAnalysisWindow();
});

// A log opened while the FFT page is ALREADY open must re-center the
// analysis window. loadLogFile -> selectLog resets the in/out marks
// (setVideoInTime(false) / setVideoOutTime(false)) and swaps the FlightLog
// instance, but fftOpen never flips, so the watcher above cannot run again —
// FftPanel then recalculated over the full log instead of the middle 3/5.
// This watcher lives in the PARENT on purpose: App.vue's watchers flush
// before FftPanel's (created later at child mount), so by the time the
// panel's recalculate watcher runs, the marks already hold the fresh
// middle-3/5 values rather than the reset ones.
watch(
    () => [logStore.flightLog, logStore.activeLogIndex],
    () => {
        if (appStore.fftOpen) {
            selectFftAnalysisWindow();
        }
    },
);

// Opening the 3D page closes the FFT panel (same slot).
watch(() => appStore.blackbox3DOpen, (open) => {
    if (!open) {
        return;
    }
    if (appStore.fftOpen) {
        appStore.fftOpen = false;
    }
});

// Drag-and-drop file loading (window-level)
function onDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
}
function onDrop(e) {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) {
        return;
    }
    const entry = e.dataTransfer.items?.[0]?.webkitGetAsEntry?.();
    if (entry && !entry.isFile) {
        return;
    }
    appStore.loadFiles?.([file]);
}
onMounted(() => {
    document.addEventListener("dragover", onDragOver);
    document.addEventListener("drop", onDrop);
    // The imperative bootstrap grabs canvases by id once; run it after this
    // component's DOM (and its child panels that own some of those ids) exists.
    bootstrapViewer();
});
onUnmounted(() => {
    document.removeEventListener("dragover", onDragOver);
    document.removeEventListener("drop", onDrop);
});
</script>
