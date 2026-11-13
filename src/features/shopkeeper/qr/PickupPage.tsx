import { useCallback, useEffect, useRef, useState } from 'react';
import { BrowserQRCodeReader, type IScannerControls } from '@zxing/browser';
import { Camera, CameraOff, ScanLine } from 'lucide-react';
import { usePortal } from '../PortalContext';
import { Button, Confirm, PageHeader, Status, Empty } from '../components/ui';
import type { Job } from '../types';
import { MAX_PICKUP_INPUT_LENGTH, decodePickupPayload } from '../../../shared/printq/pickupCodec';

export function parsePickupToken(input: string, qrOnly = false): string {
  const payload = decodePickupPayload(input, qrOnly);
  if (!payload) throw new Error('Enter a valid pickup token or a printq:v1: pickup payload.');
  return payload;
}

export default function PickupPage() {
  const { snapshot, service, run, notify, t } = usePortal();
  const [input, setInput] = useState('');
  const [match, setMatch] = useState<Job | null>(null);
  const [error, setError] = useState('');
  const [scanning, setScanning] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const controls = useRef<IScannerControls | null>(null);
  const mounted = useRef(true);
  const generation = useRef(0);
  const verifyingRef = useRef(false);
  const liveMatch = match ? snapshot.jobs.find(job => job.id === match.id) ?? null : null;
  const stopCamera = useCallback(() => {
    generation.current += 1;
    controls.current?.stop(); controls.current = null;
    const stream = video.current?.srcObject;
    if (stream && 'getTracks' in stream) stream.getTracks().forEach(track => track.stop());
    if (video.current) video.current.srcObject = null;
    if (mounted.current) setScanning(false);
  }, []);
  useEffect(() => {
    mounted.current = true;
    const onVisibility = () => { if (document.hidden) stopCamera(); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => { mounted.current = false; stopCamera(); document.removeEventListener('visibilitychange', onVisibility); };
  }, [stopCamera]);
  async function verify(value: string, qrOnly = false) {
    if (verifyingRef.current) return;
    verifyingRef.current = true; setVerifying(true); setError(''); setMatch(null); setConfirming(false);
    stopCamera();
    try {
      const token = parsePickupToken(value, qrOnly);
      const found = await service.verifyPickupToken(token);
      if (!mounted.current) return;
      if (found.token !== token || !snapshot.jobs.some(job => job.id === found.id && job.token === token)) throw new Error('The pickup response does not match an available job. Refresh and verify again.');
      setMatch(found); setInput(token);
    } catch (reason) {
      if (mounted.current) setError(reason instanceof Error ? reason.message : 'Pickup verification failed. Try manual token entry.');
    } finally {
      verifyingRef.current = false;
      if (mounted.current) setVerifying(false);
    }
  }
  async function startCamera() {
    setError(''); setMatch(null);
    if (!navigator.mediaDevices?.getUserMedia || !window.isSecureContext) {
      setError('Camera access requires HTTPS or localhost and a supported browser. Enter the pickup token manually.'); return;
    }
    stopCamera(); setScanning(true);
    const attempt = generation.current;
    try {
      const reader = new BrowserQRCodeReader();
      const handle = await reader.decodeFromVideoDevice(undefined, video.current!, (result, _error, handle) => {
        if (!result || attempt !== generation.current || !mounted.current) return;
        handle.stop();
        void verify(result.getText(), true);
      });
      if (!mounted.current || attempt !== generation.current) handle.stop();
      else controls.current = handle;
    } catch {
      if (mounted.current && attempt === generation.current) {
        stopCamera(); setError('Camera could not start. Check permission and camera availability, or enter the token manually.');
      }
    }
  }
  async function collect() {
    if (!liveMatch || liveMatch.status !== 'ready' || busy) return;
    setBusy(true);
    const ok = await run(() => service.markCollected(liveMatch.id, snapshot.revision), 'Pickup confirmed. The order is now in completed history.');
    setBusy(false); setConfirming(false);
    if (ok) setMatch(null);
    else { setMatch(null); notify('Verify the token again before retrying collection.', 'info'); }
  }
  return <div className="page stack">
    <PageHeader title={t('Pickup verification')} description={t('Verify a real order, check that it is ready, then confirm handover.')} />
    <div className="two-column">
      <section className="panel"><div className="panel-header"><h2>{t('Scan a pickup QR')}</h2><ScanLine size={20} /></div><div className="panel-body stack">
        <video ref={video} muted playsInline aria-label={t('Pickup QR camera preview')} hidden={!scanning} style={{ width: '100%', maxHeight: 320, background: '#202638' }} />
        {!scanning && <p className="muted">{t('Camera starts only when you request it. It stops after a scan, when hidden, or when you leave this page.')}</p>}
        <div className="toolbar"><Button onClick={() => void startCamera()} disabled={scanning || verifying}><Camera size={16} />{t('Start camera')}</Button><Button variant="secondary" onClick={stopCamera} disabled={!scanning}><CameraOff size={16} />{t('Stop camera')}</Button></div>
        <p className="small muted">{t('Supported QR format')}: <code>printq:v1:&lt;token&gt;</code></p>
      </div></section>
      <section className="panel"><div className="panel-header"><h2>{t('Enter a token manually')}</h2></div><form className="panel-body stack" onSubmit={e => { e.preventDefault(); void verify(input); }}>
        <label className="field">{t('Pickup token')}<input value={input} maxLength={MAX_PICKUP_INPUT_LENGTH} autoComplete="off" spellCheck={false} placeholder="PQ-2026-1008" onChange={e => { setInput(e.target.value); setMatch(null); setError(''); }} /></label>
        <Button type="submit" disabled={verifying || !input.trim()}>{t(verifying ? 'Verifying…' : 'Verify token')}</Button>
        <p className="small muted">{t('Manual verification remains available without camera access. Token possession is not a payment record.')}</p>
      </form></section>
    </div>
    {error && <div className="notice notice-error" role="alert">{t(error)}</div>}
    {liveMatch ? <section className="panel"><div className="panel-header"><h2>{t('Verified order')}</h2><Status value={liveMatch.status} /></div><div className="panel-body stack">
      <strong className="token">{liveMatch.token}</strong><h3>{liveMatch.documentName}</h3><p>{liveMatch.pageCount} {t('pages')} · {liveMatch.copies} {t('copies')}</p>
      {liveMatch.status === 'ready' ? <><p className="notice notice-success">{t('This order is ready. Match the token to the printed order before handing it over.')}</p><Button onClick={() => setConfirming(true)}>{t('Confirm collection')}</Button></> : <p className="notice notice-warning" role="status">{t(liveMatch.status === 'collected' ? 'This order has already been collected. Duplicate collection is blocked.' : 'This order is not ready. Collection is blocked until printing is finished.')}</p>}
    </div></section> : !error && <Empty title={t('No order verified')} description={t('Scan a PrintQ QR or enter a token to check pickup readiness.')} />}
    {confirming && liveMatch && <Confirm title={t('Confirm order handover?')} onClose={() => { if (!busy) setConfirming(false); }} onConfirm={collect} busy={busy} disabled={liveMatch.status !== 'ready'} confirmLabel={t('Mark collected')}><p>{t('Confirm that this printed order has been handed over. This action records collection, not payment.')}</p><strong>{liveMatch.token}</strong><p>{liveMatch.documentName}</p>{liveMatch.status !== 'ready' && <p className="notice notice-error">{t('The order is no longer ready. Close this dialog and verify again.')}</p>}</Confirm>}
  </div>;
}
