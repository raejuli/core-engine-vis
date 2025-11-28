import { defineConfig } from "vite";
import path from "path";

export default defineConfig({
  build: {
    lib: {
      entry: path.resolve(__dirname, "src/index.ts"),
      name: "CoreEngineVis",
      formats: ["es", "cjs"],
      fileName: (format) => (format === "es" ? "core-engine-vis.js" : "core-engine-vis.cjs"),
    },
    rollupOptions: {
      external: [/^node:/],
    },
    sourcemap: true,
    target: "es2020",
    minify: false,
    outDir: "dist",
    emptyOutDir: true,
  },
});
