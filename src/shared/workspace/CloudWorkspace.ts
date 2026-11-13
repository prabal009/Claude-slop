import type {
  JobInput,
  PrintJob,
  PrintQuote,
  QuoteInput,
} from '../../features/student/contracts/jobs';
import type {
  ServiceEvent,
  StudentService,
} from '../../features/student/contracts/service';
import type {
  EstimateTarget,
  PickupWindowResult,
  PrinterSnapshot,
  QueueSnapshot,
  ShopInsights,
  UrgentImpact,
  WhatIfRequest,
  WhatIfResult,
} from '../../features/student/contracts/scheduling';
import {
  SharedServiceAdapter,
  type SharedStudentTransport,
} from '../../features/student/services/SharedServiceAdapter';
import {
  readBlobBytes,
  validateFile,
} from '../../features/student/documents/validation';
import { DomainError } from '../../features/student/utils/validation';
import type {
  Analytics,
  Job,
  JobStatus,
  Printer,
  PrinterState,
  QueuePreview,
  ShopSettings,
  ShopkeeperService,
  SimulationScenario,
  Snapshot,
  StoredDocument,
} from '../../features/shopkeeper/types';
import { decodePickupPayload, encodePickupPayload } from '../printq/pickupCodec';
import type { StudentObservation } from '../printq/workspace';
import type { WorkspaceConnection, WorkspaceHandle } from './index';

const STALE_MUTATION_ERROR =
  'Workspace connection is offline or stale. Reconnect before making changes.';
const DEMO_DISABLED_ERROR = 'Demo actions are disabled in cloud mode.';

interface PrepareUploadCommitted {
  kind: 'committed';
  job: PrintJob;
  observation: StudentObservation;
}

interface PrepareUploadPending {
  kind: 'pending';
  uploadId: string;
  objectKey: string;
  putUrl: string;
  expiresAt: string;
}

type PrepareUploadResponse = PrepareUploadCommitted | PrepareUploadPending;

interface CommitJobResponse {
  created: boolean;
  job: PrintJob;
  observation: StudentObservation;
}

interface ConnectionStatePayload {
  status: string;
  epoch: string;
}

interface SnapshotChangedPayload {
  epoch: string;
  revision: number;
  observedAt: string;
  student: StudentObservation;
  shopkeeper?: Snapshot;
}

async function computeSha256Hex(file: File): Promise<{ mimeType: string; sha256: string }> {
  const { mimeType } = await validateFile(file);
  const bytes = await readBlobBytes(file);
  if (!globalThis.crypto?.subtle) {
    throw new DomainError(
      'SECURE_CONTEXT_REQUIRED',
      'errors.secureContextRequired',
    );
  }
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const sha256 = Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
  return { mimeType, sha256 };
}

async function parseErrorMessage(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as {
      error?: { message?: string };
      message?: string;
    };
    return (
      body?.error?.message ??
      body?.message ??
      `Request failed with status ${res.status}`
    );
  } catch {
    return `Request failed with status ${res.status}`;
  }
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: 'include',
    ...init,
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  });
  if (!res.ok) {
    throw new Error(await parseErrorMessage(res));
  }
  return (await res.json()) as T;
}

function parseContentDispositionFilename(header: string | null): string | null {
  if (!header) return null;
  const match = /filename="([^"]+)"/i.exec(header);
  return match?.[1] ?? null;
}

