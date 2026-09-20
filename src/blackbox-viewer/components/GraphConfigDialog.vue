<template>
    <UModal v-model:open="open" :ui="{ content: 'sm:max-w-fit' }" class="overflow-visible">
        <template #header>
            <div class="flex items-center justify-between w-full">
                <h4 class="font-semibold">Configure graphs</h4>
                <div class="flex items-center gap-2">
                    <UDropdownMenu :items="addGraphItems" :content="{ class: 'z-[3002]' }">
                        <UButton
                            variant="outline"
                            color="neutral"
                            icon="i-lucide-plus"
                            label="Add graph"
                            trailing-icon="i-lucide-chevron-down"
                            size="xs"
                        />
                    </UDropdownMenu>
                    <UButton
                        v-if="localGraphs.length > 0"
                        variant="ghost"
                        color="error"
                        icon="i-lucide-trash-2"
                        label="Remove all"
                        size="xs"
                        @click="
                            localGraphs = [];
                            emitUpdate();
                        "
                    />
                </div>
            </div>
            <div id="menu-portal-container"></div>
        </template>

        <template #body>
            <div ref="graphListEl" class="flex flex-col gap-4 max-h-[70vh] overflow-y-auto">
                <!-- Graph panels (drag the handle to reorder) -->
                <UiBox
                    v-for="(graph, gIdx) in localGraphs"
                    :key="graph._uid"
                    :title="`Graph ${gIdx + 1}${graph.label ? ' — ' + graph.label : ''}`"
                >
                    <template #title>
                        <UIcon
                            name="i-lucide-grip-vertical"
                            class="drag-handle size-3.5 cursor-grab active:cursor-grabbing opacity-50 hover:opacity-100"
                            title="Drag to reorder graph"
                        />
                        <UButton
                            variant="ghost"
                            color="neutral"
                            icon="i-lucide-chevron-up"
                            size="2xs"
                            class="disabled:opacity-30"
                            :ui="{ leadingIcon: 'text-black!' }"
                            :disabled="gIdx === 0"
                            :aria-label="`Move graph ${gIdx + 1} up`"
                            @click.stop="moveGraph(gIdx, gIdx - 1)"
                        />
                        <UButton
                            variant="ghost"
                            color="neutral"
                            icon="i-lucide-chevron-down"
                            size="2xs"
                            class="disabled:opacity-30"
                            :ui="{ leadingIcon: 'text-black!' }"
                            :disabled="gIdx === localGraphs.length - 1"
                            :aria-label="`Move graph ${gIdx + 1} down`"
                            @click.stop="moveGraph(gIdx, gIdx + 1)"
                        />
                    </template>
                    <div class="flex flex-col gap-1">
                        <!-- Graph settings row -->
                        <div class="flex items-center gap-3 mb-1 text-xs">
                            <span class="text-dimmed">Label</span>
                            <UInput
                                v-model="graph.label"
                                placeholder="Axis label"
                                size="xs"
                                class="w-44"
                                @change="emitUpdate()"
                            />
                            <span class="text-dimmed">Height</span>
                            <USelect
                                v-model.number="graph.height"
                                :items="heightOptions"
                                :ui="{ content: 'z-[3002]' }"
                                size="xs"
                                class="w-16"
                                @change="emitUpdate()"
                            />
                            <div class="flex-1" />
                            <UButton
                                variant="ghost"
                                color="error"
                                icon="i-lucide-trash-2"
                                size="xs"
                                @click="
                                    localGraphs.splice(gIdx, 1);
                                    emitUpdate();
                                "
                            />
                        </div>

                        <!-- Field grid (PID table style) -->
                        <div
                            class="grid grid-cols-[11rem_auto_auto_auto_2rem_auto_auto_2rem] gap-x-3 gap-y-1 items-center min-w-0"
                        >
                            <!-- Header -->
                            <div />
                            <div class="text-xs text-center text-dimmed">Smooth</div>
                            <div class="text-xs text-center text-dimmed">Expo</div>
                            <div class="text-xs text-center text-dimmed">Line</div>
                            <div class="text-xs text-center text-dimmed">Color</div>
                            <div class="text-xs text-center text-dimmed">Min</div>
                            <div class="text-xs text-center text-dimmed">Max</div>
                            <div />

                            <!-- Field rows -->
                            <template v-for="(field, fIdx) in graph.fields" :key="fIdx">
                                <USelectMenu
                                    v-model="field.name"
                                    :items="fieldItems"
                                    value-key="value"
                                    size="xs"
                                    :ui="{ content: 'z-[3002] max-h-72' }"
                                    :search-input="false"
                                    @update:model-value="
                                        onFieldChange(graph, field);
                                        emitUpdate();
                                    "
                                >
                                    <template #default>
                                        <span v-if="field.name" class="truncate">{{ friendlyName(field.name) }}</span>
                                        <span v-else class="opacity-50 truncate">Choose a field</span>
                                    </template>
                                </USelectMenu>
                                <UInputNumber
                                    :model-value="(field.smoothing ?? 0) / 100"
                                    :step="1"
                                    :min="0"
                                    :max="100"
                                    :format-options="noGrouping"
                                    size="xs"
                                    orientation="vertical"
                                    :ui="{ root: 'w-16' }"
                                    @update:model-value="
                                        field.smoothing = $event * 100;
                                        emitUpdate();
                                    "
                                />
                                <UInputNumber
                                    :model-value="Math.round((field.curve?.power ?? 1) * 100)"
                                    :step="10"
                                    :min="0"
                                    :max="500"
                                    :format-options="noGrouping"
                                    size="xs"
                                    orientation="vertical"
                                    :ui="{ root: 'w-16' }"
                                    @update:model-value="
                                        if (!field.curve) field.curve = {};
                                        field.curve.power = $event / 100;
                                        emitUpdate();
                                    "
                                />
                                <UInputNumber
                                    v-model="field.lineWidth"
                                    :step="1"
                                    :min="1"
                                    :max="5"
                                    :format-options="noGrouping"
                                    size="xs"
                                    orientation="vertical"
                                    :ui="{ root: 'w-12' }"
                                    @update:model-value="emitUpdate()"
                                />
                                <div class="flex justify-center">
                                    <span
                                        class="inline-block w-6 h-6 rounded-sm cursor-pointer border border-neutral-200 dark:border-neutral-700"
                                        :style="{ backgroundColor: field.color }"
                                        :title="palette.find((c) => c.color === field.color)?.name || 'Color'"
                                        @click="cycleColor(field)"
                                    />
                                </div>
                                <UContextMenu
                                    :items="menuItems"
                                    portal="#menu-portal-container"
                                    :ui="{ content: 'z-[9999] relative' }"
                                >
                                    <div style="display: contents" @contextmenu="(e) => onContextMenu(e, graph, field)">
                                        <UInputNumber
                                            :model-value="field.curve?.MinMax?.min ?? -500"
                                            :step="
                                                field.curve?.highPrecise
                                                    ? FINE_MIN_MAX_STEP
                                                    : coarseMinMaxStep(field.curve?.MinMax)
                                            "
                                            :step-snapping="false"
                                            :class="{ italic: field.curve?.highPrecise }"
                                            :format-options="noGrouping"
                                            size="xs"
                                            orientation="vertical"
                                            :ui="{ root: 'w-20' }"
                                            @update:model-value="
                                                setMin(field, $event);
                                                emitUpdate();
                                            "
                                            @dblclick="
                                                resetMin(field);
                                                emitUpdate();
                                            "
                                            @keydown="
                                                (e) => {
                                                    if (e.key === 'Control' && field.curve) {
                                                        field.curve.highPrecise = !field.curve.highPrecise;
                                                    }
                                                }
                                            "
                                        />
                                        <UInputNumber
                                            :model-value="field.curve?.MinMax?.max ?? 500"
                                            :step="
                                                field.curve?.highPrecise
                                                    ? FINE_MIN_MAX_STEP
                                                    : coarseMinMaxStep(field.curve?.MinMax)
                                            "
                                            :step-snapping="false"
                                            :class="{ italic: field.curve?.highPrecise }"
                                            :format-options="noGrouping"
                                            size="xs"
                                            orientation="vertical"
                                            :ui="{ root: 'w-20' }"
                                            @update:model-value="
                                                setMax(field, $event);
                                                emitUpdate();
                                            "
                                            @dblclick="
                                                resetMax(field);
                                                emitUpdate();
                                            "
                                            @keydown="
                                                (e) => {
                                                    if (e.key === 'Control' && field.curve) {
                                                        field.curve.highPrecise = !field.curve.highPrecise;
                                                    }
                                                }
                                            "
                                        />
                                    </div>
                                </UContextMenu>
                                <UButton
                                    variant="ghost"
                                    color="error"
                                    icon="i-lucide-trash-2"
                                    size="2xs"
                                    @click="removeField(graph, fIdx)"
                                />
                            </template>
                        </div>

                        <!-- Add field -->
                        <div class="flex justify-end mt-1">
                            <UButton
                                variant="link"
                                color="neutral"
                                icon="i-lucide-plus"
                                label="Add field"
                                size="xs"
                                @click="addField(graph)"
                            />
                        </div>
                    </div>
                </UiBox>
            </div>
        </template>

        <template #footer>
            <div class="flex justify-end gap-2">
                <UButton variant="outline" color="neutral" label="Cancel" @click="onCancel" />
                <UButton color="primary" label="Apply changes" @click="onSave" />
            </div>
        </template>
    </UModal>
