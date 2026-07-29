import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

// Separate from vite.config.ts on purpose: tests don't need the TanStack
// Router plugin (which regenerates routeTree.gen.ts) or Tailwind — only the
// `@` alias. Globals are off; import `describe`/`it`/`expect` from "vitest".
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    globals: false,
    setupFiles: ["./src/setup-tests.ts"],
  },
});
