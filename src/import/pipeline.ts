/**
 * Image / voxel → color-by-number pipeline.
 *
 * Pure, synchronous and DOM-free so it can run in a Web Worker, on the main thread and in Vitest.
 *
 * Raster flow: adjustments → resample → alpha threshold → histogram → quantize → map (+ dither)
 * → speckle cleanup → palette finalize (drop unused, merge near-duplicates) → shape → number mode
 * → palette ordering.
 */
import {
  deltaE,
  hexToRgb,
  type Lab,
  type RGB,
  rgbToHex,
  rgbToHsl,
  rgbToLab,
  shadeRgb,
} from "../lib/color";
import type {
  ColorSpace,
  DitherMethod,
  ImportResult,
  ImportSettings,
  ImportSource,
  PaletteOrder,
  QuantizeMethod,
  RasterSource,
  ResampleMethod,
  VoxelSource,
} from "./types";

/** Maximum output width / height in cells for raster sources. */
export const MAX_RASTER_SIZE = 512;
/** Palette entries are numbered with at most three digits. */
export const MAX_PALETTE = 999;
/** Maximum voxel layers ("extrude") or column height ("relief"). */
export const MAX_DEPTH = 256;
/** Palette entries closer than this (CIE76 ΔE) are merged. */
export const MERGE_DELTA_E = 2.5;
/** Source pixels at or above this alpha count as opaque for "dominant" resampling. */
const OPAQUE_ALPHA = 128;

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const clampInt = (v: number, lo: number, hi: number) =>
  Number.isFinite(v) ? clamp(Math.round(v), lo, hi) : lo;
const toByte = (v: number) => (!(v > 0) ? 0 : v >= 255 ? 255 : Math.round(v));
const pack = (r: number, g: number, b: number) => (toByte(r) << 16) | (toByte(g) << 8) | toByte(b);
const unpack = (key: number): RGB => [(key >> 16) & 255, (key >> 8) & 255, key & 255];
const roundRgb = (c: RGB): RGB => [toByte(c[0]), toByte(c[1]), toByte(c[2])];

// ---------------------------------------------------------------------------------------------
// Fast sRGB byte → Lab (no allocation)
// ---------------------------------------------------------------------------------------------

const LINEAR = (() => {
  const t = new Float64Array(256);
  for (let i = 0; i < 256; i++) {
    const v = i / 255;
    t[i] = v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  }
  return t;
})();

const labF = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116);

/** Writes the Lab coordinates of the integer sRGB color (r, g, b) to out[o..o+2]. */
function labInto(r: number, g: number, b: number, out: Float64Array, o: number): void {
  const lr = LINEAR[r]!;
  const lg = LINEAR[g]!;
  const lb = LINEAR[b]!;
  const fx = labF((lr * 0.4124564 + lg * 0.3575761 + lb * 0.1804375) / 0.95047);
  const fy = labF(lr * 0.2126729 + lg * 0.7151522 + lb * 0.072175);
  const fz = labF((lr * 0.0193339 + lg * 0.119192 + lb * 0.9503041) / 1.08883);
  out[o] = 116 * fy - 16;
  out[o + 1] = 500 * (fx - fy);
  out[o + 2] = 200 * (fy - fz);
}

/** Small deterministic PRNG (mulberry32). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------------------------
// Adjustments
// ---------------------------------------------------------------------------------------------

/**
 * Brightness / contrast / saturation, each -100…100. Returns a new array (a plain copy when all
 * three are 0). Alpha is preserved.
 */