</template>

<script setup>
import { ref, watch, computed, onBeforeUnmount } from "vue";
import Sortable from "sortablejs";
import UiBox from "./UiBox.vue";
import { GraphConfig } from "../graph_config.js";
import { FlightLogFieldPresenter } from "../flightlog_fields_presenter.js";
import { coarseMinMaxStep, FINE_MIN_MAX_STEP, needsFineStep } from "../curve_step.js";
import { useWorkspaceStore } from "../stores/workspace.js";
import { getPresetSource, PRESET_COUNT } from "../workspaces.js";
const open = defineModel("open", { type: Boolean, default: false });

const props = defineProps({
    flightLog: { type: Object, default: null },
    graphConfig: { type: Object, default: null },
    grapher: { type: Object, default: null },
});

const emit = defineEmits(["save", "update"]);

const palette = GraphConfig.PALETTE;
const noGrouping = { useGrouping: false };
const localGraphs = ref([]);
const prevConfig = ref(null);
const offeredFields = ref([]);
const exampleGraphs = ref([]);

// 필드명 -> workspace에 저장된 표시 속성(smooth/expo/line/color/min-max) 조회표.
// 다이얼로그가 열릴 때 미리 조사해서 저장해 둔다: 현재 그래프(localGraphs)는 물론,
// 현재 화면에 없는 다른 workspace 슬롯에 저장된 속성까지 포함한다.
// 목적: 빈 그래프에 PID P[yaw] 같은 필드를 새로 추가해도, 비어 있다는 이유만으로
// 제네릭 기본값이 들어가지 않고 저장된 workspace 속성을 따라 일관되게 보이게 한다.
const workspaceFieldRegistry = ref(new Map());
function rememberWorkspaceField(field) {
    if (!field?.name || workspaceFieldRegistry.value.has(field.name)) {
        return;
    }
    // findExistingField()가 localGraphs 필드와 동일한 모양으로 돌려주도록
    // field-like 형태로 저장한다: { name, smoothing, curve:{power,MinMax}, color, lineWidth }
    const fromCurve = field.curve?.MinMax ? { ...field.curve.MinMax } : undefined;
    const fromDefault = field.default?.MinMax ? { ...field.default.MinMax } : undefined;
    const minMax = fromCurve ?? fromDefault;
    workspaceFieldRegistry.value.set(field.name, {
        name: field.name,
        smoothing: field.smoothing,
        curve: {
            power: field.curve?.power,
            ...(minMax ? { MinMax: minMax } : {}),
        },
        color: field.color,
        lineWidth: field.lineWidth,
    });
}
function buildWorkspaceFieldRegistry() {
    workspaceFieldRegistry.value = new Map();
    // 1) 현재 화면의 그래프(adapted, MinMax 포함)를 최우선으로 등록
    for (const g of props.graphConfig?.getGraphs?.() ?? []) {
        for (const f of g?.fields ?? []) {
            rememberWorkspaceField(f);
        }
    }
    // 2) 저장된 workspace 슬롯 전체를 조사 (현재 열려 있지 않은 그래프 포함).
    // pinia store에 없으면(테스트/독립 실행) 번들된 프리셋을 대신 본다.
    let slots = [];
    try {
        slots = useWorkspaceStore()?.workspaceGraphConfigs ?? [];
    } catch {
        slots = [];
    }
    if (!slots?.length) {
        slots = Array.from({ length: PRESET_COUNT }, (_, i) => getPresetSource(i));
    }
    for (const slot of slots) {
        for (const g of slot?.graphConfig ?? []) {
            for (const f of g?.fields ?? []) {
                rememberWorkspaceField(f);
            }
        }
    }
    // 3) 그래프에 없는 그룹 멤버(axisP[0] 등)도: motor[all] 같은 그룹명을 확장해
    // 형제 멤버(axisP[2] 등)의 속성을 미리 물려준다. extendFields는 flightLog가
    // 있어야 동작하므로 없을 때는 스킵.
    if (props.flightLog && props.graphConfig?.extendFields) {
        const groupNames = new Set();
        for (const name of workspaceFieldRegistry.value.keys()) {
            const m = name.match(/^(.+)\[all\]$/);
            if (m) {
                groupNames.add(name);
            }
        }
        // offeredFields에 있는 그룹명도 포함 (registry에 아직 없어도 확장 시도)
        try {
            for (const name of offeredFields.value ?? []) {
                if (/\[all\]$/.test(name ?? "")) {
                    groupNames.add(name);
                }
            }
        } catch {
            /* ignore */
        }
        for (const groupName of groupNames) {
            let expanded = [];
            try {
                expanded = props.graphConfig.extendFields(props.flightLog, { name: groupName }) ?? [];
            } catch {
                expanded = [];
            }
            for (const ef of expanded) {
                if (!workspaceFieldRegistry.value.has(ef?.name) && ef?.name) {
                    // 그룹 자체에 저장된 속성이 있으면 물려주고, 없으면 기본 계산값 사용
                    const groupTpl = workspaceFieldRegistry.value.get(groupName);
                    workspaceFieldRegistry.value.set(ef.name, {
                        name: ef.name,
                        smoothing: groupTpl?.smoothing ?? ef.smoothing,
                        curve: {
                            power: groupTpl?.curve?.power ?? ef.curve?.power,
                            ...((groupTpl?.curve?.MinMax ?? ef.curve?.MinMax)
                                ? { MinMax: { ...(groupTpl?.curve?.MinMax ?? ef.curve.MinMax) } }
                                : {}),
                        },
                        color: groupTpl?.color ?? ef.color,
                        lineWidth: groupTpl?.lineWidth ?? ef.lineWidth,
                    });
                }
            }
        }
    }
}

