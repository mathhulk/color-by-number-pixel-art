import { registerSW } from "virtual:pwa-register";

import { toastManager } from "./ui/Toast";

/**
 * Registers the service worker that makes the app work offline. New versions
 * wait until the player chooses to reload, so a coloring session is never
 * interrupted mid-stroke.
 */
export function registerServiceWorker(): void {
  if (!("serviceWorker" in navigator)) return;
  const update = registerSW({
    onOfflineReady() {
      toastManager.add({
        title: "Ready to work offline",
        description: "Pixel by Number now works without a connection.",
      });
    },
    onNeedRefresh() {
      toastManager.add({
        title: "Update available",
        description: "Reload to get the newest version.",
        timeout: 0,
        actionProps: { children: "Reload", onClick: () => void update(true) },
      });
    },
  });
}
