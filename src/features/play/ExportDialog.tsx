import { Download, Share2 } from "lucide-react";
import { useEffect, useState } from "react";

import {
  type ArtworkBackground,
  canShareFiles,
  downloadBlob,
  exportArtwork,
  exportTemplate,
  maxScale,
  safeFileName,
  shareBlob,
} from "@/lib/export";
import { serializeProject } from "@/lib/library";
import type { Project } from "@/lib/project";
import { writeVox } from "@/lib/vox";
import { useObjectUrl } from "@/state/hooks";
import { Button, Dialog, SegmentedControl, SliderField, toast } from "@/ui";

import styles from "./PlayView.module.css";

type Format = "artwork" | "template" | "snapshot" | "vox" | "project";

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
  const [built, setBuilt] = useState<{ key: string; blob?: Blob }>({ key: "" });
  const key = `${format}|${scale}|${mode}|${background}|${tinted}`;
  const busy = open && built.key !== key;
  const blob = busy ? undefined : built.blob;
  const preview = useObjectUrl(blob?.type.startsWith("image/") ? blob : undefined);
  const base = safeFileName(project.name);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const build = async (): Promise<Blob> => {
      switch (format) {
        case "artwork":
          return exportArtwork(project, { scale, mode, background });
        case "template":
          return exportTemplate(project, { tinted: tinted === "tinted" });
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
      .then((b) => {
        if (!cancelled) setBuilt({ key, blob: b });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setBuilt({ key });
        toast("Export failed", error instanceof Error ? error.message : String(error));
      });
    return () => {
      cancelled = true;
    };
  }, [open, key, format, scale, mode, background, tinted, project, snapshot]);

  const filename = {
    artwork: `${base}.png`,
    template: `${base}-template.png`,
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
        { value: "template", label: "Printable" },
        { value: "project", label: "Project" },
      ] as const);

  const describe: Record<Format, string> = {
    artwork: "A crisp PNG of your pixel art, scaled without blurring.",
    template: "A numbered sheet with a color key — print it and color by hand.",
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
        {format === "template" ? (
          <SegmentedControl
            label="Cells"
            showLabel
            value={tinted}
            onChange={setTinted}
            options={[
              { value: "plain", label: "Plain (saves ink)" },
              { value: "tinted", label: "Lightly tinted" },
            ]}
          />
        ) : null}
        <div className={styles.exportPreview} aria-busy={busy}>
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