// --- Drag-and-drop reordering of graph panels (Sortable.js) ---
// Stable per-panel id so Vue's keyed reconciliation cooperates with Sortable's
// DOM move instead of corrupting the list (index keys would break after a drag).
let uidCounter = 0;
function nextUid() {
    uidCounter += 1;
    return uidCounter;
}

const graphListEl = ref(null);
let sortable = null;

// Move a graph panel from one position to another. Shared by the drag handle
// (Sortable) and the keyboard-accessible move up/down buttons. Guards against
// out-of-bounds / undefined indices (Sortable can report undefined indices in
// edge cases, and splice(undefined, ...) would corrupt the list).
function moveGraph(oldIndex, newIndex) {
    if (
        oldIndex === newIndex ||
        oldIndex == null ||
        newIndex == null ||
        oldIndex < 0 ||
        newIndex < 0 ||
        oldIndex >= localGraphs.value.length ||
        newIndex >= localGraphs.value.length
    ) {
        return;
    }
    const [moved] = localGraphs.value.splice(oldIndex, 1);
    localGraphs.value.splice(newIndex, 0, moved);
    emitUpdate();
}

watch(graphListEl, (el) => {
    if (sortable) {
        sortable.destroy();
        sortable = null;
    }
    if (!el) {
        return;
    }
    sortable = Sortable.create(el, {
        handle: ".drag-handle",
        ghostClass: "opacity-30",
        animation: 150,
        onEnd({ oldIndex, newIndex }) {
            moveGraph(oldIndex, newIndex);
        },
    });
});

onBeforeUnmount(() => {
    sortable?.destroy();
    sortable = null;
});

const heightOptions = [
    { label: "1", value: 1 },
    { label: "2", value: 2 },
    { label: "3", value: 3 },
    { label: "4", value: 4 },
    { label: "5", value: 5 },
];

