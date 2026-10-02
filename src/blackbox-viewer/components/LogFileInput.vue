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
    appStore.indexProgressBytes = 0;
    let handedOff = false;
    let partialLoadInfo = null;
    try {
        const descriptor = await FileSystem.pickOpenFile("Blackbox log/config/workspace file", LOG_FILE_EXTENSIONS);
        if (!descriptor) {
            // Cancelled.
            return;
        }
        // allowPartial: an oversized file (would OOM the WebView) is read
        // only up to the front portion this device can load, instead of
        // being refused — the log then loads partially.
        const blob = await FileSystem.readFileAsBlob(
            descriptor,
            (loaded, total) => {
                // Total size for the overlay's "50% (25.3 MB)" line — available
                // from the first chunk when the provider reports a size. For a
                // truncated read the total is the front portion being loaded.
                if (total > 0) {
                    appStore.indexProgressBytes = total;
                }
                appStore.indexProgress = total > 0 ? Math.round((loaded / total) * 10) : 0;
            },
            {
                allowPartial: true,
                onTruncated: (readBytes, totalBytes) => {
                    // The file was cut short: remember it and let main.js show
                    // the partial-load notice/dialog once the log starts
                    // loading (the overlay size follows the loaded portion).
                    partialLoadInfo = { readBytes, totalBytes };
                },
            },
        );
        // File carries .name/.size for the FileReader path in main.js. The
        // _partialLoad tag tells main.js the blob is the front portion of a
        // larger file (partial load), so it can inform the user.
        const file = new File([blob], descriptor.name, { type: blob.type });
        if (partialLoadInfo) {
            file._partialLoad = partialLoadInfo;
        }
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
            // memory (partial loading was requested but the device's budget
            // is too small for a meaningful partial log) — show why instead
            // of letting the WebView be OOM-killed: a persistent status
            // notice plus a blocking dialog that can only be dismissed via
            // its OK button.
            appStore.loadNotice = error.message;
            appStore.loadNoticeDialog = {
                title: "File Too Large",
                message: `${error.message}\n\nThe file was not loaded. Try a smaller log file.`,
            };
            return;
        }
        console.error("Failed to open blackbox file:", error);
    } finally {
        if (!handedOff) {
            // Clear the overlay on cancel/failure paths only.
            appStore.indexProgress = null;
            appStore.indexProgressBytes = 0;
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
