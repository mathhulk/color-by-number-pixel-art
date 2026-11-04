/** An sRGB color with 0–255 channels. */
export type RGB = readonly [r: number, g: number, b: number];
/** A CIELAB color (D65). */
export type Lab = readonly [l: number, a: number, b: number];

const clampByte = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));

export function hexToRgb(hex: string): RGB {
  let h = hex.trim().replace(/^#/, "");
  if (h.length === 3)
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  const n = Number.parseInt(h.slice(0, 6), 16);
  if (Number.isNaN(n)) return [0, 0, 0];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex([r, g, b]: RGB): string {
  return `#${((1 << 24) | (clampByte(r) << 16) | (clampByte(g) << 8) | clampByte(b)).toString(16).slice(1)}`;
}

export function srgbToLinear(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

export function linearToSrgb(v: number): number {
  const c = v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055;
  return clampByte(c * 255);
}

const labF = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116);

export function rgbToLab([r, g, b]: RGB): Lab {
  const lr = srgbToLinear(r);
  const lg = srgbToLinear(g);
  const lb = srgbToLinear(b);
  const x = (lr * 0.4124564 + lg * 0.3575761 + lb * 0.1804375) / 0.95047;
  const y = lr * 0.2126729 + lg * 0.7151522 + lb * 0.072175;
  const z = (lr * 0.0193339 + lg * 0.119192 + lb * 0.9503041) / 1.08883;
  const fx = labF(x);
  const fy = labF(y);
  const fz = labF(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** CIE76 ΔE — cheap and good enough for palette work. */
export function deltaE(a: Lab, b: Lab): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

export function relativeLuminance([r, g, b]: RGB): number {
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}

export function contrastRatio(a: RGB, b: RGB): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Pick black or white text, whichever has the higher WCAG contrast on `bg`. */
export function readableTextColor(bg: RGB): "#111111" | "#ffffff" {
  return contrastRatio(bg, [17, 17, 17]) >= contrastRatio(bg, [255, 255, 255])
    ? "#111111"
    : "#ffffff";
}

export function rgbToHsl([r, g, b]: RGB): [h: number, s: number, l: number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return [h * 60, s, l];
}

export function mixRgb(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

export function shadeRgb(c: RGB, amount: number): RGB {
  return amount >= 0 ? mixRgb(c, [255, 255, 255], amount) : mixRgb(c, [0, 0, 0], -amount);
}

const HUE_NAMES: ReadonlyArray<readonly [maxHue: number, name: string]> = [
  [12, "red"],
  [40, "orange"],
  [65, "yellow"],
  [85, "lime"],
  [150, "green"],
  [175, "teal"],
  [195, "cyan"],
  [240, "blue"],
  [265, "indigo"],
  [290, "purple"],
  [325, "magenta"],
  [345, "pink"],
  [360, "red"],
];

/**
 * A short, human friendly color name such as "dark green" or "light gray".
 * Shown next to swatches to help people with color vision deficiencies.
 */
export function colorName(rgb: RGB): string {
  const [h, s, l] = rgbToHsl(rgb);
  const [lightness, a, b] = rgbToLab(rgb);
  const chroma = Math.hypot(a, b);

  if (chroma < 8 || s < 0.08) {
    if (lightness < 12) return "black";
    if (lightness < 35) return "dark gray";
    if (lightness < 62) return "gray";
    if (lightness < 90) return "light gray";
    return "white";
  }

  let name = HUE_NAMES.find(([max]) => h < max)?.[1] ?? "red";
  // Only muted dark reds/oranges read as brown; saturated ones stay red.
  if ((name === "orange" || name === "red" || name === "yellow") && l < 0.42 && s < 0.6) {
    name = "brown";
  }
  if (name === "orange" && l > 0.75) name = "peach";
  if (name === "red" && l > 0.72) name = "pink";

  const prefix = l < 0.28 ? "dark " : l > 0.78 ? "light " : s < 0.3 ? "muted " : "";
  return prefix + name;
}

/**
 * Names for a whole palette that are unique where possible: when two colors
 * would share a name ("green", "green"), they become "dark green" / "light green"
 * (and a number is appended if it's still ambiguous).
 */
export function paletteNames(colors: readonly RGB[]): string[] {
  const names = colors.map(colorName);
  const base = (n: string) => n.replace(/^(dark|light|muted) /, "");
  const groups = new Map<string, number[]>();
  names.forEach((n, i) => {
    const key = base(n);
    groups.set(key, [...(groups.get(key) ?? []), i]);
  });
  for (const [key, members] of groups) {
    if (members.length < 2) continue;
    const byLightness = [...members].sort(
      (a, b) => rgbToLab(colors[a]!)[0] - rgbToLab(colors[b]!)[0],
    );
    const labels =
      byLightness.length === 2
        ? [`dark ${key}`, `light ${key}`]
        : byLightness.length === 3
          ? [`dark ${key}`, key, `light ${key}`]
          : byLightness.map((_, k) => `${key} ${k + 1}`);
    byLightness.forEach((i, k) => {
      names[i] = labels[k]!;
    });
  }
  // Anything still duplicated gets a counter.
  const seen = new Map<string, number>();
  return names.map((n) => {
    const count = (seen.get(n) ?? 0) + 1;
    seen.set(n, count);
    return count > 1 ? `${n} ${count}` : n;
  });
}
