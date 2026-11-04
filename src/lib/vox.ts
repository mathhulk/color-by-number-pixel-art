/**
 * MagicaVoxel `.vox` reading and writing.
 *
 * MagicaVoxel is Z-up; we are Y-up. A vox voxel (x, y, z) maps to our (x, z, y), so our
 * width = sizeX, height = sizeZ and depth = sizeY.
 */
import type { VoxelSource } from "../import/types";
import { deltaE, hexToRgb, type RGB, rgbToHex, rgbToLab } from "./color";

/** Largest model accepted on any axis (vox coordinates are single bytes). */
export const VOX_MAX_SIZE = 256;

const fourcc = (view: DataView, offset: number) =>
  String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3),
  );

/** Deterministic fallback for files without an RGBA chunk: a golden-angle hue ramp. */
function fallbackColor(index: number): RGB {
  const h = ((index * 137.508) % 360) / 60;
  const s = 0.65;
  const l = 0.35 + ((index * 7) % 5) * 0.08;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((h % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    h < 1
      ? [c, x, 0]
      : h < 2
        ? [x, c, 0]
        : h < 3
          ? [0, c, x]
          : h < 4
            ? [0, x, c]
            : h < 5
              ? [x, 0, c]
              : [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

/** Parses the first model of a MagicaVoxel file. Throws a descriptive Error on invalid input. */
export function parseVox(buffer: ArrayBuffer): VoxelSource {
  const len = buffer.byteLength;
  const view = new DataView(buffer);
  if (len < 8 || fourcc(view, 0) !== "VOX ") {
    throw new Error('Not a MagicaVoxel file: missing "VOX " header');
  }
  if (len < 20 || fourcc(view, 8) !== "MAIN") {
    throw new Error("Invalid .vox file: missing MAIN chunk");
  }
  const mainContent = view.getUint32(12, true);
  const mainChildren = view.getUint32(16, true);
  let offset = 20 + mainContent;
  const end = offset + mainChildren;
  if (end > len) throw new Error("Invalid .vox file: truncated MAIN chunk");

  let size: [x: number, y: number, z: number] | null = null;
  let xyzi: { offset: number; count: number } | null = null;
  let rgba: Uint8Array | null = null;

  while (offset + 12 <= end) {
    const id = fourcc(view, offset);
    const contentSize = view.getUint32(offset + 4, true);
    const childrenSize = view.getUint32(offset + 8, true);
    const content = offset + 12;
    if (content + contentSize + childrenSize > end) {
      throw new Error(`Invalid .vox file: truncated ${JSON.stringify(id)} chunk`);
    }
    switch (id) {
      case "SIZE":
        if (!size) {
          if (contentSize < 12) throw new Error("Invalid .vox file: SIZE chunk too small");
          size = [
            view.getInt32(content, true),
            view.getInt32(content + 4, true),
            view.getInt32(content + 8, true),
          ];
        }
        break;
      case "XYZI":
        if (!xyzi) {
          if (!size) throw new Error("Invalid .vox file: XYZI chunk before SIZE");
          if (contentSize < 4) throw new Error("Invalid .vox file: XYZI chunk too small");
          const count = view.getUint32(content, true);
          if (4 + count * 4 > contentSize) {
            throw new Error("Invalid .vox file: XYZI voxel count exceeds chunk size");
          }
          xyzi = { offset: content + 4, count };
        }
        break;
      case "RGBA":
        if (!rgba && contentSize >= 1024) rgba = new Uint8Array(buffer, content, 1024);
        break;
      default:
        // PACK, nTRN, nGRP, nSHP, MATL, LAYR, rOBJ, rCAM, NOTE, IMAP, … are not needed.
        break;
    }
    offset = content + contentSize + childrenSize;
  }

  if (!size) throw new Error("Invalid .vox file: missing SIZE chunk");
  const [sx, sy, sz] = size;
  if (sx < 1 || sy < 1 || sz < 1) throw new Error(`Invalid .vox model size ${sx}×${sy}×${sz}`);
  if (sx > VOX_MAX_SIZE || sy > VOX_MAX_SIZE || sz > VOX_MAX_SIZE) {
    throw new Error(
      `Model is ${sx}×${sy}×${sz}; at most ${VOX_MAX_SIZE} voxels per axis are supported`,
    );
  }
  if (!xyzi) throw new Error("Invalid .vox file: missing XYZI chunk");

  const width = sx;
  const height = sz;
  const depth = sy;
  const raw = new Uint8Array(width * height * depth);
  const bytes = new Uint8Array(buffer);
  const used = new Uint8Array(256);
  for (let i = 0, p = xyzi.offset; i < xyzi.count; i++, p += 4) {
    const x = bytes[p]!;
    const y = bytes[p + 1]!;
    const z = bytes[p + 2]!;
    const c = bytes[p + 3]!;
    if (c === 0 || x >= sx || y >= sy || z >= sz) continue;
    // Flip the vox Y axis so the model keeps its handedness (no mirroring).
    raw[x + width * (z + height * (sy - 1 - y))] = c;
    used[c] = 1;
  }

  // Compact the palette to the colors actually used (in vox index order).
  const compact = new Uint8Array(256);
  const palette: string[] = [];
  for (let c = 1; c < 256; c++) {
    if (!used[c]) continue;
    const rgb: RGB = rgba
      ? [rgba[(c - 1) * 4]!, rgba[(c - 1) * 4 + 1]!, rgba[(c - 1) * 4 + 2]!]
      : fallbackColor(c);
    palette.push(rgbToHex(rgb));
    compact[c] = palette.length;
  }
  const voxels = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i]!;
    if (c !== 0) voxels[i] = compact[c]!;
  }
  return { type: "voxels", width, height, depth, voxels, palette };
}

/**
 * Writes a MagicaVoxel file (version 150: MAIN > SIZE, XYZI, RGBA). `cells` uses our Y-up layout
 * (index = x + width·(y + height·z), 0 = empty, 1-based palette index). Colors beyond the 255
 * that fit in a vox palette are mapped to the nearest of the first 255.
 */
export function writeVox(
  width: number,
  height: number,
  depth: number,
  cells: Uint16Array,
  palette: string[],
): ArrayBuffer {
  for (const [axis, v] of [
    ["width", width],
    ["height", height],
    ["depth", depth],
  ] as const) {
    if (!Number.isInteger(v) || v < 1 || v > VOX_MAX_SIZE) {
      throw new Error(`Cannot write .vox: ${axis} ${v} is outside 1…${VOX_MAX_SIZE}`);
    }
  }
  const n = width * height * depth;
  if (cells.length < n) throw new Error("Cannot write .vox: cells array is too short");

  const rgbs = palette.map(hexToRgb);
  const direct = Math.min(255, rgbs.length);
  const colorIndex = new Uint8Array(rgbs.length + 1);
  for (let i = 0; i < direct; i++) colorIndex[i + 1] = i + 1;
  if (rgbs.length > 255) {
    const labs = rgbs.slice(0, 255).map((c) => rgbToLab(c));
    for (let i = 255; i < rgbs.length; i++) {
      const lab = rgbToLab(rgbs[i]!);
      let best = 0;
      let bestD = Infinity;
      labs.forEach((l, j) => {
        const d = deltaE(lab, l);
        if (d < bestD) {
          bestD = d;
          best = j;
        }
      });
      colorIndex[i + 1] = best + 1;
    }
  }

  let count = 0;
  for (let i = 0; i < n; i++) {
    const v = cells[i]!;
    if (v > 0 && v <= rgbs.length) count++;
  }

  const sizeChunk = 12 + 12;
  const xyziChunk = 12 + 4 + count * 4;
  const rgbaChunk = 12 + 1024;
  const childrenSize = sizeChunk + xyziChunk + rgbaChunk;
  const buffer = new ArrayBuffer(8 + 12 + childrenSize);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  let o = 0;
  const writeId = (id: string) => {
    for (let i = 0; i < 4; i++) bytes[o + i] = id.charCodeAt(i);
    o += 4;
  };
  const writeU32 = (v: number) => {
    view.setUint32(o, v, true);
    o += 4;
  };
  const chunk = (id: string, content: number, children: number) => {
    writeId(id);
    writeU32(content);
    writeU32(children);
  };

  writeId("VOX ");
  writeU32(150);
  chunk("MAIN", 0, childrenSize);

  chunk("SIZE", 12, 0);
  writeU32(width); // x
  writeU32(depth); // y
  writeU32(height); // z (up)

  chunk("XYZI", 4 + count * 4, 0);
  writeU32(count);
  for (let z = 0; z < depth; z++) {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const v = cells[x + width * (y + height * z)]!;
        if (v === 0 || v > rgbs.length) continue;
        bytes[o] = x;
        bytes[o + 1] = depth - 1 - z;
        bytes[o + 2] = y;
        bytes[o + 3] = colorIndex[v]!;
        o += 4;
      }
    }
  }

  chunk("RGBA", 1024, 0);
  for (let i = 0; i < 256; i++) {
    const c = i < direct ? rgbs[i]! : ([0, 0, 0] as const);
    bytes[o] = c[0];
    bytes[o + 1] = c[1];
    bytes[o + 2] = c[2];
    bytes[o + 3] = 255;
    o += 4;
  }
  return buffer;
}
