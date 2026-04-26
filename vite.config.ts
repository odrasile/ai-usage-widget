import { readFileSync } from "node:fs";
import { defineConfig } from "vite";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as {
  author?: string;
  version?: string;
};
const buildStamp = new Date().toISOString().replace("T", " ").replace(/\.\d+Z$/, "Z");
const isLinux = process.platform === "linux";

export default defineConfig({
  clearScreen: false,
  define: {
    __APP_AUTHOR__: JSON.stringify(pkg.author ?? ""),
    __APP_VERSION__: JSON.stringify(pkg.version ?? "0.0.0"),
    __APP_BUILD__: JSON.stringify(buildStamp)
  },
  server: {
    host: "127.0.0.1",
    port: 1420,
    strictPort: true,
    watch: {
      usePolling: isLinux,
      interval: isLinux ? 350 : undefined,
      ignored: [
        "**/src-tauri/target/**",
        "**/dist/**",
        "**/.git/**",
        "**/*.log",
        "**/.DS_Store"
      ]
    }
  },
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    target: "es2020",
    minify: false,
    sourcemap: true
  }
});
