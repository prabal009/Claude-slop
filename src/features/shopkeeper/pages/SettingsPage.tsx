import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePortal } from '../PortalContext';
import { Button, Confirm, PageHeader } from '../components/ui';
import { inspectDocument } from '../documents/DocumentPanel';
import type { ColorMode, Language, ShopSettings } from '../types';

export default function SettingsPage() {
  const { snapshot, service, run, t, language, setLanguage, theme, setTheme } = usePortal();
  const [shopName, setShopName] = useState(snapshot.settings.shopName);
  const [bwPrice, setBwPrice] = useState(String(snapshot.settings.bwPrice));
  const [colourPrice, setColourPrice] = useState(String(snapshot.settings.colourPrice));
  const [buffer, setBuffer] = useState(String(snapshot.settings.pickupBufferMinutes));
  const [opensAt, setOpensAt] = useState(snapshot.settings.opensAt);
  const [closesAt, setClosesAt] = useState(snapshot.settings.closesAt);
  const [settingsError, setSettingsError] = useState('');
  const [documentName, setDocumentName] = useState('');
  const [pages, setPages] = useState('1');
  const [copies, setCopies] = useState('1');
  const [colorMode, setColorMode] = useState<ColorMode>('bw');
  const [duplex, setDuplex] = useState(false);
  const [file, setFile] = useState<File | undefined>();
  const [demoError, setDemoError] = useState('');
  const [urgentJob, setUrgentJob] = useState('');
  const [reset, setReset] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const { settings } = snapshot;
  useEffect(() => {
    setShopName(settings.shopName); setBwPrice(String(settings.bwPrice)); setColourPrice(String(settings.colourPrice)); setBuffer(String(settings.pickupBufferMinutes)); setOpensAt(settings.opensAt); setClosesAt(settings.closesAt);
  }, [settings.shopName, settings.bwPrice, settings.colourPrice, settings.pickupBufferMinutes, settings.opensAt, settings.closesAt]);
  const eligible = snapshot.jobs.filter(job => job.status === 'queued' && job.priority === 'normal' && job.urgentRequestStatus === 'none');
  async function saveSettings() {
    setSettingsError('');
    const bw = Number(bwPrice); const colour = Number(colourPrice); const pickupBufferMinutes = Number(buffer);
    if (!shopName.trim() || shopName.trim().length > 100) { setSettingsError('Enter a shop name from 1 to 100 characters.'); return; }
    if (!bwPrice.trim() || !colourPrice.trim() || !Number.isFinite(bw) || !Number.isFinite(colour) || bw < 0 || colour < 0 || bw > 10000 || colour > 10000) { setSettingsError('Prices must be numbers from 0 to 10000 rupees per printed page.'); return; }
    if (!buffer.trim() || !Number.isInteger(pickupBufferMinutes) || pickupBufferMinutes < 0 || pickupBufferMinutes > 1440) { setSettingsError('Pickup buffer must be a whole number from 0 to 1440 minutes.'); return; }
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(opensAt) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(closesAt) || opensAt >= closesAt) { setSettingsError('Choose valid same-day opening and closing times. Closing must be after opening.'); return; }
    const next: ShopSettings = { shopName: shopName.trim(), bwPrice: bw, colourPrice: colour, pickupBufferMinutes, opensAt, closesAt };
    setBusy(true);
    await run(() => service.updateSettings(next, snapshot.revision), 'Shop settings saved. Estimates have been recalculated.');
    setBusy(false);
  }
  async function addJob() {
    if (busy || snapshot.mode !== 'demo') return;
    setDemoError('');
    const pageCount = Number(pages); const quantity = Number(copies);
    if (!documentName.trim() || documentName.trim().length > 160) { setDemoError('Enter a document name from 1 to 160 characters.'); return; }
    if (!Number.isInteger(pageCount) || pageCount < 1 || pageCount > 1000 || !Number.isInteger(quantity) || quantity < 1 || quantity > 100) { setDemoError('Use 1 to 1000 pages and 1 to 100 copies, in whole numbers.'); return; }
    setBusy(true);
    try {
      if (file) {
        if (file.name.length > 200) throw new Error('The filename must not exceed 200 characters.');
        await inspectDocument({ id: 'demo-upload-check', name: file.name, mimeType: file.type, blob: file });
      }
      const ok = await run(() => service.addDemoJob({ documentName: documentName.trim(), pageCount, copies: quantity, colorMode, duplex, ...(file ? { file } : {}) }), 'Incoming demo job added to the queue.');
      if (ok) { setDocumentName(''); setPages('1'); setCopies('1'); setFile(undefined); if (fileInput.current) fileInput.current.value = ''; }
    } catch (reason) { setDemoError(reason instanceof Error ? reason.message : 'The file could not be validated. Choose a supported original file.'); }
    finally { setBusy(false); }
  }
  async function requestUrgency() {
    if (busy || snapshot.mode !== 'demo' || !eligible.some(job => job.id === urgentJob)) return;
    setBusy(true);
    const ok = await run(() => service.requestDemoUrgency(urgentJob, snapshot.revision), 'Demo urgent request sent. Review its impact in urgent requests.');
    if (ok) setUrgentJob('');
    setBusy(false);
  }
  async function resetDemo() {
    if (busy || snapshot.mode !== 'demo') return;
    setBusy(true);
    const ok = await run(() => service.resetDemo(snapshot.revision), 'Demo restored to its original fictional jobs.');
    setBusy(false); if (ok) { setReset(false); setUrgentJob(''); }
  }
  return <div className="page stack">
    <PageHeader title={t('Settings & demo lab')} description={t('Set local preferences, configure shop estimates, and explore fictional workflows.')} />
    <div className="two-column">
      <section className="panel"><div className="panel-header"><h2>{t('Display preferences')}</h2></div><div className="panel-body stack">
        <label className="field">{t('Language')}<select value={language} onChange={e => setLanguage(e.target.value as Language)}><option value="en">{t('English')}</option><option value="hi">{t('Hindi')}</option><option value="kn">{t('Kannada')}</option></select></label>
        <label className="field">{t('Appearance')}<select value={theme} onChange={e => setTheme(e.target.value as 'light' | 'dark')}><option value="light">{t('Light')}</option><option value="dark">{t('Dark')}</option></select></label>
        <p className="small muted">{t('Preferences are saved on this browser. Missing translations fall back to English.')}</p>
      </div></section>
      <section className="panel"><div className="panel-header"><h2>{t('Shop pricing & hours')}</h2></div><form className="panel-body stack" noValidate onSubmit={e => { e.preventDefault(); if (!busy) void saveSettings(); }}>
        <label className="field">{t('Shop display name')}<input value={shopName} maxLength={100} onChange={e => setShopName(e.target.value)} /></label>
        <div className="field-grid"><label className="field">{t('B&W price per page (₹)')}<input type="number" min="0" max="10000" step="0.01" value={bwPrice} onChange={e => setBwPrice(e.target.value)} /></label><label className="field">{t('Colour price per page (₹)')}<input type="number" min="0" max="10000" step="0.01" value={colourPrice} onChange={e => setColourPrice(e.target.value)} /></label></div>
        <div className="field-grid"><label className="field">{t('Opens at')}<input type="time" value={opensAt} onChange={e => setOpensAt(e.target.value)} /></label><label className="field">{t('Closes at')}<input type="time" value={closesAt} onChange={e => setClosesAt(e.target.value)} /></label></div>
        <label className="field">{t('Pickup window buffer (minutes)')}<input type="number" min="0" max="1440" step="1" value={buffer} onChange={e => setBuffer(e.target.value)} /></label>
        <p className="small muted">{t('Charges use printed pages × copies, not physical sheets. Updating rates recalculates order estimates. Hours use the local browser time zone.')}</p>
        {settingsError && <p role="alert" className="notice notice-error">{t(settingsError)}</p>}
        <Button type="submit" disabled={busy}>{t('Save shop settings')}</Button>
      </form></section>
    </div>
    {snapshot.mode === 'demo' ? <>
      <div className="notice notice-warning">{t('Demo mode · fictional local data only. No Student Portal, payment system, or physical printer is connected.')}</div>
      <section className="panel"><div className="panel-header"><h2>{t('Add an incoming demo job')}</h2></div><form noValidate className="panel-body stack" onSubmit={e => { e.preventDefault(); void addJob(); }}>
        <label className="field">{t('Document name')}<input maxLength={160} value={documentName} onChange={e => setDocumentName(e.target.value)} /></label>
        <div className="field-grid"><label className="field">{t('Pages per copy')}<input type="number" min="1" max="1000" step="1" value={pages} onChange={e => setPages(e.target.value)} /></label><label className="field">{t('Copies')}<input type="number" min="1" max="100" step="1" value={copies} onChange={e => setCopies(e.target.value)} /></label><label className="field">{t('Printing mode')}<select value={colorMode} onChange={e => setColorMode(e.target.value as ColorMode)}><option value="bw">{t('B&W')}</option><option value="colour">{t('Colour')}</option></select></label></div>
        <label className="row"><input type="checkbox" checked={duplex} onChange={e => setDuplex(e.target.checked)} />{t('Double-sided printing')}</label>
        <label className="field">{t('Attach an original file (optional)')}<input ref={fileInput} type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" onChange={e => { setFile(e.target.files?.[0]); setDemoError(''); }} /></label>
        <p className="small muted">{t('PDF, DOC, DOCX, JPEG, or PNG. Maximum 20 MiB. File type and signature are checked; page count is entered manually, not extracted. Word files are download-only.')}</p>
        {demoError && <p className="notice notice-error" role="alert">{t(demoError)}</p>}
        <Button type="submit" disabled={busy}>{t('Add incoming job')}</Button>
      </form></section>
      <div className="two-column"><section className="panel"><div className="panel-header"><h2>{t('Simulate an urgent request')}</h2></div><div className="panel-body stack">
        <label className="field">{t('Eligible queued order')}<select value={urgentJob} onChange={e => setUrgentJob(e.target.value)}><option value="">{t('Choose an order')}</option>{eligible.map(job => <option value={job.id} key={job.id}>{job.token} · {job.documentName}</option>)}</select></label>
        {!eligible.length && <p className="muted">{t('No eligible normal jobs. Add an incoming job first.')}</p>}
        <Button variant="secondary" disabled={busy || !eligible.some(job => job.id === urgentJob)} onClick={() => void requestUrgency()}>{t('Send urgent request')}</Button><Link to="/shopkeeper/urgent">{t('Review urgent requests')}</Link>
      </div></section><section className="panel"><div className="panel-header"><h2>{t('Restore the demo')}</h2></div><div className="panel-body stack"><p>{t('Reset replaces all local demo jobs, uploaded files, settings, and collection history with the original fictional sample. Display preferences are kept.')}</p><Button variant="danger" disabled={busy} onClick={() => setReset(true)}>{t('Reset demo')}</Button></div></section></div>
    </> : <div className="notice">{t('Integrated mode: demo creation, urgent-request simulation, and reset are disabled. Real records cannot be erased with demo controls.')}</div>}
    <section className="panel"><div className="panel-header"><h2>{t('Guided demonstration')}</h2></div><div className="panel-body stack">
      <ol className="stack"><li><Link to="/shopkeeper/queue">{t('Queue management')}</Link><p className="small muted">{t('Open a queued job, move it upward, and inspect its new position and pickup estimate.')}</p></li><li><Link to="/shopkeeper/urgent">{t('Urgent request impact')}</Link><p className="small muted">{t('Review a pending urgent request, compare every affected order, then approve or cancel.')}</p></li><li><Link to="/shopkeeper/printers">{t('Printer breakdown')}</Link><p className="small muted">{t('Confirm a pause with unknown downtime, inspect unavailable queue estimates, then confirm resume.')}</p></li><li><Link to="/shopkeeper/optimization">{t('Smart optimization')}</Link><p className="small muted">{t('Calculate a proposal, compare the original and suggested queue, then apply or discard it.')}</p></li><li><Link to="/shopkeeper/pickup">{t('Pickup and acknowledgement')}</Link><p className="small muted">{t('Verify a ready token from the list below, confirm collection, then open its acknowledgement in completed orders.')}</p></li></ol>
      <h3>{t('Current ready pickup tokens')}</h3>{snapshot.jobs.filter(job => job.status === 'ready').length ? snapshot.jobs.filter(job => job.status === 'ready').map(job => <div className="row wrap" key={job.id}><strong className="token">{job.token}</strong><code>printq:v1:{job.token}</code><span>{job.documentName}</span></div>) : <p className="muted">{t('No ready orders. Finish a printing job first.')}</p>}
    </div></section>
    {reset && <Confirm title={t('Replace all demo data?')} confirmLabel={t('Reset demo data')} busy={busy} disabled={snapshot.mode !== 'demo'} onClose={() => { if (!busy) setReset(false); }} onConfirm={resetDemo}><p>{t('All local demo jobs, attached files, settings, and history will be replaced. This cannot be undone. Integrated real data is never reset.')}</p></Confirm>}
  </div>;
}
