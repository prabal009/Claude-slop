/// <reference lib="es2024.promise" />
import { Blob as NativeBlob, File as NativeFile } from "node:buffer";
import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { JobInput } from "../contracts/jobs";
import type { ServiceEvent, StudentService } from "../contracts/service";
import type { QueueSnapshot, WhatIfChanges } from "../contracts/scheduling";
import {
  createLocalDemo,
  LocalDemoAdapter,
} from "../services/LocalDemoAdapter";
import type { Draft } from "../storage/drafts";

const at = "2026-11-13T10:00:00.000Z";
const pdf =
  "%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n";
const adapters = new Set<LocalDemoAdapter>();
const databases = new Set<string>();
let now: string;

beforeEach(() => {
  now = at;
  // jsdom's File lacks arrayBuffer; native files preserve the real upload/digest path.
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
    vi.unstubAllGlobals();
  }
});

function local(databaseName = `printq-local-domain-${crypto.randomUUID()}`) {
  const result = createLocalDemo({ databaseName, clock: () => new Date(now) });
  adapters.add(result.service);
  databases.add(databaseName);
  return result;
}

async function dispose(service: LocalDemoAdapter) {
  await service.dispose();
  adapters.delete(service);
}

function input(overrides: Partial<JobInput> = {}): JobInput {
  return {
    clientRequestId: crypto.randomUUID(),
    documentName: "Lecture notes",
    pageCount: 4,
    copies: 1,
    pageCountSource: "manual",
    colorMode: "bw",
    paperSize: "A4",
    duplex: false,
    instructions: "",
    ...overrides,
  };
}

function draftInput(draft: Draft): JobInput {
  return {
    clientRequestId: draft.clientRequestId,
    expectedLocalGeneration: draft.generation,
    documentName: draft.documentName,
    copies: Number(draft.copies),
    pageCount: Number(draft.pageCount),
    pageCountSource: draft.pageCountSource,
    colorMode: draft.colorMode,
    paperSize: draft.paperSize,
    duplex: draft.duplex,
    instructions: draft.instructions,
  };
}

function order(queue: QueueSnapshot): string[] {
  expect(queue.entries).not.toBeNull();
  return queue.entries!.map((entry) => entry.jobId);
}

function expectNewer(after: QueueSnapshot, before: QueueSnapshot) {
  expect(BigInt(after.revision)).toBeGreaterThan(BigInt(before.revision));
}

async function observe(service: StudentService) {
  const events: ServiceEvent[] = [];
  const initial =
    Promise.withResolvers<
      Extract<ServiceEvent, { type: "snapshot-changed" }>
    >();
  const unsubscribe = service.subscribeToJobUpdates((event) => {
    events.push(event);
    if (event.type === "snapshot-changed") initial.resolve(event);
  });
  return { events, initial: await initial.promise, unsubscribe };
}

async function openDatabase(databaseName: string): Promise<IDBDatabase> {
  const opened = Promise.withResolvers<IDBDatabase>();
  const request = indexedDB.open(databaseName);
  request.onsuccess = () => opened.resolve(request.result);
  request.onerror = () => opened.reject(request.error);
  return opened.promise;
}

async function documentCount(databaseName: string): Promise<number> {
  const database = await openDatabase(databaseName);
  try {
    const counted = Promise.withResolvers<number>();
    const transaction = database.transaction("documents", "readonly");
    const request = transaction.objectStore("documents").count();
    transaction.oncomplete = () => counted.resolve(request.result);
    transaction.onabort = () => counted.reject(transaction.error);
    return await counted.promise;
  } finally {
    database.close();
  }
}

// Corruption is written through the real IndexedDB boundary, not a replacement repository.
async function corruptRecord(
  databaseName: string,
  storeName: "jobs" | "meta",
  key: string,
  change: (record: Record<string, unknown>) => Record<string, unknown>,
): Promise<void> {
  const database = await openDatabase(databaseName);
  try {
    const written = Promise.withResolvers<void>();
    const transaction = database.transaction(storeName, "readwrite");
    const store = transaction.objectStore(storeName);
    const request = store.get(key);
    request.onsuccess = () =>
      store.put(change(request.result as Record<string, unknown>));
    transaction.oncomplete = () => written.resolve();
    transaction.onabort = () => written.reject(transaction.error);
    transaction.onerror = () => written.reject(transaction.error);
    await written.promise;
  } finally {
    database.close();
  }
}

