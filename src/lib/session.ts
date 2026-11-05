import type { FillLog, Project } from "./project";
import {
  buildTargets,
  CORRECT,
  normalizeFilled,
  sameColorNeighbors,
  slotState,
  type Targets,
} from "./targets";

export interface SessionSnapshot {
  version: number;
  /** Slots filled with the right color. */
  done: number;
  total: number;
  /** Slots currently painted with a wrong color. */
  wrong: number;
  canUndo: boolean;
  canRedo: boolean;
  complete: boolean;
}

type FillListener = (slots: readonly number[]) => void;

const MAX_HISTORY = 200;

/** Growable typed-array storage for the replay log. */
class LogBuffer {
  length = 0;
  slot: Uint32Array;
  before: Uint16Array;
  after: Uint16Array;
  time: Float64Array;

  constructor(initial?: FillLog) {
    const n = initial?.slot.length ?? 0;
    const capacity = Math.max(256, n * 2);
    this.slot = new Uint32Array(capacity);
    this.before = new Uint16Array(capacity);
    this.after = new Uint16Array(capacity);
    this.time = new Float64Array(capacity);
    if (initial && n > 0) {
      this.slot.set(initial.slot);
      this.before.set(initial.before);
      this.after.set(initial.after);
      this.time.set(initial.time);
      this.length = n;
    }
  }

  push(slot: number, before: number, after: number, time: number): void {
    if (this.length === this.slot.length) this.grow();
    const i = this.length++;
    this.slot[i] = slot;
    this.before[i] = before;
    this.after[i] = after;
    this.time[i] = time;
  }

  truncate(length: number): void {
    this.length = Math.min(this.length, length);
  }

  toFillLog(): FillLog {
    return {
      slot: this.slot.slice(0, this.length),
      before: this.before.slice(0, this.length),
      after: this.after.slice(0, this.length),
      time: this.time.slice(0, this.length),
    };
  }

  private grow(): void {
    const capacity = this.slot.length * 2;
    const slot = new Uint32Array(capacity);
    const before = new Uint16Array(capacity);
    const after = new Uint16Array(capacity);
    const time = new Float64Array(capacity);
    slot.set(this.slot);
    before.set(this.before);
    after.set(this.after);
    time.set(this.time);
    this.slot = slot;
    this.before = before;
    this.after = after;
    this.time = time;
  }
}

/**
 * Mutable play state for one open project: fill progress, mistakes, per-color
 * counts, strokes, undo history and the replay log. React reads it through
 * `subscribe`/`getSnapshot`; the renderer listens to `onFill` for incremental
 * GPU updates.
 *
 * Every slot is in one of three states (see `slotState`): empty, filled
 * correctly, or painted with a wrong color (only when `allowMistakes` is on).
 */
export class PlaySession {
  readonly project: Project;
  readonly targets: Targets;
  /** Correctly filled slots per 1-based color. */
  readonly colorDone: Uint32Array;
  done = 0;
  wrong = 0;
  /** Let wrong colors stick (challenge mode). */
  allowMistakes = false;

