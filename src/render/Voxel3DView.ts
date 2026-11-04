import { hexToRgb, type RGB } from "@/lib/color";
import type { Project } from "@/lib/project";
import { FACE_NORMALS, isFaceExposed, slotFor, type Targets } from "@/lib/targets";

import {
  compileProgram,
  createDataTexture,
  createGlyphTexture,
  GLSL_COMMON,
  type Uniforms,
  uniformLocations,
} from "./gl";
import { GLView } from "./GLView";
import {
  clamp,
  easeInOutCubic,
  invert,
  lerp,
  lookAt,
  type Mat4,
  multiply,
  perspective,
  transformPoint,
  type Vec3,
} from "./math";
import type { SceneView } from "./types";

const STATE_WIDTH = 2048;
const FOV = (40 * Math.PI) / 180;

const VERTEX = /* glsl */ `#version 300 es
precision highp float;
precision highp int;
layout(location = 0) in vec2 a_corner;
layout(location = 1) in uvec4 a_a; // x, y, z, face
layout(location = 2) in uvec4 a_b; // color, slot lo, slot hi, random

uniform mat4 u_viewProj;
uniform vec3 u_offset;
uniform sampler2D u_state;
uniform float u_intro;
uniform float u_height;

out vec2 v_uv;
out vec3 v_normal;
out float v_y;
flat out int v_color;
flat out int v_filled;

const vec3 ORIGIN[6] = vec3[6](vec3(1,1,1), vec3(0,1,0), vec3(0,1,0), vec3(0,0,1), vec3(0,1,1), vec3(1,1,0));
const vec3 U[6] = vec3[6](vec3(0,0,-1), vec3(0,0,1), vec3(1,0,0), vec3(1,0,0), vec3(1,0,0), vec3(-1,0,0));
const vec3 V[6] = vec3[6](vec3(0,-1,0), vec3(0,-1,0), vec3(0,0,1), vec3(0,0,-1), vec3(0,-1,0), vec3(0,-1,0));
const vec3 N[6] = vec3[6](vec3(1,0,0), vec3(-1,0,0), vec3(0,1,0), vec3(0,-1,0), vec3(0,0,1), vec3(0,0,-1));

void main() {
  int face = int(a_a.w);
  vec3 vox = vec3(a_a.xyz);
  vec3 p = vox + ORIGIN[face] + U[face] * a_corner.x + V[face] * a_corner.y;
  int slot = int(a_b.y) | (int(a_b.z) << 16);
  v_filled = texelFetch(u_state, ivec2(slot % ${STATE_WIDTH}, slot / ${STATE_WIDTH}), 0).r > 0.5 ? 1 : 0;

  if (u_intro < 1.0) {
    // Voxels drop into place, bottom layers first.
    float delay = vox.y / max(u_height, 1.0) * 0.6 + float(a_b.w) / 255.0 * 0.25;
    float t = clamp((u_intro * 1.85 - delay) / 0.5, 0.0, 1.0);
    float e = 1.0 - pow(1.0 - t, 3.0);
    vec3 center = vox + 0.5;
    p = center + (p - center) * max(t, 0.0001);
    p.y += (1.0 - e) * (u_height * 0.5 + 4.0);
  }

  v_uv = a_corner;
  v_normal = N[face];
  v_color = int(a_b.x);
  v_y = vox.y;
  gl_Position = u_viewProj * vec4(p + u_offset, 1.0);
}`;

