import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@skipstery/inline-measure": path.resolve(import.meta.dirname, "../inline-measure/src/index.ts"),
    },
  },
  test: {
    environment: "happy-dom",
    setupFiles: ["./src/test-setup.ts"],
  },
});
