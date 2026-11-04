import type { ImportResult, ImportSettings, ImportSource } from "./types";
import type { ImportWorkerRequest, ImportWorkerResponse } from "./worker";

interface Pending {
  id: number;
  source: ImportSource;
  settings: ImportSettings;
  /** Whether the request has been handed to the worker / fallback. */
  started: boolean;
  resolve: (result: ImportResult) => void;
  reject: (error: Error) => void;
}

function abortError(): Error {
  const err = new Error("Import superseded by a newer request");
  err.name = "AbortError";
  return err;
}

const toError = (err: unknown) => (err instanceof Error ? err : new Error(String(err)));

/**
 * Runs the import pipeline in a module Web Worker (main-thread fallback when workers are
 * unavailable). Latest request wins: starting a new `run` rejects any unfinished older one with
 * an `AbortError`. At most one request is in flight in the worker; while it computes, only the
 * newest queued request is kept, so rapid setting changes never build up a backlog.
 */
export class ImportWorkerClient {
  #worker: Worker | null = null;
  #workerUnavailable = false;
  #nextId = 1;
  /** Id of the request the worker is currently computing, if any. */
  #inFlight: number | null = null;
  /** The newest request (not yet resolved). */
  #pending: Pending | null = null;

  run(source: ImportSource, settings: ImportSettings): Promise<ImportResult> {
    const id = this.#nextId++;
    const previous = this.#pending;
    this.#pending = null;
    previous?.reject(abortError());
    return new Promise<ImportResult>((resolve, reject) => {
      this.#pending = { id, source, settings, started: false, resolve, reject };
      this.#pump();
    });
  }

  /** Terminates the worker and rejects any unfinished request with an `AbortError`. */
  dispose(): void {
    this.#worker?.terminate();
    this.#worker = null;
    this.#inFlight = null;
    const pending = this.#pending;
    this.#pending = null;
    pending?.reject(abortError());
  }

  #settle(id: number, result: ImportResult | null, error?: Error): void {
    const pending = this.#pending;
    if (!pending || pending.id !== id) return;
    this.#pending = null;
    if (result) pending.resolve(result);
    else pending.reject(error ?? new Error("Import failed"));
  }

  /** Starts the pending request if nothing is in flight. */
  #pump(): void {
    const pending = this.#pending;
    if (!pending || pending.started || this.#inFlight !== null) return;
    const worker = this.#getWorker();
    pending.started = true;
    if (!worker) {
      this.#runOnMainThread(pending);
      return;
    }
    const message: ImportWorkerRequest = {
      id: pending.id,
      source: pending.source,
      settings: pending.settings,
    };
    try {
      worker.postMessage(message, {});
      this.#inFlight = pending.id;
    } catch (err) {
      this.#settle(pending.id, null, toError(err));
    }
  }

  #runOnMainThread(pending: Pending): void {
    const { id, source, settings } = pending;
    setTimeout(() => void this.#runFallback(id, source, settings), 0);
  }

  async #runFallback(id: number, source: ImportSource, settings: ImportSettings): Promise<void> {
    if (this.#pending?.id !== id) return;
    try {
      // Loaded lazily so the pipeline stays out of the main bundle unless it is needed.
      const { processImport } = await import("./pipeline");
      if (this.#pending?.id !== id) return;
      this.#settle(id, processImport(source, settings));
    } catch (err) {
      this.#settle(id, null, toError(err));
    }
  }

  #getWorker(): Worker | null {
    if (this.#worker) return this.#worker;
    if (this.#workerUnavailable) return null;
    try {
      const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
      worker.onmessage = (event: MessageEvent<ImportWorkerResponse>) => this.#onMessage(event.data);
      worker.onerror = (event: ErrorEvent) => {
        event.preventDefault();
        this.#onWorkerCrash();
      };
      worker.onmessageerror = () => {
        const id = this.#inFlight;
        this.#inFlight = null;
        if (id !== null) this.#settle(id, null, new Error("Could not read the import result"));
        this.#pump();
      };
      this.#worker = worker;
      return worker;
    } catch {
      this.#workerUnavailable = true;
      return null;
    }
  }

  #onMessage(data: ImportWorkerResponse): void {
    if (data.id === this.#inFlight) this.#inFlight = null;
    if ("result" in data) this.#settle(data.id, data.result);
    else this.#settle(data.id, null, new Error(data.error));
    this.#pump();
  }

  /** The worker failed to load or threw outside our handler: fall back to the main thread. */
  #onWorkerCrash(): void {
    this.#worker?.terminate();
    this.#worker = null;
    this.#workerUnavailable = true;
    this.#inFlight = null;
    const pending = this.#pending;
    if (pending) {
      pending.started = true;
      this.#runOnMainThread(pending);
    }
  }
}
