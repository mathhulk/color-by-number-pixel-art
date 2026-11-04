import type { Project } from "./project";

/** Face order used everywhere: +x, -x, +y, -y, +z, -z. */
export const FACE_NORMALS: ReadonlyArray<readonly [number, number, number]> = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];

/**
 * Everything a player can fill. In 2D a slot is a cell index. In 3D a slot is
 * either a visible voxel ("voxel" mode) or a visible voxel face ("face" mode);
 * hidden interior voxels are not targets, so every design can be finished.
 */
export interface Targets {
  /** Number of slots (the length of `Project.filled`). */
  count: number;
  /** Color (1-based palette index) per slot; 0 when the slot isn't fillable. */
  color: Uint16Array;
  /** Number of fillable slots. */
  total: number;
  /** Fillable slots per color, indexed by 1-based color. */
  colorTotals: Uint32Array;
  /** 3D: voxel index per slot. */
  voxel?: Int32Array;
  /** 3D: face per slot, -1 when the slot is a whole voxel. */
  face?: Int8Array;
  /** 3D voxel mode: slot per voxel (-1 none). */
  voxelSlot?: Int32Array;
  /** 3D face mode: slot per `voxel * 6 + face` (-1 none). */
  faceSlot?: Int32Array;
}

export function isFaceExposed(p: Project, x: number, y: number, z: number, face: number): boolean {
  const n = FACE_NORMALS[face]!;
  const nx = x + n[0];
  const ny = y + n[1];
  const nz = z + n[2];
  if (nx < 0 || ny < 0 || nz < 0 || nx >= p.width || ny >= p.height || nz >= p.depth) return true;
  return p.cells[nx + p.width * (ny + p.height * nz)] === 0;
}

export function buildTargets(p: Project): Targets {
  const paletteSize = p.palette.length;
  const colorTotals = new Uint32Array(paletteSize + 1);

  if (p.kind === "2d") {
    const color = p.cells;
    let total = 0;
    for (const c of color) {
      if (c > 0) {
        colorTotals[c]!++;
        total++;
      }
    }
    return { count: color.length, color, total, colorTotals };
  }

  const { width: w, height: h, depth: d } = p;
  const voxels: number[] = [];
  const faces: number[] = [];
  const colors: number[] = [];
  const faceMode = p.numberMode === "face" && p.faceColors !== undefined;
  const voxelSlot = faceMode ? undefined : new Int32Array(p.cells.length).fill(-1);
  const faceSlot = faceMode ? new Int32Array(p.cells.length * 6).fill(-1) : undefined;

  for (let z = 0; z < d; z++) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = x + w * (y + h * z);
        const c = p.cells[i]!;
        if (c === 0) continue;
        if (faceSlot && p.faceColors) {
          for (let f = 0; f < 6; f++) {
            const fc = p.faceColors[i * 6 + f]!;
            if (fc === 0 || !isFaceExposed(p, x, y, z, f)) continue;
            faceSlot[i * 6 + f] = voxels.length;
            voxels.push(i);
            faces.push(f);
            colors.push(fc);
          }
        } else if (voxelSlot) {
          let exposed = false;
          for (let f = 0; f < 6 && !exposed; f++) exposed = isFaceExposed(p, x, y, z, f);
          if (!exposed) continue;
          voxelSlot[i] = voxels.length;
          voxels.push(i);
          faces.push(-1);
          colors.push(c);
        }
      }
    }
  }

  const color = Uint16Array.from(colors);
  for (const c of color) colorTotals[c]!++;
  const targets: Targets = {
    count: color.length,
    color,
    total: color.length,
    colorTotals,
    voxel: Int32Array.from(voxels),
    face: Int8Array.from(faces),
  };
  if (voxelSlot) targets.voxelSlot = voxelSlot;
  if (faceSlot) targets.faceSlot = faceSlot;
  return targets;
}

/** Slot hit by a ray that entered `voxel` through `face`, or -1. */
export function slotFor(t: Targets, voxel: number, face: number): number {
  if (t.faceSlot) return t.faceSlot[voxel * 6 + face] ?? -1;
  if (t.voxelSlot) return t.voxelSlot[voxel] ?? -1;
  return voxel;
}

/** Ensures `p.filled` matches the target layout (e.g. after an import or a corrupt save). */
export function normalizeFilled(p: Project, t: Targets): void {
  if (p.filled.length !== t.count) {
    const next = new Uint8Array(t.count);
    next.set(p.filled.subarray(0, Math.min(p.filled.length, t.count)));
    p.filled = next;
  }
}

/** Fillable neighbors of a slot that share its color (used by the bucket tool). */
export function sameColorNeighbors(p: Project, t: Targets, slot: number, out: number[]): void {
  const color = t.color[slot]!;
  out.length = 0;
  const { width: w, height: h, depth: d } = p;
  if (p.kind === "2d") {
    const x = slot % w;
    const y = (slot - x) / w;
    if (x > 0 && t.color[slot - 1] === color) out.push(slot - 1);
    if (x < w - 1 && t.color[slot + 1] === color) out.push(slot + 1);
    if (y > 0 && t.color[slot - w] === color) out.push(slot - w);
    if (y < h - 1 && t.color[slot + w] === color) out.push(slot + w);
    return;
  }
  const voxel = t.voxel![slot]!;
  const x = voxel % w;
  const y = Math.floor(voxel / w) % h;
  const z = Math.floor(voxel / (w * h));
  const face = t.face![slot]!;
  for (let f = 0; f < 6; f++) {
    // In face mode, spread only across the face's own plane.
    if (face >= 0 && f >> 1 === face >> 1) continue;
    const n = FACE_NORMALS[f]!;
    const nx = x + n[0];
    const ny = y + n[1];
    const nz = z + n[2];
    if (nx < 0 || ny < 0 || nz < 0 || nx >= w || ny >= h || nz >= d) continue;
    const ni = nx + w * (ny + h * nz);
    const ns = slotFor(t, ni, face >= 0 ? face : 0);
    const neighborSlot = face >= 0 ? ns : (t.voxelSlot?.[ni] ?? -1);
    if (neighborSlot >= 0 && t.color[neighborSlot] === color) out.push(neighborSlot);
  }
}

/**
 * Removes palette entries that have nothing to fill (e.g. shades only used on
 * hidden faces of a 3D model) and renumbers the rest, so every number shown in
 * the palette can actually be painted. Call this when a design is created.
 */
export function compactPalette(p: Project): void {
  const totals = buildTargets(p).colorTotals;
  const remap = new Uint16Array(p.palette.length + 1);
  const palette: string[] = [];
  for (let c = 1; c <= p.palette.length; c++) {
    if (totals[c]! > 0) remap[c] = palette.push(p.palette[c - 1]!);
  }
  if (palette.length === p.palette.length) return;
  // A voxel whose own color vanished keeps a valid representative from its faces.
  const cells = p.cells.map((c, i) => {
    if (c === 0) return 0;
    if (remap[c]) return remap[c];
    if (p.faceColors) {
      for (let f = 0; f < 6; f++) {
        const fc = remap[p.faceColors[i * 6 + f]!]!;
        if (fc) return fc;
      }
    }
    return 0;
  });
  if (p.faceColors) p.faceColors = p.faceColors.map((c) => remap[c]!);
  p.cells = cells;
  p.palette = palette;
  p.filled = new Uint8Array(0);
}
