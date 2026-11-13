import { describe, expect, it } from "vitest";
import type { JobInput, PrintJob, PrintQuote } from "../contracts/jobs";
import type { ServiceEvent } from "../contracts/service";
import type { QueueSnapshot, WhatIfRequest } from "../contracts/scheduling";
import {
  SharedServiceAdapter,
  SharedServiceUnavailableError,
  type SharedStudentTransport,
} from "../services/SharedServiceAdapter";
import {
  InvalidSharedDataError,
  validateSharedEvent,
  validateSharedInsights,
  validateSharedPrinter,
  validateSharedQueue,
  validateSharedSimulation,
  validateSharedUrgent,
  validateSharedWindow,
} from "../services/sharedValidation";
const at = "2026-11-13T10:00:00.000Z";
const meta = {
  revision: "shop-12",
  observedAt: at,
  lastSyncedAt: at,
  source: "shared" as const,
  stale: false,
};
const job: PrintJob = {
  id: "student-visible",
  token: "SHOP-42",
  clientRequestId: "request-1",
  documentName: "<script>notes</script>",
  instructions: "",
  createdAt: at,
  updatedAt: at,
  pageCount: 10,
  copies: 2,
  pageCountSource: "manual",
  colorMode: "bw",
  paperSize: "A4",
  status: "queued",
  priority: "normal",
  urgentRequestStatus: "none",
  duplex: false,
  dataOrigin: "shared",
  documentLocation: "none",
  documentId: null,
  originalFileName: null,
  mimeType: null,
  fileSize: null,
  queuePosition: 7,
  estimatedCost: 55,
  estimatedDurationMinutes: null,
  estimatedWaitMinutes: null,
  estimatedPickupAt: null,
};
const queue: QueueSnapshot = {
  ...meta,
  entries: [
    {
      jobId: job.id,
      status: "queued",
      priority: "normal",
      estimatedDurationMinutes: null,
      remainingMinutes: null,
      optimizationChange: null,
    },
  ],
  printer: { state: null, changedAt: null, reason: null, downtime: null },
  pickup: { bufferMinutes: 15, hours: null },
  policy: null,
  localGeneration: null,
};
const quote: PrintQuote = {
  ...meta,
  printedSides: 20,
  sheets: 20,
  pricePerSide: null,
  estimatedCost: 55,
  estimatedDurationMinutes: null,
  estimatedWaitMinutes: null,
  estimatedTotalMinutes: null,
  estimatedPickupAt: null,
  assumptions: ["Shop-provided special rate"],
};
const input: JobInput = {
  clientRequestId: "request-1",
  documentName: "notes",
  pageCount: 10,
  copies: 2,
  pageCountSource: "manual",
  colorMode: "bw",
  paperSize: "A4",
  duplex: false,
  instructions: "",
  expectedLocalGeneration: 3,
};
class ShopTransport implements SharedStudentTransport {
  private callback: ((event: ServiceEvent) => void) | undefined;
  uploaded: File | undefined;
  wire: Omit<JobInput, "expectedLocalGeneration"> | undefined;
  creates = 0;
  initial = true;
  quoteResult: unknown = quote;
  subscribeToJobUpdates(callback: (event: ServiceEvent) => void) {
    this.callback = callback;
    if (this.initial) this.publish();
    return () => {
      this.callback = undefined;
    };
  }
  event(event: ServiceEvent) {
    this.callback?.(event);
  }
  publish() {
    this.event({ type: "snapshot-changed", jobs: [job], queue });
  }
  async createJob(
    value: Omit<JobInput, "expectedLocalGeneration">,
    file?: File,
  ) {
    this.creates++;
    this.wire = value;
    this.uploaded = file;
    this.publish();
    return job;
  }
  async getJobs(): Promise<PrintJob[]> {
    throw new Error("Independent jobs read must never construct snapshots");
  }
  async getQueueSnapshot(): Promise<QueueSnapshot> {
    throw new Error("Independent queue read must never construct snapshots");
  }
  async getJobById() {
    return job;
  }
  async getQuote() {
    return this.quoteResult as PrintQuote;
  }
  async getPrinterStatus() {
    return { ...meta, ...queue.printer };
  }
  async getPickupWindow() {
    return {
      ...meta,
      window: { available: false as const, reason: "eta-unavailable" as const },
    };
  }
  async getUrgentImpactPreview() {
    return null;
  }
  async requestUrgent() {
    return { ...job, urgentRequestStatus: "pending" as const };
  }
  async getDocument() {
    return new Blob(["actual shared bytes"]);
  }
  async getShopInsights() {
    return {
      ...meta,
      shopDisplayName: null,
      pendingJobCount: null,
      estimatedWorkloadMinutes: null,
      printerState: null,
      congestion: null,
      lowerCongestionPeriods: null,
    };
  }
}
const request: WhatIfRequest = {
  target: { kind: "job", jobId: job.id },
  snapshotRevision: meta.revision,
  changes: { copies: 1 },
};
describe("SharedServiceAdapter consumer boundary", () => {
  it("replays the genuine initial snapshot and preserves shop order, special prices and unknowns", async () => {
    const service = new SharedServiceAdapter(new ShopTransport());
    const events: ServiceEvent[] = [];
    service.subscribeToJobUpdates((e) => events.push(e));
    expect(events.map((e) => e.type)).toEqual([
      "connection-changed",
      "diagnostics-changed",
      "snapshot-changed",
    ]);
    expect(await service.getJobs()).toEqual([job]);
    expect(await service.getQueueSnapshot()).toEqual(queue);
    expect(await service.getQuote(input)).toEqual(quote);
    expect((await service.getJobById(job.id))?.queuePosition).toBe(7);
    const jobs = await service.getJobs();
    jobs[0]!.documentName = "changed";
    expect((await service.getJobs())[0]!.documentName).toBe(job.documentName);
  });
  it("waits for an actual coherent snapshot, never independent reads", async () => {
    const transport = new ShopTransport();
    transport.initial = false;
    const service = new SharedServiceAdapter(transport);
    const pending = service.getJobs();
    transport.event({
      type: "connection-changed",
      mode: "shared",
      state: "connected",
      lastSyncedAt: null,
    });
    transport.publish();
    expect(await pending).toEqual([job]);
  });
  it("passes the actual upload, strips local generation and accepts committed transport events", async () => {
    const transport = new ShopTransport();
    const service = new SharedServiceAdapter(transport);
    const file = new File(["%PDF-real"], "notes.pdf", {
      type: "application/pdf",
    });
    expect(await service.createJob(input, file)).toEqual(job);
    expect(transport.uploaded).toBe(file);
    expect(transport.wire).not.toHaveProperty("expectedLocalGeneration");
    expect(transport.creates).toBe(1);
  });
  it("retains stale last-known coherent data and rejects unsent writes and calculations until refreshed", async () => {
    const transport = new ShopTransport();
    const service = new SharedServiceAdapter(transport);
    transport.event({
      type: "connection-changed",
      mode: "shared",
      state: "disconnected",
      lastSyncedAt: at,
    });
    expect(await service.getJobs()).toEqual([job]);
    expect((await service.getQueueSnapshot()).stale).toBe(true);
    await expect(service.createJob(input)).rejects.toBeInstanceOf(
      SharedServiceUnavailableError,
    );
    await expect(service.getQuote(input)).rejects.toBeInstanceOf(
      SharedServiceUnavailableError,
    );
    await expect(service.simulateWhatIf(request)).rejects.toBeInstanceOf(
      SharedServiceUnavailableError,
    );
    expect(transport.creates).toBe(0);
    transport.event({
      type: "connection-changed",
      mode: "shared",
      state: "connected",
      lastSyncedAt: at,
    });
    await expect(service.getQuote(input)).rejects.toBeInstanceOf(
      SharedServiceUnavailableError,
    );
    transport.publish();
    expect(await service.getQuote(input)).toEqual(quote);
  });
  it("does not manufacture availability or a simulation capability", async () => {
    const absent = new SharedServiceAdapter();
    await expect(absent.getJobs()).rejects.toBeInstanceOf(
      SharedServiceUnavailableError,
    );
    await expect(absent.createJob(input)).rejects.toBeInstanceOf(
      SharedServiceUnavailableError,
    );
    const service = new SharedServiceAdapter(new ShopTransport());
    expect(await service.simulateWhatIf(request)).toBeNull();
    expect(await service.getUrgentImpactPreview(job.id)).toBeNull();
    expect((await service.getShopInsights()).pendingJobCount).toBeNull();
  });
  it("isolates invalid incoming events and exposes diagnostics while preserving last-known data", async () => {
    const transport = new ShopTransport();
    const service = new SharedServiceAdapter(transport);
    const events: ServiceEvent[] = [];
    service.subscribeToJobUpdates((e) => events.push(e));
    transport.event({
      type: "snapshot-changed",
      jobs: [{ ...job, estimatedCost: Infinity }],
      queue,
    });
    expect((await service.getJobs())[0]?.estimatedCost).toBe(55);
    expect((await service.getQueueSnapshot()).stale).toBe(true);
    expect(
      events.some(
        (e) => e.type === "diagnostics-changed" && e.diagnostics.length > 0,
      ),
    ).toBe(true);
  });
  it("rejects malformed calculation data visibly instead of silently filling nulls", async () => {
    const transport = new ShopTransport();
    const service = new SharedServiceAdapter(transport);
    transport.quoteResult = { ...quote, estimatedCost: NaN };
    await expect(service.getQuote(input)).rejects.toBeInstanceOf(
      InvalidSharedDataError,
    );
    expect((await service.getQueueSnapshot()).stale).toBe(true);
  });
});
describe("shared runtime schema rejection", () => {
  it("checks all nested printer and pickup configuration invariants", () => {
    expect(() =>
      validateSharedPrinter({
        ...meta,
        state: "paused",
        changedAt: at,
        reason: null,
        downtime: null,
      }),
    ).toThrow(InvalidSharedDataError);
    expect(() =>
      validateSharedQueue({
        ...queue,
        pickup: {
          bufferMinutes: 15,
          hours: {
            timeZone: "Not/AZone",
            validFrom: at,
            validUntil: "2026-11-14T10:00:00Z",
            intervals: [],
          },
        },
      }),
    ).toThrow(InvalidSharedDataError);
    expect(() =>
      validateSharedQueue({
        ...queue,
        pickup: {
          bufferMinutes: 15,
          hours: {
            timeZone: "UTC",
            validFrom: at,
            validUntil: "2026-11-14T10:00:00Z",
            intervals: [
              {
                opensAt: "2026-11-13T12:00:00Z",
                closesAt: "2026-11-13T11:00:00Z",
              },
            ],
          },
        },
      }),
    ).toThrow(InvalidSharedDataError);
    expect(() =>
      validateSharedWindow({
        ...meta,
        window: {
          available: true,
          startsAt: "2026-02-30T10:00:00Z",
          endsAt: at,
        },
      }),
    ).toThrow(InvalidSharedDataError);
  });
  it("checks insights, impacts, simulation and event enums without local calculation", () => {
    expect(() =>
      validateSharedInsights({
        ...meta,
        shopDisplayName: null,
        pendingJobCount: -1,
        estimatedWorkloadMinutes: null,
        printerState: null,
        congestion: null,
        lowerCongestionPeriods: null,
      }),
    ).toThrow(InvalidSharedDataError);
    expect(() =>
      validateSharedUrgent({
        ...meta,
        currentWaitMinutes: 1,
        proposedWaitMinutes: 0,
        timeSavedMinutes: 1,
        affectedJobCount: 1,
        currentPickupAt: at,
        proposedPickupAt: at,
        additionalWaitMinutes: { min: 2, max: 1 },
      }),
    ).toThrow(InvalidSharedDataError);
    expect(() =>
      validateSharedSimulation({
        ...meta,
        baseline: {},
        hypothetical: {},
        delta: { cost: 0, waitMinutes: 0, pickupMinutes: 0 },
        requiresApproval: false,
        assumptions: [],
      }),
    ).toThrow(InvalidSharedDataError);
    expect(() =>
      validateSharedEvent({
        type: "connection-changed",
        mode: "shared",
        state: "local-ready",
        lastSyncedAt: null,
      }),
    ).toThrow(InvalidSharedDataError);
  });
});

