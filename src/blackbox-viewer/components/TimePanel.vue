<template>
    <div class="toolbar-panel log-chart-time-panel">
        <h4>Time</h4>
        <div>
            <UInput
                :model-value="appStore.graphTimeDisplay"
                size="sm"
                class="font-mono"
                maxlength="12"
                placeholder="00:00.00"
                title="Enter a time to jump to"
                :style="{ width: `${timeInputWidth}ch` }"
                @change="onTimeChange"
            />
        </div>
    </div>
</template>

<script setup>
import { computed } from "vue";
import { useAppStore } from "../stores/app.js";

const emit = defineEmits(["time-change"]);
const appStore = useAppStore();

const timeInputWidth = computed(() => Math.max(12.5, (appStore.graphTimeDisplay?.length ?? 8) + 4.5));

function onTimeChange(e) {
    emit("time-change", e.target.value);
}
</script>
