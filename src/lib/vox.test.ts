import { describe, expect, it } from "vitest";

import { parseVox, writeVox } from "./vox";

function voxBytes(parts: (string | number[])[]): ArrayBuffer {
  const bytes: number[] = [];
  for (const p of parts) {
    if (typeof p === "string") for (const ch of p) bytes.push(ch.charCodeAt(0));
    else for (const n of p) bytes.push(n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255);
  }
  return new Uint8Array(bytes).buffer;
}

const colorOf = (pal: string[], v: number) => (v === 0 ? null : pal[v - 1]);

describe("vox", () => {
  it("round-trips dimensions, voxel positions and colors", () => {
    const width = 3;
    const height = 4;
    const depth = 5;
    const palette = ["#ff0000", "#00ff00", "#0000ff", "#123456"];
    const cells = new Uint16Array(width * height * depth);
    const set = (x: number, y: number, z: number, v: number) => {
      cells[x + width * (y + height * z)] = v;
    };
    set(0, 0, 0, 1);
    set(2, 3, 4, 2);
    set(1, 2, 0, 3);
    set(0, 3, 4, 2);
    set(2, 0, 3, 4);

    const parsed = parseVox(writeVox(width, height, depth, cells, palette));
    expect(parsed.type).toBe("voxels");
    expect([parsed.width, parsed.height, parsed.depth]).toEqual([width, height, depth]);
    expect(Array.from(parsed.voxels, (v) => colorOf(parsed.palette, v))).toEqual(
      Array.from(cells, (v) => colorOf(palette, v)),
    );
    expect(parsed.palette).toHaveLength(4);
  });

  it("compacts the palette to used colors", () => {
    const cells = Uint16Array.from([0, 3, 0, 3]);
    const parsed = parseVox(writeVox(2, 2, 1, cells, ["#111111", "#222222", "#333333"]));
    expect(parsed.palette).toEqual(["#333333"]);
    expect(Array.from(parsed.voxels)).toEqual([0, 1, 0, 1]);
  });

  it("maps MagicaVoxel Z-up to Y-up and skips unknown chunks", () => {
    // One voxel at vox (1, 2, 0) in a 2×3×1 model, color index 7, no RGBA chunk.
    const buf = voxBytes([
      "VOX ",
      [150],
      "MAIN",
      [0, 12 + 4 + 12 + 12 + 12 + 8],
      "NOTE",
      [4, 0, 0],
      "SIZE",
      [12, 0, 2, 3, 1],
      "XYZI",
      [8, 0, 1, 0x07_00_02_01],
    ]);
    const parsed = parseVox(buf);
    expect([parsed.width, parsed.height, parsed.depth]).toEqual([2, 1, 3]);
    // vox y=2 (of 3) → ours z = 3 - 1 - 2 = 0, keeping handedness: ours (x=1, y=0, z=0)
    expect(parsed.voxels[1]).toBe(1);
    expect(parsed.palette).toHaveLength(1);
    expect(parsed.palette[0]).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("throws on invalid buffers", () => {
    expect(() => parseVox(new ArrayBuffer(0))).toThrow(/VOX/);
    expect(() => parseVox(new TextEncoder().encode("hello world, not a vox").buffer)).toThrow(
      /VOX/,
    );
    expect(() => parseVox(voxBytes(["VOX ", [150], "MAIN", [0, 0]]))).toThrow(/SIZE/);
    expect(() =>
      parseVox(voxBytes(["VOX ", [150], "MAIN", [0, 24], "SIZE", [12, 0, 300, 1, 1]])),
    ).toThrow(/256/);
    expect(() => parseVox(voxBytes(["VOX ", [150], "MAIN", [0, 999]]))).toThrow(/truncated/);
  });

  it("maps colors beyond 255 to the nearest of the first 255", () => {
    const palette = Array.from(
      { length: 256 },
      (_, i) => `#${i.toString(16).padStart(2, "0")}0000`,
    );
    palette[255] = "#fe0001";
    const cells = Uint16Array.from([256, 1]);
    const parsed = parseVox(writeVox(2, 1, 1, cells, palette));
    expect(parsed.palette[parsed.voxels[0]! - 1]).toBe("#fe0000");
  });

  it("rejects models it cannot write", () => {
    expect(() => writeVox(300, 1, 1, new Uint16Array(300), ["#000000"])).toThrow(/256/);
  });
});
