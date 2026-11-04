/// Module Web Worker that runs the import pipeline off the main thread.
import { processImport } from "./pipeline";
import type { ImportResult, ImportSettings, ImportSource } from "./types";

export interface ImportWorkerRequest {
  id: number;
  source: ImportSource;
  settings: ImportSettings;
}

export type ImportWorkerResponse =
  | { id: number; result: ImportResult }
  | { id: number; error: string };

/** The bits of DedicatedWorkerGlobalScope we use (tsconfig does not include the WebWorker lib). */
interface WorkerScope {
  onmessage: ((event: MessageEvent<ImportWorkerRequest>) => void) | null;
  postMessage(message: ImportWorkerResponse, options: StructuredSerializeOptions): void;
}

declare const self: WorkerScope;

self.onmessage = (event) => {
  const { id, source, settings } = event.data;
  try {
    const result = processImport(source, settings);
    const transfer: Transferable[] = [];
    for (const arr of [result.cells, result.faceColors]) {
      if (arr?.buffer instanceof ArrayBuffer) transfer.push(arr.buffer);
    }
    self.postMessage({ id, result }, { transfer });
  } catch (err) {
    self.postMessage({ id, error: err instanceof Error ? err.message : String(err) }, {});
  }
};
