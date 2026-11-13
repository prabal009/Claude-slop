/// <reference lib="es2024.promise" />
import { Blob as NativeBlob, File as NativeFile } from "node:buffer";
import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { JobInput, PrintJob } from "../contracts/jobs";
import type { ServiceEvent, StudentService } from "../contracts/service";
import type { WhatIfRequest } from "../contracts/scheduling";
import {
  createLocalDemo,
  LocalDemoAdapter,
} from "../services/LocalDemoAdapter";
import type { LocalMeta } from "../storage/printq-db";

type SnapshotEvent = Extract<ServiceEvent, { type: "snapshot-changed" }>;

const at = "2026-11-13T10:00:00.000Z";
const deadline = "2026-11-13T10:10:00.000Z";
const tenMinutes = 10 * 60_000;
const pdf =
  "%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n";
const adapters = new Set<LocalDemoAdapter>();
const databases = new Set<string>();
let now: string;

beforeEach(() => {
  now = at;
  // Leave IndexedDB's task scheduler real; only the adapter's expiry timer advances.
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  // Native files exercise the real fixture validation and IndexedDB Blob boundary.
  vi.stubGlobal("Blob", NativeBlob);
  vi.stubGlobal("File", NativeFile);
  vi.stubGlobal("crypto", webcrypto);
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(pdf, {
          status: 200,
          headers: { "Content-Type": "application/pdf" },
        }),
    ),
  );
});

afterEach(async () => {
  try {
    await Promise.all([...adapters].map((adapter) => adapter.dispose()));
    await Promise.all(
      [...databases].map((databaseName) => {
        const deletion = Promise.withResolvers<void>();
        const request = indexedDB.deleteDatabase(databaseName);
        request.onsuccess = () => deletion.resolve();
        request.onerror = () => deletion.reject(request.error);
        request.onblocked = () =>
          deletion.reject(
            new Error(`Database cleanup blocked: ${databaseName}`),
          );
        return deletion.promise;
      }),
    );
  } finally {
    adapters.clear();
    databases.clear();
    vi.restoreAllMocks();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  }
});

function local(
  databaseName = `printq-expiry-transition-${crypto.randomUUID()}`,
) {
  const result = createLocalDemo({ databaseName, clock: () => new Date(now) });
  adapters.add(result.service);
  databases.add(databaseName);
  return result;
}

async function dispose(service: LocalDemoAdapter) {
  await service.dispose();
  adapters.delete(service);
}

function input(documentName = "Expiry regression"): JobInput {
  return {
    clientRequestId: crypto.randomUUID(),
    documentName,
    pageCount: 4,
    copies: 1,
    pageCountSource: "manual",
    colorMode: "bw",
    paperSize: "A4",
    duplex: false,
    instructions: "",
  };
}

function watchSnapshots(service: StudentService) {
  const snapshots: SnapshotEvent[] = [];
  const waiters = new Set<{
    predicate: (snapshot: SnapshotEvent) => boolean;
    resolve: (snapshot: SnapshotEvent) => void;
  }>();
  const unsubscribe = service.subscribeToJobUpdates((event) => {
    if (event.type !== "snapshot-changed") return;
    snapshots.push(event);
    for (const waiter of waiters) {
      if (!waiter.predicate(event)) continue;
      waiters.delete(waiter);
      waiter.resolve(event);
    }
  });
  return {
    snapshots,
    unsubscribe,
    waitFor(predicate: (snapshot: SnapshotEvent) => boolean) {
      const existing = snapshots.find(predicate);
      if (existing) return Promise.resolve(existing);
      const next = Promise.withResolvers<SnapshotEvent>();
      waiters.add({ predicate, resolve: next.resolve });
      return next.promise;
    },
  };
}

