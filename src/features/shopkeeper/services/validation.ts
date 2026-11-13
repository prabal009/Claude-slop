import type { Job, ShopSettings, Snapshot, StoredDocument } from '../types';
import { SHARED_TOKEN_PATTERN } from '../../../shared/printq/pickupCodec';
import { MAX_JOB_COST, MAX_JOB_DURATION_MINUTES, MAX_PAGE_COUNT } from '../../../shared/printq/policy';

export const DATABASE_NAME = 'printq-shopkeeper-v1';
export const SNAPSHOT_KEY = 'current';
export const MAX_FILE_BYTES = 20 * 1024 * 1024;
export const TOKEN_PATTERN = SHARED_TOKEN_PATTERN;
export function requireThat(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
export function numeric(value: unknown, min: number, max: number, integer = false): asserts value is number {
  requireThat(typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max && (!integer || Number.isInteger(value)), `Expected ${integer ? 'an integer' : 'a finite number'} between ${min} and ${max}.`);
}
export function text(value: unknown, max: number, allowEmpty = false): asserts value is string {
  requireThat(typeof value === 'string' && value.length <= max && (allowEmpty || value.trim().length > 0) && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value), 'Invalid text value.');
}
export function identifier(value: unknown): asserts value is string { requireThat(typeof value === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(value), 'Invalid identifier.'); }
function date(value: unknown, nullable = false): void { requireThat((nullable && value === null) || (typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value), 'Invalid timestamp.'); }
export function validateSettings(value: ShopSettings): void {
  requireThat(!!value && typeof value === 'object', 'Invalid shop settings.'); text(value.shopName, 100);
  numeric(value.bwPrice, 0, 10000); numeric(value.colourPrice, 0, 10000); numeric(value.pickupBufferMinutes, 0, 1440);
  const clock = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
  requireThat(clock.test(value.opensAt) && clock.test(value.closesAt) && value.opensAt < value.closesAt, 'Shop opening time must be before closing time on the same day.');
}
export function validateJob(job: Job, settings: ShopSettings): void {
  requireThat(!!job && typeof job === 'object', 'Invalid job record.'); identifier(job.id);
  requireThat(TOKEN_PATTERN.test(job.token), 'Invalid pickup token.'); text(job.documentName, 160); text(job.instructions, 1000, true);
  numeric(job.pageCount, 1, MAX_PAGE_COUNT, true); numeric(job.copies, 1, 100, true);
  requireThat(['bw', 'colour'].includes(job.colorMode) && typeof job.duplex === 'boolean' && ['A4', 'A3'].includes(job.paperSize), 'Invalid print preferences.');
  requireThat(['queued', 'printing', 'ready', 'collected'].includes(job.status) && ['normal', 'urgent'].includes(job.priority) && ['none', 'pending', 'approved', 'rejected'].includes(job.urgentRequestStatus), 'Invalid job state.');
  requireThat((job.priority === 'urgent') === (job.urgentRequestStatus === 'approved'), 'Urgency state is inconsistent.');
  date(job.createdAt); date(job.updatedAt); date(job.urgentRequestedAt, true); date(job.printingStartedAt, true); date(job.readyAt, true); date(job.collectedAt, true);
  requireThat(Date.parse(job.updatedAt) >= Date.parse(job.createdAt), 'Job timestamps are inconsistent.');
  for (const value of [job.urgentRequestedAt, job.printingStartedAt, job.readyAt, job.collectedAt]) if (value !== null) requireThat(Date.parse(value) >= Date.parse(job.createdAt) && Date.parse(value) <= Date.parse(job.updatedAt), 'Event timestamps must be within the job history.');
  requireThat((job.urgentRequestStatus === 'none') === (job.urgentRequestedAt === null), 'Urgency timestamp is inconsistent.');
  requireThat(job.urgentRequestStatus !== 'pending' || (job.status === 'queued' && job.priority === 'normal'), 'Pending urgency requires a normal queued job.');
  if (job.status === 'queued') { numeric(job.queuePosition, 1, 1000, true); requireThat(job.printingStartedAt === null && job.readyAt === null && job.collectedAt === null && job.remainingMinutes === null, 'Queued job has completion data.'); }
  else { requireThat(job.queuePosition === null && job.printingStartedAt !== null, 'Invalid active or completed job.'); }
  if (job.status === 'printing') { requireThat(job.readyAt === null && job.collectedAt === null, 'Printing job has completion data.'); numeric(job.remainingMinutes, 0, MAX_JOB_DURATION_MINUTES); }
  if (job.status === 'ready' || job.status === 'collected') requireThat(job.readyAt !== null && job.remainingMinutes === null, 'Completed job requires a ready timestamp.');
  requireThat((job.status === 'collected') === (job.collectedAt !== null), 'Collection timestamp is inconsistent.');
  if (job.printingStartedAt) requireThat(Date.parse(job.printingStartedAt) >= Date.parse(job.createdAt), 'Printing predates submission.');
  if (job.readyAt) requireThat(Date.parse(job.readyAt) >= Date.parse(job.printingStartedAt!), 'Readiness predates printing.');
  if (job.collectedAt) requireThat(Date.parse(job.collectedAt) >= Date.parse(job.readyAt!), 'Collection predates readiness.');
  const expectedDuration = 1 + job.pageCount * job.copies * (job.colorMode === 'bw' ? .4 : .8);
  const expectedCost = job.pageCount * job.copies * (job.colorMode === 'bw' ? settings.bwPrice : settings.colourPrice);
  numeric(job.estimatedDurationMinutes, 1, MAX_JOB_DURATION_MINUTES); numeric(job.estimatedCost, 0, MAX_JOB_COST);
  requireThat(Math.abs(job.estimatedDurationMinutes - expectedDuration) < .000001 && Math.abs(job.estimatedCost - Math.round(expectedCost * 100) / 100) < .000001, 'Invalid derived duration or cost.');
  if (job.remainingMinutes !== null) requireThat(job.remainingMinutes <= expectedDuration, 'Remaining workload exceeds total processing duration.');
  if (job.estimatedWaitMinutes !== null) numeric(job.estimatedWaitMinutes, 0, 1e9);
  date(job.estimatedPickupAt, true); date(job.pickupWindowEnd, true);
  requireThat((job.estimatedPickupAt === null) === (job.pickupWindowEnd === null), 'Incomplete pickup window.');
  if (job.status === 'queued') requireThat((job.estimatedWaitMinutes === null) === (job.estimatedPickupAt === null), 'Queued estimates must be consistently known or unavailable.');
  else requireThat(job.estimatedWaitMinutes === 0, 'Started and completed jobs have no remaining wait before printing.');
  if (job.status === 'ready' || job.status === 'collected') requireThat(job.estimatedPickupAt === job.readyAt, 'Completed readiness must match its recorded timestamp.');
  if (job.estimatedPickupAt && job.pickupWindowEnd) requireThat(Date.parse(job.pickupWindowEnd) >= Date.parse(job.estimatedPickupAt), 'Pickup window is reversed.');
  if (job.documentId === null) requireThat(job.originalFileName === null && job.mimeType === null && job.fileSize === null, 'Missing document metadata.');
  else {
    identifier(job.documentId); text(job.originalFileName, 200); text(job.mimeType, 100); numeric(job.fileSize, 1, MAX_FILE_BYTES, true);
    const expectedMime = formats[job.originalFileName.split('.').pop()?.toLowerCase() ?? ''];
    requireThat(typeof expectedMime === 'string' && job.mimeType === expectedMime, 'Unsupported stored document type or filename mismatch.');
  }
  requireThat(job.hypothetical === undefined || typeof job.hypothetical === 'boolean', 'Invalid hypothetical marker.');
}
export function validateSnapshot(value: unknown): asserts value is Snapshot {
  requireThat(!!value && typeof value === 'object', 'Stored queue is malformed.'); const s = value as Snapshot;
  numeric(s.revision, 0, Number.MAX_SAFE_INTEGER, true); requireThat(s.mode === 'demo' || s.mode === 'integrated', 'Invalid service mode.'); validateSettings(s.settings);
  requireThat(Array.isArray(s.jobs) && s.jobs.length <= 1000 && Array.isArray(s.activity) && s.activity.length <= 200, 'Invalid stored queue.');
  requireThat(!!s.printer && ['operational', 'paused', 'maintenance'].includes(s.printer.state), 'Invalid printer state.'); date(s.printer.changedAt); numeric(s.printer.recordedDowntimeMinutes, 0, 1e9);
  if (s.printer.downtimeMinutes !== null) numeric(s.printer.downtimeMinutes, .001, 10080);
  requireThat(s.printer.state !== 'operational' || s.printer.downtimeMinutes === null, 'Operational printer cannot have downtime.');
  const ids = new Set<string>(), tokens = new Set<string>();
  for (const job of s.jobs) { validateJob(job, s.settings); requireThat(!ids.has(job.id) && !tokens.has(job.token), 'Duplicate job identity.'); ids.add(job.id); tokens.add(job.token); }
  requireThat(s.jobs.filter(j => j.status === 'printing').length <= 1, 'Only one printing job is allowed.');
  const queue = s.jobs.filter(j => j.status === 'queued').sort((a,b) => a.queuePosition! - b.queuePosition!);
  let normalSeen = false;
  queue.forEach((job,index) => { requireThat(job.queuePosition === index + 1, 'Queue positions must be unique and consecutive.'); if (job.priority === 'normal') normalSeen = true; else requireThat(!normalSeen, 'Urgent jobs must form a stable front block.'); });
  const activityIds = new Set<string>();
  for (const a of s.activity) { identifier(a.id); requireThat(!activityIds.has(a.id), 'Duplicate activity record.'); activityIds.add(a.id); date(a.at); text(a.message, 300); if (a.jobId !== null) identifier(a.jobId); }
}
const formats: Record<string, string> = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
export async function validateDocument(blob: Blob, name: string, mime = blob.type): Promise<string> {
  text(name, 200); numeric(blob.size, 1, MAX_FILE_BYTES, true);
  const extension = name.split('.').pop()?.toLowerCase() ?? '', expected = formats[extension];
  requireThat(expected && (!mime || mime === expected), 'Unsupported file type or extension/MIME mismatch.');
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const starts = (signature: number[]) => signature.every((n, i) => bytes[i] === n);
  let valid = false;
  if (extension === 'pdf') valid = starts([37,80,68,70,45]) && new TextDecoder().decode(bytes.slice(-1024)).includes('%%EOF');
  if (extension === 'png') valid = starts([137,80,78,71,13,10,26,10]);
  if (extension === 'jpg' || extension === 'jpeg') valid = starts([255,216,255]);
  if (extension === 'doc') valid = starts([208,207,17,224,161,177,26,225]);
  if (extension === 'docx') { const zip = new TextDecoder().decode(bytes); valid = starts([80,75,3,4]) && zip.includes('[Content_Types].xml') && zip.includes('word/'); }
  requireThat(valid, 'File content does not match its declared format or is malformed.'); return expected;
}
export async function validateStoredDocument(value: unknown): Promise<StoredDocument> {
  requireThat(!!value && typeof value === 'object', 'Document record is malformed.'); const d = value as StoredDocument;
  identifier(d.id); requireThat(d.blob instanceof Blob, 'Document content is unavailable.');
  const mime = await validateDocument(d.blob, d.name, d.mimeType); requireThat(mime === d.mimeType && d.blob.type === mime, 'Invalid document MIME.'); return d;
}
