import {
  ArrowLeft,
  Brush,
  Download,
  Expand,
  Hand,
  LocateFixed,
  MoreHorizontal,
  PaintBucket,
  Redo2,
  RotateCcw,
  Rotate3d,
  Settings,
  Sparkles,
  Undo2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useLocation } from "wouter";

import { getProject, persistProject } from "@/lib/library";
import type { Project } from "@/lib/project";
import { progressLabel } from "@/lib/project";
import { PlaySession } from "@/lib/session";
import { Grid2DView } from "@/render/Grid2DView";
import type { SceneView } from "@/render/types";
import { Voxel3DView } from "@/render/Voxel3DView";
import { useReducedMotion, useRenderStyle } from "@/state/hooks";
import { useSettings } from "@/state/settings";
import {
  Button,
  ConfirmDialog,
  Dialog,
  IconButton,
  Menu,
  ProgressBar,
  SegmentedControl,
  toast,
} from "@/ui";

import { Loading } from "../Loading";
import { SettingsSheet } from "../settings/SettingsPanel";
import { confetti } from "./confetti";
import { ExportDialog } from "./ExportDialog";
import { attachGestures, type Tool } from "./gestures";
import { Palette } from "./Palette";

import styles from "./PlayView.module.css";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; session: PlaySession };

