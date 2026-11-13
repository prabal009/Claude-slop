import type {
  PageCountSource,
  PrintJob,
  PrintQuote,
  QuoteInput,
  SnapshotMeta,
} from '../../features/student/contracts/jobs';
import type {
  EstimateTarget,
  OperatingHours,
  PickupWindow,
  PickupWindowResult,
  QueueEntry,
  QueueSnapshot,
  ScenarioEstimate,
  ShopInsights,
  UrgentImpact,
  WhatIfRequest,
  WhatIfResult,
} from '../../features/student/contracts/scheduling';
import type { Job, ShopSettings, Snapshot } from '../../features/shopkeeper/types';
import {
  calculateSnapshot,
  cost,
  duration,
  orderedQueue,
  promoteUrgent,
  sheets,
  simulate,
} from '../../features/shopkeeper/services/engine';
import { SHOP_TIME_ZONE } from './policy';

export interface SubmissionMetadata {
  studentId: string;
  clientRequestId: string;
  pageCountSource: PageCountSource;
  fingerprint: string;
}

export interface WorkspaceObservation {
  snapshot: Snapshot;
  observedAt: string;
  submissions: Record<string, SubmissionMetadata>;
}

export interface StudentObservation {
  jobs: PrintJob[];
  queue: QueueSnapshot;
}

function makeMeta(
  snapshot: Snapshot,
  observedAt: string,
  source: 'shared' | 'local-demo',
): SnapshotMeta {
  return {
    revision: String(snapshot.revision),
    observedAt,
    lastSyncedAt: observedAt,
    source,
    stale: false,
  };
}

export function buildOperatingHours(
  settings: ShopSettings,
  observedAt: string,
): OperatingHours {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: SHOP_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(new Date(observedAt))
    .split('-')
    .map(Number);
  const [year, month, day] = [parts[0]!, parts[1]!, parts[2]!];
  const intervals: { opensAt: string; closesAt: string }[] = [];
  for (let offset = 0; offset < 30; offset++) {
    const date = new Date(Date.UTC(year, month - 1, day + offset));
    const yyyy = date.getUTCFullYear();
    const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(date.getUTCDate()).padStart(2, '0');
    const dateStr = `${yyyy}-${mm}-${dd}`;
    intervals.push({
      opensAt: new Date(`${dateStr}T${settings.opensAt}:00+05:30`).toISOString(),
      closesAt: new Date(`${dateStr}T${settings.closesAt}:00+05:30`).toISOString(),
    });
  }
  return {
    timeZone: SHOP_TIME_ZONE,
    validFrom: intervals[0]!.opensAt,
    validUntil: intervals[intervals.length - 1]!.closesAt,
    intervals,
  };
}

function toPickupWindow(job: Job | undefined): PickupWindow {
  if (!job || job.status === 'collected') {
    return { available: false, reason: 'not-applicable' };
  }
  if (job.estimatedPickupAt === null || job.pickupWindowEnd === null) {
    return { available: false, reason: 'eta-unavailable' };
  }
  return {
    available: true,
    startsAt: job.estimatedPickupAt,
    endsAt: job.pickupWindowEnd,
  };
}

export function projectStudentObservation(
  observation: WorkspaceObservation,
  studentId: string,
  aliasForId: (jobId: string) => string,
  source: 'shared' | 'local-demo' = 'shared',
  generation: number | null = null,
): StudentObservation {
  const { snapshot, observedAt, submissions } = observation;
  const jobs: PrintJob[] = snapshot.jobs
    .filter((job) => submissions[job.id]?.studentId === studentId)
    .map((job) => {
      const meta = submissions[job.id]!;
      return {
        id: job.id,
        token: job.token,
        clientRequestId: meta.clientRequestId,
        documentName: job.documentName,
        instructions: job.instructions,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
        pageCount: job.pageCount,
        copies: job.copies,
        pageCountSource: meta.pageCountSource,
        colorMode: job.colorMode,
        paperSize: 'A4',
        status: job.status,
        priority: job.priority,
        urgentRequestStatus: job.urgentRequestStatus,
        duplex: job.duplex,
        dataOrigin: source === 'shared' ? 'shared' : 'local-user',
        documentLocation:
          job.documentId === null ? 'none' : source === 'shared' ? 'shared' : 'device',
        documentId: job.documentId,
        originalFileName: job.originalFileName,
        mimeType: job.mimeType,
        estimatedPickupAt: job.estimatedPickupAt,
        fileSize: job.fileSize,
        queuePosition: job.queuePosition,
        estimatedCost: job.estimatedCost,
        estimatedDurationMinutes: job.estimatedDurationMinutes,
        estimatedWaitMinutes: job.estimatedWaitMinutes,
      };
    });

  const printing = snapshot.jobs.filter((j) => j.status === 'printing');
  const queued = orderedQueue(snapshot);
  const entries: QueueEntry[] = [...printing, ...queued].map((job) => ({
    jobId: submissions[job.id]?.studentId === studentId ? job.id : aliasForId(job.id),
    status: job.status,
    priority: job.priority,
    estimatedDurationMinutes: job.estimatedDurationMinutes,
    remainingMinutes: job.remainingMinutes,
    optimizationChange: null,
  }));

  const printer = snapshot.printer;
  const queue: QueueSnapshot = {
    ...makeMeta(snapshot, observedAt, source),
    entries,
    printer: {
      state: printer.state,
      changedAt: printer.changedAt,
      reason: null,
      downtime:
        printer.state === 'operational'
          ? null
          : printer.downtimeMinutes === null
            ? { kind: 'unknown' }
            : {
                kind: 'known',
                expectedResumeAt: new Date(
                  Date.parse(printer.changedAt) + printer.downtimeMinutes * 60000,
                ).toISOString(),
              },
    },
    pickup: {
      bufferMinutes: snapshot.settings.pickupBufferMinutes,
      hours: buildOperatingHours(snapshot.settings, observedAt),
    },
    policy: 'Server shop hours (Asia/Kolkata) govern estimates.',
    localGeneration: source === 'shared' ? null : generation,
  };

  return { jobs, queue };
}

