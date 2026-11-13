// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { createDemoWorkspace, createCloudWorkspace, type WorkspaceHandle } from '../index';
import type { ServiceEvent } from '../../../features/student/contracts/service';
import type { JobInput } from '../../../features/student/contracts/jobs';
import type { StudentObservation } from '../../printq/workspace';
import type { Snapshot } from '../../../features/shopkeeper/types';
import { createDemoSnapshot } from '../../../features/shopkeeper/services/demo';

const NOW = new Date(2026, 10, 13, 10, 0, 0).getTime();
const handles: WorkspaceHandle[] = [];

function createSamplePdfFile(name = 'notes.pdf'): File {
  const bytes = new TextEncoder().encode('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n');
  return new File([bytes], name, { type: 'application/pdf' });
}

function makeJobInput(overrides: Partial<JobInput> = {}): JobInput {
  return {
    clientRequestId: '11111111-1111-4111-8111-111111111111',
    documentName: 'Algorithms Notes',
    pageCount: 10,
    pageCountSource: 'manual',
    copies: 2,
    colorMode: 'bw',
    duplex: true,
    paperSize: 'A4',
    instructions: 'Staple top left',
    ...overrides,
  };
}

class MockEventSource {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 2;
  static instances: MockEventSource[] = [];

  readonly url: string;
  readonly withCredentials: boolean;
  readyState = MockEventSource.OPEN;
  onerror: ((event: Event) => void) | null = null;
  private listeners = new Map<string, Set<(event: Event) => void>>();

  constructor(url: string, init?: EventSourceInit) {
    this.url = url;
    this.withCredentials = Boolean(init?.withCredentials);
    MockEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: (event: Event) => void): void {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(listener);
  }

  removeEventListener(type: string, listener: (event: Event) => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  emit(type: string, data: unknown): void {
    const event = { data: JSON.stringify(data) } as MessageEvent<string>;
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }

  triggerError(closed = false): void {
    if (closed) {
      this.readyState = MockEventSource.CLOSED;
    }
    this.onerror?.(new Event('error'));
  }

  close(): void {
    this.readyState = MockEventSource.CLOSED;
  }
}

beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('BroadcastChannel', undefined);
  vi.spyOn(Date, 'now').mockReturnValue(NOW);
});

