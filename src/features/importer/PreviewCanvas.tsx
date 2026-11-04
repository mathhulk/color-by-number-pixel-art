import { useEffect, useRef, useState } from "react";

import type { ImportResult } from "@/import/types";
import { projectFromImport } from "@/lib/project";
import { PlaySession } from "@/lib/session";
import { Grid2DView } from "@/render/Grid2DView";
import type { SceneView } from "@/render/types";
import { Voxel3DView } from "@/render/Voxel3DView";
import { useRenderStyle } from "@/state/hooks";

import { attachGestures } from "../play/gestures";

import styles from "./ImportView.module.css";

/**
 * Live, zoomable preview of an import result using the real renderers, so what
 * you see here is exactly what you'll color.
 */
export function PreviewCanvas({
  result,
  mode,
}: {
  result: ImportResult;
  mode: "filled" | "numbers";
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef<SceneView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const style = useRenderStyle();
  const kind = result.kind;

  // Recreate the view only when switching between 2D and 3D.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      viewRef.current = kind === "3d" ? new Voxel3DView(canvas) : new Grid2DView(canvas);
    } catch (e) {
      // oxlint-disable-next-line react/set-state-in-effect -- reporting a failure of the external WebGL system
      setError(e instanceof Error ? e.message : String(e));
    }
    return () => {
      viewRef.current?.dispose();
      viewRef.current = null;
    };
  }, [kind]);

  useEffect(() => {
    viewRef.current?.setStyle({ ...style, highlightSelected: false });
  }, [style, kind]);

  useEffect(() => {
    const view = viewRef.current;
    const canvas = canvasRef.current;
    if (!view || !canvas) return;
    const session = new PlaySession(projectFromImport(result, "Preview"));
    if (mode === "filled") session.fillAll();
    view.setProject(session.project, session.targets);
    view.setSelected(0);
    return attachGestures(canvas, {
      view,
      session,
      getTool: () => "move",
      getSelected: () => 0,
      getSmartSelect: () => false,
      onSmartSelect: () => {},
      isSpaceHeld: () => false,
    });
  }, [result, mode, kind]);

  if (error) return <p className={styles.previewError}>{error}</p>;
  return (
    <canvas
      ref={canvasRef}
      className={styles.previewCanvas}
      aria-label={
        mode === "filled" ? "Preview of the finished artwork" : "Preview of the numbered puzzle"
      }
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- a live WebGL preview can't be an <img>
      role="img"
    />
  );
}
