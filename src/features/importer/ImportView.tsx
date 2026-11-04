import {
  ArrowLeft,
  Box,
  Grid3x3,
  Image as ImageIcon,
  Layers,
  Mountain,
  RotateCcw,
  Sparkles,
  Upload,
  Wand2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";

import { ImportWorkerClient } from "@/import/client";
import { detectPixelScale, suggestSize } from "@/import/detect";
import {
  type ColorSpace,
  defaultImportSettings,
  type DitherMethod,
  type ImportResult,
  type ImportSettings,
  type NumberMode,
  type OutputShape,
  type PaletteOrder,
  type QuantizeMethod,
  type RasterSource,
  type ResampleMethod,
  type VoxelSource,
} from "@/import/types";
import { deserializeProject, persistProject } from "@/lib/library";
import { projectFromImport } from "@/lib/project";
import { parseVox } from "@/lib/vox";
import { useObjectUrl } from "@/state/hooks";
import { takePendingImport } from "@/state/pendingImport";
import {
  Button,
  Fieldset,
  IconButton,
  SegmentedControl,
  SelectField,
  SliderField,
  SwitchField,
  TabList,
  TextField,
  toast,
} from "@/ui";

import { PreviewCanvas } from "./PreviewCanvas";

import styles from "./ImportView.module.css";

type Source =
  | { kind: "raster"; raster: RasterSource; file: Blob; name: string; pixelScale: number }
  | { kind: "voxels"; voxels: VoxelSource; name: string };

type PreviewTab = "numbers" | "result" | "original";

const MAX_SOURCE = 1024;

const RESAMPLE_OPTIONS = [
  {
    value: "dominant",
    label: "Dominant color",
    description: "Crisp edges. Great for pixel art, logos and cartoons.",
  },
  { value: "average", label: "Average", description: "Blends each area. Good for photos." },
  {
    value: "nearest",
    label: "Nearest",
    description: "Samples one pixel per cell; keeps exact colors.",
  },
  {
    value: "bilinear",
    label: "Bilinear",
    description: "Soft interpolation between neighboring pixels.",
  },
] as const satisfies ReadonlyArray<{ value: ResampleMethod; label: string; description: string }>;

const QUANTIZE_OPTIONS = [
  {
    value: "kmeans",
    label: "K-means",
    description: "Balanced and accurate; finds the most representative colors.",
  },
  {
    value: "median-cut",
    label: "Median cut",
    description: "Classic and fast; splits the color space evenly.",
  },
  { value: "octree", label: "Octree", description: "Tends to keep small accent colors." },
  {
    value: "exact",
    label: "Exact",
    description: "Uses the image's own colors (reduced only if there are too many).",
  },
] as const satisfies ReadonlyArray<{ value: QuantizeMethod; label: string; description: string }>;

const DITHER_OPTIONS = [
  { value: "none", label: "None", description: "Clean, solid areas. Recommended." },
  {
    value: "floyd-steinberg",
    label: "Floyd–Steinberg",
    description: "Smooth gradients, but many tiny areas.",
  },
  { value: "atkinson", label: "Atkinson", description: "Lighter dithering with more contrast." },
  { value: "bayer", label: "Ordered (Bayer)", description: "A regular crosshatch pattern." },
] as const satisfies ReadonlyArray<{ value: DitherMethod; label: string; description: string }>;

const ORDER_OPTIONS = [
  { value: "frequency", label: "Most used first" },
  { value: "hue", label: "By hue" },
  { value: "lightness", label: "Light to dark" },
] as const satisfies ReadonlyArray<{ value: PaletteOrder; label: string }>;

async function decodeImage(file: Blob): Promise<RasterSource> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SOURCE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  // Keep hard pixel edges when shrinking big pixel-art screenshots.
  ctx.imageSmoothingEnabled = scale === 1;
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const { data } = ctx.getImageData(0, 0, width, height);
  return { type: "raster", width, height, data };
}

