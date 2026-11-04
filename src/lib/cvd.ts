import { linearToSrgb, type RGB, srgbToLinear } from "./color";

/** Color vision deficiency types supported by the vision settings. */
export type VisionMode = "normal" | "protan" | "deutan" | "tritan" | "achromat";
/** How the canvas colors are adjusted for a vision mode. */
export type VisionFilter = "off" | "simulate" | "enhance";

/** Row-major 3×3 matrix operating on linear RGB. */
export type Mat3 = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

export const IDENTITY: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

/** Machado, Oliveira & Fernandes (2009) simulation matrices, severity 1.0. */
const SIMULATION: Record<Exclude<VisionMode, "normal">, Mat3> = {
  protan: [
    0.152286, 1.052583, -0.204868, 0.114503, 0.786281, 0.099216, -0.003882, -0.048116, 1.051998,
  ],
  deutan: [
    0.367322, 0.860646, -0.227968, 0.280085, 0.672501, 0.047413, -0.01182, 0.04294, 0.968881,
  ],
  tritan: [
    1.255528, -0.076749, -0.178779, -0.078411, 0.930809, 0.147602, 0.004733, 0.691367, 0.3039,
  ],
  achromat: [0.2126, 0.7152, 0.0722, 0.2126, 0.7152, 0.0722, 0.2126, 0.7152, 0.0722],
};

/**
 * Error redistribution used by daltonization: the information a viewer can't see
 * is shifted into channels they can distinguish.
 */
const ERROR_SHIFT: Record<"protan" | "deutan" | "tritan", Mat3> = {
  protan: [0, 0, 0, 0.7, 1, 0, 0.7, 0, 1],
  deutan: [0, 0, 0, 0.7, 1, 0, 0.7, 0, 1],
  tritan: [1, 0, 0.7, 0, 1, 0.7, 0, 0, 0],
};

export function multiply(a: Mat3, b: Mat3): Mat3 {
  const out = new Array<number>(9);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      out[r * 3 + c] = a[r * 3]! * b[c]! + a[r * 3 + 1]! * b[3 + c]! + a[r * 3 + 2]! * b[6 + c]!;
    }
  }
  return out as unknown as Mat3;
}

const add = (a: Mat3, b: Mat3) => a.map((v, i) => v + b[i]!) as unknown as Mat3;
const sub = (a: Mat3, b: Mat3) => a.map((v, i) => v - b[i]!) as unknown as Mat3;

/**
 * Returns the linear-RGB matrix to apply to artwork colors.
 * - "simulate" previews how the palette looks with the given deficiency.
 * - "enhance" daltonizes: `c + E·(c − S·c)`, which is linear, so it collapses to one matrix.
 */
export function visionMatrix(mode: VisionMode, filter: VisionFilter): Mat3 {
  if (mode === "normal" || filter === "off") return IDENTITY;
  const sim = SIMULATION[mode];
  if (filter === "simulate") return sim;
  if (mode === "achromat") return IDENTITY;
  return add(IDENTITY, multiply(ERROR_SHIFT[mode], sub(IDENTITY, sim)));
}

export function applyMatrix(m: Mat3, [r, g, b]: RGB): RGB {
  if (m === IDENTITY) return [r, g, b];
  const lr = srgbToLinear(r);
  const lg = srgbToLinear(g);
  const lb = srgbToLinear(b);
  return [
    linearToSrgb(m[0] * lr + m[1] * lg + m[2] * lb),
    linearToSrgb(m[3] * lr + m[4] * lg + m[5] * lb),
    linearToSrgb(m[6] * lr + m[7] * lg + m[8] * lb),
  ];
}

export type AccentName = "auto" | "green" | "blue" | "orange" | "magenta" | "ink";

export const ACCENTS: Record<
  Exclude<AccentName, "auto">,
  { label: string; hex: string; darkHex: string }
> = {
  green: { label: "Green", hex: "#1f8a4c", darkHex: "#4ade80" },
  blue: { label: "Blue", hex: "#1d64d8", darkHex: "#7ab2ff" },
  orange: { label: "Orange", hex: "#c2410c", darkHex: "#fb923c" },
  magenta: { label: "Magenta", hex: "#b0247a", darkHex: "#f472b6" },
  ink: { label: "High contrast", hex: "#111111", darkHex: "#ffffff" },
};

/**
 * The default highlight color for a vision mode. Green is a poor highlight for
 * red/green deficiencies, and blue for blue/yellow ones.
 */
export function resolveAccent(accent: AccentName, mode: VisionMode): Exclude<AccentName, "auto"> {
  if (accent !== "auto") return accent;
  switch (mode) {
    case "protan":
    case "deutan":
      return "blue";
    case "tritan":
      return "magenta";
    case "achromat":
      return "ink";
    case "normal":
      return "green";
  }
}