// Build USelect items from offered fields
const fieldItems = computed(() =>
    offeredFields.value.map((fn) => ({
        label: friendlyName(fn),
        value: fn,
    })),
);

// Build UDropdownMenu items for "Add graph"
const addGraphItems = computed(() => [
    exampleGraphs.value.map((eg) => ({
        label: eg.label,
        onSelect() {
            addExampleGraph(eg);
        },
    })),
]);

const BLACKLISTED_FIELDS = {
    time: true,
    loopIteration: true,
};
const ARRAY_FIELD_PATTERN = /^(.+)\[\d+\]$/;

function collectFieldsFromLog(fieldNames, result, seen) {
    let lastRoot = null;
    for (const name of fieldNames) {
        if (BLACKLISTED_FIELDS[name]) {
            continue;
        }
        const m = name.match(ARRAY_FIELD_PATTERN);
        if (m && m[1] !== lastRoot) {
            lastRoot = m[1];
            const allName = `${lastRoot}[all]`;
            result.push(allName);
            seen[allName] = true;
        } else if (!m) {
            lastRoot = null;
        }
        result.push(name);
        seen[name] = true;
    }
}

function collectFieldsFromConfig(graphConfig, result, seen) {
    const graphs = graphConfig.getGraphs();
    for (const g of graphs) {
        for (const f of g.fields) {
            if (!seen[f.name]) {
                result.push(f.name);
                seen[f.name] = true;
            }
        }
    }
}

// Build the offered field names list
function buildOfferedFields() {
    if (!props.flightLog) {
        return;
    }

    const fieldNames = props.flightLog.getMainFieldNames();
    const result = [];
    const seen = {};

    collectFieldsFromLog(fieldNames, result, seen);

    // Include any fields from current config that aren't in this log
    if (props.graphConfig) {
        collectFieldsFromConfig(props.graphConfig, result, seen);
    }

    offeredFields.value = result;
}

function buildExampleGraphs() {
    if (!props.flightLog) {
        return;
    }
    const examples = GraphConfig.getExampleGraphConfigs(props.flightLog);
    examples.unshift({
        label: "Custom graph",
        fields: [{ name: "" }],
        dividerAfter: true,
    });
    exampleGraphs.value = examples;
}

// Convert internal graph config to the format expected by legacy code
function convertToConfig() {
    return localGraphs.value.map((g) => ({
        label: g.label || "",
        height: g.height || 1,
        fields: g.fields
            .filter((f) => f.name)
            .map((f) => ({
                name: f.name,
                smoothing: f.smoothing,
                curve: {
                    power: f.curve?.power ?? 1,
                    MinMax: {
                        min: f.curve?.MinMax?.min ?? -500,
                        max: f.curve?.MinMax?.max ?? 500,
                    },
                },
                default: {
                    smoothing: f.smoothing,
                    power: f.curve?.power ?? 1,
                    MinMax: {
                        min: f.curve?.MinMax?.min ?? -500,
                        max: f.curve?.MinMax?.max ?? 500,
                    },
                },
                color: f.color,
                lineWidth: f.lineWidth || 1,
            })),
    }));
}

function friendlyName(fieldName) {
    const debugMode = props.flightLog?.getSysConfig()?.debug_mode;
    return FlightLogFieldPresenter.fieldNameToFriendly(
        fieldName,
        debugMode,
        props.flightLog?.getSysConfig()?.apiVersion,
        props.flightLog?.getSysConfig()?.firmwareType,
        props.flightLog?.getSysConfig()?.firmwareVersion,
    );
}

function getDefaults(fieldName) {
    // workspace에 저장된 속성을 미리 조사한 조회표에서 그대로 가져온다.
    // 조회표는 다이얼로그 오픈 시점에 buildWorkspaceFieldRegistry()가
    // 현재 그래프 + 저장된 workspace 슬롯 전체를 조사해서 미리 지정해 둔다.
    // 빈 그래프에 새 필드를 추가해도 조회표에 있으면 저장 속성을 따라 일관되게 보인다.
    // smooth / expo(power) / line(lineWidth) / color / min-max 전부 그대로 따른다.
    // 저장된 속성이 없을 때만 로그 기반 계산값(getDefaultCurve/Smoothing)을 쓴다.
    const stored = fieldName ? workspaceFieldRegistry.value.get(fieldName) : null;
    if (!props.flightLog) {
        if (stored) {
            return {
                smoothing: stored.smoothing ?? 0,
                power: stored.curve?.power ?? 1,
                MinMax: stored.curve?.MinMax ? { ...stored.curve.MinMax } : { min: -500, max: 500 },
                lineWidth: stored.lineWidth ?? 1,
                ...(stored.color ? { color: stored.color } : {}),
            };
        }
        return { smoothing: 0, power: 1, MinMax: { min: -500, max: 500 } };
    }
    const curve = GraphConfig.getDefaultCurveForField(props.flightLog, fieldName);
    return {
        smoothing: stored?.smoothing ?? GraphConfig.getDefaultSmoothingForField(props.flightLog, fieldName),
        power: stored?.curve?.power ?? curve.power,
        MinMax: stored?.curve?.MinMax ? { ...stored.curve.MinMax } : curve.MinMax ? { ...curve.MinMax } : { min: -500, max: 500 },
        lineWidth: stored?.lineWidth ?? 1,
        ...(stored?.color ? { color: stored.color } : {}),
    };
}

