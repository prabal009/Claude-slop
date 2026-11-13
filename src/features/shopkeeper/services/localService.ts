import type { Job, ShopkeeperService, Snapshot, StoredDocument } from '../types';
import { calculateSnapshot, changePrinter, optimize, orderedQueue, preview, promoteUrgent, setOrder, simulate } from './engine';
import { calculateAnalytics, requestUrgency, transitionJob } from '../../../shared/printq/mutations';
import { decodePickupPayload, MAX_PICKUP_INPUT_LENGTH } from '../../../shared/printq/pickupCodec';
import { MAX_PAGE_COUNT } from '../../../shared/printq/policy';
import { createDemoSnapshot, createSampleDocument } from './demo';
import { DATABASE_NAME, SNAPSHOT_KEY, identifier, numeric, requireThat, text, validateDocument, validateSettings, validateSnapshot, validateStoredDocument } from './validation';

const CHANNEL = 'printq-shopkeeper-updates-v1';
function newId(): string {
  // getRandomValues also works on HTTP LAN origins, unlike randomUUID.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
  const hex = [...bytes].map(value => value.toString(16).padStart(2,'0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
export function createLocalService(): ShopkeeperService {
  let database: IDBDatabase | null = null, opening: Promise<IDBDatabase> | null = null, initializing: Promise<void> | null = null, disposed = false;
  const callbacks = new Set<() => void>(), verified = new Map<string, number>();
  let channel: BroadcastChannel | null = null, stopPolling: (() => void) | undefined, seenRevision = -1;
  try { if (typeof BroadcastChannel !== 'undefined') channel = new BroadcastChannel(CHANNEL); } catch { /* Storage events and revision polling remain available. */ }
  const notify = () => { for (const callback of callbacks) { try { callback(); } catch (error) { console.error('PrintQ update subscriber failed.', error); } } };
  if (channel) channel.onmessage = () => notify();
  const storageListener = (event: StorageEvent) => { if (event.key === CHANNEL) notify(); };
  const focusListener = () => notify();
  if (typeof window !== 'undefined') { window.addEventListener('storage', storageListener); window.addEventListener('focus', focusListener); }
  function publish(revision: number): void {
    seenRevision = revision; notify();
    try { channel?.postMessage({ revision }); } catch { /* Fall back to storage events. */ }
    try { if (typeof localStorage !== 'undefined') localStorage.setItem(CHANNEL, JSON.stringify({ revision, nonce: newId() })); } catch { /* Revision polling supports restricted storage environments. */ }
  }
  function open(): Promise<IDBDatabase> {
    requireThat(!disposed, 'This service has been disposed.');
    if (database) return Promise.resolve(database);
    if (opening) return opening;
    const { promise, resolve, reject } = Promise.withResolvers<IDBDatabase>();
    opening = promise;
    if (typeof indexedDB === 'undefined') { reject(new Error('IndexedDB is unavailable. Enable browser storage to use PrintQ.')); return promise; }
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('state')) db.createObjectStore('state');
      if (!db.objectStoreNames.contains('documents')) db.createObjectStore('documents', { keyPath: 'id' });
    };
    request.onerror = () => reject(new Error(`Could not open local storage: ${request.error?.message ?? 'permission denied'}`));
    request.onblocked = () => reject(new Error('Local database upgrade is blocked. Close other PrintQ tabs and reload.'));
    request.onsuccess = () => {
      if (disposed) { request.result.close(); reject(new Error('This service has been disposed.')); return; }
      database = request.result; database.onversionchange = () => { database?.close(); database = null; opening = null; notify(); }; resolve(database);
    };
    return opening;
  }
  async function rawSnapshot(): Promise<Snapshot> {
    const db = await open();
    const { promise, resolve, reject } = Promise.withResolvers<Snapshot>();
    const tx = db.transaction('state', 'readonly'), request = tx.objectStore('state').get(SNAPSHOT_KEY);
    request.onsuccess = () => { try { validateSnapshot(request.result); resolve(request.result); } catch (error) { reject(error); } };
    request.onerror = () => reject(request.error); tx.onabort = () => reject(tx.error ?? new Error('Local read failed.'));
    return promise;
  }
  async function readDocument(id: string): Promise<StoredDocument> {
    identifier(id); const db = await open();
    const { promise, resolve, reject } = Promise.withResolvers<unknown>();
    const request = db.transaction('documents', 'readonly').objectStore('documents').get(id);
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    const value = await promise;
    requireThat(value, 'Document information available — no file attached, or local file was removed.');
    return validateStoredDocument(value);
  }
  async function bootstrap(): Promise<void> {
    if (initializing) return initializing;
    initializing = (async () => {
      const db = await open();
      const { promise, resolve, reject } = Promise.withResolvers<void>();
      const tx = db.transaction(['state','documents'], 'readwrite'), store = tx.objectStore('state'), request = store.get(SNAPSHOT_KEY);
      let failure: unknown;
      request.onsuccess = () => {
        try {
          if (request.result === undefined) { const seed = createDemoSnapshot(); store.put(seed, SNAPSHOT_KEY); tx.objectStore('documents').put(createSampleDocument()); }
          else validateSnapshot(request.result);
        } catch (error) { failure = error; tx.abort(); }
      };
      tx.oncomplete = () => resolve(); tx.onabort = () => reject(failure ?? tx.error ?? new Error('Local initialization failed.')); tx.onerror = () => { failure ??= tx.error; };
      await promise;
      const stored = await rawSnapshot();
      for (const id of new Set(stored.jobs.map(job => job.documentId).filter((id): id is string => id !== null))) {
        const document = await readDocument(id);
        for (const job of stored.jobs.filter(j => j.documentId === id)) requireThat(job.originalFileName === document.name && job.mimeType === document.mimeType && job.fileSize === document.blob.size, 'Stored document metadata does not match the job.');
      }
      seenRevision = stored.revision;
    })();
    try { return await initializing; } catch (error) { initializing = null; throw error; }
  }
  async function current(): Promise<Snapshot> { await bootstrap(); return calculateSnapshot(await rawSnapshot()); }
  async function mutate(revision: number, message: string, action: (snapshot: Snapshot, now: number, tx: IDBTransaction) => Snapshot | void, jobId: string | null = null): Promise<Snapshot> {
    numeric(revision, 0, Number.MAX_SAFE_INTEGER - 1, true); await bootstrap(); const db = await open();
    const { promise, resolve, reject } = Promise.withResolvers<Snapshot>();
    const tx = db.transaction(['state','documents'], 'readwrite'), store = tx.objectStore('state'), request = store.get(SNAPSHOT_KEY);
    let updated: Snapshot, failure: unknown;
    request.onsuccess = () => {
      try {
        validateSnapshot(request.result); requireThat(request.result.revision === revision, 'Queue changed in another tab. Recalculate the preview and try again.');
        const now = Date.now(), baseline = calculateSnapshot(request.result, now);
        let next = action(baseline, now, tx) ?? baseline;
        next.revision = revision + 1; next.activity.unshift({ id: newId(), at: new Date(now).toISOString(), message, jobId }); next.activity = next.activity.slice(0,200);
        next = calculateSnapshot(next, now); validateSnapshot(next); updated = next; store.put(next, SNAPSHOT_KEY);
      } catch (error) { failure = error; tx.abort(); }
    };
    tx.oncomplete = () => resolve(updated); tx.onabort = () => reject(failure ?? tx.error ?? new Error('Local update failed. Storage may be full.')); tx.onerror = () => { failure ??= tx.error; };
    const result = await promise;
    publish(result.revision); return structuredClone(result);
  }
  function find(snapshot: Snapshot, id: string): Job { identifier(id); const job = snapshot.jobs.find(j => j.id === id); requireThat(job, 'Job was not found.'); return job; }
  function demoOnly(snapshot: Snapshot): void { requireThat(snapshot.mode === 'demo', 'Demo actions are disabled in integrated mode.'); }
  const service: ShopkeeperService = {
    initialize: current,
    getJobs: async () => (await current()).jobs,
    getJobById: async id => find(await current(),id),
    getQueueSnapshot: current,
    getPrinterStatus: async () => (await current()).printer,
    getDocument: async id => { await bootstrap(); const document = await readDocument(id); const state = await rawSnapshot(); for (const job of state.jobs.filter(j => j.documentId === id)) requireThat(job.fileSize === document.blob.size && job.mimeType === document.mimeType && job.originalFileName === document.name, 'Stored document metadata does not match.'); return document; },
    updateJobStatus: (id,status,revision) => mutate(revision, `Job status changed to ${status}.`, (s,now) => transitionJob(s,id,status,now,verified.has(id) && now - verified.get(id)! <= 5 * 60000), id),
    reorderQueue: (ids,revision) => mutate(revision, 'Waiting queue reordered.', (s,now) => { requireThat(Array.isArray(ids), 'Invalid queue order.'); setOrder(s,ids,now); }),
    getUrgentRequests: async () => (await current()).jobs.filter(j => j.urgentRequestStatus === 'pending'),
    getUrgentImpactPreview: async id => { const state = await current(); return simulate(state,{ kind: 'urgent', jobId: id }); },
    approveUrgentRequest: (id,revision) => mutate(revision, 'Urgency request approved.', (s,now) => { requireThat(find(s,id).urgentRequestStatus === 'pending', 'This job has no pending urgency request.'); promoteUrgent(s,id,now); },id),
    rejectUrgentRequest: (id,revision) => mutate(revision, 'Urgency request rejected.', (s,now) => { const job = find(s,id); requireThat(job.status === 'queued' && job.urgentRequestStatus === 'pending', 'This job has no pending urgency request.'); job.urgentRequestStatus = 'rejected'; job.updatedAt = new Date(now).toISOString(); },id),
    markJobUrgent: (id,revision) => mutate(revision, 'Job marked urgent after confirmation.', (s,now) => promoteUrgent(s,id,now),id),
    getOptimizationPreview: async () => { const state = await current(), now = Date.now(); const before = calculateSnapshot(state,now), after = optimize(before,now); return preview(before,after,'Shortest processing time for eligible normal jobs. Normal jobs waiting at least 60 minutes keep their positions; existing urgent jobs retain their stable front block.'); },
    applyOptimizedQueue: revision => mutate(revision, 'Optimized queue applied after confirmation.', (s,now) => optimize(s,now)),
    getSimulationResult: async scenario => simulate(await current(),scenario),
    applySimulation: (scenario,revision) => mutate(revision, 'Confirmed simulation applied.', (s,now) => { const result = simulate(s,scenario,now); requireThat(result.applicable, 'Hypothetical jobs cannot be applied. Add a real demo job in Settings.'); return result.after; }),
    updatePrinterStatus: (state,downtime,revision) => mutate(revision, `Printer changed to ${state}.`, (s,now) => changePrinter(s,state,downtime,now)),
    verifyPickupToken: async input => {
      text(input, MAX_PICKUP_INPUT_LENGTH);
      const token = decodePickupPayload(input);
      requireThat(token !== null, 'Invalid pickup token or unsupported QR payload.');
      const state = await current(), job = state.jobs.find(j => j.token === token); requireThat(job, 'No job matches this pickup token.');
      if (job.status === 'ready') verified.set(job.id,Date.now()); return job;
    },
    markCollected: (id,revision) => mutate(revision, 'Verified order collected.', (s,now) => transitionJob(s,id,'collected',now,verified.has(id) && now - verified.get(id)! <= 5 * 60000),id),
    getAnalytics: async () => calculateAnalytics(await current(), Date.now()),
    updateSettings: (settings,revision) => mutate(revision, 'Shop pricing and operating hours updated.', s => { validateSettings(settings); s.settings = structuredClone(settings); }),
    addDemoJob: async input => {
      requireThat(!!input && typeof input === 'object', 'Invalid job input.'); text(input.documentName,160); numeric(input.pageCount,1,MAX_PAGE_COUNT,true); numeric(input.copies,1,100,true); requireThat(['bw','colour'].includes(input.colorMode) && typeof input.duplex === 'boolean', 'Invalid print preferences.');
      let document: StoredDocument | null = null;
      if (input.file) { requireThat(input.file instanceof Blob && typeof input.file.name === 'string', 'Invalid attached file.'); const mimeType = await validateDocument(input.file,input.file.name,input.file.type); document = { id: newId(), name: input.file.name, mimeType, blob: input.file.slice(0,input.file.size,mimeType) }; }
      const state = await current();
      return mutate(state.revision,'Fictional demo job added.',(s,now,tx) => {
        demoOnly(s); requireThat(s.jobs.length < 1000, 'The local queue is full.');
        const at = new Date(now).toISOString(), year = new Date(now).getFullYear(), prefix = `PQ-${year}-`;
        const usedTokens = new Set(s.jobs.map(j => j.token)); let number = 1001;
        while (usedTokens.has(prefix + number)) number++;
        const job: Job = { id:newId(), token:prefix + number, documentName:input.documentName.trim(), documentId:document?.id ?? null, originalFileName:document?.name ?? null, mimeType:document?.mimeType ?? null, fileSize:document?.blob.size ?? null,
          pageCount:input.pageCount,copies:input.copies,colorMode:input.colorMode,duplex:input.duplex,paperSize:'A4',instructions:'',status:'queued',priority:'normal',urgentRequestStatus:'none',urgentRequestedAt:null,queuePosition:orderedQueue(s).length + 1,
          estimatedCost:0,estimatedDurationMinutes:0,estimatedWaitMinutes:null,estimatedPickupAt:null,pickupWindowEnd:null,createdAt:at,updatedAt:at,printingStartedAt:null,readyAt:null,collectedAt:null,remainingMinutes:null };
        s.jobs.push(job); if (document) tx.objectStore('documents').put(document);
      });
    },
    requestDemoUrgency: (id,revision) => mutate(revision,'Demo urgency request received.',(s,now) => { demoOnly(s); requestUrgency(s,id,now); },id),
    resetDemo: revision => mutate(revision,'Fictional demo reset confirmed.',(s,now,tx) => { demoOnly(s); verified.clear(); tx.objectStore('documents').clear(); tx.objectStore('documents').put(createSampleDocument()); return createDemoSnapshot(now); }),
    subscribeToJobUpdates: callback => {
      requireThat(!disposed, 'This service has been disposed.'); callbacks.add(callback);
      if (!channel && !stopPolling) {
        const timer = setInterval(() => { void rawSnapshot().then(s => { if (s.revision !== seenRevision) { seenRevision = s.revision; notify(); } }).catch(() => notify()); },3000);
        stopPolling = () => clearInterval(timer);
      }
      return () => { callbacks.delete(callback); if (!callbacks.size) { stopPolling?.(); stopPolling = undefined; } };
    },
    dispose: () => { disposed = true; channel?.close(); channel = null; database?.close(); database = null; callbacks.clear(); verified.clear(); stopPolling?.(); stopPolling = undefined; if (typeof window !== 'undefined') { window.removeEventListener('storage',storageListener); window.removeEventListener('focus',focusListener); } },
  };
  return service;
}
