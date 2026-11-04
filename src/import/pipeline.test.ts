import { describe, expect, it } from "vitest";

import { hexToRgb, rgbToLab } from "../lib/color";
import {
  applyAdjustments,
  buildHistogram,
  cleanupSpeckles,
  processImport,
  quantize,
  resample,
} from "./pipeline";
import {
  defaultImportSettings,
  type ImportSettings,
  type QuantizeMethod,
  type RasterSource,
  type VoxelSource,
} from "./types";

type RGBA = readonly [number, number, number, number];

function raster(w: number, h: number, fn: (x: number, y: number) => RGBA): RasterSource {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) data.set(fn(x, y), (y * w + x) * 4);
  }
  return { type: "raster", width: w, height: h, data };
}

function settings(overrides: Partial<ImportSettings>): ImportSettings {
  return { ...defaultImportSettings, cleanup: 0, ...overrides };
}

function noise(w: number, h: number, seed = 1): RasterSource {
  let s = seed;
  const rnd = () => {
    s = (Math.imul(s, 1103515245) + 12345) >>> 0;
    return (s >>> 16) & 255;
  };
  return raster(w, h, () => [rnd(), rnd(), rnd(), 255]);
}

const RED: RGBA = [255, 0, 0, 255];
const BLUE: RGBA = [0, 0, 255, 255];
const CLEAR: RGBA = [0, 0, 0, 0];

/** 8×8 image of a 4×4 two-color checker upscaled ×2. */
const checker = raster(8, 8, (x, y) => ((Math.floor(x / 2) + Math.floor(y / 2)) % 2 ? BLUE : RED));
const expectedChecker = (x: number, y: number) => ((x + y) % 2 ? BLUE : RED);

function pixel(out: Float32Array, w: number, x: number, y: number): number[] {
  const o = (y * w + x) * 4;
  return Array.from(out.subarray(o, o + 4), (v) => Math.round(v));
}

describe("applyAdjustments", () => {
  it("is the identity when all adjustments are 0", () => {
    const src = noise(4, 4);
    const out = applyAdjustments(src.data, 0, 0, 0);
    expect(out).not.toBe(src.data);
    expect(Array.from(out)).toEqual(Array.from(src.data));
  });

  it("brightens and desaturates", () => {
    const src = raster(1, 1, () => [100, 50, 50, 200]);
    expect(applyAdjustments(src.data, 50, 0, 0)[0]).toBeGreaterThan(100);
    const gray = applyAdjustments(src.data, 0, 0, -100);
    expect(gray[0]).toBe(gray[1]);
    expect(gray[3]).toBe(200);
  });
});

describe("resample", () => {
  for (const method of ["nearest", "dominant", "average"] as const) {
    it(`${method} recovers a 2× upscaled checker exactly`, () => {
      const out = resample(checker, 4, 4, method);
      for (let y = 0; y < 4; y++) {
        for (let x = 0; x < 4; x++) expect(pixel(out, 4, x, y)).toEqual([...expectedChecker(x, y)]);
      }
    });
  }

  it("average blends a 2×2 block", () => {
    const src = raster(2, 2, (x, y) => ((x + y) % 2 ? [255, 255, 255, 255] : [0, 0, 0, 255]));
    expect(pixel(resample(src, 1, 1, "average"), 1, 0, 0)).toEqual([128, 128, 128, 255]);
  });

  it("dominant picks the majority color and reports opaque coverage", () => {
    const src = raster(3, 3, (x, y) =>
      x === 1 && y === 1 ? BLUE : x === 0 && y === 0 ? CLEAR : RED,
    );
    const [r, g, b, a] = pixel(resample(src, 1, 1, "dominant"), 1, 0, 0);
    expect([r, g, b]).toEqual([255, 0, 0]);
    expect(a).toBe(Math.round((8 / 9) * 255));
  });

  it("bilinear produces the requested size and keeps flat colors", () => {
    const src = raster(5, 3, () => [10, 20, 30, 255]);
    const out = resample(src, 9, 7, "bilinear");
    expect(out.length).toBe(9 * 7 * 4);
    expect(pixel(out, 9, 4, 3)).toEqual([10, 20, 30, 255]);
  });

  it("nearest upsamples", () => {
    const out = resample(
      raster(2, 1, (x) => (x ? BLUE : RED)),
      4,
      2,
      "nearest",
    );
    expect(pixel(out, 4, 1, 1)).toEqual([...RED]);
    expect(pixel(out, 4, 2, 0)).toEqual([...BLUE]);
  });
});