const FRAGMENT = /* glsl */ `#version 300 es
precision highp float;
precision highp int;

in vec2 v_uv;
in vec3 v_normal;
in float v_y;
flat in int v_color;
flat in int v_filled;
out vec4 o_color;

uniform sampler2D u_palette;
uniform int u_selected;
uniform float u_tint;
uniform float u_numbers;
uniform float u_gridLines;
uniform float u_highlight;
uniform vec3 u_accent;
uniform vec3 u_paper;
uniform vec3 u_ink;
uniform float u_complete;
uniform float u_height;
uniform float u_dpr;
uniform vec3 u_lightDir;
${GLSL_COMMON}

void main() {
  vec2 dx = dFdx(v_uv);
  vec2 dy = dFdy(v_uv);
  float px = 1.0 / max(max(length(dx), length(dy)), 1e-5);
  vec3 shown = vision(texelFetch(u_palette, ivec2(v_color - 1, 0), 0).rgb);
  float diffuse = max(dot(normalize(v_normal), u_lightDir), 0.0);
  float sky = 0.5 + 0.5 * v_normal.y;
  float light = 0.62 + 0.28 * diffuse + 0.1 * sky;
  float edge = 1.0 - smoothstep(0.0, u_dpr * 1.2, edgeDistance(v_uv, px));
  vec3 col;

  if (v_filled == 1) {
    col = shown * light;
    col = mix(col, col * 0.7, edge * 0.35);
  } else {
    col = mix(u_paper, shown, u_tint);
    bool selected = v_color == u_selected;
    if (selected && u_highlight > 0.5) col = mix(col, u_accent, 0.34);
    col *= mix(1.0, light, 0.55);
    if (u_gridLines > 0.5) col = mix(col, u_ink, edge * 0.25);
    if (u_numbers > 0.5) {
      float vis = smoothstep(12.0, 20.0, px / u_dpr);
      if (vis > 0.0) {
        float m = numberMask(v_color, v_uv, dx, dy);
        float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
        vec3 ink = lum < 0.42 ? vec3(1.0) : u_ink;
        col = mix(col, ink, m * vis * (selected ? 1.0 : 0.82));
      }
    }
  }

  if (u_complete > 0.0 && u_complete < 1.0) {
    float pos = v_y / max(u_height, 1.0);
    float glow = exp(-pow((pos - (u_complete * 1.5 - 0.25)) * 7.0, 2.0));
    col = mix(col, vec3(1.0), glow * 0.55);
  }

  o_color = vec4(col, 1.0);
}`;

const PAPER_LIGHT: RGB = [250, 249, 246];
const PAPER_DARK: RGB = [70, 72, 80];
const INK_LIGHT: RGB = [28, 28, 32];
const INK_DARK: RGB = [240, 240, 244];

/** WebGL 2 renderer for voxel designs: one instanced quad per visible cube face. */
export class Voxel3DView extends GLView implements SceneView {
  readonly kind = "3d" as const;
  private program!: WebGLProgram;
  private u!: Uniforms;
  private vao: WebGLVertexArrayObject | null = null;
  private instanceBuffer: WebGLBuffer | null = null;
  private quadBuffer: WebGLBuffer | null = null;
  private glyphs!: WebGLTexture;
  private stateTex: WebGLTexture | null = null;
  private paletteTex: WebGLTexture | null = null;
  private instanceCount = 0;

  private project: Project | null = null;
  private targets: Targets | null = null;
  private state = new Uint8Array(0);
  private stateRows = 1;
  private dirtyRows: { min: number; max: number } | null = null;
  private selected = 0;
  private intro = 1;
  private complete = 0;

  // Orbit camera around `target` (world space, grid centered on the origin).
  private yaw = Math.PI / 5;
  private pitch = 0.5;
  private distance = 30;
  private target: Vec3 = [0, 0, 0];
  private viewProj: Mat4 = new Float32Array(16);

  constructor(canvas: HTMLCanvasElement) {
    super(canvas);
    this.initGL();
  }

  get zoomLevel(): number {
    return this.fitDistance() / this.distance;
  }

  protected initGL(): void {
    const gl = this.gl;
    this.program = compileProgram(gl, VERTEX, FRAGMENT);
    this.u = uniformLocations(gl, this.program);
    this.glyphs = createGlyphTexture(gl);
    this.quadBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    if (this.project && this.targets) this.upload(this.project, this.targets);
  }

