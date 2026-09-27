<template>
    <UModal v-model:open="open" :ui="{ content: 'sm:max-w-md' }" class="overflow-visible">
        <template #header>
            <h4 class="font-semibold">No GPS — Flight Estimation (v4)</h4>
        </template>

        <template #body>
            <div class="flex flex-col gap-3 text-xs">
                <p class="text-dimmed leading-relaxed">
                    추정기는 스로틀(콜렉티브)과 자세를 적분해 비행 경로를 재구성합니다. 아래 파라미터로 실제 비행에 가깝게
                    조정할 수 있습니다.
                </p>

                <!-- ===== 수직 소스 ===== -->
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

                <!-- ===== Hover / collective ===== -->
                <div class="mt-1 border-t border-[#2a323c] pt-2">
                    <span class="font-semibold">Hover point (collective)</span>
                </div>
                <div class="flex items-center gap-3">
                    <label class="flex items-center gap-2 cursor-pointer" title="Detect the hover point from the log's collective median (recommended)">
                        <input v-model="local.autoHover" type="checkbox" />
                        <span class="font-semibold">Auto hover point (from log)</span>
                    </label>
                </div>
                <div class="flex items-center gap-3">
                    <span
                        class="w-40 text-dimmed"
                        title="Collective value where the craft neither climbs nor sinks — used when auto is off. In stick-centred logs hover is usually near 0, not 50."
                        >Hover collective (manual)</span
                    >
                    <input
                        v-model.number="local.hoverCollective"
                        type="number"
                        min="-100"
                        max="100"
                        step="1"
                        class="b3d-num"
                        :disabled="local.autoHover"
                    />
                </div>
                <div class="flex items-center gap-3">
                    <span class="w-40 text-dimmed" title="Extra upward acceleration at full collective above the hover point">Full-pitch climb accel (m/s²)</span>
                    <input v-model.number="local.fullPitchAccel" type="number" min="0" max="30" step="0.5" class="b3d-num" />
                </div>
                <div class="flex items-center gap-3">
                    <span class="w-40 text-dimmed" title="Height above ground at the start of the replay (collective mode)">Start altitude (m)</span>
                    <input v-model.number="local.startAltitude" type="number" min="0" max="50" step="0.5" class="b3d-num" />
                </div>

                <!-- ===== 모션 리얼리즘 ===== -->
                <div class="mt-1 border-t border-[#2a323c] pt-2">
                    <span class="font-semibold">Motion realism</span>
                    <p class="text-dimmed ml-2 leading-relaxed">
                        중립 밴드 안의 입력은 무시되고(제자리), 로터는 1차 지연으로 응답하며, 플립/롤 같은 3D 기동 중에는
                        기체가 제자리에서 회전한다고 모델링합니다.
                    </p>
                </div>
                <div class="flex items-center gap-3">
                    <span class="w-40 text-dimmed" title="Linear velocity damping — larger values stop the craft sooner when the stick centres (v4 default 0.2)">Drag coefficient (1/s)</span>
                    <input v-model.number="local.drag" type="number" min="0" max="1" step="0.01" class="b3d-num" />
                </div>
                <div class="flex items-center gap-3">
                    <span class="w-40 text-dimmed" title="Collective within ± this of the hover point counts as neutral (hover thrust)">Collective neutral ±</span>
                    <input v-model.number="local.neutralBand" type="number" min="0" max="50" step="1" class="b3d-num" />
                </div>
                <div class="flex items-center gap-3">
                    <span class="w-40 text-dimmed" title="Tilt below this angle drives no horizontal translation (displayed attitude is unaffected)">Tilt neutral (deg)</span>
                    <input v-model.number="local.axisNeutralBand" type="number" min="0" max="30" step="1" class="b3d-num" />
                </div>
                <div class="flex items-center gap-3">
                    <span class="w-40 text-dimmed" title="0 = 기동 감쇠 끔, 1 = 기본. 기울기 30°(플립/롤) 이상에서 수평 이동을 억제해 기체가 헬기장 밖으로 튀어나가지 않게 한다">Maneuver damping (3D flips)</span>
                    <input v-model.number="local.maneuverDamp" type="range" min="0" max="1" step="0.05" class="flex-1" />
                    <span class="w-10 text-right">{{ local.maneuverDamp.toFixed(2) }}</span>
                </div>
                <div class="flex items-center gap-3">
                    <span class="w-40 text-dimmed" title="Fraction of the vertical acceleration cancelled at the start of the hang (decays over the hang time)">Gravity relief (0–1)</span>
                    <input v-model.number="local.gravityRelief" type="number" min="0" max="1" step="0.05" class="b3d-num" />
                </div>
                <div class="flex items-center gap-3">
                    <span class="w-40 text-dimmed" title="How long the craft hangs after the collective returns to neutral">Hang time (s)</span>
                    <input v-model.number="local.floatTime" type="number" min="0" max="5" step="0.1" class="b3d-num" />
                </div>
                <div class="flex items-center gap-3">
                    <span class="w-40 text-dimmed" title="Duration of the extra braking after a cyclic reversal">Settle time (s)</span>
                    <input v-model.number="local.reversePause" type="number" min="0" max="3" step="0.1" class="b3d-num" />
                </div>

                <!-- ===== 드리프트 제어 ===== -->
                <div class="mt-1 border-t border-[#2a323c] pt-2">
                    <span class="font-semibold">Drift control (stay near home)</span>
                    <p class="text-dimmed ml-2 leading-relaxed">
                        소프트 반경을 벗어나면 헬기장 중심 방향으로 2차 곡선 가중치의 복귀 가속이 걸립니다 — 안쪽에서는
                        부드럽게, 150 m 하드 펜스 근처에서는 강하게 작동해 자연스럽게 돌아옵니다.
                    </p>
                </div>
                <div class="flex items-center gap-3">
                    <span class="w-40 text-dimmed" title="Maximum acceleration toward home, reached at the 150 m fence (v4: 3 m/s², 2차 램프)">Home bias (m/s²)</span>
                    <input v-model.number="local.homeBias" type="number" min="0" max="5" step="0.1" class="b3d-num" />
                </div>
                <div class="flex items-center gap-3">
                    <span class="w-40 text-dimmed" title="Fraction of the 150 m fence where the home bias starts — v4 default 0.15 = 22.5 m">Soft radius (× fence)</span>
                    <input v-model.number="local.homeSoftRadius" type="number" min="0" max="0.5" step="0.05" class="b3d-num" />
                </div>

                <!-- ===== 항상 적용되는 안전장치 (고정 스펙) ===== -->
                <div class="mt-1 border-t border-[#2a323c] pt-2">
                    <span class="font-semibold">Safety limits (항상 적용)</span>
                    <ul class="text-dimmed ml-2 leading-relaxed list-disc list-outside">
                        <li>고도 상한: 15 m AGL부터 상승 속도 점진 감쇠 → 50 m 완전 클램프</li>
                        <li>그라운드 쿠션: 5 m 이하 하강 속도 점진 감쇠 → 0 m 하드 플로어</li>
                        <li>헬기장 펜스: 중심에서 150 m 이상 벗어나지 않음 (하드)</li>
                    </ul>
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

// v4 defaults — mirrors EST_DEFAULTS in Blackbox3DPanel.vue.
const DEFAULTS = {
    verticalSource: "baroSmooth",
    baroSmoothing: 0.8,
    autoHover: true,
    hoverCollective: 0,
    fullPitchAccel: 10,
    drag: 0.2,
    startAltitude: 3,
    neutralBand: 10,
    axisNeutralBand: 8,
    gravityRelief: 0.7,
    floatTime: 2,
    reversePause: 0.6,
    homeBias: 3,
    homeSoftRadius: 0.15,
    maneuverDamp: 1,
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
