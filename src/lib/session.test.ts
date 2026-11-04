import { describe, expect, it } from "vitest";

import type { Project } from "./project";
import { PlaySession } from "./session";
import { buildTargets, compactPalette } from "./targets";

function project2d(rows: string[]): Project {
  const width = rows[0]!.length;
  const height = rows.length;
  const cells = new Uint16Array(width * height);
  rows.forEach((row, y) => {
    for (let x = 0; x < width; x++) cells[x + y * width] = row[x] === "." ? 0 : Number(row[x]);
  });
  return {
    id: "t",
    name: "Test",
    kind: "2d",
    createdAt: 0,
    updatedAt: 0,
    width,
    height,
    depth: 1,
    palette: ["#ff0000", "#00ff00"],
    cells,
    numberMode: "voxel",
    filled: new Uint8Array(0),
  };
}

function cube(size: number, numberMode: "voxel" | "face" = "voxel"): Project {
  const cells = new Uint16Array(size ** 3).fill(1);
  const p: Project = {
    id: "c",
    name: "Cube",
    kind: "3d",
    createdAt: 0,
    updatedAt: 0,
    width: size,
    height: size,
    depth: size,
    palette: ["#ff0000", "#00ff00"],
    cells,
    numberMode,
    filled: new Uint8Array(0),
  };
  if (numberMode === "face") {
    p.faceColors = new Uint16Array(cells.length * 6).fill(1);
    // Top faces get color 2.
    for (let i = 0; i < cells.length; i++) p.faceColors[i * 6 + 2] = 2;
  }
  return p;
}

describe("PlaySession", () => {
  it("only fills cells of the selected color", () => {
    const s = new PlaySession(project2d(["12", "21"]));
    expect(s.total).toBe(4);
    expect(s.fill(0, 2)).toBe(false);
    expect(s.fill(0, 1)).toBe(true);
    expect(s.fill(0, 1)).toBe(false);
    expect(s.done).toBe(1);
    expect(s.colorDone[1]).toBe(1);
  });

  it("flood fills connected cells and undoes them as one step", () => {
    const s = new PlaySession(project2d(["111", "121", "111"]));
    expect(s.floodFill(0, 1)).toBe(8);
    expect(s.isColorComplete(1)).toBe(true);
    s.undo();
    expect(s.done).toBe(0);
    s.redo();
    expect(s.done).toBe(8);
  });

  it("groups a stroke into one undo entry and can cancel it", () => {
    const s = new PlaySession(project2d(["11", "11"]));
    s.beginStroke();
    s.fill(0, 1);
    s.fill(1, 1);
    s.endStroke();
    expect(s.getSnapshot().canUndo).toBe(true);
    s.undo();
    expect(s.done).toBe(0);
    s.beginStroke();
    s.fill(2, 1);
    s.cancelStroke();
    expect(s.done).toBe(0);
  });

  it("reports completion and resets", () => {
    const s = new PlaySession(project2d(["1.", ".2"]));
    s.fill(0, 1);
    s.fill(3, 2);
    expect(s.complete).toBe(true);
    expect(s.getSnapshot().complete).toBe(true);
    s.reset();
    expect(s.done).toBe(0);
  });

  it("finds the next incomplete color and unfilled cell", () => {
    const s = new PlaySession(project2d(["12", "22"]));
    s.fill(0, 1);
    expect(s.nextIncompleteColor(1)).toBe(2);
    expect(s.findUnfilled(2)).toBe(1);
    expect(s.findUnfilled(2, 1)).toBe(2);
  });
});

describe("3D targets", () => {
  it("skips hidden interior voxels", () => {
    const t = buildTargets(cube(3));
    // 27 voxels, only the center one is hidden.
    expect(t.total).toBe(26);
  });

  it("numbers each visible face in face mode", () => {
    const t = buildTargets(cube(2, "face"));
    expect(t.total).toBe(24);
    expect(t.colorTotals[2]).toBe(4);
  });

  it("flood fills across a face plane", () => {
    const s = new PlaySession(cube(3, "face"));
    // Voxel (x=0, y=2, z=0) has index 0 + 3 * 2 = 6; face 2 is +y.
    const top = s.targets.faceSlot![6 * 6 + 2]!;
    expect(s.floodFill(top, 2)).toBe(9);
  });

  it("drops palette colors that have nothing visible to fill", () => {
    const p = cube(3, "face");
    p.palette.push("#0000ff");
    // Color 3 only on a hidden face of the center voxel.
    p.faceColors![13 * 6] = 3;
    compactPalette(p);
    expect(p.palette).toEqual(["#ff0000", "#00ff00"]);
  });
});
