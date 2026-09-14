import { pinia } from "@/js/pinia_instance.js";
import { useAppStore } from "./stores/app.js";
import { DarkTheme } from "./dark_theme.js";
import "./css/main.css";

/**
 * Standalone theme helper: the viewer owns its dark mode (AUTO follows the OS),
 * there is no host configurator to mirror.
 */
export function setBlackboxViewerDark(enabled) {
    DarkTheme.currentMode = enabled ? DarkTheme.modes.ON : DarkTheme.modes.OFF;
    useAppStore(pinia).darkThemeEnabled = enabled;
}

/**
 * Standalone is always the visible app; kept for API parity with the embedded tab.
 */
export function setViewerActive(active) {
    useAppStore(pinia).viewerActive = active;
}