export function buildStudentQuote(
  snapshot: Snapshot,
  observedAt: string,
  input: QuoteInput,
  source: 'shared' | 'local-demo' = 'shared',
): PrintQuote {
  const now = Date.parse(observedAt);
  const result = simulate(
    snapshot,
    {
      kind: 'add',
      pageCount: input.pageCount,
      copies: input.copies,
      colorMode: input.colorMode,
      duplex: input.duplex,
    },
    now,
  );
  const simulated = result.after.jobs.find((j) => j.id === 'hypothetical-job');
  const estimatedDurationMinutes = duration(input);
  const estimatedWaitMinutes = simulated?.estimatedWaitMinutes ?? null;
  return {
    ...makeMeta(snapshot, observedAt, source),
    printedSides: input.pageCount * input.copies,
    sheets: sheets(input),
    pricePerSide:
      input.colorMode === 'bw'
        ? snapshot.settings.bwPrice
        : snapshot.settings.colourPrice,
    estimatedCost: cost(input, snapshot.settings),
    estimatedDurationMinutes,
    estimatedWaitMinutes,
    estimatedTotalMinutes:
      estimatedWaitMinutes === null
        ? null
        : estimatedWaitMinutes + estimatedDurationMinutes,
    estimatedPickupAt: simulated?.estimatedPickupAt ?? null,
    assumptions: ['Server shop hours (Asia/Kolkata) govern estimates.'],
  };
}

export function buildStudentPickupWindow(
  snapshot: Snapshot,
  observedAt: string,
  target: EstimateTarget,
  source: 'shared' | 'local-demo' = 'shared',
): PickupWindowResult {
  const now = Date.parse(observedAt);
  let job: Job | undefined;
  if (target.kind === 'job') {
    job = snapshot.jobs.find((j) => j.id === target.jobId);
  } else {
    const result = simulate(
      snapshot,
      {
        kind: 'add',
        pageCount: target.input.pageCount,
        copies: target.input.copies,
        colorMode: target.input.colorMode,
        duplex: target.input.duplex,
      },
      now,
    );
    job = result.after.jobs.find((j) => j.id === 'hypothetical-job');
  }
  return {
    ...makeMeta(snapshot, observedAt, source),
    window: toPickupWindow(job),
  };
}

export function buildStudentUrgentImpact(
  snapshot: Snapshot,
  observedAt: string,
  jobId: string,
  source: 'shared' | 'local-demo' = 'shared',
): UrgentImpact | null {
  const now = Date.parse(observedAt);
  const result = simulate(snapshot, { kind: 'urgent', jobId }, now);
  const row = result.rows.find((r) => r.id === jobId);
  if (
    !row ||
    row.beforeWait === null ||
    row.afterWait === null ||
    row.beforePickupAt === null ||
    row.afterPickupAt === null
  ) {
    return null;
  }
  const affected = result.rows.filter(
    (r) => r.id !== jobId && r.delayMinutes !== null && r.delayMinutes > 0.000001,
  );
  return {
    ...makeMeta(snapshot, observedAt, source),
    currentWaitMinutes: row.beforeWait,
    proposedWaitMinutes: row.afterWait,
    timeSavedMinutes: Math.max(0, row.beforeWait - row.afterWait),
    affectedJobCount: affected.length,
    currentPickupAt: row.beforePickupAt,
    proposedPickupAt: row.afterPickupAt,
    additionalWaitMinutes:
      affected.length === 0
        ? null
        : {
            min: Math.min(...affected.map((r) => r.delayMinutes!)),
            max: Math.max(...affected.map((r) => r.delayMinutes!)),
          },
  };
}

