import type { Project } from "./project";
import { buildTargets, CORRECT, slotState, type Targets } from "./targets";

/** The ordered list of slot changes to play back, starting from a blank design. */
export interface ReplayTrack {
  slot: Uint32Array;
  before: Uint16Array;
  after: Uint16Array;
  /** Unix ms, or NaN for steps reconstructed without a timestamp. */
  time: Float64Array;
  length: number;
  /**
   * Leading steps that were reconstructed because they happened before
   * recording was available (older saves). They're ordered by color.
   */
  reconstructed: number;
}

/**
 * Builds a replay from the project's log. If the log doesn't start from a blank
 * design (older saves), the missing fills are reconstructed and prepended so the
 * replay always ends exactly at the current artwork.
 */
export function buildReplay(p: Project, targets: Targets = buildTargets(p)): ReplayTrack {
  const n = targets.count;
  const log = p.log;
  const logLength = log?.slot.length ?? 0;

  // State at the start of the log = current state with the log undone.
  const start = new Uint16Array(n);
  for (let i = 0; i < n; i++) start[i] = slotState(p, i);
  for (let i = logLength - 1; i >= 0; i--) start[log!.slot[i]!] = log!.before[i]!;

  const prefix: number[] = [];
  for (let i = 0; i < n; i++) if (start[i]) prefix.push(i);
  // Color by color reads naturally, like someone working through the palette.
  prefix.sort((a, b) => targets.color[a]! - targets.color[b]! || a - b);

  const length = prefix.length + logLength;
  const track: ReplayTrack = {
    slot: new Uint32Array(length),
    before: new Uint16Array(length),
    after: new Uint16Array(length),
    time: new Float64Array(length),
    length,
    reconstructed: prefix.length,
  };
  prefix.forEach((s, i) => {
    track.slot[i] = s;
    track.after[i] = start[s]!;
    track.time[i] = Number.NaN;
  });
  if (log && logLength > 0) {
    track.slot.set(log.slot, prefix.length);
    track.before.set(log.before, prefix.length);
    track.after.set(log.after, prefix.length);
    track.time.set(log.time, prefix.length);
  }
  return track;
}

/**
 * Plays a replay into a scratch copy of the project (so the real progress is
 * untouched). `seek` moves to any step, forwards or backwards.
 */
export class ReplayPlayer {
  readonly track: ReplayTrack;
  /** A copy of the project whose fill state shows the replay. */
  readonly view: Project;
  /** Number of steps applied. */
  position = 0;

  constructor(project: Project, track: ReplayTrack) {
    this.track = track;
    this.view = {
      ...project,
      filled: new Uint8Array(project.filled.length),
      mistakes: new Uint16Array(project.filled.length),
    };
  }

  get length(): number {
    return this.track.length;
  }

  /** The slot changed by the most recent step, or -1. */
  get lastSlot(): number {
    return this.position > 0 ? this.track.slot[this.position - 1]! : -1;
  }

  /** Moves to `position` and returns the slots that changed. */
  seek(position: number): number[] {
    const target = Math.max(0, Math.min(this.track.length, Math.round(position)));
    const changed: number[] = [];
    const { slot, before, after } = this.track;
    while (this.position < target) {
      const i = this.position++;
      this.set(slot[i]!, after[i]!);
      changed.push(slot[i]!);
    }
    while (this.position > target) {
      const i = --this.position;
      this.set(slot[i]!, before[i]!);
      changed.push(slot[i]!);
    }
    return changed;
  }

  private set(slot: number, state: number): void {
    this.view.filled[slot] = state === CORRECT ? 1 : 0;
    this.view.mistakes![slot] = state === CORRECT ? 0 : state;
  }
}