// 저장된 workspace 조회표에서 같은 이름 필드의 속성을 찾아
// smooth / expo(curve.power) / line(lineWidth) / color / min-max 표시 속성을 그대로 재사용한다.
// 탐색 순서: 1) 현재 열려 있는 그래프(localGraphs) 2) 다이얼로그 오픈 시점에 미리
// 조사해 둔 workspace 전체 조회표(현재 화면에 없는 슬롯 포함).
// 목적: PID P[yaw] 처럼 프리셋/workspace에 이미 있는 필드를 새 그래프에 추가해도
// 두 곡선이 다르게 보이지 않도록 한다. 없으면 null.
function findExistingField(fieldName, excludeField = null) {
    if (!fieldName) {
        return null;
    }
    for (const g of localGraphs.value) {
        if (!g.fields) {
            continue;
        }
        for (const f of g.fields) {
            if (f === excludeField) {
                continue;
            }
            if (f.name === fieldName) {
                return f;
            }
        }
    }
    return workspaceFieldRegistry.value.get(fieldName) ?? null;
}

function ensureCurveMinMax(field) {
    if (!field.curve) {
        field.curve = {};
    }
    if (!field.curve.MinMax) {
        field.curve.MinMax = {};
    }
}

function setMin(field, val) {
    ensureCurveMinMax(field);
    const num = Number.parseFloat(val);
    if (Number.isFinite(num)) {
        field.curve.MinMax.min = num;
    }
}

function setMax(field, val) {
    ensureCurveMinMax(field);
    const num = Number.parseFloat(val);
    if (Number.isFinite(num)) {
        field.curve.MinMax.max = num;
    }
}

function resetMin(field) {
    const defaults = getDefaults(field.name);
    setMin(field, defaults.MinMax.min);
}

function resetMax(field) {
    const defaults = getDefaults(field.name);
    setMax(field, defaults.MinMax.max);
}

function applyStoredAttributes(field, stored, fieldName) {
    // 미리 조사한 workspace 조회표(getDefaults에 이미 반영됨)에서
    // smooth / expo(power) / line(lineWidth) / color / min-max를 전부 그대로 복사한다.
    // stored가 별도로 넘어오면(현재 그래프의 live 필드) 그것을 우선한다.
    const defaults = getDefaults(fieldName);
    const source = stored ?? (defaults ? { smoothing: defaults.smoothing, curve: { power: defaults.power, MinMax: defaults.MinMax }, color: defaults.color, lineWidth: defaults.lineWidth } : null);
    const minMax = source?.curve?.MinMax ? { ...source.curve.MinMax } : { ...defaults.MinMax };
    field.smoothing = source?.smoothing ?? defaults.smoothing;
    field.curve = {
        power: source?.curve?.power ?? defaults.power,
        MinMax: minMax,
        highPrecise: needsFineStep(minMax),
    };
    field.lineWidth = source?.lineWidth ?? defaults.lineWidth ?? 1;
    if (source?.color) {
        field.color = source.color;
    }
}

function onFieldChange(graph, field) {
    if (!field.name || !props.flightLog || !props.graphConfig) {
        return;
    }

    // Check if this is a group field that expands
    const expanded = props.graphConfig.extendFields(props.flightLog, {
        name: field.name,
    });
    if (expanded.length > 1) {
        // Replace this field with the expanded set
        const idx = graph.fields.indexOf(field);
        const colorStart = idx;
        const newFields = expanded.map((ef, i) => {
            const existing = findExistingField(ef.name, field);
            // 그룹 확장(axisP[all] 등): smooth/expo/line/color/min-max 전부
            // 미리 조사한 workspace 속성을 따르고,
            // 색만 새 그래프 팔레트 순번으로 덮는다(같은 그래프 안에서 색 겹침 방지).
            const c = palette[(colorStart + i) % palette.length].color;
            return makeField(ef.name, existing || ef, c);
        });
        graph.fields.splice(idx, 1, ...newFields);
    } else {
        // 미리 조사한 workspace 조회표에서 같은 이름 필드의
        // smooth/expo/line/color/min-max를 전부 그대로 복사한다.
        applyStoredAttributes(field, findExistingField(field.name, field), field.name);
    }
}

function makeField(name, existing, color) {
    // getDefaults()가 이미 미리 조사한 workspace 저장 속성
    // (smooth/expo/line/color/min-max 전부)을 반영하므로 그대로 따른다.
    // 색만 호출자가 정한 팔레트 값을 우선한다(같은 그래프 안 색 겹침 방지).
    const defaults = getDefaults(name);
    const minMax = existing?.curve?.MinMax ? { ...existing.curve.MinMax } : { ...defaults.MinMax };
    return {
        name,
        smoothing: existing?.smoothing ?? defaults.smoothing,
        curve: {
            power: existing?.curve?.power ?? defaults.power,
            MinMax: minMax,
            highPrecise: needsFineStep(minMax),
        },
        color: color || existing?.color || defaults.color || palette[0].color,
        lineWidth: existing?.lineWidth ?? defaults.lineWidth ?? 1,
    };
}

function cycleColor(field) {
    const idx = palette.findIndex((c) => c.color === field.color);
    field.color = palette[(idx + 1) % palette.length].color;
    emitUpdate();
}

function addField(graph) {
    const colorIdx = graph.fields.length;
    const color = palette[colorIdx % palette.length].color;
    graph.fields.push(makeField("", {}, color));
}

function removeField(graph, fIdx) {
    graph.fields.splice(fIdx, 1);
    if (graph.fields.length === 0) {
        const gIdx = localGraphs.value.indexOf(graph);
        if (gIdx !== -1) {
            localGraphs.value.splice(gIdx, 1);
        }
    }
    emitUpdate();
}