describe("shared bounded records and active queue safety", () => {
  it.each([
    { pageCount: 10001 },
    { copies: 101 },
    { pageCount: 0 },
    { copies: 0 },
    { documentName: "🖨".repeat(121) },
    { instructions: "अ".repeat(501) },
    { fileSize: 10 * 1024 * 1024 + 1 },
    { id: "i".repeat(1025) },
    { clientRequestId: "r".repeat(1025) },
    { token: "t".repeat(2049) },
    { documentId: "d".repeat(1025) },
  ])(
    "retains last coherent data and reports an invalid bounded record: %j",
    async (patch) => {
      const transport = new ShopTransport();
      const service = new SharedServiceAdapter(transport);
      const events: ServiceEvent[] = [];
      service.subscribeToJobUpdates((event) => events.push(event));
      transport.event({
        type: "snapshot-changed",
        jobs: [{ ...job, ...patch }],
        queue,
      });
      expect(await service.getJobs()).toEqual([job]);
      expect((await service.getQueueSnapshot()).stale).toBe(true);
      expect(
        events.some(
          (event) =>
            event.type === "diagnostics-changed" &&
            event.diagnostics.length > 0,
        ),
      ).toBe(true);
      await expect(service.createJob(input)).rejects.toBeInstanceOf(
        SharedServiceUnavailableError,
      );
      expect(transport.creates).toBe(0);
    },
  );
  it("accepts exact configured limits and Unicode code points without imposing a local token format", async () => {
    const transport = new ShopTransport();
    const service = new SharedServiceAdapter(transport);
    const boundary = {
      ...job,
      pageCount: 10000,
      copies: 100,
      documentName: "🖨".repeat(120),
      instructions: "🖨".repeat(500),
      fileSize: 10 * 1024 * 1024,
      token: "shop-specific/pickup:42",
    };
    transport.event({ type: "snapshot-changed", jobs: [boundary], queue });
    expect(await service.getJobs()).toEqual([boundary]);
    expect((await service.getQueueSnapshot()).stale).toBe(false);
    expect((await service.getJobById(job.id))?.estimatedCost).toBe(55);
  });
  it.each(["ready", "collected"] as const)(
    "rejects %s inside an active queue without replacing the known snapshot",
    async (status) => {
      const transport = new ShopTransport();
      const service = new SharedServiceAdapter(transport);
      transport.event({
        type: "snapshot-changed",
        jobs: [job],
        queue: { ...queue, entries: [{ ...queue.entries![0]!, status }] },
      });
      expect((await service.getQueueSnapshot()).entries).toEqual(queue.entries);
      expect((await service.getQueueSnapshot()).stale).toBe(true);
    },
  );
  it("rejects a printing entry behind queued work and multiple printing entries", () => {
    const entry = queue.entries![0]!;
    expect(() =>
      validateSharedQueue({
        ...queue,
        entries: [
          entry,
          { ...entry, jobId: "printing-other", status: "printing" },
        ],
      }),
    ).toThrow(InvalidSharedDataError);
    expect(() =>
      validateSharedQueue({
        ...queue,
        entries: [
          { ...entry, status: "printing" },
          { ...entry, jobId: "printing-other", status: "printing" },
        ],
      }),
    ).toThrow(InvalidSharedDataError);
  });
  it("accepts one printing entry first without inferring hidden queue positions", () => {
    const entry = queue.entries![0]!;
    const authoritative = {
      ...queue,
      entries: [
        { ...entry, jobId: "printing-first", status: "printing" },
        entry,
      ],
    };
    expect(validateSharedQueue(authoritative)).toEqual(authoritative);
    expect(
      validateSharedEvent({
        type: "snapshot-changed",
        jobs: [job],
        queue: authoritative,
      }),
    ).toEqual({ type: "snapshot-changed", jobs: [job], queue: authoritative });
  });
});

