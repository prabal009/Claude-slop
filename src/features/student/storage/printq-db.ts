import type { PrintJob } from "../contracts/jobs";
import type { Diagnostic } from "../contracts/service";
import type {
  PickupConfig,
  PrinterAvailability,
  QueueEntry,
} from "../contracts/scheduling";
import type { RawPrintFields } from "../utils/validation";
import {
  DatasetReplacedError,
  DomainError,
  finiteNonnegative,
  isRecord,
  isTimestamp,
} from "../utils/validation";
import { createUuid } from "../qr/codec";
import { LOCAL_DATABASE_NAME, PICKUP_BUFFER_MINUTES } from "../services/config";
import {
  isPickupConfig,
  isPrinterAvailability,
  isPrintJob,
  isOptimizationChange,
} from "../services/runtime-validation";
import type { Draft, StoredDraft } from "./drafts";
export type { Draft } from "./drafts";
export interface DocumentRecord {
  id: string;
  blob: Blob;
  originalFileName: string;
  mimeType: string;
  size: number;
  lastModified: number;
  version: string;
}
export interface LocalMeta {
  key: "state";
  revision: string;
  generation: number;
  observedAt: string;
  activeOrder: string[];
  remaining: Record<string, number | null>;
  printer: PrinterAvailability;
  pickup: PickupConfig;
  fingerprints: Record<string, string>;
  optimization: Record<string, QueueEntry["optimizationChange"]>;
  seeded: boolean;
}
export interface RepositoryState {
  jobs: PrintJob[];
  drafts: Map<string, StoredDraft>;
  meta: LocalMeta;
  diagnostics: Diagnostic[];
  queueValid: boolean;
  clear?: boolean;
}
export interface RepositoryMutation {
  state: RepositoryState;
  documents: IDBObjectStore;
  /** Guarded no-op: caller must not enqueue document writes when set. */ skipWrite?: boolean;
}
export interface LocalOptions {
  databaseName?: string;
  clock?: () => Date;
}
const fileVersions = new WeakMap<File, string>();
const initialFields: RawPrintFields = {
  documentName: "",
  copies: "1",
  pageCount: "1",
  pageCountSource: "assumed",
  colorMode: "bw",
  duplex: false,
  paperSize: "A4",
  instructions: "",
};
const corrupt: Diagnostic = {
  code: "CORRUPT_LOCAL_RECORD",
  messageKey: "storage.corruptRecords",
};
function newMeta(now: string): LocalMeta {
  return {
    key: "state",
    revision: "0",
    generation: 1,
    observedAt: now,
    activeOrder: [],
    remaining: {},
    printer: {
      state: "operational",
      changedAt: now,
      reason: null,
      downtime: null,
    },
    pickup: { bufferMinutes: PICKUP_BUFFER_MINUTES, hours: null },
    fingerprints: {},
    optimization: {},
    seeded: false,
  };
}
function validDraft(value: unknown): value is StoredDraft {
  if (!isRecord(value)) return false;
  return (
    [
      "id",
      "clientRequestId",
      "documentName",
      "copies",
      "pageCount",
      "instructions",
    ].every(
      (key) =>
        typeof value[key] === "string" &&
        (value[key] as string).length <= 10000,
    ) &&
    Number.isSafeInteger(value.generation) &&
    (value.generation as number) > 0 &&
    Number.isSafeInteger(value.revision) &&
    (value.revision as number) >= 0 &&
    ["editing", "submitting", "committed"].includes(value.state as string) &&
    (value.committedJobId === null ||
      typeof value.committedJobId === "string") &&
    isTimestamp(value.updatedAt) &&
    ["assumed", "manual", "image"].includes(value.pageCountSource as string) &&
    ["bw", "colour"].includes(value.colorMode as string) &&
    value.paperSize === "A4" &&
    typeof value.duplex === "boolean" &&
    (value.fileVersion === null || typeof value.fileVersion === "string") &&
    (value.originalFileName === null ||
      typeof value.originalFileName === "string") &&
    (value.mimeType === null || typeof value.mimeType === "string") &&
    (value.fileSize === null || finiteNonnegative(value.fileSize)) &&
    typeof value.fileMissing === "boolean"
  );
}
function hydrate(
  rawJobs: unknown[],
  rawDrafts: unknown[],
  rawMeta: unknown,
  now: string,
): RepositoryState {
  const jobs = rawJobs.filter(isPrintJob);
  const drafts = new Map<string, StoredDraft>();
  let corruptFound = jobs.length !== rawJobs.length;
  for (const draft of rawDrafts) {
    if (validDraft(draft)) drafts.set(draft.id, draft);
    else corruptFound = true;
  }
  const fallback = newMeta(now);
  const value = isRecord(rawMeta) ? rawMeta : {};
  const validRevision =
    typeof value.revision === "string" &&
    value.revision.length <= 100 &&
    /^(0|[1-9][0-9]*)$/.test(value.revision);
  const validGeneration =
    Number.isSafeInteger(value.generation) && (value.generation as number) > 0;
  const metaShape =
    validRevision &&
    validGeneration &&
    isTimestamp(value.observedAt) &&
    Array.isArray(value.activeOrder) &&
    value.activeOrder.every((id) => typeof id === "string") &&
    isRecord(value.remaining) &&
    Object.values(value.remaining).every(
      (item) => item === null || finiteNonnegative(item),
    ) &&
    isPrinterAvailability(value.printer) &&
    isPickupConfig(value.pickup) &&
    isRecord(value.fingerprints) &&
    Object.values(value.fingerprints).every(
      (item) => typeof item === "string",
    ) &&
    isRecord(value.optimization) &&
    Object.values(value.optimization).every(isOptimizationChange) &&
    typeof value.seeded === "boolean";
  const meta: LocalMeta = metaShape
    ? (value as unknown as LocalMeta)
    : {
        ...fallback,
        revision: validRevision ? (value.revision as string) : "0",
        generation: validGeneration ? (value.generation as number) : 1,
        printer: isPrinterAvailability(value.printer)
          ? value.printer
          : { state: null, changedAt: null, reason: null, downtime: null },
        pickup: isPickupConfig(value.pickup) ? value.pickup : fallback.pickup,
      };
  const active = jobs.filter(
    (job) => job.status === "queued" || job.status === "printing",
  );
  const activeIds = new Set(active.map((job) => job.id));
  const order = new Set(meta.activeOrder);
  const printing = active.filter((job) => job.status === "printing");
  const queueValid =
    !!metaShape &&
    order.size === meta.activeOrder.length &&
    order.size === activeIds.size &&
    meta.activeOrder.every((id) => activeIds.has(id)) &&
    printing.length <= 1 &&
    (printing.length === 0 || meta.activeOrder[0] === printing[0]?.id) &&
    !rawJobs.some(
      (job) =>
        !isPrintJob(job) &&
        isRecord(job) &&
        (meta.activeOrder.includes(job.id as string) ||
          job.status === "queued" ||
          job.status === "printing"),
    );
  if (!metaShape || !queueValid) corruptFound = true;
  return {
    jobs,
    drafts,
    meta,
    diagnostics: corruptFound ? [corrupt] : [],
    queueValid,
  };
}
export function advanceRevision(state: RepositoryState, now: string): void {
  state.meta = {
    ...state.meta,
    revision: (BigInt(state.meta.revision) + 1n).toString(),
    observedAt: now,
  };
}
export function requireValidQueue(state: RepositoryState): void {
  if (!state.queueValid)
    throw new DomainError("CORRUPT_QUEUE", "errors.corruptQueue");
}
export class PrintQRepository {
  readonly databaseName: string;
  readonly clock: () => Date;
  private connection: Promise<IDBDatabase> | null = null;
  constructor(options: LocalOptions = {}) {
    this.databaseName = options.databaseName ?? LOCAL_DATABASE_NAME;
    this.clock = options.clock ?? (() => new Date());
  }
  private open(): Promise<IDBDatabase> {
    if (this.connection) return this.connection;
    this.connection = new Promise((resolve, reject) => {
      if (!globalThis.indexedDB) {
        reject(
          new DomainError(
            "LOCAL_CACHE_UNAVAILABLE",
            "errors.storageUnavailable",
          ),
        );
        return;
      }
      let request: IDBOpenDBRequest;
      try {
        request = indexedDB.open(this.databaseName, 1);
      } catch (error) {
        reject(error);
        return;
      }
      request.onupgradeneeded = () => {
        const database = request.result;
        const jobs = database.createObjectStore("jobs", { keyPath: "id" });
        jobs.createIndex("token", "token", { unique: true });
        jobs.createIndex("clientRequestId", "clientRequestId", {
          unique: true,
        });
        database.createObjectStore("documents", { keyPath: "id" });
        const drafts = database.createObjectStore("drafts", { keyPath: "id" });
        drafts.createIndex("clientRequestId", "clientRequestId", {
          unique: true,
        });
        database.createObjectStore("meta", { keyPath: "key" });
      };
      request.onerror = () =>
        reject(
          request.error ??
            new DomainError(
              "LOCAL_CACHE_UNAVAILABLE",
              "errors.storageUnavailable",
            ),
        );
      request.onblocked = () =>
        reject(
          new DomainError("LOCAL_CACHE_UNAVAILABLE", "errors.storageBlocked"),
        );
      request.onsuccess = () => {
        const database = request.result;
        try {
          database.onversionchange = () => database.close();
          const transaction = database.transaction("meta", "readwrite");
          const store = transaction.objectStore("meta");
          const existing = store.get("state");
          existing.onsuccess = () => {
            if (!existing.result)
              store.put(newMeta(this.clock().toISOString()));
          };
          transaction.oncomplete = () => resolve(database);
          transaction.onabort = () => {
            database.close();
            reject(
              transaction.error ??
                new DomainError(
                  "LOCAL_CACHE_UNAVAILABLE",
                  "errors.storageUnavailable",
                ),
            );
          };
        } catch (error) {
          database.close();
          reject(error);
        }
      };
    });
    this.connection.catch(() => {
      this.connection = null;
    });
    return this.connection;
  }
  async close(): Promise<void> {
    if (this.connection) (await this.connection).close();
    this.connection = null;
  }
  async read(): Promise<RepositoryState> {
    return this.run("readonly", ({ state }) => state);
  }
  async mutate<T>(operation: (context: RepositoryMutation) => T): Promise<T> {
    return this.run("readwrite", operation);
  }
  private async run<T>(
    mode: IDBTransactionMode,
    operation: (context: RepositoryMutation) => T,
  ): Promise<T> {
    const database = await this.open();
    return new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(
        ["jobs", "documents", "drafts", "meta"],
        mode,
      );
      const jobStore = transaction.objectStore("jobs"),
        draftStore = transaction.objectStore("drafts"),
        documents = transaction.objectStore("documents");
      const jobs = jobStore.getAll(),
        drafts = draftStore.getAll(),
        meta = transaction.objectStore("meta").get("state");
      let pending = 3;
      let result: T;
      let failure: unknown;
      const ready = () => {
        if (--pending) return;
        try {
          const state = hydrate(
            jobs.result,
            drafts.result,
            meta.result,
            this.clock().toISOString(),
          );
          const oldJobs = new Map(state.jobs.map((job) => [job.id, job]));
          const oldDrafts = new Map(state.drafts);
          const context: RepositoryMutation = { state, documents };
          result = operation(context);
          if (mode === "readwrite" && !context.skipWrite) {
            if (state.clear) {
              jobStore.clear();
              draftStore.clear();
            }
            for (const job of state.jobs)
              if (state.clear || oldJobs.get(job.id) !== job) jobStore.put(job);
            for (const [id, draft] of state.drafts)
              if (state.clear || oldDrafts.get(id) !== draft)
                draftStore.put(draft);
            if (!state.clear) {
              const ids = new Set(state.jobs.map((job) => job.id));
              for (const id of oldJobs.keys())
                if (!ids.has(id)) jobStore.delete(id);
              for (const id of oldDrafts.keys())
                if (!state.drafts.has(id)) draftStore.delete(id);
            }
            transaction.objectStore("meta").put(state.meta);
          }
        } catch (error) {
          failure = error;
          transaction.abort();
        }
      };
      jobs.onsuccess = ready;
      drafts.onsuccess = ready;
      meta.onsuccess = ready;
      transaction.oncomplete = () => resolve(result!);
      transaction.onabort = () =>
        reject(
          failure ??
            transaction.error ??
            new DomainError("TRANSACTION_ABORTED", "errors.storageWriteFailed"),
        );
      transaction.onerror = () => {
        failure ??= transaction.error;
      };
    });
  }
  async getGeneration(): Promise<number> {
    return (await this.read()).meta.generation;
  }
  async createDraft(initial: Partial<RawPrintFields> = {}): Promise<Draft> {
    const id = createUuid(),
      clientRequestId = createUuid();
    const now = this.clock().toISOString();
    const stored = await this.mutate(({ state }) => {
      const draft: StoredDraft = {
        ...initialFields,
        ...initial,
        id,
        clientRequestId,
        generation: state.meta.generation,
        revision: 0,
        state: "editing",
        committedJobId: null,
        updatedAt: now,
        fileVersion: null,
        originalFileName: null,
        mimeType: null,
        fileSize: null,
        fileMissing: false,
      };
      if (!validDraft(draft))
        throw new DomainError("INVALID_DRAFT", "errors.invalidDraft");
      state.drafts.set(id, draft);
      return draft;
    });
    return { ...stored, file: null };
  }
  async getDraft(id: string): Promise<Draft | null> {
    const state = await this.read();
    const draft = state.drafts.get(id);
    if (!draft) return null;
    if (!draft.fileVersion) return { ...draft, file: null };
    const committed =
      draft.state === "committed"
        ? state.jobs.find((job) => job.id === draft.committedJobId)
        : null;
    const document = await this.getDocumentRecord(
      committed?.documentId ?? "draft:" + id,
    );
    if (!document || document.version !== draft.fileVersion)
      return { ...draft, file: null, fileMissing: true };
    const file = new File([document.blob], document.originalFileName, {
      type: document.mimeType,
      lastModified: document.lastModified,
    });
    fileVersions.set(file, document.version);
    return { ...draft, file, fileMissing: false };
  }
  async saveDraft(draft: Draft): Promise<Draft> {
    const file = draft.file;
    const version = file ? (fileVersions.get(file) ?? createUuid()) : null;
    const saved = await this.mutate(({ state, documents }) => {
      if (draft.generation !== state.meta.generation)
        throw new DatasetReplacedError();
      const previous = state.drafts.get(draft.id);
      if (!previous || previous.generation !== draft.generation)
        throw new DatasetReplacedError();
      if (previous.state === "committed")
        throw new DomainError("DRAFT_COMMITTED", "errors.draftCommitted");
      if (previous.revision !== draft.revision)
        throw new DomainError("DRAFT_CONFLICT", "errors.draftConflict");
      if (previous.clientRequestId !== draft.clientRequestId)
        throw new DomainError("INVALID_DRAFT", "errors.invalidDraft");
      if (draft.state === "committed" || draft.committedJobId !== null)
        throw new DomainError("INVALID_DRAFT", "errors.invalidDraft");
      if (draft.fileMissing && !file && draft.fileVersion !== null)
        throw new DomainError("FILE_MISSING", "errors.reattachFile");
      const { file: _file, ...raw } = draft;
      const next: StoredDraft = {
        ...raw,
        fileVersion: version,
        originalFileName: file?.name ?? null,
        mimeType: file?.type ?? null,
        fileSize: file?.size ?? null,
        fileMissing: false,
        revision: previous.revision + 1,
        updatedAt: this.clock().toISOString(),
      };
      if (!validDraft(next))
        throw new DomainError("INVALID_DRAFT", "errors.invalidDraft");
      if (file && version && version !== previous.fileVersion)
        documents.put({
          id: "draft:" + draft.id,
          blob: file,
          originalFileName: file.name,
          mimeType: file.type,
          size: file.size,
          lastModified: file.lastModified,
          version,
        } satisfies DocumentRecord);
      else if (!file && previous.fileVersion)
        documents.delete("draft:" + draft.id);
      state.drafts.set(draft.id, next);
      return next;
    });
    if (file && version) fileVersions.set(file, version);
    return { ...saved, file };
  }
  async getDocumentRecord(id: string): Promise<DocumentRecord | null> {
    const database = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction("documents", "readonly");
      const request = transaction.objectStore("documents").get(id);
      let record: DocumentRecord | null = null;
      request.onsuccess = () => {
        const value: unknown = request.result;
        if (
          isRecord(value) &&
          value.blob instanceof Blob &&
          typeof value.originalFileName === "string" &&
          typeof value.mimeType === "string" &&
          finiteNonnegative(value.size) &&
          value.size === value.blob.size &&
          typeof value.version === "string" &&
          finiteNonnegative(value.lastModified)
        )
          record = value as unknown as DocumentRecord;
      };
      transaction.oncomplete = () => resolve(record);
      transaction.onabort = () => reject(transaction.error);
    });
  }
}
