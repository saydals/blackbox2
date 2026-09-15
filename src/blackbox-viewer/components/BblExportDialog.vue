<script setup>
import { computed, ref, watch, onUnmounted } from "vue";
import FileSystem from "@/js/FileSystem.js";
import { useLogStore } from "../stores/log.js";
import { usePlaybackStore } from "../stores/playback.js";
import { useAppStore } from "../stores/app.js";
import { generateBbl, suggestedName } from "../export_utils.js";
import { getAvailableSampleRates } from "../bbl-exporter.js";

const open = defineModel("open", { type: Boolean, default: false });
const appStore = useAppStore();
const logStore = useLogStore();
const playbackStore = usePlaybackStore();

const mode = ref("settings");
const progress = ref({ frame: 0, totalFrames: 0 });
const resultInfo = ref(null);
const errorMessage = ref("");
const sampleRate = ref(null);

const markInTime = computed(() => playbackStore.videoExportInTime);
const markOutTime = computed(() => playbackStore.videoExportOutTime);
const hasMarks = computed(() => markInTime.value !== null && markOutTime.value !== null);
const markRangeText = computed(() => {
    if (!hasMarks.value) return "Full log (no markers)";
    const fmt = (t) => {
        if (t == null) return "—";
        const sec = (t - (logStore.flightLog?.getMinTime?.() ?? 0)) / 1000000;
        const m = Math.floor(sec / 60);
        const s = Math.floor(sec % 60);
        return `${m}:${String(s).padStart(2, "0")}`;
    };
    return `${fmt(markInTime.value)} – ${fmt(markOutTime.value)}`;
});

const originalRate = computed(() => logStore.flightLog?.getBlackboxRate?.() ?? null);
// 다운스케일링만 지원: 원본 이하의 FC 지원 샘플레이트만 표시해 업스케일링을 원천 차단한다.
// (업스케일링 불가 다이얼로그는 표시하지 않는다.)
const downsamplingOptions = computed(() => getAvailableSampleRates(originalRate.value));

const selectedRate = computed({
    get() {
        if (
            sampleRate.value != null &&
            Number.isFinite(sampleRate.value) &&
            downsamplingOptions.value.includes(sampleRate.value)
        ) {
            return sampleRate.value;
        }
        return downsamplingOptions.value[0] ?? originalRate.value;
    },
    set(value) {
        sampleRate.value = value;
    },
});

const progressPercent = computed(() =>
    progress.value.totalFrames > 0 ? Math.round((progress.value.frame / progress.value.totalFrames) * 100) : 0,
);

watch(open, (isOpen) => {
    if (isOpen) {
        mode.value = "settings";
        resultInfo.value = null;
        errorMessage.value = "";
        progress.value = { frame: 0, totalFrames: 0 };
        sampleRate.value = null;
        selectedRate.value = null;
    }
});

async function startExport() {
    const flightLog = logStore.flightLog;
    if (!flightLog) {
        return;
    }

    const startTime = playbackStore.videoExportInTime ?? flightLog.getMinTime();
    const endTime = playbackStore.videoExportOutTime ?? flightLog.getMaxTime();

    const targetRate = selectedRate.value;
    const fileName = suggestedName(appStore.logFilename || "blackbox", "bbl", {
        flightIndex: flightLog.getLogIndex(),
        startTime,
        endTime,
        baseTime: flightLog.getMinTime(),
        sampleRate: targetRate,
        originalRate: originalRate.value,
    });

    let file;
    try {
        file = await FileSystem.pickSaveFile(fileName, "BBL file", ".bbl");
        if (!file) {
            return;
        }
    } catch (error) {
        if (error?.name === "AbortError") {
            return;
        }
        errorMessage.value = error?.message ?? String(error);
        mode.value = "error";
        return;
    }

    mode.value = "rendering";
    progress.value = { frame: 0, totalFrames: 100 };

    try {
        // 선택 가능한 Hz만 표시하므로 업스케일링은 발생할 수 없다.
        // 방어적으로 exporter 내부에서도 Output <= Original 규칙을 강제한다.
        const data = await generateBbl(
            flightLog,
            logStore.flightLogDataArray,
            startTime,
            endTime,
            targetRate < originalRate.value ? targetRate : null,
        );
        await FileSystem.writeFile(file, data);
        resultInfo.value = { name: fileName };
        mode.value = "done";
    } catch (error) {
        errorMessage.value = error?.message ?? String(error);
        mode.value = "error";
    }
}

function cancelExport() {
    open.value = false;
}

onUnmounted(cancelExport);
</script>

<template>
    <UModal
        v-model:open="open"
        title="Export BBL"
        :close="mode !== 'rendering'"
        :dismissible="mode !== 'rendering'"
        :ui="{ content: 'sm:max-w-xl' }"
    >
        <template #body>
            <div v-if="mode === 'settings'" class="flex flex-col gap-4">
                <p class="text-sm">
                    Exports the range marked with <kbd>I</kbd> and <kbd>O</kbd>. With no markers, the whole log is used.
                </p>
                <p class="text-sm text-muted">
                    Selected range: {{ markRangeText }}
                </p>

                <UFormField v-show="downsamplingOptions.length" label="Output sample rate">
                    <USelect
                        v-model="selectedRate"
                        :items="downsamplingOptions.map((r) => ({ label: `${r} Hz`, value: r }))"
                        :ui="{ content: 'z-[3002]' }"
                        class="w-full"
                    />
                    <p v-if="originalRate && selectedRate < originalRate" class="text-xs text-muted mt-1">
                        Downsampling from {{ originalRate }} Hz to {{ selectedRate }} Hz.
                    </p>
                    <p class="text-xs text-muted mt-1">Upsampling is not supported.</p>
                </UFormField>
            </div>

            <div v-else-if="mode === 'rendering'" class="flex flex-col gap-3">
                <p class="text-sm">Exporting BBL…</p>
                <UProgress :model-value="progressPercent" />
            </div>

            <div v-else-if="mode === 'done'" class="flex flex-col gap-3">
                <p class="text-sm">
                    Saved {{ resultInfo?.name }}.
                </p>
            </div>

            <UAlert v-else color="error" variant="subtle" title="BBL export failed" :description="errorMessage" />
        </template>

        <template #footer>
            <div class="flex w-full justify-end gap-2">
                <template v-if="mode === 'settings'">
                    <UButton color="neutral" variant="outline" label="Cancel" @click="open = false" />
                    <UButton label="Start Export" :disabled="!logStore.hasLog" @click="startExport" />
                </template>
                <UButton v-else-if="mode === 'rendering'" color="neutral" variant="outline" label="Cancel" @click="cancelExport" />
                <UButton v-else label="Close" @click="open = false" />
            </div>
        </template>
    </UModal>
</template>
