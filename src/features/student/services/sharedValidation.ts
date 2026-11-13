import type { PrintJob, PrintQuote } from "../contracts/jobs";
import type { ServiceEvent } from "../contracts/service";
import type {
  QueueSnapshot,
  PrinterSnapshot,
  PickupWindowResult,
  ShopInsights,
  UrgentImpact,
  WhatIfResult,
} from "../contracts/scheduling";
import {
  MAX_COPIES,
  MAX_FILE_BYTES,
  MAX_INSTRUCTIONS_CODE_POINTS,
  MAX_NAME_CODE_POINTS,
  MAX_PAGES,
} from "./config";

export class InvalidSharedDataError extends Error {
  readonly messageKey = "errors.sharedDataUnavailable" as const;
  constructor(public readonly field: string) {
    super(`Invalid shared service data: ${field}`);
    this.name = "InvalidSharedDataError";
  }
}
type Check = (value: unknown, path: string) => void;
const fail = (p: string): never => {
  throw new InvalidSharedDataError(p);
};
const boundedString =
  (max: number, required = false): Check =>
  (v, p) => {
    if (typeof v !== "string" || v.length > max * 2) fail(p);
    const text = v as string;
    let count = 0;
    for (const _character of text) {
      if (++count > max) fail(p);
    }
    if (required && !text.trim()) fail(p);
  };
// Shared IDs/tokens have no local format requirement; these are defensive
// envelope limits, not a claim about the host's identifier protocol.
const str = boundedString(10000);
const nonempty = boundedString(1024, true);
const bool: Check = (v, p) => {
  if (typeof v !== "boolean") fail(p);
};
const num: Check = (v, p) => {
  if (typeof v !== "number" || !Number.isFinite(v)) fail(p);
};
const positive: Check = (v, p) => {
  num(v, p);
  if ((v as number) < 0) fail(p);
};
const integer: Check = (v, p) => {
  positive(v, p);
  if (!Number.isSafeInteger(v)) fail(p);
};
const position: Check = (v, p) => {
  integer(v, p);
  if ((v as number) < 1) fail(p);
};
const boundedInteger =
  (max: number, min = 0): Check =>
  (v, p) => {
    integer(v, p);
    if ((v as number) < min || (v as number) > max) fail(p);
  };
const timestamp: Check = (v, p) => {
  str(v, p);
  if (
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(v as string) ||
    !Number.isFinite(Date.parse(v as string))
  )
    fail(p);
  const normalized = new Date(v as string).toISOString();
  if (normalized.slice(0, 19) !== (v as string).slice(0, 19)) fail(p);
};
const nullable =
  (c: Check): Check =>
  (v, p) => {
    if (v !== null) c(v, p);
  };
const one =
  (...values: unknown[]): Check =>
  (v, p) => {
    if (!values.includes(v)) fail(p);
  };
const array =
  (c: Check): Check =>
  (v, p) => {
    if (!Array.isArray(v)) fail(p);
    const values = v as unknown[];
    for (let index = 0; index < values.length; index++) {
      if (!Object.prototype.hasOwnProperty.call(values, index))
        fail(`${p}[${index}]`);
      c(values[index], `${p}[${index}]`);
    }
  };
const object =
  (fields: Record<string, Check>): Check =>
  (v, p) => {
    if (!v || typeof v !== "object" || Array.isArray(v)) fail(p);
    for (const [k, c] of Object.entries(fields))
      c((v as Record<string, unknown>)[k], `${p}.${k}`);
  };
