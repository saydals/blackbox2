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
import { usePlaybackStore } from "../stores/playback.js";

const emit = defineEmits(["rate-change"]);

const playbackStore = usePlaybackStore();

const STEPS = [10, 25, 50, 75, 100, 150, 200];

function findClosestStepIndex(rate) {
    let index = 0;
    let minDiff = Math.abs(STEPS[0] - rate);
    for (let i = 1; i < STEPS.length; i++) {
        const diff = Math.abs(STEPS[i] - rate);
        if (diff < minDiff) {
            minDiff = diff;
            index = i;
        }
    }
    return index;
}

function cycleRate() {
    const current = playbackStore.playbackRate;
    const currentIndex = findClosestStepIndex(current);
    const nextIndex = (currentIndex + 1) % STEPS.length;
    emit("rate-change", STEPS[nextIndex]);
}

function changeRate(direction) {
    const current = playbackStore.playbackRate;
    const currentIndex = findClosestStepIndex(current);
    let nextIndex = currentIndex + direction;
    if (nextIndex < 0) nextIndex = STEPS.length - 1;
    if (nextIndex >= STEPS.length) nextIndex = 0;
    emit("rate-change", STEPS[nextIndex]);
}
</script>