describe("local creation and durable request identity", () => {
  it("commits concurrent name-only submissions of the same request exactly once across adapters", async () => {
    const first = local();
    const second = local(first.service.repo.databaseName);
    const before = await first.service.getQueueSnapshot();
    const request = input({ expectedLocalGeneration: before.localGeneration! });
    const results = await Promise.all([
      first.service.createJob(request),
      second.service.createJob({ ...request }),
      first.service.createJob({ ...request }),
      second.service.createJob({ ...request }),
    ]);

    expect(new Set(results.map((job) => job.id)).size).toBe(1);
    expect(new Set(results.map((job) => job.token)).size).toBe(1);
    expect(
      results.every((job) => job.clientRequestId === request.clientRequestId),
    ).toBe(true);
    expect(results[0]).toMatchObject({
      documentLocation: "none",
      documentId: null,
      originalFileName: null,
    });
    expect(await first.service.getJobs()).toEqual([results[0]]);
    expect(await second.service.getJobs()).toEqual([results[0]]);
    const after = await first.service.getQueueSnapshot();
    expect(order(after)).toEqual([results[0]!.id]);
    expect(BigInt(after.revision)).toBe(BigInt(before.revision) + 1n);
    expect(await second.service.getQueueSnapshot()).toEqual(after);
  });

  it("rejects changed intent for an existing request without changing the receipt or queue", async () => {
    const { service } = local();
    const request = input();
    const committed = await service.createJob(request);
    const before = await service.getQueueSnapshot();
    const changes: Partial<JobInput>[] = [
      { documentName: "Different document" },
      { instructions: "Bind this copy" },
      { copies: 2 },
      { pageCount: 5 },
      { pageCountSource: "assumed" },
      { colorMode: "colour" },
      { duplex: true },
    ];
    for (const change of changes) {
      await expect(
        service.createJob({ ...request, ...change }),
      ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
      expect(await service.getJobs()).toEqual([committed]);
      expect(await service.getQueueSnapshot()).toEqual(before);
    }
    expect(await service.createJob({ ...request })).toEqual(committed);
    expect(await service.getQueueSnapshot()).toEqual(before);
  });

  it("reloads the same receipts, order, estimates and revision without advancing work with the clock", async () => {
    const { service } = local();
    const request = input();
    const created = await service.createJob(request);
    await service.createJob(
      input({ documentName: "Next document", copies: 2 }),
    );
    const jobs = await service.getJobs();
    const queue = await service.getQueueSnapshot();
    const quote = await service.getQuote(request);
    const printer = await service.getPrinterStatus();
    const databaseName = service.repo.databaseName;
    await dispose(service);
    now = "2026-11-14T18:00:00.000Z";
    const reloaded = local(databaseName).service;

    expect(await reloaded.getJobs()).toEqual(jobs);
    expect(await reloaded.getJobById(created.id)).toEqual(
      jobs.find((job) => job.id === created.id),
    );
    expect(await reloaded.getJobById("missing-job")).toBeNull();
    expect(await reloaded.getQueueSnapshot()).toEqual(queue);
    expect(await reloaded.getQuote(request)).toEqual(quote);
    expect(await reloaded.getPrinterStatus()).toEqual(printer);
    expect(await reloaded.createJob(request)).toEqual(
      jobs.find((job) => job.id === created.id),
    );
    expect(await reloaded.getQueueSnapshot()).toEqual(queue);
  });

  it("uses real file bytes for idempotency and retains the actual document after reload", async () => {
    const { service } = local();
    const request = input();
    const original = new File([pdf], "notes.pdf", {
      type: "application/pdf",
      lastModified: 12,
    });
    const first = await service.createJob(request, original);
    expect(first).toMatchObject({
      documentLocation: "device",
      originalFileName: "notes.pdf",
      mimeType: "application/pdf",
      fileSize: original.size,
    });
    expect(first.documentId).not.toBeNull();
    const queue = await service.getQueueSnapshot();
    const sameBytes = new File([pdf], "notes.pdf", {
      type: "application/pdf",
      lastModified: 99,
    });
    expect(await service.createJob(request, sameBytes)).toEqual(first);

    // Equal name, MIME and length ensure this conflict depends on the content digest.
    const changedBytes = new File(
      [pdf.replace("Catalog", "CatAlog")],
      "notes.pdf",
      { type: "application/pdf", lastModified: 12 },
    );
    expect(changedBytes.size).toBe(original.size);
    await expect(
      service.createJob(request, changedBytes),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    await expect(service.createJob(request)).rejects.toMatchObject({
      code: "IDEMPOTENCY_CONFLICT",
    });
    expect(await service.getQueueSnapshot()).toEqual(queue);

    const databaseName = service.repo.databaseName;
    await dispose(service);
    const reloaded = local(databaseName).service;
    const document = await reloaded.getDocument(first.documentId!);
    expect(document).not.toBeNull();
    expect(new TextDecoder().decode(await document!.arrayBuffer())).toBe(pdf);
    expect(await reloaded.getJobById(first.id)).toEqual(first);
    expect(await reloaded.createJob(request, sameBytes)).toEqual(first);
    expect(await reloaded.getQueueSnapshot()).toEqual(queue);
  });
});

describe("local drafts and generation boundaries", () => {
  it("persists raw strings and rejects a stale editing revision without losing the latest draft", async () => {
    const { service } = local();
    const draft = await service.repo.createDraft({
      documentName: "Unfinished",
      copies: "",
      pageCount: "0004",
    });
    expect(draft).toMatchObject({
      copies: "",
      pageCount: "0004",
      file: null,
      state: "editing",
      committedJobId: null,
    });
    const saved = await service.repo.saveDraft({
      ...draft,
      documentName: "Latest edit",
      copies: "0002",
    });
    expect(saved.revision).toBe(draft.revision + 1);
    await expect(
      service.repo.saveDraft({ ...draft, documentName: "Stale edit" }),
    ).rejects.toMatchObject({ code: "DRAFT_CONFLICT" });
    expect(await service.repo.getDraft(draft.id)).toEqual(saved);

    const databaseName = service.repo.databaseName;
    await dispose(service);
    expect(await local(databaseName).service.repo.getDraft(draft.id)).toEqual(
      saved,
    );
  });

  it("protects receipt fields and exposes the committed job through its durable draft receipt", async () => {
    const { service } = local();
    const draft = await service.repo.createDraft({
      documentName: "Receipt draft",
      pageCount: "4",
    });
    await expect(
      service.repo.saveDraft({ ...draft, state: "committed" }),
    ).rejects.toMatchObject({ code: "INVALID_DRAFT" });
    await expect(
      service.repo.saveDraft({ ...draft, committedJobId: "forged-job" }),
    ).rejects.toMatchObject({ code: "INVALID_DRAFT" });
    expect(await service.repo.getDraft(draft.id)).toEqual(draft);

    const submitting = await service.repo.saveDraft({
      ...draft,
      state: "submitting",
    });
    const job = await service.createJob(draftInput(submitting));
    const receipt = await service.repo.getDraft(draft.id);
    expect(receipt).toMatchObject({
      id: draft.id,
      clientRequestId: draft.clientRequestId,
      state: "committed",
      committedJobId: job.id,
    });
    expect(receipt!.revision).toBeGreaterThan(submitting.revision);
    await expect(
      service.repo.saveDraft({ ...submitting, documentName: "Late autosave" }),
    ).rejects.toMatchObject({ code: "DRAFT_COMMITTED" });
    expect(await service.repo.getDraft(draft.id)).toEqual(receipt);
    expect(await service.getJobById(receipt!.committedJobId!)).toEqual(job);
    expect(await service.createJob(draftInput(submitting))).toEqual(job);
    expect((await service.getJobs()).length).toBe(1);

    const databaseName = service.repo.databaseName;
    await dispose(service);
    const reloaded = local(databaseName).service;
    expect(await reloaded.repo.getDraft(draft.id)).toEqual(receipt);
    expect(await reloaded.getJobById(receipt!.committedJobId!)).toEqual(job);
  });

  it("round-trips a real draft file and commits it without leaving a second draft document", async () => {
    const { service } = local();
    const draft = await service.repo.createDraft({
      documentName: "Attached draft",
      pageCount: "4",
    });
    const file = new File([pdf], "attached.pdf", {
      type: "application/pdf",
      lastModified: 15,
    });
    const saved = await service.repo.saveDraft({ ...draft, file });
    const databaseName = service.repo.databaseName;
    await dispose(service);
    const reloaded = local(databaseName).service;
    const restored = await reloaded.repo.getDraft(draft.id);
    expect(restored).toMatchObject({
      fileMissing: false,
      fileSize: file.size,
      originalFileName: file.name,
      revision: saved.revision,
    });
    expect(restored!.file).not.toBeNull();
    expect(new TextDecoder().decode(await restored!.file!.arrayBuffer())).toBe(
      pdf,
    );
    await expect(
      reloaded.createJob(draftInput(restored!)),
    ).rejects.toMatchObject({ code: "FILE_MISSING" });
    const job = await reloaded.createJob(
      draftInput(restored!),
      restored!.file!,
    );
    const receipt = await reloaded.repo.getDraft(draft.id);
    expect(receipt).toMatchObject({
      state: "committed",
      committedJobId: job.id,
      fileMissing: false,
    });
    expect(receipt!.file).toBeInstanceOf(File);
    expect(new TextDecoder().decode(await receipt!.file!.arrayBuffer())).toBe(
      pdf,
    );
    expect(await reloaded.getDocument(`draft:${draft.id}`)).toBeNull();
    expect(
      new TextDecoder().decode(
        await (await reloaded.getDocument(job.documentId!))!.arrayBuffer(),
      ),
    ).toBe(pdf);
    expect(await documentCount(databaseName)).toBe(1);
    await dispose(reloaded);
    const committedReload = local(databaseName).service;
    const recoveredReceipt = await committedReload.repo.getDraft(draft.id);
    expect(recoveredReceipt).toEqual(receipt);
    expect(recoveredReceipt!.file).toBeInstanceOf(File);
    expect(
      new TextDecoder().decode(await recoveredReceipt!.file!.arrayBuffer()),
    ).toBe(pdf);
    expect(await committedReload.getJobById(job.id)).toEqual(job);
    expect(
      new TextDecoder().decode(
        await (await committedReload.getDocument(
          job.documentId!,
        ))!.arrayBuffer(),
      ),
    ).toBe(pdf);
  });

  it.each(["clearLocalData", "resetDemo"] as const)(
    "%s fences stale drafts and stale create requests by generation",
    async (operation) => {
      const { service, demoController } = local();
      const draft = await service.repo.createDraft({
        documentName: "Old generation",
        pageCount: "4",
      });
      const before = await service.getQueueSnapshot();
      await demoController[operation]();
      const after = await service.getQueueSnapshot();
      expect(after.localGeneration).toBe(before.localGeneration! + 1);
      expectNewer(after, before);
      expect(await service.repo.getDraft(draft.id)).toBeNull();
      const jobs = await service.getJobs();
      await expect(
        service.repo.saveDraft({ ...draft, documentName: "Late save" }),
      ).rejects.toMatchObject({ code: "DATASET_REPLACED" });
      await expect(service.createJob(draftInput(draft))).rejects.toMatchObject({
        code: "DATASET_REPLACED",
      });
      expect(await service.getJobs()).toEqual(jobs);
      expect(await service.getQueueSnapshot()).toEqual(after);
      const next = await service.repo.createDraft({
        documentName: "Fresh generation",
      });
      expect(next.generation).toBe(after.localGeneration);
      expect((await service.createJob(draftInput(next))).clientRequestId).toBe(
        next.clientRequestId,
      );
    },
  );

  it("fences an in-flight real content digest when another adapter clears the dataset", async () => {
    const first = local();
    const second = local(first.service.repo.databaseName);
    const file = new File([pdf], "in-flight.pdf", { type: "application/pdf" });
    const draft = await first.service.repo.createDraft({
      documentName: "In-flight draft",
      pageCount: "4",
    });
    const saved = await first.service.repo.saveDraft({ ...draft, file });
    const before = await first.service.getQueueSnapshot();
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const realDigest = crypto.subtle.digest.bind(crypto.subtle);
    const digest = vi
      .spyOn(crypto.subtle, "digest")
      .mockImplementation(async (algorithm, bytes) => {
        entered.resolve();
        await release.promise;
        return realDigest(algorithm, bytes);
      });
    const creating = first.service.createJob(draftInput(saved), file);
    const rejected = expect(creating).rejects.toMatchObject({
      code: "DATASET_REPLACED",
    });
    try {
      await entered.promise;
      expect(digest).toHaveBeenCalledTimes(1);
      await second.demoController.clearLocalData();
      const cleared = await second.service.getQueueSnapshot();
      expect(cleared.localGeneration).toBe(before.localGeneration! + 1);
      expectNewer(cleared, before);
      release.resolve();
      await rejected;
      await expect(first.service.repo.saveDraft(saved)).rejects.toMatchObject({
        code: "DATASET_REPLACED",
      });
      expect(await first.service.getJobs()).toEqual([]);
      expect(await second.service.getJobs()).toEqual([]);
      expect(await first.service.repo.getDraft(draft.id)).toBeNull();
      expect(await documentCount(first.service.repo.databaseName)).toBe(0);
      expect(await first.service.getQueueSnapshot()).toEqual(cleared);
      expect(await second.service.getQueueSnapshot()).toEqual(cleared);
    } finally {
      release.resolve();
      try {
        await rejected;
      } finally {
        digest.mockRestore();
      }
    }
  });
});

describe("local coherent reads and corruption", () => {
  it("delivers a complete initial subscription snapshot from one coherent persisted revision", async () => {
    const { service, demoController } = local();
    await demoController.loadFixtures();
    await service.createJob(input());
    const { events, initial, unsubscribe } = await observe(service);
    unsubscribe();
    expect(
      events.find((event) => event.type === "connection-changed"),
    ).toMatchObject({ mode: "local-demo", state: "local-ready" });
    expect(initial.jobs).toEqual(await service.getJobs());
    expect(initial.queue).toEqual(await service.getQueueSnapshot());
    expect(initial.jobs.some((job) => job.status === "ready")).toBe(true);
    expect(initial.jobs.some((job) => job.status === "collected")).toBe(true);
    const active = initial.jobs.filter(
      (job) => job.status === "queued" || job.status === "printing",
    );
    expect(new Set(order(initial.queue))).toEqual(
      new Set(active.map((job) => job.id)),
    );
    initial.queue.entries!.forEach((entry, index) => {
      const job = initial.jobs.find(
        (candidate) => candidate.id === entry.jobId,
      )!;
      expect(entry.status).toBe(job.status);
      expect(entry.priority).toBe(job.priority);
      expect(job.queuePosition).toBe(index + 1);
    });
    expect((await service.getQuote(input())).revision).toBe(
      initial.queue.revision,
    );
    expect((await service.getPrinterStatus()).revision).toBe(
      initial.queue.revision,
    );
    expect((await service.getShopInsights()).revision).toBe(
      initial.queue.revision,
    );
  });

  it.each(["active-record", "queue-order"] as const)(
    "preserves valid history but blocks new jobs for corrupt %s",
    async (corruption) => {
      const { service, demoController } = local();
      const completed = await service.createJob(
        input({ documentName: "Preserved history" }),
      );
      await demoController.advanceJob(completed.id);
      await demoController.advanceJob(completed.id);
      const history = await service.getJobById(completed.id);
      const active = await service.createJob(
        input({ documentName: "Active record" }),
      );
      const before = await service.getQueueSnapshot();
      if (corruption === "active-record") {
        await corruptRecord(
          service.repo.databaseName,
          "jobs",
          active.id,
          (record) => ({ ...record, pageCount: 0 }),
        );
      } else {
        await corruptRecord(
          service.repo.databaseName,
          "meta",
          "state",
          (record) => ({ ...record, activeOrder: [active.id, active.id] }),
        );
      }

      const jobs = await service.getJobs();
      expect(jobs).toContainEqual(history);
      expect(await service.getJobById(completed.id)).toEqual(history);
      if (corruption === "active-record")
        expect(await service.getJobById(active.id)).toBeNull();
      else
        expect(jobs.find((job) => job.id === active.id)).toMatchObject({
          id: active.id,
          documentName: active.documentName,
          status: active.status,
          estimatedCost: active.estimatedCost,
          estimatedDurationMinutes: active.estimatedDurationMinutes,
          estimatedWaitMinutes: null,
          estimatedPickupAt: null,
          queuePosition: null,
        });
      const queue = await service.getQueueSnapshot();
      expect(queue.entries).toBeNull();
      expect(queue.revision).toBe(before.revision);
      const { events, unsubscribe } = await observe(service);
      unsubscribe();
      expect(
        events.some(
          (event) =>
            event.type === "diagnostics-changed" &&
            event.diagnostics.some(
              (diagnostic) => diagnostic.code === "CORRUPT_LOCAL_RECORD",
            ),
        ),
      ).toBe(true);
      await expect(
        service.createJob(input({ documentName: "Must not be committed" })),
      ).rejects.toMatchObject({ code: "CORRUPT_QUEUE" });
      expect(await service.getJobs()).toEqual(jobs);
      expect(await service.getQueueSnapshot()).toEqual(queue);
      const databaseName = service.repo.databaseName;
      await dispose(service);
      const reloaded = local(databaseName).service;
      expect(await reloaded.getJobs()).toEqual(jobs);
      expect(await reloaded.getQueueSnapshot()).toEqual(queue);
    },
  );
});

describe("local urgency and read-only scenarios", () => {
  it("leaves a pending request in place and reorders only after explicit demo approval", async () => {
    const { service, demoController } = local();
    await demoController.loadFixtures();
    const before = await service.getQueueSnapshot();
    const originalOrder = order(before);
    const target = (await service.getJobById(originalOrder.at(-1)!))!;
    const jobs = await service.getJobs();
    const impact = await service.getUrgentImpactPreview(target.id);
    expect(impact).not.toBeNull();
    expect(impact!.revision).toBe(before.revision);
    expect(impact!.timeSavedMinutes).toBeGreaterThan(0);
    expect(impact!.affectedJobCount).toBeGreaterThan(0);
    expect(await service.getJobs()).toEqual(jobs);
    expect(await service.getQueueSnapshot()).toEqual(before);

    const pending = await service.requestUrgent(target.id);
    const pendingQueue = await service.getQueueSnapshot();
    expect(pending).toMatchObject({
      priority: "normal",
      urgentRequestStatus: "pending",
      queuePosition: target.queuePosition,
      estimatedPickupAt: target.estimatedPickupAt,
    });
    expect(order(pendingQueue)).toEqual(originalOrder);
    expect(pendingQueue.entries).toEqual(before.entries);
    expectNewer(pendingQueue, before);

    await demoController.resolveUrgency(target.id, "approved");
    const approved = await service.getJobById(target.id);
    const after = await service.getQueueSnapshot();
    expect(approved).toMatchObject({
      priority: "urgent",
      urgentRequestStatus: "approved",
      queuePosition: 2,
      estimatedWaitMinutes: impact!.proposedWaitMinutes,
      estimatedPickupAt: impact!.proposedPickupAt,
    });
    expect(order(after)).toEqual([
      originalOrder[0],
      target.id,
      ...originalOrder.slice(1).filter((id) => id !== target.id),
    ]);
    expect(after.entries![0]!.status).toBe("printing");
    expect(
      after.entries!.find((entry) => entry.jobId === target.id)
        ?.optimizationChange,
    ).toMatchObject({
      reason: "urgent-approved",
      previousQueuePosition: target.queuePosition,
      previousEstimatedPickupAt: target.estimatedPickupAt,
    });
    expectNewer(after, pendingQueue);
  });

  it("keeps a rejected urgency request in its original position", async () => {
    const { service, demoController } = local();
    await demoController.loadFixtures();
    const before = await service.getQueueSnapshot();
    const target = order(before).at(-1)!;
    await service.requestUrgent(target);
    await demoController.resolveUrgency(target, "rejected");
    expect(await service.getJobById(target)).toMatchObject({
      priority: "normal",
      urgentRequestStatus: "rejected",
    });
    const after = await service.getQueueSnapshot();
    expect(order(after)).toEqual(order(before));
    expect(after.entries).toEqual(before.entries);
  });

  it.each<{ label: string; changes: WhatIfChanges }>([
    { label: "colour", changes: { colorMode: "colour" } },
    { label: "copies", changes: { copies: 3 } },
    { label: "urgent approval", changes: { requestUrgent: true } },
    {
      label: "unknown printer downtime",
      changes: {
        printer: { state: "maintenance", downtime: { kind: "unknown" } },
      },
    },
  ])(
    "simulates $label without changing jobs, order, revision or subscription events",
    async ({ changes }) => {
      const { service, demoController } = local();
      await demoController.loadFixtures();
      const before = await service.getQueueSnapshot();
      const jobs = await service.getJobs();
      const target = jobs.find((job) => job.id === order(before).at(-1))!;
      const { events, unsubscribe } = await observe(service);
      const priorEvents = [...events];
      const result = await service.simulateWhatIf({
        target: { kind: "job", jobId: target.id },
        snapshotRevision: before.revision,
        changes,
      });
      expect(result).not.toBeNull();
      expect(result!.revision).toBe(before.revision);
      expect(result!.requiresApproval).toBe(changes.requestUrgent === true);
      expect(result!.baseline).toMatchObject({
        queuePosition: target.queuePosition,
        estimatedCost: target.estimatedCost,
        estimatedDurationMinutes: target.estimatedDurationMinutes,
        estimatedWaitMinutes: target.estimatedWaitMinutes,
        estimatedPickupAt: target.estimatedPickupAt,
      });
      if (changes.colorMode || changes.copies) {
        expect(result!.hypothetical.estimatedCost!).toBeGreaterThan(
          result!.baseline.estimatedCost!,
        );
        expect(result!.hypothetical.estimatedDurationMinutes!).toBeGreaterThan(
          result!.baseline.estimatedDurationMinutes!,
        );
        expect(result!.hypothetical.queuePosition).toBe(target.queuePosition);
        expect(result!.delta.cost!).toBeGreaterThan(0);
      }
      if (changes.requestUrgent) {
        expect(result!.hypothetical.queuePosition).toBe(2);
        expect(result!.delta.waitMinutes!).toBeLessThan(0);
        expect(result!.delta.pickupMinutes!).toBeLessThan(0);
      }
      if (changes.printer) {
        expect(result!.hypothetical).toMatchObject({
          estimatedWaitMinutes: null,
          estimatedPickupAt: null,
          pickupWindow: { available: false, reason: "eta-unavailable" },
        });
        expect(result!.delta).toMatchObject({
          cost: 0,
          waitMinutes: null,
          pickupMinutes: null,
        });
      }
      expect(await service.getJobs()).toEqual(jobs);
      expect(await service.getQueueSnapshot()).toEqual(before);
      expect(events).toEqual(priorEvents);
      unsubscribe();
    },
  );

  it("simulates an uncommitted draft and rejects stale scenario revisions without creating a job", async () => {
    const { service } = local();
    await service.createJob(input());
    const before = await service.getQueueSnapshot();
    const jobs = await service.getJobs();
    const draft = input({ pageCount: 6, copies: 1 });
    const quote = await service.getQuote(draft);
    const request = {
      target: { kind: "draft" as const, input: draft },
      snapshotRevision: before.revision,
      changes: { copies: 2, colorMode: "colour" as const },
    };
    const result = await service.simulateWhatIf(request);
    expect(result).not.toBeNull();
    expect(result!.baseline).toMatchObject({
      queuePosition: 2,
      estimatedCost: quote.estimatedCost,
      estimatedDurationMinutes: quote.estimatedDurationMinutes,
      estimatedWaitMinutes: quote.estimatedWaitMinutes,
      estimatedPickupAt: quote.estimatedPickupAt,
    });
    expect(result!.hypothetical.estimatedCost!).toBeGreaterThan(
      result!.baseline.estimatedCost!,
    );
    expect(result!.requiresApproval).toBe(false);
    expect(await service.getJobs()).toEqual(jobs);
    expect(await service.getQueueSnapshot()).toEqual(before);
    await service.createJob(input({ documentName: "Newer revision" }));
    const current = await service.getQueueSnapshot();
    const currentJobs = await service.getJobs();
    await expect(service.simulateWhatIf(request)).rejects.toMatchObject({
      code: "SNAPSHOT_MISMATCH",
    });
    expect(await service.getQueueSnapshot()).toEqual(current);
    expect(await service.getJobs()).toEqual(currentJobs);
  });
});

describe("local printer availability and explicit fixtures", () => {
  it("adds known downtime once, makes unknown ETAs unavailable, and never delays ready pickup", async () => {
    const { service, demoController } = local();
    await demoController.loadFixtures();
    const before = await service.getQueueSnapshot();
    const jobs = await service.getJobs();
    const active = jobs.filter(
      (job) => job.status === "queued" || job.status === "printing",
    );
    const ready = jobs.find((job) => job.status === "ready")!;
    const collected = jobs.find((job) => job.status === "collected")!;
    const readyWindow = (
      await service.getPickupWindow({ kind: "job", jobId: ready.id })
    ).window;
    expect(readyWindow.available).toBe(true);
    const draft = input();
    const quote = await service.getQuote(draft);

    await demoController.setPrinterScenario("known-maintenance");
    const knownQueue = await service.getQueueSnapshot();
    const knownJobs = await service.getJobs();
    expect(order(knownQueue)).toEqual(order(before));
    expect(await service.getPrinterStatus()).toMatchObject({
      state: "maintenance",
      downtime: { kind: "known", expectedResumeAt: "2026-11-13T10:10:00.000Z" },
      revision: knownQueue.revision,
    });
    for (const job of active) {
      const delayed = knownJobs.find((candidate) => candidate.id === job.id)!;
      expect(delayed.estimatedWaitMinutes).toBe(job.estimatedWaitMinutes! + 10);
      expect(
        Date.parse(delayed.estimatedPickupAt!) -
          Date.parse(job.estimatedPickupAt!),
      ).toBe(10 * 60_000);
      expect(delayed.estimatedDurationMinutes).toBe(
        job.estimatedDurationMinutes,
      );
    }
    const knownQuote = await service.getQuote(draft);
    expect(knownQuote.estimatedWaitMinutes).toBe(
      quote.estimatedWaitMinutes! + 10,
    );
    expect(knownQuote.estimatedWaitMinutes).toBe(
      10 +
        knownQueue.entries!.reduce(
          (sum, entry) => sum + entry.remainingMinutes!,
          0,
        ),
    );
    expect(
      (await service.getPickupWindow({ kind: "job", jobId: ready.id })).window,
    ).toEqual(readyWindow);
    expect(await service.getJobById(ready.id)).toEqual(ready);
    expect(await service.getQueueSnapshot()).toEqual(knownQueue);

    await demoController.setPrinterScenario("unknown-maintenance");
    const unknownQueue = await service.getQueueSnapshot();
    expect(order(unknownQueue)).toEqual(order(before));
    expect(await service.getPrinterStatus()).toMatchObject({
      state: "maintenance",
      downtime: { kind: "unknown" },
    });
    for (const job of active) {
      expect(await service.getJobById(job.id)).toMatchObject({
        estimatedWaitMinutes: null,
        estimatedPickupAt: null,
      });
      expect(
        (await service.getPickupWindow({ kind: "job", jobId: job.id })).window,
      ).toEqual({ available: false, reason: "eta-unavailable" });
    }
    expect(await service.getQuote(draft)).toMatchObject({
      estimatedWaitMinutes: null,
      estimatedTotalMinutes: null,
      estimatedPickupAt: null,
      estimatedCost: quote.estimatedCost,
      estimatedDurationMinutes: quote.estimatedDurationMinutes,
    });
    expect(
      (await service.getPickupWindow({ kind: "draft", input: draft })).window,
    ).toEqual({ available: false, reason: "eta-unavailable" });
    expect(await service.getJobById(ready.id)).toEqual(ready);
    expect(
      (await service.getPickupWindow({ kind: "job", jobId: ready.id })).window,
    ).toEqual(readyWindow);
    expect(
      (await service.getPickupWindow({ kind: "job", jobId: collected.id }))
        .window,
    ).toEqual({ available: false, reason: "not-applicable" });

    await demoController.setPrinterScenario("resumed");
    expect(await service.getPrinterStatus()).toMatchObject({
      state: "resumed",
      downtime: null,
    });
    expect(await service.getJobs()).toEqual(jobs);
    expect((await service.getQuote(draft)).estimatedWaitMinutes).toBe(
      quote.estimatedWaitMinutes,
    );
  });

  it("loads fixtures only explicitly and clears/resets data with monotonic revisions and generations", async () => {
    const { service, demoController } = local();
    const empty = await service.getQueueSnapshot();
    expect(await service.getJobs()).toEqual([]);
    expect(order(empty)).toEqual([]);
    const draft = await service.repo.createDraft({
      documentName: "User draft",
    });
    const attachment = new File([pdf], "user.pdf", { type: "application/pdf" });
    const savedDraft = await service.repo.saveDraft({
      ...draft,
      file: attachment,
    });
    const user = await service.createJob(input(), attachment);
    const beforeFixtures = await service.getQueueSnapshot();
    await demoController.loadFixtures();
    const loaded = await service.getQueueSnapshot();
    const jobs = await service.getJobs();
    expectNewer(loaded, beforeFixtures);
    expect(loaded.localGeneration).toBe(empty.localGeneration);
    expect(
      jobs.filter((job) => job.dataOrigin === "demo-fixture"),
    ).toHaveLength(6);
    expect(jobs.find((job) => job.id === user.id)).toMatchObject({
      id: user.id,
      token: user.token,
      dataOrigin: "local-user",
    });
    expect((await service.repo.getDraft(draft.id))?.revision).toBe(
      savedDraft.revision,
    );
    const fixture = jobs.find(
      (job) => job.dataOrigin === "demo-fixture" && job.documentId,
    )!;
    expect(
      new TextDecoder().decode(
        await (await service.getDocument(fixture.documentId!))!.arrayBuffer(),
      ),
    ).toBe(pdf);
    await demoController.loadFixtures();
    expect(await service.getJobs()).toEqual(jobs);
    expect(await service.getQueueSnapshot()).toEqual(loaded);

    await demoController.clearLocalData();
    const cleared = await service.getQueueSnapshot();
    expectNewer(cleared, loaded);
    expect(cleared.localGeneration).toBe(loaded.localGeneration! + 1);
    expect(order(cleared)).toEqual([]);
    expect(await service.getJobs()).toEqual([]);
    expect(await service.repo.getDraft(draft.id)).toBeNull();
    expect(await service.getDocument(`draft:${draft.id}`)).toBeNull();
    expect(await service.getDocument(user.documentId!)).toBeNull();
    expect(await service.getDocument(fixture.documentId!)).toBeNull();

    const databaseName = service.repo.databaseName;
    await dispose(service);
    const reloaded = local(databaseName);
    expect(await reloaded.service.getJobs()).toEqual([]);
    expect(await reloaded.service.getQueueSnapshot()).toEqual(cleared);
    await reloaded.demoController.resetDemo();
    const reset = await reloaded.service.getQueueSnapshot();
    expectNewer(reset, cleared);
    expect(reset.localGeneration).toBe(cleared.localGeneration! + 1);
    const resetJobs = await reloaded.service.getJobs();
    expect(resetJobs).toHaveLength(6);
    expect(resetJobs.every((job) => job.dataOrigin === "demo-fixture")).toBe(
      true,
    );
    expect(await reloaded.service.getJobById(user.id)).toBeNull();
    expect(
      await reloaded.service.getDocument(fixture.documentId!),
    ).not.toBeNull();
    await reloaded.demoController.resetDemo();
    const resetAgain = await reloaded.service.getQueueSnapshot();
    expectNewer(resetAgain, reset);
    expect(resetAgain.localGeneration).toBe(reset.localGeneration! + 1);
    expect((await reloaded.service.getJobs()).map((job) => job.id)).toEqual(
      resetJobs.map((job) => job.id),
    );
  });
});
