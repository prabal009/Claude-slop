import { usePortal } from '../PortalContext';
import { Empty, Stat, minutes, time } from '../components/ui';
import type { QueuePreview } from '../types';

export function QueueComparison({ preview }: { preview: QueuePreview }) {
  const { t } = usePortal();
  const beforeWorkload = preview.before.jobs.filter(job => job.status === 'queued' || job.status === 'printing').reduce((total, job) => total + (job.status === 'printing' ? job.remainingMinutes ?? job.estimatedDurationMinutes : job.estimatedDurationMinutes), 0);
  const afterWorkload = preview.after.jobs.filter(job => job.status === 'queued' || job.status === 'printing').reduce((total, job) => total + (job.status === 'printing' ? job.remainingMinutes ?? job.estimatedDurationMinutes : job.estimatedDurationMinutes), 0);
  return <div className="stack comparison">
    <p className="notice">{t(preview.explanation)}</p>
    <div className="stats-grid">
      <Stat label={t('Current average wait')} value={minutes(preview.beforeAverageWait)} />
      <Stat label={t('Proposed average wait')} value={minutes(preview.afterAverageWait)} />
      <Stat label={t('Total waiting time saved')} value={minutes(preview.savedMinutes)} />
      <Stat label={t('Jobs with longer waits')} value={preview.delayedJobs} />
      <Stat label={t('Jobs with shorter waits')} value={preview.improvedJobs} />
      <Stat label={t('Processing workload')} value={<>{minutes(beforeWorkload)} → {minutes(afterWorkload)}</>} />
    </div>
    {preview.rows.length === 0 ? <Empty title={t('No jobs to compare')} /> : <div className="table-wrap"><table className="data-table">
      <caption>{t('Current and proposed queue impact')}</caption>
      <thead><tr><th scope="col">{t('Job')}</th><th scope="col">{t('Current position')}</th><th scope="col">{t('Proposed position')}</th><th scope="col">{t('Current wait')}</th><th scope="col">{t('Proposed wait')}</th><th scope="col">{t('Wait change')}</th><th scope="col">{t('Current pickup')}</th><th scope="col">{t('Proposed pickup')}</th></tr></thead>
      <tbody>{preview.rows.map(row => {
        const job = preview.after.jobs.find(item => item.id === row.id) ?? preview.before.jobs.find(item => item.id === row.id);
        return <tr key={row.id}><th scope="row"><span className="token">{row.token}</span>{job && <><div>{job.documentName}</div>{job.hypothetical && <span className="badge">{t('Hypothetical job')}</span>}</>}</th><td>{row.beforePosition ?? '—'}</td><td>{row.afterPosition ?? '—'}</td><td>{minutes(row.beforeWait)}</td><td>{minutes(row.afterWait)}</td><td>{row.delayMinutes === null ? t('Unavailable') : row.delayMinutes > 0 ? <>{t('Longer by')} {minutes(row.delayMinutes)}</> : row.delayMinutes < 0 ? <>{t('Shorter by')} {minutes(-row.delayMinutes)}</> : t('Unchanged')}</td><td>{time(row.beforePickupAt)}</td><td>{time(row.afterPickupAt)}</td></tr>;
      })}</tbody>
    </table></div>}
    {!preview.applicable && <p className="notice notice-warning">{t('This preview cannot be applied to the real queue.')}</p>}
  </div>;
}
