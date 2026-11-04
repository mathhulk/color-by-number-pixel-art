import { hexToRgb, rgbToHex, shadeRgb } from "./color";
import { createId, type Project } from "./project";
import { compactPalette } from "./targets";

export interface SampleDesign {
  id: string;
  name: string;
  description: string;
  kind: "2d" | "3d";
  build: () => Project;
}

type Design = Pick<
  Project,
  "kind" | "width" | "height" | "depth" | "palette" | "cells" | "numberMode"
> & {
  faceColors?: Uint16Array;
};

function finish(name: string, design: Design): Project {
  const now = Date.now();
  const p: Project = {
    ...design,
    id: createId(),
    name,
    createdAt: now,
    updatedAt: now,
    filled: new Uint8Array(0),
    source: "Sample",
  };
  if (p.kind === "3d") compactPalette(p);
  return p;
}

/** Builds a 2D design from ASCII art: each character maps to a palette color, "." is empty. */
function fromAscii(rows: string[], colors: Record<string, string>): Design {
  const width = Math.max(...rows.map((r) => r.length));
  const height = rows.length;
  const keys = Object.keys(colors);
  const cells = new Uint16Array(width * height);
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const k = keys.indexOf(row[x]!);
      if (k >= 0) cells[x + y * width] = k + 1;
    }
  });
  return {
    kind: "2d",
    width,
    height,
    depth: 1,
    palette: Object.values(colors),
    cells,
    numberMode: "voxel",
  };
}

/** Deterministic 2D/3D value noise in [0, 1). */
function hash(x: number, y: number, z = 0): number {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function smoothNoise(x: number, y: number, z = 0): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const fx = x - xi;
  const fy = y - yi;
  const fz = z - zi;
  const s = (t: number) => t * t * (3 - 2 * t);
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const c = (dx: number, dy: number, dz: number) => hash(xi + dx, yi + dy, zi + dz);
  const x00 = lerp(c(0, 0, 0), c(1, 0, 0), s(fx));
  const x10 = lerp(c(0, 1, 0), c(1, 1, 0), s(fx));
  const x01 = lerp(c(0, 0, 1), c(1, 0, 1), s(fx));
  const x11 = lerp(c(0, 1, 1), c(1, 1, 1), s(fx));
  return lerp(lerp(x00, x10, s(fy)), lerp(x01, x11, s(fy)), s(fz));
}

function heart(): Design {
  return fromAscii(
    [
      "..KK...KK..",
      ".KRRK.KRRK.",
      "KRWRRKRRRrK",
      "KRWRRRRRRrK",
      "KRRRRRRRRrK",
      ".KRRRRRRrK.",
      "..KRRRRrK..",
      "...KRRrK...",
      "....KrK....",
      ".....K.....",
    ],
    { K: "#5b1a2a", R: "#e8435a", r: "#b8243f", W: "#ffd1d8" },
  );
}

function strawberry(): Design {
  return fromAscii(
    [
      ".....GG......",
      "...GgGGgG....",
      "..gGGGGGGg...",
      "...KRRRRRK...",
      "..KRRWRRRRK..",
      ".KRRRRRYRRRK.",
      ".KRYRRRRRRrK.",
      ".KRRRRYRRRrK.",
      ".KRRRRRRYrrK.",
      "..KRYRRRRrK..",
      "..KRRRRYrrK..",
      "...KRRRrrK...",
      "....KRrrK....",
      ".....KKK.....",
    ],
    {
      G: "#4caf50",
      g: "#2e7d32",
      K: "#6d1b1b",
      R: "#e53935",
      r: "#b71c1c",
      W: "#ffcdd2",
      Y: "#fdd835",
    },
  );
}

function cactus(): Design {
  return fromAscii(
    [
      "......PP......",
      ".....PpPP.....",
      ".....GgGG.....",
      ".....GgGG.....",
      "..G..GgGG.....",
      ".GgG.GgGG..G..",
      ".GgG.GgGG.GgG.",
      ".GgGGGgGG.GgG.",
      "..GGGGgGGGGgG.",
      ".....GgGGGGG..",
      ".....GgGG.....",
      ".....GgGG.....",
      ".....GgGG.....",
      "...SSSSSSSS...",
      "...oOOOOOOo...",
      "....OOOOOO....",
      "....oOOOOo....",
      "....OOOOOO....",
      ".....oooo.....",
    ],
    {
      P: "#f06292",
      p: "#c2185b",
      G: "#66bb6a",
      g: "#388e3c",
      S: "#8d6e63",
      O: "#e07a4f",
      o: "#b65232",
    },
  );
}