const status = one("queued", "printing", "ready", "collected");
const priority = one("normal", "urgent");
const state = one("operational", "paused", "maintenance", "resumed");
const meta = {
  revision: nonempty,
  observedAt: nullable(timestamp),
  lastSyncedAt: nullable(timestamp),
  source: one("shared"),
  stale: bool,
};
const downtime: Check = (v, p) => {
  object({ kind: one("known", "unknown") })(v, p);
  const value = v as { kind: string };
  if (value.kind === "known") object({ expectedResumeAt: timestamp })(v, p);
};
const printer: Check = (v, p) => {
  object({
    state: nullable(state),
    changedAt: nullable(timestamp),
    reason: nullable(str),
    downtime: nullable(downtime),
  })(v, p);
  const x = v as { state: string | null; downtime: unknown };
  if (
    x.state === "paused" || x.state === "maintenance"
      ? x.downtime === null
      : x.downtime !== null
  )
    fail(`${p}.downtime`);
};
const hours: Check = (v, p) => {
  object({
    timeZone: nonempty,
    validFrom: timestamp,
    validUntil: timestamp,
    intervals: array(object({ opensAt: timestamp, closesAt: timestamp })),
  })(v, p);
  const h = v as {
    timeZone: string;
    validFrom: string;
    validUntil: string;
    intervals: { opensAt: string; closesAt: string }[];
  };
  try {
    new Intl.DateTimeFormat("en", { timeZone: h.timeZone });
  } catch {
    fail(`${p}.timeZone`);
  }
  let end = Date.parse(h.validFrom);
  const until = Date.parse(h.validUntil);
  if (end >= until) fail(p);
  for (const i of h.intervals) {
    const a = Date.parse(i.opensAt),
      b = Date.parse(i.closesAt);
    if (a < end || a >= b || b > until) fail(`${p}.intervals`);
    end = b;
  }
};
const windowCheck: Check = (v, p) => {
  object({ available: bool })(v, p);
  const value = v as { available: boolean };
  if (value.available) {
    object({ startsAt: timestamp, endsAt: timestamp })(v, p);
    const w = v as { startsAt: string; endsAt: string };
    if (Date.parse(w.startsAt) > Date.parse(w.endsAt)) fail(p);
  } else
    object({
      reason: one("eta-unavailable", "outside-known-hours", "not-applicable"),
    })(v, p);
};
const estimates = {
  estimatedCost: nullable(positive),
  estimatedDurationMinutes: nullable(positive),
  estimatedWaitMinutes: nullable(positive),
  estimatedPickupAt: nullable(timestamp),
};
const jobCheck = object({
  id: nonempty,
  token: boundedString(2048, true),
  clientRequestId: nonempty,
  documentName: boundedString(MAX_NAME_CODE_POINTS, true),
  instructions: boundedString(MAX_INSTRUCTIONS_CODE_POINTS),
  createdAt: timestamp,
  updatedAt: timestamp,
  pageCount: boundedInteger(MAX_PAGES, 1),
  copies: boundedInteger(MAX_COPIES, 1),
  pageCountSource: one("assumed", "manual", "image"),
  colorMode: one("bw", "colour"),
  paperSize: one("A4"),
  status,
  priority,
  urgentRequestStatus: one("none", "pending", "approved", "rejected"),
  duplex: bool,
  dataOrigin: one("shared"),
  documentLocation: one("none", "device", "shared"),
  documentId: nullable(nonempty),
  originalFileName: nullable(boundedString(1024)),
  mimeType: nullable(boundedString(255)),
  fileSize: nullable(boundedInteger(MAX_FILE_BYTES)),
  queuePosition: nullable(position),
  ...estimates,
});
const optimization = object({
  occurredAt: timestamp,
  reason: one("urgent-approved", "shorter-jobs-first", "other"),
  previousQueuePosition: nullable(position),
  previousEstimatedPickupAt: nullable(timestamp),
  explanation: nullable(str),
});
const queueCheck: Check = (v, p) => {
  object({
    ...meta,
    entries: nullable(
      array(
        object({
          jobId: nonempty,
          status: one("queued", "printing"),
          priority,
          estimatedDurationMinutes: nullable(positive),
          remainingMinutes: nullable(positive),
          optimizationChange: nullable(optimization),
        }),
      ),
    ),
    printer,
    pickup: object({ bufferMinutes: positive, hours: nullable(hours) }),
    policy: nullable(str),
    localGeneration: one(null),
  })(v, p);
  const q = v as QueueSnapshot;
  if (q.entries) {
    if (new Set(q.entries.map((e) => e.jobId)).size !== q.entries.length)
      fail(`${p}.entries`);
    if (
      q.entries.some(
        (entry, index) => entry.status === "printing" && index !== 0,
      )
    )
      fail(`${p}.entries`);
  }
};
const quoteCheck = object({
  ...meta,
  printedSides: integer,
  sheets: integer,
  pricePerSide: nullable(positive),
  ...estimates,
  estimatedTotalMinutes: nullable(positive),
  assumptions: array(str),
});
const scenario = object({
  queuePosition: nullable(position),
  ...estimates,
  pickupWindow: windowCheck,
});
const insightsCheck = object({
  ...meta,
  shopDisplayName: nullable(str),
  pendingJobCount: nullable(integer),
  estimatedWorkloadMinutes: nullable(positive),
  printerState: nullable(state),
  congestion: nullable(
    object({ level: one("low", "moderate", "high"), basis: str }),
  ),
  lowerCongestionPeriods: nullable(
    array((v, p) => {
      object({ startsAt: timestamp, endsAt: timestamp, basis: str })(v, p);
      const x = v as { startsAt: string; endsAt: string };
      if (Date.parse(x.startsAt) >= Date.parse(x.endsAt)) fail(p);
    }),
  ),
});
const urgentCheck: Check = (v, p) => {
  object({
    ...meta,
    currentWaitMinutes: positive,
    proposedWaitMinutes: positive,
    timeSavedMinutes: positive,
    affectedJobCount: integer,
    currentPickupAt: timestamp,
    proposedPickupAt: timestamp,
    additionalWaitMinutes: nullable(object({ min: positive, max: positive })),
  })(v, p);
  const x = v as UrgentImpact;
  if (
    x.additionalWaitMinutes &&
    x.additionalWaitMinutes.min > x.additionalWaitMinutes.max
  )
    fail(p);
};
const simulationCheck = object({
  ...meta,
  baseline: scenario,
  hypothetical: scenario,
  delta: object({
    cost: nullable(num),
    waitMinutes: nullable(num),
    pickupMinutes: nullable(num),
  }),
  requiresApproval: bool,
  assumptions: array(str),
});
function validated<T>(value: unknown, check: Check, label: string): T {
  check(value, label);
  return structuredClone(value) as T;
}
export const validateSharedJob = (v: unknown): PrintJob =>
  validated(v, jobCheck, "job");
