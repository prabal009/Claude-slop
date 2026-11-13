import { describe, expect, it } from "vitest";
import type { PrintJob } from "../contracts/jobs";
import type { WhatIfChanges, WhatIfRequest } from "../contracts/scheduling";
import { calculatePrintEstimate } from "../pricing/calculations";
import { simulateWhatIf, type SimulationContext } from "../queue/simulation";

const observedAt = "2026-11-13T04:30:00.000Z";
function job(id: string): PrintJob {
  return {
    id,
    token: `token-${id}`,
    clientRequestId: `request-${id}`,
    documentName: id,
    instructions: "",
    createdAt: observedAt,
    updatedAt: observedAt,
    pageCount: 10,
    copies: 1,
    pageCountSource: "manual",
    colorMode: "bw",
    paperSize: "A4",
    status: "queued",
    priority: "normal",
    urgentRequestStatus: "none",
    duplex: false,
    dataOrigin: "local-user",
    documentLocation: "none",
    documentId: null,
    originalFileName: null,
    mimeType: null,
    fileSize: null,
    queuePosition: null,
    estimatedCost: 123,
    estimatedDurationMinutes: 37,
    estimatedWaitMinutes: null,
    estimatedPickupAt: null,
  };
}
function context(remaining: number | null): SimulationContext {
  return {
    jobs: [job("A")],
    order: ["A"],
    remaining: { A: remaining },
    printer: {
      state: "operational",
      changedAt: observedAt,
      reason: null,
      downtime: null,
    },
    pickup: { bufferMinutes: 15, hours: null },
    observedAt,
    meta: {
      revision: "revision-1",
      observedAt,
      lastSyncedAt: observedAt,
      source: "local-demo",
      stale: false,
    },
  };
}
function simulateUnchangedInput(
  state: SimulationContext,
  changes: WhatIfChanges,
  target: WhatIfRequest["target"] = { kind: "job", jobId: "A" },
) {
  const request: WhatIfRequest = {
    target,
    snapshotRevision: state.meta.revision,
    changes,
  };
  const beforeState = structuredClone(state);
  const beforeRequest = structuredClone(request);
  const result = simulateWhatIf(state, request);
  expect(state).toEqual(beforeState);
  expect(request).toEqual(beforeRequest);
  expect(result).not.toBeNull();
  return result!;
}
const unchangedWorkloads: [string, WhatIfChanges][] = [
  ["no-op", {}],
  ["identical UI workload fields", { copies: 1, colorMode: "bw" }],
  ["urgency-only", { requestUrgent: true }],
  [
    "urgency with identical UI workload fields",
    { requestUrgent: true, copies: 1, colorMode: "bw" },
  ],
  [
    "printer-only",
    {
      printer: {
        state: "maintenance",
        downtime: {
          kind: "known",
          expectedResumeAt: "2026-11-13T04:40:00.000Z",
        },
      },
    },
  ],
  [
    "printer with identical UI workload fields",
    {
      copies: 1,
      colorMode: "bw",
      printer: {
        state: "maintenance",
        downtime: {
          kind: "known",
          expectedResumeAt: "2026-11-13T04:40:00.000Z",
        },
      },
    },
  ],
];

describe("pure simulations preserve snapshot workload unless the workload changes", () => {
  it.each(unchangedWorkloads)(
    "keeps explicit unknown remaining unavailable for %s",
    (_name, changes) => {
      const result = simulateUnchangedInput(context(null), changes);
      expect(result.baseline).toMatchObject({
        estimatedCost: 123,
        estimatedDurationMinutes: 37,
        estimatedPickupAt: null,
        pickupWindow: { available: false, reason: "eta-unavailable" },
      });
      expect(result.hypothetical).toMatchObject({
        estimatedCost: 123,
        estimatedDurationMinutes: 37,
        estimatedPickupAt: null,
        pickupWindow: { available: false, reason: "eta-unavailable" },
      });
      expect(result.delta.pickupMinutes).toBeNull();
    },
  );

  it.each(unchangedWorkloads)(
    "preserves explicit remaining and nominal metadata for %s",
    (_name, changes) => {
      const result = simulateUnchangedInput(context(7), changes);
      expect(result.baseline).toMatchObject({
        estimatedCost: 123,
        estimatedDurationMinutes: 37,
        estimatedPickupAt: "2026-11-13T04:37:00.000Z",
      });
      expect(result.hypothetical).toMatchObject({
        estimatedCost: 123,
        estimatedDurationMinutes: 37,
        estimatedPickupAt: changes.printer
          ? "2026-11-13T04:47:00.000Z"
          : "2026-11-13T04:37:00.000Z",
      });
      expect(result.delta.cost).toBe(0);
    },
  );

  it.each<WhatIfChanges>([
    { copies: 2 },
    { colorMode: "colour" },
    { copies: 2, colorMode: "colour" },
  ])(
    "recomputes nominal metadata and remaining for actual workload change %j",
    (changes) => {
      const state = context(null);
      const estimate = calculatePrintEstimate({
        ...state.jobs[0]!,
        ...changes,
      });
      const result = simulateUnchangedInput(state, changes);
      expect(result.baseline.estimatedPickupAt).toBeNull();
      expect(result.hypothetical).toMatchObject({
        estimatedCost: estimate.estimatedCost,
        estimatedDurationMinutes: estimate.estimatedDurationMinutes,
        estimatedPickupAt: new Date(
          Date.parse(observedAt) + estimate.estimatedDurationMinutes * 60000,
        ).toISOString(),
      });
    },
  );

  it("uses computed nominal remaining for a draft baseline and unchanged hypothetical", () => {
    const state = context(7);
    const input = {
      pageCount: 5,
      copies: 2,
      colorMode: "bw" as const,
      duplex: false,
      paperSize: "A4" as const,
    };
    const estimate = calculatePrintEstimate(input);
    const result = simulateUnchangedInput(
      state,
      { copies: 2, colorMode: "bw" },
      { kind: "draft", input },
    );
    expect(result.baseline).toMatchObject({
      estimatedCost: estimate.estimatedCost,
      estimatedDurationMinutes: estimate.estimatedDurationMinutes,
      estimatedWaitMinutes: 7,
      estimatedPickupAt: new Date(
        Date.parse(observedAt) +
          (7 + estimate.estimatedDurationMinutes) * 60000,
      ).toISOString(),
    });
    expect(result.hypothetical).toEqual(result.baseline);
  });

  it("does not move approved U1 after approved U2 or require another approval", () => {
    const state = context(7);
    const urgent = (id: string): PrintJob => ({
      ...job(id),
      priority: "urgent",
      urgentRequestStatus: "approved",
    });
    state.jobs = [urgent("U1"), urgent("U2"), job("A")];
    state.order = ["U1", "U2", "A"];
    state.remaining = { U1: 3, U2: 5, A: 7 };
    const result = simulateUnchangedInput(
      state,
      { requestUrgent: true, copies: 1, colorMode: "bw" },
      { kind: "job", jobId: "U1" },
    );
    expect(result.baseline).toMatchObject({
      queuePosition: 1,
      estimatedWaitMinutes: 0,
      estimatedPickupAt: "2026-11-13T04:33:00.000Z",
    });
    expect(result.hypothetical).toEqual(result.baseline);
    expect(result.requiresApproval).toBe(false);
    expect(result.delta).toEqual({ cost: 0, waitMinutes: 0, pickupMinutes: 0 });
  });
});
