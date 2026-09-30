import { defineConfig } from "vitest/config";
import vue from "@vitejs/plugin-vue";
import path from "node:path";

// Scoped to component/DOM tests only (test/component/**) -- the existing
// test/*.test.mjs files are plain node:test scripts run directly via
// `node test/foo.test.mjs`, not through this runner, so this config
// deliberately doesn't touch that convention.
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      "~": path.resolve(__dirname, "."),
      "@": path.resolve(__dirname, "."),
      // Nuxt's virtual module; specs that need it vi.mock("#app").
      "#app": path.resolve(__dirname, "test/component/fixtures/nuxtApp.ts"),
    },
  },
  test: {
    environment: "happy-dom",
    include: ["test/component/**/*.spec.ts"],
  },
});
