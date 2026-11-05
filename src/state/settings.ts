import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import type { AccentName, VisionFilter, VisionMode } from "@/lib/cvd";

export type ThemePreference = "system" | "light" | "dark";
export type MotionPreference = "system" | "full" | "reduced";

export interface Settings {
  theme: ThemePreference;
  accent: AccentName;
  showNumbers: boolean;
  showGrid: boolean;
  /** 0–0.6 */
  tint: number;
  highlightSelected: boolean;
  visionMode: VisionMode;
  visionFilter: VisionFilter;
  showColorNames: boolean;
  autoAdvance: boolean;
  smartSelect: boolean;
  /** Challenge: no drag-painting or bucket fill; every square is tapped on its own. */
  tapOnly: boolean;
  /** Challenge: wrong colors stick until painted over. */
  allowMistakes: boolean;
  /** Mark wrong squares with stripes and an outline. */
  showMistakes: boolean;
  haptics: boolean;
  /** Fill plucks, chimes and other effects. */
  soundEffects: boolean;
  /** Generative ambient music. */
  music: boolean;
  /** 0–1 */
  volume: number;
  /** Quick mute from the play screen; keeps the other sound settings. */
  muted: boolean;
  motion: MotionPreference;
  celebrate: boolean;
}

export const defaultSettings: Settings = {
  theme: "system",
  accent: "auto",
  showNumbers: true,
  showGrid: true,
  tint: 0.12,
  highlightSelected: true,
  visionMode: "normal",
  visionFilter: "off",
  showColorNames: false,
  autoAdvance: true,
  smartSelect: true,
  tapOnly: false,
  allowMistakes: false,
  showMistakes: true,
  haptics: true,
  soundEffects: true,
  music: false,
  volume: 0.7,
  muted: false,
  motion: "system",
  celebrate: true,
};

interface SettingsStore extends Settings {
  set: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  reset: () => void;
}

export const useSettings = create<SettingsStore>()(
  persist(
    (set) => ({
      ...defaultSettings,
      set: (key, value) => set({ [key]: value } as Partial<Settings>),
      reset: () => set(defaultSettings),
    }),
    {
      name: "pixel-by-number:settings",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: ({ set: _set, reset: _reset, ...settings }) => settings,
    },
  ),
);
