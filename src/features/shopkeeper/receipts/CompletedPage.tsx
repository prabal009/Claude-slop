import { useState } from 'react';
import { Link } from 'react-router-dom';
import { usePortal } from '../PortalContext';
import { Button, Empty, Modal, PageHeader, Stat, formatDate, money } from '../components/ui';
import { DocumentPanel } from '../documents/DocumentPanel';
import { Receipt } from './Receipt';

export default function CompletedPage() {
  const { snapshot, t } = usePortal();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const completed = snapshot.jobs.filter(job => job.status === 'collected').sort((a, b) => (b.collectedAt ?? '').localeCompare(a.collectedAt ?? ''));
  const matching = completed.filter(job => `${job.token} ${job.documentName}`.toLowerCase().includes(query.trim().toLowerCase()));
  const current = completed.find(job => job.id === selected);
  return <div className="page stack">
    <PageHeader title={t('Completed orders')} description={t('Collected orders only. Ready orders remain in pickup verification until handover is confirmed.')} actions={<Link className="button secondary" to="/shopkeeper/pickup">{t('Verify a pickup')}</Link>} />
    <div className="stats-grid"><Stat label={t('Collected orders')} value={completed.length} /><Stat label={t('Estimated collected order value')} value={money(completed.reduce((sum, job) => sum + job.estimatedCost, 0))} detail={t('Estimated order value, not recorded payments')} /></div>
    <section className="panel"><div className="panel-header"><h2>{t('Collection history')}</h2><label className="field">{t('Search history')}<input type="search" maxLength={160} value={query} onChange={e => setQuery(e.target.value)} placeholder={t('Token or document name')} /></label></div>
      {!matching.length ? <Empty title={t(completed.length ? 'No matching orders' : 'No collected orders yet')} description={t('Confirm a ready order in pickup verification to add it to this history.')} /> : <div className="table-wrap"><table className="data-table"><thead><tr><th>{t('Token / document')}</th><th>{t('Print settings')}</th><th>{t('Collected')}</th><th>{t('Estimated cost')}</th><th>{t('Acknowledgement')}</th></tr></thead><tbody>{matching.map(job => <tr key={job.id}><td><strong className="token">{job.token}</strong><div>{job.documentName}</div></td><td>{job.pageCount} {t('pages')} × {job.copies} · {t(job.colorMode === 'bw' ? 'B&W' : 'Colour')}<div className="small muted">{t(job.duplex ? 'Double-sided' : 'Single-sided')}</div></td><td>{formatDate(job.collectedAt)}</td><td>{money(job.estimatedCost)}</td><td><Button variant="secondary" onClick={() => setSelected(job.id)}>{t('View receipt')}</Button></td></tr>)}</tbody></table></div>}
    </section>
    {current && <Modal title={t('Collected order')} onClose={() => setSelected(null)} wide><div className="stack"><Receipt job={current} /><DocumentPanel job={current} /></div></Modal>}
  </div>;
}
