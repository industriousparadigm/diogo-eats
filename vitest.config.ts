import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    include: ["lib/**/*.test.ts", "lib/**/__tests__/*.test.ts"],
    // Tests are pure-function focused. No DOM, no React, no slow setup.
    // If we add component tests later, switch this to "jsdom" and add
    // @testing-library/react.
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