describe("shared delayed and malformed event regressions", () => {
  it.each(["disconnected", "unavailable"] as const)(
    "requires explicit recovery and fresh snapshot after %s",
    async (state) => {
      const transport = new ShopTransport();
      const service = new SharedServiceAdapter(transport);
      transport.event({
        type: "connection-changed",
        mode: "shared",
        state,
        lastSyncedAt: at,
      });
      transport.event({
        type: "snapshot-changed",
        jobs: [{ ...job, documentName: "late old snapshot" }],
        queue: { ...queue, revision: "old-late", stale: false },
      });
      expect(await service.getJobs()).toEqual([job]);
      expect((await service.getQueueSnapshot()).revision).toBe(meta.revision);
      expect((await service.getQueueSnapshot()).stale).toBe(true);
      await expect(service.createJob(input)).rejects.toBeInstanceOf(
        SharedServiceUnavailableError,
      );
      await expect(service.getQuote(input)).rejects.toBeInstanceOf(
        SharedServiceUnavailableError,
      );
      expect(transport.creates).toBe(0);
      transport.event({
        type: "connection-changed",
        mode: "shared",
        state: "connected",
        lastSyncedAt: at,
      });
      await expect(service.createJob(input)).rejects.toBeInstanceOf(
        SharedServiceUnavailableError,
      );
      expect(transport.creates).toBe(0);
      transport.publish();
      expect(await service.createJob(input)).toEqual(job);
      expect(transport.creates).toBe(1);
    },
  );
  it.each(["jobs", "queue"] as const)(
    "rejects sparse %s arrays and retains a usable last-known snapshot",
    async (target) => {
      const transport = new ShopTransport();
      const service = new SharedServiceAdapter(transport);
      const events: ServiceEvent[] = [];
      service.subscribeToJobUpdates((event) => events.push(event));
      const jobs: PrintJob[] = [job];
      jobs.length = 2;
      const entries = [queue.entries![0]!];
      entries.length = 2;
      transport.event({
        type: "snapshot-changed",
        jobs: target === "jobs" ? jobs : [job],
        queue: target === "queue" ? { ...queue, entries } : queue,
      });
      expect(await service.getJobs()).toEqual([job]);
      expect(await service.getJobById(job.id)).toEqual(job);
      expect((await service.getQueueSnapshot()).entries).toEqual(queue.entries);
      expect((await service.getQueueSnapshot()).stale).toBe(true);
      expect(
        events.some(
          (event) =>
            event.type === "diagnostics-changed" &&
            event.diagnostics.length > 0,
        ),
      ).toBe(true);
    },
  );
  it("never lets nested printer extras overwrite disconnected snapshot metadata", async () => {
    const transport = new ShopTransport();
    const service = new SharedServiceAdapter(transport);
    const printerWithExtras = {
      ...queue.printer,
      revision: "nested-untrusted",
      observedAt: "2025-01-01T00:00:00Z",
      lastSyncedAt: null,
      source: "local-demo",
      stale: false,
    };
    transport.event({
      type: "snapshot-changed",
      jobs: [job],
      queue: { ...queue, printer: printerWithExtras },
    });
    transport.event({
      type: "connection-changed",
      mode: "shared",
      state: "disconnected",
      lastSyncedAt: at,
    });
    expect(await service.getPrinterStatus()).toEqual({
      ...queue.printer,
      ...meta,
      stale: true,
    });
  });
});