/** A procedurally painted "photo" for trying the importer without a file. */
function samplePhoto(): Promise<Blob> {
  const w = 640;
  const h = 440;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  const sky = ctx.createLinearGradient(0, 0, 0, h * 0.62);
  sky.addColorStop(0, "#1b2a5c");
  sky.addColorStop(0.45, "#c45a88");
  sky.addColorStop(1, "#ffbf73");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);
  const sun = ctx.createRadialGradient(w * 0.66, h * 0.5, 4, w * 0.66, h * 0.5, 90);
  sun.addColorStop(0, "#fff6c9");
  sun.addColorStop(0.4, "#ffd36b");
  sun.addColorStop(1, "rgb(255 211 107 / 0)");
  ctx.fillStyle = sun;
  ctx.fillRect(0, 0, w, h);
  const ridge = (base: number, amp: number, color: string, seed: number) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let x = 0; x <= w; x += 8) {
      ctx.lineTo(
        x,
        base - amp * (0.6 * Math.sin(x / 90 + seed) + 0.4 * Math.sin(x / 37 + seed * 2)),
      );
    }
    ctx.lineTo(w, h);
    ctx.fill();
  };
  ridge(h * 0.6, 50, "#5b3f6e", 1);
  ridge(h * 0.68, 36, "#33284d", 4);
  const water = ctx.createLinearGradient(0, h * 0.72, 0, h);
  water.addColorStop(0, "#2a4a72");
  water.addColorStop(1, "#122238");
  ctx.fillStyle = water;
  ctx.fillRect(0, h * 0.74, w, h);
  ctx.fillStyle = "rgb(255 210 140 / 0.65)";
  for (let y = h * 0.76; y < h; y += 9) {
    const width = 70 - (y - h * 0.76) * 0.25;
    ctx.fillRect(w * 0.66 - width / 2 + Math.sin(y) * 6, y, width, 3);
  }
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Could not create the sample"))),
      "image/png",
    ),
  );
}

function difficulty(cells: number, colors: number): string {
  const score = cells * (1 + colors / 24);
  if (score < 600) return "Quick";
  if (score < 3000) return "Relaxed";
  if (score < 12000) return "Involved";
  return "Epic";
}