export function applyAdjustments(
  data: Uint8ClampedArray,
  brightness: number,
  contrast: number,
  saturation: number,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(data.length);
  const b = clamp(brightness || 0, -100, 100) * 2.55;
  const c = clamp(contrast || 0, -100, 100) * 2.55;
  const s = 1 + clamp(saturation || 0, -100, 100) / 100;
  if (b === 0 && c === 0 && s === 1) {
    out.set(data);
    return out;
  }
  const f = (259 * (c + 255)) / (255 * (259 - c));
  const lut = new Float32Array(256);
  for (let v = 0; v < 256; v++) lut[v] = f * (v + b - 128) + 128;
  for (let i = 0; i + 3 < data.length; i += 4) {
    let r = lut[data[i]!]!;
    let g = lut[data[i + 1]!]!;
    let bl = lut[data[i + 2]!]!;
    if (s !== 1) {
      const gray = 0.299 * r + 0.587 * g + 0.114 * bl;
      r = gray + (r - gray) * s;
      g = gray + (g - gray) * s;
      bl = gray + (bl - gray) * s;
    }
    out[i] = r;
    out[i + 1] = g;
    out[i + 2] = bl;
    out[i + 3] = data[i + 3]!;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Resampling
// ---------------------------------------------------------------------------------------------

/**
 * Resamples `src` to dw × dh cells. Returns straight (non-premultiplied) RGBA as floats 0–255.
 */
export function resample(
  src: RasterSource,
  dw: number,
  dh: number,
  method: ResampleMethod,
): Float32Array {
  const { width: sw, height: sh, data } = src;
  if (sw < 1 || sh < 1 || data.length < sw * sh * 4) {
    throw new Error(`Invalid raster: ${sw}×${sh} with ${data.length} bytes`);
  }
  dw = Math.max(1, Math.floor(dw));
  dh = Math.max(1, Math.floor(dh));
  const out = new Float32Array(dw * dh * 4);
  const sx = sw / dw;
  const sy = sh / dh;

  switch (method) {
    case "nearest": {
      for (let y = 0; y < dh; y++) {
        const j = Math.min(sh - 1, Math.floor((y + 0.5) * sy));
        for (let x = 0; x < dw; x++) {
          const i = Math.min(sw - 1, Math.floor((x + 0.5) * sx));
          const p = (j * sw + i) * 4;
          const o = (y * dw + x) * 4;
          out[o] = data[p]!;
          out[o + 1] = data[p + 1]!;
          out[o + 2] = data[p + 2]!;
          out[o + 3] = data[p + 3]!;
        }
      }
      return out;
    }
    case "bilinear": {
      for (let y = 0; y < dh; y++) {
        const v = clamp((y + 0.5) * sy - 0.5, 0, sh - 1);
        const j0 = Math.floor(v);
        const j1 = Math.min(j0 + 1, sh - 1);
        const fy = v - j0;
        for (let x = 0; x < dw; x++) {
          const u = clamp((x + 0.5) * sx - 0.5, 0, sw - 1);
          const i0 = Math.floor(u);
          const i1 = Math.min(i0 + 1, sw - 1);
          const fx = u - i0;
          let sa = 0;
          let sr = 0;
          let sg = 0;
          let sb = 0;
          let pr = 0;
          let pg = 0;
          let pb = 0;
          for (let k = 0; k < 4; k++) {
            const i = k & 1 ? i1 : i0;
            const j = k & 2 ? j1 : j0;
            const w = (k & 1 ? fx : 1 - fx) * (k & 2 ? fy : 1 - fy);
            if (w === 0) continue;
            const p = (j * sw + i) * 4;
            const r = data[p]!;
            const g = data[p + 1]!;
            const b = data[p + 2]!;
            const wa = w * data[p + 3]!;
            sa += wa;
            sr += r * wa;
            sg += g * wa;
            sb += b * wa;
            pr += r * w;
            pg += g * w;
            pb += b * w;
          }
          const o = (y * dw + x) * 4;
          if (sa > 0) {
            out[o] = sr / sa;
            out[o + 1] = sg / sa;
            out[o + 2] = sb / sa;
          } else {
            out[o] = pr;
            out[o + 1] = pg;
            out[o + 2] = pb;
          }
          out[o + 3] = sa;
        }
      }
      return out;
    }
    case "average":
    case "dominant": {
      const dominant = method === "dominant";
      const counts = dominant ? new Float64Array(32768) : null;
      const sumR = dominant ? new Float64Array(32768) : null;
      const sumG = dominant ? new Float64Array(32768) : null;
      const sumB = dominant ? new Float64Array(32768) : null;
      const touched = dominant ? new Int32Array(32768) : null;
      for (let y = 0; y < dh; y++) {
        const y0 = y * sy;
        const y1 = (y + 1) * sy;
        const j0 = Math.floor(y0);
        const j1 = Math.min(sh, Math.ceil(y1));
        for (let x = 0; x < dw; x++) {
          const x0 = x * sx;
          const x1 = (x + 1) * sx;
          const i0 = Math.floor(x0);
          const i1 = Math.min(sw, Math.ceil(x1));
          let total = 0;
          let sa = 0;
          let sr = 0;
          let sg = 0;
          let sb = 0;
          let pr = 0;
          let pg = 0;
          let pb = 0;
          let covered = 0;
          let nTouched = 0;
          for (let j = j0; j < j1; j++) {
            const wy = Math.min(j + 1, y1) - Math.max(j, y0);
            if (wy <= 0) continue;
            let p = (j * sw + i0) * 4;
            for (let i = i0; i < i1; i++, p += 4) {
              const w = (Math.min(i + 1, x1) - Math.max(i, x0)) * wy;
              if (w <= 0) continue;
              const r = data[p]!;
              const g = data[p + 1]!;
              const b = data[p + 2]!;
              const a = data[p + 3]!;
              total += w;
              pr += r * w;
              pg += g * w;
              pb += b * w;
              const wa = w * a;
              sa += wa;
              if (counts) {
                if (a >= OPAQUE_ALPHA) {
                  const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
                  if (counts[key] === 0) touched![nTouched++] = key;
                  counts[key]! += w;
                  sumR![key]! += r * w;
                  sumG![key]! += g * w;
                  sumB![key]! += b * w;
                  covered += w;
                }
              } else {
                sr += r * wa;
                sg += g * wa;
                sb += b * wa;
              }
            }
          }
          const o = (y * dw + x) * 4;
          if (total <= 0) continue;
          if (counts) {
            if (covered > 0) {
              let best = touched![0]!;
              let bestW = -1;
              for (let t = 0; t < nTouched; t++) {
                const key = touched![t]!;
                const w = counts[key]!;
                if (w > bestW) {
                  bestW = w;
                  best = key;
                }
              }
              out[o] = sumR![best]! / bestW;
              out[o + 1] = sumG![best]! / bestW;
              out[o + 2] = sumB![best]! / bestW;
              out[o + 3] = (covered / total) * 255;
              for (let t = 0; t < nTouched; t++) {
                const key = touched![t]!;
                counts[key] = 0;
                sumR![key] = 0;
                sumG![key] = 0;
                sumB![key] = 0;
              }
            } else {
              out[o] = pr / total;
              out[o + 1] = pg / total;
              out[o + 2] = pb / total;
              out[o + 3] = sa / total;
            }
          } else {
            if (sa > 0) {
              out[o] = sr / sa;
              out[o + 1] = sg / sa;
              out[o + 2] = sb / sa;
            } else {
              out[o] = pr / total;
              out[o + 1] = pg / total;
              out[o + 2] = pb / total;
            }
            out[o + 3] = sa / total;
          }
        }
      }
      return out;
    }
    default: {
      const never: never = method;
      throw new Error(`Unknown resample method: ${String(never)}`);
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Histogram & quantizers
// ---------------------------------------------------------------------------------------------

/** Weighted set of unique colors. */
export interface ColorHistogram {
  /** Packed 0xRRGGBB per unique color. */
  keys: Int32Array;
  /** Weight (usually a cell count) per unique color. */
  weights: Float64Array;
}

function histogramFromMap(map: Map<number, number>): ColorHistogram {
  const keys = new Int32Array(map.size);
  const weights = new Float64Array(map.size);
  let i = 0;
  for (const [key, w] of map) {
    keys[i] = key;
    weights[i] = w;
    i++;
  }
  return { keys, weights };
}

/** Histogram of the (byte-rounded) colors of the filled cells. `rgb` holds 3 floats per cell. */
export function buildHistogram(rgb: Float32Array, filled: Uint8Array): ColorHistogram {
  const map = new Map<number, number>();
  for (let i = 0; i < filled.length; i++) {
    if (!filled[i]) continue;
    const key = pack(rgb[i * 3]!, rgb[i * 3 + 1]!, rgb[i * 3 + 2]!);
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return histogramFromMap(map);
}

/** Histogram from explicit colors and weights (entries with weight ≤ 0 are skipped). */
export function histogramFromColors(
  colors: readonly RGB[],
  weights: ArrayLike<number>,
): ColorHistogram {
  const map = new Map<number, number>();
  colors.forEach((c, i) => {
    const w = weights[i] ?? 0;
    if (w <= 0) return;
    const key = pack(c[0], c[1], c[2]);
    map.set(key, (map.get(key) ?? 0) + w);
  });
  return histogramFromMap(map);
}

function uniqueColors(hist: ColorHistogram): RGB[] {
  return Array.from(hist.keys, unpack);
}

/** All unique colors when there are at most `k`; otherwise k-means with an explanatory note. */
export function quantizeExact(
  hist: ColorHistogram,
  k: number,
  colorSpace: ColorSpace,
): { palette: RGB[]; note?: string } {
  const n = hist.keys.length;
  if (n <= k) return { palette: uniqueColors(hist) };
  return {
    palette: quantizeKMeans(hist, k, colorSpace),
    note: `Image has ${n} colors; reduced to ${k} with k-means`,
  };
}

/** Above this many unique colors, k-means clusters 15-bit bins (weighted bin means) instead. */
const MAX_CLUSTER_POINTS = 32768;

/** Points for clustering: the unique colors, or 5-bit-per-channel bin means for huge histograms. */
function clusterPoints(hist: ColorHistogram): { rgb: Float64Array; weights: Float64Array } {
  const { keys, weights } = hist;
  const n = keys.length;
  if (n <= MAX_CLUSTER_POINTS) {
    const rgb = new Float64Array(n * 3);
    for (let i = 0; i < n; i++) {
      const key = keys[i]!;
      rgb[i * 3] = (key >> 16) & 255;
      rgb[i * 3 + 1] = (key >> 8) & 255;
      rgb[i * 3 + 2] = key & 255;
    }
    return { rgb, weights };
  }
  const binW = new Float64Array(32768);
  const binRgb = new Float64Array(32768 * 3);
  for (let i = 0; i < n; i++) {
    const key = keys[i]!;
    const r = (key >> 16) & 255;
    const g = (key >> 8) & 255;
    const b = key & 255;
    const w = weights[i]!;
    const bin = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    binW[bin]! += w;
    binRgb[bin * 3]! += r * w;
    binRgb[bin * 3 + 1]! += g * w;
    binRgb[bin * 3 + 2]! += b * w;
  }
  let m = 0;
  for (let bin = 0; bin < 32768; bin++) if (binW[bin]! > 0) m++;
  const rgb = new Float64Array(m * 3);
  const out = new Float64Array(m);
  for (let bin = 0, j = 0; bin < 32768; bin++) {
    const w = binW[bin]!;
    if (w <= 0) continue;
    out[j] = w;
    rgb[j * 3] = binRgb[bin * 3]! / w;
    rgb[j * 3 + 1] = binRgb[bin * 3 + 1]! / w;
    rgb[j * 3 + 2] = binRgb[bin * 3 + 2]! / w;
    j++;
  }
  return { rgb, weights: out };
}

/**
 * Weighted k-means (k-means++ seeding, fixed-seed PRNG → deterministic). Clusters in Lab or RGB;
 * each returned color is the weighted RGB mean of its cluster's members (always in gamut).
 */
export function quantizeKMeans(
  hist: ColorHistogram,
  k: number,
  colorSpace: ColorSpace,
  iterations = 12,
): RGB[] {
  k = Math.max(1, Math.floor(k));
  if (hist.keys.length <= k) return uniqueColors(hist);
  const { rgb, weights } = clusterPoints(hist);
  const n = weights.length;
  const pts = new Float64Array(n * 3);
  const lab = colorSpace === "lab";
  for (let i = 0; i < n; i++) {
    const r = rgb[i * 3]!;
    const g = rgb[i * 3 + 1]!;
    const b = rgb[i * 3 + 2]!;
    if (lab) labInto(toByte(r), toByte(g), toByte(b), pts, i * 3);
    else {
      pts[i * 3] = r;
      pts[i * 3 + 1] = g;
      pts[i * 3 + 2] = b;
    }
  }

  // k-means++ seeding.
  const rand = mulberry32(0x9e3779b9 ^ Math.imul(n, 2654435761) ^ (k << 16));
  const cent = new Float64Array(k * 3);
  const d2 = new Float64Array(n);
  let totalW = 0;
  for (let i = 0; i < n; i++) totalW += weights[i]!;
  let pick = n - 1;
  let target = rand() * totalW;
  for (let i = 0; i < n; i++) {
    target -= weights[i]!;
    if (target <= 0) {
      pick = i;
      break;
    }
  }
  cent[0] = pts[pick * 3]!;
  cent[1] = pts[pick * 3 + 1]!;
  cent[2] = pts[pick * 3 + 2]!;
  for (let i = 0; i < n; i++) {
    const dx = pts[i * 3]! - cent[0];
    const dy = pts[i * 3 + 1]! - cent[1];
    const dz = pts[i * 3 + 2]! - cent[2];
    d2[i] = dx * dx + dy * dy + dz * dz;
  }
  let kk = 1;
  while (kk < k) {
    let sum = 0;
    for (let i = 0; i < n; i++) sum += weights[i]! * d2[i]!;
    if (sum <= 0) break;
    target = rand() * sum;
    pick = n - 1;
    for (let i = 0; i < n; i++) {
      target -= weights[i]! * d2[i]!;
      if (target <= 0 && d2[i]! > 0) {
        pick = i;
        break;
      }
    }
    const c0 = pts[pick * 3]!;
    const c1 = pts[pick * 3 + 1]!;
    const c2 = pts[pick * 3 + 2]!;
    cent[kk * 3] = c0;
    cent[kk * 3 + 1] = c1;
    cent[kk * 3 + 2] = c2;
    kk++;
    for (let i = 0; i < n; i++) {
      const dx = pts[i * 3]! - c0;
      const dy = pts[i * 3 + 1]! - c1;
      const dz = pts[i * 3 + 2]! - c2;
      const d = dx * dx + dy * dy + dz * dz;
      if (d < d2[i]!) d2[i] = d;
    }
  }

  // Lloyd iterations.
  const assign = new Int32Array(n).fill(-1);
  const sums = new Float64Array(kk * 3);
  const cw = new Float64Array(kk);
  for (let iter = 0; iter < iterations; iter++) {
    let changed = 0;
    for (let i = 0; i < n; i++) {
      const x = pts[i * 3]!;
      const y = pts[i * 3 + 1]!;
      const z = pts[i * 3 + 2]!;
      let best = 0;
      let bestD = Infinity;
      for (let c = 0, o = 0; c < kk; c++, o += 3) {
        const dx = x - cent[o]!;
        const dy = y - cent[o + 1]!;
        const dz = z - cent[o + 2]!;
        const d = dx * dx + dy * dy + dz * dz;
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
      if (assign[i] !== best) {
        assign[i] = best;
        changed++;
      }
    }
    if (changed === 0) break;
    sums.fill(0);
    cw.fill(0);
    for (let i = 0; i < n; i++) {
      const c = assign[i]!;
      const w = weights[i]!;
      cw[c]! += w;
      sums[c * 3]! += pts[i * 3]! * w;
      sums[c * 3 + 1]! += pts[i * 3 + 1]! * w;
      sums[c * 3 + 2]! += pts[i * 3 + 2]! * w;
    }
    for (let c = 0; c < kk; c++) {
      const w = cw[c]!;
      if (w <= 0) continue;
      cent[c * 3] = sums[c * 3]! / w;
      cent[c * 3 + 1] = sums[c * 3 + 1]! / w;
      cent[c * 3 + 2] = sums[c * 3 + 2]! / w;
    }
  }

  // Weighted RGB mean per cluster.
  sums.fill(0);
  cw.fill(0);
  for (let i = 0; i < n; i++) {
    const c = assign[i]!;
    const w = weights[i]!;
    cw[c]! += w;
    sums[c * 3]! += rgb[i * 3]! * w;
    sums[c * 3 + 1]! += rgb[i * 3 + 1]! * w;
    sums[c * 3 + 2]! += rgb[i * 3 + 2]! * w;
  }
  const palette: RGB[] = [];
  for (let c = 0; c < kk; c++) {
    const w = cw[c]!;
    if (w > 0) palette.push([sums[c * 3]! / w, sums[c * 3 + 1]! / w, sums[c * 3 + 2]! / w]);
  }
  return palette;
}

/** Median cut in RGB: repeatedly split the box with the largest weighted SSE at its weighted median. */
export function quantizeMedianCut(hist: ColorHistogram, k: number): RGB[] {
  const n = hist.keys.length;
  k = Math.max(1, Math.floor(k));
  if (n <= k) return uniqueColors(hist);
  const { keys, weights } = hist;
  const col = new Uint8Array(n * 3);
  for (let i = 0; i < n; i++) {
    const key = keys[i]!;
    col[i * 3] = (key >> 16) & 255;
    col[i * 3 + 1] = (key >> 8) & 255;
    col[i * 3 + 2] = key & 255;
  }
  const idx = new Int32Array(n);
  for (let i = 0; i < n; i++) idx[i] = i;
  const scratch = new Int32Array(n);
  const bucket = new Int32Array(257);

  interface Box {
    start: number;
    end: number;
    sse: number;
    channel: number;
    mean: RGB;
  }
  const makeBox = (start: number, end: number): Box => {
    let w = 0;
    const s = [0, 0, 0];
    const s2 = [0, 0, 0];
    for (let t = start; t < end; t++) {
      const i = idx[t]!;
      const wi = weights[i]!;
      w += wi;
      for (let ch = 0; ch < 3; ch++) {
        const v = col[i * 3 + ch]!;
        s[ch]! += v * wi;
        s2[ch]! += v * v * wi;
      }
    }
    let sse = 0;
    let channel = 0;
    let bestVar = -1;
    const mean: number[] = [0, 0, 0];
    for (let ch = 0; ch < 3; ch++) {
      const m = w > 0 ? s[ch]! / w : 0;
      mean[ch] = m;
      const v = Math.max(0, s2[ch]! - m * s[ch]!);
      sse += v;
      if (v > bestVar) {
        bestVar = v;
        channel = ch;
      }
    }
    return {
      start,
      end,
      sse: end - start > 1 ? sse : 0,
      channel,
      mean: [mean[0]!, mean[1]!, mean[2]!],
    };
  };

  const boxes: Box[] = [makeBox(0, n)];
  while (boxes.length < k) {
    let bi = -1;
    let bestSse = 0;
    for (let b = 0; b < boxes.length; b++) {
      const box = boxes[b]!;
      if (box.sse > bestSse) {
        bestSse = box.sse;
        bi = b;
      }
    }
    if (bi < 0) break;
    const box = boxes[bi]!;
    const ch = box.channel;
    // Counting sort of the box along `ch` (values are bytes).
    bucket.fill(0);
    for (let t = box.start; t < box.end; t++) bucket[col[idx[t]! * 3 + ch]! + 1]!++;
    for (let v = 1; v <= 256; v++) bucket[v]! += bucket[v - 1]!;
    for (let t = box.start; t < box.end; t++) {
      const i = idx[t]!;
      scratch[bucket[col[i * 3 + ch]!]!++] = i;
    }
    idx.set(scratch.subarray(0, box.end - box.start), box.start);
    let half = 0;
    for (let t = box.start; t < box.end; t++) half += weights[idx[t]!]!;
    half /= 2;
    let acc = 0;
    let split = box.start + 1;
    for (let t = box.start; t < box.end; t++) {
      acc += weights[idx[t]!]!;
      if (acc >= half) {
        split = t + 1;
        break;
      }
    }
    split = clamp(split, box.start + 1, box.end - 1);
    boxes.splice(bi, 1, makeBox(box.start, split), makeBox(split, box.end));
  }
  return boxes.map((b) => b.mean);
}

interface OctNode {
  r: number;
  g: number;
  b: number;
  w: number;
  children: (OctNode | undefined)[] | null;
}

/** Classic octree color reduction (Gervautz–Purgathofer), reducing during insertion. */
export function quantizeOctree(hist: ColorHistogram, k: number): RGB[] {
  const n = hist.keys.length;
  k = Math.max(1, Math.floor(k));
  if (n <= k) return uniqueColors(hist);
  const MAX_LEVEL = 8;
  const reducible: OctNode[][] = Array.from({ length: MAX_LEVEL }, () => []);
  let leafCount = 0;
  const create = (level: number): OctNode => {
    const leaf = level >= MAX_LEVEL;
    const node: OctNode = { r: 0, g: 0, b: 0, w: 0, children: leaf ? null : [] };
    if (leaf) leafCount++;
    else reducible[level]!.push(node);
    return node;
  };
  const root = create(0);

  const reduce = () => {
    let level = MAX_LEVEL - 1;
    while (level > 0 && reducible[level]!.length === 0) level--;
    const list = reducible[level]!;
    if (list.length === 0) return false;
    // The deepest internal nodes only have leaf children; merge the lightest one.
    let bi = 0;
    let bestW = Infinity;
    for (let i = 0; i < list.length; i++) {
      let w = 0;
      for (const c of list[i]!.children ?? []) if (c) w += c.w;
      if (w < bestW) {
        bestW = w;
        bi = i;
      }
    }
    const node = list[bi]!;
    list[bi] = list[list.length - 1]!;
    list.pop();
    let merged = 0;
    for (const c of node.children ?? []) {
      if (!c) continue;
      node.r += c.r;
      node.g += c.g;
      node.b += c.b;
      node.w += c.w;
      merged++;
    }
    node.children = null;
    leafCount -= merged - 1;
    return true;
  };

  const { keys, weights } = hist;
  for (let i = 0; i < n; i++) {
    const key = keys[i]!;
    const r = (key >> 16) & 255;
    const g = (key >> 8) & 255;
    const b = key & 255;
    const w = weights[i]!;
    let node = root;
    let level = 0;
    while (node.children) {
      const shift = 7 - level;
      const ci = (((r >> shift) & 1) << 2) | (((g >> shift) & 1) << 1) | ((b >> shift) & 1);
      let child = node.children[ci];
      if (!child) {
        child = create(level + 1);
        node.children[ci] = child;
      }
      node = child;
      level++;
    }
    node.r += r * w;
    node.g += g * w;
    node.b += b * w;
    node.w += w;
    for (;;) {
      if (leafCount <= k || !reduce()) break;
    }
  }

  const palette: RGB[] = [];
  const stack: OctNode[] = [root];
  while (stack.length) {
    const node = stack.pop()!;
    if (node.children) {
      for (const c of node.children) if (c) stack.push(c);
    } else if (node.w > 0) {
      palette.push([node.r / node.w, node.g / node.w, node.b / node.w]);
    }
  }
  return palette;
}

/** Dispatches to the chosen quantizer. The returned palette has at most `k` byte-rounded colors. */
export function quantize(
  hist: ColorHistogram,
  k: number,
  method: QuantizeMethod,
  colorSpace: ColorSpace,
): { palette: RGB[]; note?: string } {
  k = clampInt(k, 1, MAX_PALETTE);
  let result: { palette: RGB[]; note?: string };
  switch (method) {
    case "exact":
      result = quantizeExact(hist, k, colorSpace);
      break;
    case "median-cut":
      result = { palette: quantizeMedianCut(hist, k) };
      break;
    case "kmeans":
      result = { palette: quantizeKMeans(hist, k, colorSpace) };
      break;
    case "octree":
      result = { palette: quantizeOctree(hist, k) };
      break;
    default: {
      const never: never = method;
      throw new Error(`Unknown quantize method: ${String(never)}`);
    }
  }
  result.palette = result.palette.slice(0, k).map(roundRgb);
  return result;
}

// ---------------------------------------------------------------------------------------------
// Mapping & dithering
// ---------------------------------------------------------------------------------------------

/** Returns a cached nearest-color lookup: (r, g, b) floats → 0-based palette index. */
export function createMatcher(
  palette: readonly RGB[],
  colorSpace: ColorSpace,
): (r: number, g: number, b: number) => number {
  const k = palette.length;
  const lab = colorSpace === "lab";
  const coords = new Float64Array(k * 3);
  palette.forEach((c, i) => {
    const r = toByte(c[0]);
    const g = toByte(c[1]);
    const b = toByte(c[2]);
    if (lab) labInto(r, g, b, coords, i * 3);
    else coords.set([r, g, b], i * 3);
  });
  const cache = new Map<number, number>();
  const tmp = new Float64Array(3);
  return (r, g, b) => {
    const rb = toByte(r);
    const gb = toByte(g);
    const bb = toByte(b);
    const key = (rb << 16) | (gb << 8) | bb;
    const hit = cache.get(key);
    if (hit !== undefined) return hit;
    let x = rb;
    let y = gb;
    let z = bb;
    if (lab) {
      labInto(rb, gb, bb, tmp, 0);
      x = tmp[0]!;
      y = tmp[1]!;
      z = tmp[2]!;
    }
    let best = 0;
    let bestD = Infinity;
    for (let i = 0, o = 0; i < k; i++, o += 3) {
      const dx = x - coords[o]!;
      const dy = y - coords[o + 1]!;
      const dz = z - coords[o + 2]!;
      const d = dx * dx + dy * dy + dz * dz;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    cache.set(key, best);
    return best;
  };
}

type Kernel = ReadonlyArray<readonly [dx: number, dy: number, weight: number]>;
const FLOYD_STEINBERG: Kernel = [
  [1, 0, 7 / 16],
  [-1, 1, 3 / 16],
  [0, 1, 5 / 16],
  [1, 1, 1 / 16],
];
const ATKINSON: Kernel = [
  [1, 0, 1 / 8],
  [2, 0, 1 / 8],
  [-1, 1, 1 / 8],
  [0, 1, 1 / 8],
  [1, 1, 1 / 8],
  [0, 2, 1 / 8],
];
const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const BAYER_STRENGTH = 32;

/**
 * Maps each filled cell to its nearest palette color (with optional dithering).
 * Returns 1-based palette indices, 0 for empty cells.
 */
export function mapToPalette(
  rgb: Float32Array,
  filled: Uint8Array,
  width: number,
  height: number,
  palette: readonly RGB[],
  colorSpace: ColorSpace,
  dither: DitherMethod,
): Uint16Array {
  const n = width * height;
  const out = new Uint16Array(n);
  if (palette.length === 0) return out;
  const match = createMatcher(palette, colorSpace);
  switch (dither) {
    case "none":
    case "bayer": {
      const bayer = dither === "bayer";
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const i = y * width + x;
          if (!filled[i]) continue;
          const off = bayer
            ? ((BAYER4[(y & 3) * 4 + (x & 3)]! + 0.5) / 16 - 0.5) * BAYER_STRENGTH
            : 0;
          out[i] = match(rgb[i * 3]! + off, rgb[i * 3 + 1]! + off, rgb[i * 3 + 2]! + off) + 1;
        }
      }
      return out;
    }
    case "floyd-steinberg":
    case "atkinson": {
      const kernel = dither === "atkinson" ? ATKINSON : FLOYD_STEINBERG;
      const buf = rgb.slice(0, n * 3);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const i = y * width + x;
          if (!filled[i]) continue;
          const r = clamp(buf[i * 3]!, 0, 255);
          const g = clamp(buf[i * 3 + 1]!, 0, 255);
          const b = clamp(buf[i * 3 + 2]!, 0, 255);
          const p = match(r, g, b);
          out[i] = p + 1;
          const c = palette[p]!;
          const er = r - c[0];
          const eg = g - c[1];
          const eb = b - c[2];
          if (er === 0 && eg === 0 && eb === 0) continue;
          for (const [dx, dy, w] of kernel) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || nx >= width || ny >= height) continue;
            const j = ny * width + nx;
            if (!filled[j]) continue;
            buf[j * 3]! += er * w;
            buf[j * 3 + 1]! += eg * w;
            buf[j * 3 + 2]! += eb * w;
          }
        }
      }
      return out;
    }
    default: {
      const never: never = dither;
      throw new Error(`Unknown dither method: ${String(never)}`);
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------------------------

/**
 * Speckle removal: a filled cell none of whose 8 neighbors share its value is replaced with the
 * most common non-empty neighbor value. Each pass reads the previous pass's grid. Returns a new array.
 */
export function cleanupSpeckles(
  cells: Uint16Array,
  width: number,
  height: number,
  passes: number,
): Uint16Array {
  let cur = cells.slice();
  passes = clampInt(passes, 0, 16);
  const vals = new Uint16Array(8);
  const cnts = new Uint8Array(8);
  for (let pass = 0; pass < passes; pass++) {
    const next = cur.slice();
    let changes = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        const v = cur[i]!;
        if (v === 0) continue;
        let same = false;
        let nv = 0;
        for (let dy = -1; dy <= 1 && !same; dy++) {
          const ny = y + dy;
          if (ny < 0 || ny >= height) continue;
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = x + dx;
            if (nx < 0 || nx >= width) continue;
            const u = cur[ny * width + nx]!;
            if (u === 0) continue;
            if (u === v) {
              same = true;
              break;
            }
            let k = 0;
            while (k < nv && vals[k] !== u) k++;
            if (k === nv) {
              vals[nv] = u;
              cnts[nv] = 1;
              nv++;
            } else cnts[k]!++;
          }
        }
        if (same || nv === 0) continue;
        let best = 0;
        for (let k = 1; k < nv; k++) if (cnts[k]! > cnts[best]!) best = k;
        next[i] = vals[best]!;
        changes++;
      }
    }
    cur = next;
    if (changes === 0) break;
  }
  return cur;
}

// ---------------------------------------------------------------------------------------------
// Palette finalization
// ---------------------------------------------------------------------------------------------

/** Usage count per 0-based palette index for 1-based cell values. */
export function countUsage(cells: ArrayLike<number>, paletteLength: number): Float64Array {
  const counts = new Float64Array(paletteLength);
  for (let i = 0; i < cells.length; i++) {
    const v = cells[i]!;
    if (v > 0 && v <= paletteLength) counts[v - 1]!++;
  }
  return counts;
}

/**
 * Drops unused entries, merges entries closer than ΔE 2.5 into the more used one, caps the size
 * at `cap` (extras map to the nearest kept color) and sorts by `order`.
 * `remap[oldOneBased]` is the new 1-based index (`remap[0] === 0`).
 */
export function finalizePalette(
  colors: readonly RGB[],
  counts: ArrayLike<number>,
  order: PaletteOrder,
  cap = MAX_PALETTE,
): { palette: RGB[]; remap: Uint16Array } {
  const used: number[] = [];
  for (let i = 0; i < colors.length; i++) if ((counts[i] ?? 0) > 0) used.push(i);
  used.sort((a, b) => counts[b]! - counts[a]! || a - b);

  interface Entry {
    rgb: RGB;
    lab: Lab;
    count: number;
    first: number;
  }
  const kept: Entry[] = [];
  const target = new Int32Array(colors.length).fill(-1);
  for (const i of used) {
    const rgb = roundRgb(colors[i]!);
    const lab = rgbToLab(rgb);
    let best = -1;
    let bestD = Infinity;
    for (let k = 0; k < kept.length; k++) {
      const d = deltaE(lab, kept[k]!.lab);
      if (d < bestD) {
        bestD = d;
        best = k;
      }
    }
    if (best >= 0 && (bestD < MERGE_DELTA_E || kept.length >= cap)) {
      kept[best]!.count += counts[i]!;
      target[i] = best;
    } else {
      target[i] = kept.length;
      kept.push({ rgb, lab, count: counts[i]!, first: kept.length });
    }
  }

  const sorted = kept.slice();
  switch (order) {
    case "frequency":
      sorted.sort((a, b) => b.count - a.count || a.first - b.first);
      break;
    case "lightness":
      sorted.sort((a, b) => b.lab[0] - a.lab[0] || a.first - b.first);
      break;
    case "hue": {
      // Near-grays first (dark → light), then chromatic colors by hue, then lightness.
      const key = (e: Entry) => {
        const chroma = Math.hypot(e.lab[1], e.lab[2]);
        const gray = chroma < 8;
        return { gray, hue: gray ? 0 : rgbToHsl(e.rgb)[0], l: e.lab[0] };
      };
      const keys = new Map(sorted.map((e) => [e, key(e)]));
      sorted.sort((a, b) => {
        const ka = keys.get(a)!;
        const kb = keys.get(b)!;
        if (ka.gray !== kb.gray) return ka.gray ? -1 : 1;
        if (ka.gray) return ka.l - kb.l || a.first - b.first;
        return ka.hue - kb.hue || ka.l - kb.l || a.first - b.first;
      });
      break;
    }
    default: {
      const never: never = order;
      throw new Error(`Unknown palette order: ${String(never)}`);
    }
  }
  const rank = new Int32Array(kept.length);
  sorted.forEach((e, i) => {
    rank[e.first] = i;
  });
  const remap = new Uint16Array(colors.length + 1);
  for (let i = 0; i < colors.length; i++) {
    const t = target[i]!;
    remap[i + 1] = t >= 0 ? rank[t]! + 1 : 0;
  }
  return { palette: sorted.map((e) => e.rgb), remap };
}

function applyRemap(cells: Uint16Array, remap: Uint16Array): void {
  for (let i = 0; i < cells.length; i++) {
    const v = cells[i]!;
    if (v !== 0) cells[i] = remap[v] ?? 0;
  }
}

/** Finalizes the palette for `cells` (and optional face colors) in place and returns it. */
function finalizeInPlace(
  palette: readonly RGB[],
  cells: Uint16Array,
  order: PaletteOrder,
  counts: ArrayLike<number> = countUsage(cells, palette.length),
): RGB[] {
  const fin = finalizePalette(palette, counts, order);
  applyRemap(cells, fin.remap);
  return fin.palette;
}

// ---------------------------------------------------------------------------------------------
// Shapes & number modes
// ---------------------------------------------------------------------------------------------

export interface Grid {
  kind: "2d" | "3d";
  width: number;
  height: number;
  depth: number;
  cells: Uint16Array;
}

/** Image upright, facing +z: cell (x, y) → voxels (x, H-1-y, z) for z in [0, depth). */
export function extrude(cells2d: Uint16Array, width: number, height: number, depth: number): Grid {
  const cells = new Uint16Array(width * height * depth);
  const layer = width * height;
  for (let y = 0; y < height; y++) {
    const row = (height - 1 - y) * width;
    for (let x = 0; x < width; x++) {
      const v = cells2d[y * width + x]!;
      if (v === 0) continue;
      for (let z = 0; z < depth; z++) cells[x + row + layer * z] = v;
    }
  }
  return { kind: "3d", width, height, depth, cells };
}

/**
 * Image on the ground plane: cell (x, y) → column at (x, z = y) whose height is
 * 1 + round(L/100 · (maxHeight − 1)) with L the Lab lightness of the cell's color.
 */
export function relief(
  cells2d: Uint16Array,
  width: number,
  height: number,
  maxHeight: number,
  palette: readonly RGB[],
): Grid {
  const H = maxHeight;
  const D = height;
  const cells = new Uint16Array(width * H * D);
  const heights = palette.map((c) => 1 + Math.round(clamp(rgbToLab(c)[0] / 100, 0, 1) * (H - 1)));
  for (let z = 0; z < D; z++) {
    for (let x = 0; x < width; x++) {
      const v = cells2d[z * width + x]!;
      if (v === 0) continue;
      const h = heights[v - 1] ?? 1;
      for (let y = 0; y < h; y++) cells[x + width * (y + H * z)] = v;
    }
  }
  return { kind: "3d", width, height: H, depth: D, cells };
}

/** Shade applied per face: 0:+x 1:-x 2:+y 3:-y 4:+z 5:-z. Variant 0 is the unshaded base. */
const FACE_VARIANT = [3, 3, 1, 2, 0, 0] as const;
const VARIANT_SHADE = [0, 0.18, -0.3, -0.12] as const;

/**
 * Builds per-face colors and a new palette. With shading, each palette color gets a lit (+y),
 * dark (-y) and side (±x) variant; `cells` is remapped to the base (±z) variant.
 */
function buildFaceColors(
  palette: readonly RGB[],
  cells: Uint16Array,
  shading: boolean,
  order: PaletteOrder,
): { palette: RGB[]; faceColors: Uint16Array } {
  const n = cells.length;
  const faceColors = new Uint16Array(n * 6);
  if (!shading) {
    for (let i = 0; i < n; i++) {
      const v = cells[i]!;
      if (v !== 0) faceColors.fill(v, i * 6, i * 6 + 6);
    }
    return { palette: palette.slice(), faceColors };
  }
  const variants: RGB[] = [];
  for (const c of palette) {
    for (const amount of VARIANT_SHADE) variants.push(roundRgb(shadeRgb(c, amount)));
  }
  for (let i = 0; i < n; i++) {
    const v = cells[i]!;
    if (v === 0) continue;
    const base = (v - 1) * 4 + 1;
    for (let f = 0; f < 6; f++) faceColors[i * 6 + f] = base + FACE_VARIANT[f]!;
    cells[i] = base;
  }
  const fin = finalizePalette(variants, countUsage(faceColors, variants.length), order);
  applyRemap(faceColors, fin.remap);
  applyRemap(cells, fin.remap);
  return { palette: fin.palette, faceColors };
}

// ---------------------------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------------------------

interface Stage {
  grid: Grid;
  palette: RGB[];
  sourceColors: number;
  note?: string;
}

function rasterStage(src: RasterSource, s: ImportSettings): Stage {
  const W = clampInt(s.width, 1, MAX_RASTER_SIZE);
  const H = clampInt(s.height, 1, MAX_RASTER_SIZE);
  const adjusted =
    s.brightness || s.contrast || s.saturation
      ? applyAdjustments(src.data, s.brightness, s.contrast, s.saturation)
      : src.data;
  const rgba = resample({ ...src, data: adjusted }, W, H, s.resample);
  const n = W * H;
  const rgb = new Float32Array(n * 3);
  const filled = new Uint8Array(n);
  const threshold = s.alphaThreshold;
  for (let i = 0; i < n; i++) {
    rgb[i * 3] = rgba[i * 4]!;
    rgb[i * 3 + 1] = rgba[i * 4 + 1]!;
    rgb[i * 3 + 2] = rgba[i * 4 + 2]!;
    if (rgba[i * 4 + 3]! >= threshold) filled[i] = 1;
  }
  const hist = buildHistogram(rgb, filled);
  const { palette: quantized, note } = quantize(hist, s.colors, s.quantize, s.colorSpace);
  let cells = mapToPalette(rgb, filled, W, H, quantized, s.colorSpace, s.dither);
  if (s.cleanup > 0) cells = cleanupSpeckles(cells, W, H, s.cleanup);
  const palette = finalizeInPlace(quantized, cells, "frequency");

  const depth = clampInt(s.depth, 1, MAX_DEPTH);
  let grid: Grid;
  switch (s.shape) {
    case "flat":
      grid = { kind: "2d", width: W, height: H, depth: 1, cells };
      break;
    case "extrude":
      grid = extrude(cells, W, H, depth);
      break;
    case "relief":
      grid = relief(cells, W, H, depth, palette);
      break;
    default: {
      const never: never = s.shape;
      throw new Error(`Unknown output shape: ${String(never)}`);
    }
  }
  return { grid, palette, sourceColors: hist.keys.length, ...(note ? { note } : {}) };
}

function voxelStage(src: VoxelSource, s: ImportSettings): Stage {
  const { width, height, depth, voxels } = src;
  const n = width * height * depth;
  if (!(width >= 1 && height >= 1 && depth >= 1) || voxels.length < n) {
    throw new Error(
      `Invalid voxel model: ${width}×${height}×${depth} with ${voxels.length} voxels`,
    );
  }
  const srcPalette = src.palette.map(hexToRgb);
  const cells = new Uint16Array(n);
  for (let i = 0; i < n; i++) {
    const v = voxels[i]!;
    if (v > 0 && v <= srcPalette.length) cells[i] = v;
  }
  const usage = countUsage(cells, srcPalette.length);
  const hist = histogramFromColors(srcPalette, usage);
  const k = clampInt(s.colors, 1, MAX_PALETTE);
  let palette: RGB[] = srcPalette;
  let note: string | undefined;
  if (hist.keys.length > k) {
    const q = quantize(hist, k, s.quantize, s.colorSpace);
    note = q.note;
    const match = createMatcher(q.palette, s.colorSpace);
    const remap = new Uint16Array(srcPalette.length + 1);
    srcPalette.forEach((c, i) => {
      remap[i + 1] = match(c[0], c[1], c[2]) + 1;
    });
    applyRemap(cells, remap);
    palette = q.palette;
  }
  palette = finalizeInPlace(palette, cells, "frequency");
  return {
    grid: { kind: "3d", width, height, depth, cells },
    palette,
    sourceColors: hist.keys.length,
    ...(note ? { note } : {}),
  };
}

/** Runs the whole pipeline. Pure and synchronous. */
export function processImport(source: ImportSource, settings: ImportSettings): ImportResult {
  const t0 = performance.now();
  const stage =
    source.type === "raster" ? rasterStage(source, settings) : voxelStage(source, settings);
  const { grid } = stage;
  const cells = grid.cells;
  let palette: RGB[];
  let faceColors: Uint16Array | undefined;
  const faceMode = grid.kind === "3d" && settings.numberMode === "face";
  if (faceMode) {
    const faces = buildFaceColors(
      stage.palette,
      cells,
      settings.faceShading,
      settings.paletteOrder,
    );
    palette = faces.palette;
    faceColors = faces.faceColors;
    if (!settings.faceShading) {
      // Plain face mode: order by voxel usage, remapping both arrays.
      const fin = finalizePalette(
        palette,
        countUsage(cells, palette.length),
        settings.paletteOrder,
      );
      applyRemap(cells, fin.remap);
      applyRemap(faceColors, fin.remap);
      palette = fin.palette;
    }
  } else {
    palette = finalizeInPlace(stage.palette, cells, settings.paletteOrder);
  }

  let filledCells = 0;
  for (let i = 0; i < cells.length; i++) if (cells[i] !== 0) filledCells++;

  const result: ImportResult = {
    kind: grid.kind,
    width: grid.width,
    height: grid.height,
    depth: grid.depth,
    palette: palette.map((c) => rgbToHex(c)),
    cells,
    numberMode: faceMode ? "face" : "voxel",
    stats: {
      colors: palette.length,
      filledCells,
      sourceColors: stage.sourceColors,
      ms: 0,
    },
  };
  if (faceColors) result.faceColors = faceColors;
  if (stage.note) result.stats.note = stage.note;
  result.stats.ms = performance.now() - t0;
  return result;
}
