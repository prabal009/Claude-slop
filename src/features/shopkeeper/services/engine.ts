import type { Job, QueuePreview, ShopSettings, SimulationScenario, Snapshot } from '../types';
import { numeric, requireThat, validateSettings, validateSnapshot } from './validation';

export function duration(job: Pick<Job, 'pageCount' | 'copies' | 'colorMode'>): number {
  numeric(job.pageCount, 1, 1000, true); numeric(job.copies, 1, 100, true); requireThat(job.colorMode === 'bw' || job.colorMode === 'colour', 'Invalid colour mode.');
  return 1 + job.pageCount * job.copies * (job.colorMode === 'bw' ? .4 : .8);
}
export function cost(job: Pick<Job, 'pageCount' | 'copies' | 'colorMode'>, settings: ShopSettings): number {
  duration(job); validateSettings(settings);
  return Math.round(job.pageCount * job.copies * (job.colorMode === 'bw' ? settings.bwPrice : settings.colourPrice) * 100) / 100;
}
export function sheets(job: Pick<Job, 'pageCount' | 'copies' | 'duplex'>): number {
  numeric(job.pageCount, 1, 1000, true); numeric(job.copies, 1, 100, true); requireThat(typeof job.duplex === 'boolean', 'Invalid duplex preference.');
  return (job.duplex ? Math.ceil(job.pageCount / 2) : job.pageCount) * job.copies;
}
export function orderedQueue(snapshot: Snapshot): Job[] { return snapshot.jobs.filter(j => j.status === 'queued').sort((a,b) => a.queuePosition! - b.queuePosition!); }
export function setOrder(snapshot: Snapshot, ids: string[], now = Date.now()): void {
  const queue = orderedQueue(snapshot);
  requireThat(ids.length === queue.length && new Set(ids).size === ids.length && queue.every(j => ids.includes(j.id)), 'Queue must include every queued job exactly once.');
  const previousUrgent = queue.filter(j => j.priority === 'urgent').map(j => j.id);
  requireThat(previousUrgent.every((id,index) => ids[index] === id), 'Existing urgent jobs must retain their stable front block.');
  const positions = new Map(ids.map((id,index) => [id,index + 1]));
  for (const job of queue) {
    const position = positions.get(job.id)!;
    if (job.queuePosition !== position) { job.queuePosition = position; job.updatedAt = new Date(now).toISOString(); }
  }
}
export function promoteUrgent(snapshot: Snapshot, id: string, now: number): void {
  const queue = orderedQueue(snapshot), job = queue.find(j => j.id === id);
  requireThat(job && job.priority === 'normal', 'Only a normal queued job can be marked urgent.');
  const ids = queue.filter(j => j.id !== id).map(j => j.id);
  const count = queue.filter(j => j.priority === 'urgent').length;
  ids.splice(count, 0, id);
  // Validate the old urgent block before assigning the new priority.
  setOrder(snapshot, ids, now); job.priority = 'urgent'; job.urgentRequestStatus = 'approved'; job.urgentRequestedAt ??= new Date(now).toISOString(); job.updatedAt = new Date(now).toISOString();
}
function operatingTime(start: number, minutes: number, settings: ShopSettings): number {
  let time = start;
  const [oh, om] = settings.opensAt.split(':').map(Number), [ch, cm] = settings.closesAt.split(':').map(Number);
  const open = new Date(time); open.setHours(oh, om, 0, 0);
  const close = new Date(time); close.setHours(ch, cm, 0, 0);
  if (time < open.getTime()) time = open.getTime();
  if (time >= close.getTime()) { open.setDate(open.getDate() + 1); time = open.getTime(); close.setDate(close.getDate() + 1); }
  const available = (close.getTime() - time) / 60000;
  if (minutes <= available) return time + minutes * 60000;
  const remaining = minutes - available, perDay = (ch - oh) * 60 + cm - om;
  const wholeDays = Math.max(0, Math.ceil(remaining / perDay) - 1);
  open.setDate(open.getDate() + 1 + wholeDays);
  return open.getTime() + (remaining - wholeDays * perDay) * 60000;
}
export function calculateSnapshot(input: Snapshot, now = Date.now()): Snapshot {
  numeric(now, 0, 8e15); const snapshot = structuredClone(input); validateSettings(snapshot.settings);
  const timestamp = new Date(now).toISOString(), printer = snapshot.printer;
  const active = snapshot.jobs.find(j => j.status === 'printing');
  let remaining = 0;
  if (active) {
    const end = printer.state === 'operational' ? now : Math.min(now, Date.parse(printer.changedAt));
    const elapsed = Math.max(0, end - Date.parse(active.updatedAt)) / 60000;
    remaining = Math.max(0, (active.remainingMinutes ?? duration(active)) - elapsed);
    active.remainingMinutes = remaining; active.updatedAt = timestamp;
  }
  let recovery: number | null = 0;
  if (printer.state !== 'operational') {
    recovery = printer.downtimeMinutes === null ? null : printer.downtimeMinutes - Math.max(0, now - Date.parse(printer.changedAt)) / 60000;
    // An overdue estimate is not evidence that a still-paused printer has recovered.
    if (recovery !== null && recovery <= 0) recovery = null;
  }
  const base = recovery === null ? null : now + recovery * 60000;
  let cursor = base === null ? null : operatingTime(base, remaining, snapshot.settings);
  for (const job of snapshot.jobs) {
    job.estimatedDurationMinutes = duration(job); job.estimatedCost = cost(job, snapshot.settings);
    if (job.status !== 'queued') job.queuePosition = null;
    if (job.status === 'ready' || job.status === 'collected') {
      job.estimatedWaitMinutes = 0; job.estimatedPickupAt = job.readyAt;
      job.pickupWindowEnd = job.readyAt ? new Date(operatingTime(Date.parse(job.readyAt), snapshot.settings.pickupBufferMinutes, snapshot.settings)).toISOString() : null;
    } else if (job.status === 'printing') {
      job.estimatedWaitMinutes = 0; job.estimatedPickupAt = cursor === null ? null : new Date(cursor).toISOString();
      job.pickupWindowEnd = cursor === null ? null : new Date(operatingTime(cursor, snapshot.settings.pickupBufferMinutes, snapshot.settings)).toISOString();
    }
  }
  for (const job of orderedQueue(snapshot)) {
    const start = cursor === null ? null : operatingTime(cursor, 0, snapshot.settings);
    job.estimatedWaitMinutes = start === null ? null : Math.max(0, (start - now) / 60000);
    cursor = start === null ? null : operatingTime(start, duration(job), snapshot.settings);
    job.estimatedPickupAt = cursor === null ? null : new Date(cursor).toISOString();
    job.pickupWindowEnd = cursor === null ? null : new Date(operatingTime(cursor, snapshot.settings.pickupBufferMinutes, snapshot.settings)).toISOString();
  }
  validateSnapshot(snapshot); return snapshot;
}
export function optimize(input: Snapshot, now = Date.now()): Snapshot {
  const snapshot = calculateSnapshot(input, now), queue = orderedQueue(snapshot);
  const eligible = queue.filter(j => j.priority === 'normal' && now - Date.parse(j.createdAt) < 60 * 60000)
    .sort((a,b) => duration(a) - duration(b) || Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.queuePosition! - b.queuePosition! || a.id.localeCompare(b.id));
  let index = 0;
  const ids = queue.map(j => j.priority === 'normal' && now - Date.parse(j.createdAt) < 60 * 60000 ? eligible[index++].id : j.id);
  setOrder(snapshot, ids, now); return calculateSnapshot(snapshot, now);
}
export function preview(before: Snapshot, after: Snapshot, explanation = 'Compare the actual waiting-time estimates before applying.'): QueuePreview {
  const queue = orderedQueue(before), afterQueue = orderedQueue(after);
  const rows = [...queue, ...afterQueue.filter(j => !queue.some(old => old.id === j.id))].map(job => {
    const old = before.jobs.find(j => j.id === job.id), next = after.jobs.find(j => j.id === job.id);
    const beforeWait = old?.estimatedWaitMinutes ?? null, afterWait = next?.estimatedWaitMinutes ?? null;
    return { id: job.id, token: job.token, beforePosition: old?.queuePosition ?? null, afterPosition: next?.queuePosition ?? null, beforeWait, afterWait,
      delayMinutes: beforeWait === null || afterWait === null ? null : afterWait - beforeWait, beforePickupAt: old?.estimatedPickupAt ?? null, afterPickupAt: next?.estimatedPickupAt ?? null };
  });
  const average = (jobs: Job[]) => jobs.some(j => j.estimatedWaitMinutes === null) ? null : jobs.length ? jobs.reduce((sum,j) => sum + j.estimatedWaitMinutes!,0) / jobs.length : 0;
  const beforeAverageWait = average(queue), afterAverageWait = average(afterQueue);
  return { revision: before.revision, before: structuredClone(before), after: structuredClone(after), rows, beforeAverageWait, afterAverageWait,
    savedMinutes: rows.some(r => r.delayMinutes === null) ? null : -rows.reduce((sum,r) => sum + r.delayMinutes!,0),
    delayedJobs: rows.filter(r => r.delayMinutes !== null && r.delayMinutes > .000001).length, improvedJobs: rows.filter(r => r.delayMinutes !== null && r.delayMinutes < -.000001).length,
    applicable: !after.jobs.some(j => j.hypothetical), explanation };
}
export function changePrinter(snapshot: Snapshot, state: Snapshot['printer']['state'], downtime: number | null, now: number): void {
  requireThat(['operational', 'paused', 'maintenance'].includes(state), 'Invalid printer state.');
  if (downtime !== null) numeric(downtime, .001, 10080);
  const old = snapshot.printer;
  if (old.state !== 'operational') old.recordedDowntimeMinutes += Math.max(0, now - Date.parse(old.changedAt)) / 60000;
  old.state = state; old.downtimeMinutes = state === 'operational' ? null : downtime; old.changedAt = new Date(now).toISOString();
}
export function simulate(input: Snapshot, scenario: SimulationScenario, now = Date.now()): QueuePreview {
  const before = calculateSnapshot(input, now); let after = structuredClone(before);
  requireThat(!!scenario && typeof scenario === 'object', 'Invalid simulation scenario.');
  if (scenario.kind === 'optimize') after = optimize(after, now);
  else if (scenario.kind === 'downtime') changePrinter(after, 'maintenance', scenario.minutes, now);
  else if (scenario.kind === 'resume') changePrinter(after, 'operational', null, now);
  else if (scenario.kind === 'add') {
    numeric(scenario.pageCount, 1, 1000, true); numeric(scenario.copies, 1, 100, true); requireThat(['bw', 'colour'].includes(scenario.colorMode) && typeof scenario.duplex === 'boolean', 'Invalid hypothetical print preferences.');
    requireThat(after.jobs.length < 1000, 'The local queue is full.');
    after.jobs.push({ id: 'hypothetical-job', token: 'PQ-2026-999999999999', documentName: 'Hypothetical print job', documentId: null, originalFileName: null, mimeType: null, fileSize: null,
      ...scenario, paperSize: 'A4', instructions: '', status: 'queued', priority: 'normal', urgentRequestStatus: 'none', urgentRequestedAt: null, queuePosition: orderedQueue(after).length + 1,
      estimatedCost: 0, estimatedDurationMinutes: 0, estimatedWaitMinutes: null, estimatedPickupAt: null, pickupWindowEnd: null, createdAt: new Date(now).toISOString(), updatedAt: new Date(now).toISOString(), printingStartedAt: null, readyAt: null, collectedAt: null, remainingMinutes: null, hypothetical: true });
  } else if (scenario.kind === 'move' || scenario.kind === 'urgent' || scenario.kind === 'quantity' || scenario.kind === 'colour') {
    const job = after.jobs.find(j => j.id === scenario.jobId); requireThat(job?.status === 'queued', 'This scenario requires a queued job.');
    if (scenario.kind === 'urgent') promoteUrgent(after, job.id, now);
    if (scenario.kind === 'quantity') { numeric(scenario.copies, 1, 100, true); job.copies = scenario.copies; job.updatedAt = new Date(now).toISOString(); }
    if (scenario.kind === 'colour') { requireThat(scenario.colorMode === 'bw' || scenario.colorMode === 'colour', 'Invalid colour mode.'); job.colorMode = scenario.colorMode; job.updatedAt = new Date(now).toISOString(); }
    if (scenario.kind === 'move') { const ids = orderedQueue(after).map(j => j.id); numeric(scenario.position, 1, ids.length, true); ids.splice(ids.indexOf(job.id),1); ids.splice(scenario.position - 1,0,job.id); setOrder(after,ids,now); }
  } else throw new Error('Unknown simulation scenario.');
  after = calculateSnapshot(after, now);
  return preview(before, after, scenario.kind === 'add' ? 'Hypothetical jobs are comparison-only and cannot be applied. Add a real demo job in Settings.' : 'Simulation only. Real changes require confirmation and an unchanged queue revision.');
}
