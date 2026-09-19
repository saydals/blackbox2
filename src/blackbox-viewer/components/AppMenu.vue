<template>
    <div class="toolbar-panel toolbar-panel--menu">
        <h4>Menu</h4>
        <UDropdownMenu :items="menuItems" :content="{ align: 'end', side: 'bottom' }">
            <UButton
                variant="ghost"
                color="neutral"
                size="sm"
                icon="i-lucide-menu"
                aria-label="Application menu"
                title="Menu"
            />
        </UDropdownMenu>
    </div>
</template>

<script setup>
import { computed, ref, watch } from "vue";
import { useLogStore } from "../stores/log.js";
import { probeVideoExport } from "../video_export.js";

const emit = defineEmits(["export-bbl", "export-csv", "export-video", "open-settings", "open-keys"]);

const logStore = useLogStore();
const videoCapability = ref(null);
let probeGeneration = 0;

const videoExportDisabled = computed(() => !videoCapability.value?.canEncode);

const videoExportTitle = computed(() => {
    if (!videoCapability.value) {
        return "Checking video export support…";
    }
    return videoCapability.value.canEncode ? "Render the marked range to a video file" : videoCapability.value.reason;
});

watch(
    () => logStore.hasLog,
    async (hasLog) => {
        const generation = ++probeGeneration;
        videoCapability.value = null;
        if (!hasLog) {
            return;
        }
        let result;
        try {
            result = await probeVideoExport({ width: 1280, height: 720 });
        } catch (error) {
            result = {
                canEncode: false,
                reason: `Video capability detection failed: ${error?.message ?? String(error)}`,
            };
        }
        if (generation === probeGeneration) {
            videoCapability.value = result;
        }
    },
    { immediate: true },
);

const menuItems = computed(() => [
    [
        {
            label: "Export BBL",
            icon: "i-lucide-file-spreadsheet",
            disabled: !logStore.hasLog,
            onSelect() {
                emit("export-bbl");
            },
        },
        {
            label: "Export CSV",
            icon: "i-lucide-file-spreadsheet",
            disabled: !logStore.hasLog,
            onSelect() {
                emit("export-csv");
            },
        },
        {
            label: "Export Video",
            icon: "i-lucide-video",
            disabled: !logStore.hasLog || videoExportDisabled.value,
            title: videoExportTitle.value,
            onSelect() {
                if (!videoExportDisabled.value) {
                    emit("export-video");
                }
            },
        },
    ],
    [
        {
            label: "Setting",
            icon: "i-lucide-settings",
            onSelect() {
                emit("open-settings");
            },
        },
        {
            label: "Keyboard",
            icon: "i-lucide-keyboard",
            onSelect() {
                emit("open-keys");
            },
        },
    ],
]);
</script>
