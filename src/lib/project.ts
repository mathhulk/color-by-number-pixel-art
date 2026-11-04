import type { ImportResult, NumberMode } from "@/import/types";

import { compactPalette } from "./targets";

export type ProjectKind = "2d" | "3d";

/**
 * A color-by-number design plus the player's progress.
 *
 * Cells are indexed `x + width * (y + height * z)`; a value of 0 is empty and
 * `n` refers to `palette[n - 1]`. In 2D, y = 0 is the top row. In 3D, y is up.
 */
export interface Project {
  id: string;
  name: string;
  kind: ProjectKind;
  createdAt: number;
  updatedAt: number;
  /** Set the first time the design is opened (drives the intro animation). */
  openedAt?: number;
  completedAt?: number;
  width: number;
  height: number;
  depth: number;
  palette: string[];
  cells: Uint16Array;
  /** 3D only: number each whole cube, or each face separately. */
  numberMode: NumberMode;
  /** Per-face colors (`cell * 6 + face`) when `numberMode === "face"`. */
  faceColors?: Uint16Array;
  /** One byte per target slot (see `buildTargets`); 1 = filled. */
  filled: Uint8Array;
  /** Where the design came from, e.g. "Sample" or "sunset.jpg". */
  source?: string;
}

/** Lightweight record used by the library so it never loads full projects. */
export interface ProjectSummary {
  id: string;
  name: string;
  kind: ProjectKind;
  width: number;
  height: number;
  depth: number;
  colors: number;
  total: number;
  done: number;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
  thumbnail?: Blob;
}

export function createId(): string {
  return typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function projectFromImport(result: ImportResult, name: string, source?: string): Project {
  const now = Date.now();
  const project: Project = {
    id: createId(),
    name,
    kind: result.kind,
    createdAt: now,
    updatedAt: now,
    width: result.width,
    height: result.height,
    depth: result.depth,
    palette: result.palette,
    cells: result.cells,
    numberMode: result.kind === "3d" ? result.numberMode : "voxel",
    filled: new Uint8Array(0),
  };
  if (source !== undefined) project.source = source;
  if (result.faceColors && project.numberMode === "face") project.faceColors = result.faceColors;
  if (project.kind === "3d") compactPalette(project);
  return project;
}

export function progressLabel(done: number, total: number): string {
  if (total === 0) return "0%";
  if (done >= total) return "100%";
  // Never round up to 100% before the very last cell is filled.
  return `${Math.min(99, Math.floor((done / total) * 100))}%`;
}
