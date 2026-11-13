import type { PrintJob } from "../contracts/jobs";
import type {
  OperatingHours,
  PickupConfig,
  PrinterAvailability,
  QueueEntry,
} from "../contracts/scheduling";
import { isRecord, isTimestamp, finiteNonnegative } from "../utils/validation";
import {
  MAX_COPIES,
  MAX_NAME_CODE_POINTS,
  MAX_PAGES,
  MAX_INSTRUCTIONS_CODE_POINTS,
  PAPER_SIZE,
} from "./config";
const nullable = (value: unknown, check: (value: unknown) => boolean) =>
  value === null || check(value);
const text = (value: unknown) => typeof value === "string";
export function isPrintJob(value: unknown): value is PrintJob {
  if (!isRecord(value)) return false;
  if (
    !["id", "token", "clientRequestId", "documentName", "instructions"].every(
      (key) =>
        typeof value[key] === "string" && (value[key] as string).length <= 2000,
    )
  )
    return false;
  if (
    !value.id ||
    !value.token ||
    !value.clientRequestId ||
    !value.documentName ||
    !isTimestamp(value.createdAt) ||
    !isTimestamp(value.updatedAt)
  )
    return false;
  if (
    typeof value.documentName !== "string" ||
    !value.documentName.trim() ||
    [...value.documentName].length > MAX_NAME_CODE_POINTS ||
    /[\u0000-\u001f\u007f-\u009f]/u.test(value.documentName) ||
    typeof value.instructions !== "string" ||
    [...value.instructions].length > MAX_INSTRUCTIONS_CODE_POINTS
  )
    return false;
  if (
    !Number.isInteger(value.pageCount) ||
    (value.pageCount as number) < 1 ||
    (value.pageCount as number) > MAX_PAGES ||
    !Number.isInteger(value.copies) ||
    (value.copies as number) < 1 ||
    (value.copies as number) > MAX_COPIES
  )
    return false;
  if (
    !["assumed", "manual", "image"].includes(value.pageCountSource as string) ||
    !["bw", "colour"].includes(value.colorMode as string) ||
    value.paperSize !== PAPER_SIZE ||
    typeof value.duplex !== "boolean"
  )
    return false;
  if (
    !["queued", "printing", "ready", "collected"].includes(
      value.status as string,
    ) ||
    !["normal", "urgent"].includes(value.priority as string) ||
    !["none", "pending", "approved", "rejected"].includes(
      value.urgentRequestStatus as string,
    )
  )
    return false;
  if (
    !["local-user", "demo-fixture", "shared"].includes(
      value.dataOrigin as string,
    ) ||
    !["none", "device", "shared"].includes(value.documentLocation as string)
  )
    return false;
  if (
    !["documentId", "originalFileName", "mimeType"].every((key) =>
      nullable(value[key], text),
    ) ||
    !nullable(value.estimatedPickupAt, isTimestamp)
  )
    return false;
  if (
    ![
      "fileSize",
      "estimatedCost",
      "estimatedDurationMinutes",
      "estimatedWaitMinutes",
    ].every((key) => nullable(value[key], finiteNonnegative))
  )
    return false;
  if (value.fileSize !== null && !Number.isSafeInteger(value.fileSize))
    return false;
  return (
    value.queuePosition === null ||
    (Number.isInteger(value.queuePosition) &&
      (value.queuePosition as number) >= 1)
  );
}
export function isPrinterAvailability(
  value: unknown,
): value is PrinterAvailability {
  if (
    !isRecord(value) ||
    !nullable(value.changedAt, isTimestamp) ||
    !nullable(value.reason, text)
  )
    return false;
  if (value.state === null) return value.downtime === null;
  if (value.state === "operational" || value.state === "resumed")
    return value.downtime === null;
  if (value.state !== "paused" && value.state !== "maintenance") return false;
  return (
    isRecord(value.downtime) &&
    (value.downtime.kind === "unknown" ||
      (value.downtime.kind === "known" &&
        isTimestamp(value.downtime.expectedResumeAt)))
  );
}
export function isOperatingHours(value: unknown): value is OperatingHours {
  if (
    !isRecord(value) ||
    typeof value.timeZone !== "string" ||
    !isTimestamp(value.validFrom) ||
    !isTimestamp(value.validUntil) ||
    Date.parse(value.validFrom) >= Date.parse(value.validUntil) ||
    !Array.isArray(value.intervals)
  )
    return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: value.timeZone });
  } catch {
    return false;
  }
  let previous = Date.parse(value.validFrom);
  for (const interval of value.intervals) {
    if (
      !isRecord(interval) ||
      !isTimestamp(interval.opensAt) ||
      !isTimestamp(interval.closesAt)
    )
      return false;
    const open = Date.parse(interval.opensAt),
      close = Date.parse(interval.closesAt);
    if (
      open < previous ||
      close <= open ||
      close > Date.parse(value.validUntil)
    )
      return false;
    previous = close;
  }
  return true;
}
export function isPickupConfig(value: unknown): value is PickupConfig {
  return (
    isRecord(value) &&
    finiteNonnegative(value.bufferMinutes) &&
    value.bufferMinutes > 0 &&
    value.bufferMinutes <= 1440 &&
    (value.hours === null || isOperatingHours(value.hours))
  );
}
export function isOptimizationChange(
  value: unknown,
): value is QueueEntry["optimizationChange"] {
  if (value === null) return true;
  if (
    !isRecord(value) ||
    !isTimestamp(value.occurredAt) ||
    !["urgent-approved", "shorter-jobs-first", "other"].includes(
      value.reason as string,
    )
  )
    return false;
  return (
    (value.previousQueuePosition === null ||
      (Number.isSafeInteger(value.previousQueuePosition) &&
        (value.previousQueuePosition as number) >= 1)) &&
    nullable(value.previousEstimatedPickupAt, isTimestamp) &&
    nullable(value.explanation, text)
  );
}
