import type {
  JobInput,
  PrintJob,
  PrintQuote,
  QuoteInput,
  SnapshotMeta,
} from "../contracts/jobs";
import type {
  Diagnostic,
  ServiceEvent,
  StudentDemoController,
  StudentService,
} from "../contracts/service";
import type {
  EstimateTarget,
  PickupWindowResult,
  PrinterSnapshot,
  QueueSnapshot,
  ShopInsights,
  UrgentImpact,
  WhatIfRequest,
  WhatIfResult,
} from "../contracts/scheduling";
import {
  PrintQRepository,
  advanceRevision,
  requireValidQueue,
  type LocalOptions,
  type RepositoryState,
  type DocumentRecord,
} from "../storage/printq-db";
import {
  DomainError,
  assertQuote,
  isRecord,
  normalizeJobInput,
} from "../utils/validation";
import { DatasetReplacedError } from "../utils/validation";
import { calculatePrintEstimate } from "../pricing/calculations";
import {
  addMinutes,
  calculatePickupWindow,
  calculateQueue,
  downtimeMinutes,
  insertUrgent,
  remainingWork,
} from "../queue/calculations";
import { createPickupToken, createUuid } from "../qr/codec";
import {
  DEMO_SHOP_NAME,
  LOCAL_SCHEMA_VERSION,
  PICKUP_BUFFER_MINUTES,
} from "./config";
import { simulateWhatIf as calculateScenario } from "../queue/simulation";
import {
  DEMO_DOCUMENT_ID,
  fixtureJobs,
  prepareFixtureFile,
} from "../demo/fixtures";
import { readBlobBytes, validateFile } from "../documents/validation";
interface Listener {
  callback: (event: ServiceEvent) => void;
  revision: bigint;
}
async function prepareFile(
  file: File,
): Promise<{ mimeType: string; digest: string }> {
  const { mimeType } = await validateFile(file);
  const bytes = await readBlobBytes(file);
  if (!globalThis.crypto?.subtle)
    throw new DomainError(
      "SECURE_CONTEXT_REQUIRED",
      "errors.secureContextRequired",
    );
  const digest = Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    (value) => value.toString(16).padStart(2, "0"),
  ).join("");
  return { mimeType, digest };
}
export class LocalDemoAdapter implements StudentService {
  readonly repo: PrintQRepository;
  readonly demoController: StudentDemoController;
  private readonly listeners = new Set<Listener>();
  private readonly sourceId = createUuid();
  private channel: BroadcastChannel | null = null;
  private readonly notificationKey: string;
  private fallbackAvailable = false;
  private disposed = false;
  private expiryTimer: ReturnType<typeof setTimeout> | undefined;
  private expiryTimerDeadline: number | null = null;
  private readonly onStorage = (event: StorageEvent) => {
    if (
      event.key === this.notificationKey &&
      event.newValue &&
      event.newValue.length <= 1024
    ) {
      try {
        this.receive(JSON.parse(event.newValue));
      } catch {
        /* Untrusted notification is ignored. */
      }
    }
  };
  constructor(options: LocalOptions = {}) {
    this.repo = new PrintQRepository(options);
    this.notificationKey = this.repo.databaseName + ":revision";
    this.demoController = {
      loadFixtures: () => this.loadFixtures(),
      advanceJob: (id) => this.advanceFixtureJob(id),
      resolveUrgency: (id, result) => this.resolveFixtureUrgency(id, result),
      setPrinterScenario: (scenario) => this.setFixturePrinter(scenario),
      resetDemo: () => this.replaceDataset(true),
      clearLocalData: () => this.replaceDataset(false),
    };
    try {
      if (typeof BroadcastChannel !== "undefined") {
        this.channel = new BroadcastChannel(
          this.repo.databaseName + ":invalidate",
        );
        this.channel.onmessage = (event) => this.receive(event.data);
      }
    } catch {
      this.channel = null;
    }
    if (!this.channel && typeof window !== "undefined") {
      try {
        const key = this.notificationKey + ":probe";
        localStorage.setItem(key, "1");
        localStorage.removeItem(key);
        window.addEventListener("storage", this.onStorage);
        this.fallbackAvailable = true;
      } catch {
        this.fallbackAvailable = false;
      }
    }
    void this.readState().catch(() => this.reportUnavailable());
  }
  private receive(value: unknown): void {
    if (
      !isRecord(value) ||
      Object.keys(value).sort().join(",") !==
        "revision,schemaVersion,sourceId,type" ||
      value.type !== "invalidate" ||
      value.schemaVersion !== LOCAL_SCHEMA_VERSION ||
      typeof value.sourceId !== "string" ||
      value.sourceId === this.sourceId ||
      value.sourceId.length > 128 ||
      typeof value.revision !== "string" ||
      !/^(0|[1-9][0-9]*)$/.test(value.revision) ||
      value.revision.length > 100
    )
      return;
    void this.publish().catch(() => this.reportUnavailable());
  }
  private reportUnavailable(): void {
    for (const listener of this.listeners) {
      listener.callback({
        type: "connection-changed",
        mode: "local-demo",
        state: "unavailable",
        lastSyncedAt: null,
      });
      listener.callback({
        type: "diagnostics-changed",
        diagnostics: [
          {
            code: "LOCAL_CACHE_UNAVAILABLE",
            messageKey: "storage.unavailable",
          },
        ],
      });
    }
  }
  private metadata(state: RepositoryState): SnapshotMeta {
    return {
      revision: state.meta.revision,
      observedAt: state.queueValid ? state.meta.observedAt : null,
      lastSyncedAt: null,
      source: "local-demo",
      stale: false,
    };
  }
  /** An elapsed recovery estimate is a real snapshot observation, never printer recovery or progress. */
  private expiryDeadline(state: RepositoryState): number | null {
    const printer = state.meta.printer;
    if (
      !state.queueValid ||
      (printer.state !== "paused" && printer.state !== "maintenance") ||
      printer.downtime?.kind !== "known"
    )
      return null;
    const deadline = Date.parse(printer.downtime.expectedResumeAt);
    return Date.parse(state.meta.observedAt) < deadline ? deadline : null;
  }
  private scheduleExpiry(state: RepositoryState): void {
    const deadline = this.disposed ? null : this.expiryDeadline(state);
    if (deadline === this.expiryTimerDeadline) return;
    clearTimeout(this.expiryTimer);
    this.expiryTimer = undefined;
    this.expiryTimerDeadline = deadline;
    if (deadline === null) return;
    const delay = Math.max(
      0,
      Math.min(deadline - this.repo.clock().getTime(), 2147483647),
    );
    this.expiryTimer = setTimeout(() => {
      this.expiryTimer = undefined;
      this.expiryTimerDeadline = null;
      if (!this.disposed)
        void this.publish().catch(() => this.reportUnavailable());
    }, delay);
  }
  private async readState(): Promise<RepositoryState> {
    let state = await this.repo.read();
    const deadline = this.expiryDeadline(state);
    if (
      !this.disposed &&
      deadline !== null &&
      deadline <= this.repo.clock().getTime()
    ) {
      const observation = await this.repo.mutate((context) => {
        const current = context.state;
        const currentDeadline = this.expiryDeadline(current);
        const now = this.repo.clock();
        if (
          this.disposed ||
          currentDeadline === null ||
          currentDeadline > now.getTime()
        ) {
          context.skipWrite = true;
          return { state: current, changed: false };
        }
        this.recalculate(current, now.toISOString());
        return { state: current, changed: true };
      });
      state = observation.state;
      if (observation.changed) this.publishState(state, true);
    }
    this.scheduleExpiry(state);
    if (!state.queueValid)
      state.jobs = state.jobs.map((job) =>
        job.status === "queued" || job.status === "printing"
          ? {
              ...job,
              queuePosition: null,
              estimatedWaitMinutes: null,
              estimatedPickupAt: null,
            }
          : job,
      );
    return state;
  }
  private queue(state: RepositoryState): QueueSnapshot {
    const jobs = new Map(state.jobs.map((job) => [job.id, job]));
    return {
      ...this.metadata(state),
      entries: state.queueValid
        ? state.meta.activeOrder.map((id) => {
            const job = jobs.get(id)!;
            return {
              jobId: id,
              status: job.status,
              priority: job.priority,
              estimatedDurationMinutes: job.estimatedDurationMinutes,
              remainingMinutes: remainingWork(job, state.meta.remaining),
              optimizationChange: state.meta.optimization[id] ?? null,
            };
          })
        : null,
      printer: state.meta.printer,
      pickup: state.meta.pickup,
      policy: null,
      localGeneration: state.meta.generation,
    };
  }
  private diagnostics(state: RepositoryState): Diagnostic[] {
    return !this.channel && !this.fallbackAvailable
      ? [
          ...state.diagnostics,
          {
            code: "LOCAL_CACHE_UNAVAILABLE",
            messageKey: "storage.sameTabOnly",
          },
        ]
      : state.diagnostics;
  }
  private deliver(listener: Listener, state: RepositoryState): void {
    if (
      this.disposed ||
      !this.listeners.has(listener) ||
      BigInt(state.meta.revision) < listener.revision
    )
      return;
    listener.callback({
      type: "diagnostics-changed",
      diagnostics: this.diagnostics(state),
    });
    if (BigInt(state.meta.revision) === listener.revision) return;
    listener.revision = BigInt(state.meta.revision);
    listener.callback({
      type: "connection-changed",
      mode: "local-demo",
      state: "local-ready",
      lastSyncedAt: null,
    });
    listener.callback({
      type: "snapshot-changed",
      jobs: state.jobs,
      queue: this.queue(state),
    });
  }
  private publishState(state: RepositoryState, notify = false): void {
    this.scheduleExpiry(state);
    for (const listener of this.listeners) this.deliver(listener, state);
    if (!notify || this.disposed) return;
    const message = {
      type: "invalidate",
      schemaVersion: LOCAL_SCHEMA_VERSION,
      sourceId: this.sourceId,
      revision: state.meta.revision,
    };
    try {
      if (this.channel) this.channel.postMessage(message);
      else if (this.fallbackAvailable)
        localStorage.setItem(this.notificationKey, JSON.stringify(message));
    } catch {
      this.reportUnavailable();
    }
  }
  private async publish(notify = false): Promise<void> {
    this.publishState(await this.readState(), notify);
  }
  subscribeToJobUpdates(callback: (event: ServiceEvent) => void): () => void {
    const listener: Listener = { callback, revision: -1n };
    this.listeners.add(listener);
    void this.readState()
      .then((state) => this.deliver(listener, state))
      .catch(() => this.reportUnavailable());
    return () => this.listeners.delete(listener);
  }
  async dispose(): Promise<void> {
    this.disposed = true;
    clearTimeout(this.expiryTimer);
    this.expiryTimer = undefined;
    this.expiryTimerDeadline = null;
    this.listeners.clear();
    this.channel?.close();
    if (typeof window !== "undefined")
      window.removeEventListener("storage", this.onStorage);
    await this.repo.close();
  }
  async createJob(raw: JobInput, file?: File): Promise<PrintJob> {
    if (!isRecord(raw))
      throw new DomainError("VALIDATION", "errors.invalidInput");
    const generation =
      raw.expectedLocalGeneration ?? (await this.repo.getGeneration());
    const input = normalizeJobInput(raw);
    const prepared = file ? await prepareFile(file) : null;
    const wireInput = {
      clientRequestId: input.clientRequestId,
      documentName: input.documentName,
      pageCount: input.pageCount,
      pageCountSource: input.pageCountSource,
      copies: input.copies,
      colorMode: input.colorMode,
      duplex: input.duplex,
      paperSize: input.paperSize,
      instructions: input.instructions,
    };
    const fingerprint = JSON.stringify({
      ...wireInput,
      file: file
        ? {
            present: true,
            name: file.name,
            mimeType: prepared!.mimeType,
            size: file.size,
            digest: prepared!.digest,
          }
        : { present: false },
    });
    const now = this.repo.clock().toISOString();
    const id = createUuid(),
      token = createPickupToken(),
      documentId = file ? createUuid() : null,
      documentVersion = file ? createUuid() : null;
    const estimate = calculatePrintEstimate(input);
    const committed = await this.repo.mutate(({ state, documents }) => {
      if (state.meta.generation !== generation)
        throw new DatasetReplacedError();
      const existing = state.jobs.find(
        (job) => job.clientRequestId === input.clientRequestId,
      );
      if (existing) {
        if (state.meta.fingerprints[input.clientRequestId] !== fingerprint)
          throw new DomainError(
            "IDEMPOTENCY_CONFLICT",
            "errors.requestConflict",
          );
        return existing;
      }
      requireValidQueue(state);
      const draft = Array.from(state.drafts.values()).find(
        (value) => value.clientRequestId === input.clientRequestId,
      );
      if (draft && draft.generation !== generation)
        throw new DatasetReplacedError();
      if (draft?.fileVersion && !file)
        throw new DomainError("FILE_MISSING", "errors.reattachFile");
      const job: PrintJob = {
        id,
        token,
        ...wireInput,
        createdAt: now,
        updatedAt: now,
        status: "queued",
        priority: "normal",
        urgentRequestStatus: "none",
        dataOrigin: "local-user",
        documentLocation: file ? "device" : "none",
        documentId,
        originalFileName: file?.name ?? null,
        mimeType: prepared?.mimeType ?? null,
        fileSize: file?.size ?? null,
        queuePosition: null,
        estimatedCost: estimate.estimatedCost,
        estimatedDurationMinutes: estimate.estimatedDurationMinutes,
        estimatedWaitMinutes: null,
        estimatedPickupAt: null,
      };
      state.jobs.push(job);
      state.meta = {
        ...state.meta,
        activeOrder: [...state.meta.activeOrder, id],
        remaining: {
          ...state.meta.remaining,
          [id]: estimate.estimatedDurationMinutes,
        },
        fingerprints: {
          ...state.meta.fingerprints,
          [input.clientRequestId]: fingerprint,
        },
      };
      const calculation = calculateQueue(
        state.jobs,
        state.meta.activeOrder,
        state.meta.remaining,
        state.meta.printer,
        now,
        state.meta.optimization,
      );
      state.jobs = calculation.jobs;
      advanceRevision(state, now);
      if (file && documentId && documentVersion)
        documents.put({
          id: documentId,
          blob: file,
          originalFileName: file.name,
          mimeType: prepared!.mimeType,
          size: file.size,
          lastModified: file.lastModified,
          version: documentVersion,
        } satisfies DocumentRecord);
      if (draft) {
        state.drafts.set(draft.id, {
          ...draft,
          documentName: input.documentName,
          copies: String(input.copies),
          pageCount: String(input.pageCount),
          pageCountSource: input.pageCountSource,
          colorMode: input.colorMode,
          duplex: input.duplex,
          paperSize: input.paperSize,
          instructions: input.instructions,
          fileVersion: documentVersion,
          originalFileName: file?.name ?? null,
          mimeType: prepared?.mimeType ?? null,
          fileSize: file?.size ?? null,
          fileMissing: false,
          state: "committed",
          committedJobId: id,
          revision: draft.revision + 1,
          updatedAt: now,
        });
        documents.delete("draft:" + draft.id);
      }
      return state.jobs.find((value) => value.id === id)!;
    });
    await this.publish(true).catch(() => this.reportUnavailable());
    return committed;
  }
  async getJobs(): Promise<PrintJob[]> {
    return (await this.readState()).jobs;
  }
  async getJobById(id: string): Promise<PrintJob | null> {
    return (await this.getJobs()).find((job) => job.id === id) ?? null;
  }
  async getQueueSnapshot(): Promise<QueueSnapshot> {
    return this.queue(await this.readState());
  }
  async getPrinterStatus(): Promise<PrinterSnapshot> {
    const state = await this.readState();
    return { ...this.metadata(state), ...state.meta.printer };
  }
  private quote(state: RepositoryState, input: QuoteInput): PrintQuote {
    assertQuote(input);
    const estimate = calculatePrintEstimate(input);
    let wait: number | null = state.queueValid
      ? downtimeMinutes(state.meta.printer, state.meta.observedAt)
      : null;
    const byId = new Map(state.jobs.map((job) => [job.id, job]));
    if (wait !== null)
      for (const id of state.meta.activeOrder) {
        const job = byId.get(id);
        const remaining = job ? remainingWork(job, state.meta.remaining) : null;
        if (remaining === null) {
          wait = null;
          break;
        }
        wait += remaining;
      }
    const total =
      wait === null ? null : wait + estimate.estimatedDurationMinutes;
    return {
      ...this.metadata(state),
      ...estimate,
      estimatedWaitMinutes: wait,
      estimatedTotalMinutes: total,
      estimatedPickupAt:
        total === null ? null : addMinutes(state.meta.observedAt, total),
      assumptions: [
        "assumptions.localEstimate",
        "assumptions.snapshotWorkload",
        ...(state.jobs.some(
          (job) =>
            job.status === "printing" && state.meta.remaining[job.id] == null,
        )
          ? ["assumptions.fullPrintingDuration"]
          : []),
        ...(!state.meta.pickup.hours ? ["assumptions.noShopHours"] : []),
      ],
    };
  }
  async getQuote(input: QuoteInput): Promise<PrintQuote> {
    return this.quote(await this.readState(), input);
  }
  async getPickupWindow(target: EstimateTarget): Promise<PickupWindowResult> {
    const state = await this.readState();
    if (!isRecord(target) || (target.kind !== "job" && target.kind !== "draft"))
      throw new DomainError("VALIDATION", "errors.invalidInput");
    const job =
      target.kind === "job"
        ? state.jobs.find((value) => value.id === target.jobId)
        : null;
    const ready =
      target.kind === "draft"
        ? this.quote(state, target.input).estimatedPickupAt
        : job?.status === "ready"
          ? job.updatedAt
          : (job?.estimatedPickupAt ?? null);
    return {
      ...this.metadata(state),
      window: calculatePickupWindow(ready, state.meta.pickup, job?.status),
    };
  }
  async getDocument(documentId: string): Promise<Blob | null> {
    return (await this.repo.getDocumentRecord(documentId))?.blob ?? null;
  }
  async getShopInsights(): Promise<ShopInsights> {
    const state = await this.readState();
    const byId = new Map(state.jobs.map((job) => [job.id, job]));
    const work = state.meta.activeOrder.map((id) => {
      const job = byId.get(id);
      return job ? remainingWork(job, state.meta.remaining) : null;
    });
    return {
      ...this.metadata(state),
      shopDisplayName: DEMO_SHOP_NAME,
      pendingJobCount: state.queueValid ? state.meta.activeOrder.length : null,
      estimatedWorkloadMinutes:
        state.queueValid && work.every((value) => typeof value === "number")
          ? work.reduce<number>((sum, value) => sum + (value ?? 0), 0)
          : null,
      printerState: state.meta.printer.state,
      congestion: null,
      lowerCongestionPeriods: null,
    };
  }
  async getUrgentImpactPreview(jobId: string): Promise<UrgentImpact | null> {
    const state = await this.readState();
    if (!state.queueValid) return null;
    const job = state.jobs.find((value) => value.id === jobId);
    if (!job || job.status !== "queued" || job.urgentRequestStatus !== "none")
      return null;
    const before = calculateQueue(
      state.jobs,
      state.meta.activeOrder,
      state.meta.remaining,
      state.meta.printer,
      state.meta.observedAt,
    ).jobs;
    const after = calculateQueue(
      state.jobs,
      insertUrgent(state.meta.activeOrder, state.jobs, jobId),
      state.meta.remaining,
      state.meta.printer,
      state.meta.observedAt,
    ).jobs;
    const current = before.find((value) => value.id === jobId)!,
      proposed = after.find((value) => value.id === jobId)!;
    if (
      current.estimatedWaitMinutes === null ||
      proposed.estimatedWaitMinutes === null ||
      current.estimatedPickupAt === null ||
      proposed.estimatedPickupAt === null
    )
      return null;
    const previous = new Map(before.map((value) => [value.id, value]));
    const delays: number[] = [];
    for (const value of after) {
      if (value.id === jobId) continue;
      const old = previous.get(value.id);
      if (
        old?.estimatedWaitMinutes !== null &&
        old?.estimatedWaitMinutes !== undefined &&
        value.estimatedWaitMinutes !== null
      ) {
        const delay = value.estimatedWaitMinutes - old.estimatedWaitMinutes;
        if (delay > 0) delays.push(delay);
      }
    }
    return {
      ...this.metadata(state),
      currentWaitMinutes: current.estimatedWaitMinutes,
      proposedWaitMinutes: proposed.estimatedWaitMinutes,
      timeSavedMinutes:
        current.estimatedWaitMinutes - proposed.estimatedWaitMinutes,
      affectedJobCount: delays.length,
      currentPickupAt: current.estimatedPickupAt,
      proposedPickupAt: proposed.estimatedPickupAt,
      additionalWaitMinutes: delays.length
        ? { min: Math.min(...delays), max: Math.max(...delays) }
        : null,
    };
  }
  async requestUrgent(jobId: string): Promise<PrintJob> {
    const now = this.repo.clock().toISOString();
    const result = await this.repo.mutate(({ state }) => {
      requireValidQueue(state);
      const job = state.jobs.find((value) => value.id === jobId);
      if (!job || job.status !== "queued" || job.urgentRequestStatus !== "none")
        throw new DomainError("URGENT_INELIGIBLE", "errors.urgentIneligible");
      const next = {
        ...job,
        urgentRequestStatus: "pending" as const,
        updatedAt: now,
      };
      state.jobs = state.jobs.map((value) =>
        value.id === jobId ? next : value,
      );
      this.recalculate(state, now);
      return state.jobs.find((value) => value.id === jobId)!;
    });
    await this.publish(true).catch(() => this.reportUnavailable());
    return result;
  }
  async simulateWhatIf(request: WhatIfRequest): Promise<WhatIfResult | null> {
    if (
      !isRecord(request) ||
      !isRecord(request.target) ||
      !isRecord(request.changes) ||
      (request.target.kind !== "job" && request.target.kind !== "draft")
    )
      throw new DomainError("VALIDATION", "errors.invalidInput");
    const state = await this.readState();
    if (!state.queueValid) return null;
    return calculateScenario(
      {
        jobs: state.jobs,
        order: state.meta.activeOrder,
        remaining: state.meta.remaining,
        printer: state.meta.printer,
        pickup: state.meta.pickup,
        observedAt: state.meta.observedAt,
        meta: this.metadata(state),
      },
      request,
    );
  }
  private recalculate(state: RepositoryState, now: string): void {
    state.jobs = calculateQueue(
      state.jobs,
      state.meta.activeOrder,
      state.meta.remaining,
      state.meta.printer,
      now,
      state.meta.optimization,
    ).jobs;
    advanceRevision(state, now);
  }
  private seed(
    state: RepositoryState,
    documents: IDBObjectStore,
    file: File,
    now: string,
  ): void {
    const fixtures = fixtureJobs(now, file).filter(
      (job) =>
        !state.jobs.some(
          (existing) =>
            existing.id === job.id ||
            existing.clientRequestId === job.clientRequestId,
        ),
    );
    const hasPrinting = state.jobs.some((job) => job.status === "printing");
    for (let index = 0; index < fixtures.length; index++)
      if (hasPrinting && fixtures[index]!.status === "printing")
        fixtures[index] = { ...fixtures[index]!, status: "queued" };
    state.jobs = [...state.jobs, ...fixtures];
    const newActive = fixtures.filter(
      (job) => job.status === "printing" || job.status === "queued",
    );
    const printing = newActive.find((job) => job.status === "printing");
    state.meta = {
      ...state.meta,
      seeded: true,
      activeOrder: [
        ...(printing ? [printing.id] : []),
        ...state.meta.activeOrder,
        ...newActive.filter((job) => job !== printing).map((job) => job.id),
      ],
      remaining: { ...state.meta.remaining },
    };
    for (const job of newActive)
      state.meta.remaining[job.id] =
        job.status === "printing" ? 2 : job.estimatedDurationMinutes;
    if (fixtures.some((job) => job.documentId === DEMO_DOCUMENT_ID))
      documents.put({
        id: DEMO_DOCUMENT_ID,
        blob: file,
        originalFileName: file.name,
        mimeType: "application/pdf",
        size: file.size,
        lastModified: file.lastModified,
        version: createUuid(),
      } satisfies DocumentRecord);
  }
  private async loadFixtures(): Promise<void> {
    const generation = await this.repo.getGeneration();
    const file = await prepareFixtureFile();
    const now = this.repo.clock().toISOString();
    const changed = await this.repo.mutate(({ state, documents }) => {
      if (state.meta.generation !== generation)
        throw new DatasetReplacedError();
      requireValidQueue(state);
      if (state.meta.seeded) return false;
      this.seed(state, documents, file, now);
      this.recalculate(state, now);
      return true;
    });
    if (changed) await this.publish(true).catch(() => this.reportUnavailable());
  }
  private async advanceFixtureJob(jobId: string): Promise<void> {
    const now = this.repo.clock().toISOString();
    await this.repo.mutate(({ state }) => {
      requireValidQueue(state);
      const job = state.jobs.find((value) => value.id === jobId);
      if (!job || job.status === "collected")
        throw new DomainError("STATUS_INELIGIBLE", "errors.statusIneligible");
      if (
        job.status === "queued" &&
        (state.meta.activeOrder[0] !== jobId ||
          state.jobs.some((value) => value.status === "printing") ||
          downtimeMinutes(state.meta.printer, now) !== 0)
      )
        throw new DomainError("STATUS_INELIGIBLE", "errors.statusIneligible");
      const status =
        job.status === "queued"
          ? "printing"
          : job.status === "printing"
            ? "ready"
            : "collected";
      state.jobs = state.jobs.map((value) =>
        value.id === jobId
          ? {
              ...value,
              status,
              updatedAt: now,
              estimatedPickupAt:
                status === "ready" ? now : value.estimatedPickupAt,
            }
          : value,
      );
      if (status === "ready" || status === "collected") {
        state.meta = {
          ...state.meta,
          activeOrder: state.meta.activeOrder.filter((id) => id !== jobId),
          remaining: { ...state.meta.remaining },
        };
        delete state.meta.remaining[jobId];
      }
      this.recalculate(state, now);
    });
    await this.publish(true).catch(() => this.reportUnavailable());
  }
  private async resolveFixtureUrgency(
    jobId: string,
    result: "approved" | "rejected",
  ): Promise<void> {
    if (result !== "approved" && result !== "rejected")
      throw new DomainError("INVALID_URGENCY", "errors.invalidInput");
    const now = this.repo.clock().toISOString();
    await this.repo.mutate(({ state }) => {
      requireValidQueue(state);
      const job = state.jobs.find((value) => value.id === jobId);
      if (
        !job ||
        job.status !== "queued" ||
        job.urgentRequestStatus !== "pending"
      )
        throw new DomainError("URGENT_INELIGIBLE", "errors.urgentIneligible");
      const previous = new Map(state.jobs.map((value) => [value.id, value]));
      state.jobs = state.jobs.map((value) =>
        value.id === jobId
          ? {
              ...value,
              priority: result === "approved" ? "urgent" : "normal",
              urgentRequestStatus: result,
              updatedAt: now,
            }
          : value,
      );
      if (result === "approved") {
        state.meta = {
          ...state.meta,
          activeOrder: insertUrgent(state.meta.activeOrder, state.jobs, jobId),
          optimization: { ...state.meta.optimization },
        };
        state.meta.activeOrder.forEach((id, index) => {
          const old = previous.get(id);
          if (old && old.queuePosition !== index + 1)
            state.meta.optimization[id] = {
              occurredAt: now,
              reason: "urgent-approved",
              previousQueuePosition: old.queuePosition,
              previousEstimatedPickupAt: old.estimatedPickupAt,
              explanation: "queue.urgentApproved",
            };
        });
      }
      this.recalculate(state, now);
    });
    await this.publish(true).catch(() => this.reportUnavailable());
  }
  private async setFixturePrinter(
    scenario: "known-maintenance" | "unknown-maintenance" | "resumed",
  ): Promise<void> {
    if (
      !["known-maintenance", "unknown-maintenance", "resumed"].includes(
        scenario,
      )
    )
      throw new DomainError("INVALID_PRINTER_SCENARIO", "errors.invalidInput");
    const now = this.repo.clock().toISOString();
    await this.repo.mutate(({ state }) => {
      requireValidQueue(state);
      state.meta = {
        ...state.meta,
        printer:
          scenario === "resumed"
            ? {
                state: "resumed",
                changedAt: now,
                reason: "printer.fixtureResumed",
                downtime: null,
              }
            : {
                state: "maintenance",
                changedAt: now,
                reason:
                  scenario === "known-maintenance"
                    ? "printer.fixtureKnownMaintenance"
                    : "printer.fixtureUnknownMaintenance",
                downtime:
                  scenario === "known-maintenance"
                    ? { kind: "known", expectedResumeAt: addMinutes(now, 10) }
                    : { kind: "unknown" },
              },
      };
      this.recalculate(state, now);
    });
    await this.publish(true).catch(() => this.reportUnavailable());
  }
  private async replaceDataset(withFixtures: boolean): Promise<void> {
    const generation = await this.repo.getGeneration();
    const file = withFixtures ? await prepareFixtureFile() : null;
    const now = this.repo.clock().toISOString();
    await this.repo.mutate(({ state, documents }) => {
      if (state.meta.generation !== generation)
        throw new DatasetReplacedError();
      documents.clear();
      state.clear = true;
      state.jobs = [];
      state.drafts.clear();
      state.queueValid = true;
      state.diagnostics = [];
      state.meta = {
        ...state.meta,
        generation: state.meta.generation + 1,
        activeOrder: [],
        remaining: {},
        fingerprints: {},
        optimization: {},
        seeded: false,
        pickup: { bufferMinutes: PICKUP_BUFFER_MINUTES, hours: null },
        printer: {
          state: "operational",
          changedAt: now,
          reason: null,
          downtime: null,
        },
      };
      if (file) this.seed(state, documents, file, now);
      this.recalculate(state, now);
    });
    await this.publish(true).catch(() => this.reportUnavailable());
  }
}
export function createLocalDemo(options: LocalOptions = {}): {
  service: LocalDemoAdapter;
  demoController: StudentDemoController;
} {
  const service = new LocalDemoAdapter(options);
  return { service, demoController: service.demoController };
}