export function createCloudWorkspace(): WorkspaceHandle {
  let disposed = false;
  let currentEpoch: string | null = null;
  let lastSyncedAt: string | null = null;
  let connection: WorkspaceConnection = {
    state: 'connecting',
    mode: 'shared',
  };

  let cachedStudentObservation: StudentObservation | null = null;
  let cachedShopkeeperSnapshot: Snapshot | null = null;

  let eventSource: EventSource | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  const transportListeners = new Set<(event: ServiceEvent) => void>();
  const shopkeeperListeners = new Set<() => void>();
  const connectionListeners = new Set<() => void>();

  function notifyConnection(): void {
    for (const cb of connectionListeners) {
      try {
        cb();
      } catch {
        /* Isolate subscriber errors. */
      }
    }
  }

  function notifyShopkeeper(): void {
    for (const cb of shopkeeperListeners) {
      try {
        cb();
      } catch {
        /* Isolate subscriber errors. */
      }
    }
  }

  function emitTransport(event: ServiceEvent): void {
    for (const cb of transportListeners) {
      try {
        cb(event);
      } catch {
        /* Isolate subscriber errors. */
      }
    }
  }

  function setConnectionState(
    nextState: WorkspaceConnection['state'],
    syncTime?: string | null,
  ): void {
    if (syncTime !== undefined) {
      lastSyncedAt = syncTime;
    }
    connection = { state: nextState, mode: 'shared' };
    emitTransport({
      type: 'connection-changed',
      mode: 'shared',
      state:
        nextState === 'connected'
          ? 'connected'
          : nextState === 'disconnected'
            ? 'disconnected'
            : 'unavailable',
      lastSyncedAt,
    });
    notifyConnection();
  }

  function installStudentObservation(observation: StudentObservation): void {
    cachedStudentObservation = observation;
    lastSyncedAt = observation.queue.lastSyncedAt ?? new Date().toISOString();
    if (connection.state !== 'connected') {
      connection = { state: 'connected', mode: 'shared' };
      emitTransport({
        type: 'connection-changed',
        mode: 'shared',
        state: 'connected',
        lastSyncedAt,
      });
      notifyConnection();
    }
    emitTransport({
      type: 'snapshot-changed',
      jobs: observation.jobs,
      queue: observation.queue,
    });
  }

  function installShopkeeperSnapshot(snapshot: Snapshot): void {
    cachedShopkeeperSnapshot = snapshot;
    notifyShopkeeper();
  }

  function cleanupEventSource(): void {
    if (reconnectTimer !== null) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }
  }

  function connectEventSource(): void {
    if (disposed || typeof EventSource === 'undefined') return;
    cleanupEventSource();

    const es = new EventSource('/api/events', { withCredentials: true });
    eventSource = es;

    es.addEventListener('connection-state', (rawEvent: Event) => {
      if (disposed || eventSource !== es) return;
      try {
        const payload = JSON.parse(
          (rawEvent as MessageEvent<string>).data,
        ) as ConnectionStatePayload;
        if (typeof payload.epoch === 'string' && payload.epoch.length > 0) {
          currentEpoch = payload.epoch;
        }
        setConnectionState('connected');
      } catch {
        /* Ignore malformed event payload. */
      }
    });

    es.addEventListener('snapshot-changed', (rawEvent: Event) => {
      if (disposed || eventSource !== es) return;
      try {
        const payload = JSON.parse(
          (rawEvent as MessageEvent<string>).data,
        ) as SnapshotChangedPayload;
        if (currentEpoch !== null && payload.epoch !== currentEpoch) {
          return;
        }
        if (currentEpoch === null && typeof payload.epoch === 'string') {
          currentEpoch = payload.epoch;
        }
        if (payload.student) {
          installStudentObservation(payload.student);
        }
        if (payload.shopkeeper) {
          installShopkeeperSnapshot(payload.shopkeeper);
        }
      } catch {
        /* Ignore malformed event payload. */
      }
    });

    es.onerror = () => {
      if (disposed || eventSource !== es) return;
      setConnectionState('disconnected');
      notifyShopkeeper();
      if (es.readyState === EventSource.CLOSED && reconnectTimer === null) {
        reconnectTimer = setTimeout(() => {
          reconnectTimer = null;
          connectEventSource();
        }, 2000);
      }
    };
  }

  connectEventSource();

  async function fetchStudentObservation(): Promise<StudentObservation> {
    const obs = await fetchJson<StudentObservation>('/api/student/observation');
    installStudentObservation(obs);
    return obs;
  }

  const transport: SharedStudentTransport = {
    async createJob(
      input: Omit<JobInput, 'expectedLocalGeneration'>,
      file?: File,
    ): Promise<PrintJob> {
      const wireInput = {
        clientRequestId: input.clientRequestId,
        documentName: input.documentName,
        pageCount: input.pageCount,
        pageCountSource: input.pageCountSource,
        copies: input.copies,
        colorMode: input.colorMode,
        duplex: input.duplex,
        paperSize: input.paperSize,
        instructions: input.instructions,
      };

      let uploadId: string | null = null;
      if (file) {
        const { mimeType, sha256 } = await computeSha256Hex(file);
        const prepared = await fetchJson<PrepareUploadResponse>(
          '/api/uploads/prepare',
          {
            method: 'POST',
            body: JSON.stringify({
              clientRequestId: input.clientRequestId,
              input: wireInput,
              fileMeta: {
                filename: file.name,
                mimeType,
                byteSize: file.size,
                sha256,
              },
            }),
          },
        );
        if (prepared.kind === 'committed') {
          installStudentObservation(prepared.observation);
          return prepared.job;
        }
        const putRes = await fetch(prepared.putUrl, {
          method: 'PUT',
          headers: { 'Content-Type': mimeType },
          body: file,
        });
        if (!putRes.ok) {
          throw new Error(`Document upload failed with status ${putRes.status}`);
        }
        uploadId = prepared.uploadId;
      }

      const committed = await fetchJson<CommitJobResponse>('/api/student/jobs', {
        method: 'POST',
        body: JSON.stringify({
          clientRequestId: input.clientRequestId,
          input: wireInput,
          uploadId,
        }),
      });
      installStudentObservation(committed.observation);
      return committed.job;
    },

    async getJobs(): Promise<PrintJob[]> {
      const obs = cachedStudentObservation ?? (await fetchStudentObservation());
      return obs.jobs;
    },

    async getJobById(id: string): Promise<PrintJob | null> {
      const res = await fetch(
        `/api/student/jobs/${encodeURIComponent(id)}`,
        { credentials: 'include' },
      );
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(await parseErrorMessage(res));
      return (await res.json()) as PrintJob;
    },

    async getQuote(input: QuoteInput): Promise<PrintQuote> {
      return fetchJson<PrintQuote>('/api/student/quote', {
        method: 'POST',
        body: JSON.stringify(input),
      });
    },

    async getQueueSnapshot(): Promise<QueueSnapshot> {
      const obs = cachedStudentObservation ?? (await fetchStudentObservation());
      return obs.queue;
    },

    async getPrinterStatus(): Promise<PrinterSnapshot> {
      const obs = await fetchStudentObservation();
      return {
        revision: obs.queue.revision,
        observedAt: obs.queue.observedAt,
        lastSyncedAt: obs.queue.lastSyncedAt,
        source: obs.queue.source,
        stale: obs.queue.stale,
        ...obs.queue.printer,
      };
    },

    async getPickupWindow(target: EstimateTarget): Promise<PickupWindowResult> {
      return fetchJson<PickupWindowResult>('/api/student/pickup-window', {
        method: 'POST',
        body: JSON.stringify(target),
      });
    },

    async getUrgentImpactPreview(jobId: string): Promise<UrgentImpact | null> {
      return fetchJson<UrgentImpact | null>(
        `/api/student/jobs/${encodeURIComponent(jobId)}/urgent-impact`,
      );
    },

    async requestUrgent(jobId: string): Promise<PrintJob> {
      const observation = await fetchJson<StudentObservation>(
        `/api/student/jobs/${encodeURIComponent(jobId)}/urgent-request`,
        { method: 'POST' },
      );
      installStudentObservation(observation);
      const updated = observation.jobs.find((j) => j.id === jobId);
      if (!updated) {
        throw new Error('Updated job was not found in observation.');
      }
      return updated;
    },

    async getDocument(documentId: string): Promise<Blob | null> {
      const res = await fetch(
        `/api/documents/${encodeURIComponent(documentId)}`,
        { credentials: 'include' },
      );
      if (!res.ok) {
        throw new Error(await parseErrorMessage(res));
      }
      return await res.blob();
    },

    async getShopInsights(): Promise<ShopInsights> {
      return fetchJson<ShopInsights>('/api/student/insights');
    },

    async simulateWhatIf(request: WhatIfRequest): Promise<WhatIfResult | null> {
      return fetchJson<WhatIfResult | null>('/api/student/what-if', {
        method: 'POST',
        body: JSON.stringify(request),
      });
    },

    subscribeToJobUpdates(callback: (event: ServiceEvent) => void): () => void {
      transportListeners.add(callback);
      callback({
        type: 'connection-changed',
        mode: 'shared',
        state:
          connection.state === 'connected'
            ? 'connected'
            : connection.state === 'disconnected'
              ? 'disconnected'
              : 'unavailable',
        lastSyncedAt,
      });
      if (cachedStudentObservation) {
        callback({
          type: 'snapshot-changed',
          jobs: cachedStudentObservation.jobs,
          queue: cachedStudentObservation.queue,
        });
      }
      return () => {
        transportListeners.delete(callback);
      };
    },
  };

  const studentAdapter = new SharedServiceAdapter(transport);
  const studentService: StudentService = studentAdapter;

  function assertConnectedForMutation(): void {
    if (connection.state !== 'connected') {
      throw new Error(STALE_MUTATION_ERROR);
    }
  }

  async function fetchShopkeeperSnapshot(): Promise<Snapshot> {
    const snapshot = await fetchJson<Snapshot>('/api/shopkeeper/snapshot');
    installShopkeeperSnapshot(snapshot);
    return snapshot;
  }

  async function mutateShopkeeper(
    url: string,
    body: unknown,
  ): Promise<Snapshot> {
    assertConnectedForMutation();
    const snapshot = await fetchJson<Snapshot>(url, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    installShopkeeperSnapshot(snapshot);
    return snapshot;
  }

  const shopkeeperService: ShopkeeperService = {
    initialize: async () => fetchShopkeeperSnapshot(),
    getJobs: async () => (await fetchShopkeeperSnapshot()).jobs,
    getJobById: async (id: string): Promise<Job> => {
      const snapshot = await fetchShopkeeperSnapshot();
      const job = snapshot.jobs.find((j) => j.id === id);
      if (!job) throw new Error('Job was not found.');
      return job;
    },
    getQueueSnapshot: async () => {
      if (connection.state !== 'connected' && cachedShopkeeperSnapshot) {
        return cachedShopkeeperSnapshot;
      }
      return fetchShopkeeperSnapshot();
    },
    getPrinterStatus: async (): Promise<Printer> =>
      (await shopkeeperService.getQueueSnapshot()).printer,
    getDocument: async (id: string): Promise<StoredDocument> => {
      const res = await fetch(`/api/documents/${encodeURIComponent(id)}`, {
        credentials: 'include',
      });
      if (!res.ok) {
        throw new Error(await parseErrorMessage(res));
      }
      const blob = await res.blob();
      const dispositionName = parseContentDispositionFilename(
        res.headers.get('content-disposition'),
      );
      const fallbackName =
        cachedShopkeeperSnapshot?.jobs.find((j) => j.documentId === id)
          ?.originalFileName ?? id;
      return {
        id,
        name: dispositionName ?? fallbackName,
        mimeType: res.headers.get('content-type') || blob.type || 'application/octet-stream',
        blob,
      };
    },
    updateJobStatus: (id: string, status: JobStatus, revision: number) =>
      mutateShopkeeper(`/api/shopkeeper/jobs/${encodeURIComponent(id)}/status`, {
        status,
        revision,
      }),
    reorderQueue: (ids: string[], revision: number) =>
      mutateShopkeeper('/api/shopkeeper/queue/reorder', { ids, revision }),
    getUrgentRequests: async () =>
      (await shopkeeperService.getQueueSnapshot()).jobs.filter(
        (j) => j.urgentRequestStatus === 'pending',
      ),
    getUrgentImpactPreview: (id: string) =>
      fetchJson<QueuePreview>(
        `/api/shopkeeper/jobs/${encodeURIComponent(id)}/urgent-impact`,
      ),
    approveUrgentRequest: (id: string, revision: number) =>
      mutateShopkeeper(
        `/api/shopkeeper/jobs/${encodeURIComponent(id)}/urgent-approve`,
        { revision },
      ),
    rejectUrgentRequest: (id: string, revision: number) =>
      mutateShopkeeper(
        `/api/shopkeeper/jobs/${encodeURIComponent(id)}/urgent-reject`,
        { revision },
      ),
    markJobUrgent: (id: string, revision: number) =>
      mutateShopkeeper(
        `/api/shopkeeper/jobs/${encodeURIComponent(id)}/urgent-mark`,
        { revision },
      ),
    getOptimizationPreview: () =>
      fetchJson<QueuePreview>('/api/shopkeeper/optimize/preview'),
    applyOptimizedQueue: (revision: number) =>
      mutateShopkeeper('/api/shopkeeper/optimize/apply', { revision }),
    getSimulationResult: (scenario: SimulationScenario) =>
      fetchJson<QueuePreview>('/api/shopkeeper/simulate/preview', {
        method: 'POST',
        body: JSON.stringify(scenario),
      }),
    applySimulation: (scenario: SimulationScenario, revision: number) =>
      mutateShopkeeper('/api/shopkeeper/simulate/apply', {
        scenario,
        revision,
      }),
    updatePrinterStatus: (
      state: PrinterState,
      downtime: number | null,
      revision: number,
    ) =>
      mutateShopkeeper('/api/shopkeeper/printer', {
        state,
        downtimeMinutes: downtime,
        revision,
      }),
    verifyPickupToken: async (token: string) => {
      assertConnectedForMutation();
      return fetchJson<Job>('/api/shopkeeper/pickup/verify', {
        method: 'POST',
        body: JSON.stringify({ token }),
      });
    },
    markCollected: (id: string, revision: number) =>
      mutateShopkeeper(
        `/api/shopkeeper/jobs/${encodeURIComponent(id)}/collect`,
        { revision },
      ),
    getAnalytics: () => fetchJson<Analytics>('/api/shopkeeper/analytics'),
    updateSettings: (settings: ShopSettings, revision: number) =>
      mutateShopkeeper('/api/shopkeeper/settings', { settings, revision }),
    addDemoJob: async () => {
      throw new Error(DEMO_DISABLED_ERROR);
    },
    requestDemoUrgency: async () => {
      throw new Error(DEMO_DISABLED_ERROR);
    },
    resetDemo: async () => {
      throw new Error(DEMO_DISABLED_ERROR);
    },
    subscribeToJobUpdates: (callback: () => void) => {
      shopkeeperListeners.add(callback);
      return () => {
        shopkeeperListeners.delete(callback);
      };
    },
    dispose: () => {
      handle.dispose();
    },
  };

  const handle: WorkspaceHandle = {
    mode: 'cloud',
    studentService,
    shopkeeperService,
    qrCodec: {
      encode: encodePickupPayload,
      decode: (payload) => decodePickupPayload(payload, false),
    },
    getConnection: () => ({ ...connection }),
    subscribeConnection(callback: () => void): () => void {
      connectionListeners.add(callback);
      return () => {
        connectionListeners.delete(callback);
      };
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      cleanupEventSource();
      studentAdapter.dispose();
      transportListeners.clear();
      shopkeeperListeners.clear();
      setConnectionState('unavailable');
      connectionListeners.clear();
    },
  };

  return handle;
}
