import { Capacitor } from "@capacitor/core";

/**
 * Register the PWA service worker (`public/sw.js`).
 *
 * No-op when there is no service-worker support (Capacitor native shells,
 * Tauri webviews, insecure contexts, tests). Registration is deferred to
 * the window `load` event so it never competes with first paint, and a new
 * worker version immediately takes control via `skipWaiting` + `clients.claim`
 * in the worker itself. When an update is found, a `pwa:update-available`
 * event is dispatched on `window` so future UI can offer a reload prompt.
 */
export function registerServiceWorker() {
    if (Capacitor.isNativePlatform()) {
        return;
    }
    if (!("serviceWorker" in navigator)) {
        return;
    }
    // Service workers require a secure context (HTTPS or localhost). Outside
    // one, registration would only reject — skip it quietly.
    if (typeof globalThis.isSecureContext === "boolean" && !globalThis.isSecureContext) {
        return;
    }

    const swUrl = `${import.meta.env.BASE_URL}sw.js`;

    const register = () => {
        navigator.serviceWorker.register(swUrl).then(
            (registration) => {
                registration.addEventListener("updatefound", () => {
                    window.dispatchEvent(new CustomEvent("pwa:update-available"));
                });
            },
            (error) => {
                console.warn("blackbox-viewer: service worker registration failed", error);
            },
        );
    };

    if (document.readyState === "complete") {
        register();
    } else {
        window.addEventListener("load", register, { once: true });
    }
}