export function buildStudentInsights(
  snapshot: Snapshot,
  observedAt: string,
  source: 'shared' | 'local-demo' = 'shared',
): ShopInsights {
  const pending = snapshot.jobs.filter(
    (j) => j.status === 'queued' || j.status === 'printing',
  );
  const estimatedWorkloadMinutes = pending.reduce(
    (sum, j) =>
      sum +
      (j.status === 'printing'
        ? (j.remainingMinutes ?? j.estimatedDurationMinutes)
        : j.estimatedDurationMinutes),
    0,
  );
  const level =
    pending.length <= 3 ? 'low' : pending.length <= 8 ? 'moderate' : 'high';
  return {
    ...makeMeta(snapshot, observedAt, source),
    shopDisplayName: snapshot.settings.shopName,
    pendingJobCount: pending.length,
    estimatedWorkloadMinutes,
    printerState: snapshot.printer.state,
    congestion: { level, basis: 'Queue depth' },
    lowerCongestionPeriods: null,
  };
}

function toScenarioEstimate(job: Job): ScenarioEstimate {
  return {
    queuePosition: job.queuePosition,
    estimatedCost: job.estimatedCost,
    estimatedDurationMinutes: job.estimatedDurationMinutes,
    estimatedWaitMinutes: job.estimatedWaitMinutes,
    estimatedPickupAt: job.estimatedPickupAt,
    pickupWindow: toPickupWindow(job),
  };
}

export function buildStudentWhatIf(
  snapshot: Snapshot,
  observedAt: string,
  request: WhatIfRequest,
  source: 'shared' | 'local-demo' = 'shared',
): WhatIfResult | null {
  const now = Date.parse(observedAt);
  const before = calculateSnapshot(snapshot, now);
  let targetId: string;
  if (request.target.kind === 'job') {
    if (!before.jobs.some((j) => j.id === request.target.jobId)) return null;
    targetId = request.target.jobId;
  } else {
    targetId = 'hypothetical-job';
    before.jobs.push({
      id: targetId,
      token: 'PQ-2026-999999999999',
      documentName: 'Hypothetical print job',
      documentId: null,
      originalFileName: null,
      mimeType: null,
      fileSize: null,
      pageCount: request.target.input.pageCount,
      copies: request.target.input.copies,
      colorMode: request.target.input.colorMode,
      duplex: request.target.input.duplex,
      paperSize: 'A4',
      instructions: '',
      status: 'queued',
      priority: 'normal',
      urgentRequestStatus: 'none',
      urgentRequestedAt: null,
      queuePosition: orderedQueue(before).length + 1,
      estimatedCost: 0,
      estimatedDurationMinutes: 0,
      estimatedWaitMinutes: null,
      estimatedPickupAt: null,
      pickupWindowEnd: null,
      createdAt: observedAt,
      updatedAt: observedAt,
      printingStartedAt: null,
      readyAt: null,
      collectedAt: null,
      remainingMinutes: null,
      hypothetical: true,
    });
  }

  const baselineSnap = calculateSnapshot(before, now);
  const baselineJob = baselineSnap.jobs.find((j) => j.id === targetId);
  if (!baselineJob) return null;

  const after = structuredClone(baselineSnap);
  const targetJob = after.jobs.find((j) => j.id === targetId)!;
  if (request.changes.colorMode) targetJob.colorMode = request.changes.colorMode;
  if (request.changes.copies !== undefined) targetJob.copies = request.changes.copies;
  if (request.changes.printer) {
    after.printer.state = request.changes.printer.state;
    after.printer.changedAt = observedAt;
    after.printer.downtimeMinutes =
      request.changes.printer.downtime.kind === 'known'
        ? Math.max(
            0.001,
            (Date.parse(request.changes.printer.downtime.expectedResumeAt) - now) /
              60000,
          )
        : null;
  }
  if (request.changes.requestUrgent && targetJob.status === 'queued' && targetJob.priority === 'normal') {
    promoteUrgent(after, targetId, now);
  }
  const afterSnap = calculateSnapshot(after, now);
  const hypotheticalJob = afterSnap.jobs.find((j) => j.id === targetId)!;

  const baseline = toScenarioEstimate(baselineJob);
  const hypothetical = toScenarioEstimate(hypotheticalJob);
  const waitMinutes =
    baseline.estimatedWaitMinutes !== null &&
    hypothetical.estimatedWaitMinutes !== null
      ? hypothetical.estimatedWaitMinutes - baseline.estimatedWaitMinutes
      : null;
  const pickupMinutes =
    baseline.estimatedPickupAt !== null && hypothetical.estimatedPickupAt !== null
      ? (Date.parse(hypothetical.estimatedPickupAt) -
          Date.parse(baseline.estimatedPickupAt)) /
        60000
      : null;

  return {
    ...makeMeta(snapshot, observedAt, source),
    baseline,
    hypothetical,
    delta: {
      cost:
        baseline.estimatedCost !== null && hypothetical.estimatedCost !== null
          ? Math.round((hypothetical.estimatedCost - baseline.estimatedCost) * 100) / 100
          : null,
      waitMinutes,
      pickupMinutes,
    },
    requiresApproval: Boolean(request.changes.requestUrgent),
    assumptions: ['Server shop hours (Asia/Kolkata) govern estimates.'],
  };
}
