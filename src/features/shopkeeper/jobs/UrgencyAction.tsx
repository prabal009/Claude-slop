import { useEffect, useRef, useState } from 'react';
import { usePortal } from '../PortalContext';
import { Button, Confirm, minutes, time } from '../components/ui';
import { QueueComparison } from '../queue/QueueComparison';
import type { Job, QueuePreview } from '../types';

export function UrgencyAction({ job, approve = false }: { job: Job; approve?: boolean }) {
  const { snapshot, service, run, notify, t } = usePortal();
  const [preview, setPreview] = useState<QueuePreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const eligible = job.status === 'queued' && job.priority === 'normal' && (!approve || job.urgentRequestStatus === 'pending');
  const stale = preview !== null && preview.revision !== snapshot.revision;
  async function load() {
    setBusy(true);
    try {
      const result = await service.getUrgentImpactPreview(job.id);
      if (mounted.current) { setPreview(result); setOpen(true); }
    } catch (error) { notify(error instanceof Error ? error.message : 'Unable to calculate urgency impact.', 'error'); }
    finally { if (mounted.current) setBusy(false); }
  }
  async function confirm() {
    if (!preview || busy) return;
    if (preview.revision !== snapshot.revision) { notify('The queue changed. Recalculate the preview before confirming.', 'error'); return; }
    setBusy(true);
    const succeeded = await run(() => approve ? service.approveUrgentRequest(job.id, preview.revision) : service.markJobUrgent(job.id, preview.revision), approve ? 'Urgent request approved.' : 'Job marked urgent.');
    if (mounted.current) { setBusy(false); if (succeeded) { setOpen(false); setPreview(null); } }
  }
  const impact = preview?.rows.find(row => row.id === job.id);
  return <>
    <Button variant="secondary" onClick={() => void load()} disabled={!eligible || busy}>{busy && !open ? t('Calculating impact…') : approve ? t('View impact / Approve') : t('Mark Urgent')}</Button>
    {open && preview && <Confirm title={approve ? t('Approve urgent request?') : t('Mark this job urgent?')} onClose={() => { if (!busy) setOpen(false); }} onConfirm={confirm} confirmLabel={approve ? t('Confirm approval') : t('Confirm urgency')} busy={busy} disabled={stale || !eligible || !preview.applicable}>
      <p><strong>{job.token}</strong> {job.documentName}</p>
      <p>{t('The real queue changes only after confirmation. Existing urgent jobs keep their relative order.')}</p>
      {impact && <div className="notice"><p>{t('Queue position')}: {impact.beforePosition ?? '—'} → {impact.afterPosition ?? '—'}</p><p>{t('Estimated pickup')}: {time(impact.beforePickupAt)} → {time(impact.afterPickupAt)}</p><p>{t('Estimated minutes saved')}: {impact.delayMinutes === null ? t('Unavailable') : minutes(Math.max(0, -impact.delayMinutes))}</p></div>}
      {stale && <div className="notice notice-warning" role="alert"><p>{t('The queue changed. Recalculate the preview before confirming.')}</p><Button onClick={() => void load()} disabled={busy}>{t('Recalculate impact')}</Button></div>}
      <QueueComparison preview={preview} />
    </Confirm>}
  </>;
}
