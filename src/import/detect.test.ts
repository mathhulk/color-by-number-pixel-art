import { describe, expect, it } from "vitest";

import { detectPixelScale, suggestSize } from "./detect";
import type { RasterSource } from "./types";

const COLORS = [
  [230, 30, 30],
  [30, 160, 60],
  [40, 70, 220],
  [250, 220, 40],
  [20, 20, 20],
  [240, 240, 240],
] as const;

/** A small w×h pixel-art image upscaled by `scale` with nearest neighbour. */
function upscaled(w: number, h: number, scale: number): RasterSource {
  const W = w * scale;
  const H = h * scale;
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const px = Math.floor(x / scale);
      const py = Math.floor(y / scale);
      const c = COLORS[(px * 2 + py * 3) % COLORS.length]!;
      data.set([c[0], c[1], c[2], 255], (y * W + x) * 4);
    }
  }
  return { type: "raster", width: W, height: H, data };
}

function noisy(w: number, h: number): RasterSource {
  const data = new Uint8ClampedArray(w * h * 4);
  let s = 12345;
  for (let i = 0; i < data.length; i++) {
    s = (Math.imul(s, 1103515245) + 12345) >>> 0;
    data[i] = i % 4 === 3 ? 255 : (s >>> 16) & 255;
  }
  return { type: "raster", width: w, height: h, data };
}

describe("detectPixelScale", () => {
  it("detects a 5×3 image upscaled ×4", () => {
    expect(detectPixelScale(upscaled(5, 3, 4))).toBe(4);
  });

  it("detects other scales", () => {
    expect(detectPixelScale(upscaled(16, 12, 3))).toBe(3);
    expect(detectPixelScale(upscaled(10, 10, 8))).toBe(8);
  });

  it("returns 1 for a noisy image", () => {
    expect(detectPixelScale(noisy(64, 48))).toBe(1);
  });

  it("returns 1 for an unscaled image and a flat image", () => {
    expect(detectPixelScale(upscaled(20, 20, 1))).toBe(1);
    const flat = new Uint8ClampedArray(16 * 16 * 4).fill(255);
    expect(detectPixelScale({ type: "raster", width: 16, height: 16, data: flat })).toBe(1);
  });
});

describe("suggestSize", () => {
  it("uses the detected pixel scale", () => {
    expect(suggestSize(upscaled(5, 3, 4))).toEqual({ width: 5, height: 3 });
  });

  it("fits the longest side otherwise", () => {
    expect(suggestSize(noisy(200, 100))).toEqual({ width: 64, height: 32 });
    expect(suggestSize(noisy(100, 300), 48)).toEqual({ width: 16, height: 48 });
    expect(suggestSize(noisy(20, 10))).toEqual({ width: 20, height: 10 });
  });
});