function addExampleGraph(example) {
    const colorBase = 0;
    const fields = [];
    for (const f of example.fields) {
        if (!props.flightLog || !props.graphConfig) {
            const existing0 = findExistingField(f.name);
            const c0 =
                existing0?.color || (f.color && f.color !== -1 ? f.color : palette[fields.length % palette.length].color);
            fields.push(makeField(f.name, existing0 || f, c0));
            continue;
        }
        const expanded = props.graphConfig.extendFields(props.flightLog, f);
        for (const ef of expanded) {
            // 프리셋/예제 그래프 추가 시에도 이미 열려 있는 동일 필드가 있으면
            // 그 속성(smooth/expo/line/color/min-max)을 그대로 따른다.
            const existing = findExistingField(ef.name);
            const c =
                existing?.color ||
                (ef.color && ef.color !== -1 ? ef.color : palette[(colorBase + fields.length) % palette.length].color);
            fields.push(makeField(ef.name, existing || ef, c));
        }
    }
    localGraphs.value.push({
        _uid: nextUid(),
        label: example.label || "",
        height: example.height || 1,
        fields,
    });
    if (example.label !== "Custom graph") {
        emitUpdate();
    }
}

function emitUpdate() {
    emit("update", convertToConfig());
}

function onSave() {
    emit("save", convertToConfig());
    open.value = false;
}

function onCancel() {
    // Restore previous config
    if (prevConfig.value) {
        emit("update", prevConfig.value);
    }
    open.value = false;
}

function cloneGraphToLocal(g) {
    const fields = [];
    for (const f of g.fields) {
        if (!props.flightLog) {
            continue;
        }
        const expanded = props.graphConfig.extendFields(props.flightLog, f);
        for (const ef of expanded) {
            const c = ef.color && ef.color !== -1 ? ef.color : palette[fields.length % palette.length].color;
            fields.push(makeField(ef.name, ef, c));
        }
    }
    return { _uid: nextUid(), label: g.label || "", height: g.height || 1, fields };
}

// Initialize when dialog opens
watch(open, (val) => {
    if (!val) {
        return;
    }
    buildOfferedFields();
    buildExampleGraphs();
    buildWorkspaceFieldRegistry();

    // Clone current graphs into local state
    if (props.graphConfig) {
        localGraphs.value = props.graphConfig.getGraphs().map(cloneGraphToLocal);
        prevConfig.value = convertToConfig();
        defineFieldsResolution();
    }
});

// The spinner step follows the size of the curve, see coarseMinMaxStep. Ctrl forces the fine step
// for a field, and those inputs are shown in italics.

function defineFieldsResolution() {
    for (const graph of localGraphs.value) {
        for (const field of graph.fields) {
            const minMax = field?.curve?.MinMax;
            if (minMax?.min != null && minMax?.max != null) {
                field.curve.highPrecise = needsFineStep(minMax);
            }
        }
    }
}

// Context menu to manage curves min-max values
// Right mouse click at min-max input to show simple menu
// Shift + right mouse click to show extended menu

const currentState = ref({
    graph: null,
    field: null,
    isFieldChecked: null,
    shiftKey: false,
});

function setMinMaxToDefault(setCheckedOnly) {
    if (currentState.value.graph?.fields) {
        for (const [index, field] of currentState.value.graph.fields.entries()) {
            if (!setCheckedOnly || !currentState.value.isFieldChecked || currentState.value.isFieldChecked[index]) {
                resetMin(field);
                resetMax(field);
            }
        }
        emitUpdate();
    }
}

function setMinMaxSelectedDefault() {
    if (currentState.value.field) {
        resetMin(currentState.value.field);
        resetMax(currentState.value.field);
        emitUpdate();
    }
}

function setMinMaxLikeThis(setCheckedOnly) {
    const mm = currentState.value.field?.curve?.MinMax;
    if (currentState.value.graph?.fields && mm?.min !== undefined && mm?.max !== undefined) {
        const min = mm.min;
        const max = mm.max;
        for (const [index, field] of currentState.value.graph.fields.entries()) {
            if (!setCheckedOnly || !currentState.value.isFieldChecked || currentState.value.isFieldChecked[index]) {
                setMin(field, min);
                setMax(field, max);
            }
        }
        emitUpdate();
    }
}

function setMinMaxOneScale(setCheckedOnly) {
    let max = -Number.MAX_VALUE;
    let min = Number.MAX_VALUE;

    if (currentState.value.graph?.fields) {
        for (const [index, field] of currentState.value.graph.fields.entries()) {
            if (!setCheckedOnly || !currentState.value.isFieldChecked || currentState.value.isFieldChecked[index]) {
                const mm = field?.curve?.MinMax;
                if (mm?.min !== undefined && mm?.max !== undefined) {
                    max = Math.max(max, mm.max);
                    min = Math.min(min, mm.min);
                }
            }
        }

        if (min !== Number.MAX_VALUE) {
            for (const [index, field] of currentState.value.graph.fields.entries()) {
                if (!setCheckedOnly || !currentState.value.isFieldChecked || currentState.value.isFieldChecked[index]) {
                    setMin(field, min);
                    setMax(field, max);
                }
            }
            emitUpdate();
        }
    }
}

function setMinMaxCentered(setCheckedOnly) {
    if (currentState.value.graph?.fields) {
        for (const [index, field] of currentState.value.graph.fields.entries()) {
            if (!setCheckedOnly || !currentState.value.isFieldChecked || currentState.value.isFieldChecked[index]) {
                const mm = field?.curve?.MinMax;
                if (mm?.min !== undefined && mm?.max !== undefined) {
                    let min = mm.min;
                    let max = mm.max;
                    max = Math.max(Math.abs(min), Math.abs(max));
                    min = -max;
                    setMin(field, min);
                    setMax(field, max);
                }
            }
        }
        emitUpdate();
    }
}

function setMinMaxSelectedCentered() {
    const mm = currentState.value.field?.curve?.MinMax;
    if (mm?.min !== undefined && mm?.max !== undefined) {
        const max = Math.max(Math.abs(mm.min), Math.abs(mm.max));
        const min = -max;
        setMin(currentState.value.field, min);
        setMax(currentState.value.field, max);
        emitUpdate();
    }
}

