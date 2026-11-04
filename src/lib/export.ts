import { hexToRgb, mixRgb, paletteNames, readableTextColor } from "./color";
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

export type Paper = "letter" | "a4";

export interface ColoringPageOptions {
  paper: Paper;
  /** Lightly tint each cell with its color (a hint for younger kids). */
  tinted: boolean;
  /** Add a "Name: ____" line in the header. */
  nameLine: boolean;
}

export interface ColoringPage {
  blob: Blob;
  landscape: boolean;
  /** Printed cell size in millimetres (to warn when cells get tiny). */
  cellMm: number;
}

const DPI = 200;
const PAPER_INCHES: Record<Paper, [number, number]> = {
  letter: [8.5, 11],
  a4: [8.27, 11.69],
};

/**
 * A printable color-by-number page for coloring by hand: a numbered grid with
 * crisp single-weight lines, a bolder outline around the shape, and a key of
 * numbered color swatches at the bottom of the paper.
 */
export async function exportColoringPage(
  p: Project,
  { paper, tinted, nameLine }: ColoringPageOptions,
): Promise<ColoringPage> {
  const landscape = p.width / p.height > 1.15;
  const [shortIn, longIn] = PAPER_INCHES[paper];
  const pageW = Math.round((landscape ? longIn : shortIn) * DPI);
  const pageH = Math.round((landscape ? shortIn : longIn) * DPI);
  const margin = Math.round(0.5 * DPI);
  const contentW = pageW - margin * 2;
  const font = `"Inter Variable", Inter, system-ui, sans-serif`;
  const palette = p.palette.map(hexToRgb);
  const names = paletteNames(palette);

  // Key layout: numbered swatches with the color name underneath.
  const keyTitle = 56;
  const entryW = 150;
  const entryH = 118;
  const keyCols = Math.max(1, Math.min(palette.length, Math.floor(contentW / entryW)));
  const keyRows = Math.ceil(palette.length / keyCols);
  const keyH = keyTitle + keyRows * entryH;

  const headerH = 110;
  const gap = 48;
  const gridAvailH = pageH - margin * 2 - headerH - gap - keyH;
  const cell = Math.max(4, Math.floor(Math.min(contentW / p.width, gridAvailH / p.height)));
  const gridW = cell * p.width;
  const gridH = cell * p.height;
  const gx = margin + Math.round((contentW - gridW) / 2);
  const gy = margin + headerH + Math.max(0, Math.round((gridAvailH - gridH) / 2));

  const canvas = document.createElement("canvas");
  canvas.width = pageW;
  canvas.height = pageH;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, pageW, pageH);

  // Header
  ctx.fillStyle = "#1c1b19";
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.font = `700 44px ${font}`;
  ctx.fillText(p.name, margin, margin + 44, nameLine ? contentW * 0.55 : contentW);
  ctx.font = `500 22px ${font}`;
  ctx.fillStyle = "#6b6964";
  ctx.fillText("Color each square to match its number.", margin, margin + 84);
  if (nameLine) {
    const x0 = margin + contentW * 0.6;
    ctx.fillStyle = "#1c1b19";
    ctx.font = `600 26px ${font}`;
    ctx.fillText("Name", x0, margin + 44);
    ctx.strokeStyle = "#1c1b19";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x0 + 80, margin + 46);
    ctx.lineTo(margin + contentW, margin + 46);
    ctx.stroke();
  }

  // Cells
  const at = (x: number, y: number) =>
    x < 0 || y < 0 || x >= p.width || y >= p.height ? 0 : p.cells[x + y * p.width]!;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (let y = 0; y < p.height; y++) {
    for (let x = 0; x < p.width; x++) {
      const c = at(x, y);
      if (!c) continue;
      if (tinted) {
        const t = mixRgb([255, 255, 255], palette[c - 1]!, 0.16);
        ctx.fillStyle = `rgb(${t[0]} ${t[1]} ${t[2]})`;
        ctx.fillRect(gx + x * cell, gy + y * cell, cell, cell);
      }
      ctx.fillStyle = "#3a3936";
      ctx.font = `600 ${Math.round(cell * (c >= 100 ? 0.32 : c >= 10 ? 0.4 : 0.46))}px ${font}`;
      ctx.fillText(String(c), gx + x * cell + cell / 2, gy + y * cell + cell / 2 + 1);
    }
  }

  // Grid lines, each drawn exactly once: thin between cells, bold around the shape.
  const thin = Math.max(1.5, cell * 0.035);
  const bold = Math.max(3, cell * 0.08);
  const segment = (x1: number, y1: number, x2: number, y2: number, outline: boolean) => {
    ctx.strokeStyle = outline ? "#1c1b19" : "#8d8b86";
    ctx.lineWidth = outline ? bold : thin;
    ctx.lineCap = "square";
    ctx.beginPath();
    ctx.moveTo(gx + x1 * cell, gy + y1 * cell);
    ctx.lineTo(gx + x2 * cell, gy + y2 * cell);
    ctx.stroke();
  };
  for (const outline of [false, true]) {
    for (let y = 0; y <= p.height; y++) {
      for (let x = 0; x < p.width; x++) {
        const a = at(x, y - 1) > 0;
        const b = at(x, y) > 0;
        if ((a || b) && (a !== b) === outline) segment(x, y, x + 1, y, outline);
      }
    }
    for (let x = 0; x <= p.width; x++) {
      for (let y = 0; y < p.height; y++) {
        const a = at(x - 1, y) > 0;
        const b = at(x, y) > 0;
        if ((a || b) && (a !== b) === outline) segment(x, y, x, y + 1, outline);
      }
    }
  }

  // Color key along the bottom of the page.
  const keyTop = pageH - margin - keyH;
  ctx.strokeStyle = "#e4e2dd";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(margin, keyTop - gap / 2);
  ctx.lineTo(margin + contentW, keyTop - gap / 2);
  ctx.stroke();
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#1c1b19";
  ctx.font = `700 28px ${font}`;
  ctx.fillText("Color key", margin, keyTop + 30);
  const colW = contentW / keyCols;
  const swatch = 72;
  palette.forEach((rgb, i) => {
    const col = i % keyCols;
    const row = Math.floor(i / keyCols);
    const cx = margin + col * colW + colW / 2;
    const top = keyTop + keyTitle + row * entryH;
    ctx.fillStyle = `rgb(${rgb[0]} ${rgb[1]} ${rgb[2]})`;
    ctx.beginPath();
    ctx.roundRect(cx - swatch / 2, top, swatch, swatch, 14);
    ctx.fill();
    ctx.strokeStyle = "rgb(0 0 0 / 0.2)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = readableTextColor(rgb);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `700 ${i + 1 >= 100 ? 26 : 32}px ${font}`;
    ctx.fillText(String(i + 1), cx, top + swatch / 2 + 1);
    ctx.fillStyle = "#5f5d58";
    ctx.font = `500 18px ${font}`;
    ctx.fillText(names[i]!, cx, top + swatch + 22, colW - 12);
  });

  const blob = await canvasToBlob(canvas);
  return { blob, landscape, cellMm: (cell / DPI) * 25.4 };
}

/** Prints an image on a full page using the browser's print dialog. */
export function printImage(blob: Blob, paper: Paper, landscape: boolean, title: string): void {
  const url = URL.createObjectURL(blob);
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText =
    "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
  document.body.append(iframe);
  const doc = iframe.contentDocument;
  const win = iframe.contentWindow;
  if (!doc || !win) {
    iframe.remove();
    URL.revokeObjectURL(url);
    return;
  }
  doc.title = title;
  const style = doc.createElement("style");
  style.textContent = `@page { size: ${paper === "a4" ? "A4" : "letter"} ${landscape ? "landscape" : "portrait"}; margin: 0; }
    html, body { margin: 0; height: 100%; }
    img { display: block; width: 100%; height: 100%; object-fit: contain; }`;
  doc.head.append(style);
  const img = doc.createElement("img");
  img.alt = title;
  img.onload = () => {
    win.focus();
    win.print();
    setTimeout(() => {
      iframe.remove();
      URL.revokeObjectURL(url);
    }, 1000);
  };
  img.src = url;
  doc.body.append(img);
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
