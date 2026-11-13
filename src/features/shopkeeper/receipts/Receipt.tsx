import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Printer } from 'lucide-react';
import { usePortal } from '../PortalContext';
import { Button, Status, formatDate, money } from '../components/ui';
import type { Job } from '../types';

export function Receipt({ job }: { job: Job }) {
  const { snapshot, notify, t } = usePortal();
  const [printing, setPrinting] = useState(false);
  useEffect(() => {
    if (!printing) return;
    const close = () => setPrinting(false);
    window.addEventListener('afterprint', close);
    const request = requestAnimationFrame(() => {
      try { window.print(); } catch { notify('Printing is unavailable in this browser. Use the browser print command to save the acknowledgement.', 'error'); setPrinting(false); }
    });
    return () => { cancelAnimationFrame(request); window.removeEventListener('afterprint', close); };
  }, [printing, notify]);
  const content = <article className="stack" aria-label={t('Order acknowledgement')}>
    <header><strong style={{ fontSize: 26, letterSpacing: '-1px' }}>PrintQ</strong><h3>{snapshot.settings.shopName}</h3><p>{t('Order acknowledgement — not proof of payment')}</p></header>
    <div className="divider" />
    <div className="row wrap"><strong className="token">{job.token}</strong><Status value={job.status} /></div>
    <h3 style={{ overflowWrap: 'anywhere' }}>{job.documentName}</h3>
    <dl className="job-meta">
      <div><dt>{t('Pages per copy')}</dt><dd>{job.pageCount}</dd></div><div><dt>{t('Copies')}</dt><dd>{job.copies}</dd></div>
      <div><dt>{t('Printing mode')}</dt><dd>{t(job.colorMode === 'bw' ? 'B&W' : 'Colour')}</dd></div><div><dt>{t('Paper and sides')}</dt><dd>{job.paperSize} · {t(job.duplex ? 'Double-sided' : 'Single-sided')}</dd></div>
      <div><dt>{t('Submitted')}</dt><dd>{formatDate(job.createdAt)}</dd></div><div><dt>{t('Estimated pickup')}</dt><dd>{job.estimatedPickupAt ? formatDate(job.estimatedPickupAt) : t('Unavailable')}</dd></div>
      {job.pickupWindowEnd && <div><dt>{t('Pickup window ends')}</dt><dd>{formatDate(job.pickupWindowEnd)}</dd></div>}
      {job.collectedAt && <div><dt>{t('Collected')}</dt><dd>{formatDate(job.collectedAt)}</dd></div>}
    </dl>
    <div className="divider" /><div className="row" style={{ justifyContent: 'space-between' }}><strong>{t('Estimated printing cost')}</strong><strong style={{ fontSize: 24 }}>{money(job.estimatedCost)}</strong></div>
    <p className="small muted">{t('This acknowledgement records the order only. Payment has not been recorded or confirmed. Final charges may be confirmed by the shop.')}</p>
  </article>;
  return <section className="panel"><div className="panel-header"><h2>{t('Digital acknowledgement')}</h2><Button variant="secondary" onClick={() => setPrinting(true)} disabled={printing}><Printer size={16} />{t('Print receipt / save PDF')}</Button></div><div className="panel-body">{content}<p className="small muted">{t('Choose Save as PDF in your browser print dialog to keep a digital copy.')}</p></div>
    {printing && <div className="panel-body row wrap"><span className="small muted">{t('Finish or cancel the browser print dialog. If no dialog opened, close the print view and retry.')}</span><Button variant="ghost" onClick={() => setPrinting(false)}>{t('Close print view')}</Button></div>}
    {printing && createPortal(<div className="printq-acknowledgement-print">
      <style>{`@media screen { .printq-acknowledgement-print { display: none; } } @media print { body > *:not(.printq-acknowledgement-print) { display: none !important; } .printq-acknowledgement-print { display: block !important; color: #000 !important; background: #fff !important; padding: 12mm; font-family: Arial, sans-serif; } .printq-acknowledgement-print .job-meta { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; } .printq-acknowledgement-print dt { font-weight: bold; } .printq-acknowledgement-print dd { margin: 3px 0 0; } .printq-acknowledgement-print .row { display: flex; gap: 20px; } .printq-acknowledgement-print .divider { border-top: 1px solid #999; margin: 16px 0; } }`}</style>{content}
    </div>, document.body)}
  </section>;
}
