import { colorName, hexToRgb, mixRgb, readableTextColor } from "./color";
import type { Project } from "./project";
import { canvasToBlob, paintProject } from "./thumbnail";

export type ArtworkBackground = "transparent" | "white" | "black";

const MAX_EXPORT_PX = 4096;

export function maxScale(p: Project): number {
  return Math.max(1, Math.floor(MAX_EXPORT_PX / Math.max(p.width, p.height)));
}

/** Pixel-perfect PNG of a 2D design. */
export async function exportArtwork(
  p: Project,
  {
    scale,
    mode,
    background,
  }: { scale: number; mode: "progress" | "complete"; background: ArtworkBackground },
): Promise<Blob> {
  const s = Math.min(scale, maxScale(p));
  const art = paintProject(p, { mode, size: Math.max(p.width, p.height) * s });
  if (background === "transparent") return canvasToBlob(art);
  const canvas = document.createElement("canvas");
  canvas.width = art.width;
  canvas.height = art.height;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = background === "white" ? "#ffffff" : "#000000";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(art, 0, 0);
  return canvasToBlob(canvas);
}

/** A printable color-by-number sheet: numbered grid plus a color key. */
export async function exportTemplate(p: Project, { tinted }: { tinted: boolean }): Promise<Blob> {
  const cell = Math.max(14, Math.min(40, Math.floor(3000 / Math.max(p.width, p.height))));
  const margin = cell * 2;
  const palette = p.palette.map(hexToRgb);
  const keyCols = Math.max(1, Math.floor((p.width * cell) / 220));
  const keyRows = Math.ceil(palette.length / keyCols);
  const keyRowHeight = 44;
  const width = p.width * cell + margin * 2;
  const height = p.height * cell + margin * 2 + 60 + keyRows * keyRowHeight;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const font = `"Inter Variable", Inter, system-ui, sans-serif`;

  for (let y = 0; y < p.height; y++) {
    for (let x = 0; x < p.width; x++) {
      const c = p.cells[x + y * p.width]!;
      if (!c) continue;
      const px = margin + x * cell;
      const py = margin + y * cell;
      if (tinted) {
        const t = mixRgb([255, 255, 255], palette[c - 1]!, 0.18);
        ctx.fillStyle = `rgb(${t[0]} ${t[1]} ${t[2]})`;
        ctx.fillRect(px, py, cell, cell);
      }
      ctx.strokeStyle = "rgb(0 0 0 / 0.35)";
      ctx.lineWidth = 1;
      ctx.strokeRect(px + 0.5, py + 0.5, cell, cell);
      ctx.fillStyle = "#222";
      ctx.font = `600 ${Math.round(cell * (c >= 100 ? 0.34 : 0.42))}px ${font}`;
      ctx.fillText(String(c), px + cell / 2, py + cell / 2 + 1);
    }
  }

  // Color key
  const keyTop = margin * 1.5 + p.height * cell + 20;
  ctx.textAlign = "left";
  ctx.fillStyle = "#111";
  ctx.font = `700 22px ${font}`;
  ctx.fillText(p.name, margin, keyTop);
  const colWidth = (width - margin * 2) / keyCols;
  palette.forEach((rgb, i) => {
    const col = i % keyCols;
    const row = Math.floor(i / keyCols);
    const x = margin + col * colWidth;
    const y = keyTop + 30 + row * keyRowHeight;
    ctx.fillStyle = `rgb(${rgb[0]} ${rgb[1]} ${rgb[2]})`;
    ctx.fillRect(x, y, 32, 32);
    ctx.strokeStyle = "rgb(0 0 0 / 0.25)";
    ctx.strokeRect(x + 0.5, y + 0.5, 32, 32);
    ctx.fillStyle = readableTextColor(rgb);
    ctx.textAlign = "center";
    ctx.font = `700 14px ${font}`;
    ctx.fillText(String(i + 1), x + 16, y + 17);
    ctx.textAlign = "left";
    ctx.fillStyle = "#333";
    ctx.font = `500 14px ${font}`;
    ctx.fillText(`${p.palette[i]!.toUpperCase()} · ${colorName(rgb)}`, x + 42, y + 17);
  });
  return canvasToBlob(canvas);
}

export function safeFileName(name: string): string {
  return (
    name
      .replace(/[^\w\- ]+/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .toLowerCase() || "pixel-art"
  );
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function canShareFiles(): boolean {
  try {
    return (
      typeof navigator.canShare === "function" &&
      navigator.canShare({ files: [new File([], "x.png", { type: "image/png" })] })
    );
  } catch {
    return false;
  }
}

/** Opens the native share sheet (great on phones and tablets). Returns false if unavailable or cancelled. */
export async function shareBlob(blob: Blob, filename: string, title: string): Promise<boolean> {
  const file = new File([blob], filename, { type: blob.type || "application/octet-stream" });
  if (!navigator.canShare?.({ files: [file] })) return false;
  try {
    await navigator.share({ files: [file], title });
    return true;
  } catch {
    return false;
  }
}