describe("quantizers", () => {
  const src = noise(32, 32, 7);
  const rgb = new Float32Array(32 * 32 * 3);
  for (let i = 0; i < 32 * 32; i++) rgb.set(src.data.subarray(i * 4, i * 4 + 3), i * 3);
  const hist = buildHistogram(rgb, new Uint8Array(32 * 32).fill(1));
  const methods: QuantizeMethod[] = ["exact", "median-cut", "kmeans", "octree"];

  for (const method of methods) {
    for (const k of [1, 5, 16]) {
      it(`${method} returns at most ${k} colors deterministically`, () => {
        const a = quantize(hist, k, method, "lab");
        const b = quantize(hist, k, method, "lab");
        expect(a.palette.length).toBeGreaterThan(0);
        expect(a.palette.length).toBeLessThanOrEqual(k);
        expect(a.palette).toEqual(b.palette);
        for (const c of a.palette) for (const v of c) expect(Number.isInteger(v)).toBe(true);
      });
    }
  }

  it("exact sets a note when it has to fall back to k-means", () => {
    const res = quantize(hist, 8, "exact", "rgb");
    expect(res.note).toMatch(/reduced to 8 with k-means/);
    const result = processImport(
      src,
      settings({ width: 32, height: 32, quantize: "exact", colors: 8 }),
    );
    expect(result.stats.note).toMatch(/^Image has \d+ colors; reduced to 8 with k-means$/);
    expect(result.stats.sourceColors).toBeGreaterThan(8);
  });

  it("processImport is deterministic for identical input", () => {
    const s = settings({ width: 16, height: 16, colors: 12, quantize: "kmeans" });
    const a = processImport(src, s);
    const b = processImport(src, s);
    expect(a.palette).toEqual(b.palette);
    expect(Array.from(a.cells)).toEqual(Array.from(b.cells));
  });
});

