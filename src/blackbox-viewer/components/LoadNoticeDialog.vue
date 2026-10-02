<template>
    <!-- Blocking load-notice dialog (e.g. "out of memory — partial load").
         Deliberately NOT a UModal: this dialog must close ONLY through the
         OK button — no backdrop click, no Escape — so the user always
         acknowledges the memory warning before continuing. -->
    <div v-if="notice" class="load-notice-overlay" role="alertdialog" aria-modal="true" :aria-label="notice.title">
        <div class="load-notice-box">
            <div class="load-notice-header">
                <UIcon name="i-lucide-triangle-alert" class="size-5 load-notice-icon" />
                <span class="load-notice-title">{{ notice.title }}</span>
            </div>
            <p class="load-notice-message">{{ notice.message }}</p>
            <div class="load-notice-actions">
                <UButton ref="okButton" label="OK" color="primary" size="sm" autofocus @click="dismiss" />
            </div>
        </div>
    </div>
</template>

<script setup>
import { computed, watch, nextTick, ref } from "vue";
import { useAppStore } from "../stores/app.js";

const appStore = useAppStore();

// { title, message } while open; null while closed. Set from the load
// pipeline (main.js prebuildLogIndex / LogFileInput.vue LogTooLargeError).
const notice = computed(() => appStore.loadNoticeDialog);

const okButton = ref(null);

function dismiss() {
    appStore.loadNoticeDialog = null;
}

// Focus the OK button while the dialog is open so keyboard users land on it
// directly; Enter/Space then confirm — but Escape and backdrop clicks do
// nothing, the only way out is OK.
watch(notice, async (value) => {
    if (value) {
        await nextTick();
        // UButton forwards the template ref onto the component instance;
        // $el is its root <button> element.
        const el = okButton.value?.$el ?? okButton.value;
        el?.focus?.();
    }
});
</script>

<style scoped>
/* Above the log-load overlay (z-index 60) so a memory warning raised while
 * the progress overlay is still visible stays on top. */
.load-notice-overlay {
    position: fixed;
    inset: 0;
    z-index: 70;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.55);
}

.load-notice-box {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    width: min(26rem, 86vw);
    padding: 1.25rem 1.25rem 1rem;
    border-radius: 0.5rem;
    /* --text flips with the UI theme (black in light, near-white in dark);
       --graph-text-secondary is always white (dark graph canvas) and would
       be invisible on the light-theme --surface-100 box. */
    background: var(--surface-100, #1b2027);
    color: var(--text, #cfd8e3);
    box-shadow: 0 8px 30px rgba(0, 0, 0, 0.4);
}

.load-notice-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.9rem;
    font-weight: 600;
}

.load-notice-icon {
    color: var(--error-500, #ef4444);
    flex-shrink: 0;
}

.load-notice-message {
    margin: 0;
    font-size: 0.78rem;
    line-height: 1.5;
    white-space: pre-line;
    overflow-wrap: anywhere;
}

.load-notice-actions {
    display: flex;
    justify-content: center;
    padding-top: 0.25rem;
}
</style>
