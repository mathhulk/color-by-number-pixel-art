import { type DBSchema, type IDBPDatabase, openDB } from "idb";

import type { Project, ProjectSummary } from "./project";

interface PixelDB extends DBSchema {
  projects: { key: string; value: Project };
  summaries: { key: string; value: ProjectSummary; indexes: { updatedAt: number } };
}

let dbPromise: Promise<IDBPDatabase<PixelDB>> | null = null;

function db(): Promise<IDBPDatabase<PixelDB>> {
  dbPromise ??= openDB<PixelDB>("pixel-by-number", 1, {
    upgrade(database) {
      database.createObjectStore("projects", { keyPath: "id" });
      const summaries = database.createObjectStore("summaries", { keyPath: "id" });
      summaries.createIndex("updatedAt", "updatedAt");
    },
  });
  return dbPromise;
}

const listeners = new Set<() => void>();

/** Notifies library views when anything is written. */
export function onLibraryChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit(): void {
  for (const l of listeners) l();
}

export async function listSummaries(): Promise<ProjectSummary[]> {
  const all = await (await db()).getAllFromIndex("summaries", "updatedAt");
  return all.toReversed();
}

export async function getProject(id: string): Promise<Project | undefined> {
  return (await db()).get("projects", id);
}

export async function saveProject(project: Project, summary: ProjectSummary): Promise<void> {
  const tx = (await db()).transaction(["projects", "summaries"], "readwrite");
  await Promise.all([
    tx.objectStore("projects").put(project),
    tx.objectStore("summaries").put(summary),
    tx.done,
  ]);
  emit();
}

export async function updateSummary(summary: ProjectSummary): Promise<void> {
  await (await db()).put("summaries", summary);
  emit();
}

export async function deleteProject(id: string): Promise<void> {
  const tx = (await db()).transaction(["projects", "summaries"], "readwrite");
  await Promise.all([
    tx.objectStore("projects").delete(id),
    tx.objectStore("summaries").delete(id),
    tx.done,
  ]);
  emit();
}

/** Asks the browser not to evict saved artwork under storage pressure. */
export async function requestPersistentStorage(): Promise<void> {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) {
      await navigator.storage.persist();
    }
  } catch {
    // Not supported or denied — saving still works, it is just best-effort.
  }
}