  /** History entries are flat [slot, before, after, slot, before, after, …] lists. */
  private undoStack: number[][] = [];
  private redoStack: number[][] = [];
  private stroke: number[] | null = null;
  private strokeLogStart = 0;
  private log: LogBuffer;
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
    const { filled, mistakes } = project;
    const { color } = this.targets;
    for (let i = 0; i < filled.length; i++) {
      const c = color[i]!;
      if (!c) {
        filled[i] = 0;
        if (mistakes) mistakes[i] = 0;
      } else if (filled[i]) {
        if (mistakes) mistakes[i] = 0;
        this.colorDone[c]!++;
        this.done++;
      } else if (mistakes?.[i]) {
        this.wrong++;
      }
    }
    this.log = new LogBuffer(project.log);
    this.snapshot = this.makeSnapshot();
  }

  get total(): number {
    return this.targets.total;
  }

  get complete(): boolean {
    return this.targets.total > 0 && this.done >= this.targets.total;
  }

  /** Number of recorded changes (for the replay). */
  get logLength(): number {
    return this.log.length;
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

  /** A slot of `color` not yet filled correctly, preferring the one after `after`. */
  findUnfilled(color: number, after = -1): number {
    const { filled } = this.project;
    const { color: colors, count } = this.targets;
    for (let k = 1; k <= count; k++) {
      const i = (after + k + count) % count;
      if (colors[i] === color && !filled[i]) return i;
    }
    return -1;
  }

  /** A slot painted with a wrong color, preferring the one after `after`. */
  findMistake(after = -1): number {
    const { mistakes } = this.project;
    if (!mistakes || this.wrong === 0) return -1;
    const count = this.targets.count;
    for (let k = 1; k <= count; k++) {
      const i = (after + k + count) % count;
      if (mistakes[i]) return i;
    }
    return -1;
  }

  colorAt(slot: number): number {
    return this.targets.color[slot] ?? 0;
  }

  stateAt(slot: number): number {
    return slotState(this.project, slot);
  }

  isFilled(slot: number): boolean {
    return this.project.filled[slot] === 1;
  }

  beginStroke(): void {
    this.stroke = [];
    this.strokeLogStart = this.log.length;
  }

  /**
   * Paints `slot` with `color`. Correct colors always stick; wrong colors only
   * when `allowMistakes` is on. Returns true when something changed.
   */
  fill(slot: number, color: number): boolean {
    const next = this.nextState(slot, color);
    if (next < 0) return false;
    const before = this.stateAt(slot);
    if (before === next) return false;
    this.apply(slot, next, true);
    this.record([slot, before, next]);
    this.emitFill([slot]);
    return true;
  }

  /** Bucket fill: every connected slot of the same number that isn't already correct. */
  floodFill(slot: number, color: number): number {
    const next = this.nextState(slot, color);
    if (next < 0) return 0;
    const changes: number[] = [];
    const changed: number[] = [];
    const stack = [slot];
    const seen = new Set<number>([slot]);
    while (stack.length > 0) {
      const s = stack.pop()!;
      const before = this.stateAt(s);
      if (before === CORRECT) continue;
      if (before !== next) {
        this.apply(s, next, true);
        changes.push(s, before, next);
        changed.push(s);
      }
      sameColorNeighbors(this.project, this.targets, s, this.scratch);
      for (const n of this.scratch) {
        if (!seen.has(n)) {
          seen.add(n);
          stack.push(n);
        }
      }
    }
    if (changed.length === 0) return 0;
    this.record(changes);
    this.emitFill(changed);
    return changed.length;
  }

  endStroke(): void {
    const stroke = this.stroke;
    this.stroke = null;
    if (stroke && stroke.length > 0) this.pushHistory(stroke);
    else this.notify();
  }

  /**
   * Reverts the in-progress stroke (e.g. when a paint gesture turns into a
   * pinch) and drops it from the replay log as if it never happened.
   */
  cancelStroke(): void {
    const stroke = this.stroke;
    this.stroke = null;
    if (stroke && stroke.length > 0) {
      const changed: number[] = [];
      for (let i = stroke.length - 3; i >= 0; i -= 3) {
        this.apply(stroke[i]!, stroke[i + 1]!, false);
        changed.push(stroke[i]!);
      }
      this.log.truncate(this.strokeLogStart);
      this.emitFill(changed);
    }
    this.notify();
  }

  undo(): void {
    const entry = this.undoStack.pop();
    if (!entry) return;
    this.redoStack.push(entry);
    const changed: number[] = [];
    for (let i = entry.length - 3; i >= 0; i -= 3) {
      this.apply(entry[i]!, entry[i + 1]!, false);
      changed.push(entry[i]!);
    }
    this.emitFill(changed);
    this.notify();
  }

  redo(): void {
    const entry = this.redoStack.pop();
    if (!entry) return;
    this.undoStack.push(entry);
    const changed: number[] = [];
    for (let i = 0; i < entry.length; i += 3) {
      this.apply(entry[i]!, entry[i + 2]!, false);
      changed.push(entry[i]!);
    }
    this.emitFill(changed);
    this.notify();
  }

  /** Clears all progress, mistakes, history and the replay log. */
  reset(): void {
    this.project.filled.fill(0);
    this.project.mistakes?.fill(0);
    this.project.mistakesMade = 0;
    this.colorDone.fill(0);
    this.done = 0;
    this.wrong = 0;
    this.undoStack = [];
    this.redoStack = [];
    this.log.truncate(0);
    this.emitFill([]);
    this.notify();
  }

  /** Fills everything correctly (used by previews and tests). */
  fillAll(): void {
    const changes: number[] = [];
    const changed: number[] = [];
    for (let i = 0; i < this.targets.count; i++) {
      if (!this.targets.color[i]) continue;
      const before = this.stateAt(i);
      if (before === CORRECT) continue;
      this.apply(i, CORRECT, false);
      changes.push(i, before, CORRECT);
      changed.push(i);
    }
    this.record(changes);
    this.emitFill(changed);
  }

  /** Copies the replay log into the project so it is saved with it. */
  commitLog(): void {
    this.project.log = this.log.toFillLog();
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

  /** The state `color` would leave `slot` in, or -1 if the fill isn't allowed. */
  private nextState(slot: number, color: number): number {
    if (slot < 0 || slot >= this.targets.count || color <= 0) return -1;
    const target = this.targets.color[slot]!;
    if (!target || this.project.filled[slot]) return -1;
    if (color === target) return CORRECT;
    return this.allowMistakes ? color : -1;
  }

  /** Sets one slot's state, keeping counters, the project and the log in sync. */
  private apply(slot: number, next: number, userAction: boolean): void {
    const before = this.stateAt(slot);
    if (before === next) return;
    const target = this.targets.color[slot]!;
    if (before === CORRECT) {
      this.colorDone[target]!--;
      this.done--;
    } else if (before !== 0) {
      this.wrong--;
    }
    if (next === CORRECT) {
      this.colorDone[target]!++;
      this.done++;
    } else if (next !== 0) {
      this.wrong++;
      if (userAction) this.project.mistakesMade = (this.project.mistakesMade ?? 0) + 1;
    }
    this.project.filled[slot] = next === CORRECT ? 1 : 0;
    if (next !== 0 && next !== CORRECT) {
      this.project.mistakes ??= new Uint16Array(this.targets.count);
    }
    if (this.project.mistakes) {
      this.project.mistakes[slot] = next === CORRECT ? 0 : next;
    }
    this.log.push(slot, before, next, Date.now());
  }

  private record(changes: number[]): void {
    if (changes.length === 0) return;
    if (this.stroke) {
      for (const c of changes) this.stroke.push(c);
    } else {
      this.pushHistory(changes);
    }
  }

  private pushHistory(entry: number[]): void {
    if (entry.length === 0) return;
    this.undoStack.push(entry);
    if (this.undoStack.length > MAX_HISTORY) this.undoStack.shift();
    this.redoStack = [];
    this.notify();
  }

  private emitFill(slots: readonly number[]): void {
    for (const l of this.fillListeners) l(slots);
    // Progress changes mid-stroke should still reach the UI.
    if (this.stroke) this.notify();
  }

  private makeSnapshot(): SessionSnapshot {
    return {
      version: this.version,
      done: this.done,
      total: this.targets.total,
      wrong: this.wrong,
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
