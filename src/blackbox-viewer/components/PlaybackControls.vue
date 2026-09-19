<template>
    <div class="toolbar-panel log-playback-panel">
        <h4>Playback</h4>
        <div class="flex items-center gap-0.5">
            <UButton
                v-if="logStore.hasVideo"
                variant="ghost"
                color="neutral"
                icon="i-lucide-skip-back"
                size="sm"
                title="Jump to start of video"
                @click="$emit('video-jump-start')"
            />
            <UButton
                variant="ghost"
                color="neutral"
                icon="i-lucide-skip-back"
                size="sm"
                title="Jump to start of log"
                @click="$emit('jump-start')"
            />
            <UButton
                variant="ghost"
                color="neutral"
                icon="i-lucide-step-back"
                size="sm"
                title="Jump back"
                @click="$emit('step-back')"
            />
            <UButton
                variant="ghost"
                color="neutral"
                :icon="playbackStore.isPlaying ? 'i-lucide-pause' : 'i-lucide-play'"
                size="sm"
                title="Play/Pause"
                @click="$emit('play-pause')"
            />
            <UButton
                variant="ghost"
                color="neutral"
                icon="i-lucide-step-forward"
                size="sm"
                title="Jump forward"
                @click="$emit('step-forward')"
            />
            <UButton
                variant="ghost"
                color="neutral"
                icon="i-lucide-skip-forward"
                size="sm"
                title="Jump to end of log"
                @click="$emit('jump-end')"
            />
            <UButton
                v-if="logStore.hasVideo"
                variant="ghost"
                color="neutral"
                icon="i-lucide-skip-forward"
                size="sm"
                title="Jump to end of video"
                @click="$emit('video-jump-end')"
            />
        </div>
    </div>
    <div class="toolbar-panel log-playback-panel">
        <h4>Select</h4>
        <div class="flex items-center gap-0.5">
            <UButton
                variant="ghost"
                color="neutral"
                icon="i-lucide-skip-back"
                size="sm"
                title="Select in (I)"
                @click="selectIn"
            />
            <UButton
                variant="ghost"
                color="neutral"
                icon="i-lucide-circle"
                size="sm"
                title="Select all (whole timeline)"
                @click="selectAll"
            />
            <UButton
                variant="ghost"
                color="neutral"
                icon="i-lucide-skip-forward"
                size="sm"
                title="Select out (O)"
                @click="selectOut"
            />
        </div>
    </div>
</template>

<script setup>
import { usePlaybackStore } from "../stores/playback.js";
import { useLogStore } from "../stores/log.js";
import { setVideoInTime, setVideoOutTime } from "../video_handler.js";

defineEmits([
    "jump-start",
    "jump-end",
    "step-back",
    "step-forward",
    "play-pause",
    "video-jump-start",
    "video-jump-end",
]);

const playbackStore = usePlaybackStore();
const logStore = useLogStore();

function selectIn() {
    const t = logStore.currentBlackboxTime;
    setVideoInTime(playbackStore.videoExportInTime === t ? null : t);
}

function selectOut() {
    const t = logStore.currentBlackboxTime;
    setVideoOutTime(playbackStore.videoExportOutTime === t ? null : t);
}

/** middle button (○): select all — whole timeline from start to end */
function selectAll() {
    const flightLog = logStore.flightLog;
    if (!flightLog) {
        return;
    }
    setVideoInTime(flightLog.getMinTime());
    setVideoOutTime(flightLog.getMaxTime());
}
</script>
