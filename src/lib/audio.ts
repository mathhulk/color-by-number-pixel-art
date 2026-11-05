/**
 * Calm, synthesized sound design (Web Audio, no audio files, works offline).
 *
 * - Fills play a soft pluck whose pitch comes from the color's place on a
 *   pentatonic scale, so painting turns into a gentle, never-dissonant melody.
 * - Mistakes are a quiet low "thud", never a buzzer.
 * - Finishing a color or the whole picture plays a small chime.
 * - Optional ambient music: slow, evolving pad chords with the odd sparkle.
 *
 * Browsers only allow audio after a user gesture, so `unlock()` is called from
 * the first pointer/key event.
 */

/** Major pentatonic steps (semitones): always consonant, whatever the order. */
const PENTATONIC = [0, 2, 4, 7, 9];
/** Fill notes start at C5. */
const FILL_ROOT = 523.25;
/** Ambient chords (semitones from C3), slowly cycled. */
const CHORDS = [
  [0, 7, 14, 16, 23], // Cmaj9
  [-3, 4, 12, 16, 19], // Am7-ish
  [5, 12, 16, 21, 24], // Fmaj7
  [2, 9, 14, 17, 21], // Dm9
  [7, 14, 17, 19, 26], // G6sus
];
const AMBIENT_ROOT = 130.81;

const semis = (root: number, n: number) => root * 2 ** (n / 12);

export function noteForColor(color: number): number {
  const i = Math.max(0, color - 1);
  const octave = Math.floor(i / PENTATONIC.length) % 2;
  return semis(FILL_ROOT, PENTATONIC[i % PENTATONIC.length]! + octave * 12);
}

export interface SoundSettings {
  effects: boolean;
  music: boolean;
  /** 0–1 */
  volume: number;
  muted: boolean;
}

class SoundEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private musicBus!: GainNode;
  private reverb!: ConvolverNode;
  private settings: SoundSettings = { effects: true, music: false, volume: 0.7, muted: false };
  private lastFill = 0;
  private recentFills = 0;
  private ambientTimer = 0;
  private sparkleTimer = 0;
  private chordIndex = 0;
  private hidden = false;

  configure(settings: SoundSettings): void {
    this.settings = settings;
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const level = settings.muted ? 0 : settings.volume;
    this.master.gain.setTargetAtTime(level, now, 0.05);
    this.sfx.gain.setTargetAtTime(settings.effects ? 1 : 0, now, 0.05);
    this.updateAmbient();
  }

  /** Must run inside a user gesture the first time. Safe to call repeatedly. */
  unlock(): void {
    if (typeof AudioContext === "undefined") return;
    if (!this.ctx) {
      if (!this.settings.effects && !this.settings.music) return;
      this.ctx = new AudioContext({ latencyHint: "interactive" });
      this.build(this.ctx);
      this.configure(this.settings);
      document.addEventListener("visibilitychange", this.onVisibility);
    }
    if (this.ctx.state === "suspended" && !this.hidden) void this.ctx.resume();
  }

  /** A pluck for a correct fill. Rapid strokes are thinned out and softened. */
  fill(color: number): void {
    const ctx = this.ready();
    if (!ctx) return;
    const now = performance.now();
    const gap = now - this.lastFill;
    if (gap < 45) return;
    this.recentFills = gap < 250 ? Math.min(this.recentFills + 1, 8) : 0;
    this.lastFill = now;
    const soften = 1 - this.recentFills * 0.07;
    const detune = (Math.random() - 0.5) * 8;
    this.pluck(noteForColor(color), ctx.currentTime, 0.16 * soften, detune);
  }

  /** A soft, low thud for a wrong color. */
  wrong(): void {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    osc.type = "sine";
    osc.frequency.setValueAtTime(196, t);
    osc.frequency.exponentialRampToValueAtTime(130, t + 0.18);
    filter.type = "lowpass";
    filter.frequency.value = 600;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.22, t + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
    osc.connect(filter).connect(gain).connect(this.sfx);
    osc.start(t);
    osc.stop(t + 0.3);
  }

  /** A tiny tick when choosing a color. */
  select(color: number): void {
    const ctx = this.ready();
    if (!ctx) return;
    this.bell(noteForColor(color) * 2, ctx.currentTime, 0.035, 0.12);
  }

  /** A short downward blip for undo. */
  undo(): void {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    this.pluck(semis(FILL_ROOT, 7), t, 0.06);
    this.pluck(semis(FILL_ROOT, 0), t + 0.06, 0.05);
  }

  /** A rising three-note chime when a color is finished. */
  colorComplete(color: number): void {
    const ctx = this.ready();
    if (!ctx) return;
    const base = noteForColor(color);
    const t = ctx.currentTime + 0.05;
    [0, 4, 7].forEach((step, i) => this.bell(semis(base, step), t + i * 0.09, 0.09, 1.4));
  }

  /** The finale: a rising arpeggio over a warm swell. */
  complete(): void {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime + 0.1;
    [0, 4, 7, 12, 16, 19, 24].forEach((step, i) =>
      this.bell(semis(FILL_ROOT, step), t + i * 0.11, 0.1, 2.2),
    );
    for (const step of [-12, -5, 0, 4]) this.pad(semis(FILL_ROOT, step), t, 3.5, 0.035, this.sfx);
  }

  private ready(): AudioContext | null {
    const ctx = this.ctx;
    if (!ctx || this.settings.muted || !this.settings.effects || this.settings.volume === 0)
      return null;
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  }

  private build(ctx: AudioContext): void {
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    // A gentle compressor keeps chords and fast strokes from ever getting harsh.
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 3;
    this.master.connect(comp).connect(ctx.destination);
    this.sfx = ctx.createGain();
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = 0;
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = impulse(ctx, 2.8);
    const wet = ctx.createGain();
    wet.gain.value = 0.35;
    this.reverb.connect(wet).connect(this.master);
    for (const bus of [this.sfx, this.musicBus]) {
      bus.connect(this.master);
      bus.connect(this.reverb);
    }
  }

  private pluck(freq: number, t: number, level: number, detune = 0): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const sub = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    osc.type = "triangle";
    osc.frequency.value = freq;
    osc.detune.value = detune;
    sub.type = "sine";
    sub.frequency.value = freq / 2;
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(3200, t);
    filter.frequency.exponentialRampToValueAtTime(900, t + 0.35);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(level, t + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
    osc.connect(filter);
    sub.connect(filter);
    filter.connect(gain).connect(this.sfx);
    osc.start(t);
    sub.start(t);
    osc.stop(t + 0.75);
    sub.stop(t + 0.75);
  }

  private bell(
    freq: number,
    t: number,
    level: number,
    decay: number,
    out: AudioNode = this.sfx,
  ): void {
    const ctx = this.ctx!;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(level, t + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    gain.connect(out);
    // Fundamental plus a quiet inharmonic partial gives a soft glassy bell.
    for (const [ratio, amp] of [
      [1, 1],
      [2.76, 0.18],
    ] as const) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq * ratio;
      g.gain.value = amp;
      osc.connect(g).connect(gain);
      osc.start(t);
      osc.stop(t + decay + 0.05);
    }
  }

  private pad(freq: number, t: number, length: number, level: number, out: AudioNode): void {
    const ctx = this.ctx!;
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 1100;
    filter.Q.value = 0.3;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(level, t + length * 0.35);
    gain.gain.setTargetAtTime(0, t + length * 0.6, length * 0.18);
    filter.connect(gain).connect(out);
    for (const detune of [-6, 6]) {
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.value = freq;
      osc.detune.value = detune;
      osc.connect(filter);
      osc.start(t);
      osc.stop(t + length * 1.6);
    }
  }

  /* ------------------------------ Ambient music ---------------------------- */

  private updateAmbient(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const on = this.settings.music && !this.settings.muted && !this.hidden;
    this.musicBus.gain.setTargetAtTime(on ? 0.9 : 0, ctx.currentTime, on ? 1.5 : 0.4);
    if (on && !this.ambientTimer) {
      this.nextChord();
      this.nextSparkle();
    } else if (!on) {
      clearTimeout(this.ambientTimer);
      clearTimeout(this.sparkleTimer);
      this.ambientTimer = 0;
      this.sparkleTimer = 0;
    }
  }

  private nextChord = (): void => {
    const ctx = this.ctx;
    if (!ctx) return;
    const chord = CHORDS[this.chordIndex % CHORDS.length]!;
    // Mostly step forward, sometimes linger or skip, so it never feels like a loop.
    this.chordIndex += Math.random() < 0.75 ? 1 : 2;
    const length = 9 + Math.random() * 4;
    const t = ctx.currentTime + 0.05;
    for (const step of chord) this.pad(semis(AMBIENT_ROOT, step), t, length, 0.028, this.musicBus);
    this.ambientTimer = window.setTimeout(this.nextChord, length * 650);
  };

  private nextSparkle = (): void => {
    const ctx = this.ctx;
    if (!ctx) return;
    const step = PENTATONIC[Math.floor(Math.random() * PENTATONIC.length)]!;
    const octave = Math.random() < 0.5 ? 12 : 24;
    this.bell(
      semis(AMBIENT_ROOT, step + octave + 12),
      ctx.currentTime + 0.02,
      0.025,
      3,
      this.musicBus,
    );
    this.sparkleTimer = window.setTimeout(this.nextSparkle, 2200 + Math.random() * 4800);
  };

  private onVisibility = (): void => {
    this.hidden = document.visibilityState === "hidden";
    if (!this.ctx) return;
    if (this.hidden) void this.ctx.suspend();
    else void this.ctx.resume();
    this.updateAmbient();
  };
}

/** Stereo noise with an exponential tail: a cheap, soft room reverb. */
function impulse(ctx: AudioContext, seconds: number): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 3.2;
    }
  }
  return buffer;
}

export const sound = new SoundEngine();
