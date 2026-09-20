<template>
    <div class="toolbar-panel log-playback-rate-panel">
        <h4>Speed</h4>
        <div class="flex items-center gap-1">
            <UButton variant="ghost" color="neutral" size="sm" title="Decrease speed" @click="changeRate(-1)">
                <span class="font-mono text-base font-bold">-</span>
            </UButton>
            <UButton variant="ghost" color="neutral" size="sm" class="min-w-[42px] justify-center" @click="cycleRate">
                <span class="font-mono">{{ playbackStore.playbackRate }}%</span>
            </UButton>
            <UButton variant="ghost" color="neutral" size="sm" title="Increase speed" @click="changeRate(1)">
                <span class="font-mono text-base font-bold">+</span>
            </UButton>
        </div>
    </div>
</template>

<script setup>
import { usePlaybackStore, PLAYBACK_RATE_STEPS, findClosestRateStepIndex } from "../stores/playback.js";

const emit = defineEmits(["rate-change"]);

const playbackStore = usePlaybackStore();

function cycleRate() {
    const current = playbackStore.playbackRate;
    const currentIndex = findClosestRateStepIndex(current);
    const nextIndex = (currentIndex + 1) % PLAYBACK_RATE_STEPS.length;
    emit("rate-change", PLAYBACK_RATE_STEPS[nextIndex]);
}

function changeRate(direction) {
    const current = playbackStore.playbackRate;
    const currentIndex = findClosestRateStepIndex(current);
    let nextIndex = currentIndex + direction;
    if (nextIndex < 0) nextIndex = PLAYBACK_RATE_STEPS.length - 1;
    if (nextIndex >= PLAYBACK_RATE_STEPS.length) nextIndex = 0;
    emit("rate-change", PLAYBACK_RATE_STEPS[nextIndex]);
}
</script>
