import { hexToRgb, type RGB } from "@/lib/color";
import type { Project } from "@/lib/project";
import type { Targets } from "@/lib/targets";

import {
  compileProgram,
  createDataTexture,
  createGlyphTexture,
  GLSL_COMMON,
  type Uniforms,
  uniformLocations,
} from "./gl";
import { GLView } from "./GLView";
import { clamp, easeInOutCubic, lerp } from "./math";
import type { SceneView } from "./types";

const VERTEX = /* glsl */ `#version 300 es
layout(location = 0) in vec2 a_pos;
uniform vec2 u_grid;
uniform vec4 u_view;
out vec2 v_world;
void main() {
  v_world = a_pos * u_grid;
  gl_Position = vec4(v_world * u_view.xy + u_view.zw, 0.0, 1.0);
}`;

const FRAGMENT = /* glsl */ `#version 300 es
precision highp float;
precision highp int;
precision highp usampler2D;

in vec2 v_world;
out vec4 o_color;

uniform usampler2D u_cells;
uniform sampler2D u_state;
uniform sampler2D u_palette;
uniform vec2 u_grid;
uniform float u_pxPerCell;
uniform float u_dpr;
uniform int u_selected;
uniform float u_tint;
uniform float u_numbers;
uniform float u_gridLines;
uniform float u_highlight;
uniform vec3 u_accent;
uniform vec3 u_paper;
uniform vec3 u_ink;
uniform float u_intro;
uniform float u_complete;
uniform ivec2 u_cursor;
${GLSL_COMMON}

// Whether the cell at c draws grid lines (non-empty and not yet filled).
float drawsGrid(ivec2 c) {
  if (c.x < 0 || c.y < 0 || c.x >= int(u_grid.x) || c.y >= int(u_grid.y)) return 0.0;
  if (texelFetch(u_cells, c, 0).r == 0u) return 0.0;
  return texelFetch(u_state, c, 0).r > 0.5 ? 0.0 : 1.0;
}

void main() {
  vec2 dx = dFdx(v_world);
  vec2 dy = dFdy(v_world);
  vec2 cell = floor(v_world);
  if (cell.x < 0.0 || cell.y < 0.0 || cell.x >= u_grid.x || cell.y >= u_grid.y) discard;
  ivec2 ci = ivec2(cell);
  int idx = int(texelFetch(u_cells, ci, 0).r);
  if (idx == 0) discard;
  vec2 uv = v_world - cell;
  float px = u_pxPerCell;

  float alpha = 1.0;
  if (u_intro < 1.0) {
    // Cells pop in from the center outwards.
    vec2 rel = (cell + 0.5 - u_grid * 0.5) / max(u_grid.x, u_grid.y);
    float delay = length(rel) * 1.1 + hash12(cell) * 0.12;
    float t = clamp((u_intro * 1.75 - delay) / 0.45, 0.0, 1.0);
    float s = max(easeOutBack(t), 0.001);
    uv = (uv - 0.5) / s + 0.5;
    dx /= s;
    dy /= s;
    px *= s;
    if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) discard;
    alpha = clamp(t * 1.5, 0.0, 1.0);
  }

  bool filled = texelFetch(u_state, ci, 0).r > 0.5;
  vec3 shown = vision(texelFetch(u_palette, ivec2(idx - 1, 0), 0).rgb);
  vec3 col;

  if (filled) {
    col = shown;
  } else {
    col = mix(u_paper, shown, u_tint);
    bool selected = idx == u_selected;
    if (selected && u_highlight > 0.5) col = mix(col, u_accent, 0.32);
    if (u_gridLines > 0.5) {
      vec4 shared = vec4(
        drawsGrid(ci + ivec2(-1, 0)),
        drawsGrid(ci + ivec2(1, 0)),
        drawsGrid(ci + ivec2(0, -1)),
        drawsGrid(ci + ivec2(0, 1))
      );
      float line = gridLine(uv, vec2(px), max(1.0, u_dpr), shared);
      col = mix(col, u_ink, line * 0.2 * smoothstep(3.0, 8.0, px / u_dpr));
    }
    if (u_numbers > 0.5) {
      float vis = smoothstep(10.0, 16.0, px / u_dpr);
      if (vis > 0.0) {
        float m = numberMask(idx, uv, dx, dy);
        float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
        vec3 ink = lum < 0.42 ? vec3(1.0) : u_ink;
        col = mix(col, ink, m * vis * (selected ? 1.0 : 0.82));
      }
    }
  }

  if (ci == u_cursor) {
    float ring = 1.0 - smoothstep(2.0 * u_dpr, 3.0 * u_dpr, edgeDistance(uv, px));
    col = mix(col, u_accent, ring);
  }

  if (u_complete > 0.0 && u_complete < 1.0) {
    float pos = (cell.x + cell.y) / (u_grid.x + u_grid.y);
    float glow = exp(-pow((pos - (u_complete * 1.5 - 0.25)) * 8.0, 2.0));
    col = mix(col, vec3(1.0), glow * 0.6);
  }

  o_color = vec4(col * alpha, alpha);
}`;

