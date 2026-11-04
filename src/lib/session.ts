import type { Project } from "./project";
import { buildTargets, normalizeFilled, sameColorNeighbors, type Targets } from "./targets";

export interface SessionSnapshot {
  version: number;
  done: number;
  total: number;
  canUndo: boolean;
  canRedo: boolean;
  complete: boolean;
}

type FillListener = (slots: readonly number[], filled: boolean) => void;

const MAX_HISTORY = 200;

/**
 * Mutable play state for one open project: fill progress, per-color counts,
 * strokes and undo history. React reads it through `subscribe`/`getSnapshot`;
 * the renderer listens to `onFill` for incremental GPU updates.
 */
export class PlaySession {
  readonly project: Project;
  readonly targets: Targets;
  /** Filled slots per 1-based color. */
  readonly colorDone: Uint32Array;
  done = 0;

  private undoStack: number[][] = [];
  private redoStack: number[][] = [];
  private stroke: number[] | null = null;
  private listeners = new Set<() => void>();
  private fillListeners = new Set<FillListener>();
  private snapshot: SessionSnapshot;
  private version = 0;
  private scratch: number[] = [];

  constructor(project: Project) {
    this.project = project;
    this.targets = buildTargets(project);
    normalizeFilled(project, this.targets);
    this.colorDone = new Uint32Array(this.targets.colorTotals.length);
    const { filled } = project;
    const { color } = this.targets;
    for (let i = 0; i < filled.length; i++) {
      if (filled[i] && color[i]) {
        this.colorDone[color[i]!]!++;
        this.done++;
      } else if (filled[i]) {
        filled[i] = 0;
      }
    }
    this.snapshot = this.makeSnapshot();
  }

  get total(): number {
    return this.targets.total;
  }

  get complete(): boolean {
    return this.targets.total > 0 && this.done >= this.targets.total;
  }

  isColorComplete(color: number): boolean {
    return this.colorDone[color] === this.targets.colorTotals[color];
  }

  /** The first color (in palette order, starting after `from`) that still has cells left. */
  nextIncompleteColor(from: number): number | null {
    const n = this.project.palette.length;
    for (let k = 1; k <= n; k++) {
      const c = ((from - 1 + k) % n) + 1;
      if (!this.isColorComplete(c)) return c;
    }
    return null;
  }

  /** An unfilled slot of `color`, preferring the one after `after` in slot order. */
  findUnfilled(color: number, after = -1): number {
    const { filled } = this.project;
    const { color: colors, count } = this.targets;
    for (let k = 1; k <= count; k++) {
      const i = (after + k + count) % count;
      if (colors[i] === color && !filled[i]) return i;
    }
    return -1;
  }

  colorAt(slot: number): number {
    return this.targets.color[slot] ?? 0;
  }

  isFilled(slot: number): boolean {
    return this.project.filled[slot] === 1;
  }

  beginStroke(): void {
    this.stroke = [];
  }

  /** Fills `slot` if it matches `color`. Returns true when something changed. */
  fill(slot: number, color: number): boolean {
    if (slot < 0 || slot >= this.targets.count) return false;
    if (this.targets.color[slot] !== color || this.project.filled[slot]) return false;
    this.project.filled[slot] = 1;
    this.colorDone[color]!++;
    this.done++;
    if (this.stroke) this.stroke.push(slot);
    else this.pushHistory([slot]);
    this.emitFill([slot], true);
    return true;
  }

  /** Bucket fill: every connected unfilled slot with the same color. */
  floodFill(slot: number, color: number): number {
    if (this.targets.color[slot] !== color || this.project.filled[slot]) return 0;
    const changed: number[] = [];
    const stack = [slot];
    const seen = new Set<number>([slot]);
    while (stack.length > 0) {
      const s = stack.pop()!;
      if (this.project.filled[s]) continue;
      this.project.filled[s] = 1;
      changed.push(s);
      sameColorNeighbors(this.project, this.targets, s, this.scratch);
      for (const n of this.scratch) {
        if (!seen.has(n)) {
          seen.add(n);
          stack.push(n);
        }
      }
    }
    this.colorDone[color]! += changed.length;
    this.done += changed.length;
    if (this.stroke) this.stroke.push(...changed);
    else this.pushHistory(changed);
    this.emitFill(changed, true);
    return changed.length;
  }

  endStroke(): void {
    const stroke = this.stroke;
    this.stroke = null;
    if (stroke && stroke.length > 0) this.pushHistory(stroke);
    else this.notify();
  }

  /** Reverts the in-progress stroke (e.g. when a paint gesture turns into a pinch). */
  cancelStroke(): void {
    const stroke = this.stroke;
    this.stroke = null;
    if (stroke && stroke.length > 0) this.setFilled(stroke, false);
    this.notify();
  }

  undo(): void {
    const entry = this.undoStack.pop();
    if (!entry) return;
    this.redoStack.push(entry);
    this.setFilled(entry, false);
    this.notify();
  }

  redo(): void {
    const entry = this.redoStack.pop();
    if (!entry) return;
    this.undoStack.push(entry);
    this.setFilled(entry, true);
    this.notify();
  }

  reset(): void {
    this.project.filled.fill(0);
    this.colorDone.fill(0);
    this.done = 0;
    this.undoStack = [];
    this.redoStack = [];
    this.emitFill([], false);
    this.notify();
  }

  /** Fills everything (used by the "reveal" option and tests). */
  fillAll(): void {
    const changed: number[] = [];
    const { filled } = this.project;
    for (let i = 0; i < filled.length; i++) {
      const c = this.targets.color[i]!;
      if (c && !filled[i]) {
        filled[i] = 1;
        this.colorDone[c]!++;
        changed.push(i);
      }
    }
    this.done += changed.length;
    this.pushHistory(changed);
    this.emitFill(changed, true);
  }

  onFill(listener: FillListener): () => void {
    this.fillListeners.add(listener);
    return () => this.fillListeners.delete(listener);
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): SessionSnapshot => this.snapshot;

  private setFilled(slots: readonly number[], value: boolean): void {
    const { filled } = this.project;
    const changed: number[] = [];
    for (const s of slots) {
      if (Boolean(filled[s]) === value) continue;
      filled[s] = value ? 1 : 0;
      const c = this.targets.color[s]!;
      this.colorDone[c]! += value ? 1 : -1;
      this.done += value ? 1 : -1;
      changed.push(s);
    }
    this.emitFill(changed, value);
  }

  private pushHistory(entry: number[]): void {
    if (entry.length === 0) return;
    this.undoStack.push(entry);
    if (this.undoStack.length > MAX_HISTORY) this.undoStack.shift();
    this.redoStack = [];
    this.notify();
  }

  private emitFill(slots: readonly number[], filled: boolean): void {
    for (const l of this.fillListeners) l(slots, filled);
    // Progress changes mid-stroke should still reach the UI.
    if (this.stroke) this.notify();
  }

  private makeSnapshot(): SessionSnapshot {
    return {
      version: this.version,
      done: this.done,
      total: this.targets.total,
      canUndo: this.undoStack.length > 0,
      canRedo: this.redoStack.length > 0,
      complete: this.complete,
    };
  }

  private notify(): void {
    this.version++;
    this.snapshot = this.makeSnapshot();
    for (const l of this.listeners) l();
  }
}
