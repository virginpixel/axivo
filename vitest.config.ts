import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globals: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      // The Next.js "server-only" marker isn't resolvable in plain node.
      "server-only": path.resolve(__dirname, "tests/stubs/server-only.ts"),
    },
  },
});
