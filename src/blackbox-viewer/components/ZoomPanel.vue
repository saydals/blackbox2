<template>
    <div class="toolbar-panel log-chart-zoom-panel">
        <h4>Zoom</h4>
        <div class="flex items-center gap-1">
            <UButton variant="ghost" color="neutral" size="xs" title="Zoom out" @click="changeZoom(-1)">
                <span class="font-mono text-base font-bold">-</span>
            </UButton>
            <UButton variant="ghost" color="neutral" size="xs" class="min-w-[42px] justify-center" @click="cycleZoom">
                <span class="font-mono">{{ graphStore.graphZoom }}%</span>
            </UButton>
            <UButton variant="ghost" color="neutral" size="xs" title="Zoom in" @click="changeZoom(1)">
                <span class="font-mono text-base font-bold">+</span>
            </UButton>
        </div>
    </div>
</template>

<script setup>
import { useGraphStore } from "../stores/graph.js";

const emit = defineEmits(["zoom-change"]);

const graphStore = useGraphStore();

const STEPS = [10, 25, 50, 75, 100, 150, 200];

function findClosestStepIndex(zoom) {
    let index = 0;
    let minDiff = Math.abs(STEPS[0] - zoom);
    for (let i = 1; i < STEPS.length; i++) {
        const diff = Math.abs(STEPS[i] - zoom);
        if (diff < minDiff) {
            minDiff = diff;
            index = i;
        }
    }
    return index;
}

function cycleZoom() {
    const current = graphStore.graphZoom;
    const currentIndex = findClosestStepIndex(current);
    const nextIndex = (currentIndex + 1) % STEPS.length;
    emit("zoom-change", STEPS[nextIndex]);
}

function changeZoom(direction) {
    const current = graphStore.graphZoom;
    const currentIndex = findClosestStepIndex(current);
    let nextIndex = currentIndex + direction;
    if (nextIndex < 0) nextIndex = STEPS.length - 1;
    if (nextIndex >= STEPS.length) nextIndex = 0;
    emit("zoom-change", STEPS[nextIndex]);
}
</script>