function sunset(): Design {
  const width = 64;
  const height = 40;
  const palette = [
    "#2b1b4a", // 1 deep sky
    "#5a2a6e", // 2
    "#a23b72", // 3
    "#e3646a", // 4
    "#f6a35c", // 5
    "#ffd57e", // 6 sun
    "#3a2f5b", // 7 far mountains
    "#231d3d", // 8 near mountains
    "#1c3550", // 9 water dark
    "#2f5d7c", // 10 water light
    "#f2b880", // 11 reflection
  ];
  const cells = new Uint16Array(width * height);
  const horizon = 27;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = x + y * width;
      if (y < horizon) {
        const band = Math.min(4, Math.max(0, Math.floor((y / 20) * 5 + (hash(x, y) - 0.5) * 0.5)));
        let c = band + 1;
        if (Math.hypot(x - 40, y - 19) < 7.5) c = 6;
        const far = 17 + Math.round(5 * smoothNoise(x / 7, 3) + 2 * Math.sin(x / 5));
        const near = 21 + Math.round(4 * smoothNoise(x / 5 + 10, 7));
        if (y >= far) c = 7;
        if (y >= near) c = 8;
        cells[i] = c;
      } else {
        const ripple = hash(Math.floor(x / 3), y) > 0.7;
        let c = ripple ? 10 : 9;
        if (Math.abs(x - 40) < 6 - (y - horizon) * 0.25 && (x + y) % 3 !== 0) c = 11;
        cells[i] = c;
      }
    }
  }
  return { kind: "2d", width, height, depth: 1, palette, cells, numberMode: "voxel" };
}

/** Collects voxels by color key, then builds a compact palette. */
class VoxelBuilder {
  readonly width: number;
  readonly height: number;
  readonly depth: number;
  readonly cells: Uint16Array;
  private keys: string[] = [];
  constructor(width: number, height: number, depth: number) {
    this.width = width;
    this.height = height;
    this.depth = depth;
    this.cells = new Uint16Array(width * height * depth);
  }
  set(x: number, y: number, z: number, hex: string): void {
    if (x < 0 || y < 0 || z < 0 || x >= this.width || y >= this.height || z >= this.depth) return;
    let k = this.keys.indexOf(hex);
    if (k < 0) k = this.keys.push(hex) - 1;
    this.cells[x + this.width * (y + this.height * z)] = k + 1;
  }
  get(x: number, y: number, z: number): number {
    return this.cells[x + this.width * (y + this.height * z)] ?? 0;
  }
  design(): Design {
    return {
      kind: "3d",
      width: this.width,
      height: this.height,
      depth: this.depth,
      palette: [...this.keys],
      cells: this.cells,
      numberMode: "voxel",
    };
  }
}

/** Gives each face direction its own lit shade (the "per face" numbering style). */
export function withFaceShading(d: Design): Design {
  const shades = [-0.12, -0.12, 0.18, -0.3, 0, 0];
  const palette: string[] = [];
  const faceColors = new Uint16Array(d.cells.length * 6);
  for (let i = 0; i < d.cells.length; i++) {
    const c = d.cells[i]!;
    if (!c) continue;
    const base = hexToRgb(d.palette[c - 1]!);
    for (let f = 0; f < 6; f++) {
      const hex = rgbToHex(shadeRgb(base, shades[f]!));
      let k = palette.indexOf(hex);
      if (k < 0) k = palette.push(hex) - 1;
      faceColors[i * 6 + f] = k + 1;
    }
  }
  const cells = new Uint16Array(d.cells.length);
  for (let i = 0; i < cells.length; i++) if (d.cells[i]) cells[i] = faceColors[i * 6 + 4]!;
  return { ...d, palette, cells, faceColors, numberMode: "face" };
}