function setMinMaxZoom(zoom, setCheckedOnly) {
    if (currentState.value.graph?.fields) {
        for (const [index, field] of currentState.value.graph.fields.entries()) {
            if (!setCheckedOnly || !currentState.value.isFieldChecked || currentState.value.isFieldChecked[index]) {
                const mm = field?.curve?.MinMax;
                if (mm?.min !== undefined && mm?.max !== undefined) {
                    const middle = (mm.min + mm.max) / 2;
                    const halfRange = (mm.max - mm.min) / 2;
                    setMin(field, middle - halfRange * zoom);
                    setMax(field, middle + halfRange * zoom);
                }
            }
        }
        emitUpdate();
    }
}

function setMinMaxSelectedZoom(zoom) {
    const mm = currentState.value.field?.curve?.MinMax;
    if (mm?.min !== undefined && mm?.max !== undefined) {
        const middle = (mm.min + mm.max) / 2;
        const halfRange = (mm.max - mm.min) / 2;
        setMin(currentState.value.field, middle - halfRange * zoom);
        setMax(currentState.value.field, middle + halfRange * zoom);
        emitUpdate();
    }
}

function setFieldsMinMaxToFullRange(setCheckedOnly, getMinMaxFunction) {
    if (currentState.value.graph?.fields && props.flightLog) {
        for (const [index, field] of currentState.value.graph.fields.entries()) {
            if (!setCheckedOnly || !currentState.value.isFieldChecked || currentState.value.isFieldChecked[index]) {
                const mm = getMinMaxFunction(props.flightLog, props.grapher, field.name);
                if (mm?.min !== undefined && mm?.max !== undefined) {
                    setMin(field, mm.min);
                    setMax(field, mm.max);
                }
            }
        }
        emitUpdate();
    }
}

function setFieldsMinMaxToFullRangeDuringAllTime(setCheckedOnly) {
    setFieldsMinMaxToFullRange(setCheckedOnly, GraphConfig.getMinMaxForFieldDuringAllTimeInterval);
}

function setFieldsMinMaxToFullRangeDuringWindowTime(setCheckedOnly) {
    setFieldsMinMaxToFullRange(setCheckedOnly, GraphConfig.getMinMaxForFieldDuringWindowTimeInterval);
}

function setFieldsMinMaxToFullRangeDuringMarkedTime(setCheckedOnly) {
    setFieldsMinMaxToFullRange(setCheckedOnly, GraphConfig.getMinMaxForFieldDuringMarkedInterval);
}

function setSelectedFieldMinMaxToFullRange(getMinMaxFunction) {
    if (currentState.value.field?.name && props.flightLog) {
        const fieldName = currentState.value.field.name;
        const mm = getMinMaxFunction(props.flightLog, props.grapher, fieldName);
        if (mm?.min !== undefined && mm?.max !== undefined) {
            setMin(currentState.value.field, mm.min);
            setMax(currentState.value.field, mm.max);
            emitUpdate();
        }
    }
}

function setSelectedFieldMinMaxToFullRangeDuringAllTime() {
    setSelectedFieldMinMaxToFullRange((flightLog, grapher, fieldName) =>
        GraphConfig.getMinMaxForFieldDuringAllTimeInterval(flightLog, fieldName),
    );
}

function setSelectedFieldMinMaxToFullRangeDuringWindowTime() {
    setSelectedFieldMinMaxToFullRange(GraphConfig.getMinMaxForFieldDuringWindowTimeInterval);
}

function setSelectedFieldMinMaxToFullRangeDuringMarkedTime() {
    setSelectedFieldMinMaxToFullRange(GraphConfig.getMinMaxForFieldDuringMarkedInterval);
}

const zoom = 1.1;

const simpleMenuItems = computed(() => [
    [
        {
            label: "Like this one",
            onSelect() {
                setMinMaxLikeThis();
            },
        },
        {
            label: "Full range",
            onSelect() {
                setFieldsMinMaxToFullRangeDuringAllTime();
            },
        },
        {
            label: "One scale",
            onSelect() {
                setMinMaxOneScale();
            },
        },
        {
            label: "Centered",
            onSelect() {
                setMinMaxCentered();
            },
        },
    ],
    [
        {
            label: "Zoom In",
            onSelect(e) {
                e.preventDefault();
                setMinMaxZoom(1 / zoom);
            },
        },
        {
            label: "Zoom Out",
            onSelect(e) {
                e.preventDefault();
                setMinMaxZoom(zoom);
            },
        },
    ],
    [
        {
            label: "Default",
            onSelect() {
                setMinMaxToDefault();
            },
        },
    ],
    [
        {
            label: friendlyName(currentState.value.field?.name ?? ""),
            children: [
                [
                    {
                        label: "Full range",
                        onSelect() {
                            setSelectedFieldMinMaxToFullRangeDuringAllTime();
                        },
                    },
                    {
                        label: "Centered",
                        onSelect() {
                            setMinMaxSelectedCentered();
                        },
                    },
                ],
                [
                    {
                        label: "Zoom In",
                        onSelect(e) {
                            e.preventDefault();
                            setMinMaxSelectedZoom(1 / zoom);
                        },
                    },
                    {
                        label: "Zoom Out",
                        onSelect(e) {
                            e.preventDefault();
                            setMinMaxSelectedZoom(zoom);
                        },
                    },
                ],
                [
                    {
                        label: "Default",
                        onSelect() {
                            setMinMaxSelectedDefault();
                        },
                    },
                ],
            ],
        },
    ],
]);

