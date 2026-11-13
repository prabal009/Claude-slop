import { useState, type FormEvent } from 'react';
import { usePortal } from '../PortalContext';
import { Button, Confirm, Empty, PageHeader } from '../components/ui';
import { QueueComparison } from '../queue/QueueComparison';
import type { ColorMode, QueuePreview, SimulationScenario } from '../types';

type ScenarioKind = SimulationScenario['kind'];
export default function SimulatorPage() {
  const { snapshot, service, run, notify, t } = usePortal();
  const queued = snapshot.jobs.filter(job => job.status === 'queued').sort((a, b) => (a.queuePosition ?? Infinity) - (b.queuePosition ?? Infinity));
  const [kind, setKind] = useState<ScenarioKind>('move');
  const [jobId, setJobId] = useState(queued[0]?.id ?? '');
  const [position, setPosition] = useState('1');
  const [copies, setCopies] = useState('2');
  const [pages, setPages] = useState('10');
  const [colorMode, setColorMode] = useState<ColorMode>('colour');
  const [duplex, setDuplex] = useState(true);
  const [downtime, setDowntime] = useState('15');
  const [unknownDowntime, setUnknownDowntime] = useState(false);
  const [result, setResult] = useState<{ preview: QueuePreview; scenario: SimulationScenario } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const needsJob = kind === 'move' || kind === 'urgent' || kind === 'quantity' || kind === 'colour';
  const stale = result !== null && result.preview.revision !== snapshot.revision;
  async function simulate(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (needsJob && !queued.some(job => job.id === jobId)) { notify('Select a current queued job.', 'error'); return; }
    if (kind === 'move' && (!Number.isInteger(Number(position)) || Number(position) < 1 || Number(position) > queued.length)) { notify('Queue position must be within the current queue.', 'error'); return; }
    if ((kind === 'quantity' || kind === 'add') && (!Number.isInteger(Number(copies)) || Number(copies) < 1 || Number(copies) > 100)) { notify('Copies must be a whole number between 1 and 100.', 'error'); return; }
    if (kind === 'add' && (!Number.isInteger(Number(pages)) || Number(pages) < 1 || Number(pages) > 10000)) { notify('Pages must be a whole number between 1 and 10000.', 'error'); return; }
    if (kind === 'downtime' && !unknownDowntime && (!Number.isFinite(Number(downtime)) || Number(downtime) < 0 || downtime.trim() === '')) { notify('Enter a valid non-negative downtime, or select unknown duration.', 'error'); return; }
    let scenario: SimulationScenario;
    switch (kind) {
      case 'move': scenario = { kind, jobId, position: Number(position) }; break;
      case 'urgent': scenario = { kind, jobId }; break;
      case 'quantity': scenario = { kind, jobId, copies: Number(copies) }; break;
      case 'colour': scenario = { kind, jobId, colorMode }; break;
      case 'downtime': scenario = { kind, minutes: unknownDowntime ? null : Number(downtime) }; break;
      case 'resume': scenario = { kind }; break;
      case 'optimize': scenario = { kind }; break;
      case 'add': scenario = { kind, pageCount: Number(pages), copies: Number(copies), colorMode, duplex }; break;
    }
    setBusy(true);
    setConfirming(false);
    setResult(null);
    try { setResult({ scenario, preview: await service.getSimulationResult(scenario) }); }
    catch (error) { notify(error instanceof Error ? error.message : 'Unable to simulate this scenario.', 'error'); }
    finally { setBusy(false); }
  }
  async function apply() {
    if (!result || busy) return;
    if (result.preview.revision !== snapshot.revision) { notify('The queue changed. Recalculate the simulation before confirming.', 'error'); setConfirming(false); return; }
    setBusy(true);
    if (await run(() => service.applySimulation(result.scenario, result.preview.revision), 'Simulated changes applied to the real queue.')) { setResult(null); setConfirming(false); }
    setBusy(false);
  }
  return <div className="page stack">
    <PageHeader title={t('What-if queue simulator')} description={t('Explore an alternative on a cloned snapshot, not the real queue.')} />
    <div className="notice notice-warning" role="status"><strong>{t('Simulation Mode — Changes Not Applied')}</strong><p>{t('Previewing never writes to the real queue. Eligible changes require a separate confirmation and a matching queue version.')}</p></div>
    <form className="panel panel-body stack" onSubmit={event => void simulate(event)} onChange={() => { setResult(null); setConfirming(false); }}>
      <div className="field-grid">
        <label className="field">{t('Scenario')}<select value={kind} onChange={event => setKind(event.target.value as ScenarioKind)} disabled={busy}><option value="move">{t('Move a job earlier or later')}</option><option value="urgent">{t('Mark a job urgent')}</option><option value="add">{t('Add a hypothetical job')}</option><option value="quantity">{t('Change print quantity')}</option><option value="colour">{t('Change black and white / colour')}</option><option value="downtime">{t('Printer downtime')}</option><option value="resume">{t('Resume printer operations')}</option><option value="optimize">{t('Apply smart queue optimization')}</option></select></label>
        {needsJob && <label className="field">{t('Queued job')}<select value={jobId} onChange={event => setJobId(event.target.value)} disabled={busy} required><option value="">{t('Select a job')}</option>{queued.map(job => <option key={job.id} value={job.id}>{job.token} — {job.documentName}</option>)}</select></label>}
        {kind === 'move' && <label className="field">{t('Proposed queue position')}<input type="number" min={1} max={queued.length || 1} step={1} value={position} onChange={event => setPosition(event.target.value)} required disabled={busy} /></label>}
        {(kind === 'quantity' || kind === 'add') && <label className="field">{t('Number of copies')}<input type="number" min={1} max={100} step={1} value={copies} onChange={event => setCopies(event.target.value)} required disabled={busy} /></label>}
        {kind === 'add' && <label className="field">{t('Page count')}<input type="number" min={1} max={10000} step={1} value={pages} onChange={event => setPages(event.target.value)} required disabled={busy} /></label>}
        {(kind === 'colour' || kind === 'add') && <label className="field">{t('Proposed print mode')}<select value={colorMode} onChange={event => setColorMode(event.target.value as ColorMode)} disabled={busy}><option value="bw">{t('Black and white')}</option><option value="colour">{t('Colour')}</option></select></label>}
        {kind === 'add' && <label className="field"><span>{t('Double-sided printing')}</span><input type="checkbox" checked={duplex} onChange={event => setDuplex(event.target.checked)} disabled={busy} /></label>}
        {kind === 'downtime' && <><label className="field">{t('Downtime in minutes')}<input type="number" min={0} step="any" value={downtime} onChange={event => setDowntime(event.target.value)} required={!unknownDowntime} disabled={busy || unknownDowntime} /></label><label className="field"><span>{t('Unknown duration')}</span><input type="checkbox" checked={unknownDowntime} onChange={event => setUnknownDowntime(event.target.checked)} disabled={busy} /></label></>}
      </div>
      {kind === 'add' && <p className="muted">{t('Hypothetical jobs are labeled in the comparison. They have no uploaded document and are not silently added to the real queue.')}</p>}
      <div><Button type="submit" disabled={busy || (needsJob && queued.length === 0)}>{busy ? t('Calculating…') : t('Run simulation')}</Button></div>
    </form>
    {!result ? <Empty title={t('Choose a scenario to compare')} description={t('Compare positions, pickup times, processing workload, and waiting times without committing changes.')} /> : <>
      {stale && <p className="notice notice-warning" role="alert">{t('The queue changed. Recalculate the simulation before confirming.')}</p>}
      <QueueComparison preview={result.preview} />
      <div className="row wrap"><Button onClick={() => setConfirming(true)} disabled={busy || stale || !result.preview.applicable}>{t('Apply Changes')}</Button><Button variant="secondary" onClick={() => { setResult(null); setConfirming(false); }} disabled={busy}>{t('Discard simulation')}</Button></div>
    </>}
    {confirming && result && <Confirm title={t('Apply simulated changes?')} onClose={() => { if (!busy) setConfirming(false); }} onConfirm={apply} confirmLabel={t('Confirm changes')} busy={busy} disabled={stale || !result.preview.applicable}><p>{t('This is no longer a preview: confirming changes the real queue. Cancel to keep all real jobs unchanged.')}</p>{stale && <p className="notice notice-error" role="alert">{t('The queue changed. Recalculate the simulation before confirming.')}</p>}<QueueComparison preview={result.preview} /></Confirm>}
  </div>;
}
