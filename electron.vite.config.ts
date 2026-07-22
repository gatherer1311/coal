import { defineConfig } from "electron-vite";
import { resolve } from "node:path";

const root = import.meta.dirname;

export default defineConfig({
  main: {
    build: {
      rollupOptions: { input: resolve(root, "src/main/index.ts") },
    },
  },
  preload: {
    build: {
      rollupOptions: {
        input: resolve(root, "src/preload/index.ts"),
        // A CJS preload keeps sandbox:true working; pin the emitted name so the
        // main process can reference it deterministically (design §3).
        output: { format: "cjs", entryFileNames: "index.cjs" },
      },
    },
  },
  renderer: {
    root: resolve(root, "src/renderer"),
    build: {
      rollupOptions: { input: resolve(root, "src/renderer/index.html") },
    },
    resolve: {
      // Mandatory: electron-vite's pre-bundler can otherwise load two copies of
      // @codemirror/state and crash the editor (design §4).
      dedupe: ["@codemirror/state", "@codemirror/view", "@lezer/common", "style-mod"],
    },
    optimizeDeps: {
      include: ["@codemirror/state", "@codemirror/view", "@codemirror/commands"],
    },
  },
});