const PAPER_LIGHT: RGB = [251, 250, 247];
const PAPER_DARK: RGB = [44, 45, 51];
const INK_LIGHT: RGB = [28, 28, 32];
const INK_DARK: RGB = [236, 236, 240];
const MAX_PX_PER_CELL = 180;

/** WebGL 2 renderer for flat pixel art: one quad, all per-cell work in the fragment shader. */
export class Grid2DView extends GLView implements SceneView {
  readonly kind = "2d" as const;
  private program!: WebGLProgram;
  private u!: Uniforms;
  private vao!: WebGLVertexArrayObject;
  private glyphs!: WebGLTexture;
  private cellsTex: WebGLTexture | null = null;
  private stateTex: WebGLTexture | null = null;
  private paletteTex: WebGLTexture | null = null;

  private project: Project | null = null;
  private state = new Uint8Array(0);
  private dirty: { x0: number; y0: number; x1: number; y1: number } | null = null;
  private selected = 0;
  private cursor = -1;
  private intro = 1;
  private complete = 0;

  /** Camera: world point (in cells) at the canvas center, and CSS px per cell. */
  private cx = 0;
  private cy = 0;
  private zoom = 16;

  constructor(canvas: HTMLCanvasElement) {
    super(canvas);
    this.initGL();
  }

  get zoomLevel(): number {
    return this.zoom / this.fitZoom();
  }

  protected initGL(): void {
    const gl = this.gl;
    this.program = compileProgram(gl, VERTEX, FRAGMENT);
    this.u = uniformLocations(gl, this.program);
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    this.glyphs = createGlyphTexture(gl);
    if (this.project) this.uploadProject(this.project);
  }

  setProject(project: Project, _targets: Targets): void {
    const sameSize =
      this.project?.width === project.width && this.project.height === project.height;
    this.project = project;
    this.state = new Uint8Array(project.width * project.height);
    for (let i = 0; i < this.state.length; i++) this.state[i] = project.filled[i] ? 255 : 0;
    this.uploadProject(project);
    if (!sameSize) this.fit(false);
  }

  private uploadProject(p: Project): void {
    const gl = this.gl;
    for (const t of [this.cellsTex, this.stateTex, this.paletteTex]) if (t) gl.deleteTexture(t);
    this.cellsTex = createDataTexture(gl, p.width, p.height, p.cells, {
      internalFormat: gl.R16UI,
      format: gl.RED_INTEGER,
      type: gl.UNSIGNED_SHORT,
    });
    this.stateTex = createDataTexture(gl, p.width, p.height, this.state, {
      internalFormat: gl.R8,
      format: gl.RED,
      type: gl.UNSIGNED_BYTE,
    });
    const palette = new Uint8Array(p.palette.length * 4);
    p.palette.forEach((hex, i) => {
      palette.set([...hexToRgb(hex), 255], i * 4);
    });
    this.paletteTex = createDataTexture(gl, p.palette.length, 1, palette, {
      internalFormat: gl.RGBA8,
      format: gl.RGBA,
      type: gl.UNSIGNED_BYTE,
    });
    this.dirty = null;
    this.requestRender();
  }

  updateSlots(slots: readonly number[]): void {
    const p = this.project;
    if (!p) return;
    if (slots.length === 0) {
      // Bulk change (reset): resync everything.
      for (let i = 0; i < this.state.length; i++) this.state[i] = p.filled[i] ? 255 : 0;
      this.dirty = { x0: 0, y0: 0, x1: p.width - 1, y1: p.height - 1 };
    }
    for (const s of slots) {
      this.state[s] = p.filled[s] ? 255 : 0;
      const x = s % p.width;
      const y = (s - x) / p.width;
      const d = this.dirty;
      this.dirty = d
        ? {
            x0: Math.min(d.x0, x),
            y0: Math.min(d.y0, y),
            x1: Math.max(d.x1, x),
            y1: Math.max(d.y1, y),
          }
        : { x0: x, y0: y, x1: x, y1: y };
    }
    this.requestRender();
  }

