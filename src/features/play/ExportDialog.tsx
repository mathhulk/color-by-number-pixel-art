import { Download, Printer, Share2 } from "lucide-react";
import { useEffect, useState } from "react";

import {
  type ArtworkBackground,
  canShareFiles,
  downloadBlob,
  exportArtwork,
  exportColoringPage,
  maxScale,
  type Paper,
  printImage,
  safeFileName,
  shareBlob,
} from "@/lib/export";
import { serializeProject } from "@/lib/library";
import type { Project } from "@/lib/project";
import { writeVox } from "@/lib/vox";
import { useObjectUrl } from "@/state/hooks";
import { Button, Dialog, SegmentedControl, SliderField, SwitchField, toast } from "@/ui";

import styles from "./PlayView.module.css";

type Format = "artwork" | "page" | "snapshot" | "vox" | "project";

/** US and Canada print on Letter; most of the world uses A4. */
function defaultPaper(): Paper {
  return /-(US|CA|MX|PH)$/i.test(navigator.language) ? "letter" : "a4";
}

interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: Project;
  complete: boolean;
  /** Captures the current 3D view as a PNG. */
  snapshot: () => Promise<Blob>;
}

export function ExportDialog({
  open,
  onOpenChange,
  project,
  complete,
  snapshot,
}: ExportDialogProps) {
  const is3d = project.kind === "3d";
  const [format, setFormat] = useState<Format>(is3d ? "snapshot" : "artwork");
  const [scale, setScale] = useState(() => Math.min(16, maxScale(project)));
  const [mode, setMode] = useState<"progress" | "complete">(complete ? "complete" : "progress");
  const [background, setBackground] = useState<ArtworkBackground>("transparent");
  const [tinted, setTinted] = useState<"plain" | "tinted">("plain");
  const [paper, setPaper] = useState<Paper>(defaultPaper);
  const [nameLine, setNameLine] = useState(true);
  const [built, setBuilt] = useState<{
    key: string;
    blob?: Blob;
    page?: { landscape: boolean; cellMm: number };
  }>({ key: "" });
  const key = `${format}|${scale}|${mode}|${background}|${tinted}|${paper}|${nameLine}`;
  const busy = open && built.key !== key;
  const blob = busy ? undefined : built.blob;
  const preview = useObjectUrl(blob?.type.startsWith("image/") ? blob : undefined);
  const base = safeFileName(project.name);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const build = async (): Promise<Blob | Awaited<ReturnType<typeof exportColoringPage>>> => {
      switch (format) {
        case "artwork":
          return exportArtwork(project, { scale, mode, background });
        case "page":
          return exportColoringPage(project, { paper, tinted: tinted === "tinted", nameLine });
        case "snapshot":
          return snapshot();
        case "vox":
          return new Blob(
            [
              writeVox(
                project.width,
                project.height,
                project.depth,
                project.cells,
                project.palette,
              ),
            ],
            {
              type: "application/octet-stream",
            },
          );
        case "project":
          return new Blob([serializeProject(project)], { type: "application/json" });
      }
    };
    build()
      .then((out) => {
        if (cancelled) return;
        if (out instanceof Blob) setBuilt({ key, blob: out });
        else
          setBuilt({ key, blob: out.blob, page: { landscape: out.landscape, cellMm: out.cellMm } });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setBuilt({ key });
        toast("Export failed", error instanceof Error ? error.message : String(error));
      });
    return () => {
      cancelled = true;
    };
  }, [open, key, format, scale, mode, background, tinted, paper, nameLine, project, snapshot]);

  const filename = {
    artwork: `${base}.png`,
    page: `${base}-coloring-page.png`,
    snapshot: `${base}-3d.png`,
    vox: `${base}.vox`,
    project: `${base}.pixels.json`,
  }[format];

  const formats = is3d
    ? ([
        { value: "snapshot", label: "Image" },
        { value: "vox", label: ".vox" },
        { value: "project", label: "Project" },
      ] as const)
    : ([
        { value: "artwork", label: "Artwork" },
        { value: "page", label: "Coloring page" },
        { value: "project", label: "Project" },
      ] as const);

  const describe: Record<Format, string> = {
    artwork: "A crisp PNG of your pixel art, scaled without blurring.",
    page: "A printable page with numbered squares and a color key at the bottom — great for coloring by hand.",
    snapshot: "A PNG of the current 3D view. Rotate the model first to frame it.",
    vox: "A MagicaVoxel model you can open in voxel editors and 3D tools.",
    project: "A backup of this design and your progress. Import it on any device.",
  };

  const share = canShareFiles();

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Export"
      description={describe[format]}
      actions={
        <>
          {format === "page" ? (
            <Button
              disabled={!blob || busy}
              onClick={() => {
                if (blob) printImage(blob, paper, built.page?.landscape ?? false, project.name);
              }}
            >
              <Printer aria-hidden="true" />
              Print
            </Button>
          ) : null}
          {share ? (
            <Button
              disabled={!blob || busy}
              onClick={() => {
                if (blob) void shareBlob(blob, filename, project.name);
              }}
            >
              <Share2 aria-hidden="true" />
              Share
            </Button>
          ) : null}
          <Button
            variant="primary"
            disabled={!blob || busy}
            onClick={() => {
              if (!blob) return;
              downloadBlob(blob, filename);
              toast("Saved", filename);
            }}
          >
            <Download aria-hidden="true" />
            Download
          </Button>
        </>
      }
    >
      <div className={styles.exportBody}>
        <SegmentedControl<Format>
          label="Format"
          value={format}
          onChange={setFormat}
          options={formats}
        />
        {format === "artwork" ? (
          <>
            <SliderField
              label="Size"
              value={scale}
              onChange={setScale}
              min={1}
              max={Math.min(64, maxScale(project))}
              format={(v) => `${project.width * v} × ${project.height * v} px`}
            />
            <SegmentedControl
              label="Show"
              showLabel
              value={mode}
              onChange={setMode}
              options={[
                { value: "progress", label: "My progress" },
                { value: "complete", label: "Finished art" },
              ]}
            />
            <SegmentedControl<ArtworkBackground>
              label="Background"
              showLabel
              value={background}
              onChange={setBackground}
              options={[
                { value: "transparent", label: "None" },
                { value: "white", label: "White" },
                { value: "black", label: "Black" },
              ]}
            />
          </>
        ) : null}
        {format === "page" ? (
          <>
            <SegmentedControl<Paper>
              label="Paper"
              showLabel
              value={paper}
              onChange={setPaper}
              options={[
                { value: "letter", label: "Letter" },
                { value: "a4", label: "A4" },
              ]}
            />
            <SegmentedControl
              label="Squares"
              showLabel
              value={tinted}
              onChange={setTinted}
              options={[
                { value: "plain", label: "Plain (saves ink)" },
                { value: "tinted", label: "Color hint" },
              ]}
            />
            <SwitchField label="Name line" checked={nameLine} onChange={setNameLine} />
            {built.page && !busy && built.page.cellMm < 5 ? (
              <p className={styles.exportNote}>
                Squares print at about {built.page.cellMm.toFixed(1)} mm. For little hands, try a
                design around 32 × 32 or smaller.
              </p>
            ) : null}
          </>
        ) : null}
        <div
          className={`${styles.exportPreview} ${format === "page" ? styles.paperPreview : ""}`}
          aria-busy={busy}
        >
          {preview ? (
            <img src={preview} alt="Export preview" />
          ) : (
            <span>{busy ? "Preparing…" : filename}</span>
          )}
        </div>
      </div>
    </Dialog>
  );
}
