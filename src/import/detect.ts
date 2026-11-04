import type { RasterSource } from "./types";

/** Mirrors MAX_RASTER_SIZE in pipeline.ts (kept local so this module stays tiny). */
const MAX_RASTER_SIZE = 512;
const OPAQUE_ALPHA = 128;
const MAX_SCALE = 64;
const MIN_RUNS = 4;
const AGREEMENT = 0.9;

/**
 * Detects upscaled pixel art. Collects horizontal and vertical runs of identical opaque colors
 * (runs touching the image edge are ignored since they may be cropped) and returns the largest
 * block size s in 2…64 for which ≥ 90 % of run length is made of runs whose length is a multiple
 * of s. Returns 1 when nothing is detected.
 */
export function detectPixelScale(src: RasterSource): number {
  const { width: w, height: h, data } = src;
  if (w < 2 || h < 2 || data.length < w * h * 4) return 1;
  const keyAt = (p: number) =>
    data[p + 3]! >= OPAQUE_ALPHA ? (data[p]! << 16) | (data[p + 1]! << 8) | data[p + 2]! : -1;

  // weight[len] = total pixels in runs of that length.
  const weight = new Float64Array(Math.max(w, h) + 1);
  let runs = 0;
  let total = 0;
  const addRun = (len: number) => {
    weight[len]! += len;
    total += len;
    runs++;
  };

  for (let y = 0; y < h; y++) {
    let x = 0;
    while (x < w) {
      const start = x;
      const k = keyAt((y * w + x) * 4);
      x++;
      while (x < w && keyAt((y * w + x) * 4) === k) x++;
      if (k >= 0 && start > 0 && x < w) addRun(x - start);
    }
  }
  for (let x = 0; x < w; x++) {
    let y = 0;
    while (y < h) {
      const start = y;
      const k = keyAt((y * w + x) * 4);
      y++;
      while (y < h && keyAt((y * w + x) * 4) === k) y++;
      if (k >= 0 && start > 0 && y < h) addRun(y - start);
    }
  }
  if (runs < MIN_RUNS || total <= 0) return 1;

  const maxS = Math.min(MAX_SCALE, w, h);
  for (let s = maxS; s >= 2; s--) {
    let agree = 0;
    for (let len = s; len < weight.length; len += s) agree += weight[len]!;
    if (agree >= AGREEMENT * total) return s;
  }
  return 1;
}

const fit = (v: number) => Math.min(MAX_RASTER_SIZE, Math.max(1, Math.round(v)));

/**
 * A sensible default output size: the native resolution of detected pixel art, otherwise the
 * image fitted so its longest side is at most `maxCells` (aspect preserved, never upscaled).
 */
export function suggestSize(src: RasterSource, maxCells = 64): { width: number; height: number } {
  const w = Math.max(1, src.width);
  const h = Math.max(1, src.height);
  const s = detectPixelScale(src);
  if (s > 1) return { width: fit(w / s), height: fit(h / s) };
  const longest = Math.max(w, h);
  const target = Math.min(Math.max(1, Math.floor(maxCells)), longest);
  const scale = target / longest;
  return { width: fit(w * scale), height: fit(h * scale) };
}
