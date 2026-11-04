import type { Insets, RenderStyle } from "./types";

interface Tween {
  start: number;
  duration: number;
  update: (t: number) => void;
  resolve: () => void;
}

/**
 * Shared plumbing for WebGL 2 views: context creation and loss handling,
 * device-pixel-ratio aware resizing, on-demand rendering and tweens.
 * Frames are only drawn when something changed, which keeps phones cool.
 */
export abstract class GLView {
  protected readonly canvas: HTMLCanvasElement;
  protected gl: WebGL2RenderingContext;
  protected cssWidth = 1;
  protected cssHeight = 1;
  protected dpr = 1;
  protected insets: Insets = { top: 0, right: 0, bottom: 0, left: 0 };
  protected style: RenderStyle | null = null;
  private raf = 0;
  private tweens: Tween[] = [];
  private readonly resizeObserver: ResizeObserver;
  private disposed = false;
  private lost = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const gl = canvas.getContext("webgl2", {
      antialias: true,
      alpha: true,
      premultipliedAlpha: true,
      preserveDrawingBuffer: false,
      powerPreference: "default",
    });
    if (!gl) throw new Error("WebGL 2 isn't available on this device or browser.");
    this.gl = gl;
    canvas.addEventListener("webglcontextlost", this.onContextLost);
    canvas.addEventListener("webglcontextrestored", this.onContextRestored);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.measure();
  }

  /** Create programs, buffers and textures (again after a context loss). */
  protected abstract initGL(): void;
  /** Draws a frame; returns true to keep animating. */
  protected abstract draw(now: number): boolean;
  protected abstract onResize(): void;

  setStyle(style: RenderStyle): void {
    this.style = style;
    this.requestRender();
  }

  setInsets(insets: Insets): void {
    this.insets = insets;
    this.onResize();
    this.requestRender();
  }

  requestRender = (): void => {
    if (this.raf || this.disposed || this.lost) return;
    this.raf = requestAnimationFrame(this.frame);
  };

  /** Runs `update(t)` with t from 0 to 1 over `duration` ms, honoring reduced motion. */
  protected tween(duration: number, update: (t: number) => void): Promise<void> {
    if (this.style?.reducedMotion) duration = 0;
    return new Promise((resolve) => {
      if (duration <= 0) {
        update(1);
        this.requestRender();
        resolve();
        return;
      }
      this.tweens.push({ start: -1, duration, update, resolve });
      this.requestRender();
    });
  }

  protected cancelTweens(): void {
    for (const t of this.tweens) {
      t.update(1);
      t.resolve();
    }
    this.tweens = [];
  }

  /** Visible (unobstructed) area in CSS pixels. */
  protected get visible(): { x: number; y: number; width: number; height: number } {
    const { top, right, bottom, left } = this.insets;
    return {
      x: left,
      y: top,
      width: Math.max(40, this.cssWidth - left - right),
      height: Math.max(40, this.cssHeight - top - bottom),
    };
  }

  /** Renders a frame synchronously and encodes it (valid until the browser composites). */
  snapshot(): Promise<Blob> {
    this.draw(performance.now());
    return new Promise((resolve, reject) => {
      this.canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("Snapshot failed"))),
        "image/png",
      );
    });
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.resizeObserver.disconnect();
    this.canvas.removeEventListener("webglcontextlost", this.onContextLost);
    this.canvas.removeEventListener("webglcontextrestored", this.onContextRestored);
    this.cancelTweens();
  }

  private frame = (now: number): void => {
    this.raf = 0;
    if (this.disposed || this.lost) return;
    const active: Tween[] = [];
    for (const t of this.tweens) {
      if (t.start < 0) t.start = now;
      const p = Math.min(1, (now - t.start) / t.duration);
      t.update(p);
      if (p >= 1) t.resolve();
      else active.push(t);
    }
    this.tweens = active;
    const more = this.draw(now);
    if (more || this.tweens.length > 0) this.requestRender();
  };

  private measure(): boolean {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));
    const changed =
      width !== this.canvas.width || height !== this.canvas.height || dpr !== this.dpr;
    this.cssWidth = Math.max(1, rect.width);
    this.cssHeight = Math.max(1, rect.height);
    this.dpr = dpr;
    if (changed) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    return changed;
  }

  private resize(): void {
    this.measure();
    this.onResize();
    this.requestRender();
  }

  private onContextLost = (event: Event): void => {
    event.preventDefault();
    this.lost = true;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  };

  private onContextRestored = (): void => {
    this.lost = false;
    this.initGL();
    this.requestRender();
  };
}