describe("processImport (2D)", () => {
  const eight: RGBA[] = [
    [0, 0, 0, 255],
    [255, 255, 255, 255],
    [255, 0, 0, 255],
    [0, 255, 0, 255],
    [0, 0, 255, 255],
    [255, 255, 0, 255],
    [0, 255, 255, 255],
    [255, 0, 255, 255],
  ];
  const eightImage = raster(8, 4, (x, y) => eight[(x + y * 3) % 8]!);

  it("exact mode preserves an 8-color image", () => {
    const result = processImport(
      eightImage,
      settings({ width: 8, height: 4, resample: "nearest", quantize: "exact", colors: 16 }),
    );
    expect(result.kind).toBe("2d");
    expect(result.depth).toBe(1);
    expect(result.numberMode).toBe("voxel");
    expect(result.palette).toHaveLength(8);
    expect(result.stats.colors).toBe(8);
    expect(result.stats.sourceColors).toBe(8);
    expect(result.stats.note).toBeUndefined();
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 8; x++) {
        const v = result.cells[y * 8 + x]!;
        expect(hexToRgb(result.palette[v - 1]!)).toEqual(eight[(x + y * 3) % 8]!.slice(0, 3));
      }
    }
    for (const hex of result.palette) expect(hex).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("every quantizer and dither produces valid cells", () => {
    const src = noise(40, 30, 3);
    for (const quantizeMethod of ["exact", "median-cut", "kmeans", "octree"] as const) {
      for (const dither of ["none", "floyd-steinberg", "atkinson", "bayer"] as const) {
        const r = processImport(
          src,
          settings({ width: 20, height: 15, quantize: quantizeMethod, dither, colors: 6 }),
        );
        expect(r.cells).toHaveLength(300);
        expect(r.palette.length).toBeLessThanOrEqual(6);
        expect(r.stats.filledCells).toBe(300);
        const used = new Set(r.cells);
        expect(used.has(0)).toBe(false);
        expect(Math.max(...used)).toBeLessThanOrEqual(r.palette.length);
        // No unused palette entries.
        expect(used.size).toBe(r.palette.length);
      }
    }
  });

  it("alpha threshold creates empty cells", () => {
    const src = raster(4, 4, (x) => (x < 2 ? RED : [0, 0, 255, 100]));
    const r = processImport(
      src,
      settings({ width: 4, height: 4, resample: "nearest", alphaThreshold: 128 }),
    );
    expect(r.stats.filledCells).toBe(8);
    expect(r.cells[0]).not.toBe(0);
    expect(r.cells[3]).toBe(0);
    expect(r.palette).toEqual(["#ff0000"]);
    const all = processImport(
      src,
      settings({ width: 4, height: 4, resample: "nearest", alphaThreshold: 50 }),
    );
    expect(all.stats.filledCells).toBe(16);
  });

  it("cleanup removes an isolated speckle", () => {
    const src = raster(5, 5, (x, y) => (x === 2 && y === 2 ? BLUE : RED));
    const base = settings({ width: 5, height: 5, resample: "nearest", quantize: "exact" });
    expect(processImport(src, base).palette).toHaveLength(2);
    const cleaned = processImport(src, { ...base, cleanup: 1 });
    expect(cleaned.palette).toEqual(["#ff0000"]);
    expect(new Set(cleaned.cells)).toEqual(new Set([1]));
  });

  it("cleanupSpeckles keeps pixels that have a same-colored neighbor", () => {
    const cells = Uint16Array.from([1, 1, 1, 1, 2, 2, 1, 1, 1]);
    expect(Array.from(cleanupSpeckles(cells, 3, 3, 2))).toEqual(Array.from(cells));
    const lone = Uint16Array.from([0, 0, 0, 0, 3, 0, 0, 0, 0]);
    expect(Array.from(cleanupSpeckles(lone, 3, 3, 1))).toEqual(Array.from(lone));
  });

  it("merges near-identical colors", () => {
    const src = raster(4, 1, (x) => (x < 2 ? [100, 100, 100, 255] : [101, 100, 100, 255]));
    const r = processImport(
      src,
      settings({ width: 4, height: 1, resample: "nearest", quantize: "exact" }),
    );
    expect(r.palette).toHaveLength(1);
    expect(r.stats.sourceColors).toBe(2);
  });

  it("orders palettes by lightness, frequency and hue", () => {
    const colors: RGBA[] = [
      [40, 40, 40, 255],
      [250, 250, 250, 255],
      [200, 30, 30, 255],
      [30, 30, 200, 255],
      [30, 200, 30, 255],
    ];
    // Column x has color x; the blue column is repeated so it is the most frequent.
    const src = raster(6, 2, (x) => colors[Math.min(x, 3)]!);
    const base = settings({ width: 6, height: 2, resample: "nearest", quantize: "exact" });

    const light = processImport(src, { ...base, paletteOrder: "lightness" });
    const ls = light.palette.map((h) => rgbToLab(hexToRgb(h))[0]);
    expect(ls).toEqual(ls.toSorted((a, b) => b - a));
    expect(light.palette[0]).toBe("#fafafa");

    const freq = processImport(src, { ...base, paletteOrder: "frequency" });
    expect(freq.palette[0]).toBe("#1e1ec8");

    const hue = processImport(
      raster(5, 1, (x) => colors[x]!),
      { ...base, width: 5, height: 1, paletteOrder: "hue" },
    );
    expect(hue.palette).toEqual(["#282828", "#fafafa", "#c81e1e", "#1ec81e", "#1e1ec8"]);
  });

  it("clamps the output size", () => {
    const r = processImport(noise(4, 4), settings({ width: 0, height: 9999, resample: "nearest" }));
    expect(r.width).toBe(1);
    expect(r.height).toBe(512);
  });
});

