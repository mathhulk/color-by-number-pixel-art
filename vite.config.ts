import { fileURLToPath, URL } from "node:url";

import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { defineConfig } from "vitest/config";

// Set BASE_PATH (e.g. "/color-by-number-pixel-art/") when deploying to a sub-path such as GitHub Pages.
const base = process.env.BASE_PATH ?? "/";

export default defineConfig({
  base,
  plugins: [
    react(),
    // Offline support: precache the whole app shell (JS, CSS, fonts, icons) with Workbox.
    // Designs live in IndexedDB, so everything works without a network once loaded.
    VitePWA({
      registerType: "prompt",
      injectRegister: false,
      includeAssets: ["favicon.svg", "apple-touch-icon.png"],
      manifest: {
        name: "Pixel by Number",
        short_name: "Pixels",
        description: "Relaxing color-by-number pixel art in 2D and 3D.",
        display: "standalone",
        orientation: "any",
        background_color: "#f4f3f0",
        theme_color: "#f4f3f0",
        icons: [
          { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512x512.png", sizes: "512x512", type: "image/png" },
          {
            src: "pwa-maskable-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
          { src: "favicon.svg", sizes: "any", type: "image/svg+xml" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        // The app uses hash routing, so every navigation is index.html.
        navigateFallback: "index.html",
        cleanupOutdatedCaches: true,
      },
    }),
  ],
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
