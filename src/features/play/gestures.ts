import type { PlaySession } from "@/lib/session";
import type { SceneView } from "@/render/types";

export type Tool = "paint" | "fill" | "move";

export interface GestureContext {
  view: SceneView;
  session: PlaySession;
  /** Read lazily so the listeners never need re-binding. */
  getTool: () => Tool;
  getSelected: () => number;
  getSmartSelect: () => boolean;
  /** A tap landed on a different number; the caller switches the active color. */
  onSmartSelect: (color: number) => void;
  /** Whether space is held (temporary hand tool). */
  isSpaceHeld: () => boolean;
}

type Mode = "none" | "paint" | "fill" | "pan" | "orbit" | "pinch";

const TAP_SLOP = 8;
/** If a second finger lands this soon after a paint stroke began, the stroke is undone (it was a pinch). */
const PINCH_GRACE_MS = 220;

/**
 * Pointer Events based input for mouse, pen and touch:
 * - one finger / left button: paint, bucket fill or move depending on the tool
 * - two fingers: pinch to zoom + drag to pan
 * - middle/right button or space: temporary pan (2D) / orbit (3D)
 * - wheel: zoom (mouse), pan or orbit (trackpad), ctrl+wheel/pinch: zoom
 */
export function attachGestures(canvas: HTMLCanvasElement, ctx: GestureContext): () => void {
  const pointers = new Map<number, { x: number; y: number }>();
  let mode: Mode = "none";
  let start = { x: 0, y: 0 };
  let last = { x: 0, y: 0 };
  let moved = false;
  let strokeStart = 0;
  let pinch = { dist: 1, x: 0, y: 0 };

  const pos = (e: PointerEvent | WheelEvent) => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const paintAt = (x: number, y: number) => {
    const slot = ctx.view.pick(x, y);
    if (slot < 0) return;
    ctx.session.fill(slot, ctx.getSelected());
  };

  const paintLine = (from: { x: number; y: number }, to: { x: number; y: number }) => {
    const dist = Math.hypot(to.x - from.x, to.y - from.y);
    const steps = Math.max(1, Math.ceil(dist / 3));
    for (let i = 1; i <= steps; i++) {
      paintAt(from.x + ((to.x - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps);
    }
  };

  const dragMode = (e: PointerEvent): Mode => {
    const is3d = ctx.view.kind === "3d";
    if (e.button === 1 || (e.button === 0 && e.shiftKey && is3d)) return "pan";
    if (e.button === 2) return is3d ? "orbit" : "pan";
    if (ctx.isSpaceHeld()) return is3d ? "orbit" : "pan";
    switch (ctx.getTool()) {
      case "paint":
        return "paint";
      case "fill":
        return "fill";
      case "move":
        return is3d ? "orbit" : "pan";
    }
  };

  const startPinch = () => {
    const [a, b] = [...pointers.values()] as [{ x: number; y: number }, { x: number; y: number }];
    pinch = {
      dist: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
      x: (a.x + b.x) / 2,
      y: (a.y + b.y) / 2,
    };
  };

  const onPointerDown = (e: PointerEvent) => {
    if (e.pointerType === "mouse" && e.button > 2) return;
    const p = pos(e);
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, p);

    if (pointers.size === 2) {
      // A second finger turns any gesture into pinch/pan.
      if (mode === "paint") {
        if (performance.now() - strokeStart < PINCH_GRACE_MS) ctx.session.cancelStroke();
        else ctx.session.endStroke();
      }
      mode = "pinch";
      startPinch();
      return;
    }
    if (pointers.size > 2) return;

    canvas.focus({ preventScroll: true });
    mode = dragMode(e);
    start = p;
    last = p;
    moved = false;
    if (mode === "paint") {
      strokeStart = performance.now();
      ctx.session.beginStroke();
      paintAt(p.x, p.y);
    }
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!pointers.has(e.pointerId)) return;
    const p = pos(e);
    pointers.set(e.pointerId, p);

    if (mode === "pinch" && pointers.size >= 2) {
      const [a, b] = [...pointers.values()] as [{ x: number; y: number }, { x: number; y: number }];
      const dist = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      ctx.view.zoomAt(mx, my, dist / pinch.dist);
      ctx.view.pan(mx - pinch.x, my - pinch.y);
      pinch = { dist, x: mx, y: my };
      return;
    }

    if (!moved && Math.hypot(p.x - start.x, p.y - start.y) > TAP_SLOP) {
      moved = true;
      // Dragging with the bucket moves the view instead.
      if (mode === "fill") mode = ctx.view.kind === "3d" ? "orbit" : "pan";
    }

    const dx = p.x - last.x;
    const dy = p.y - last.y;
    if (mode === "paint") paintLine(last, p);
    else if (mode === "pan") ctx.view.pan(dx, dy);
    else if (mode === "orbit") ctx.view.rotate(dx, dy);
    last = p;
  };

  const onPointerUp = (e: PointerEvent) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);

    if (mode === "pinch") {
      // Stay idle until every finger lifts so the remaining finger doesn't paint.
      if (pointers.size === 0) mode = "none";
      else startPinch();
      return;
    }

    const p = pos(e);
    if (mode === "paint") {
      if (!moved && e.type === "pointerup" && ctx.getSmartSelect()) {
        const slot = ctx.view.pick(p.x, p.y);
        const color = slot >= 0 ? ctx.session.colorAt(slot) : 0;
        if (color > 0 && color !== ctx.getSelected() && !ctx.session.isFilled(slot)) {
          ctx.onSmartSelect(color);
          ctx.session.fill(slot, color);
        }
      }
      if (e.type === "pointercancel") ctx.session.cancelStroke();
      else ctx.session.endStroke();
    } else if (mode === "fill" && !moved && e.type === "pointerup") {
      const slot = ctx.view.pick(p.x, p.y);
      if (slot >= 0) {
        let color = ctx.getSelected();
        const actual = ctx.session.colorAt(slot);
        if (actual !== color && actual > 0 && ctx.getSmartSelect() && !ctx.session.isFilled(slot)) {
          ctx.onSmartSelect(actual);
          color = actual;
        }
        ctx.session.floodFill(slot, color);
      }
    }
    mode = "none";
  };

  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const p = pos(e);
    const pixelScale = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
    const dx = e.deltaX * pixelScale;
    const dy = e.deltaY * pixelScale;
    // Trackpad pinch arrives as ctrl+wheel; mouse wheels send coarse, vertical-only steps.
    const isMouseWheel =
      e.deltaMode !== 0 || (dx === 0 && Math.abs(dy) >= 40 && Number.isInteger(dy));
    if (e.ctrlKey || e.metaKey) {
      ctx.view.zoomAt(p.x, p.y, Math.exp(-dy * 0.01));
    } else if (isMouseWheel) {
      ctx.view.zoomAt(p.x, p.y, Math.exp(-dy * 0.0018));
    } else if (ctx.view.kind === "3d") {
      ctx.view.rotate(-dx, -dy);
    } else {
      ctx.view.pan(-dx, -dy);
    }
  };

  const prevent = (e: Event) => e.preventDefault();

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);
  canvas.addEventListener("wheel", onWheel, { passive: false });
  canvas.addEventListener("contextmenu", prevent);
  // Safari's proprietary pinch events would otherwise zoom the page.
  canvas.addEventListener("gesturestart", prevent);
  canvas.addEventListener("gesturechange", prevent);

  return () => {
    canvas.removeEventListener("pointerdown", onPointerDown);
    canvas.removeEventListener("pointermove", onPointerMove);
    canvas.removeEventListener("pointerup", onPointerUp);
    canvas.removeEventListener("pointercancel", onPointerUp);
    canvas.removeEventListener("wheel", onWheel);
    canvas.removeEventListener("contextmenu", prevent);
    canvas.removeEventListener("gesturestart", prevent);
    canvas.removeEventListener("gesturechange", prevent);
  };
}
