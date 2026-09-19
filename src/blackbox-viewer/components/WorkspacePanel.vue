<template>
    <div class="toolbar-panel log-workspace-panel">
        <h4>Workspace</h4>

        <UDropdownMenu v-model:open="menuOpen" :items="workspaceItems">
            <UButton
                variant="outline"
                color="neutral"
                size="sm"
                class="justify-between font-mono"
                trailing-icon="i-lucide-chevron-down"
            >
                <span v-if="activeEntry" class="flex items-center gap-1 truncate">
                    <span v-if="!activeEntry.preset" class="opacity-50">{{ workspaceStore.activeWorkspace }}</span>
                    <span class="truncate">{{ activeEntry.title }}</span>
                </span>
                <span v-else class="opacity-50">No workspace</span>
            </UButton>

            <template #ws-trailing="{ item }">
                <UIcon v-if="item.wsActive" name="i-lucide-check" class="size-4 text-green-500" />
                <UButton
                    v-if="!item.disabled && !item.wsPreset"
                    variant="ghost"
                    color="neutral"
                    size="sm"
                    icon="i-lucide-pencil"
                    aria-label="Rename this workspace"
                    title="Rename this workspace"
                    class="opacity-40 hover:opacity-100"
                    @click.stop.prevent="openRename(item.wsId, item.wsTitle)"
                />
                <UButton
                    v-if="!item.wsPreset"
                    variant="ghost"
                    color="neutral"
                    size="sm"
                    icon="i-lucide-save"
                    aria-label="Save current graph setup to this workspace"
                    title="Save current graph setup to this workspace"
                    class="opacity-40 hover:opacity-100"
                    @click.stop.prevent="emit('save-workspace', item.wsId, item.wsTitle)"
                />
            </template>
            <template #preset-trailing="{ item }">
                <UIcon v-if="item.wsActive" name="i-lucide-check" class="size-4 text-green-500" />
            </template>
        </UDropdownMenu>

        <UModal v-model:open="renameOpen" :ui="{ content: 'sm:max-w-sm' }">
            <template #header>
                <h4 class="font-semibold">Rename workspace {{ renameId }}</h4>
            </template>

            <template #body>
                <UInput
                    v-model="renameTitle"
                    autofocus
                    placeholder="Workspace name"
                    class="w-full"
                    @keyup.enter="commitRename"
                />
            </template>

            <template #footer>
                <div class="flex justify-end gap-2 w-full">
                    <UButton variant="outline" color="neutral" label="Cancel" @click="renameOpen = false" />
                    <UButton color="primary" label="Rename" :disabled="!renameTitle.trim()" @click="commitRename" />
                </div>
            </template>
        </UModal>
    </div>
</template>

<script setup>
import { computed, ref, watch } from "vue";
import { useWorkspaceStore } from "../stores/workspace.js";
import { USER_SLOT_COUNT, PRESET_BASE, PRESET_COUNT, isPresetId } from "../workspaces.js";

const emit = defineEmits(["switch-workspace", "save-workspace", "rename-workspace"]);

const workspaceStore = useWorkspaceStore();

const menuOpen = ref(false);

// Shift+W opens the workspace menu (keyboard_handler.js raises the flag,
// WorkspacePanel lowers it so a later press re-opens).
watch(
    () => workspaceStore.showDefaultMenu,
    (show) => {
        if (show) {
            menuOpen.value = true;
            workspaceStore.showDefaultMenu = false;
        }
    },
);

const renameOpen = ref(false);
const renameId = ref(null);
const renameTitle = ref("");

function openRename(id, title) {
    renameId.value = id;
    // Offer an empty field rather than making the user clear the "Unnamed" placeholder.
    renameTitle.value = title === "Unnamed" ? "" : title;
    renameOpen.value = true;
}

function commitRename() {
    const title = renameTitle.value.trim();
    if (!title) {
        return;
    }
    emit("rename-workspace", renameId.value, title);
    renameOpen.value = false;
}

const activeEntry = computed(() => {
    const configs = workspaceStore.workspaceGraphConfigs;
    const entry = configs?.[workspaceStore.activeWorkspace] ?? null;
    if (!entry) {
        return null;
    }
    return isPresetId(workspaceStore.activeWorkspace) ? { ...entry, preset: true } : entry;
});

const workspaceItems = computed(() => {
    const configs = workspaceStore.workspaceGraphConfigs;
    // 상단: 편집·저장 가능한 빈 슬롯 0~9 (숫자 라벨 있음)
    const wsItems = [];

    for (let id = 0; id < USER_SLOT_COUNT; id++) {
        const entry = configs?.[id];
        const isActive = id === workspaceStore.activeWorkspace;

        wsItems.push({
            slot: "ws",
            label: entry ? `${id}  ${entry.title}` : `${id}  <empty>`,
            disabled: !entry,
            wsId: id,
            wsActive: isActive,
            wsPreset: false,
            wsTitle: entry?.title || "Unnamed",
            onSelect() {
                if (entry) {
                    emit("switch-workspace", id);
                }
            },
        });
    }

    // 하단: 이름 있는 프리셋 6개 — 숫자 라벨 없이 이름만, 편집·저장 불가 (원본과 동일)
    const presetItems = [];
    for (let i = 0; i < PRESET_COUNT; i++) {
        const id = PRESET_BASE + i;
        const entry = configs?.[id];
        if (!entry) {
            continue;
        }
        const isActive = id === workspaceStore.activeWorkspace;
        presetItems.push({
            slot: "preset",
            label: entry.title,
            wsId: id,
            wsActive: isActive,
            wsPreset: true,
            wsTitle: entry.title,
            onSelect() {
                emit("switch-workspace", id);
            },
        });
    }

    return [wsItems, presetItems];
});
</script>
