import { deleteProject, getProject, saveProject, updateSummary } from "./db";
import { createId, type Project, type ProjectSummary } from "./project";
import { buildTargets, normalizeFilled, type Targets } from "./targets";
import { createThumbnail } from "./thumbnail";

export function summarize(p: Project, targets: Targets, thumbnail?: Blob): ProjectSummary {
  let done = 0;
  for (let i = 0; i < p.filled.length; i++) if (p.filled[i] && targets.color[i]) done++;
  const summary: ProjectSummary = {
    id: p.id,
    name: p.name,
    kind: p.kind,
    width: p.width,
    height: p.height,
    depth: p.depth,
    colors: p.palette.length,
    total: targets.total,
    done,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
  if (p.completedAt !== undefined) summary.completedAt = p.completedAt;
  if (thumbnail) summary.thumbnail = thumbnail;
  return summary;
}

/** Saves a project and refreshes its library card (progress + thumbnail). */
export async function persistProject(p: Project, targets = buildTargets(p)): Promise<void> {
  normalizeFilled(p, targets);
  const thumbnail = await createThumbnail(p, targets).catch(() => undefined);
  await saveProject(p, summarize(p, targets, thumbnail));
}

export async function renameProject(id: string, name: string): Promise<void> {
  const p = await getProject(id);
  if (!p) return;
  p.name = name.trim() || p.name;
  p.updatedAt = Date.now();
  await persistProject(p);
}

export async function duplicateProject(id: string): Promise<string | undefined> {
  const p = await getProject(id);
  if (!p) return undefined;
  const now = Date.now();
  const copy: Project = {
    ...p,
    id: createId(),
    name: `${p.name} (copy)`,
    createdAt: now,
    updatedAt: now,
    filled: new Uint8Array(p.filled.length),
  };
  delete copy.openedAt;
  delete copy.completedAt;
  await persistProject(copy);
  return copy.id;
}

export async function resetProject(id: string): Promise<void> {
  const p = await getProject(id);
  if (!p) return;
  p.filled.fill(0);
  delete p.completedAt;
  delete p.openedAt;
  p.updatedAt = Date.now();
  await persistProject(p);
}

export { deleteProject, getProject, updateSummary };

/* ------------------------------------------------------------------------- */
/* Project files                                                             */
/* ------------------------------------------------------------------------- */

const FORMAT = "pixel-by-number";

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function fromBase64(text: string): Uint8Array {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

const u16ToBase64 = (a: Uint16Array) =>
  toBase64(new Uint8Array(a.buffer, a.byteOffset, a.byteLength));
const base64ToU16 = (s: string) => {
  const bytes = fromBase64(s);
  return new Uint16Array(bytes.buffer, 0, bytes.byteLength >> 1);
};

/** A portable JSON document for backups and sharing designs between devices. */
export function serializeProject(p: Project): string {
  return JSON.stringify({
    format: FORMAT,
    version: 1,
    name: p.name,
    kind: p.kind,
    width: p.width,
    height: p.height,
    depth: p.depth,
    palette: p.palette,
    numberMode: p.numberMode,
    cells: u16ToBase64(p.cells),
    faceColors: p.faceColors ? u16ToBase64(p.faceColors) : undefined,
    filled: toBase64(p.filled),
    createdAt: p.createdAt,
    completedAt: p.completedAt,
  });
}

interface ProjectFile {
  format: string;
  version: number;
  name: string;
  kind: "2d" | "3d";
  width: number;
  height: number;
  depth: number;
  palette: string[];
  numberMode?: "voxel" | "face";
  cells: string;
  faceColors?: string;
  filled?: string;
  createdAt?: number;
  completedAt?: number;
}

export function deserializeProject(json: string): Project {
  const data = JSON.parse(json) as Partial<ProjectFile>;
  if (data.format !== FORMAT || typeof data.cells !== "string" || !Array.isArray(data.palette)) {
    throw new Error("This file isn't a Pixel by Number project.");
  }
  const width = Number(data.width);
  const height = Number(data.height);
  const depth = Number(data.depth) || 1;
  const cells = base64ToU16(data.cells);
  if (cells.length !== width * height * depth) throw new Error("The project file is damaged.");
  const now = Date.now();
  const project: Project = {
    id: createId(),
    name: data.name ?? "Imported design",
    kind: data.kind === "3d" ? "3d" : "2d",
    createdAt: data.createdAt ?? now,
    updatedAt: now,
    width,
    height,
    depth,
    palette: data.palette.map(String),
    cells,
    numberMode: data.numberMode === "face" ? "face" : "voxel",
    filled: data.filled ? fromBase64(data.filled) : new Uint8Array(0),
    source: "Project file",
  };
  if (data.faceColors) project.faceColors = base64ToU16(data.faceColors);
  if (data.completedAt) project.completedAt = data.completedAt;
  return project;
}
