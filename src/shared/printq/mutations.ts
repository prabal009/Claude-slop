import type { Analytics, JobStatus, Snapshot } from '../../features/shopkeeper/types';
import { duration, orderedQueue, sheets } from '../../features/shopkeeper/services/engine';
import { identifier, requireThat } from '../../features/shopkeeper/services/validation';

export function transitionJob(
  snapshot: Snapshot,
  jobId: string,
  status: JobStatus,
  now: number,
  collectionVerified: boolean,
): void {
  identifier(jobId);
  const job = snapshot.jobs.find((j) => j.id === jobId);
  requireThat(job, 'Job was not found.');
  const at = new Date(now).toISOString();
  requireThat(
    (job.status === 'queued' && status === 'printing') ||
      (job.status === 'printing' && status === 'ready') ||
      (job.status === 'ready' && status === 'collected'),
    'Invalid or duplicate status transition.',
  );
  if (status === 'printing') {
    requireThat(snapshot.printer.state === 'operational', 'Resume the printer before starting a job.');
    requireThat(!snapshot.jobs.some((j) => j.status === 'printing'), 'Another job is already printing.');
    requireThat(orderedQueue(snapshot)[0]?.id === jobId, 'Start the first queued job. Reorder eligible jobs before starting.');
    job.printingStartedAt = at;
    job.remainingMinutes = duration(job);
    if (job.urgentRequestStatus === 'pending') {
      job.urgentRequestStatus = 'rejected';
    }
  }
  if (status === 'ready') {
    job.readyAt = at;
    job.remainingMinutes = null;
  }
  if (status === 'collected') {
    requireThat(collectionVerified, 'Verify the pickup token before confirming collection.');
    job.collectedAt = at;
  }
  job.status = status;
  job.queuePosition = null;
  job.updatedAt = at;
  orderedQueue(snapshot).forEach((queued, index) => {
    if (queued.queuePosition !== index + 1) {
      queued.queuePosition = index + 1;
      queued.updatedAt = at;
    }
  });
}

export function requestUrgency(snapshot: Snapshot, jobId: string, now: number): void {
  identifier(jobId);
  const job = snapshot.jobs.find((j) => j.id === jobId);
  requireThat(job, 'Job was not found.');
  requireThat(
    job.status === 'queued' && job.priority === 'normal' && job.urgentRequestStatus === 'none',
    'Only a normal queued job without a previous request may request urgency.',
  );
  const at = new Date(now).toISOString();
  job.urgentRequestStatus = 'pending';
  job.urgentRequestedAt = at;
  job.updatedAt = at;
}

export function calculateAnalytics(snapshot: Snapshot, now: number): Analytics {
  const jobs = snapshot.jobs;
  const complete = jobs.filter((j) => j.status === 'ready' || j.status === 'collected');
  const queue = orderedQueue(snapshot);
  const days = new Map<string, { date: string; jobs: number; saved: number }>();
  const hours = new Map<string, number>();
  for (const job of jobs) {
    const date = job.createdAt.slice(0, 10);
    const hour = String(new Date(job.createdAt).getHours()).padStart(2, '0') + ':00';
    const day = days.get(date) ?? { date, jobs: 0, saved: 0 };
    day.jobs++;
    if (job.status === 'ready' || job.status === 'collected') {
      day.saved += job.pageCount * job.copies - sheets(job);
    }
    days.set(date, day);
    hours.set(hour, (hours.get(hour) ?? 0) + 1);
  }
  return {
    submitted: jobs.length,
    completed: complete.length,
    averageDuration: jobs.length ? jobs.reduce((sum, j) => sum + duration(j), 0) / jobs.length : 0,
    averageWait: queue.some((j) => j.estimatedWaitMinutes === null)
      ? null
      : queue.length
        ? queue.reduce((sum, j) => sum + j.estimatedWaitMinutes!, 0) / queue.length
        : 0,
    estimatedValue: jobs.reduce((sum, j) => sum + j.estimatedCost, 0),
    sheetsUsed: complete.reduce((sum, j) => sum + sheets(j), 0),
    sheetsSaved: complete.reduce((sum, j) => sum + j.pageCount * j.copies - sheets(j), 0),
    duplexJobs: jobs.filter((j) => j.duplex).length,
    urgentReceived: jobs.filter((j) => j.urgentRequestedAt !== null).length,
    urgentApproved: jobs.filter((j) => j.urgentRequestStatus === 'approved').length,
    downtimeMinutes:
      snapshot.printer.recordedDowntimeMinutes +
      (snapshot.printer.state === 'operational'
        ? 0
        : Math.max(0, now - Date.parse(snapshot.printer.changedAt)) / 60000),
    byDay: [...days.values()].sort((a, b) => a.date.localeCompare(b.date)),
    byHour: [...hours]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([hour, count]) => ({ hour, jobs: count })),
    byMode: [
      { name: 'B&W', value: jobs.filter((j) => j.colorMode === 'bw').length },
      { name: 'Colour', value: jobs.filter((j) => j.colorMode === 'colour').length },
    ],
  };
}
