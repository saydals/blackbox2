<template>
    <UModal v-model:open="open" :ui="{ content: 'sm:max-w-md' }" class="overflow-visible">
        <template #header>
            <h4 class="font-semibold">Without GPS — Flight Estimation</h4>
        </template>

        <template #body>
            <div class="flex flex-col gap-3 text-xs">
                <p class="text-dimmed leading-relaxed">
                    No GPS in this log: the flight path is estimated by integrating thrust from collective pitch and
                    attitude (same attitude as the graph panel). Tune the parameters below for a more realistic line.
                </p>

                <div class="flex flex-col gap-1">
                    <span class="font-semibold">Vertical source</span>
                    <div class="flex flex-col gap-1 ml-2">
                        <label class="flex items-center gap-2 cursor-pointer">
                            <input v-model="local.verticalSource" type="radio" value="none" />
                            <span>Collective estimate — barometer NOT used</span>
                        </label>
                        <label
                            class="flex items-center gap-2 cursor-pointer"
                            :class="{ 'opacity-40 pointer-events-none': !hasBaro }"
                        >
                            <input v-model="local.verticalSource" type="radio" value="baro" />
                            <span>Barometer (raw)</span>
                        </label>
                        <label
                            class="flex items-center gap-2 cursor-pointer"
                            :class="{ 'opacity-40 pointer-events-none': !hasBaro }"
                        >
                            <input v-model="local.verticalSource" type="radio" value="baroSmooth" />
                            <span>Barometer (smoothed) — default</span>
                        </label>
                    </div>
                    <span v-if="!hasBaro" class="text-dimmed ml-2">This log has no barometer data.</span>
                </div>

                <div v-if="local.verticalSource === 'baroSmooth'" class="flex items-center gap-3 ml-2">
                    <span class="w-40 text-dimmed">Baro smoothing</span>
                    <input v-model.number="local.baroSmoothing" type="range" min="0" max="0.95" step="0.05" class="flex-1" />
                    <span class="w-10 text-right">{{ local.baroSmoothing.toFixed(2) }}</span>
                </div>

                <div class="flex items-center gap-3">
                    <span class="w-40 text-dimmed" title="Collective % where the craft neither climbs nor sinks">Hover collective (%)</span>
                    <input v-model.number="local.hoverCollective" type="number" min="0" max="100" step="1" class="b3d-num" />
                </div>

                <div class="flex items-center gap-3">
                    <span class="w-40 text-dimmed" title="Extra upward acceleration at 100% collective">Full-pitch climb accel (m/s²)</span>
                    <input v-model.number="local.fullPitchAccel" type="number" min="0" max="30" step="0.5" class="b3d-num" />
                </div>

                <div class="flex items-center gap-3">
                    <span class="w-40 text-dimmed" title="Linear velocity damping — reduces dead-reckoning drift">Drag coefficient</span>
                    <input v-model.number="local.drag" type="number" min="0" max="1" step="0.01" class="b3d-num" />
                </div>

                <div class="flex items-center gap-3">
                    <span class="w-40 text-dimmed" title="Height above ground at the start of the replay">Start altitude (m)</span>
                    <input v-model.number="local.startAltitude" type="number" min="0" max="50" step="0.5" class="b3d-num" />
                </div>
            </div>
        </template>

        <template #footer>
            <div class="flex justify-end gap-2 w-full">
                <UButton variant="ghost" color="neutral" label="Reset defaults" size="xs" @click="resetDefaults" />
                <UButton variant="outline" color="neutral" label="Cancel" size="xs" @click="open = false" />
                <UButton color="primary" label="Apply" size="xs" @click="apply" />
            </div>
        </template>
    </UModal>
</template>

<script setup>
import { reactive, computed, watch } from "vue";

const props = defineProps({
    open: { type: Boolean, default: false },
    // Live settings from the parent (seeded into the working copy on open).
    settings: { type: Object, required: true },
    // Whether the current log carries barometer ("altitude") data.
    hasBaro: { type: Boolean, default: false },
});
const emit = defineEmits(["update:open", "apply"]);

const open = computed({
    get: () => props.open,
    set: (v) => emit("update:open", v),
});

const DEFAULTS = {
    verticalSource: "baroSmooth",
    baroSmoothing: 0.8,
    hoverCollective: 50,
    fullPitchAccel: 10,
    drag: 0.15,
    startAltitude: 3,
};

// Working copy edited by the dialog; re-seeded from the parent each time the
// dialog opens so Cancel really discards changes.
const local = reactive({ ...DEFAULTS });
watch(
    () => props.open,
    (isOpen) => {
        if (isOpen) {
            Object.assign(local, DEFAULTS, props.settings);
            // If the log has no barometer, force the collective-estimate mode.
            if (!props.hasBaro && local.verticalSource !== "none") local.verticalSource = "none";
        }
    },
);

function resetDefaults() {
    Object.assign(local, DEFAULTS);
}

function apply() {
    emit("apply", { ...local });
    open.value = false;
}
</script>

<style scoped>
.b3d-num {
    width: 90px;
    border: 1px solid #444c56;
    border-radius: 4px;
    background: #1b2027;
    color: #eee;
    padding: 4px 6px;
}
</style>

