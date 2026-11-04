export type ResampleMethod = "nearest" | "bilinear" | "average" | "dominant";
export type QuantizeMethod = "exact" | "median-cut" | "kmeans" | "octree";
export type DitherMethod = "none" | "floyd-steinberg" | "atkinson" | "bayer";
export type ColorSpace = "rgb" | "lab";
export type PaletteOrder = "frequency" | "hue" | "lightness";
export type OutputShape = "flat" | "extrude" | "relief";
export type NumberMode = "voxel" | "face";

export interface ImportSettings {
  /** Output width in cells. */
  width: number;
  /** Output height in cells (image rows). */
  height: number;
  lockAspect: boolean;
  resample: ResampleMethod;
  quantize: QuantizeMethod;
  /** Maximum palette size. */
  colors: number;
  colorSpace: ColorSpace;
  dither: DitherMethod;
  /** 0–3 passes of isolated-pixel ("speckle") removal. */
  cleanup: number;
  /** Cells whose alpha is below this (0–255) become empty. */
  alphaThreshold: number;
  /** -100 … 100 */
  brightness: number;
  /** -100 … 100 */
  contrast: number;
  /** -100 … 100 */
  saturation: number;
  paletteOrder: PaletteOrder;
  /** 2D image vs. 3D voxel output. */
  shape: OutputShape;
  /** Voxel layers for "extrude", max column height for "relief". */
  depth: number;
  numberMode: NumberMode;
  /** In "face" mode, give each face direction its own lit shade. */
  faceShading: boolean;
}

export const defaultImportSettings: ImportSettings = {
  width: 48,
  height: 48,
  lockAspect: true,
  resample: "dominant",
  quantize: "kmeans",
  colors: 16,
  colorSpace: "lab",
  dither: "none",
  cleanup: 1,
  alphaThreshold: 128,
  brightness: 0,
  contrast: 0,
  saturation: 0,
  paletteOrder: "frequency",
  shape: "flat",
  depth: 4,
  numberMode: "voxel",
  faceShading: true,
};

/** An RGBA raster (same layout as ImageData). */
export interface RasterSource {
  type: "raster";
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

/** A voxel model such as one loaded from a MagicaVoxel `.vox` file. Y is up. */
export interface VoxelSource {
  type: "voxels";
  width: number;
  height: number;
  depth: number;
  /** Index = x + width * (y + height * z); 0 = empty, otherwise 1-based index into `palette`. */
  voxels: Uint8Array;
  /** Hex colors. */
  palette: string[];
}

export type ImportSource = RasterSource | VoxelSource;

export interface ImportResult {
  kind: "2d" | "3d";
  width: number;
  height: number;
  depth: number;
  /** Hex colors; cell value `n` refers to `palette[n - 1]`. */
  palette: string[];
  /** Index = x + width * (y + height * z); 0 = empty. For 2D, y = 0 is the top row. For 3D, y is up. */
  cells: Uint16Array;
  numberMode: NumberMode;
  /** Per-face colors (`cellIndex * 6 + face`), only when numberMode === "face". */
  faceColors?: Uint16Array;
  stats: {
    colors: number;
    filledCells: number;
    sourceColors: number;
    /** Set when the requested method could not be honored (e.g. "exact" with too many colors). */
    note?: string;
    ms: number;
  };
}
