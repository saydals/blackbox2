/* Rotorflight Blackbox Viewer service worker.
 *
 * Minimal offline/app-shell cache that satisfies the PWA installability
 * requirement (a registered service worker with a fetch handler) without
 * pulling in a Workbox/Vite-plugin dependency.
 *
 * Strategy:
 * - Pre-cache the app shell (index.html + manifest) on install.
 * - Navigation requests: network-first, falling back to the cached shell
 *   so the app still opens offline.
 * - Same-origin GET requests (hashed Vite assets, sample logs, images):
 *   cache-first, populating the runtime cache as the app loads.
 * - Everything else (cross-origin, non-GET): pass through to the network.
 *
 * Bump CACHE_VERSION when the caching strategy itself changes. App content
 * updates flow through automatically: navigations are network-first and all
 * Vite asset filenames are content-hashed, so a new deploy has new URLs.
 */

const CACHE_VERSION = "rf-blackbox-v2";
const APP_SHELL = ["./", "./index.html", "./manifest.webmanifest"];

self.addEventListener("install", (event) => {
    event.waitUntil(
        caches
            .open(CACHE_VERSION)
            .then((cache) => cache.addAll(APP_SHELL))
            .then(() => self.skipWaiting()),
    );
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches
            .keys()
            .then((keys) =>
                Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))),
            )
            .then(() => self.clients.claim()),
    );
});

self.addEventListener("fetch", (event) => {
    const { request } = event;
    if (request.method !== "GET") {
        return;
    }
    const url = new URL(request.url);
    if (url.origin !== self.location.origin) {
        return;
    }

    if (request.mode === "navigate") {
        event.respondWith(
            fetch(request)
                .then((response) => {
                    const copy = response.clone();
                    caches.open(CACHE_VERSION).then((cache) => cache.put("./index.html", copy));
                    return response;
                })
                .catch(() => caches.match("./index.html")),
        );
        return;
    }

    event.respondWith(
        caches.match(request).then((cached) => {
            if (cached) {
                return cached;
            }
            return fetch(request).then((response) => {
                if (response.ok) {
                    const copy = response.clone();
                    caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
                }
                return response;
            });
        }),
    );
});
