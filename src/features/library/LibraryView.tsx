import {
  Box,
  Copy,
  Download,
  Grid3x3,
  ImagePlus,
  MoreVertical,
  Pencil,
  RotateCcw,
  Search,
  Settings,
  Trash2,
  Upload,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";

import { listSummaries, onLibraryChange } from "@/lib/db";
import { downloadBlob, safeFileName } from "@/lib/export";
import {
  deleteProject,
  duplicateProject,
  getProject,
  persistProject,
  renameProject,
  resetProject,
  serializeProject,
} from "@/lib/library";
import { progressLabel, type ProjectSummary } from "@/lib/project";
import { SAMPLES, type SampleDesign } from "@/lib/samples";
import { paintProject } from "@/lib/thumbnail";
import { useObjectUrl } from "@/state/hooks";
import { setPendingImport } from "@/state/pendingImport";
import {
  Button,
  buttonClass,
  ConfirmDialog,
  Dialog,
  IconButton,
  Menu,
  ProgressBar,
  SegmentedControl,
  TextField,
  toast,
} from "@/ui";

import { SettingsSheet } from "../settings/SettingsPanel";

import styles from "./LibraryView.module.css";

type Filter = "all" | "progress" | "done";

export function LibraryView() {
  const [, navigate] = useLocation();
  const [items, setItems] = useState<ProjectSummary[] | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [renaming, setRenaming] = useState<ProjectSummary | null>(null);
  const [deleting, setDeleting] = useState<ProjectSummary | null>(null);
  const [resetting, setResetting] = useState<ProjectSummary | null>(null);
  const [dragging, setDragging] = useState(false);

  const refresh = useCallback(() => {
    listSummaries()
      .then(setItems)
      .catch((error: unknown) => {
        setItems([]);
        toast("Couldn't open your library", error instanceof Error ? error.message : String(error));
      });
  }, []);

  useEffect(() => {
    refresh();
    return onLibraryChange(refresh);
  }, [refresh]);

  useEffect(() => {
    document.title = "Pixel by Number";
  }, []);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (items ?? []).filter((p) => {
      const done = p.total > 0 && p.done >= p.total;
      if (filter === "progress" && done) return false;
      if (filter === "done" && !done) return false;
      return !q || p.name.toLowerCase().includes(q);
    });
  }, [items, filter, query]);

  const startSample = async (sample: SampleDesign) => {
    const project = sample.build();
    await persistProject(project);
    navigate(`/play/${project.id}`);
  };

  const importFile = (file: File | undefined) => {
    if (!file) return;
    setPendingImport(file);
    navigate("/import");
  };

  const counts = useMemo(() => {
    const all = items ?? [];
    const done = all.filter((p) => p.total > 0 && p.done >= p.total).length;
    return { all: all.length, done, progress: all.length - done };
  }, [items]);

  return (
    <div
      className={styles.page}
      data-dragging={dragging || undefined}
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
        importFile(e.dataTransfer.files[0]);
      }}
    >
      <header className={styles.header}>
        <div className={styles.brand}>
          <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" width={36} height={36} />
          <h1>Pixel by Number</h1>
        </div>
        <div className={styles.headerActions}>
          <Link href="/import" className={buttonClass({ variant: "primary" })}>
            <ImagePlus aria-hidden="true" />
            <span className={styles.hideSmall}>New from image</span>
            <span className={styles.showSmall}>New</span>
          </Link>
          <IconButton label="Settings" icon={<Settings />} onClick={() => setSettingsOpen(true)} />
        </div>
      </header>

      <main className={styles.main}>
        <section aria-labelledby="my-art" className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 id="my-art">My art</h2>
            {counts.all > 0 ? (
              <div className={styles.filters}>
                <SegmentedControl<Filter>
                  label="Filter"
                  value={filter}
                  onChange={setFilter}
                  options={[
                    { value: "all", label: `All ${counts.all}` },
                    { value: "progress", label: `In progress ${counts.progress}` },
                    { value: "done", label: `Done ${counts.done}` },
                  ]}
                />
                <div className={styles.search}>
                  <Search aria-hidden="true" />
                  <TextField
                    label="Search"
                    hideLabel
                    placeholder="Search"
                    type="search"
                    value={query}
                    onChange={setQuery}
                  />
                </div>
              </div>
            ) : null}
          </div>

          {items === null ? (
            <div className={styles.grid} aria-busy="true">
              {[0, 1, 2].map((i) => (
                <div key={i} className={styles.skeleton} />
              ))}
            </div>
          ) : counts.all === 0 ? (
            <div className={styles.empty}>
              <p className={styles.emptyTitle}>Nothing here yet</p>
              <p>Pick a design below, or turn one of your own images into a color-by-number.</p>
            </div>
          ) : visible.length === 0 ? (
            <p className={styles.emptyInline}>No designs match.</p>
          ) : (
            <ul className={styles.grid}>
              {visible.map((p) => (
                <ProjectCard
                  key={p.id}
                  summary={p}
                  onRename={() => setRenaming(p)}
                  onDelete={() => setDeleting(p)}
                  onReset={() => setResetting(p)}
                />
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="start-new" className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 id="start-new">Start something new</h2>
          </div>
          <ul className={styles.grid}>
            <li>
              <label className={styles.importCard}>
                <Upload aria-hidden="true" />
                <span className={styles.cardTitle}>Import an image</span>
                <span className={styles.cardMeta}>Photo, pixel art, or a .vox / project file</span>
                <input
                  type="file"
                  accept="image/*,.vox,.json"
                  className="visually-hidden"
                  onChange={(e) => importFile(e.target.files?.[0])}
                />
              </label>
            </li>
            {SAMPLES.map((s) => (
              <SampleCard key={s.id} sample={s} onStart={() => void startSample(s)} />
            ))}
          </ul>
        </section>
      </main>

      <SettingsSheet open={settingsOpen} onOpenChange={setSettingsOpen} />
      <RenameDialog
        key={renaming?.id ?? "none"}
        summary={renaming}
        onClose={() => setRenaming(null)}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete design?"
        description={`“${deleting?.name ?? ""}” and its progress will be removed from this device.`}
        confirmLabel="Delete"
        danger
        onConfirm={() => {
          if (deleting) void deleteProject(deleting.id).then(() => toast("Deleted", deleting.name));
        }}
      />
      <ConfirmDialog
        open={resetting !== null}
        onOpenChange={(open) => !open && setResetting(null)}
        title="Reset progress?"
        description={`All filled cells in “${resetting?.name ?? ""}” will be cleared.`}
        confirmLabel="Reset"
        danger
        onConfirm={() => {
          if (resetting) void resetProject(resetting.id);
        }}
      />
      {dragging ? (
        <div className={styles.dropOverlay} aria-hidden="true">
          <Upload />
          Drop to import
        </div>
      ) : null}
    </div>
  );
}

function ProjectCard({
  summary,
  onRename,
  onDelete,
  onReset,
}: {
  summary: ProjectSummary;
  onRename: () => void;
  onDelete: () => void;
  onReset: () => void;
}) {
  const [, navigate] = useLocation();
  const thumb = useObjectUrl(summary.thumbnail);
  const complete = summary.total > 0 && summary.done >= summary.total;
  const pct = progressLabel(summary.done, summary.total);
  const size =
    summary.kind === "3d"
      ? `${summary.width}×${summary.height}×${summary.depth}`
      : `${summary.width}×${summary.height}`;

  const exportFile = async () => {
    const p = await getProject(summary.id);
    if (!p) return;
    downloadBlob(
      new Blob([serializeProject(p)], { type: "application/json" }),
      `${safeFileName(p.name)}.pixels.json`,
    );
  };

  return (
    <li className={styles.card}>
      <Link
        href={`/play/${summary.id}`}
        className={styles.cardLink}
        aria-label={`${summary.name}, ${pct} complete`}
      >
        <div className={styles.thumb} data-kind={summary.kind}>
          {thumb ? <img src={thumb} alt="" /> : null}
          {complete ? <span className={styles.badgeDone}>Done</span> : null}
        </div>
        <div className={styles.cardBody}>
          <span className={styles.cardTitle}>{summary.name}</span>
          <span className={styles.cardMeta}>
            {summary.kind === "3d" ? <Box aria-hidden="true" /> : <Grid3x3 aria-hidden="true" />}
            {size} · {summary.colors} colors
          </span>
          <div className={styles.cardProgress}>
            <ProgressBar
              value={summary.done}
              max={summary.total}
              label="Progress"
              className={styles.progress}
            />
            <span>{pct}</span>
          </div>
        </div>
      </Link>
      <div className={styles.cardMenu}>
        <Menu
          trigger={
            <IconButton
              label={`Options for ${summary.name}`}
              icon={<MoreVertical />}
              size="sm"
              variant="secondary"
            />
          }
          items={[
            { label: "Rename", icon: <Pencil />, onSelect: onRename },
            {
              label: "Duplicate",
              icon: <Copy />,
              onSelect: () => {
                void duplicateProject(summary.id).then((id) => id && navigate(`/play/${id}`));
              },
            },
            { label: "Save project file", icon: <Download />, onSelect: () => void exportFile() },
            {
              label: "Reset progress…",
              icon: <RotateCcw />,
              onSelect: onReset,
              disabled: summary.done === 0,
            },
            { type: "separator" },
            { label: "Delete…", icon: <Trash2 />, danger: true, onSelect: onDelete },
          ]}
        />
      </div>
    </li>
  );
}

function SampleCard({ sample, onStart }: { sample: SampleDesign; onStart: () => void }) {
  const preview = useMemo(() => {
    const p = sample.build();
    return paintProject(p, { mode: "complete", size: 192 }).toDataURL();
  }, [sample]);
  return (
    <li className={styles.card}>
      <button
        type="button"
        className={styles.cardLink}
        onClick={onStart}
        aria-label={`Start ${sample.name}, ${sample.description}`}
      >
        <div className={styles.thumb} data-kind={sample.kind}>
          <img src={preview} alt="" />
          <span className={styles.badgeKind}>{sample.kind === "3d" ? "3D" : "2D"}</span>
        </div>
        <div className={styles.cardBody}>
          <span className={styles.cardTitle}>{sample.name}</span>
          <span className={styles.cardMeta}>{sample.description}</span>
        </div>
      </button>
    </li>
  );
}

function RenameDialog({
  summary,
  onClose,
}: {
  summary: ProjectSummary | null;
  onClose: () => void;
}) {
  const [name, setName] = useState(summary?.name ?? "");
  const submit = () => {
    if (summary && name.trim()) void renameProject(summary.id, name);
    onClose();
  };
  return (
    <Dialog
      open={summary !== null}
      onOpenChange={(open) => !open && onClose()}
      title="Rename design"
      actions={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit} disabled={!name.trim()}>
            Save
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <TextField label="Name" value={name} onChange={setName} maxLength={80} />
      </form>
    </Dialog>
  );
}
