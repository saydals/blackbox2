<template>
    <span id="seekbarToolbar" class="non-shift">
        <div id="seekbarType" class="seekBar-selection" title="Value to plot">
            <USelect v-model="seekbarType" :items="seekbarOptions" size="xs" class="w-full" />
        </div>
    </span>
</template>

<script setup>
import { computed } from "vue";
import { useGraphStore } from "../stores/graph.js";

const graphStore = useGraphStore();

const seekbarOptions = [
    { label: "Collective pitch", value: "collective" },
    { label: "Swash noise", value: "swashNoise" },
    { label: "Tail noise", value: "tailNoise" },
];

const seekbarType = computed({
    get: () => graphStore.seekBarMode || "collective",
    set: (val) => graphStore.setSeekBarMode?.(val),
});
</script>