  setProject(project: Project, targets: Targets): void {
    const prev = this.project;
    const sameSize =
      prev?.width === project.width &&
      prev.height === project.height &&
      prev.depth === project.depth;
    this.project = project;
    this.targets = targets;
    this.stateRows = Math.max(1, Math.ceil(targets.count / STATE_WIDTH));
    this.state = new Uint8Array(STATE_WIDTH * this.stateRows);
    for (let i = 0; i < targets.count; i++) this.state[i] = project.filled[i] ? 255 : 0;
    this.upload(project, targets);
    if (!sameSize) this.fit(false);
  }

  private upload(p: Project, t: Targets): void {
    const gl = this.gl;
    // Build one instance per exposed face: [x, y, z, face, color, slotLo, slotHi, random].
    const data: number[] = [];
    const { width: w, height: h } = p;
    for (let slot = 0; slot < t.count; slot++) {
      const voxel = t.voxel![slot]!;
      const x = voxel % w;
      const y = Math.floor(voxel / w) % h;
      const z = Math.floor(voxel / (w * h));
      const rand = (Math.imul(voxel, 2654435761) >>> 24) & 255;
      const face = t.face![slot]!;
      const faces = face >= 0 ? [face] : [0, 1, 2, 3, 4, 5];
      for (const f of faces) {
        if (!isFaceExposed(p, x, y, z, f)) continue;
        data.push(x, y, z, f, t.color[slot]!, slot & 0xffff, slot >>> 16, rand);
      }
    }
    const instances = Uint16Array.from(data);
    this.instanceCount = instances.length / 8;

    if (this.vao) gl.deleteVertexArray(this.vao);
    if (this.instanceBuffer) gl.deleteBuffer(this.instanceBuffer);
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.instanceBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, instances, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribIPointer(1, 4, gl.UNSIGNED_SHORT, 16, 0);
    gl.vertexAttribDivisor(1, 1);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribIPointer(2, 4, gl.UNSIGNED_SHORT, 16, 8);
    gl.vertexAttribDivisor(2, 1);
    gl.bindVertexArray(null);

    for (const tex of [this.stateTex, this.paletteTex]) if (tex) gl.deleteTexture(tex);
    this.stateTex = createDataTexture(gl, STATE_WIDTH, this.stateRows, this.state, {
      internalFormat: gl.R8,
      format: gl.RED,
      type: gl.UNSIGNED_BYTE,
    });
    const palette = new Uint8Array(p.palette.length * 4);
    p.palette.forEach((hex, i) => palette.set([...hexToRgb(hex), 255], i * 4));
    this.paletteTex = createDataTexture(gl, p.palette.length, 1, palette, {
      internalFormat: gl.RGBA8,
      format: gl.RGBA,
      type: gl.UNSIGNED_BYTE,
    });
    this.dirtyRows = null;
    this.requestRender();
  }

  updateSlots(slots: readonly number[]): void {
    const p = this.project;
    const t = this.targets;
    if (!p || !t) return;
    if (slots.length === 0) {
      for (let i = 0; i < t.count; i++) this.state[i] = p.filled[i] ? 255 : 0;
      this.dirtyRows = { min: 0, max: this.stateRows - 1 };
    }
    for (const s of slots) {
      this.state[s] = p.filled[s] ? 255 : 0;
      const row = Math.floor(s / STATE_WIDTH);
      const d = this.dirtyRows;
      this.dirtyRows = d
        ? { min: Math.min(d.min, row), max: Math.max(d.max, row) }
        : { min: row, max: row };
    }
    this.requestRender();
  }

  setSelected(color: number): void {
    this.selected = color;
    this.requestRender();
  }

  setCursor(): void {
    // Keyboard navigation in 3D orbits the camera instead of moving a cursor.
  }

  pick(x: number, y: number): number {
    const p = this.project;
    const t = this.targets;
    if (!p || !t) return -1;
    const inv = invert(this.viewProj);
    if (!inv) return -1;
    const ndcX = (x / this.cssWidth) * 2 - 1;
    const ndcY = 1 - (y / this.cssHeight) * 2;
    const near = transformPoint(inv, ndcX, ndcY, -1);
    const far = transformPoint(inv, ndcX, ndcY, 1);
    // Convert to grid space (grid occupies [0, size]).
    const o: Vec3 = [near[0] + p.width / 2, near[1] + p.height / 2, near[2] + p.depth / 2];
    const dir: Vec3 = [far[0] - near[0], far[1] - near[1], far[2] - near[2]];
    const len = Math.hypot(...dir);
    dir[0] /= len;
    dir[1] /= len;
    dir[2] /= len;
    const hit = raycastVoxels(p, o, dir);
    if (!hit) return -1;
    return slotFor(t, hit.voxel, hit.face);
  }