  setSelected(color: number): void {
    this.selected = color;
    this.requestRender();
  }

  setCursor(slot: number): void {
    this.cursor = slot;
    this.requestRender();
  }

  pick(x: number, y: number): number {
    const p = this.project;
    if (!p) return -1;
    const [wx, wy] = this.screenToWorld(x, y);
    const cx = Math.floor(wx);
    const cy = Math.floor(wy);
    if (cx < 0 || cy < 0 || cx >= p.width || cy >= p.height) return -1;
    return cx + cy * p.width;
  }

  pan(dx: number, dy: number): void {
    this.cx -= dx / this.zoom;
    this.cy -= dy / this.zoom;
    this.clampCamera();
    this.requestRender();
  }

  rotate(dx: number, dy: number): void {
    this.pan(dx, dy);
  }

  zoomAt(x: number, y: number, factor: number): void {
    const [wx, wy] = this.screenToWorld(x, y);
    this.zoom = clamp(this.zoom * factor, this.minZoom(), MAX_PX_PER_CELL);
    this.cx = wx - (x - this.cssWidth / 2) / this.zoom;
    this.cy = wy - (y - this.cssHeight / 2) / this.zoom;
    this.clampCamera();
    this.requestRender();
  }

  zoomBy(factor: number): void {
    const v = this.visible;
    const target = clamp(this.zoom * factor, this.minZoom(), MAX_PX_PER_CELL);
    const start = this.zoom;
    const [wx, wy] = this.screenToWorld(v.x + v.width / 2, v.y + v.height / 2);
    void this.tween(220, (t) => {
      const z = lerp(start, target, easeInOutCubic(t));
      this.zoom = z;
      this.cx = wx - (v.x + v.width / 2 - this.cssWidth / 2) / z;
      this.cy = wy - (v.y + v.height / 2 - this.cssHeight / 2) / z;
    });
  }

  fit(animate = true): void {
    const p = this.project;
    if (!p) return;
    const target = this.cameraFor(p.width / 2, p.height / 2, this.fitZoom());
    this.moveCamera(target, animate ? 380 : 0);
  }

  focusSlot(slot: number): void {
    const p = this.project;
    if (!p || slot < 0) return;
    const x = (slot % p.width) + 0.5;
    const y = Math.floor(slot / p.width) + 0.5;
    const zoom = Math.max(this.zoom, Math.min(36, MAX_PX_PER_CELL));
    this.moveCamera(this.cameraFor(x, y, zoom), 450);
  }

  playIntro(): Promise<void> {
    this.intro = 0;
    return this.tween(1300, (t) => {
      this.intro = t;
    });
  }

  playCompletion(): Promise<void> {
    this.complete = 0;
    this.fit(true);
    return this.tween(1800, (t) => {
      this.complete = t >= 1 ? 0 : t;
    });
  }

  override dispose(): void {
    super.dispose();
    const gl = this.gl;
    for (const t of [this.cellsTex, this.stateTex, this.paletteTex, this.glyphs])
      if (t) gl.deleteTexture(t);
    gl.deleteProgram(this.program);
  }

  protected onResize(): void {
    if (this.project) this.clampCamera();
  }