export const validateSharedJobs = (v: unknown): PrintJob[] =>
  validated(v, array(jobCheck), "jobs");
export const validateSharedQueue = (v: unknown): QueueSnapshot =>
  validated(v, queueCheck, "queue");
export const validateSharedQuote = (v: unknown): PrintQuote =>
  validated(v, quoteCheck, "quote");
export const validateSharedPrinter = (v: unknown): PrinterSnapshot =>
  validated(
    v,
    (x, p) => {
      object(meta)(x, p);
      printer(x, p);
    },
    "printer",
  );
export const validateSharedWindow = (v: unknown): PickupWindowResult =>
  validated(v, object({ ...meta, window: windowCheck }), "pickupWindow");
export const validateSharedInsights = (v: unknown): ShopInsights =>
  validated(v, insightsCheck, "insights");
export const validateSharedUrgent = (v: unknown): UrgentImpact | null =>
  validated(v, nullable(urgentCheck), "urgentImpact");
export const validateSharedSimulation = (v: unknown): WhatIfResult | null =>
  validated(v, nullable(simulationCheck), "simulation");
export function validateSharedEvent(v: unknown): ServiceEvent {
  object({
    type: one("snapshot-changed", "connection-changed", "diagnostics-changed"),
  })(v, "event");
  const e = v as ServiceEvent;
  if (e.type === "snapshot-changed") {
    validateSharedJobs(e.jobs);
    validateSharedQueue(e.queue);
    if (new Set(e.jobs.map((j) => j.id)).size !== e.jobs.length)
      fail("event.jobs");
  } else if (e.type === "connection-changed")
    object({
      mode: one("shared"),
      state: one("connected", "disconnected", "unavailable"),
      lastSyncedAt: nullable(timestamp),
    })(v, "event");
  else
    object({
      diagnostics: array(
        object({
          code: one("CORRUPT_LOCAL_RECORD", "LOCAL_CACHE_UNAVAILABLE"),
          messageKey: nonempty,
        }),
      ),
    })(v, "event");
  return structuredClone(e);
}
