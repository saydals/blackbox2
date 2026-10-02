<template>
    <span class="inline-flex cursor-pointer toolbar-menu-item" @click="openFilePicker">
        <UButton :size="size" color="primary" :label="label" icon="i-lucide-folder-open" />
    </span>
    <input
        ref="fileInput"
        type="file"
        style="display: none"
        :accept="acceptAttribute"
        :aria-label="label"
        @change="onFileChange"
    />
</template>

<script setup>
import { ref } from "vue";
import { isAndroid } from "../../js/utils/checkCompatibility.js";
import FileSystem from "../../js/FileSystem.js";
import { useAppStore } from "../stores/app.js";

const appStore = useAppStore();

// Accepted extensions (lower-case); source for both the <input> accept attribute
// and the Android SAF picker.
const LOG_FILE_EXTENSIONS = [".bbl", ".bfl", ".cfl", ".log", ".txt", ".json"];

// accept matches extensions case-sensitively; list both cases.
const acceptAttribute = LOG_FILE_EXTENSIONS.flatMap((ext) => [ext, ext.toUpperCase()]).join(",");

defineProps({
    size: {
        type: String,
        default: "sm",
    },
    label: {
        type: String,
        default: "Open",
    },
});

const emit = defineEmits(["files-selected"]);
const fileInput = ref(null);

// Android WebView maps <input accept> extensions via MimeTypeMap, which lacks
// .bbl/.bfl/.cfl/.log and greys them out (#5293). Route Android through the
// Capacitor SAF plugin and return a File; other platforms use the <input>.
async function openFilePicker() {
    if (!isAndroid()) {
        fileInput.value?.click();
        return;
    }

    // Android reads the file in chunks here (first 10% of the loading bar);
    // main.js fills the rest while building the log index.
    appStore.indexProgressLabel = "Reading…";
    appStore.indexProgress = 0;
    let handedOff = false;
    try {
        const descriptor = await FileSystem.pickOpenFile("Blackbox log/config/workspace file", LOG_FILE_EXTENSIONS);
        if (!descriptor) {
            // Cancelled.
            return;
        }
        const blob = await FileSystem.readFileAsBlob(descriptor, (loaded, total) => {
            appStore.indexProgress = total > 0 ? Math.round((loaded / total) * 10) : 0;
        });
        // File carries .name/.size for the FileReader path in main.js.
        const file = new File([blob], descriptor.name, { type: blob.type });
        // Synchronous handoff: loadFiles → loadLogFile → readAsArrayBuffer
        // adopts the overlay (read continues, then the parse phase). Clearing
        // it here would race away the progress the load flow just set.
        handedOff = true;
        emit("files-selected", [file]);
    } catch (error) {
        if (error?.name === "AbortError") {
            return;
        }
        if (error?.name === "LogTooLargeError") {
            // Refused up front because the file cannot fit this device's
            // memory — show why instead of letting the WebView be OOM-killed.
            appStore.loadNotice = error.message;
            return;
        }
        console.error("Failed to open blackbox file:", error);
    } finally {
        if (!handedOff) {
            // Clear the overlay on cancel/failure paths only.
            appStore.indexProgress = null;
        }
    }
}

function onFileChange(event) {
    const files = event.target.files;
    if (files.length > 0) {
        emit("files-selected", files);
    }
    // Reset so the same file re-triggers change.
    event.target.value = "";
}
</script>