function getFieldsCheckboxedSubmenu() {
    const fields = currentState.value.graph?.fields;
    if (fields && currentState.value.isFieldChecked) {
        return currentState.value.graph.fields.map((field, index) => ({
            type: "checkbox",
            label: friendlyName(field.name),
            checked: currentState.value.isFieldChecked[index],
            onUpdateChecked(state) {
                currentState.value.isFieldChecked[index] = state;
            },
            onSelect(e) {
                e.preventDefault();
            },
        }));
    } else {
        return [];
    }
}

const extendedMenuItems = computed(() => [
    [
        {
            label: "Like this one",
            children: [
                [
                    {
                        type: "label",
                        label: "SET MIN-MAX VALUES",
                    },
                    {
                        type: "label",
                        label: "TO SELECTED CURVES",
                    },
                ],
                getFieldsCheckboxedSubmenu(),
                [
                    {
                        label: "SET",
                        onSelect(e) {
                            setMinMaxLikeThis(true);
                            e.preventDefault();
                        },
                    },
                ],
            ],
        },
        {
            label: "Set full range",
            children: [
                [
                    {
                        type: "label",
                        label: "SELECT CURVES",
                    },
                ],
                getFieldsCheckboxedSubmenu(),
                [
                    {
                        type: "label",
                        label: "SET FULL RANGE:",
                    },
                ],
                [
                    {
                        label: "At the all time",
                        onSelect(e) {
                            setFieldsMinMaxToFullRangeDuringAllTime(true);
                            e.preventDefault();
                        },
                    },
                    {
                        label: "At the window time",
                        onSelect(e) {
                            setFieldsMinMaxToFullRangeDuringWindowTime(true);
                            e.preventDefault();
                        },
                    },
                    {
                        label: "At the markers time",
                        onSelect(e) {
                            setFieldsMinMaxToFullRangeDuringMarkedTime(true);
                            e.preventDefault();
                        },
                    },
                ],
            ],
        },
        {
            label: "One scale",
            children: [
                [
                    {
                        type: "label",
                        label: "SELECT CURVES",
                    },
                ],
                getFieldsCheckboxedSubmenu(),
                [
                    {
                        label: "SET CURVES TO SAME SCALE",
                        onSelect(e) {
                            setMinMaxOneScale(true);
                            e.preventDefault();
                        },
                    },
                ],
            ],
        },
        {
            label: "Centered",
            children: [
                [
                    {
                        type: "label",
                        label: "SELECT CURVES",
                    },
                ],
                getFieldsCheckboxedSubmenu(),
                [
                    {
                        label: "SET CURVES TO ZERO OFFSET",
                        onSelect(e) {
                            setMinMaxCentered(true);
                            e.preventDefault();
                        },
                    },
                ],
            ],
        },
    ],
    [
        {
            label: "Zoom",
            children: [
                [
                    {
                        type: "label",
                        label: "SELECT CURVES",
                    },
                ],
                getFieldsCheckboxedSubmenu(),
                [
                    {
                        label: "ZOOM IN",
                        onSelect(e) {
                            setMinMaxZoom(1 / zoom, true);
                            e.preventDefault();
                        },
                    },
                    {
                        label: "ZOOM OUT",
                        onSelect(e) {
                            setMinMaxZoom(zoom, true);
                            e.preventDefault();
                        },
                    },
                ],
            ],
        },
    ],
    [
        {
            label: "Default",
            children: [
                [
                    {
                        type: "label",
                        label: "SELECT CURVES",
                    },
                ],
                getFieldsCheckboxedSubmenu(),
                [
                    {
                        label: "SET CURVES TO DEFAULT",
                        onSelect(e) {
                            setMinMaxToDefault(true);
                            e.preventDefault();
                        },
                    },
                ],
            ],
        },
    ],
    [
        {
            label: friendlyName(currentState.value.field?.name ?? ""),
            children: [
                [
                    {
                        label: "Full range",
                        children: [
                            [
                                {
                                    label: "At the all time",
                                    onSelect(e) {
                                        setSelectedFieldMinMaxToFullRangeDuringAllTime();
                                        e.preventDefault();
                                    },
                                },
                                {
                                    label: "At the window time",
                                    onSelect(e) {
                                        setSelectedFieldMinMaxToFullRangeDuringWindowTime();
                                        e.preventDefault();
                                    },
                                },
                                {
                                    label: "At the markers time",
                                    onSelect(e) {
                                        setSelectedFieldMinMaxToFullRangeDuringMarkedTime();
                                        e.preventDefault();
                                    },
                                },
                            ],
                        ],
                    },
                    {
                        label: "Centered",
                        onSelect() {
                            setMinMaxSelectedCentered();
                        },
                    },
                ],
                [
                    {
                        label: "Zoom In",
                        onSelect(e) {
                            e.preventDefault();
                            setMinMaxSelectedZoom(1 / zoom);
                        },
                    },
                    {
                        label: "Zoom Out",
                        onSelect(e) {
                            e.preventDefault();
                            setMinMaxSelectedZoom(zoom);
                        },
                    },
                ],
                [
                    {
                        label: "Default",
                        onSelect() {
                            setMinMaxSelectedDefault();
                        },
                    },
                ],
            ],
        },
    ],
]);

const menuItems = computed(() => {
    if (currentState.value.shiftKey) {
        return extendedMenuItems.value;
    } else {
        return simpleMenuItems.value;
    }
});

function onContextMenu(event, graph, field) {
    currentState.value.graph = graph;
    currentState.value.field = field;
    currentState.value.shiftKey = event.shiftKey;
    if (currentState.value.graph?.fields) {
        currentState.value.isFieldChecked = currentState.value.graph.fields.map(() => true);
    }
}
</script>
