import { describe, expect, it } from "vitest";

import { colorName, contrastRatio, hexToRgb, readableTextColor, rgbToHex } from "./color";
import { applyMatrix, IDENTITY, resolveAccent, visionMatrix } from "./cvd";

describe("color", () => {
  it("round-trips hex", () => {
    expect(rgbToHex(hexToRgb("#1a2b3c"))).toBe("#1a2b3c");
    expect(hexToRgb("#fff")).toEqual([255, 255, 255]);
  });

  it("picks readable text", () => {
    expect(readableTextColor([0, 0, 0])).toBe("#ffffff");
    expect(readableTextColor([255, 255, 0])).toBe("#111111");
    expect(contrastRatio([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 0);
  });

  it("names colors", () => {
    expect(colorName([255, 255, 255])).toBe("white");
    expect(colorName([0, 0, 0])).toBe("black");
    expect(colorName([20, 120, 40])).toContain("green");
    expect(colorName([30, 80, 220])).toContain("blue");
  });
});

describe("color vision", () => {
  it("is the identity when off", () => {
    expect(visionMatrix("deutan", "off")).toBe(IDENTITY);
    expect(visionMatrix("normal", "enhance")).toBe(IDENTITY);
  });

  it("makes red and green distinguishable when enhancing for deuteranopia", () => {
    const sim = visionMatrix("deutan", "simulate");
    const enh = visionMatrix("deutan", "enhance");
    const red: [number, number, number] = [200, 60, 50];
    const green: [number, number, number] = [80, 140, 40];
    const dist = (a: readonly number[], b: readonly number[]) =>
      Math.hypot(...a.map((v, i) => v - b[i]!));
    // Simulate what a deuteranope sees, before and after enhancement.
    const before = dist(applyMatrix(sim, red), applyMatrix(sim, green));
    const after = dist(
      applyMatrix(sim, applyMatrix(enh, red)),
      applyMatrix(sim, applyMatrix(enh, green)),
    );
    expect(after).toBeGreaterThan(before);
  });

  it("avoids green highlights for red/green deficiencies", () => {
    expect(resolveAccent("auto", "normal")).toBe("green");
    expect(resolveAccent("auto", "deutan")).toBe("blue");
    expect(resolveAccent("orange", "deutan")).toBe("orange");
  });
});