// Read the persisted records directly, without a service read that could observe expiry.
async function durableState(
  databaseName: string,
): Promise<{ meta: LocalMeta; jobs: PrintJob[] }> {
  const opened = Promise.withResolvers<IDBDatabase>();
  const request = indexedDB.open(databaseName);
  request.onsuccess = () => opened.resolve(request.result);
  request.onerror = () => opened.reject(request.error);
  const database = await opened.promise;
  try {
    const read = Promise.withResolvers<{ meta: LocalMeta; jobs: PrintJob[] }>();
    const transaction = database.transaction(["meta", "jobs"], "readonly");
    const meta = transaction.objectStore("meta").get("state");
    const jobs = transaction.objectStore("jobs").getAll();
    transaction.oncomplete = () =>
      read.resolve({
        meta: meta.result as LocalMeta,
        jobs: jobs.result as PrintJob[],
      });
    transaction.onabort = () => read.reject(transaction.error);
    transaction.onerror = () => read.reject(transaction.error);
    return await read.promise;
  } finally {
    database.close();
  }
}

// These spies pass through to fake-indexeddb: records and transactions remain real.
function watchWrites() {
  const put = vi.spyOn(IDBObjectStore.prototype, "put");
  const add = vi.spyOn(IDBObjectStore.prototype, "add");
  const remove = vi.spyOn(IDBObjectStore.prototype, "delete");
  const clear = vi.spyOn(IDBObjectStore.prototype, "clear");
  return {
    metaPuts: () =>
      put.mock.calls.flatMap(([value], index) => {
        const context = put.mock.contexts[index];
        return context instanceof IDBObjectStore && context.name === "meta"
          ? [value as LocalMeta]
          : [];
      }),
    reset() {
      put.mockClear();
      add.mockClear();
      remove.mockClear();
      clear.mockClear();
    },
    expectNone() {
      expect(put).not.toHaveBeenCalled();
      expect(add).not.toHaveBeenCalled();
      expect(remove).not.toHaveBeenCalled();
      expect(clear).not.toHaveBeenCalled();
    },
  };
}

function expectExpiredJobs(after: PrintJob[], before: PrintJob[]) {
  expect(after.map((job) => job.id).sort()).toEqual(
    before.map((job) => job.id).sort(),
  );
  for (const job of before) {
    const expired = after.find((candidate) => candidate.id === job.id);
    if (job.status === "queued" || job.status === "printing") {
      expect(expired).toMatchObject({
        id: job.id,
        status: job.status,
        priority: job.priority,
        queuePosition: job.queuePosition,
        estimatedCost: job.estimatedCost,
        estimatedDurationMinutes: job.estimatedDurationMinutes,
        estimatedWaitMinutes: null,
        estimatedPickupAt: null,
      });
    } else {
      expect(expired).toEqual(job);
    }
  }
}

async function readConsumers(
  service: StudentService,
  queuedId: string,
  readyId: string,
  draft: JobInput,
  revision: string,
) {
  const [
    jobs,
    job,
    queue,
    printer,
    insights,
    quote,
    jobWindow,
    draftWindow,
    readyWindow,
    simulation,
  ] = await Promise.all([
    service.getJobs(),
    service.getJobById(queuedId),
    service.getQueueSnapshot(),
    service.getPrinterStatus(),
    service.getShopInsights(),
    service.getQuote(draft),
    service.getPickupWindow({ kind: "job", jobId: queuedId }),
    service.getPickupWindow({ kind: "draft", input: draft }),
    service.getPickupWindow({ kind: "job", jobId: readyId }),
    service.simulateWhatIf({
      target: { kind: "job", jobId: queuedId },
      snapshotRevision: revision,
      changes: { copies: 2 },
    }),
  ]);
  return {
    jobs,
    job,
    queue,
    printer,
    insights,
    quote,
    jobWindow,
    draftWindow,
    readyWindow,
    simulation,
  };
}

