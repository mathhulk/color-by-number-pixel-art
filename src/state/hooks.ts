import { useEffect, useMemo, useState, useSyncExternalStore } from "react";

import { sound } from "@/lib/audio";
import { hexToRgb, readableTextColor } from "@/lib/color";
import { ACCENTS, resolveAccent, visionMatrix } from "@/lib/cvd";
import type { RenderStyle } from "@/render/types";

import { useSettings } from "./settings";

function subscribeMedia(query: string) {
  return (callback: () => void) => {
    const mql = window.matchMedia(query);
    mql.addEventListener("change", callback);
    return () => mql.removeEventListener("change", callback);
  };
}

export function useMediaQuery(query: string): boolean {
  const subscribe = useMemo(() => subscribeMedia(query), [query]);
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}

export function useIsDark(): boolean {
  const theme = useSettings((s) => s.theme);
  const systemDark = useMediaQuery("(prefers-color-scheme: dark)");
  return theme === "dark" || (theme === "system" && systemDark);
}

export function useReducedMotion(): boolean {
  const motion = useSettings((s) => s.motion);
  const systemReduced = useMediaQuery("(prefers-reduced-motion: reduce)");
  return motion === "reduced" || (motion === "system" && systemReduced);
}

export function useAccent(): { name: keyof typeof ACCENTS; hex: string } {
  const accent = useSettings((s) => s.accent);
  const visionMode = useSettings((s) => s.visionMode);
  const dark = useIsDark();
  const name = resolveAccent(accent, visionMode);
  return { name, hex: dark ? ACCENTS[name].darkHex : ACCENTS[name].hex };
}

/** Everything the renderers need from the user's preferences. */
export function useRenderStyle(): RenderStyle {
  const s = useSettings();
  const dark = useIsDark();
  const reducedMotion = useReducedMotion();
  const accent = useAccent();
  return useMemo(
    () => ({
      showNumbers: s.showNumbers,
      showGrid: s.showGrid,
      tint: s.tint,
      highlightSelected: s.highlightSelected,
      showMistakes: s.showMistakes,
      accent: hexToRgb(accent.hex),
      mistake: hexToRgb(dark ? "#ff6369" : "#d93036"),
      vision: visionMatrix(s.visionMode, s.visionFilter),
      dark,
      reducedMotion,
    }),
    [
      s.showNumbers,
      s.showGrid,
      s.tint,
      s.highlightSelected,
      s.showMistakes,
      s.visionMode,
      s.visionFilter,
      accent.hex,
      dark,
      reducedMotion,
    ],
  );
}

/** Applies theme + accent to the document so CSS tokens follow the settings. */
export function useApplyTheme(): void {
  const theme = useSettings((s) => s.theme);
  const accent = useAccent();
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "system") delete root.dataset.theme;
    else root.dataset.theme = theme;
    root.style.setProperty("--accent", accent.hex);
    root.style.setProperty("--accent-contrast", readableTextColor(hexToRgb(accent.hex)));
    root.dataset.accent = accent.name;
  }, [theme, accent.hex, accent.name]);
}

/**
 * Keeps the sound engine in sync with the settings and unlocks audio on the
 * first interaction (browsers block audio until a user gesture).
 */
export function useSound(): void {
  const effects = useSettings((s) => s.soundEffects);
  const music = useSettings((s) => s.music);
  const volume = useSettings((s) => s.volume);
  const muted = useSettings((s) => s.muted);
  useEffect(() => {
    sound.configure({ effects, music, volume, muted });
    // Turning music on from the settings is itself a gesture, so start right away.
    if (music || effects) sound.unlock();
  }, [effects, music, volume, muted]);
  useEffect(() => {
    const unlock = () => sound.unlock();
    window.addEventListener("pointerdown", unlock, { capture: true });
    window.addEventListener("keydown", unlock, { capture: true });
    return () => {
      window.removeEventListener("pointerdown", unlock, { capture: true });
      window.removeEventListener("keydown", unlock, { capture: true });
    };
  }, []);
}

/** Creates an object URL for a blob and revokes it when it changes. */
export function useObjectUrl(blob: Blob | undefined): string | undefined {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!blob) {
      // oxlint-disable-next-line react/set-state-in-effect -- object URLs are an external resource that must be revoked
      setUrl(undefined);
      return;
    }
    const next = URL.createObjectURL(blob);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [blob]);
  return url;
}
