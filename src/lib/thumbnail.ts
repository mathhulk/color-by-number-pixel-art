import { hexToRgb, mixRgb, type RGB, shadeRgb } from "./color";
import type { Project } from "./project";
import { buildTargets, isFaceExposed, type Targets } from "./targets";

const PAPER: RGB = [244, 243, 240];

export interface PaintOptions {
  /** "progress" shows unfilled cells as pale paper, "complete" shows the finished art. */
  mode: "progress" | "complete";
}

function unfilledColor(c: RGB): RGB {
  return mixRgb(PAPER, c, 0.16);
}

/** Draws a 2D project at 1 pixel per cell. */
function paint2D(p: Project, mode: PaintOptions["mode"]): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = p.width;
  canvas.height = p.height;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(p.width, p.height);
  const palette = p.palette.map(hexToRgb);
  for (let i = 0; i < p.cells.length; i++) {
    const c = p.cells[i]!;
    if (c === 0) continue;
    const base = palette[c - 1]!;
    // In progress mode, squares painted the wrong color show that color.
    const wrong = mode === "progress" ? (p.mistakes?.[i] ?? 0) : 0;
    const rgb =
      mode === "complete" || p.filled[i] ? base : wrong ? palette[wrong - 1]! : unfilledColor(base);
    img.data[i * 4] = rgb[0];
    img.data[i * 4 + 1] = rgb[1];
    img.data[i * 4 + 2] = rgb[2];
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/** Isometric software render of a voxel project (no WebGL needed). */
function paint3D(
  p: Project,
  targets: Targets,
  mode: PaintOptions["mode"],
  size: number,
): HTMLCanvasElement {
  const { width: w, height: h, depth: d } = p;
  const palette = p.palette.map(hexToRgb);
  const cos = Math.cos(Math.PI / 6);
  const sin = 0.5;
  // Projected bounds of the grid box.
  const spanX = (w + d) * cos;
  const spanY = (w + d) * sin + h;
  const scale = (size * 0.9) / Math.max(spanX, spanY);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const ox = size / 2 - ((w - d) * cos * scale) / 2;
  const oy = (size - spanY * scale) / 2 + h * scale;

  const project = (x: number, y: number, z: number): [number, number] => [
    ox + (x - z) * cos * scale,
    oy + ((x + z) * sin - y) * scale,
  ];

  // Painter's order: far (low x+z, low y) to near.
  const order: number[] = [];
  for (let i = 0; i < p.cells.length; i++) if (p.cells[i]) order.push(i);
  const coords = (i: number) => [i % w, Math.floor(i / w) % h, Math.floor(i / (w * h))] as const;
  order.sort((a, b) => {
    const [ax, ay, az] = coords(a);
    const [bx, by, bz] = coords(b);
    return ax + az - (bx + bz) || ay - by;
  });

  // Visible faces from this view: +x, +y, +z.
  const shading = [-0.12, 0, 0.12, 0, -0.04, 0];
  const corners: Record<number, Array<[number, number, number]>> = {
    0: [
      [1, 0, 0],
      [1, 1, 0],
      [1, 1, 1],
      [1, 0, 1],
    ],
    2: [
      [0, 1, 0],
      [1, 1, 0],
      [1, 1, 1],
      [0, 1, 1],
    ],
    4: [
      [0, 0, 1],
      [1, 0, 1],
      [1, 1, 1],
      [0, 1, 1],
    ],
  };

  for (const i of order) {
    const [x, y, z] = coords(i);
    for (const f of [0, 4, 2]) {
      if (!isFaceExposed(p, x, y, z, f)) continue;
      const colorIndex =
        p.faceColors && p.numberMode === "face" ? p.faceColors[i * 6 + f]! : p.cells[i]!;
      if (colorIndex === 0) continue;
      let filled = mode === "complete";
      let wrong = 0;
      if (!filled) {
        const slot = targets.faceSlot
          ? targets.faceSlot[i * 6 + f]!
          : (targets.voxelSlot?.[i] ?? -1);
        filled = slot >= 0 && p.filled[slot] === 1;
        wrong = slot >= 0 ? (p.mistakes?.[slot] ?? 0) : 0;
      }
      const base = palette[colorIndex - 1]!;
      const shown = filled ? base : wrong ? palette[wrong - 1]! : unfilledColor(base);
      const rgb = shadeRgb(shown, shading[f]!);
      ctx.fillStyle = `rgb(${rgb[0] | 0} ${rgb[1] | 0} ${rgb[2] | 0})`;
      ctx.strokeStyle = ctx.fillStyle;
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      for (const [k, [cx, cy, cz]] of corners[f]!.entries()) {
        const [sx, sy] = project(x + cx, y + cy, z + cz);
        if (k === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }
  return canvas;
}

/** Renders the artwork into a canvas no larger than `size` (pixel-crisp for 2D). */
export function paintProject(
  p: Project,
  options: PaintOptions & { size: number; targets?: Targets },
): HTMLCanvasElement {
  if (p.kind === "3d")
    return paint3D(p, options.targets ?? buildTargets(p), options.mode, options.size);
  const source = paint2D(p, options.mode);
  const scale = Math.max(1, Math.floor(options.size / Math.max(p.width, p.height)));
  const canvas = document.createElement("canvas");
  canvas.width = p.width * scale;
  canvas.height = p.height * scale;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export function canvasToBlob(canvas: HTMLCanvasElement, type = "image/png"): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Could not encode image"))),
      type,
    );
  });
}

export async function createThumbnail(p: Project, targets?: Targets): Promise<Blob> {
  const opts: PaintOptions & { size: number; targets?: Targets } = { mode: "progress", size: 256 };
  if (targets) opts.targets = targets;
  return canvasToBlob(paintProject(p, opts));
}