describe("processImport (3D)", () => {
  // 4×3 image, top row red, rest blue, with two transparent cells.
  const img = raster(4, 3, (x, y) =>
    (x === 0 && y === 2) || (x === 3 && y === 2)
      ? CLEAR
      : y === 0
        ? [255, 255, 255, 255]
        : [0, 0, 0, 255],
  );
  const base = settings({ width: 4, height: 3, resample: "nearest", quantize: "exact" });

  it("extrude stands the image upright", () => {
    const r = processImport(img, { ...base, shape: "extrude", depth: 3 });
    expect(r.kind).toBe("3d");
    expect([r.width, r.height, r.depth]).toEqual([4, 3, 3]);
    expect(r.cells).toHaveLength(36);
    expect(r.stats.filledCells).toBe(10 * 3);
    const at = (x: number, y: number, z: number) => r.cells[x + 4 * (y + 3 * z)]!;
    for (let z = 0; z < 3; z++) {
      expect(r.palette[at(1, 2, z) - 1]).toBe("#ffffff"); // image top row → highest y
      expect(r.palette[at(1, 0, z) - 1]).toBe("#000000");
      expect(at(0, 0, z)).toBe(0); // transparent bottom-left corner
    }
  });

  it("relief lays the image down with lightness-based heights", () => {
    const r = processImport(img, { ...base, shape: "relief", depth: 5 });
    expect([r.width, r.height, r.depth]).toEqual([4, 5, 3]);
    const at = (x: number, y: number, z: number) => r.cells[x + 4 * (y + 5 * z)]!;
    // Row 0 (white) → columns of height 5; rows 1–2 (black) → height 1.
    for (let y = 0; y < 5; y++) expect(at(1, y, 0)).not.toBe(0);
    expect(at(1, 0, 1)).not.toBe(0);
    expect(at(1, 1, 1)).toBe(0);
    expect(at(0, 0, 2)).toBe(0);
    expect(r.stats.filledCells).toBe(4 * 5 + 6 * 1);
  });

  it("face mode with shading gives distinct top / side / front colors", () => {
    const red = raster(2, 2, () => [200, 60, 60, 255]);
    const r = processImport(red, {
      ...base,
      width: 2,
      height: 2,
      shape: "extrude",
      depth: 2,
      numberMode: "face",
      faceShading: true,
    });
    expect(r.numberMode).toBe("face");
    expect(r.faceColors).toBeDefined();
    const faces = r.faceColors!;
    expect(faces).toHaveLength(r.cells.length * 6);
    const [px, , py, ny, pz, nz] = Array.from(faces.subarray(0, 6));
    expect(new Set([px, py, ny, pz]).size).toBe(4);
    expect(pz).toBe(nz);
    expect(r.cells[0]).toBe(pz);
    expect(r.palette).toHaveLength(4);
    const lightness = (i: number) => rgbToLab(hexToRgb(r.palette[i - 1]!))[0];
    expect(lightness(py!)).toBeGreaterThan(lightness(pz!));
    expect(lightness(ny!)).toBeLessThan(lightness(px!));
    expect(Math.max(...faces)).toBe(r.palette.length);
  });

  it("face mode marks faces of empty voxels as 0 and works without shading", () => {
    const r = processImport(img, {
      ...base,
      shape: "extrude",
      depth: 2,
      numberMode: "face",
      faceShading: false,
    });
    const faces = r.faceColors!;
    expect(faces).toHaveLength(r.cells.length * 6);
    for (let i = 0; i < r.cells.length; i++) {
      for (let f = 0; f < 6; f++) expect(faces[i * 6 + f]).toBe(r.cells[i]);
    }
    expect(r.palette).toHaveLength(2);
  });

  it("ignores face mode for flat output", () => {
    const r = processImport(img, { ...base, numberMode: "face" });
    expect(r.numberMode).toBe("voxel");
    expect(r.faceColors).toBeUndefined();
  });
});

describe("processImport (voxel source)", () => {
  const palette = Array.from({ length: 10 }, (_, i) => {
    const v = (i * 25).toString(16).padStart(2, "0");
    return `#${v}40${v}`;
  });
  const voxels = new Uint8Array(3 * 2 * 4);
  voxels.forEach((_, i) => {
    voxels[i] = i % 11; // includes empties (0) and all 10 colors
  });
  const source: VoxelSource = { type: "voxels", width: 3, height: 2, depth: 4, voxels, palette };

  it("keeps dimensions and colors when under the limit", () => {
    const r = processImport(source, settings({ colors: 16 }));
    expect([r.kind, r.width, r.height, r.depth]).toEqual(["3d", 3, 2, 4]);
    expect(r.stats.sourceColors).toBe(10);
    expect(r.stats.filledCells).toBe(voxels.filter((v) => v !== 0).length);
    const colorAt = (i: number) => r.palette[r.cells[i]! - 1] ?? null;
    const expected = Array.from(voxels, (v) => (v === 0 ? null : palette[v - 1]));
    expect(Array.from(voxels, (_, i) => colorAt(i))).toEqual(expected);
  });

  it("reduces colors when over the limit", () => {
    const r = processImport(source, settings({ colors: 3, quantize: "median-cut" }));
    expect(r.palette.length).toBeLessThanOrEqual(3);
    expect(r.stats.filledCells).toBe(voxels.filter((v) => v !== 0).length);
  });

  it("supports face mode", () => {
    const r = processImport(source, settings({ colors: 4, numberMode: "face" }));
    expect(r.faceColors).toHaveLength(r.cells.length * 6);
    const used = new Set(r.faceColors);
    used.delete(0);
    expect(used.size).toBe(r.palette.length);
  });
});

describe("performance", () => {
  it("1024×1024 → 128×128 k-means 32 runs quickly", () => {
    const src = noise(1024, 1024, 11);
    const r = processImport(
      src,
      settings({ width: 128, height: 128, colors: 32, quantize: "kmeans", resample: "dominant" }),
    );
    expect(r.palette.length).toBeLessThanOrEqual(32);
    expect(r.stats.ms).toBeLessThan(2000);
  });
});
