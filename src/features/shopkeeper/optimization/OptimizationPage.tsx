import { useState } from 'react';
import { usePortal } from '../PortalContext';
import { Button, Confirm, Empty, PageHeader } from '../components/ui';
import { QueueComparison } from '../queue/QueueComparison';
import type { QueuePreview } from '../types';

export default function OptimizationPage() {
  const { snapshot, service, run, notify, t } = usePortal();
  const [preview, setPreview] = useState<QueuePreview | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const stale = preview !== null && preview.revision !== snapshot.revision;
  async function calculate() {
    setBusy(true);
    setConfirming(false);
    try { setPreview(await service.getOptimizationPreview()); }
    catch (error) { notify(error instanceof Error ? error.message : 'Unable to calculate an optimized queue.', 'error'); }
    finally { setBusy(false); }
  }
  async function apply() {
    if (!preview || busy) return;
    if (preview.revision !== snapshot.revision) { notify('The queue changed. Recalculate the preview before confirming.', 'error'); setConfirming(false); return; }
    setBusy(true);
    if (await run(() => service.applyOptimizedQueue(preview.revision), 'Optimized queue applied.')) { setPreview(null); setConfirming(false); }
    setBusy(false);
  }
  return <div className="page stack">
    <PageHeader title={t('Smart optimization')} description={t('Compare a deterministic queue proposal before changing the live order.')} actions={<Button onClick={() => void calculate()} disabled={busy}>{busy ? t('Calculating…') : t('Calculate suggested queue')}</Button>} />
    <section className="panel panel-body stack"><h2>{t('Shorter jobs, without ignoring fairness')}</h2><p>{t('Eligible normal jobs are ordered by processing time. The current print job is never interrupted, urgent jobs keep their relative order, and normal jobs waiting over 60 minutes retain protected positions.')}</p><p className="muted">{t('This is a local rules-based algorithm, not an AI service. Longer jobs can wait more; inspect every trade-off below.')}</p></section>
    {!preview ? <Empty title={t('No proposal calculated')} description={t('Calculate a suggested queue to compare actual waiting times. Nothing changes automatically.')} /> : <>
      {stale && <p className="notice notice-warning" role="alert">{t('The queue changed. Recalculate the preview before confirming.')}</p>}
      <QueueComparison preview={preview} />
      {preview.beforeAverageWait !== null && preview.afterAverageWait !== null && preview.afterAverageWait >= preview.beforeAverageWait && <p className="notice notice-warning">{t('This proposal does not reduce the average waiting time. No improvement is claimed.')}</p>}
      <div className="row wrap"><Button onClick={() => setConfirming(true)} disabled={busy || stale || !preview.applicable}>{t('Apply optimized queue')}</Button><Button variant="secondary" onClick={() => { setPreview(null); setConfirming(false); }} disabled={busy}>{t('Discard proposal')}</Button></div>
    </>}
    {confirming && preview && <Confirm title={t('Apply optimized queue?')} onClose={() => { if (!busy) setConfirming(false); }} onConfirm={apply} confirmLabel={t('Confirm optimization')} busy={busy} disabled={stale || !preview.applicable}><p>{t('This changes the real queue order and recalculates waiting and pickup times. Cancel to keep the current queue.')}</p>{stale && <p className="notice notice-error" role="alert">{t('The queue changed. Recalculate the preview before confirming.')}</p>}<QueueComparison preview={preview} /></Confirm>}
  </div>;
}
