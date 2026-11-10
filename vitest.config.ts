import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/test/**/*.test.ts", "api/test/**/*.test.ts", "checker/test/**/*.test.ts", "web/src/**/*.test.tsx"],
    environmentMatchGlobs: undefined,
    testTimeout: 20_000,
  },
});