  protected draw(): boolean {
    const gl = this.gl;
    const p = this.project;
    const style = this.style;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (!p || !style || !this.cellsTex || !this.stateTex || !this.paletteTex) return false;

    if (this.dirty) {
      const { x0, y0, x1, y1 } = this.dirty;
      gl.bindTexture(gl.TEXTURE_2D, this.stateTex);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.pixelStorei(gl.UNPACK_ROW_LENGTH, p.width);
      gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, x0);
      gl.pixelStorei(gl.UNPACK_SKIP_ROWS, y0);
      gl.texSubImage2D(
        gl.TEXTURE_2D,
        0,
        x0,
        y0,
        x1 - x0 + 1,
        y1 - y0 + 1,
        gl.RED,
        gl.UNSIGNED_BYTE,
        this.state,
      );
      gl.pixelStorei(gl.UNPACK_ROW_LENGTH, 0);
      gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, 0);
      gl.pixelStorei(gl.UNPACK_SKIP_ROWS, 0);
      this.dirty = null;
    }

    gl.useProgram(this.program);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    const u = this.u;
    const sx = (2 * this.zoom) / this.cssWidth;
    const sy = (-2 * this.zoom) / this.cssHeight;
    gl.uniform2f(u.u_grid!, p.width, p.height);
    gl.uniform4f(u.u_view!, sx, sy, -this.cx * sx, -this.cy * sy);
    gl.uniform1f(u.u_pxPerCell!, this.zoom * this.dpr);
    gl.uniform1f(u.u_dpr!, this.dpr);
    gl.uniform1i(u.u_selected!, this.selected);
    gl.uniform1f(u.u_tint!, style.tint);
    gl.uniform1f(u.u_numbers!, style.showNumbers ? 1 : 0);
    gl.uniform1f(u.u_gridLines!, style.showGrid ? 1 : 0);
    gl.uniform1f(u.u_highlight!, style.highlightSelected ? 1 : 0);
    gl.uniform3f(u.u_accent!, style.accent[0] / 255, style.accent[1] / 255, style.accent[2] / 255);
    const paper = style.dark ? PAPER_DARK : PAPER_LIGHT;
    const ink = style.dark ? INK_DARK : INK_LIGHT;
    gl.uniform3f(u.u_paper!, paper[0] / 255, paper[1] / 255, paper[2] / 255);
    gl.uniform3f(u.u_ink!, ink[0] / 255, ink[1] / 255, ink[2] / 255);
    gl.uniform1f(u.u_intro!, this.intro);
    gl.uniform1f(u.u_complete!, this.complete);
    const cursorX = this.cursor >= 0 ? this.cursor % p.width : -1;
    const cursorY = this.cursor >= 0 ? Math.floor(this.cursor / p.width) : -1;
    gl.uniform2i(u.u_cursor!, cursorX, cursorY);
    gl.uniformMatrix3fv(u.u_vision!, true, style.vision as unknown as Float32List);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.cellsTex);
    gl.uniform1i(u.u_cells!, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.stateTex);
    gl.uniform1i(u.u_state!, 1);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.paletteTex);
    gl.uniform1i(u.u_palette!, 2);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, this.glyphs);
    gl.uniform1i(u.u_glyphs!, 3);

    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
    return false;
  }

  private screenToWorld(x: number, y: number): [number, number] {
    return [
      this.cx + (x - this.cssWidth / 2) / this.zoom,
      this.cy + (y - this.cssHeight / 2) / this.zoom,
    ];
  }

  private fitZoom(): number {
    const p = this.project;
    if (!p) return 16;
    const v = this.visible;
    const pad = Math.min(48, v.width * 0.06);
    return clamp(
      Math.min((v.width - pad * 2) / p.width, (v.height - pad * 2) / p.height),
      0.5,
      MAX_PX_PER_CELL,
    );
  }

  private minZoom(): number {
    return Math.min(this.fitZoom() * 0.5, 4);
  }

  /** Camera that places world point (x, y) at the center of the visible area. */
  private cameraFor(x: number, y: number, zoom: number): { cx: number; cy: number; zoom: number } {
    const v = this.visible;
    return {
      cx: x - (v.x + v.width / 2 - this.cssWidth / 2) / zoom,
      cy: y - (v.y + v.height / 2 - this.cssHeight / 2) / zoom,
      zoom,
    };
  }

  private moveCamera(to: { cx: number; cy: number; zoom: number }, duration: number): void {
    const from = { cx: this.cx, cy: this.cy, zoom: this.zoom };
    void this.tween(duration, (t) => {
      const e = easeInOutCubic(t);
      // Interpolate zoom logarithmically and keep the motion of the center natural.
      this.zoom = Math.exp(lerp(Math.log(from.zoom), Math.log(to.zoom), e));
      this.cx = lerp(from.cx, to.cx, e);
      this.cy = lerp(from.cy, to.cy, e);
    });
  }

  private clampCamera(): void {
    const p = this.project;
    if (!p) return;
    this.cx = clamp(this.cx, -p.width * 0.25, p.width * 1.25);
    this.cy = clamp(this.cy, -p.height * 0.25, p.height * 1.25);
  }
}
