// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import type { ShopkeeperService, Snapshot } from '../types';
import { calculateSnapshot, changePrinter, cost, duration, optimize, orderedQueue, preview, setOrder, sheets, simulate } from '../services/engine';
import { createDemoSnapshot, createSampleDocument } from '../services/demo';
import { createLocalService } from '../services/localService';
import { DATABASE_NAME, SNAPSHOT_KEY, validateDocument, validateSnapshot } from '../services/validation';

const NOW = new Date(2026,10,13,10,0,0).getTime();
const services: ShopkeeperService[] = [];
function service(): ShopkeeperService { const value = createLocalService(); services.push(value); return value; }
async function replaceStored(value: unknown): Promise<void> {
  const opened = Promise.withResolvers<IDBDatabase>();
  const request = indexedDB.open(DATABASE_NAME,1);
  request.onsuccess = () => opened.resolve(request.result); request.onerror = () => opened.reject(request.error);
  const db = await opened.promise, finished = Promise.withResolvers<void>();
  const tx = db.transaction('state','readwrite'); tx.objectStore('state').put(value,SNAPSHOT_KEY);
  tx.oncomplete = () => finished.resolve(); tx.onabort = () => finished.reject(tx.error);
  await finished.promise; db.close();
}
beforeEach(() => { vi.stubGlobal('indexedDB',new IDBFactory()); vi.stubGlobal('BroadcastChannel',undefined); vi.spyOn(Date,'now').mockReturnValue(NOW); });
afterEach(() => { services.splice(0).forEach(s => s.dispose()); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('deterministic processing, pricing and paper', () => {
  it('uses printed sides, never duplex sheets, for processing and cost', () => {
    const job = { pageCount:5,copies:3,colorMode:'bw' as const,duplex:true }, settings = createDemoSnapshot(NOW).settings;
    expect(duration(job)).toBe(7); expect(duration({...job,colorMode:'colour'})).toBe(13);
    expect(cost(job,settings)).toBe(30); expect(cost({...job,colorMode:'colour'},settings)).toBe(150);
    expect(sheets(job)).toBe(9); expect(sheets({...job,duplex:false})).toBe(15);
  });
  it.each([NaN,Infinity,-1,0,1.5,10001])('rejects invalid page count %s', pageCount => { expect(() => duration({pageCount,copies:1,colorMode:'bw'})).toThrow(); });
  it('accepts 10000-page boundary for duration, cost, sheets, and validateSnapshot', () => {
    const s = createDemoSnapshot(NOW);
    const job = { pageCount: 10000, copies: 1, colorMode: 'colour' as const, duplex: true };
    expect(duration(job)).toBe(8001);
    expect(cost(job, s.settings)).toBe(100000);
    expect(sheets(job)).toBe(5000);
    const target = s.jobs.find(j => j.status === 'queued')!;
    target.pageCount = 10000;
    const updated = calculateSnapshot(s, NOW);
    expect(() => validateSnapshot(updated)).not.toThrow();
  });
  it('includes remaining active workload and excludes completed work', () => {
    const s = createDemoSnapshot(NOW), active = s.jobs.find(j => j.status === 'printing')!;
    expect(active.remainingMinutes).toBeCloseTo(4.6);
    const queue = orderedQueue(s); expect(queue[0].estimatedWaitMinutes).toBeCloseTo(4.6);
    expect(queue[1].estimatedWaitMinutes).toBeCloseTo(4.6 + duration(queue[0]));
    expect(s.jobs.filter(j => j.status === 'ready' || j.status === 'collected').every(j => j.queuePosition === null)).toBe(true);
  });
  it('recalculates wait on reordering without mutating the source', () => {
    const before = createDemoSnapshot(NOW), after = structuredClone(before), ids = orderedQueue(after).map(j => j.id);
    [ids[1],ids[3]] = [ids[3],ids[1]]; setOrder(after,ids);
    const result = calculateSnapshot(after,NOW); expect(orderedQueue(result).map(j => j.id)).toEqual(ids);
    expect(orderedQueue(before)[1].id).not.toBe(ids[1]);
    expect(result.jobs.find(j => j.id === ids[1])!.estimatedWaitMinutes).toBeCloseTo(4.6 + duration(orderedQueue(before)[0]));
    expect(new Set(orderedQueue(result).map(j => j.queuePosition)).size).toBe(ids.length);
  });
  it('honours operating hours in readiness and pickup suggestions', () => {
    const late = new Date(2026,10,13,20,30).getTime(), s = createDemoSnapshot(late), first = orderedQueue(s)[0];
    const ready = new Date(first.estimatedPickupAt!); expect(ready.getDate()).toBe(14); expect(ready.getHours()).toBe(8);
    expect(new Date(first.pickupWindowEnd!).getTime()).toBeGreaterThan(ready.getTime());
  });
});

describe('priority, fairness, comparisons and simulation', () => {
  it('keeps the active job, stable urgent block, and normal jobs aged 60 minutes in place', () => {
    const s = createDemoSnapshot(NOW), result = optimize(s,NOW), protectedJob = s.jobs.find(j => j.id === 'demo-job-3')!;
    expect(result.jobs.find(j => j.id === protectedJob.id)!.queuePosition).toBe(protectedJob.queuePosition);
    expect(orderedQueue(result)[0].id).toBe('demo-job-6');
    expect(result.jobs.find(j => j.status === 'printing')!.id).toBe('demo-job-1');
    const comparison = preview(s,result); expect(comparison.afterAverageWait!).toBeLessThanOrEqual(comparison.beforeAverageWait!);
    expect(comparison.savedMinutes).toBeCloseTo((comparison.beforeAverageWait! - comparison.afterAverageWait!) * orderedQueue(s).length);
  });
  it('has deterministic tie breaking and handles an already optimized queue', () => {
    const once = optimize(createDemoSnapshot(NOW),NOW), twice = optimize(once,NOW);
    expect(orderedQueue(twice).map(j => j.id)).toEqual(orderedQueue(once).map(j => j.id)); expect(preview(once,twice).savedMinutes).toBeCloseTo(0);
  });
  it('does not allow manual movement through an urgent block or duplicate IDs', () => {
    const s = createDemoSnapshot(NOW), ids = orderedQueue(s).map(j => j.id);
    expect(() => setOrder(s,[...ids].reverse())).toThrow(/urgent/);
    expect(() => setOrder(s,ids.map(() => ids[0]))).toThrow(/exactly once/);
  });
  it('urgent preview is pure and preserves earlier urgent relative order', () => {
    const before = createDemoSnapshot(NOW), original = structuredClone(before), result = simulate(before,{kind:'urgent',jobId:'demo-job-7'},NOW);
    expect(before).toEqual(original); expect(orderedQueue(result.after).slice(0,2).map(j => j.id)).toEqual(['demo-job-6','demo-job-7']);
    const target = result.rows.find(r => r.id === 'demo-job-7')!; expect(target.delayMinutes!).toBeLessThan(0); expect(result.delayedJobs).toBeGreaterThan(0);
    expect(target.delayMinutes).toBeCloseTo(target.afterWait! - target.beforeWait!);
  });
  it('supports all what-if inputs without changing the real source', () => {
    const s = createDemoSnapshot(NOW), original = structuredClone(s);
    expect(simulate(s,{kind:'quantity',jobId:'demo-job-4',copies:4},NOW).after.jobs.find(j => j.id === 'demo-job-4')!.copies).toBe(4);
    expect(simulate(s,{kind:'colour',jobId:'demo-job-4',colorMode:'colour'},NOW).after.jobs.find(j => j.id === 'demo-job-4')!.estimatedDurationMinutes).toBeCloseTo(3.4);
    expect(simulate(s,{kind:'move',jobId:'demo-job-7',position:2},NOW).after.jobs.find(j => j.id === 'demo-job-7')!.queuePosition).toBe(2);
    const hypothetical = simulate(s,{kind:'add',pageCount:3,copies:2,colorMode:'bw',duplex:true},NOW);
    expect(hypothetical.after.jobs.find(j => j.hypothetical)).toBeDefined(); expect(hypothetical.applicable).toBe(false);
    expect(() => simulate(s,{kind:'quantity',jobId:'demo-job-4',copies:Infinity},NOW)).toThrow(); expect(s).toEqual(original);
  });
  it('keeps unknown or overdue downtime unknown and never creates fake pickup times', () => {
    const s = createDemoSnapshot(NOW), result = simulate(s,{kind:'downtime',minutes:null},NOW);
    expect(orderedQueue(result.after).every(j => j.estimatedWaitMinutes === null && j.estimatedPickupAt === null && j.pickupWindowEnd === null)).toBe(true);
    expect(result.afterAverageWait).toBeNull(); expect(result.savedMinutes).toBeNull();
    const known = simulate(s,{kind:'downtime',minutes:10},NOW).after;
    expect(orderedQueue(known)[0].estimatedWaitMinutes).toBeCloseTo(14.6);
    expect(orderedQueue(calculateSnapshot(known,NOW + 11 * 60000))[0].estimatedWaitMinutes).toBeNull();
  });
  it('freezes active remaining work during a pause and resumes without losing paused time', () => {
    const paused = calculateSnapshot(createDemoSnapshot(NOW),NOW + 60000); changePrinter(paused,'paused',null,NOW + 60000);
    const later = calculateSnapshot(paused,NOW + 31 * 60000); expect(later.jobs[0].remainingMinutes).toBeCloseTo(3.6);
    changePrinter(later,'operational',null,NOW + 31 * 60000);
    const running = calculateSnapshot(later,NOW + 32 * 60000); expect(running.jobs[0].remainingMinutes).toBeCloseTo(2.6);
    expect(running.jobs[0].printingStartedAt).toBe(paused.jobs[0].printingStartedAt);
    expect(running.printer.recordedDowntimeMinutes).toBeCloseTo(30);
    expect(calculateSnapshot(running,NOW + 100 * 60000).jobs[0].status).toBe('printing');
  });
});

describe('local transactional service', () => {
  it('persists real state and generated PDF blobs across instances', async () => {
    const first = service(), seed = await first.initialize();
    const added = await first.addDemoJob({documentName:'<script>fictional plain text</script>',pageCount:2,copies:1,colorMode:'bw',duplex:true,file:new File([createSampleDocument().blob],'fictional.pdf',{type:'application/pdf'})});
    const second = service(), reloaded = await second.initialize(); expect(reloaded.revision).toBe(added.revision); expect(reloaded.jobs).toHaveLength(seed.jobs.length + 1);
    const attached = reloaded.jobs.at(-1)!; expect(attached.documentName).toContain('<script>');
    const document = await second.getDocument(attached.documentId!); expect(await document.blob.text()).toContain('%PDF-1.4'); expect(document.blob.size).toBe(attached.fileSize);
  });
  it('initialize returns the latest state after mutations while sharing bootstrap work', async () => {
    const s = service();
    const [first, concurrent] = await Promise.all([s.initialize(),s.initialize()]);
    expect(concurrent.revision).toBe(first.revision); expect(concurrent.jobs).toHaveLength(first.jobs.length);
    const ready = await s.updateJobStatus('demo-job-1','ready',first.revision);
    const afterStatus = await s.initialize();
    expect(afterStatus.revision).toBe(ready.revision); expect(afterStatus.jobs.find(j => j.id === 'demo-job-1')!.status).toBe('ready');
    const added = await s.addDemoJob({documentName:'<script>safe fictional title</script>',pageCount:1,copies:1,colorMode:'bw',duplex:false});
    const afterAddition = await s.initialize();
    expect(afterAddition.revision).toBe(added.revision); expect(afterAddition.jobs.at(-1)!.documentName).toBe('<script>safe fictional title</script>');
    const other = service(); const latest = await other.initialize();
    const updated = await other.updateSettings({...latest.settings,bwPrice:3},latest.revision);
    expect((await s.initialize()).revision).toBe(updated.revision);
    expect((await s.initialize()).settings.bwPrice).toBe(3);
  });
  it('commits only one competing CAS writer', async () => {
    const a = service(), b = service(), snapshot = await a.initialize(); await b.initialize();
    const results = await Promise.allSettled([a.markJobUrgent('demo-job-4',snapshot.revision),b.markJobUrgent('demo-job-5',snapshot.revision)]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1); expect(results.filter(r => r.status === 'rejected')).toHaveLength(1);
    expect((await a.getQueueSnapshot()).revision).toBe(snapshot.revision + 1);
  });
  it('invalidates stale optimization, urgency and simulator previews', async () => {
    const s = service(); await s.initialize();
    const urgent = await s.getUrgentImpactPreview('demo-job-4'), simulation = await s.getSimulationResult({kind:'quantity',jobId:'demo-job-4',copies:3}), optimization = await s.getOptimizationPreview();
    await s.updatePrinterStatus('paused',10,urgent.revision);
    await expect(s.markJobUrgent('demo-job-4',urgent.revision)).rejects.toThrow(/changed/);
    await expect(s.applySimulation({kind:'quantity',jobId:'demo-job-4',copies:3},simulation.revision)).rejects.toThrow(/changed/);
    await expect(s.applyOptimizedQueue(optimization.revision)).rejects.toThrow(/changed/);
  });
  it('enforces the lifecycle, printer capacity and verified collection', async () => {
    const s = service(); let state = await s.initialize();
    await expect(s.updateJobStatus('demo-job-4','collected',state.revision)).rejects.toThrow(/transition/);
    await expect(s.updateJobStatus('demo-job-6','printing',state.revision)).rejects.toThrow(/already printing/);
    state = await s.updateJobStatus('demo-job-1','ready',state.revision); expect(state.jobs[0].readyAt).toBe(new Date(NOW).toISOString());
    state = await s.updatePrinterStatus('maintenance',null,state.revision);
    await expect(s.updateJobStatus('demo-job-6','printing',state.revision)).rejects.toThrow(/Resume/);
    state = await s.updatePrinterStatus('operational',null,state.revision);
    state = await s.updateJobStatus('demo-job-6','printing',state.revision); expect(state.jobs.find(j => j.id === 'demo-job-6')!.printingStartedAt).toBe(new Date(NOW).toISOString());
    await expect(s.markCollected('demo-job-8',state.revision)).rejects.toThrow(/Verify/);
    const matched = await s.verifyPickupToken('printq:v1:PQ-2026-1008'); expect(matched.status).toBe('ready');
    state = await s.markCollected(matched.id,state.revision); expect(state.jobs.find(j => j.id === matched.id)!.collectedAt).toBe(new Date(NOW).toISOString());
    await expect(s.markCollected(matched.id,state.revision)).rejects.toThrow(/transition/);
  });
  it('validates tokens and rejects incorrect payload versions and unknown IDs', async () => {
    const s = service(); await s.initialize(); expect((await s.verifyPickupToken(' PQ-2026-1008 ')).id).toBe('demo-job-8');
    for (const token of ['printq:v2:PQ-2026-1008','https://bad.invalid/PQ-2026-1008','PQ-2026-9999','printq:v1:PQ-2026-1008:extra']) await expect(s.verifyPickupToken(token)).rejects.toThrow();
    await expect(s.getJobById('../unsafe')).rejects.toThrow(/identifier/); await expect(s.getDocument('missing-file')).rejects.toThrow(/no file/);
  });
  it('approval moves only the requested queued job; rejection leaves order unchanged', async () => {
    const s = service(); let state = await s.initialize(), ids = orderedQueue(state).map(j => j.id);
    state = await s.rejectUrgentRequest('demo-job-7',state.revision); expect(orderedQueue(state).map(j => j.id)).toEqual(ids);
    state = await s.requestDemoUrgency('demo-job-4',state.revision);
    await expect(s.requestDemoUrgency('demo-job-4',state.revision)).rejects.toThrow(/previous request/);
    state = await s.approveUrgentRequest('demo-job-4',state.revision); ids = orderedQueue(state).map(j => j.id); expect(ids.slice(0,2)).toEqual(['demo-job-6','demo-job-4']);
    await expect(s.markJobUrgent('demo-job-4',state.revision)).rejects.toThrow(/normal queued/);
  });
  it('never loses or duplicates jobs during reorder and reload', async () => {
    const s = service(), initial = await s.initialize(), ids = orderedQueue(initial).map(j => j.id); [ids[1],ids[2]] = [ids[2],ids[1]];
    const updated = await s.reorderQueue(ids,initial.revision); expect(updated.jobs).toHaveLength(initial.jobs.length);
    expect(orderedQueue(await service().initialize()).map(j => j.id)).toEqual(ids);
    await expect(s.reorderQueue(ids.slice(1),updated.revision)).rejects.toThrow(/exactly once/);
  });
  it('notifies subscribers after a committed write and supports unsubscribe', async () => {
    const s = service(); let state = await s.initialize(); const callback = vi.fn(), unsubscribe = s.subscribeToJobUpdates(callback);
    state = await s.updateSettings({...state.settings,bwPrice:3},state.revision); expect(callback).toHaveBeenCalledTimes(1);
    unsubscribe(); await s.updateSettings({...state.settings,bwPrice:4},state.revision); expect(callback).toHaveBeenCalledTimes(1);
  });
  it('detects another instance through polling when BroadcastChannel and storage events are absent', async () => {
    vi.useFakeTimers({toFake:['setInterval','clearInterval']});
    const a = service(), b = service(); await a.initialize(); const initial = await b.initialize();
    const notified = Promise.withResolvers<void>(), callback = vi.fn(() => notified.resolve()), unsubscribe = a.subscribeToJobUpdates(callback);
    await b.updateSettings({...initial.settings,colourPrice:11},initial.revision);
    await vi.advanceTimersByTimeAsync(3000); await notified.promise;
    expect(callback).toHaveBeenCalledTimes(1); expect((await a.getQueueSnapshot()).revision).toBe(initial.revision + 1); unsubscribe();
  });
  it('calculates analytics from stored records and completed paper consumption', async () => {
    const s = service(), state = await s.initialize(), analytics = await s.getAnalytics(), completed = state.jobs.filter(j => j.status === 'ready' || j.status === 'collected');
    expect(analytics.submitted).toBe(state.jobs.length); expect(analytics.completed).toBe(completed.length);
    expect(analytics.sheetsUsed).toBe(completed.reduce((sum,j) => sum + sheets(j),0)); expect(analytics.sheetsSaved).toBe(completed.reduce((sum,j) => sum + j.pageCount * j.copies - sheets(j),0));
    expect(analytics.estimatedValue).toBe(state.jobs.reduce((sum,j) => sum + j.estimatedCost,0)); expect(analytics.byDay.reduce((sum,d) => sum + d.jobs,0)).toBe(state.jobs.length);
    expect(analytics.byMode.reduce((sum,d) => sum + d.value,0)).toBe(state.jobs.length);
  });
  it('applies valid simulations but rejects hypothetical writes', async () => {
    const s = service(); let state = await s.initialize();
    state = await s.applySimulation({kind:'quantity',jobId:'demo-job-4',copies:3},state.revision); expect(state.jobs.find(j => j.id === 'demo-job-4')!.copies).toBe(3);
    await expect(s.applySimulation({kind:'add',pageCount:2,copies:1,colorMode:'bw',duplex:false},state.revision)).rejects.toThrow(/Hypothetical/);
    expect((await s.getJobs()).some(j => j.hypothetical)).toBe(false);
  });
  it('rejects integrated demo reset, job creation and request injection', async () => {
    const s = service(); const state = await s.initialize(); await replaceStored({...state,mode:'integrated'});
    await expect(s.resetDemo(state.revision)).rejects.toThrow(/integrated/);
    await expect(s.addDemoJob({documentName:'Fictional',pageCount:1,copies:1,colorMode:'bw',duplex:false})).rejects.toThrow(/integrated/);
    await expect(s.requestDemoUrgency('demo-job-4',state.revision)).rejects.toThrow(/integrated/);
  });
  it('reset is revisioned and recreates only fictional seed data and PDF', async () => {
    const s = service(); await s.initialize(); const added = await s.addDemoJob({documentName:'Temporary fictional job',pageCount:1,copies:1,colorMode:'bw',duplex:false});
    const reset = await s.resetDemo(added.revision); expect(reset.revision).toBe(added.revision + 1); expect(reset.jobs).toHaveLength(10); expect((await s.getDocument('sample-document')).blob.size).toBeGreaterThan(100);
  });
  it('rejects malformed persisted records without silently replacing them', async () => {
    const s = service(), initial = await s.initialize(); const malformed = structuredClone(initial); malformed.jobs[1].estimatedCost = NaN; await replaceStored(malformed);
    await expect(service().initialize()).rejects.toThrow(); await expect(s.getQueueSnapshot()).rejects.toThrow();
  });
});

describe('boundary validation and signatures', () => {
  it('validates all derived fields, positions, lifecycle and printer capacity', () => {
    const original = createDemoSnapshot(NOW);
    const changes: ((s: Snapshot) => void)[] = [s => { s.jobs[1].estimatedDurationMinutes = 123; },s => { s.jobs[1].estimatedWaitMinutes = Infinity; },s => { s.jobs[1].queuePosition = 1; },s => { s.jobs[1].fileSize = -1; },s => { s.mode = 'unknown' as Snapshot['mode']; },s => { s.jobs[0].remainingMinutes = NaN; },s => { s.jobs[1] = {...s.jobs[0],id:'another-job',token:'PQ-2026-9998'}; }];
    for (const change of changes) { const s = structuredClone(original); change(s); expect(() => validateSnapshot(s)).toThrow(); }
  });
  it('accepts locally generated PDFs and rejects renamed HTML, mismatches and malformed content', async () => {
    const sample = createSampleDocument(); await expect(validateDocument(sample.blob,sample.name,sample.mimeType)).resolves.toBe('application/pdf');
    await expect(validateDocument(new Blob(['<html>not a PDF</html>'],{type:'application/pdf'}),'renamed.pdf')).rejects.toThrow(/content/);
    await expect(validateDocument(sample.blob,'unsafe.html')).rejects.toThrow(/Unsupported/);
    await expect(validateDocument(new Blob(['%PDF-1.4 no ending'],{type:'application/pdf'}),'broken.pdf')).rejects.toThrow(/malformed/);
    await expect(validateDocument(new Blob([],{type:'application/pdf'}),'empty.pdf')).rejects.toThrow();
    await expect(validateDocument(sample.blob,'sample.pdf','image/png')).rejects.toThrow(/mismatch/);
  });
  it('checks PNG, JPEG, legacy DOC and DOCX signatures and rejects generic ZIPs', async () => {
    await expect(validateDocument(new Blob([new Uint8Array([137,80,78,71,13,10,26,10])]),'image.png','')).resolves.toBe('image/png');
    await expect(validateDocument(new Blob([new Uint8Array([255,216,255])]),'image.jpg','')).resolves.toBe('image/jpeg');
    await expect(validateDocument(new Blob([new Uint8Array([208,207,17,224,161,177,26,225])]),'sample.doc','')).resolves.toBe('application/msword');
    await expect(validateDocument(new Blob(['PK\u0003\u0004[Content_Types].xml word/document.xml']),'sample.docx','')).resolves.toContain('wordprocessingml');
    await expect(validateDocument(new Blob(['PK\u0003\u0004unrelated files']),'sample.docx','')).rejects.toThrow(/content/);
  });
  it('does not use localStorage preferences as queue authority', async () => {
    vi.stubGlobal('localStorage',{ getItem: () => '{corrupted', setItem: () => { throw new Error('Storage disabled'); } });
    const s = service(), state = await s.initialize(); await expect(s.updateSettings(state.settings,state.revision)).resolves.toHaveProperty('revision',state.revision + 1);
  });
});
