import { useMemo, useState } from 'react';
import { usePortal } from '../PortalContext';
import { Button, Empty, PageHeader, Status, formatDate, minutes, money, time } from '../components/ui';
import { JobDetails } from './JobDetails';
import { UrgencyAction } from './UrgencyAction';
import type { Job } from '../types';

export default function QueuePage() {
  const { snapshot, service, run, t } = usePortal();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('active');
  const [mode, setMode] = useState('all');
  const [priority, setPriority] = useState('all');
  const [sort, setSort] = useState('queue');
  const [selected, setSelected] = useState<Job | null>(null);
  const [busy, setBusy] = useState(false);
  const queued = useMemo(() => snapshot.jobs.filter(job => job.status === 'queued').sort((a, b) => (a.queuePosition ?? Infinity) - (b.queuePosition ?? Infinity)), [snapshot.jobs]);
  const jobs = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    return snapshot.jobs.filter(job => (!term || `${job.token} ${job.documentName}`.toLocaleLowerCase().includes(term)) && (status === 'all' || status === 'active' ? status === 'all' || job.status !== 'collected' : job.status === status) && (mode === 'all' || job.colorMode === mode) && (priority === 'all' || job.priority === priority)).sort((a, b) => sort === 'oldest' ? a.createdAt.localeCompare(b.createdAt) : sort === 'newest' ? b.createdAt.localeCompare(a.createdAt) : (a.queuePosition ?? Infinity) - (b.queuePosition ?? Infinity) || a.createdAt.localeCompare(b.createdAt));
  }, [snapshot.jobs, query, status, mode, priority, sort]);
  async function move(job: Job, offset: number) {
    if (busy) return;
    const index = queued.findIndex(item => item.id === job.id);
    const target = index + offset;
    if (index < 0 || target < 0 || target >= queued.length) return;
    const ids = queued.map(item => item.id);
    [ids[index], ids[target]] = [ids[target]!, ids[index]!];
    setBusy(true);
    await run(() => service.reorderQueue(ids, snapshot.revision), 'Queue order updated.');
    setBusy(false);
  }
  async function advance(job: Job) {
    if (busy) return;
    setBusy(true);
    await run(() => service.updateJobStatus(job.id, job.status === 'queued' ? 'printing' : 'ready', snapshot.revision), job.status === 'queued' ? 'Printing started.' : 'Job marked ready for pickup.');
    setBusy(false);
  }
  function canMove(job: Job, offset: number) {
    const index = queued.findIndex(item => item.id === job.id);
    const adjacent = queued[index + offset];
    // Urgent priority and fairness-protected slots cannot be displaced by manual controls.
    if (busy || !adjacent || job.priority === 'urgent' || adjacent.priority !== job.priority) return false;
    const protectedJob = (item: Job) => item.priority === 'normal' && Date.now() - Date.parse(item.createdAt) >= 60 * 60 * 1000;
    return !protectedJob(job) && !protectedJob(adjacent);
  }
  const canStart = snapshot.printer.state === 'operational' && !snapshot.jobs.some(job => job.status === 'printing');
  return <div className="page stack">
    <PageHeader title={t('Print queue')} description={t('Manage every print job, with live estimates and deliberate priority changes.')} actions={<span className="badge">{jobs.length} {t('jobs shown')}</span>} />
    {snapshot.printer.state !== 'operational' && <p className="notice notice-warning" role="status">{t('Printing is unavailable. Waiting and pickup estimates reflect the recorded printer downtime.')}</p>}
    <div className="panel panel-body field-grid">
      <label className="field">{t('Search token or document')}<input type="search" value={query} onChange={event => setQuery(event.target.value)} /></label>
      <label className="field">{t('Status')}<select value={status} onChange={event => setStatus(event.target.value)}><option value="active">{t('Active jobs')}</option><option value="all">{t('All statuses')}</option>{['queued', 'printing', 'ready', 'collected'].map(value => <option key={value} value={value}>{t(value)}</option>)}</select></label>
      <label className="field">{t('Print mode')}<select value={mode} onChange={event => setMode(event.target.value)}><option value="all">{t('All modes')}</option><option value="bw">{t('Black and white')}</option><option value="colour">{t('Colour')}</option></select></label>
      <label className="field">{t('Priority')}<select value={priority} onChange={event => setPriority(event.target.value)}><option value="all">{t('All priorities')}</option><option value="urgent">{t('Urgent')}</option><option value="normal">{t('Normal')}</option></select></label>
      <label className="field">{t('Sort by')}<select value={sort} onChange={event => setSort(event.target.value)}><option value="queue">{t('Queue position')}</option><option value="oldest">{t('Oldest submission')}</option><option value="newest">{t('Newest submission')}</option></select></label>
    </div>
    <p className="muted small">{t('Move controls change the full queue, even when filtered. Urgent priority and jobs waiting over 60 minutes are protected.')}</p>
    {jobs.length === 0 ? <Empty title={t('No matching jobs')} description={t('Change your search or filters to see more jobs.')} /> : <div className="stack">{jobs.map(job => <article className="job-card panel panel-body stack" key={job.id} aria-label={`${job.token} ${job.documentName}`}>
      <div className="row wrap"><span className="token">{job.queuePosition === null ? '—' : `#${job.queuePosition}`} {job.token}</span><h2 style={{ overflowWrap: 'anywhere' }}>{job.documentName}</h2><Status value={job.status} /><Status value={job.priority} />{job.urgentRequestStatus === 'pending' && <span className="badge">{t('Urgency requested')}</span>}</div>
      <dl className="field-grid job-meta">
        <div><dt>{t('Original filename')}</dt><dd>{job.originalFileName ?? t('Not available')}</dd></div>
        <div><dt>{t('Print specification')}</dt><dd>{job.pageCount} {t('pages')} × {job.copies} {t('copies')} · {t(job.colorMode === 'bw' ? 'Black and white' : 'Colour')} · {t(job.duplex ? 'Double-sided' : 'Single-sided')} · {job.paperSize}</dd></div>
        <div><dt>{t('Estimated price')}</dt><dd>{money(job.estimatedCost)}</dd></div>
        <div><dt>{t('Processing / waiting')}</dt><dd>{minutes(job.estimatedDurationMinutes)} / {minutes(job.estimatedWaitMinutes)}</dd></div>
        <div><dt>{t('Estimated pickup')}</dt><dd>{time(job.estimatedPickupAt)}</dd></div>
        <div><dt>{t('Submitted')}</dt><dd>{formatDate(job.createdAt)}</dd></div>
      </dl>
      {job.status === 'queued' && job.queuePosition !== 1 && <p className="muted small">{t('Only the first queued job can start printing. Reorder eligible jobs to print this job earlier.')}</p>}
      <div className="row wrap">
        <Button variant="secondary" onClick={() => setSelected(job)}>{t('View details')}</Button>
        {job.status === 'queued' && <><Button onClick={() => void advance(job)} disabled={busy || !canStart || job.queuePosition !== 1}>{t('Start Printing')}</Button><Button variant="ghost" aria-label={`${t('Move up')} ${job.token}`} onClick={() => void move(job, -1)} disabled={!canMove(job, -1)}>{t('Move up')}</Button><Button variant="ghost" aria-label={`${t('Move down')} ${job.token}`} onClick={() => void move(job, 1)} disabled={!canMove(job, 1)}>{t('Move down')}</Button>{job.priority === 'normal' && <UrgencyAction job={job} approve={job.urgentRequestStatus === 'pending'} />}</>}
        {job.status === 'printing' && <Button onClick={() => void advance(job)} disabled={busy}>{t('Mark Ready')}</Button>}
        {job.status === 'ready' && <a className="button secondary" href="/shopkeeper/pickup">{t('Verify pickup token')}</a>}
      </div>
    </article>)}</div>}
    {selected && <JobDetails job={selected} onClose={() => setSelected(null)} />}
  </div>;
}
