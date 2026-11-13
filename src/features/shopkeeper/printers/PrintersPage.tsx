import { useState } from 'react';
import { Printer as PrinterIcon, Pause, Wrench, Play } from 'lucide-react';
import { Link } from 'react-router-dom';
import { usePortal } from '../PortalContext';
import { Button, Confirm, PageHeader, Stat, Status, formatDate } from '../components/ui';
import type { PrinterState } from '../types';

export default function PrintersPage() {
  const { snapshot, service, run, t } = usePortal();
  const [downtime, setDowntime] = useState('');
  const [pending, setPending] = useState<PrinterState | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const printer = snapshot.printer;
  function prepare(state: PrinterState) {
    const value = downtime.trim() === '' ? null : Number(downtime);
    if (state !== 'operational' && value !== null && (!Number.isInteger(value) || value < 1 || value > 10080)) {
      setError('Enter a whole number from 1 to 10080 minutes, or leave it blank for unknown downtime.');
      return;
    }
    setError(''); setPending(state);
  }
  async function confirm() {
    if (!pending || busy) return;
    setBusy(true);
    const ok = await run(() => service.updatePrinterStatus(pending, pending === 'operational' || !downtime.trim() ? null : Number(downtime), snapshot.revision), 'Printer availability updated.');
    setBusy(false);
    if (ok) setPending(null);
  }
  return <div className="page stack">
    <PageHeader title={t('Printer management')} description={t('Control queue availability. Browser printing does not control physical printer hardware.')} />
    <div className="stats-grid">
      <Stat label={t('Printer availability')} value={<Status value={printer.state} />} icon={<PrinterIcon />} />
      <Stat label={t('Estimated downtime')} value={printer.state === 'operational' ? t('None') : printer.downtimeMinutes === null ? t('Unknown') : `${printer.downtimeMinutes} ${t('min')}`} />
      <Stat label={t('Recorded downtime')} value={`${Math.round(printer.recordedDowntimeMinutes)} ${t('min')}`} />
    </div>
    <section className="panel">
      <div className="panel-header"><h2>{t('Availability controls')}</h2><span className="muted small">{t('Last changed')}: {formatDate(printer.changedAt)}</span></div>
      <div className="panel-body stack">
        {printer.state !== 'operational' && <div className="notice notice-warning" role="status">{t(printer.downtimeMinutes === null ? 'Recovery time is unknown. Pickup estimates are unavailable until availability is restored.' : 'Pickup estimates include the estimated interruption. Confirm recovery before resuming printing.')}</div>}
        <p className="muted">{t('Pausing prevents new printing work. Existing job statuses are preserved; resuming never marks a job ready or collected.')}</p>
        <label className="field">{t('Estimated downtime in minutes')}<input type="number" min="1" max="10080" step="1" value={downtime} onChange={e => setDowntime(e.target.value)} placeholder={t('Leave blank if unknown')} /></label>
        {error && <p className="notice notice-error" role="alert">{t(error)}</p>}
        <div className="toolbar wrap">
          <Button variant="secondary" onClick={() => prepare('paused')}><Pause size={16} />{t('Pause printing')}</Button>
          <Button variant="danger" onClick={() => prepare('maintenance')}><Wrench size={16} />{t('Report breakdown')}</Button>
          <Button disabled={printer.state === 'operational'} onClick={() => prepare('operational')}><Play size={16} />{t('Resume printing')}</Button>
          <Link to="/shopkeeper/queue">{t('View affected queue')}</Link>
        </div>
      </div>
    </section>
    {pending && <Confirm title={t(pending === 'operational' ? 'Resume printing?' : pending === 'maintenance' ? 'Confirm printer breakdown?' : 'Pause printing?')} onClose={() => { if (!busy) setPending(null); }} onConfirm={confirm} busy={busy} confirmLabel={t('Confirm availability change')}>
      <p>{t(pending === 'operational' ? 'Queue estimates will be recalculated. Check the physical printer is ready before confirming.' : 'New printing work will be blocked and pickup estimates recalculated. No job will be marked completed.')}</p>
      {pending !== 'operational' && <p>{t('Estimated downtime')}: {downtime ? `${downtime} ${t('min')}` : t('Unknown')}</p>}
    </Confirm>}
  </div>;
}