  pan(dx: number, dy: number): void {
    const v = this.visible;
    const worldPerPx = (2 * this.distance * Math.tan(FOV / 2)) / v.height;
    const right: Vec3 = [Math.cos(this.yaw), 0, -Math.sin(this.yaw)];
    const up: Vec3 = [
      -Math.sin(this.pitch) * Math.sin(this.yaw),
      Math.cos(this.pitch),
      -Math.sin(this.pitch) * Math.cos(this.yaw),
    ];
    for (let i = 0; i < 3; i++)
      this.target[i] = this.target[i]! - right[i]! * dx * worldPerPx + up[i]! * dy * worldPerPx;
    this.clampTarget();
    this.requestRender();
  }

  rotate(dx: number, dy: number): void {
    this.yaw -= dx * 0.008;
    this.pitch = clamp(this.pitch + dy * 0.008, -1.5, 1.5);
    this.requestRender();
  }

  zoomAt(_x: number, _y: number, factor: number): void {
    this.distance = clamp(this.distance / factor, this.minDistance(), this.fitDistance() * 3);
    this.requestRender();
  }

  zoomBy(factor: number): void {
    const from = this.distance;
    const to = clamp(from / factor, this.minDistance(), this.fitDistance() * 3);
    void this.tween(220, (t) => {
      this.distance = lerp(from, to, easeInOutCubic(t));
    });
  }

  fit(animate = true): void {
    this.moveCamera(
      { target: [0, 0, 0], distance: this.fitDistance(), yaw: this.yaw, pitch: this.pitch },
      animate ? 420 : 0,
    );
  }

  focusSlot(slot: number): void {
    const p = this.project;
    const t = this.targets;
    if (!p || !t || slot < 0) return;
    const voxel = t.voxel![slot]!;
    const x = voxel % p.width;
    const y = Math.floor(voxel / p.width) % p.height;
    const z = Math.floor(voxel / (p.width * p.height));
    let face = t.face![slot]!;
    if (face < 0) face = [2, 4, 0, 5, 1, 3].find((f) => isFaceExposed(p, x, y, z, f)) ?? 4;
    const n = FACE_NORMALS[face]!;
    const yaw = n[1] !== 0 ? this.yaw : Math.atan2(n[0], n[2]);
    const pitch = n[1] > 0 ? 1.1 : n[1] < 0 ? -1.1 : 0.35;
    // Take the shortest way around.
    let fromYaw = this.yaw;
    while (yaw - fromYaw > Math.PI) fromYaw += Math.PI * 2;
    while (fromYaw - yaw > Math.PI) fromYaw -= Math.PI * 2;
    this.yaw = fromYaw;
    this.moveCamera(
      {
        target: [x + 0.5 - p.width / 2, y + 0.5 - p.height / 2, z + 0.5 - p.depth / 2],
        distance: Math.max(this.minDistance() * 1.5, Math.min(this.distance, 14)),
        yaw,
        pitch,
      },
      600,
    );
  }

  playIntro(): Promise<void> {
    this.intro = 0;
    return this.tween(1600, (t) => {
      this.intro = t;
    });
  }

  playCompletion(): Promise<void> {
    const startYaw = this.yaw;
    const from = { target: [...this.target] as Vec3, distance: this.distance, pitch: this.pitch };
    const fitDistance = this.fitDistance();
    return this.tween(2600, (t) => {
      const e = easeInOutCubic(t);
      this.yaw = startYaw + e * Math.PI * 2;
      this.pitch = lerp(from.pitch, 0.45, e);
      this.distance = lerp(from.distance, fitDistance, e);
      for (let i = 0; i < 3; i++) this.target[i] = lerp(from.target[i]!, 0, e);
      this.complete = t >= 1 ? 0 : t;
    });
  }

