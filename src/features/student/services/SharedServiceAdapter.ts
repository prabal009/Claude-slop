import type { JobInput, PrintJob, QuoteInput } from "../contracts/jobs";
import type {
  Diagnostic,
  ServiceEvent,
  StudentService,
} from "../contracts/service";
import type { EstimateTarget, WhatIfRequest } from "../contracts/scheduling";
import {
  InvalidSharedDataError,
  validateSharedEvent,
  validateSharedInsights,
  validateSharedJob,
  validateSharedPrinter,
  validateSharedQuote,
  validateSharedSimulation,
  validateSharedUrgent,
  validateSharedWindow,
} from "./sharedValidation";

/** The host owns transport, persistence, uploads and calculations. Subscription must
 * deliver an actual coherent initial snapshot, not independently fetched reads. */
export type SharedStudentTransport = Omit<
  StudentService,
  "simulateWhatIf" | "createJob"
> & {
  createJob(
    input: Omit<JobInput, "expectedLocalGeneration">,
    file?: File,
  ): Promise<PrintJob>;
  simulateWhatIf?: StudentService["simulateWhatIf"];
};
export class SharedServiceUnavailableError extends Error {
  readonly messageKey = "errors.sharedDataUnavailable" as const;
  constructor() {
    super(
      "Shared service unavailable; reconnect before trying this operation.",
    );
    this.name = "SharedServiceUnavailableError";
  }
}
type Snapshot = Extract<ServiceEvent, { type: "snapshot-changed" }>;
type Connection = Extract<ServiceEvent, { type: "connection-changed" }>;
export class SharedServiceAdapter implements StudentService {
  private snapshot: Snapshot | null = null;
  private connection: Connection = {
    type: "connection-changed",
    mode: "shared",
    state: "unavailable",
    lastSyncedAt: null,
  };
  private diagnostics: Diagnostic[] = [];
  private listeners = new Set<(event: ServiceEvent) => void>();
  private unsubscribe: (() => void) | undefined;
  private epoch = 0;
  private connectionReported = false;
  private initialWaiters = new Set<{
    resolve: () => void;
    reject: (error: Error) => void;
  }>();
  constructor(private readonly transport?: SharedStudentTransport) {
    if (transport) {
      try {
        this.unsubscribe = transport.subscribeToJobUpdates((event) =>
          this.receive(event),
        );
      } catch (error) {
        this.invalid(error);
      }
    }
  }
  private emit(event: ServiceEvent) {
    for (const listener of this.listeners) {
      try {
        listener(structuredClone(event));
      } catch {
        /* Consumer errors cannot interrupt other subscriptions. */
      }
    }
  }
  private invalid(error: unknown) {
    this.epoch++;
    this.connection = { ...this.connection, state: "unavailable" };
    this.connectionReported = true;
    this.diagnostics = [
      {
        code: "LOCAL_CACHE_UNAVAILABLE",
        messageKey: "errors.sharedDataUnavailable",
      },
    ];
    this.markStale();
    this.emit(this.connection);
    this.emit({ type: "diagnostics-changed", diagnostics: this.diagnostics });
    for (const waiter of this.initialWaiters)
      waiter.reject(
        error instanceof Error ? error : new InvalidSharedDataError("event"),
      );
    this.initialWaiters.clear();
  }
  private markStale() {
    if (this.snapshot) {
      this.snapshot = {
        ...this.snapshot,
        queue: { ...this.snapshot.queue, stale: true },
      };
      this.emit(this.snapshot);
    }
  }
  private receive(raw: unknown) {
    try {
      const event = validateSharedEvent(raw);
      if (event.type === "snapshot-changed") {
        // A delayed snapshot is not a reconnect signal. Snapshot-only initial
        // transports remain supported, but an explicit outage requires connection
        // recovery followed by a fresh coherent snapshot.
        if (this.connectionReported && this.connection.state !== "connected")
          return;
        this.snapshot = event;
        this.connection = {
          type: "connection-changed",
          mode: "shared",
          state: "connected",
          lastSyncedAt: event.queue.lastSyncedAt,
        };
        this.emit(this.connection);
        this.emit(event);
        for (const waiter of this.initialWaiters) waiter.resolve();
        this.initialWaiters.clear();
      } else if (event.type === "connection-changed") {
        this.epoch++;
        this.connection = event;
        this.connectionReported = true;
        if (event.state !== "connected") {
          this.markStale();
          for (const waiter of this.initialWaiters)
            waiter.reject(new SharedServiceUnavailableError());
          this.initialWaiters.clear();
        }
        this.emit(event);
      } else {
        this.diagnostics = event.diagnostics;
        this.emit(event);
      }
    } catch (error) {
      this.invalid(error);
    }
  }
  private async initial() {
    if (this.snapshot) return;
    if (
      !this.transport ||
      this.diagnostics.length ||
      (this.connectionReported && this.connection.state !== "connected")
    )
      throw new SharedServiceUnavailableError();
    await new Promise<void>((resolve, reject) =>
      this.initialWaiters.add({ resolve, reject }),
    );
  }
  private connected(): SharedStudentTransport {
    if (
      !this.transport ||
      !this.snapshot ||
      this.snapshot.queue.stale ||
      this.connection.state !== "connected"
    )
      throw new SharedServiceUnavailableError();
    return this.transport;
  }
  private async read<T>(
    operation: (transport: SharedStudentTransport) => Promise<unknown>,
    validate: (value: unknown) => T,
  ): Promise<T> {
    const transport = this.connected();
    const epoch = this.epoch;
    const raw = await operation(transport);
    if (epoch !== this.epoch || this.connection.state !== "connected")
      throw new SharedServiceUnavailableError();
    try {
      return validate(raw);
    } catch (error) {
      this.invalid(error);
      throw error;
    }
  }
  async getJobs() {
    await this.initial();
    return structuredClone(this.snapshot!.jobs);
  }
  async getQueueSnapshot() {
    await this.initial();
    return structuredClone(this.snapshot!.queue);
  }
  async getJobById(id: string) {
    await this.initial();
    return structuredClone(
      this.snapshot!.jobs.find((job) => job.id === id) ?? null,
    );
  }
  createJob(input: JobInput, file?: File) {
    const { expectedLocalGeneration: localGeneration, ...wire } = input;
    void localGeneration;
    return this.read((t) => t.createJob(wire, file), validateSharedJob);
  }
  requestUrgent(id: string) {
    return this.read((t) => t.requestUrgent(id), validateSharedJob);
  }
  getQuote(input: QuoteInput) {
    return this.read((t) => t.getQuote(input), validateSharedQuote);
  }
  async getPrinterStatus() {
    if (this.snapshot && this.connection.state !== "connected") {
      const { revision, observedAt, lastSyncedAt, source, printer } =
        this.snapshot.queue;
      const { state, changedAt, reason, downtime } = printer;
      return structuredClone({
        state,
        changedAt,
        reason,
        downtime,
        revision,
        observedAt,
        lastSyncedAt,
        source,
        stale: true,
      });
    }
    return this.read((t) => t.getPrinterStatus(), validateSharedPrinter);
  }
  getPickupWindow(target: EstimateTarget) {
    return this.read((t) => t.getPickupWindow(target), validateSharedWindow);
  }
  getUrgentImpactPreview(id: string) {
    return this.read((t) => t.getUrgentImpactPreview(id), validateSharedUrgent);
  }
  getShopInsights() {
    return this.read((t) => t.getShopInsights(), validateSharedInsights);
  }
  simulateWhatIf(request: WhatIfRequest) {
    return this.read(
      (t) =>
        t.simulateWhatIf ? t.simulateWhatIf(request) : Promise.resolve(null),
      validateSharedSimulation,
    );
  }
  getDocument(id: string) {
    return this.read(
      (t) => t.getDocument(id),
      (value) => {
        if (value !== null && !(value instanceof Blob))
          throw new InvalidSharedDataError("document");
        return value as Blob | null;
      },
    );
  }
  subscribeToJobUpdates(callback: (event: ServiceEvent) => void) {
    this.listeners.add(callback);
    const deliver = (event: ServiceEvent) => {
      try {
        callback(structuredClone(event));
      } catch {
        /* Isolate consumer callbacks. */
      }
    };
    deliver(this.connection);
    deliver({ type: "diagnostics-changed", diagnostics: this.diagnostics });
    if (this.snapshot) deliver(this.snapshot);
    return () => {
      this.listeners.delete(callback);
    };
  }
  /** Host lifecycle cleanup; never closes the host-owned transport itself. */
  dispose() {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    this.listeners.clear();
    for (const waiter of this.initialWaiters)
      waiter.reject(new SharedServiceUnavailableError());
    this.initialWaiters.clear();
  }
}
