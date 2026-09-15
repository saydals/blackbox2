<template>
    <div class="toolbar-panel log-playback-panel">
        <h4>Playback</h4>
        <div class="flex items-center gap-0.5">
            <UButton
                v-if="logStore.hasVideo"
                variant="ghost"
                color="neutral"
                icon="i-lucide-skip-back"
                size="xs"
                title="Jump to start of video"
                @click="$emit('video-jump-start')"
            />
            <UButton
                variant="ghost"
                color="neutral"
                icon="i-lucide-skip-back"
                size="xs"
                title="Jump to start of log"
                @click="$emit('jump-start')"
            />
            <UButton
                variant="ghost"
                color="neutral"
                icon="i-lucide-step-back"
                size="xs"
                title="Jump back"
                @click="$emit('step-back')"
            />
            <UButton
                variant="ghost"
                color="neutral"
                :icon="playbackStore.isPlaying ? 'i-lucide-pause' : 'i-lucide-play'"
                size="xs"
                title="Play/Pause"
                @click="$emit('play-pause')"
            />
            <UButton
                variant="ghost"
                color="neutral"
                icon="i-lucide-step-forward"
                size="xs"
                title="Jump forward"
                @click="$emit('step-forward')"
            />
            <UButton
                variant="ghost"
                color="neutral"
                icon="i-lucide-skip-forward"
                size="xs"
                title="Jump to end of log"
                @click="$emit('jump-end')"
            />
            <UButton
                v-if="logStore.hasVideo"
                variant="ghost"
                color="neutral"
                icon="i-lucide-skip-forward"
                size="xs"
                title="Jump to end of video"
                @click="$emit('video-jump-end')"
            />
        </div>
    </div>
    <div class="toolbar-panel log-playback-panel">
        <h4>Mark</h4>
        <div class="flex items-center gap-0.5">
            <UButton
                variant="ghost"
                color="neutral"
                icon="i-lucide-skip-back"
                size="xs"
                title="Mark in (I)"
                @click="markIn"
            />
            <UButton
                variant="ghost"
                color="neutral"
                icon="i-lucide-circle"
                size="xs"
                title="Clear mark"
                @click="clearMark"
            />
            <UButton
                variant="ghost"
                color="neutral"
                icon="i-lucide-skip-forward"
                size="xs"
                title="Mark out (O)"
                @click="markOut"
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

function markIn() {
    const t = logStore.currentBlackboxTime;
    setVideoInTime(playbackStore.videoExportInTime === t ? null : t);
}

function markOut() {
    const t = logStore.currentBlackboxTime;
    setVideoOutTime(playbackStore.videoExportOutTime === t ? null : t);
}

function clearMark() {
    setVideoInTime(null);
    setVideoOutTime(null);
}
</script>