  override dispose(): void {
    super.dispose();
    const gl = this.gl;
    for (const t of [this.stateTex, this.paletteTex, this.glyphs]) if (t) gl.deleteTexture(t);
    if (this.vao) gl.deleteVertexArray(this.vao);
    for (const b of [this.instanceBuffer, this.quadBuffer]) if (b) gl.deleteBuffer(b);
    gl.deleteProgram(this.program);
  }

  protected onResize(): void {
    this.requestRender();
  }

  protected draw(): boolean {
    const gl = this.gl;
    const p = this.project;
    const style = this.style;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clearDepth(1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    if (!p || !style || !this.vao || !this.stateTex || !this.paletteTex) return false;

    if (this.dirtyRows) {
      const { min, max } = this.dirtyRows;
      gl.bindTexture(gl.TEXTURE_2D, this.stateTex);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texSubImage2D(
        gl.TEXTURE_2D,
        0,
        0,
        min,
        STATE_WIDTH,
        max - min + 1,
        gl.RED,
        gl.UNSIGNED_BYTE,
        this.state.subarray(min * STATE_WIDTH, (max + 1) * STATE_WIDTH),
      );
      this.dirtyRows = null;
    }

    this.viewProj = this.computeViewProj();
    gl.useProgram(this.program);
    gl.disable(gl.BLEND);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    const u = this.u;
    gl.uniformMatrix4fv(u.u_viewProj!, false, this.viewProj);
    gl.uniform3f(u.u_offset!, -p.width / 2, -p.height / 2, -p.depth / 2);
    gl.uniform1f(u.u_intro!, this.intro);
    gl.uniform1f(u.u_height!, p.height);
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
    gl.uniform1f(u.u_complete!, this.complete);
    // Light follows the camera loosely so the visible side is always readable.
    const lx = Math.sin(this.yaw + 0.6);
    const lz = Math.cos(this.yaw + 0.6);
    const ll = Math.hypot(lx, 1.4, lz);
    gl.uniform3f(u.u_lightDir!, lx / ll, 1.4 / ll, lz / ll);
    gl.uniformMatrix3fv(u.u_vision!, true, style.vision as unknown as Float32List);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.stateTex);
    gl.uniform1i(u.u_state!, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.paletteTex);
    gl.uniform1i(u.u_palette!, 1);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.glyphs);
    gl.uniform1i(u.u_glyphs!, 2);

    gl.bindVertexArray(this.vao);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.instanceCount);
    gl.bindVertexArray(null);
    gl.disable(gl.DEPTH_TEST);
    return false;
  }

  private computeViewProj(): Mat4 {
    const v = this.visible;
    const aspect = this.cssWidth / this.cssHeight;
    const cp = Math.cos(this.pitch);
    const eye: Vec3 = [
      this.target[0] + this.distance * cp * Math.sin(this.yaw),
      this.target[1] + this.distance * Math.sin(this.pitch),
      this.target[2] + this.distance * cp * Math.cos(this.yaw),
    ];
    const radius = this.radius();
    const near = Math.max(0.05, this.distance - radius * 2);
    const far = this.distance + radius * 2 + 10;
    // Use a vertical FOV relative to the *visible* height, then shift the projection
    // so the model is centered in the area not covered by toolbars.
    const fov = 2 * Math.atan(Math.tan(FOV / 2) * (this.cssHeight / v.height));
    const proj = perspective(fov, aspect, near, far);
    const ndcX = ((v.x + v.width / 2) / this.cssWidth) * 2 - 1;
    const ndcY = 1 - ((v.y + v.height / 2) / this.cssHeight) * 2;
    proj[8] = proj[8]! - ndcX;
    proj[9] = proj[9]! - ndcY;
    const up: Vec3 = [0, 1, 0];
    return multiply(proj, lookAt(eye, this.target, up));
  }

  private radius(): number {
    const p = this.project;
    return p ? Math.hypot(p.width, p.height, p.depth) / 2 : 10;
  }

  private fitDistance(): number {
    const v = this.visible;
    const aspect = v.width / v.height;
    const halfFov = FOV / 2;
    const halfFovX = Math.atan(Math.tan(halfFov) * aspect);
    const r = this.radius() * 1.05;
    return Math.max(r / Math.sin(Math.min(halfFov, halfFovX)), 4);
  }

  private minDistance(): number {
    return Math.max(3, this.radius() * 0.2);
  }

  private clampTarget(): void {
    const p = this.project;
    if (!p) return;
    const limits = [p.width, p.height, p.depth];
    for (let i = 0; i < 3; i++)
      this.target[i] = clamp(this.target[i]!, -limits[i]! * 0.75, limits[i]! * 0.75);
  }

  private moveCamera(
    to: { target: Vec3; distance: number; yaw: number; pitch: number },
    duration: number,
  ): void {
    const from = {
      target: [...this.target] as Vec3,
      distance: this.distance,
      yaw: this.yaw,
      pitch: this.pitch,
    };
    void this.tween(duration, (t) => {
      const e = easeInOutCubic(t);
      for (let i = 0; i < 3; i++) this.target[i] = lerp(from.target[i]!, to.target[i]!, e);
      this.distance = lerp(from.distance, to.distance, e);
      this.yaw = lerp(from.yaw, to.yaw, e);
      this.pitch = lerp(from.pitch, to.pitch, e);
    });
  }
}