describe("persisted known-maintenance expiry", () => {
  it("notifies open subscribers once at the deadline and gives every consumer the new durable revision", async () => {
    const { service, demoController } = local();
    await demoController.loadFixtures();
    const queued = await service.createJob(input());
    await service.createJob(input("Later queued job"));
    const first = watchSnapshots(service);
    const second = watchSnapshots(service);
    const [initial, secondInitial] = await Promise.all([
      first.waitFor(() => true),
      second.waitFor(() => true),
    ]);
    expect(secondInitial).toEqual(initial);
    expect(initial.jobs.some((job) => job.status === "printing")).toBe(true);
    const ready = initial.jobs.find((job) => job.status === "ready")!;
    expect(ready).toBeDefined();
    const readyWindow = (
      await service.getPickupWindow({ kind: "job", jobId: ready.id })
    ).window;
    expect(readyWindow.available).toBe(true);

    await demoController.setPrinterScenario("known-maintenance");
    const known = await first.waitFor(
      (snapshot) => snapshot.queue.revision !== initial.queue.revision,
    );
    expect(
      await second.waitFor(
        (snapshot) => snapshot.queue.revision === known.queue.revision,
      ),
    ).toEqual(known);
    expect(known.queue.printer).toMatchObject({
      state: "maintenance",
      downtime: { kind: "known", expectedResumeAt: deadline },
    });
    expect(
      known.jobs
        .filter((job) => job.status === "queued" || job.status === "printing")
        .every(
          (job) =>
            job.estimatedWaitMinutes !== null && job.estimatedPickupAt !== null,
        ),
    ).toBe(true);
    const persistedBefore = await durableState(service.repo.databaseName);
    const draft = input("Uncommitted quote");
    const oldRequest: WhatIfRequest = {
      target: { kind: "job", jobId: queued.id },
      snapshotRevision: known.queue.revision,
      changes: { copies: 2 },
    };
    const writes = watchWrites();
    const before = await readConsumers(
      service,
      queued.id,
      ready.id,
      draft,
      known.queue.revision,
    );
    expect(before.queue).toEqual(known.queue);
    expect(before.simulation).toMatchObject({
      revision: known.queue.revision,
      observedAt: at,
    });
    writes.expectNone();

    const firstExpiry = first.waitFor(
      (snapshot) =>
        snapshot.queue.revision !== known.queue.revision &&
        snapshot.queue.revision !== initial.queue.revision,
    );
    const secondExpiry = second.waitFor(
      (snapshot) =>
        snapshot.queue.revision !== known.queue.revision &&
        snapshot.queue.revision !== initial.queue.revision,
    );
    now = deadline;
    await vi.advanceTimersByTimeAsync(tenMinutes);
    // No service/repository reads trigger this transition: the timer must deliver it.
    const [expired, secondExpired] = await Promise.all([
      firstExpiry,
      secondExpiry,
    ]);
    expect(secondExpired).toEqual(expired);
    expect(BigInt(expired.queue.revision)).toBe(
      BigInt(known.queue.revision) + 1n,
    );
    expect(expired.queue.observedAt).toBe(deadline);
    expect(expired.queue.entries).toEqual(known.queue.entries);
    expect(expired.queue.printer).toEqual(known.queue.printer);
    expect(expired.queue.localGeneration).toBe(known.queue.localGeneration);
    expectExpiredJobs(expired.jobs, known.jobs);

    const persistedAfter = await durableState(service.repo.databaseName);
    expect(persistedAfter.meta).toEqual({
      ...persistedBefore.meta,
      revision: expired.queue.revision,
      observedAt: deadline,
    });
    expectExpiredJobs(persistedAfter.jobs, persistedBefore.jobs);
    expect(
      [...persistedAfter.jobs].sort((a, b) => a.id.localeCompare(b.id)),
    ).toEqual([...expired.jobs].sort((a, b) => a.id.localeCompare(b.id)));
    expect(writes.metaPuts()).toEqual([persistedAfter.meta]);

    writes.reset();
    await expect(service.simulateWhatIf(oldRequest)).rejects.toMatchObject({
      code: "SNAPSHOT_MISMATCH",
    });
    const current = await readConsumers(
      service,
      queued.id,
      ready.id,
      draft,
      expired.queue.revision,
    );
    for (const result of [
      current.queue,
      current.printer,
      current.insights,
      current.quote,
      current.jobWindow,
      current.draftWindow,
      current.readyWindow,
      current.simulation,
    ]) {
      expect(result).toMatchObject({
        revision: expired.queue.revision,
        observedAt: deadline,
      });
    }
    expect(current.jobs).toEqual(expired.jobs);
    expect(current.quote).toMatchObject({
      estimatedWaitMinutes: null,
      estimatedTotalMinutes: null,
      estimatedPickupAt: null,
      estimatedCost: before.quote.estimatedCost,
      estimatedDurationMinutes: before.quote.estimatedDurationMinutes,
    });
    expect(current.jobWindow.window).toEqual({
      available: false,
      reason: "eta-unavailable",
    });
    expect(current.draftWindow.window).toEqual({
      available: false,
      reason: "eta-unavailable",
    });
    expect(current.readyWindow.window).toEqual(readyWindow);
    expect(current.jobs.find((job) => job.id === ready.id)).toEqual(ready);
    expect(current.simulation).toMatchObject({
      baseline: {
        estimatedWaitMinutes: null,
        estimatedPickupAt: null,
        pickupWindow: { available: false, reason: "eta-unavailable" },
      },
      hypothetical: {
        estimatedWaitMinutes: null,
        estimatedPickupAt: null,
        pickupWindow: { available: false, reason: "eta-unavailable" },
      },
    });
    const revisions = [
      initial.queue.revision,
      known.queue.revision,
      expired.queue.revision,
    ];
    expect(first.snapshots.map((snapshot) => snapshot.queue.revision)).toEqual(
      revisions,
    );
    expect(second.snapshots.map((snapshot) => snapshot.queue.revision)).toEqual(
      revisions,
    );

    now = "2026-11-13T10:11:00.000Z";
    await vi.advanceTimersByTimeAsync(60_000);
    for (let read = 0; read < 3; read++) {
      expect(
        await readConsumers(
          service,
          queued.id,
          ready.id,
          draft,
          expired.queue.revision,
        ),
      ).toEqual(current);
    }
    expect(await durableState(service.repo.databaseName)).toEqual(
      persistedAfter,
    );
    expect(first.snapshots.map((snapshot) => snapshot.queue.revision)).toEqual(
      revisions,
    );
    expect(second.snapshots.map((snapshot) => snapshot.queue.revision)).toEqual(
      revisions,
    );
    writes.expectNone();
    first.unsubscribe();
    second.unsubscribe();
  });

  it("lets two adapters observing the same deadline commit only one revision and one metadata write", async () => {
    const first = local();
    await first.demoController.loadFixtures();
    await first.service.createJob(input());
    await first.demoController.setPrinterScenario("known-maintenance");
    const second = local(first.service.repo.databaseName);
    const firstEvents = watchSnapshots(first.service);
    const secondEvents = watchSnapshots(second.service);
    const [known, secondKnown] = await Promise.all([
      firstEvents.waitFor(() => true),
      secondEvents.waitFor(() => true),
    ]);
    expect(secondKnown).toEqual(known);
    const persistedBefore = await durableState(first.service.repo.databaseName);
    const writes = watchWrites();
    const firstExpiry = firstEvents.waitFor(
      (snapshot) => snapshot.queue.revision !== known.queue.revision,
    );
    const secondExpiry = secondEvents.waitFor(
      (snapshot) => snapshot.queue.revision !== known.queue.revision,
    );

    now = deadline;
    await vi.advanceTimersByTimeAsync(tenMinutes);
    const [expired, secondExpired] = await Promise.all([
      firstExpiry,
      secondExpiry,
    ]);
    expect(secondExpired).toEqual(expired);
    expect(BigInt(expired.queue.revision)).toBe(
      BigInt(known.queue.revision) + 1n,
    );
    expect(expired.queue.observedAt).toBe(deadline);
    expect(expired.queue.entries).toEqual(known.queue.entries);
    expectExpiredJobs(expired.jobs, known.jobs);
    const persisted = await durableState(first.service.repo.databaseName);
    expect(persisted.meta).toEqual({
      ...persistedBefore.meta,
      revision: expired.queue.revision,
      observedAt: deadline,
    });
    expectExpiredJobs(persisted.jobs, persistedBefore.jobs);
    expect(writes.metaPuts()).toEqual([persisted.meta]);

    writes.reset();
    const queues = await Promise.all([
      first.service.getQueueSnapshot(),
      second.service.getQueueSnapshot(),
      first.service.getQueueSnapshot(),
      second.service.getQueueSnapshot(),
    ]);
    expect(queues).toEqual([
      expired.queue,
      expired.queue,
      expired.queue,
      expired.queue,
    ]);
    expect(firstEvents.snapshots).toEqual([known, expired]);
    expect(secondEvents.snapshots).toEqual([known, expired]);
    writes.expectNone();
    firstEvents.unsubscribe();
    secondEvents.unsubscribe();
  });

  it("cancels disposal timers and commits a missed expiry exactly once when reopened", async () => {
    const { service, demoController } = local();
    await demoController.loadFixtures();
    const queued = await service.createJob(input());
    await demoController.setPrinterScenario("known-maintenance");
    const events = watchSnapshots(service);
    const known = await events.waitFor(() => true);
    const ready = known.jobs.find((job) => job.status === "ready")!;
    const persistedBefore = await durableState(service.repo.databaseName);
    const databaseName = service.repo.databaseName;
    const writes = watchWrites();
    expect(vi.getTimerCount()).toBeGreaterThan(0);

    await dispose(service);
    expect(vi.getTimerCount()).toBe(0);
    now = "2026-11-13T10:15:00.000Z";
    await vi.advanceTimersByTimeAsync(15 * 60_000);
    expect(await durableState(databaseName)).toEqual(persistedBefore);
    expect(events.snapshots).toEqual([known]);
    writes.expectNone();

    const reopened = local(databaseName).service;
    const reopenedEvents = watchSnapshots(reopened);
    const expired = await reopenedEvents.waitFor(() => true);
    expect(BigInt(expired.queue.revision)).toBe(
      BigInt(known.queue.revision) + 1n,
    );
    expect(expired.queue.observedAt).toBe(now);
    expect(expired.queue.entries).toEqual(known.queue.entries);
    expect(expired.queue.printer).toEqual(known.queue.printer);
    expectExpiredJobs(expired.jobs, known.jobs);
    const persisted = await durableState(databaseName);
    expect(persisted.meta).toEqual({
      ...persistedBefore.meta,
      revision: expired.queue.revision,
      observedAt: now,
    });
    expectExpiredJobs(persisted.jobs, persistedBefore.jobs);
    expect(writes.metaPuts()).toEqual([persisted.meta]);
    expect(vi.getTimerCount()).toBe(0);

    writes.reset();
    const draft = input("Reopened estimate");
    const current = await readConsumers(
      reopened,
      queued.id,
      ready.id,
      draft,
      expired.queue.revision,
    );
    now = "2026-11-13T10:20:00.000Z";
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(
      await readConsumers(
        reopened,
        queued.id,
        ready.id,
        draft,
        expired.queue.revision,
      ),
    ).toEqual(current);
    expect(reopenedEvents.snapshots).toEqual([expired]);
    await dispose(reopened);
    const reopenedAgain = local(databaseName).service;
    const againEvents = watchSnapshots(reopenedAgain);
    expect(await againEvents.waitFor(() => true)).toEqual(expired);
    expect(await reopenedAgain.getQueueSnapshot()).toEqual(expired.queue);
    expect(await durableState(databaseName)).toEqual(persisted);
    expect(againEvents.snapshots).toEqual([expired]);
    writes.expectNone();
    againEvents.unsubscribe();
  });

  it("does not write, advance the as-of time, or publish snapshots for ordinary unchanged reads", async () => {
    const { service, demoController } = local();
    await demoController.loadFixtures();
    const queued = await service.createJob(input());
    const events = watchSnapshots(service);
    const initial = await events.waitFor(() => true);
    const ready = initial.jobs.find((job) => job.status === "ready")!;
    const draft = input("Read-only estimate");
    const before = await readConsumers(
      service,
      queued.id,
      ready.id,
      draft,
      initial.queue.revision,
    );
    const persisted = await durableState(service.repo.databaseName);
    const writes = watchWrites();

    for (let minute = 1; minute <= 3; minute++) {
      now = new Date(Date.parse(at) + minute * 60_000).toISOString();
      await vi.advanceTimersByTimeAsync(60_000);
      expect(
        await readConsumers(
          service,
          queued.id,
          ready.id,
          draft,
          initial.queue.revision,
        ),
      ).toEqual(before);
    }
    expect(before.queue.observedAt).toBe(at);
    expect(await durableState(service.repo.databaseName)).toEqual(persisted);
    expect(events.snapshots).toEqual([initial]);
    writes.expectNone();
    events.unsubscribe();
  });
});