function tree(): Design {
  const b = new VoxelBuilder(12, 14, 12);
  for (let x = 0; x < 12; x++) {
    for (let z = 0; z < 12; z++) {
      b.set(x, 0, z, "#7a5230");
      b.set(x, 1, z, hash(x, z, 1) > 0.8 ? "#8bc34a" : "#6aa84f");
    }
  }
  for (let y = 2; y < 7; y++) {
    for (const [x, z] of [
      [5, 5],
      [6, 5],
      [5, 6],
      [6, 6],
    ] as const)
      b.set(x, y, z, "#8d5a2b");
  }
  for (let x = 0; x < 12; x++) {
    for (let y = 6; y < 14; y++) {
      for (let z = 0; z < 12; z++) {
        const d = Math.hypot(x - 5.5, (y - 9.5) * 1.15, z - 5.5);
        if (d < 4.6 + smoothNoise(x / 2, y / 2, z / 2) * 0.9) {
          b.set(x, y, z, hash(x, y, z) > 0.75 ? "#2e7d32" : "#43a047");
        }
      }
    }
  }
  b.set(3, 9, 2, "#e53935");
  b.set(8, 8, 9, "#e53935");
  b.set(9, 11, 5, "#e53935");
  return b.design();
}

function mushroom(): Design {
  const b = new VoxelBuilder(13, 11, 13);
  for (let y = 0; y < 5; y++) {
    for (let x = 0; x < 13; x++) {
      for (let z = 0; z < 13; z++) {
        if (Math.hypot(x - 6, z - 6) < 2.3) b.set(x, y, z, "#f3e5d0");
      }
    }
  }
  for (let x = 0; x < 13; x++) {
    for (let y = 4; y < 11; y++) {
      for (let z = 0; z < 13; z++) {
        const d = Math.hypot(x - 6, (y - 4) * 1.3, z - 6);
        if (d < 6.4 && y >= 4) {
          const spot = hash(Math.floor(x / 2), Math.floor(y / 2), Math.floor(z / 2)) > 0.78;
          b.set(x, y, z, spot ? "#fff8f0" : "#d93a3a");
        }
      }
    }
  }
  return withFaceShading(b.design());
}

function planet(): Design {
  const size = 17;
  const r = 7.6;
  const b = new VoxelBuilder(size, size, size);
  const c = (size - 1) / 2;
  for (let x = 0; x < size; x++) {
    for (let y = 0; y < size; y++) {
      for (let z = 0; z < size; z++) {
        const d = Math.hypot(x - c, y - c, z - c);
        if (d > r) continue;
        const n = smoothNoise(x / 3.2, y / 3.2, z / 3.2);
        const lat = Math.abs(y - c) / r;
        let color = n > 0.55 ? (n > 0.72 ? "#8d6e63" : "#4caf50") : n > 0.5 ? "#f4d58d" : "#1e88e5";
        if (lat > 0.8) color = "#f5f7fa";
        b.set(x, y, z, color);
      }
    }
  }
  return b.design();
}

export const SAMPLES: SampleDesign[] = [
  {
    id: "heart",
    name: "Little Heart",
    description: "A tiny warm-up",
    kind: "2d",
    build: () => finish("Little Heart", heart()),
  },
  {
    id: "strawberry",
    name: "Strawberry",
    description: "Sweet and simple",
    kind: "2d",
    build: () => finish("Strawberry", strawberry()),
  },
  {
    id: "cactus",
    name: "Potted Cactus",
    description: "Prickly but friendly",
    kind: "2d",
    build: () => finish("Potted Cactus", cactus()),
  },
  {
    id: "sunset",
    name: "Mountain Sunset",
    description: "A bigger landscape",
    kind: "2d",
    build: () => finish("Mountain Sunset", sunset()),
  },
  {
    id: "tree",
    name: "Voxel Tree",
    description: "3D · one number per cube",
    kind: "3d",
    build: () => finish("Voxel Tree", tree()),
  },
  {
    id: "mushroom",
    name: "Mushroom",
    description: "3D · one number per face",
    kind: "3d",
    build: () => finish("Mushroom", mushroom()),
  },
  {
    id: "planet",
    name: "Little Planet",
    description: "3D · a round world",
    kind: "3d",
    build: () => finish("Little Planet", planet()),
  },
];