/** Amanatides–Woo voxel traversal. Returns the first solid voxel and the face the ray entered through. */
export function raycastVoxels(
  p: Pick<Project, "width" | "height" | "depth" | "cells">,
  origin: Vec3,
  dir: Vec3,
): { voxel: number; face: number } | null {
  const size = [p.width, p.height, p.depth];
  let tMin = 0;
  let tMax = Infinity;
  let entryAxis = -1;
  for (let a = 0; a < 3; a++) {
    const d = dir[a]!;
    const o = origin[a]!;
    if (Math.abs(d) < 1e-9) {
      if (o < 0 || o > size[a]!) return null;
      continue;
    }
    let t0 = (0 - o) / d;
    let t1 = (size[a]! - o) / d;
    if (t0 > t1) [t0, t1] = [t1, t0];
    if (t0 > tMin) {
      tMin = t0;
      entryAxis = a;
    }
    tMax = Math.min(tMax, t1);
    if (tMin > tMax) return null;
  }
  const pos = [0, 1, 2].map((a) => origin[a]! + dir[a]! * (tMin + 1e-6));
  const cell = pos.map((v, a) => clamp(Math.floor(v), 0, size[a]! - 1));
  const step = dir.map((d) => (d > 0 ? 1 : -1));
  const tDelta = dir.map((d) => (Math.abs(d) < 1e-9 ? Infinity : Math.abs(1 / d)));
  const tNext = [0, 1, 2].map((a) => {
    const d = dir[a]!;
    if (Math.abs(d) < 1e-9) return Infinity;
    const boundary = d > 0 ? cell[a]! + 1 : cell[a]!;
    return tMin + (boundary - pos[a]!) / d;
  });
  let face = entryAxis >= 0 ? entryAxis * 2 + (step[entryAxis]! > 0 ? 1 : 0) : 4;
  const maxSteps = p.width + p.height + p.depth + 3;
  for (let i = 0; i < maxSteps; i++) {
    const [x, y, z] = cell as [number, number, number];
    if (x < 0 || y < 0 || z < 0 || x >= p.width || y >= p.height || z >= p.depth) return null;
    const index = x + p.width * (y + p.height * z);
    if (p.cells[index]) return { voxel: index, face };
    let axis = 0;
    if (tNext[1]! < tNext[axis]!) axis = 1;
    if (tNext[2]! < tNext[axis]!) axis = 2;
    cell[axis] = cell[axis]! + step[axis]!;
    tNext[axis] = tNext[axis]! + tDelta[axis]!;
    face = axis * 2 + (step[axis]! > 0 ? 1 : 0);
  }
  return null;
}
