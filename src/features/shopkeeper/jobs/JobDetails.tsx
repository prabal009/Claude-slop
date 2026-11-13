import { useState } from 'react';
import { usePortal } from '../PortalContext';
import { Button, Modal, Status, formatDate, minutes, money, time } from '../components/ui';
import { DocumentPanel } from '../documents/DocumentPanel';
import { Receipt } from '../receipts/Receipt';
import { UrgencyAction } from './UrgencyAction';
import type { Job } from '../types';

export function JobDetails({ job: initialJob, onClose }: { job: Job; onClose: () => void }) {
  const { snapshot, service, run, t } = usePortal();
  const [busy, setBusy] = useState(false);
  const job = snapshot.jobs.find(item => item.id === initialJob.id);
  if (!job) return <Modal title={t('Job unavailable')} onClose={onClose}><p>{t('This job is no longer in the current queue. Close this window and select another job.')}</p></Modal>;
  async function advance() {
    if (!job || busy) return;
    const next = job.status === 'queued' ? 'printing' : job.status === 'printing' ? 'ready' : null;
    if (!next) return;
    setBusy(true);
    await run(() => service.updateJobStatus(job.id, next, snapshot.revision), next === 'printing' ? 'Printing started.' : 'Job marked ready for pickup.');
    setBusy(false);
  }
  const unavailable = job.status === 'queued' && (job.queuePosition !== 1 || snapshot.printer.state !== 'operational' || snapshot.jobs.some(item => item.status === 'printing'));
  return <Modal title={`${t('Job details')} · ${job.token}`} onClose={onClose} wide>
    <div className="stack">
      <div className="row wrap"><h3>{job.documentName}</h3><Status value={job.status} /><Status value={job.priority} /></div>
      <dl className="field-grid job-meta">
        <div><dt>{t('Token')}</dt><dd className="token">{job.token}</dd></div>
        <div><dt>{t('Queue position')}</dt><dd>{job.queuePosition ?? '—'}</dd></div>
        <div><dt>{t('Original filename')}</dt><dd>{job.originalFileName ?? t('Not available')}</dd></div>
        <div><dt>{t('Pages')}</dt><dd>{job.pageCount}</dd></div>
        <div><dt>{t('Copies')}</dt><dd>{job.copies}</dd></div>
        <div><dt>{t('Print mode')}</dt><dd>{t(job.colorMode === 'bw' ? 'Black and white' : 'Colour')}</dd></div>
        <div><dt>{t('Sides')}</dt><dd>{t(job.duplex ? 'Double-sided' : 'Single-sided')}</dd></div>
        <div><dt>{t('Paper size')}</dt><dd>{job.paperSize}</dd></div>
        <div><dt>{t('Estimated price')}</dt><dd>{money(job.estimatedCost)}</dd></div>
        <div><dt>{t('Processing time')}</dt><dd>{minutes(job.estimatedDurationMinutes)}</dd></div>
        <div><dt>{t('Remaining processing time')}</dt><dd>{minutes(job.remainingMinutes)}</dd></div>
        <div><dt>{t('Estimated waiting time')}</dt><dd>{minutes(job.estimatedWaitMinutes)}</dd></div>
        <div><dt>{t('Estimated pickup')}</dt><dd>{time(job.estimatedPickupAt)}</dd></div>
        <div><dt>{t('Pickup window ends')}</dt><dd>{time(job.pickupWindowEnd)}</dd></div>
        <div><dt>{t('Submitted')}</dt><dd>{formatDate(job.createdAt)}</dd></div>
        <div><dt>{t('Updated')}</dt><dd>{formatDate(job.updatedAt)}</dd></div>
        <div><dt>{t('Urgent request')}</dt><dd>{t(job.urgentRequestStatus)}</dd></div>
        {job.urgentRequestedAt && <div><dt>{t('Urgency requested')}</dt><dd>{formatDate(job.urgentRequestedAt)}</dd></div>}
        {job.printingStartedAt && <div><dt>{t('Printing started')}</dt><dd>{formatDate(job.printingStartedAt)}</dd></div>}
        {job.readyAt && <div><dt>{t('Ready since')}</dt><dd>{formatDate(job.readyAt)}</dd></div>}
        {job.collectedAt && <div><dt>{t('Collected')}</dt><dd>{formatDate(job.collectedAt)}</dd></div>}
      </dl>
      <div><h3>{t('Printing instructions')}</h3><p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{job.instructions || t('No special instructions.')}</p></div>
      {job.status === 'queued' && (snapshot.printer.state !== 'operational' || snapshot.jobs.some(item => item.status === 'printing')) && <p className="notice notice-warning">{t('Starting is unavailable while the printer is paused, under maintenance, or already printing another job.')}</p>}
      {job.status === 'queued' && job.queuePosition !== 1 && <p className="notice">{t('Only the first queued job can start printing. Reorder eligible jobs to print this job earlier.')}</p>}
      <div className="row wrap">
        {(job.status === 'queued' || job.status === 'printing') && <Button onClick={() => void advance()} disabled={busy || unavailable}>{t(job.status === 'queued' ? 'Start Printing' : 'Mark Ready')}</Button>}
        {job.status === 'queued' && job.priority === 'normal' && <UrgencyAction job={job} approve={job.urgentRequestStatus === 'pending'} />}
        {job.status === 'ready' && <a className="button secondary" href="/shopkeeper/pickup">{t('Verify pickup token')}</a>}
      </div>
      <DocumentPanel job={job} />
      <Receipt job={job} />
    </div>
  </Modal>;
}
