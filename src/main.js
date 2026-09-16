import { createApp } from "vue";
import ui from "@nuxt/ui/vue-plugin";
import App from "./blackbox-viewer/App.vue";
import "./blackbox-viewer/vendor.js";
import { getNuxtUiRouter } from "./js/nuxt_ui_router.js";
import { pinia } from "./js/pinia_instance.js";
import { registerServiceWorker } from "./js/pwa.js";
import "./blackbox-viewer/css/main.css";

const app = createApp(App);
app.use(pinia);
app.use(getNuxtUiRouter());
app.use(ui);
app.mount("#app");

// PWA installability + offline shell. Safe no-op on Capacitor/Tauri/insecure contexts.
registerServiceWorker();