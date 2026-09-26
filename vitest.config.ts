import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Convex modules run in a V8 isolate; give the suite room without hanging CI.
    testTimeout: 20_000,
    server: {
      deps: {
        /**
         * `convex-test` discovers the app's Convex modules with Vite's
         * `import.meta.glob`. Externalised dependencies are loaded by Node
         * directly, where that function does not exist, so it must be inlined
         * and transformed by Vite.
         */
        inline: ["convex-test"],
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
    },
  },
});
