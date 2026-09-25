<template>
    <!-- 3D View toggle — sits between Workspace and the hamburger menu,
        separated by a divider. Opens the 3D replay page over the graph area. -->
    <div class="toolbar-panel log-3d-panel">
        <h4>3D View</h4>
        <div class="flex items-center gap-0.5">
            <UButton
                variant="ghost"
                :color="modelValue ? 'primary' : 'neutral'"
                size="sm"
                class="log-3d-btn"
                :aria-label="modelValue ? 'Close 3D View' : 'Open 3D View'"
                :aria-pressed="modelValue"
                title="3D View"
                :disabled="!logStore.hasLog"
                @click="$emit('update:modelValue', !modelValue)"
            >
                <span class="log-3d-badge" aria-hidden="true">3D</span>
            </UButton>
        </div>
    </div>
</template>

<script setup>
import { useLogStore } from "../stores/log.js";

defineProps({
    modelValue: { type: Boolean, default: false },
});

defineEmits(["update:modelValue"]);

const logStore = useLogStore();
</script>

<style scoped>
/* Divider between panels comes from .toolbar-panel's own border-inline-end —
   no extra "|" character needed. */

/* "3D" text icon — matches the toolbar UButton icon sizing. */
.log-3d-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 1.15rem;
    height: 1.15rem;
    font-size: 0.72rem;
    font-weight: 800;
    font-style: normal;
    letter-spacing: 0.02em;
    line-height: 1;
}
</style>