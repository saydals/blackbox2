<template>
    <!-- FFT Vibration Spectrum toggle — sits to the right of the 3D Blackbox
        toggle, separated by the toolbar divider. Opens the FFT Vibration
        Frequency Spectrum over the graph area. Icon: lucide "activity"
        (the vibanalyse FFT icon), drawn neutral/gray like the other toolbar
        icons. -->
    <div class="toolbar-panel log-fft-panel">
        <h4>FFT</h4>
        <div class="flex items-center gap-0.5">
            <UButton
                variant="ghost"
                :color="modelValue ? 'primary' : 'neutral'"
                size="sm"
                icon="i-lucide-activity"
                :aria-label="modelValue ? 'Close FFT vibration spectrum' : 'Open FFT vibration spectrum'"
                :aria-pressed="modelValue"
                title="FFT Vibration Frequency Spectrum"
                :disabled="!logStore.hasLog"
                @click="$emit('update:modelValue', !modelValue)"
            />
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
