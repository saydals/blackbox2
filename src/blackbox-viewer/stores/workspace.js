import { defineStore } from "pinia";
import { ref, shallowRef } from "vue";
import { USER_SLOT_COUNT } from "../workspaces.js";

export const useWorkspaceStore = defineStore("workspace", () => {
    const workspaceGraphConfigs = ref([]);
    const activeWorkspace = ref(1);
    const bookmarkTimes = ref([]);

    function setActiveWorkspace(id) {
        activeWorkspace.value = id;
    }

    function setWorkspaceGraphConfigs(configs) {
        workspaceGraphConfigs.value = configs;
    }

    const showDefaultMenu = ref(false);

    // Callbacks registered by main.js
    const switchWorkspace = shallowRef(null);
    const saveWorkspace = shallowRef(null);
    const renameWorkspace = shallowRef(null);
    const applyDefaultWorkspace = shallowRef(null);
    const gotoBookmark = shallowRef(null);

    /** Get title for a workspace slot (0-9 user slot, 10+ read-only preset) */
    function getTitle(id) {
        const entry = workspaceGraphConfigs.value[id];
        return entry ? entry.title : null;
    }

    /** Check if a workspace slot has data */
    function hasWorkspace(id) {
        return workspaceGraphConfigs.value[id] != null;
    }

    /** Check if a slot id is a read-only preset (원본과 동일: 저장·이름바꾸기 불가) */
    function isPreset(id) {
        return Number.isInteger(id) && id >= USER_SLOT_COUNT && id < workspaceGraphConfigs.value.length;
    }

    return {
        workspaceGraphConfigs,
        activeWorkspace,
        bookmarkTimes,
        setActiveWorkspace,
        setWorkspaceGraphConfigs,
        showDefaultMenu,
        switchWorkspace,
        saveWorkspace,
        renameWorkspace,
        applyDefaultWorkspace,
        gotoBookmark,
        getTitle,
        hasWorkspace,
        isPreset,
    };
});