export default function ImportView() {
  const [, navigate] = useLocation();
  const [source, setSource] = useState<Source | null>(null);
  const [settings, setSettings] = useState<ImportSettings>(defaultImportSettings);
  const [output, setOutput] = useState<{ request: object; result: ImportResult } | null>(null);
  const [tab, setTab] = useState<PreviewTab>("numbers");
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [dragging, setDragging] = useState(false);
  const clientRef = useRef<ImportWorkerClient | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const original = useObjectUrl(source?.kind === "raster" ? source.file : undefined);

  const update = useCallback(<K extends keyof ImportSettings>(key: K, value: ImportSettings[K]) => {
    setSettings((s) => ({ ...s, [key]: value }));
  }, []);

  const aspect = source?.kind === "raster" ? source.raster.height / source.raster.width : 1;

  const setWidth = (width: number) => {
    setSettings((s) => ({
      ...s,
      width,
      height: s.lockAspect ? Math.max(1, Math.round(width * aspect)) : s.height,
    }));
  };

  const loadFile = useCallback(
    async (file: File | Blob, fileName = "Untitled") => {
      try {
        const lower = fileName.toLowerCase();
        const baseName =
          fileName
            .replace(/\.[^.]+$/, "")
            .replace(/[-_]+/g, " ")
            .trim() || "Untitled";
        if (lower.endsWith(".json")) {
          const project = deserializeProject(await file.text());
          await persistProject(project);
          toast("Project imported", project.name);
          navigate(`/play/${project.id}`);
          return;
        }
        if (lower.endsWith(".vox")) {
          const voxels = parseVox(await file.arrayBuffer());
          setSource({ kind: "voxels", voxels, name: fileName });
          setSettings((s) => ({
            ...s,
            colors: Math.min(64, Math.max(s.colors, voxels.palette.length)),
            quantize: "exact",
          }));
          setName(baseName);
          setTab("numbers");
          return;
        }
        if (file.type && !file.type.startsWith("image/"))
          throw new Error("Choose an image, a .vox model or a project file.");
        const raster = await decodeImage(file);
        const pixelScale = detectPixelScale(raster);
        const size = suggestSize(raster, 64);
        setSource({ kind: "raster", raster, file, name: fileName, pixelScale });
        setSettings((s) => ({
          ...s,
          width: size.width,
          height: size.height,
          lockAspect: true,
          ...(pixelScale > 1
            ? {
                resample: "nearest" as const,
                quantize: "exact" as const,
                dither: "none" as const,
                cleanup: 0,
              }
            : {}),
        }));
        setName(baseName);
      } catch (error) {
        toast("Couldn't open that file", error instanceof Error ? error.message : String(error));
      }
    },
    [navigate],
  );

  // A file dropped on the library, or pasted here.
  useEffect(() => {
    const pending = takePendingImport();
    // Decoding is async; state is only set once the file has loaded.
    if (pending) queueMicrotask(() => void loadFile(pending, pending.name));
    const onPaste = (e: ClipboardEvent) => {
      const file = [...(e.clipboardData?.files ?? [])][0];
      if (file) void loadFile(file, file.name || "Pasted image");
    };
    window.addEventListener("paste", onPaste);
    document.title = "New design · Pixel by Number";
    return () => window.removeEventListener("paste", onPaste);
  }, [loadFile]);

  useEffect(() => () => clientRef.current?.dispose(), []);

  // Identity of the current inputs; the preview is "processing" until a result for it arrives.
  const request = useMemo(() => ({ source, settings }), [source, settings]);
  const result = output?.result ?? null;
  const processing = source !== null && output?.request !== request;

  // Re-run the pipeline (debounced, in a worker) whenever inputs change.
  useEffect(() => {
    if (!request.source) return;
    const input = request.source.kind === "raster" ? request.source.raster : request.source.voxels;
    const timer = setTimeout(() => {
      clientRef.current ??= new ImportWorkerClient();
      clientRef.current
        .run(input, request.settings)
        .then((r) => setOutput({ request, result: r }))
        .catch((error: unknown) => {
          if (error instanceof Error && error.name === "AbortError") return;
          setOutput((o) => (o ? { ...o, request } : o));
          toast("Processing failed", error instanceof Error ? error.message : String(error));
        });
    }, 120);
    return () => clearTimeout(timer);
  }, [request]);

  const create = async () => {
    if (!result) return;
    setCreating(true);
    try {
      const project = projectFromImport(result, name.trim() || "Untitled", source?.name);
      await persistProject(project);
      navigate(`/play/${project.id}`);
    } catch (error) {
      setCreating(false);
      toast("Couldn't create the design", error instanceof Error ? error.message : String(error));
    }
  };

  const stats = useMemo(() => {
    if (!result) return null;
    const size =
      result.kind === "3d"
        ? `${result.width}×${result.height}×${result.depth}`
        : `${result.width}×${result.height}`;
    return {
      size,
      colors: result.stats.colors,
      cells: result.stats.filledCells,
      level: difficulty(result.stats.filledCells, result.stats.colors),
    };
  }, [result]);

  const isVoxels = source?.kind === "voxels";
  const is3d = isVoxels || settings.shape !== "flat";

  const picker = (
    <input
      ref={fileInput}
      type="file"
      accept="image/*,.vox,.json"
      className="visually-hidden"
      tabIndex={-1}
      aria-hidden="true"
      onChange={(e) => {
        const file = e.target.files?.[0];
        if (file) void loadFile(file, file.name);
        e.target.value = "";
      }}
    />
  );

  return (
    <div
      className={styles.page}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) {
          e.preventDefault();
          setDragging(true);
        }
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files[0];
        if (file) void loadFile(file, file.name);
      }}
      data-dragging={dragging || undefined}
    >
      {picker}
      <header className={styles.header}>
        <IconButton label="Back to library" icon={<ArrowLeft />} onClick={() => navigate("/")} />
        <h1 className={styles.heading}>New design</h1>
        {source ? (
          <Button
            variant="ghost"
            onClick={() => fileInput.current?.click()}
            className={styles.hideSmall}
          >
            <Upload aria-hidden="true" />
            Change file
          </Button>
        ) : null}
        <Button
          variant="primary"
          disabled={!result || processing || creating}
          onClick={() => void create()}
          className={styles.hideSmall}
        >
          <Sparkles aria-hidden="true" />
          Start coloring
        </Button>
      </header>

      {!source ? (
        <main className={styles.start}>
          <div className={styles.dropZone}>
            <Upload aria-hidden="true" className={styles.dropIcon} />
            <h2>Turn any image into a color-by-number</h2>
            <p>
              Drop a photo or pixel art here, paste from the clipboard, or choose a file.
              MagicaVoxel .vox models and project backups work too.
            </p>
            <div className={styles.startActions}>
              <Button variant="primary" size="lg" onClick={() => fileInput.current?.click()}>
                <ImageIcon aria-hidden="true" />
                Choose a file
              </Button>
              <Button
                size="lg"
                onClick={() => void samplePhoto().then((b) => loadFile(b, "Sunset sample.png"))}
              >
                <Wand2 aria-hidden="true" />
                Try a sample photo
              </Button>
            </div>
            <p className={styles.privacy}>
              Everything is processed on your device. Nothing is uploaded.
            </p>
          </div>
        </main>
      ) : (
        <main className={styles.editor}>
          <section className={styles.previewPane} aria-label="Preview">
            <div className={styles.previewTabs}>
              <TabList<PreviewTab>
                label="Preview mode"
                value={tab}
                onChange={setTab}
                tabs={[
                  { value: "numbers", label: "Numbers", icon: <Grid3x3 aria-hidden="true" /> },
                  { value: "result", label: "Finished", icon: <Sparkles aria-hidden="true" /> },
                  ...(source.kind === "raster"
                    ? [
                        {
                          value: "original" as const,
                          label: "Original",
                          icon: <ImageIcon aria-hidden="true" />,
                        },
                      ]
                    : []),
                ]}
              />
              <output className={styles.status} aria-live="polite">
                {processing ? "Updating…" : ""}
              </output>
            </div>
            <div className={styles.previewArea} data-busy={processing || undefined}>
              {tab === "original" && original ? (
                <img src={original} alt="Original" className={styles.originalImage} />
              ) : result ? (
                <PreviewCanvas result={result} mode={tab === "result" ? "filled" : "numbers"} />
              ) : (
                <span className={styles.placeholder}>Processing…</span>
              )}
            </div>
            {stats && result ? (
              <div className={styles.summary}>
                <dl className={styles.stats}>
                  <div>
                    <dt>Size</dt>
                    <dd>{stats.size}</dd>
                  </div>
                  <div>
                    <dt>Colors</dt>
                    <dd>{stats.colors}</dd>
                  </div>
                  <div>
                    <dt>{is3d ? "Voxels" : "Cells"}</dt>
                    <dd>{stats.cells.toLocaleString()}</dd>
                  </div>
                  <div>
                    <dt>Feel</dt>
                    <dd>{stats.level}</dd>
                  </div>
                </dl>
                <ul className={styles.paletteStrip} aria-label="Palette">
                  {result.palette.map((hex, i) => (
                    <li key={hex} style={{ background: hex }} title={`${i + 1}: ${hex}`} />
                  ))}
                </ul>
                {result.stats.note ? <p className={styles.note}>{result.stats.note}</p> : null}
              </div>
            ) : null}
          </section>

          <section className={styles.settingsPane} aria-label="Import settings">
            <TextField label="Name" value={name} onChange={setName} maxLength={80} />

            {source.kind === "raster" ? (
              <Fieldset legend="Size">
                {source.pixelScale > 1 ? (
                  <div className={styles.callout}>
                    <Wand2 aria-hidden="true" />
                    <span>
                      Looks like pixel art scaled ×{source.pixelScale}. We matched its original
                      pixels.
                    </span>
                  </div>
                ) : null}
                <SliderField
                  label="Width"
                  value={settings.width}
                  onChange={setWidth}
                  min={4}
                  max={256}
                  format={(v) => `${v} cells`}
                />
                <SwitchField
                  label="Keep proportions"
                  checked={settings.lockAspect}
                  onChange={(v) => {
                    setSettings((s) => ({
                      ...s,
                      lockAspect: v,
                      height: v ? Math.max(1, Math.round(s.width * aspect)) : s.height,
                    }));
                  }}
                />
                <SliderField
                  label="Height"
                  value={settings.height}
                  onChange={(v) => update("height", v)}
                  min={4}
                  max={256}
                  disabled={settings.lockAspect}
                  format={(v) => `${v} cells`}
                />
                <SelectField<ResampleMethod>
                  label="Pixel sampling"
                  value={settings.resample}
                  onChange={(v) => update("resample", v)}
                  options={RESAMPLE_OPTIONS}
                />
              </Fieldset>
            ) : null}

            <Fieldset legend="Colors">
              <SliderField
                label="Maximum colors"
                value={settings.colors}
                onChange={(v) => update("colors", v)}
                min={2}
                max={64}
              />
              <SelectField<QuantizeMethod>
                label="Palette algorithm"
                value={settings.quantize}
                onChange={(v) => update("quantize", v)}
                options={QUANTIZE_OPTIONS}
              />
              <SegmentedControl<ColorSpace>
                label="Color matching"
                showLabel
                value={settings.colorSpace}
                onChange={(v) => update("colorSpace", v)}
                options={[
                  { value: "lab", label: "Perceptual (Lab)" },
                  { value: "rgb", label: "RGB" },
                ]}
              />
              <SelectField<PaletteOrder>
                label="Number order"
                value={settings.paletteOrder}
                onChange={(v) => update("paletteOrder", v)}
                options={ORDER_OPTIONS}
              />
            </Fieldset>

            {source.kind === "raster" ? (
              <Fieldset legend="Clean-up">
                <SelectField<DitherMethod>
                  label="Dithering"
                  value={settings.dither}
                  onChange={(v) => update("dither", v)}
                  options={DITHER_OPTIONS}
                />
                <SliderField
                  label="Remove stray pixels"
                  value={settings.cleanup}
                  onChange={(v) => update("cleanup", v)}
                  min={0}
                  max={3}
                  format={(v) => (v === 0 ? "Off" : `${v} ${v === 1 ? "pass" : "passes"}`)}
                />
                <SliderField
                  label="Transparency cut-off"
                  value={settings.alphaThreshold}
                  onChange={(v) => update("alphaThreshold", v)}
                  min={1}
                  max={255}
                  description="Cells less opaque than this are left empty."
                />
              </Fieldset>
            ) : null}

            {source.kind === "raster" ? (
              <Fieldset legend="Adjust">
                <SliderField
                  label="Brightness"
                  value={settings.brightness}
                  onChange={(v) => update("brightness", v)}
                  min={-100}
                  max={100}
                />
                <SliderField
                  label="Contrast"
                  value={settings.contrast}
                  onChange={(v) => update("contrast", v)}
                  min={-100}
                  max={100}
                />
                <SliderField
                  label="Saturation"
                  value={settings.saturation}
                  onChange={(v) => update("saturation", v)}
                  min={-100}
                  max={100}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setSettings((s) => ({ ...s, brightness: 0, contrast: 0, saturation: 0 }))
                  }
                >
                  <RotateCcw aria-hidden="true" />
                  Reset adjustments
                </Button>
              </Fieldset>
            ) : null}

            <Fieldset legend="3D">
              {source.kind === "raster" ? (
                <SegmentedControl<OutputShape>
                  label="Shape"
                  showLabel
                  value={settings.shape}
                  onChange={(v) => update("shape", v)}
                  options={[
                    { value: "flat", label: "Flat", icon: <Grid3x3 aria-hidden="true" /> },
                    { value: "extrude", label: "Extrude", icon: <Layers aria-hidden="true" /> },
                    { value: "relief", label: "Relief", icon: <Mountain aria-hidden="true" /> },
                  ]}
                />
              ) : null}
              {source.kind === "raster" && settings.shape !== "flat" ? (
                <SliderField
                  label={settings.shape === "relief" ? "Max height" : "Depth"}
                  value={settings.depth}
                  onChange={(v) => update("depth", v)}
                  min={1}
                  max={24}
                  format={(v) => `${v} ${v === 1 ? "layer" : "layers"}`}
                  description={
                    settings.shape === "relief"
                      ? "Lighter colors rise higher."
                      : "How thick the model is."
                  }
                />
              ) : null}
              {is3d ? (
                <>
                  <SegmentedControl<NumberMode>
                    label="Numbers"
                    showLabel
                    value={settings.numberMode}
                    onChange={(v) => update("numberMode", v)}
                    options={[
                      { value: "voxel", label: "One per cube", icon: <Box aria-hidden="true" /> },
                      { value: "face", label: "One per face", icon: <Layers aria-hidden="true" /> },
                    ]}
                  />
                  {settings.numberMode === "face" ? (
                    <SwitchField
                      label="Shade faces"
                      description="Tops are lighter and sides darker, so each face gets its own number."
                      checked={settings.faceShading}
                      onChange={(v) => update("faceShading", v)}
                    />
                  ) : null}
                </>
              ) : (
                <p className={styles.hint}>
                  Extrude or raise your image into a voxel model you can color from every side.
                </p>
              )}
            </Fieldset>
          </section>

          <div className={styles.mobileActions}>
            <Button onClick={() => fileInput.current?.click()}>
              <Upload aria-hidden="true" />
              Change
            </Button>
            <Button
              variant="primary"
              block
              disabled={!result || processing || creating}
              onClick={() => void create()}
            >
              <Sparkles aria-hidden="true" />
              Start coloring
            </Button>
          </div>
        </main>
      )}
      {dragging ? <div className={styles.dropOverlay}>Drop to import</div> : null}
    </div>
  );
}
