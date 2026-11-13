import type { PrintJob, SnapshotMeta } from "../contracts/jobs";
import type {
  PickupConfig,
  PrinterAvailability,
  ScenarioEstimate,
  WhatIfRequest,
  WhatIfResult,
} from "../contracts/scheduling";
import { calculatePrintEstimate } from "../pricing/calculations";
import { DomainError, assertQuote, isTimestamp } from "../utils/validation";
import { MAX_COPIES } from "../services/config";
import {
  calculatePickupWindow,
  calculateQueue,
  insertUrgent,
} from "./calculations";
export interface SimulationContext {
  jobs: PrintJob[];
  order: string[];
  remaining: Record<string, number | null>;
  printer: PrinterAvailability;
  pickup: PickupConfig;
  observedAt: string;
  meta: SnapshotMeta;
}
function scenario(job: PrintJob, pickup: PickupConfig): ScenarioEstimate {
  return {
    queuePosition: job.queuePosition,
    estimatedCost: job.estimatedCost,
    estimatedDurationMinutes: job.estimatedDurationMinutes,
    estimatedWaitMinutes: job.estimatedWaitMinutes,
    estimatedPickupAt: job.estimatedPickupAt,
    pickupWindow: calculatePickupWindow(
      job.estimatedPickupAt,
      pickup,
      job.status,
    ),
  };
}
const difference = (a: number | null, b: number | null) =>
  a === null || b === null ? null : b - a;
export function simulateWhatIf(
  context: SimulationContext,
  request: WhatIfRequest,
): WhatIfResult | null {
  if (request.snapshotRevision !== context.meta.revision)
    throw new DomainError("SNAPSHOT_MISMATCH", "errors.snapshotChanged");
  const jobs = [...context.jobs];
  let order = [...context.order];
  const remaining = { ...context.remaining };
  let id: string;
  if (request.target.kind === "job") {
    id = request.target.jobId;
    const target = jobs.find((job) => job.id === id);
    if (!target || target.status !== "queued") return null;
  } else {
    const input = request.target.input;
    assertQuote(input);
    id = "draft-estimate";
    const estimate = calculatePrintEstimate(input);
    jobs.push({
      id,
      token: "",
      clientRequestId: "",
      documentName: "",
      instructions: "",
      createdAt: context.observedAt,
      updatedAt: context.observedAt,
      ...input,
      pageCountSource: "assumed",
      status: "queued",
      priority: "normal",
      urgentRequestStatus: "none",
      dataOrigin: "local-user",
      documentLocation: "none",
      documentId: null,
      originalFileName: null,
      mimeType: null,
      fileSize: null,
      queuePosition: null,
      estimatedCost: estimate.estimatedCost,
      estimatedDurationMinutes: estimate.estimatedDurationMinutes,
      estimatedWaitMinutes: null,
      estimatedPickupAt: null,
    });
    order.push(id);
    remaining[id] = estimate.estimatedDurationMinutes;
  }
  const baselineJobs = calculateQueue(
    jobs,
    order,
    remaining,
    context.printer,
    context.observedAt,
  ).jobs;
  const baseline = scenario(
    baselineJobs.find((job) => job.id === id)!,
    context.pickup,
  );
  const target = jobs.find((job) => job.id === id)!;
  const changes = request.changes;
  if (changes.requestUrgent !== undefined && changes.requestUrgent !== true)
    throw new DomainError("INVALID_SCENARIO", "errors.invalidInput");
  if (
    changes.colorMode !== undefined &&
    changes.colorMode !== "bw" &&
    changes.colorMode !== "colour"
  )
    throw new DomainError("INVALID_SCENARIO", "errors.invalidInput");
  if (
    changes.copies !== undefined &&
    (typeof changes.copies !== "number" ||
      !Number.isInteger(changes.copies) ||
      changes.copies < 1 ||
      changes.copies > MAX_COPIES)
  )
    throw new DomainError("INVALID_SCENARIO", "errors.invalidInput");
  if (
    changes.printer !== undefined &&
    (typeof changes.printer !== "object" || changes.printer === null)
  )
    throw new DomainError("INVALID_SCENARIO", "errors.invalidInput");
  const changed = {
    ...target,
    colorMode: changes.colorMode ?? target.colorMode,
    copies: changes.copies ?? target.copies,
  };
  assertQuote(changed);
  const workloadChanged =
    changed.colorMode !== target.colorMode || changed.copies !== target.copies;
  let changedJobs = jobs;
  if (workloadChanged) {
    const estimate = calculatePrintEstimate(changed);
    changedJobs = jobs.map((job) =>
      job.id === id
        ? {
            ...changed,
            estimatedCost: estimate.estimatedCost,
            estimatedDurationMinutes: estimate.estimatedDurationMinutes,
          }
        : job,
    );
    remaining[id] = estimate.estimatedDurationMinutes;
  }
  const requiresApproval =
    changes.requestUrgent === true &&
    !(
      target.priority === "urgent" && target.urgentRequestStatus === "approved"
    );
  if (requiresApproval) order = insertUrgent(order, changedJobs, id);
  let printer = context.printer;
  if (changes.printer) {
    const change = changes.printer;
    if (
      (change.state !== "paused" && change.state !== "maintenance") ||
      !change.downtime ||
      (change.downtime.kind !== "unknown" &&
        (change.downtime.kind !== "known" ||
          !isTimestamp(change.downtime.expectedResumeAt)))
    )
      throw new DomainError("INVALID_SCENARIO", "errors.invalidInput");
    printer = {
      state: change.state,
      changedAt: context.observedAt,
      reason: "printer.simulatedOutage",
      downtime: change.downtime,
    };
  }
  const hypotheticalJob = calculateQueue(
    changedJobs,
    order,
    remaining,
    printer,
    context.observedAt,
  ).jobs.find((job) => job.id === id)!;
  const hypothetical = scenario(hypotheticalJob, context.pickup);
  return {
    ...context.meta,
    baseline,
    hypothetical,
    delta: {
      cost: difference(baseline.estimatedCost, hypothetical.estimatedCost),
      waitMinutes: difference(
        baseline.estimatedWaitMinutes,
        hypothetical.estimatedWaitMinutes,
      ),
      pickupMinutes:
        baseline.estimatedPickupAt === null ||
        hypothetical.estimatedPickupAt === null
          ? null
          : (Date.parse(hypothetical.estimatedPickupAt) -
              Date.parse(baseline.estimatedPickupAt)) /
            60000,
    },
    requiresApproval,
    assumptions: [
      "assumptions.simulationOnly",
      "assumptions.snapshotWorkload",
      ...(!context.pickup.hours ? ["assumptions.noShopHours"] : []),
    ],
  };
}