export default function PlayView({ id }: { id: string }) {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [, navigate] = useLocation();

  useEffect(() => {
    let cancelled = false;
    getProject(id)
      .then((project) => {
        if (cancelled) return;
        if (!project) setState({ status: "error", message: "This design couldn't be found." });
        else setState({ status: "ready", session: new PlaySession(project) });
      })
      .catch((error: unknown) => {
        if (!cancelled)
          setState({
            status: "error",
            message: error instanceof Error ? error.message : String(error),
          });
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (state.status === "loading") return <Loading label="Opening your art…" />;
  if (state.status === "error") {
    return (
      <div className={styles.error} role="alert">
        <p>{state.message}</p>
        <Button variant="primary" onClick={() => navigate("/")}>
          Back to library
        </Button>
      </div>
    );
  }
  return <PlayScreen session={state.session} />;
}

function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
  );
}

function PlayScreen({ session }: { session: PlaySession }) {
  const project = session.project;
  const is3d = project.kind === "3d";
  const [, navigate] = useLocation();
  const snap = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const settings = useSettings();
  const style = useRenderStyle();
  const reducedMotion = useReducedMotion();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const confettiRef = useRef<HTMLCanvasElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const toolsRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<SceneView | null>(null);

  const [selected, setSelected] = useState(() => session.nextIncompleteColor(0) ?? 1);
  const [tool, setTool] = useState<Tool>("paint");
  const [cursor, setCursor] = useState(-1);
  const [announcement, setAnnouncement] = useState("");
  const [viewError, setViewError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [doneOpen, setDoneOpen] = useState(false);
  const spaceHeld = useRef(false);
  const findFrom = useRef(-1);
  // Decided on first render so React's dev double-mount still shows the intro.
  const firstOpen = useRef(!project.openedAt);

  // Latest values for imperative event handlers.
  const live = useRef({ tool, selected, settings, cursor });
  live.current = { tool, selected, settings, cursor };

  /* ----------------------------- Renderer ------------------------------ */

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let view: SceneView;
    try {
      view = is3d ? new Voxel3DView(canvas) : new Grid2DView(canvas);
    } catch (error) {
      setViewError(error instanceof Error ? error.message : String(error));
      return;
    }
    viewRef.current = view;
    view.setStyle(style);
    view.setProject(project, session.targets);
    view.setSelected(live.current.selected);
    const offFill = session.onFill((slots) => view.updateSlots(slots));
    const offGestures = attachGestures(canvas, {
      view,
      session,
      getTool: () => live.current.tool,
      getSelected: () => live.current.selected,
      getSmartSelect: () => live.current.settings.smartSelect,
      onSmartSelect: (c) => setSelected(c),
      isSpaceHeld: () => spaceHeld.current,
    });
    if (firstOpen.current) {
      project.openedAt ??= Date.now();
      void view.playIntro();
    }
    return () => {
      offFill();
      offGestures();
      view.dispose();
      viewRef.current = null;
    };
    // The view is created once per session; style/selection are synced below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  useEffect(() => viewRef.current?.setStyle(style), [style]);
  useEffect(() => viewRef.current?.setSelected(selected), [selected]);
  useEffect(() => viewRef.current?.setCursor(cursor), [cursor]);

  // Keep the art centered in the area not covered by toolbars.
  useEffect(() => {
    const measure = () => {
      const view = viewRef.current;
      const canvas = canvasRef.current;
      if (!view || !canvas) return;
      const c = canvas.getBoundingClientRect();
      const top = (topRef.current?.getBoundingClientRect().bottom ?? 0) - c.top;
      const bottom = c.bottom - (bottomRef.current?.getBoundingClientRect().top ?? c.bottom);
      const tools = toolsRef.current?.getBoundingClientRect();
      const sideTools = tools && tools.height > tools.width;
      view.setInsets({
        top: Math.max(0, top),
        bottom: Math.max(0, bottom),
        left: sideTools ? tools.right - c.left : 0,
        right: 0,
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    for (const el of [topRef.current, bottomRef.current, toolsRef.current, canvasRef.current])
      if (el) ro.observe(el);
    // Fit once insets are known (initial fit happened before layout).
    requestAnimationFrame(() => viewRef.current?.fit(false));
    return () => ro.disconnect();
  }, [session]);

  /* ------------------------------ Saving ------------------------------- */

  const save = useCallback(() => {
    project.updatedAt = Date.now();
    persistProject(project, session.targets).catch((error: unknown) => {
      toast("Couldn't save progress", error instanceof Error ? error.message : String(error));
    });
  }, [project, session]);

  useEffect(() => {
    if (snap.version === 0) return;
    const timer = setTimeout(save, 1200);
    return () => clearTimeout(timer);
  }, [snap.version, save]);

  useEffect(() => {
    const flush = () => {
      if (document.visibilityState === "hidden") save();
    };
    document.addEventListener("visibilitychange", flush);
    window.addEventListener("pagehide", save);
    // Save the "opened" timestamp right away so the intro only plays once.
    save();
    return () => {
      document.removeEventListener("visibilitychange", flush);
      window.removeEventListener("pagehide", save);
      save();
    };
  }, [save]);

  /* ------------------------- Progress reactions ------------------------ */

  const wasComplete = useRef(snap.complete);
  const lastDone = useRef(snap.done);
  useEffect(() => {
    const increased = snap.done > lastDone.current;
    lastDone.current = snap.done;
    if (snap.complete && !wasComplete.current) {
      wasComplete.current = true;
      project.completedAt = Date.now();
      setAnnouncement(`Artwork complete! ${project.name} is finished.`);
      if (settings.haptics) navigator.vibrate?.([30, 40, 60]);
      const view = viewRef.current;
      const celebrate = settings.celebrate && !reducedMotion;
      if (celebrate && confettiRef.current) void confetti(confettiRef.current, project.palette);
      void (view ? view.playCompletion() : Promise.resolve()).then(() => setDoneOpen(true));
      save();
      return;
    }
    if (!snap.complete) wasComplete.current = false;
    if (!increased || !session.isColorComplete(selected)) return;
    const next = session.nextIncompleteColor(selected);
    const left = project.palette.filter((_, i) => !session.isColorComplete(i + 1)).length;
    setAnnouncement(`Color ${selected} complete. ${left} ${left === 1 ? "color" : "colors"} left.`);
    if (settings.haptics) navigator.vibrate?.(18);
    if (settings.autoAdvance && next !== null) setSelected(next);
  }, [
    snap,
    session,
    selected,
    project,
    settings.haptics,
    settings.autoAdvance,
    settings.celebrate,
    reducedMotion,
    save,
  ]);

  /* ------------------------------ Actions ------------------------------ */

  const findNext = useCallback(() => {
    const slot = session.findUnfilled(selected, findFrom.current);
    if (slot < 0) {
      setAnnouncement(`No cells of color ${selected} left.`);
      return;
    }
    findFrom.current = slot;
    viewRef.current?.focusSlot(slot);
    if (!is3d) setCursor(slot);
  }, [session, selected, is3d]);

  const cycleColor = useCallback(
    (dir: 1 | -1) => {
      const n = project.palette.length;
      setSelected((c) => ((c - 1 + dir + n) % n) + 1);
    },
    [project],
  );

  const moveCursor = useCallback(
    (dx: number, dy: number) => {
      const w = project.width;
      const h = project.height;
      const current = live.current.cursor;
      const x = current < 0 ? Math.floor(w / 2) : (current % w) + dx;
      const y = current < 0 ? Math.floor(h / 2) : Math.floor(current / w) + dy;
      const nx = Math.min(w - 1, Math.max(0, x));
      const ny = Math.min(h - 1, Math.max(0, y));
      const slot = nx + ny * w;
      setCursor(slot);
      viewRef.current?.focusSlot(slot);
      const color = session.colorAt(slot);
      setAnnouncement(
        color
          ? `Row ${ny + 1}, column ${nx + 1}: number ${color}${session.isFilled(slot) ? ", filled" : ""}`
          : `Row ${ny + 1}, column ${nx + 1}: empty`,
      );
    },
    [project, session],
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTyping(e.target) || document.querySelector("[role=dialog], [role=alertdialog]")) return;
      const view = viewRef.current;
      const mod = e.ctrlKey || e.metaKey;
      const onCanvas = e.target === canvasRef.current;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) session.redo();
        else session.undo();
        return;
      }
      if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        session.redo();
        return;
      }
      if (mod || e.altKey) return;
      if (onCanvas && e.key.startsWith("Arrow")) {
        e.preventDefault();
        const dx = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0;
        const dy = e.key === "ArrowUp" ? -1 : e.key === "ArrowDown" ? 1 : 0;
        if (is3d) {
          if (e.shiftKey) view?.pan(-dx * 30, -dy * 30);
          else view?.rotate(dx * 25, dy * 25);
        } else moveCursor(dx, dy);
        return;
      }
      if (onCanvas && !is3d && (e.key === "Enter" || e.key === " ") && live.current.cursor >= 0) {
        e.preventDefault();
        const slot = live.current.cursor;
        if (live.current.tool === "fill") session.floodFill(slot, live.current.selected);
        else session.fill(slot, live.current.selected);
        return;
      }
      switch (e.key) {
        case " ":
          if (!spaceHeld.current) {
            spaceHeld.current = true;
            if (canvasRef.current) canvasRef.current.style.cursor = is3d ? "grab" : "grab";
          }
          e.preventDefault();
          break;
        case "p":
        case "P":
          setTool("paint");
          break;
        case "b":
        case "B":
        case "g":
        case "G":
          setTool("fill");
          break;
        case "h":
        case "H":
        case "v":
        case "V":
          setTool("move");
          break;
        case "[":
          cycleColor(-1);
          break;
        case "]":
          cycleColor(1);
          break;
        case "n":
        case "N":
          findNext();
          break;
        case "+":
        case "=":
          view?.zoomBy(1.5);
          break;
        case "-":
        case "_":
          view?.zoomBy(1 / 1.5);
          break;
        case "0":
          view?.fit();
          break;
        default:
          break;
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === " ") {
        spaceHeld.current = false;
        if (canvasRef.current) canvasRef.current.style.cursor = "";
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [session, is3d, cycleColor, findNext, moveCursor]);

  const snapshot = useCallback(() => {
    const view = viewRef.current;
    return view ? view.snapshot() : Promise.reject(new Error("Nothing to capture"));
  }, []);

  const tools = [
    {
      value: "paint" as const,
      label: "Paint (P)",
      icon: <Brush aria-hidden="true" />,
      iconOnly: true,
    },
    {
      value: "fill" as const,
      label: "Bucket fill (B)",
      icon: <PaintBucket aria-hidden="true" />,
      iconOnly: true,
    },
    {
      value: "move" as const,
      label: is3d ? "Orbit (H)" : "Move (H)",
      icon: is3d ? <Rotate3d aria-hidden="true" /> : <Hand aria-hidden="true" />,
      iconOnly: true,
    },
  ];

  const pct = progressLabel(snap.done, snap.total);

  return (
    <div className={styles.screen} data-tool={tool}>
      <a href="#play-canvas" className="skip-link">
        Skip to canvas
      </a>
      {viewError ? (
        <div className={styles.error} role="alert">
          <p>{viewError}</p>
          <p className={styles.muted}>Try a recent version of Chrome, Edge, Firefox or Safari.</p>
        </div>
      ) : null}
      <canvas
        id="play-canvas"
        ref={canvasRef}
        className={styles.canvas}
        tabIndex={0}
        // oxlint-disable-next-line jsx-a11y/no-interactive-element-to-noninteractive-role -- a focusable canvas with its own keyboard model is an ARIA application
        role="application"
        aria-roledescription={is3d ? "3D color by number canvas" : "color by number canvas"}
        aria-label={`${project.name}. ${pct} complete. Selected color ${selected}.`}
        aria-describedby="canvas-help"
      />
      <p id="canvas-help" className="visually-hidden">
        {is3d
          ? "Tap or click a face to paint it with the selected color. Drag with the orbit tool, or use two fingers or the arrow keys to rotate. Pinch or scroll to zoom."
          : "Tap or drag to paint cells with the selected color. Use the arrow keys to move a cursor and Enter to paint. Pinch or scroll to zoom, two fingers to pan."}
      </p>
      <canvas ref={confettiRef} className={styles.confetti} aria-hidden="true" />

      <header ref={topRef} className={styles.topBar}>
        <div className={styles.panel}>
          <IconButton label="Back to library" icon={<ArrowLeft />} onClick={() => navigate("/")} />
          <div className={styles.titleBlock}>
            <h1 className={styles.title}>{project.name}</h1>
            <div className={styles.progressRow}>
              <ProgressBar
                value={snap.done}
                max={snap.total}
                label="Progress"
                className={styles.progress}
              />
              <span className={styles.percent} aria-hidden="true">
                {pct}
              </span>
            </div>
          </div>
        </div>
        <div className={styles.panel}>
          <IconButton
            label="Undo"
            shortcut="⌘Z"
            icon={<Undo2 />}
            disabled={!snap.canUndo}
            onClick={() => session.undo()}
          />
          <IconButton
            label="Redo"
            shortcut="⇧⌘Z"
            icon={<Redo2 />}
            disabled={!snap.canRedo}
            onClick={() => session.redo()}
            className={styles.wideOnly}
          />
          <IconButton
            label="Find next cell"
            shortcut="N"
            icon={<LocateFixed />}
            onClick={findNext}
            className={styles.wideOnly}
          />
          <IconButton
            label="Export"
            icon={<Download />}
            onClick={() => setExportOpen(true)}
            className={styles.wideOnly}
          />
          <IconButton label="Settings" icon={<Settings />} onClick={() => setSettingsOpen(true)} />
          <Menu
            trigger={<IconButton label="More" icon={<MoreHorizontal />} />}
            items={[
              {
                label: "Redo",
                icon: <Redo2 />,
                onSelect: () => session.redo(),
                disabled: !snap.canRedo,
              },
              { label: "Find next cell", icon: <LocateFixed />, onSelect: findNext },
              { label: "Fit to screen", icon: <Expand />, onSelect: () => viewRef.current?.fit() },
              { label: "Export…", icon: <Download />, onSelect: () => setExportOpen(true) },
              ...(snap.complete
                ? [
                    {
                      label: "Replay celebration",
                      icon: <Sparkles />,
                      onSelect: () => void viewRef.current?.playCompletion(),
                    },
                  ]
                : []),
              { type: "separator" as const },
              {
                label: "Reset progress…",
                icon: <RotateCcw />,
                danger: true,
                onSelect: () => setResetOpen(true),
              },
            ]}
          />
        </div>
      </header>

      <div ref={toolsRef} className={styles.tools}>
        <SegmentedControl<Tool>
          label="Tool"
          value={tool}
          onChange={setTool}
          options={tools}
          className={styles.toolGroup}
        />
        <div className={styles.zoomGroup}>
          <IconButton
            label="Zoom in"
            shortcut="+"
            icon={<ZoomIn />}
            onClick={() => viewRef.current?.zoomBy(1.5)}
          />
          <IconButton
            label="Zoom out"
            shortcut="−"
            icon={<ZoomOut />}
            onClick={() => viewRef.current?.zoomBy(1 / 1.5)}
          />
          <IconButton
            label="Fit to screen"
            shortcut="0"
            icon={<Expand />}
            onClick={() => viewRef.current?.fit()}
          />
        </div>
      </div>

      <div ref={bottomRef} className={styles.bottomDock}>
        <Palette
          session={session}
          version={snap.version}
          selected={selected}
          onSelect={setSelected}
          vision={style.vision}
          showNames={settings.showColorNames}
        />
      </div>

      <output className="visually-hidden" aria-live="polite">
        {announcement}
      </output>

      <SettingsSheet open={settingsOpen} onOpenChange={setSettingsOpen} />
      <ExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        project={project}
        complete={snap.complete}
        snapshot={snapshot}
      />
      <ConfirmDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        title="Reset progress?"
        description={`All filled cells in “${project.name}” will be cleared. This can't be undone.`}
        confirmLabel="Reset"
        danger
        onConfirm={() => {
          session.reset();
          delete project.completedAt;
          save();
        }}
      />
      <CompletionDialog
        open={doneOpen}
        onOpenChange={setDoneOpen}
        project={project}
        cells={snap.total}
        onExport={() => {
          setDoneOpen(false);
          setExportOpen(true);
        }}
        onLibrary={() => navigate("/")}
      />
    </div>
  );
}

function CompletionDialog({
  open,
  onOpenChange,
  project,
  cells,
  onExport,
  onLibrary,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: Project;
  cells: number;
  onExport: () => void;
  onLibrary: () => void;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Masterpiece complete!"
      description={`You filled all ${cells.toLocaleString()} ${project.kind === "3d" ? "pieces" : "cells"} of “${project.name}” using ${project.palette.length} colors.`}
      actions={
        <>
          <Button onClick={() => onOpenChange(false)}>Admire it</Button>
          <Button onClick={onLibrary}>Library</Button>
          <Button variant="primary" onClick={onExport}>
            <Download aria-hidden="true" />
            Export
          </Button>
        </>
      }
    />
  );
}
