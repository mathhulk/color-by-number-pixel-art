import { fileURLToPath, URL } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Set BASE_PATH (e.g. "/color-palette-a-day/") when deploying to a sub-path such as GitHub Pages.
const base = process.env.BASE_PATH ?? "/";

export default defineConfig({
  base,
  plugins: [react()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  worker: { format: "es" },
  build: {
    target: "es2022",
    sourcemap: true,
    rolldownOptions: {
      output: {
        // Long-lived vendor chunks cache across app deploys.
        codeSplitting: {
          groups: [
            { name: "react", test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
            {
              name: "ui",
              test: /node_modules[\\/](@base-ui|@floating-ui|tabbable|use-sync-external-store)/,
            },
          ],
        },
      },
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
