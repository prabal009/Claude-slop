import type { PrintJob } from "../contracts/jobs";
import type {
  PickupConfig,
  PickupWindow,
  PrinterAvailability,
  QueueEntry,
} from "../contracts/scheduling";
export const addMinutes = (timestamp: string, minutes: number): string =>
  new Date(Date.parse(timestamp) + minutes * 60000).toISOString();
export function downtimeMinutes(
  printer: PrinterAvailability,
  observedAt: string,
): number | null {
  if (printer.state === "operational" || printer.state === "resumed") return 0;
  if (
    (printer.state === "paused" || printer.state === "maintenance") &&
    printer.downtime?.kind === "known"
  ) {
    const minutes =
      (Date.parse(printer.downtime.expectedResumeAt) - Date.parse(observedAt)) /
      60000;
    return minutes > 0 ? minutes : null;
  }
  return null;
}
export function calculatePickupWindow(
  readyAt: string | null,
  pickup: PickupConfig,
  status?: PrintJob["status"],
): PickupWindow {
  if (status === "collected")
    return { available: false, reason: "not-applicable" };
  if (!readyAt || !Number.isFinite(Date.parse(readyAt)))
    return { available: false, reason: "eta-unavailable" };
  const ready = Date.parse(readyAt);
  if (!pickup.hours)
    return {
      available: true,
      startsAt: readyAt,
      endsAt: addMinutes(readyAt, pickup.bufferMinutes),
    };
  for (const interval of pickup.hours.intervals) {
    const start = Math.max(ready, Date.parse(interval.opensAt));
    const close = Date.parse(interval.closesAt);
    if (start < close)
      return {
        available: true,
        startsAt: new Date(start).toISOString(),
        endsAt: new Date(
          Math.min(start + pickup.bufferMinutes * 60000, close),
        ).toISOString(),
      };
  }
  return { available: false, reason: "outside-known-hours" };
}
export interface QueueCalculation {
  jobs: PrintJob[];
  entries: QueueEntry[];
}
export function remainingWork(
  job: PrintJob,
  remaining: Record<string, number | null>,
): number | null {
  const work = Object.prototype.hasOwnProperty.call(remaining, job.id)
    ? remaining[job.id]
    : undefined;
  if (typeof work === "number" && Number.isFinite(work) && work >= 0)
    return work;
  if (job.status === "printing" || work === undefined)
    return job.estimatedDurationMinutes;
  return null;
}
/** No clock reads and no status transitions. Work is the persisted snapshot workload. */
export function calculateQueue(
  jobs: PrintJob[],
  order: string[],
  remaining: Record<string, number | null>,
  printer: PrinterAvailability,
  observedAt: string,
  optimization: Record<string, QueueEntry["optimizationChange"]> = {},
): QueueCalculation {
  const byId = new Map(jobs.map((job) => [job.id, job]));
  const replacements = new Map<string, PrintJob>();
  const entries: QueueEntry[] = [];
  let wait = downtimeMinutes(printer, observedAt);
  for (const [index, id] of order.entries()) {
    const job = byId.get(id);
    if (!job || (job.status !== "queued" && job.status !== "printing"))
      throw new Error("errors.corruptQueue");
    const own = remainingWork(job, remaining);
    const pickupAt =
      wait === null || own === null ? null : addMinutes(observedAt, wait + own);
    const updated =
      job.queuePosition === index + 1 &&
      job.estimatedWaitMinutes === wait &&
      job.estimatedPickupAt === pickupAt
        ? job
        : {
            ...job,
            queuePosition: index + 1,
            estimatedWaitMinutes: wait,
            estimatedPickupAt: pickupAt,
            updatedAt: observedAt,
          };
    replacements.set(id, updated);
    entries.push({
      jobId: id,
      status: job.status,
      priority: job.priority,
      estimatedDurationMinutes: job.estimatedDurationMinutes,
      remainingMinutes: own,
      optimizationChange: optimization[id] ?? null,
    });
    wait = wait === null || own === null ? null : wait + own;
  }
  return {
    jobs: jobs.map(
      (job) =>
        replacements.get(job.id) ??
        ((job.status === "ready" || job.status === "collected") &&
        (job.queuePosition !== null || job.estimatedWaitMinutes !== null)
          ? { ...job, queuePosition: null, estimatedWaitMinutes: null }
          : job),
    ),
    entries,
  };
}
export function insertUrgent(
  order: string[],
  jobs: PrintJob[],
  jobId: string,
): string[] {
  const byId = new Map(jobs.map((job) => [job.id, job]));
  const result = order.filter((id) => id !== jobId);
  let index = 0;
  while (index < result.length) {
    const job = byId.get(result[index]!);
    if (
      job?.status === "printing" ||
      (job?.priority === "urgent" && job.urgentRequestStatus === "approved")
    )
      index++;
    else break;
  }
  result.splice(index, 0, jobId);
  return result;
}
