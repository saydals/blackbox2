<template>
    <div class="toolbar-panel log-sync-panel">
        <h4>Log sync</h4>
        <div class="flex items-center gap-0.5">
            <UButton
                variant="ghost"
                color="neutral"
                icon="i-lucide-step-back"
                size="sm"
                title="Move log earlier"
                @click="$emit('sync-back')"
            />
            <UButton
                variant="ghost"
                color="neutral"
                icon="i-lucide-align-start-vertical"
                size="sm"
                title="Start log here"
                @click="$emit('sync-here')"
            />
            <UButton
                variant="ghost"
                color="neutral"
                icon="i-lucide-step-forward"
                size="sm"
                title="Move log later"
                @click="$emit('sync-forward')"
            />
            <UInput
                :model-value="appStore.videoOffsetDisplay"
                size="sm"
                class="w-16 font-mono"
                title="Enter a time offset"
                @change="$emit('offset-change', $event.target.value)"
            />
            <UButton
                variant="ghost"
                color="neutral"
                icon="i-lucide-align-center-vertical"
                size="sm"
                title="Smart Sync (Alt+M)"
                @click="$emit('smart-sync')"
            />
        </div>
    </div>
</template>

<script setup>
import { useAppStore } from "../stores/app.js";

defineEmits(["sync-back", "sync-forward", "sync-here", "smart-sync", "offset-change"]);

const appStore = useAppStore();
</script>
