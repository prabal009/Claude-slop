import { useState } from 'react';
import { usePortal } from '../PortalContext';
import { Button, Confirm, Empty, PageHeader, Status, formatDate, minutes, time } from '../components/ui';
import { JobDetails } from '../jobs/JobDetails';
import { UrgencyAction } from '../jobs/UrgencyAction';
import type { Job } from '../types';

export default function UrgentPage() {
  const { snapshot, service, run, notify, t } = usePortal();
  const [selected, setSelected] = useState<Job | null>(null);
  const [rejection, setRejection] = useState<{ job: Job; revision: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const pending = snapshot.jobs.filter(job => job.urgentRequestStatus === 'pending').sort((a, b) => (a.urgentRequestedAt ?? a.createdAt).localeCompare(b.urgentRequestedAt ?? b.createdAt));
  const resolved = snapshot.jobs.filter(job => job.urgentRequestStatus === 'approved' || job.urgentRequestStatus === 'rejected');
  async function reject() {
    if (!rejection || busy) return;
    if (rejection.revision !== snapshot.revision) { setRejection(null); notify('The queue changed. Review the request again before rejecting it.', 'error'); return; }
    setBusy(true);
    if (await run(() => service.rejectUrgentRequest(rejection.job.id, rejection.revision), 'Urgent request rejected. Queue order unchanged.')) setRejection(null);
    setBusy(false);
  }
  return <div className="page stack">
    <PageHeader title={t('Urgent requests')} description={t('Review student requests and inspect the impact before granting priority.')} actions={<span className="badge">{pending.length} {t('pending')}</span>} />
    <p className="notice">{t('Approval requires an impact preview and explicit confirmation. Rejection records the decision without moving the job.')}</p>
    {pending.length === 0 ? <Empty title={t('No pending urgent requests')} description={t('New student urgency requests will appear here.')} /> : pending.map(job => <article key={job.id} className="panel panel-body stack"><div className="row wrap"><span className="token">{job.token}</span><h2>{job.documentName}</h2><Status value={job.status} /></div><dl className="field-grid"><div><dt>{t('Request time')}</dt><dd>{formatDate(job.urgentRequestedAt)}</dd></div><div><dt>{t('Current queue position')}</dt><dd>{job.queuePosition ?? '—'}</dd></div><div><dt>{t('Current waiting time')}</dt><dd>{minutes(job.estimatedWaitMinutes)}</dd></div><div><dt>{t('Current pickup estimate')}</dt><dd>{time(job.estimatedPickupAt)}</dd></div><div><dt>{t('Proposed priority')}</dt><dd>{t('Urgent')}</dd></div></dl><div className="row wrap"><UrgencyAction job={job} approve /><Button variant="danger" onClick={() => setRejection({ job, revision: snapshot.revision })}>{t('Reject')}</Button><Button variant="secondary" onClick={() => setSelected(job)}>{t('View details')}</Button></div></article>)}
    {resolved.length > 0 && <section className="panel"><div className="panel-header"><h2>{t('Recorded decisions')}</h2></div><div className="table-wrap"><table className="data-table"><thead><tr><th scope="col">{t('Token')}</th><th scope="col">{t('Document')}</th><th scope="col">{t('Decision')}</th><th scope="col">{t('Priority')}</th></tr></thead><tbody>{resolved.map(job => <tr key={job.id}><th scope="row" className="token">{job.token}</th><td>{job.documentName}</td><td>{t(job.urgentRequestStatus)}</td><td><Status value={job.priority} /></td></tr>)}</tbody></table></div></section>}
    {rejection && <Confirm title={t('Reject urgent request?')} onClose={() => { if (!busy) setRejection(null); }} onConfirm={reject} busy={busy} confirmLabel={t('Confirm rejection')}><p><strong>{rejection.job.token}</strong> {rejection.job.documentName}</p><p>{t('The student request will be marked rejected. The queue order and normal priority will stay unchanged.')}</p></Confirm>}
    {selected && <JobDetails job={selected} onClose={() => setSelected(null)} />}
  </div>;
}
