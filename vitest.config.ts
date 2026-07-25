import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      // Domain logic is the only thing worth a coverage number. Routes and
      // components are covered by the two Playwright specs in slice 05.
      include: ["src/domain/**/*.ts", "src/extract/**/*.ts"],
      exclude: ["**/*.test.ts"],
      reporter: ["text", "lcov"],
    },
  },
});