afterEach(() => {
  while (handles.length > 0) {
    handles.pop()!.dispose();
  }
  MockEventSource.instances = [];
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('DemoWorkspace integrated lifecycle', () => {
  it('shares name-only and file-backed jobs with Shopkeeper including ID, token, and blob', async () => {
    const ws = createDemoWorkspace();
    handles.push(ws);

    const nameOnly = await ws.studentService.createJob(
      makeJobInput({
        clientRequestId: '11111111-1111-4111-8111-111111111111',
        documentName: 'Name Only Sheet',
      }),
    );
    expect(nameOnly.documentId).toBeNull();

    const pdf = createSamplePdfFile('assignment.pdf');
    const fileBacked = await ws.studentService.createJob(
      makeJobInput({
        clientRequestId: '22222222-2222-4222-8222-222222222222',
        documentName: 'Lab Report',
      }),
      pdf,
    );
    expect(fileBacked.documentId).toBeTruthy();

    const shopJobs = await ws.shopkeeperService.getJobs();
    const shopNameOnly = shopJobs.find((j) => j.id === nameOnly.id);
    const shopFileBacked = shopJobs.find((j) => j.id === fileBacked.id);

    expect(shopNameOnly).toBeDefined();
    expect(shopNameOnly?.token).toBe(nameOnly.token);
    expect(shopFileBacked).toBeDefined();
    expect(shopFileBacked?.token).toBe(fileBacked.token);
    expect(shopFileBacked?.documentId).toBe(fileBacked.documentId);

    const storedDoc = await ws.shopkeeperService.getDocument(fileBacked.documentId!);
    expect(storedDoc.name).toBe('assignment.pdf');
    expect(storedDoc.mimeType).toBe('application/pdf');
    expect(storedDoc.blob.size).toBe(pdf.size);

    const studentBlob = await ws.studentService.getDocument(fileBacked.documentId!);
    expect(studentBlob?.size).toBe(pdf.size);
  });

  it('keeps urgency pending without reordering until Shopkeeper approves', async () => {
    const ws = createDemoWorkspace();
    handles.push(ws);

    const created = await ws.studentService.createJob(
      makeJobInput({
        clientRequestId: '33333333-3333-4333-8333-333333333333',
        documentName: 'Urgent Candidate',
      }),
    );

    const beforeQueue = await ws.shopkeeperService.getQueueSnapshot();
    const beforePos = beforeQueue.jobs.find((j) => j.id === created.id)?.queuePosition;

    const requested = await ws.studentService.requestUrgent(created.id);
    expect(requested.urgentRequestStatus).toBe('pending');
    expect(requested.priority).toBe('normal');
    expect(requested.queuePosition).toBe(beforePos);

    const pendingSnap = await ws.shopkeeperService.getQueueSnapshot();
    expect(pendingSnap.jobs.find((j) => j.id === created.id)?.queuePosition).toBe(beforePos);

    const approvedSnap = await ws.shopkeeperService.approveUrgentRequest(
      created.id,
      pendingSnap.revision,
    );
    const approvedJob = approvedSnap.jobs.find((j) => j.id === created.id);
    expect(approvedJob?.priority).toBe('urgent');
    expect(approvedJob?.urgentRequestStatus).toBe('approved');
    expect(approvedJob?.queuePosition).toBeLessThan(beforePos!);
  });

  it('completes status -> pickup verify -> collect roundtrip', async () => {
    const ws = createDemoWorkspace();
    handles.push(ws);

    const created = await ws.studentService.createJob(
      makeJobInput({
        clientRequestId: '44444444-4444-4444-8444-444444444444',
        documentName: 'Roundtrip Job',
      }),
    );

    let snap = await ws.shopkeeperService.getQueueSnapshot();
    const queuedIds = snap.jobs
      .filter((j) => j.status === 'queued')
      .sort((a, b) => a.queuePosition! - b.queuePosition!)
      .map((j) => j.id);
    const urgentIds = queuedIds.filter((id) => {
      const j = snap.jobs.find((x) => x.id === id);
      return j?.priority === 'urgent';
    });
    const normalIds = queuedIds.filter((id) => id !== created.id && !urgentIds.includes(id));

    // Finish active printing job first so our new job can start printing
    const active = snap.jobs.find((j) => j.status === 'printing');
    if (active) {
      snap = await ws.shopkeeperService.updateJobStatus(active.id, 'ready', snap.revision);
    }
    // Promote created job to front of normal jobs (or mark urgent) so it's first in queue
    if (urgentIds.length === 0) {
      snap = await ws.shopkeeperService.reorderQueue([created.id, ...normalIds], snap.revision);
    } else {
      snap = await ws.shopkeeperService.markJobUrgent(created.id, snap.revision);
      const updatedQueued = snap.jobs
        .filter((j) => j.status === 'queued')
        .sort((a, b) => a.queuePosition! - b.queuePosition!)
        .map((j) => j.id);
      const rest = updatedQueued.filter((id) => id !== created.id);
      snap = await ws.shopkeeperService.reorderQueue([created.id, ...rest], snap.revision);
    }

    snap = await ws.shopkeeperService.updateJobStatus(created.id, 'printing', snap.revision);
    snap = await ws.shopkeeperService.updateJobStatus(created.id, 'ready', snap.revision);

    const payload = ws.qrCodec.encode(created.token);
    const verified = await ws.shopkeeperService.verifyPickupToken(payload);
    expect(verified.id).toBe(created.id);

    snap = await ws.shopkeeperService.markCollected(created.id, snap.revision);
    const collected = await ws.studentService.getJobById(created.id);
    expect(collected?.status).toBe('collected');
  });

  it('preserves null estimates on unknown downtime and rejects stale revisions', async () => {
    const ws = createDemoWorkspace();
    handles.push(ws);

    const snap = await ws.shopkeeperService.getQueueSnapshot();
    const updated = await ws.shopkeeperService.updatePrinterStatus('maintenance', null, snap.revision);
    expect(updated.printer.state).toBe('maintenance');
    expect(updated.printer.downtimeMinutes).toBeNull();

    const studentQueue = await ws.studentService.getQueueSnapshot();
    expect(studentQueue.printer.downtime).toEqual({ kind: 'unknown' });

    const quote = await ws.studentService.getQuote({
      pageCount: 5,
      copies: 1,
      colorMode: 'bw',
      duplex: true,
      paperSize: 'A4',
    });
    expect(quote.estimatedWaitMinutes).toBeNull();
    expect(quote.estimatedPickupAt).toBeNull();

    await expect(
      ws.shopkeeperService.updatePrinterStatus('operational', null, snap.revision),
    ).rejects.toThrow(/Queue changed/);
  });

  it('enforces clientRequestId idempotency and blocks stale expectedLocalGeneration after reset', async () => {
    const ws = createDemoWorkspace();
    handles.push(ws);

    const queueBefore = await ws.studentService.getQueueSnapshot();
    const gen1 = queueBefore.localGeneration!;
    expect(gen1).toBe(1);

    const reqId = '55555555-5555-4555-8555-555555555555';
    const first = await ws.studentService.createJob(
      makeJobInput({
        clientRequestId: reqId,
        documentName: 'Idempotent Doc',
        expectedLocalGeneration: gen1,
      }),
    );
    const duplicate = await ws.studentService.createJob(
      makeJobInput({
        clientRequestId: reqId,
        documentName: 'Idempotent Doc',
        expectedLocalGeneration: gen1,
      }),
    );
    expect(duplicate.id).toBe(first.id);

    await expect(
      ws.studentService.createJob(
        makeJobInput({
          clientRequestId: reqId,
          documentName: 'Different Intent Doc',
          expectedLocalGeneration: gen1,
        }),
      ),
    ).rejects.toThrow(/requestConflict/);

    await ws.demoController!.resetDemo();
    const queueAfter = await ws.studentService.getQueueSnapshot();
    expect(queueAfter.localGeneration).toBe(2);

    await expect(
      ws.studentService.createJob(
        makeJobInput({
          clientRequestId: '66666666-6666-4666-8666-666666666666',
          expectedLocalGeneration: gen1,
        }),
      ),
    ).rejects.toThrow(/datasetReplaced/);
  });
});

describe('CloudWorkspace SSE epoch and stale connection guard', () => {
  it('validates SSE epoch, marks cached data stale on disconnect, and blocks mutations offline', async () => {
    vi.stubGlobal('EventSource', MockEventSource);
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const ws = createCloudWorkspace();
    handles.push(ws);

    expect(MockEventSource.instances).toHaveLength(1);
    const es = MockEventSource.instances[0]!;

    const studentEvents: ServiceEvent[] = [];
    ws.studentService.subscribeToJobUpdates((event) => {
      studentEvents.push(event);
    });

    const shopSnapshot = createDemoSnapshot(NOW);
    shopSnapshot.mode = 'integrated';
    shopSnapshot.revision = 5;

    const studentObs: StudentObservation = {
      jobs: [],
      queue: {
        revision: '5',
        observedAt: new Date(NOW).toISOString(),
        lastSyncedAt: new Date(NOW).toISOString(),
        source: 'shared',
        stale: false,
        entries: [],
        printer: {
          state: 'operational',
          changedAt: new Date(NOW).toISOString(),
          reason: null,
          downtime: null,
        },
        pickup: {
          bufferMinutes: 15,
          hours: {
            timeZone: 'Asia/Kolkata',
            validFrom: new Date(NOW).toISOString(),
            validUntil: new Date(NOW + 3600000).toISOString(),
            intervals: [],
          },
        },
        policy: 'Server shop hours (Asia/Kolkata) govern estimates.',
        localGeneration: null,
      },
    };

    es.emit('connection-state', { status: 'connected', epoch: 'epoch-1' });
    expect(ws.getConnection()).toEqual({ state: 'connected', mode: 'shared' });

    // Mismatched epoch is ignored
    const wrongSnap: Snapshot = { ...shopSnapshot, revision: 99 };
    es.emit('snapshot-changed', {
      epoch: 'epoch-old',
      revision: 99,
      observedAt: new Date(NOW).toISOString(),
      student: { ...studentObs, queue: { ...studentObs.queue, revision: '99' } },
      shopkeeper: wrongSnap,
    });
    expect(studentEvents.some((e) => e.type === 'snapshot-changed' && e.queue.revision === '99')).toBe(false);

    // Matching epoch updates both student and shopkeeper state
    es.emit('snapshot-changed', {
      epoch: 'epoch-1',
      revision: 5,
      observedAt: new Date(NOW).toISOString(),
      student: studentObs,
      shopkeeper: shopSnapshot,
    });
    const latestQueue = await ws.studentService.getQueueSnapshot();
    expect(latestQueue.revision).toBe('5');
    expect(latestQueue.stale).toBe(false);

    // Disconnect marks state disconnected and retains cached snapshot as stale
    es.triggerError(false);
    expect(ws.getConnection()).toEqual({ state: 'disconnected', mode: 'shared' });
    const staleEvents = studentEvents.filter(
      (e): e is Extract<ServiceEvent, { type: 'snapshot-changed' }> =>
        e.type === 'snapshot-changed' && e.queue.stale,
    );
    expect(staleEvents.length).toBeGreaterThan(0);

    // Shopkeeper mutations are guarded while offline/stale
    await expect(
      ws.shopkeeperService.updatePrinterStatus('paused', null, 5),
    ).rejects.toThrow(/Workspace connection is offline or stale/);

    // Demo actions are always disabled in cloud mode
    await expect(
      ws.shopkeeperService.addDemoJob({
        documentName: 'Test',
        pageCount: 1,
        copies: 1,
        colorMode: 'bw',
        duplex: false,
      }),
    ).rejects.toThrow('Demo actions are disabled in cloud mode.');
    await expect(ws.shopkeeperService.requestDemoUrgency('id', 1)).rejects.toThrow(
      'Demo actions are disabled in cloud mode.',
    );
    await expect(ws.shopkeeperService.resetDemo(1)).rejects.toThrow(
      'Demo actions are disabled in cloud mode.',
    );
  });
});
