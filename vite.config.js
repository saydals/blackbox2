/// <reference types="vitest" />
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pkg from "./package.json" with { type: "json" };
import ui from "@nuxt/ui/vite";
import nuxtUiViteOptions from "./nuxt-ui.vite.js";
import * as child from "node:child_process";

let commitHash = "standalone";
try {
    commitHash = child.execSync("git rev-parse --short HEAD").toString().trim();
} catch {
    // Not a git checkout (e.g. exported source archive); keep the fallback.
}
const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    base: "/blackbox2/",
    define: {
        __APP_VERSION__: JSON.stringify(pkg.version),
        __APP_PRODUCTNAME__: JSON.stringify(pkg.productName),
        __APP_REVISION__: JSON.stringify(commitHash),
    },
    build: {
        outDir: "dist",
    },
    plugins: [
        vue(),
        ui(nuxtUiViteOptions),
    ],
    root: __dirname,
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "src"),
            "/src": path.resolve(__dirname, "src"),
            vue: path.resolve(__dirname, "node_modules/vue/dist/vue.esm-bundler.js"),
        },
    },
    server: {
        port: 8080,
        strictPort: true,
        host: "0.0.0.0",
        allowedHosts: true,
        fs: {
            allow: [__dirname],
        },
        hmr: {
            path: "/__vite_hmr",
        },
    },
    preview: { port: 8080, strictPort: true },
});