export function compileProgram(
  gl: WebGL2RenderingContext,
  vertex: string,
  fragment: string,
): WebGLProgram {
  const program = gl.createProgram();
  const shaders = [
    [gl.VERTEX_SHADER, vertex],
    [gl.FRAGMENT_SHADER, fragment],
  ] as const;
  for (const [type, source] of shaders) {
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS) && !gl.isContextLost()) {
      const log = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(`Shader compile failed: ${log ?? "unknown error"}`);
    }
    gl.attachShader(program, shader);
    gl.deleteShader(shader);
  }
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS) && !gl.isContextLost()) {
    throw new Error(`Program link failed: ${gl.getProgramInfoLog(program) ?? "unknown error"}`);
  }
  return program;
}

export type Uniforms = Record<string, WebGLUniformLocation | null>;

export function uniformLocations(gl: WebGL2RenderingContext, program: WebGLProgram): Uniforms {
  const out: Uniforms = {};
  const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS) as number;
  for (let i = 0; i < count; i++) {
    const info = gl.getActiveUniform(program, i);
    if (info) out[info.name.replace(/\[0\]$/, "")] = gl.getUniformLocation(program, info.name);
  }
  return out;
}

export interface TextureOptions {
  internalFormat: GLenum;
  format: GLenum;
  type: GLenum;
  filter?: GLenum;
}

export function createDataTexture(
  gl: WebGL2RenderingContext,
  width: number,
  height: number,
  data: ArrayBufferView | null,
  { internalFormat, format, type, filter = gl.NEAREST }: TextureOptions,
): WebGLTexture {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, width, height, 0, format, type, data);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}

/** Shared GLSL: color-vision matrix, number glyph rendering and easing. */
export const GLSL_COMMON = /* glsl */ `
uniform sampler2D u_glyphs;
uniform mat3 u_vision;

const float GLYPH_ASPECT = 0.6667;

vec3 toLinear(vec3 c) { return pow(c, vec3(2.2)); }
vec3 toSrgb(vec3 c) { return pow(clamp(c, 0.0, 1.0), vec3(1.0 / 2.2)); }
vec3 vision(vec3 c) { return toSrgb(u_vision * toLinear(c)); }

float easeOutBack(float t) {
  float c1 = 1.70158;
  float c3 = c1 + 1.0;
  return 1.0 + c3 * pow(t - 1.0, 3.0) + c1 * pow(t - 1.0, 2.0);
}

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

// Coverage of the number n (1–999) centered in a unit cell; uv has y pointing down.
float numberMask(int n, vec2 uv, vec2 dx, vec2 dy) {
  int count = n >= 100 ? 3 : (n >= 10 ? 2 : 1);
  float h = count == 3 ? 0.40 : 0.50;
  float tw = h * GLYPH_ASPECT * float(count);
  vec2 o = vec2(0.5 - tw * 0.5, 0.5 - h * 0.5);
  vec2 p = (uv - o) / vec2(tw, h);
  if (p.x < 0.0 || p.y < 0.0 || p.x > 1.0 || p.y > 1.0) return 0.0;
  float fx = p.x * float(count);
  int k = min(int(fx), count - 1);
  int divisor = k == count - 1 ? 1 : (k == count - 2 ? 10 : 100);
  int digit = (n / divisor) % 10;
  vec2 auv = vec2((float(digit) + fract(fx)) / 10.0, p.y);
  vec2 s = vec2(float(count) / tw / 10.0, 1.0 / h);
  return textureGrad(u_glyphs, auv, dx * s, dy * s).r;
}

// Distance in device pixels from the nearest cell edge.
float edgeDistance(vec2 uv, float pxPerCell) {
  vec2 e = min(uv, 1.0 - uv) * pxPerCell;
  return min(e.x, e.y);
}

// Coverage of a grid line "width" device pixels wide along the cell's edges.
// "shared" (-x, +x, -y, +y) is 1 where the neighbor across that edge draws its
// own half of the line: each side then draws width / 2 so the halves meet into a
// single line instead of stacking into a double-thick one. Edges without such a
// neighbor (outlines, filled neighbors) draw the full width on this side.
float gridLine(vec2 uv, vec2 pxPerCell, float width, vec4 shared) {
  vec4 d = vec4(uv.x, 1.0 - uv.x, uv.y, 1.0 - uv.y) * pxPerCell.xxyy;
  vec4 w = mix(vec4(width), vec4(width * 0.5), shared);
  vec4 cov = clamp(w - d + 0.5, 0.0, 1.0);
  return max(max(cov.x, cov.y), max(cov.z, cov.w));
}
`;

let glyphCanvas: HTMLCanvasElement | null = null;

/** A 10-glyph atlas (0–9), white on black, so the red channel is coverage. */
export function glyphAtlas(): HTMLCanvasElement {
  if (glyphCanvas) return glyphCanvas;
  const cellW = 64;
  const cellH = 96;
  const canvas = document.createElement("canvas");
  canvas.width = cellW * 10;
  canvas.height = cellH;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `600 70px "Inter Variable", Inter, system-ui, sans-serif`;
  for (let d = 0; d < 10; d++) ctx.fillText(String(d), d * cellW + cellW / 2, cellH / 2 + 4);
  glyphCanvas = canvas;
  return canvas;
}

export function createGlyphTexture(gl: WebGL2RenderingContext): WebGLTexture {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, glyphAtlas());
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}
