import type { RGB } from "@/lib/color";
import type { Mat3 } from "@/lib/cvd";
import type { Project } from "@/lib/project";
import type { Targets } from "@/lib/targets";

export interface RenderStyle {
  showNumbers: boolean;
  showGrid: boolean;
  /** 0–1: how much of each cell's color shows through before it is filled. */
  tint: number;
  highlightSelected: boolean;
  accent: RGB;
  vision: Mat3;
  dark: boolean;
  reducedMotion: boolean;
}

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** What the play screen needs from a 2D or 3D renderer. */
export interface SceneView {
  readonly kind: "2d" | "3d";
  setProject(project: Project, targets: Targets): void;
  setStyle(style: RenderStyle): void;
  setSelected(color: number): void;
  /** Keyboard cursor slot (2D), or -1. */
  setCursor(slot: number): void;
  setInsets(insets: Insets): void;
  /** Refresh the GPU copy of the given slots after they were (un)filled. */
  updateSlots(slots: readonly number[]): void;
  /** Slot under a point in CSS pixels relative to the canvas, or -1. */
  pick(x: number, y: number): number;
  /** Drag the view (2D pan / 3D pan) by CSS pixels. */
  pan(dx: number, dy: number): void;
  /** 3D: orbit; 2D: same as pan. */
  rotate(dx: number, dy: number): void;
  zoomAt(x: number, y: number, factor: number): void;
  zoomBy(factor: number): void;
  fit(animate?: boolean): void;
  focusSlot(slot: number): void;
  playIntro(): Promise<void>;
  playCompletion(): Promise<void>;
  /** Zoom level for UI (1 = fit). */
  readonly zoomLevel: number;
  snapshot(): Promise<Blob>;
  requestRender(): void;
  dispose(): void;
}
