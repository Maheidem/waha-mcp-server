import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/__tests__/integration/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 15_000,
    sequence: {
      concurrent: false,
    },
    exclude: ["node_modules", "dist"],
  },
});
