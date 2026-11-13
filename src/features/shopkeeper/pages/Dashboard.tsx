import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePortal } from '../PortalContext';
import { Button, Empty, Stat, Status, formatDate, minutes, money, time } from '../components/ui';
import OperationsHero from '../dashboard/OperationsHero';
import { JobDetails } from '../jobs/JobDetails';
import type { Job } from '../types';

export default function Dashboard() {
  const { snapshot, service, run, t } = usePortal();
  const [selected, setSelected] = useState<Job | null>(null);
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const queued = snapshot.jobs.filter(job => job.status === 'queued').sort((a, b) => (a.queuePosition ?? Infinity) - (b.queuePosition ?? Infinity));
  const printing = snapshot.jobs.filter(job => job.status === 'printing');
  const ready = snapshot.jobs.filter(job => job.status === 'ready');
  const collected = snapshot.jobs.filter(job => job.status === 'collected');
  const pending = snapshot.jobs.filter(job => job.urgentRequestStatus === 'pending');
  const workload = snapshot.jobs.reduce((total, job) => total + (job.status === 'printing' ? job.remainingMinutes ?? job.estimatedDurationMinutes : job.status === 'queued' ? job.estimatedDurationMinutes : 0), 0);
  const pickup = snapshot.jobs.filter(job => job.status !== 'collected').sort((a, b) => (a.estimatedPickupAt ?? '9999').localeCompare(b.estimatedPickupAt ?? '9999'));
  const nextJobs = queued.slice(0, 5);
  const longestDuration = Math.max(1, ...nextJobs.map(job => job.estimatedDurationMinutes));

  async function markReady(job: Job) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    try {
      await run(() => service.updateJobStatus(job.id, 'ready', snapshot.revision), 'Job marked ready for pickup.');
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }

  return <div className="page stack dashboard-page">
    <OperationsHero />
    <div className="ops-metrics">
      <Stat label={t('Active jobs')} value={queued.length + printing.length + ready.length} />
      <Stat label={t('Queued jobs')} value={queued.length} />
      <Stat label={t('Currently printing')} value={printing.length} />
      <Stat label={t('Ready for pickup')} value={ready.length} />
    </div>
    <dl className="ops-secondary-metrics">
      <div className="ops-secondary-item"><dt>{t('Pending urgent requests')}</dt><dd>{pending.length}</dd></div>
      <div className="ops-secondary-item"><dt>{t('Completed jobs')}</dt><dd>{collected.length}</dd></div>
      <div className="ops-secondary-item"><dt>{t('Remaining workload')}</dt><dd>{minutes(workload)}</dd></div>
      <div className="ops-secondary-item"><dt>{t('Queued printing value')}</dt><dd>{money(queued.reduce((total, job) => total + job.estimatedCost, 0))}</dd></div>
    </dl>
    <div className="ops-floor-grid">
      <section className="panel ops-printer-panel">
        <div className="panel-header"><h2>{t('Currently printing')}</h2><Status value={snapshot.printer.state} /></div>
        <div className="panel-body stack">
          {printing.length === 0 ? <div className="stack">
            <Empty title={t('No job is printing')} description={t('Start an eligible queued job from the print queue.')} />
            <Link className="button secondary" to="/shopkeeper/queue">{t('Open print queue')}</Link>
          </div> : printing.map(job => {
            const progress = Math.round(Math.max(0, Math.min(100, (1 - (job.remainingMinutes ?? job.estimatedDurationMinutes) / Math.max(1, job.estimatedDurationMinutes)) * 100)));
            return <article key={job.id} className="stack">
              <div className="row wrap"><span className="token">{job.token}</span><Status value={job.status} /></div>
              <h3>{job.documentName}</h3>
              <p className="muted">{t(job.colorMode === 'bw' ? 'Black and white' : 'Colour')} · {job.copies} {t('copies')} · {minutes(job.estimatedDurationMinutes)} {t('processing')}</p>
              <p>{t('Remaining')}: {minutes(job.remainingMinutes)}</p>
              <div className="progress-track" role="progressbar" aria-label={t('Estimated printing progress')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><div className="progress-fill" style={{ width: `${progress}%` }} /></div>
              <div className="row wrap"><Button onClick={() => void markReady(job)} disabled={busy}>{t('Mark Ready')}</Button><Button variant="secondary" onClick={() => setSelected(job)}>{t('View details')}</Button></div>
            </article>;
          })}
        </div>
      </section>
      <section className="panel ops-queue-panel">
        <div className="panel-header"><h2>{t('Next five jobs')}</h2><Link to="/shopkeeper/queue">{t('View queue')}</Link></div>
        <div className="panel-body">
          {nextJobs.length === 0 ? <Empty title={t('The queue is clear')} /> : <ol className="ops-queue-list">{nextJobs.map(job => <li className="ops-queue-item" key={job.id}>
            <span className="ops-position">{job.queuePosition}</span>
            <div className="ops-queue-content">
              <div className="row wrap"><span className="token">{job.token}</span><Status value={job.priority} /></div>
              <Button variant="ghost" onClick={() => setSelected(job)}>{job.documentName}</Button>
              <p className="muted small">{t(job.colorMode === 'bw' ? 'Black and white' : 'Colour')} · {job.copies} {t('copies')}</p>
              <div className="ops-queue-track" aria-hidden="true"><div className="ops-queue-fill" style={{ width: `${job.estimatedDurationMinutes / longestDuration * 100}%` }} /></div>
            </div>
            <span className="ops-queue-estimate">{minutes(job.estimatedDurationMinutes)}</span>
          </li>)}</ol>}
        </div>
      </section>
    </div>
    <div className="ops-lower-grid">
      <section className="panel">
        <div className="panel-header"><h2>{t('Pickup timeline')}</h2><Link to="/shopkeeper/pickup">{t('Verify pickup')}</Link></div>
        <div className="panel-body stack">
          <p className="muted small">{t('Pickup times are estimates, not guaranteed completion times.')}</p>
          {pickup.length === 0 ? <Empty title={t('No upcoming pickups')} /> : <ol className="ops-pickup-list">{pickup.map(job => <li key={job.id}>
            <div className="row wrap"><strong>{job.status === 'ready' ? t('Ready now') : time(job.estimatedPickupAt)}</strong><span className="token">{job.token}</span><Status value={job.status} /></div>
            <Button variant="ghost" onClick={() => setSelected(job)}>{job.documentName}</Button>
            {job.pickupWindowEnd && <p className="small muted">{t('Pickup window ends')}: {time(job.pickupWindowEnd)}</p>}
          </li>)}</ol>}
        </div>
      </section>
      <section className="panel">
        <div className="panel-header"><h2>{t('Recent activity')}</h2></div>
        <div className="panel-body">
          {snapshot.activity.length === 0 ? <Empty title={t('No activity recorded')} /> : <ol className="ops-event-list">{[...snapshot.activity].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 10).map(event => <li key={event.id}><p>{t(event.message)}</p><time className="muted small" dateTime={event.at}>{formatDate(event.at)}</time></li>)}</ol>}
        </div>
      </section>
    </div>
    {selected && <JobDetails job={selected} onClose={() => setSelected(null)} />}
  </div>;
}
