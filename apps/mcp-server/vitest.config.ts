import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    // Graceful-shutdown test needs the full 10 s drain plus headroom; other
    // integration tests spawn child processes and exercise live HTTP. 30 s
    // is the worst-case ceiling, not the typical case.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    include: ["tests/**/*.test.ts"],
  },
});
