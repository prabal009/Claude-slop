import type {
  JobInput,
  PrintJob,
  PrintQuote,
  QuoteInput,
} from '../../features/student/contracts/jobs';
import type {
  Diagnostic,
  ServiceEvent,
  StudentDemoController,
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
import type {
  Analytics,
  Job,
  JobStatus,
  PrinterState,
  ShopSettings,
  ShopkeeperService,
  SimulationScenario,
  Snapshot,
  StoredDocument,
} from '../../features/shopkeeper/types';
import {
  calculateSnapshot,
  changePrinter,
  optimize,
  orderedQueue,
  preview,
  promoteUrgent,
  setOrder,
  simulate,
} from '../../features/shopkeeper/services/engine';
import {
  createDemoSnapshot,
  createSampleDocument,
} from '../../features/shopkeeper/services/demo';
import {
  identifier,
  numeric,
  requireThat,
  text,
  TOKEN_PATTERN,
  validateDocument,
  validateSettings,
  validateSnapshot,
  validateStoredDocument,
} from '../../features/shopkeeper/services/validation';
import {
  DatasetReplacedError,
  DomainError,
  assertQuote,
  isRecord,
  normalizeJobInput,
} from '../../features/student/utils/validation';
import {
  readBlobBytes,
  validateFile,
} from '../../features/student/documents/validation';
import { createUuid } from '../../features/student/qr/codec';
import {
  createConnectedPickupToken,
  decodePickupPayload,
  encodePickupPayload,
} from '../printq/pickupCodec';
import {
  calculateAnalytics,
  requestUrgency,
  transitionJob,
} from '../printq/mutations';
import {
  buildStudentInsights,
  buildStudentPickupWindow,
  buildStudentQuote,
  buildStudentUrgentImpact,
  buildStudentWhatIf,
  projectStudentObservation,
  type SubmissionMetadata,
  type WorkspaceObservation,
} from '../printq/workspace';
import type { WorkspaceConnection, WorkspaceHandle } from './index';

const DATABASE_NAME = 'printq-integrated-demo-v1';
const CHANNEL_NAME = 'printq-integrated-demo-v1';
const STATE_KEY = 'current';
const DEMO_STUDENT_ID = 'demo-student';

interface StoredWorkspaceState {
  observation: WorkspaceObservation;
  generation: number;
}

function aliasForId(jobId: string): string {
  return `other-${jobId.slice(0, 8)}`;
}

function buildDemoSubmissions(snapshot: Snapshot): Record<string, SubmissionMetadata> {
  const submissions: Record<string, SubmissionMetadata> = {};
  for (const job of snapshot.jobs) {
    submissions[job.id] = {
      studentId: DEMO_STUDENT_ID,
      clientRequestId: `demo-req-${job.id}`,
      pageCountSource: 'manual',
      fingerprint: `demo-fixture-${job.id}`,
    };
  }
  return submissions;
}

function createSeededState(now = Date.now(), generation = 1): StoredWorkspaceState {
  const snapshot = createDemoSnapshot(now);
  return {
    observation: {
      snapshot,
      observedAt: new Date(now).toISOString(),
      submissions: buildDemoSubmissions(snapshot),
    },
    generation,
  };
}

function validateStoredState(value: unknown): asserts value is StoredWorkspaceState {
  requireThat(!!value && typeof value === 'object', 'Stored demo state is malformed.');
  const candidate = value as StoredWorkspaceState;
  numeric(candidate.generation, 1, Number.MAX_SAFE_INTEGER, true);
  requireThat(
    !!candidate.observation && typeof candidate.observation === 'object',
    'Stored observation is malformed.',
  );
  validateSnapshot(candidate.observation.snapshot);
  requireThat(
    typeof candidate.observation.observedAt === 'string' &&
      Number.isFinite(Date.parse(candidate.observation.observedAt)),
    'Stored observedAt is malformed.',
  );
  requireThat(
    !!candidate.observation.submissions &&
      typeof candidate.observation.submissions === 'object',
    'Stored submissions are malformed.',
  );
}

async function prepareUploadFile(
  file: File,
): Promise<{ mimeType: string; sha256: string }> {
  const { mimeType } = await validateFile(file);
  const bytes = await readBlobBytes(file);
  if (!globalThis.crypto?.subtle) {
    throw new DomainError(
      'SECURE_CONTEXT_REQUIRED',
      'errors.secureContextRequired',
    );
  }
  const digestBuffer = await crypto.subtle.digest('SHA-256', bytes);
  const sha256 = Array.from(new Uint8Array(digestBuffer), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
  return { mimeType, sha256 };
}

export function createDemoWorkspace(): WorkspaceHandle {
  let database: IDBDatabase | null = null;
  let opening: Promise<IDBDatabase> | null = null;
  let initializing: Promise<void> | null = null;
  let disposed = false;

  const studentListeners = new Set<(event: ServiceEvent) => void>();
  const shopkeeperListeners = new Set<() => void>();
  const connectionListeners = new Set<() => void>();
  const verified = new Map<string, number>();

  let channel: BroadcastChannel | null = null;
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      channel = new BroadcastChannel(CHANNEL_NAME);
    }
  } catch {
    /* Storage events remain available as fallback. */
  }

  function getConnection(): WorkspaceConnection {
    return {
      state: disposed ? 'unavailable' : 'connected',
      mode: 'local-demo',
    };
  }

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

  function emitStudent(event: ServiceEvent): void {
    for (const cb of studentListeners) {
      try {
        cb(structuredClone(event));
      } catch {
        /* Isolate subscriber errors. */
      }
    }
  }

  async function emitStudentSnapshot(): Promise<void> {
    if (disposed || studentListeners.size === 0) return;
    try {
      const state = await readCalculatedState();
      const projected = projectStudentObservation(
        state.observation,
        DEMO_STUDENT_ID,
        aliasForId,
        'local-demo',
        state.generation,
      );
      emitStudent({
        type: 'snapshot-changed',
        jobs: projected.jobs,
        queue: projected.queue,
      });
    } catch {
      const diagnostics: Diagnostic[] = [
        {
          code: 'LOCAL_CACHE_UNAVAILABLE',
          messageKey: 'errors.localCacheUnavailable',
        },
      ];
      emitStudent({ type: 'diagnostics-changed', diagnostics });
    }
  }

  function handleExternalChange(): void {
    notifyShopkeeper();
    void emitStudentSnapshot();
  }

  if (channel) {
    channel.onmessage = () => handleExternalChange();
  }
  const storageListener = (event: StorageEvent) => {
    if (event.key === CHANNEL_NAME) handleExternalChange();
  };
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', storageListener);
  }

  function publish(revision: number): void {
    notifyShopkeeper();
    void emitStudentSnapshot();
    try {
      channel?.postMessage({ revision });
    } catch {
      /* Storage event fallback handles cross-tab notification. */
    }
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(
          CHANNEL_NAME,
          JSON.stringify({ revision, nonce: createUuid() }),
        );
      }
    } catch {
      /* Restricted storage environments may block localStorage. */
    }
  }

  function openDb(): Promise<IDBDatabase> {
    requireThat(!disposed, 'This workspace has been disposed.');
    if (database) return Promise.resolve(database);
    if (opening) return opening;
    const { promise, resolve, reject } = Promise.withResolvers<IDBDatabase>();
    opening = promise;
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is unavailable. Enable browser storage to use PrintQ.'));
      return promise;
    }
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('state')) {
        db.createObjectStore('state');
      }
      if (!db.objectStoreNames.contains('documents')) {
        db.createObjectStore('documents', { keyPath: 'id' });
      }
    };
    request.onerror = () =>
      reject(
        new Error(
          `Could not open local storage: ${request.error?.message ?? 'permission denied'}`,
        ),
      );
    request.onblocked = () =>
      reject(
        new Error(
          'Local database upgrade is blocked. Close other PrintQ tabs and reload.',
        ),
      );
    request.onsuccess = () => {
      if (disposed) {
        request.result.close();
        reject(new Error('This workspace has been disposed.'));
        return;
      }
      database = request.result;
      database.onversionchange = () => {
        database?.close();
        database = null;
        opening = null;
        handleExternalChange();
      };
      resolve(database);
    };
    return opening;
  }

  async function rawState(): Promise<StoredWorkspaceState> {
    const db = await openDb();
    const { promise, resolve, reject } =
      Promise.withResolvers<StoredWorkspaceState>();
    const tx = db.transaction('state', 'readonly');
    const request = tx.objectStore('state').get(STATE_KEY);
    request.onsuccess = () => {
      try {
        validateStoredState(request.result);
        resolve(request.result);
      } catch (error) {
        reject(error);
      }
    };
    request.onerror = () => reject(request.error);
    tx.onabort = () => reject(tx.error ?? new Error('Local read failed.'));
    return promise;
  }

  async function readDocument(id: string): Promise<StoredDocument | null> {
    identifier(id);
    const db = await openDb();
    const { promise, resolve, reject } = Promise.withResolvers<unknown>();
    const request = db
      .transaction('documents', 'readonly')
      .objectStore('documents')
      .get(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    const value = await promise;
    if (value === undefined || value === null) return null;
    return validateStoredDocument(value);
  }

  async function bootstrap(): Promise<void> {
    if (initializing) return initializing;
    initializing = (async () => {
      const db = await openDb();
      const { promise, resolve, reject } = Promise.withResolvers<void>();
      const tx = db.transaction(['state', 'documents'], 'readwrite');
      const stateStore = tx.objectStore('state');
      const request = stateStore.get(STATE_KEY);
      let failure: unknown;
      request.onsuccess = () => {
        try {
          if (request.result === undefined) {
            const seed = createSeededState();
            stateStore.put(seed, STATE_KEY);
            tx.objectStore('documents').put(createSampleDocument());
          } else {
            validateStoredState(request.result);
          }
        } catch (error) {
          failure = error;
          tx.abort();
        }
      };
      tx.oncomplete = () => resolve();
      tx.onabort = () =>
        reject(failure ?? tx.error ?? new Error('Local initialization failed.'));
      tx.onerror = () => {
        failure ??= tx.error;
      };
      await promise;
    })();
    try {
      return await initializing;
    } catch (error) {
      initializing = null;
      throw error;
    }
  }

  async function readCalculatedState(
    now = Date.now(),
  ): Promise<StoredWorkspaceState> {
    await bootstrap();
    const stored = await rawState();
    const calculated = calculateSnapshot(stored.observation.snapshot, now);
    return {
      generation: stored.generation,
      observation: {
        snapshot: calculated,
        observedAt: new Date(now).toISOString(),
        submissions: stored.observation.submissions,
      },
    };
  }

  async function mutateWorkspace<T = StoredWorkspaceState>(
    options: {
      expectedRevision?: number;
      expectedGeneration?: number;
      message?: string;
      jobId?: string | null;
      recordActivity?: boolean;
    },
    action: (
      state: StoredWorkspaceState,
      now: number,
      tx: IDBTransaction,
    ) => {
      state?: StoredWorkspaceState;
      result?: T;
      skipPersist?: boolean;
    },
  ): Promise<{ state: StoredWorkspaceState; result: T }> {
    if (options.expectedRevision !== undefined) {
      numeric(options.expectedRevision, 0, Number.MAX_SAFE_INTEGER - 1, true);
    }
    await bootstrap();
    const db = await openDb();
    const { promise, resolve, reject } = Promise.withResolvers<{
      state: StoredWorkspaceState;
      result: T;
      didPersist: boolean;
    }>();
    const tx = db.transaction(['state', 'documents'], 'readwrite');
    const store = tx.objectStore('state');
    const request = store.get(STATE_KEY);
    let resolvedPayload: {
      state: StoredWorkspaceState;
      result: T;
      didPersist: boolean;
    };
    let failure: unknown;

    request.onsuccess = () => {
      try {
        validateStoredState(request.result);
        const currentStored = request.result;
        if (
          options.expectedGeneration !== undefined &&
          currentStored.generation !== options.expectedGeneration
        ) {
          throw new DatasetReplacedError();
        }
        if (
          options.expectedRevision !== undefined &&
          currentStored.observation.snapshot.revision !== options.expectedRevision
        ) {
          throw new Error(
            'Queue changed in another tab. Recalculate the preview and try again.',
          );
        }

        const now = Date.now();
        const baselineSnapshot = calculateSnapshot(
          currentStored.observation.snapshot,
          now,
        );
        const workingState: StoredWorkspaceState = {
          generation: currentStored.generation,
          observation: {
            snapshot: baselineSnapshot,
            observedAt: new Date(now).toISOString(),
            submissions: { ...currentStored.observation.submissions },
          },
        };

        const outcome = action(workingState, now, tx);
        const nextState = outcome.state ?? workingState;
        if (outcome.skipPersist) {
          resolvedPayload = {
            state: nextState,
            result: (outcome.result ?? (nextState as unknown as T)),
            didPersist: false,
          };
          return;
        }

        const baseRevision = currentStored.observation.snapshot.revision;
        nextState.observation.snapshot.revision = baseRevision + 1;
        if (options.recordActivity !== false && options.message) {
          nextState.observation.snapshot.activity.unshift({
            id: createUuid(),
            at: new Date(now).toISOString(),
            message: options.message,
            jobId: options.jobId ?? null,
          });
          nextState.observation.snapshot.activity =
            nextState.observation.snapshot.activity.slice(0, 200);
        }
        nextState.observation.snapshot = calculateSnapshot(
          nextState.observation.snapshot,
          now,
        );
        nextState.observation.observedAt = new Date(now).toISOString();
        validateStoredState(nextState);
        store.put(nextState, STATE_KEY);

        resolvedPayload = {
          state: nextState,
          result: (outcome.result ?? (nextState as unknown as T)),
          didPersist: true,
        };
      } catch (error) {
        failure = error;
        tx.abort();
      }
    };

    tx.oncomplete = () => resolve(resolvedPayload);
    tx.onabort = () =>
      reject(
        failure ??
          tx.error ??
          new Error('Local update failed. Storage may be full.'),
      );
    tx.onerror = () => {
      failure ??= tx.error;
    };

    const settled = await promise;
    if (settled.didPersist) {
      publish(settled.state.observation.snapshot.revision);
    }
    return {
      state: structuredClone(settled.state),
      result: structuredClone(settled.result),
    };
  }

  function findJob(snapshot: Snapshot, id: string): Job {
    identifier(id);
    const job = snapshot.jobs.find((j) => j.id === id);
    requireThat(job, 'Job was not found.');
    return job;
  }

  const studentService: StudentService = {
    async createJob(raw: JobInput, file?: File): Promise<PrintJob> {
      if (!isRecord(raw)) {
        throw new DomainError('VALIDATION', 'errors.invalidInput');
      }
      const input = normalizeJobInput(raw);
      const prepared = file ? await prepareUploadFile(file) : null;
      const fingerprint = JSON.stringify({
        clientRequestId: input.clientRequestId,
        documentName: input.documentName,
        pageCount: input.pageCount,
        pageCountSource: input.pageCountSource,
        copies: input.copies,
        colorMode: input.colorMode,
        duplex: input.duplex,
        paperSize: input.paperSize,
        instructions: input.instructions,
        file: file
          ? {
              present: true,
              name: file.name,
              mimeType: prepared!.mimeType,
              size: file.size,
              sha256: prepared!.sha256,
            }
          : { present: false },
      });

      const id = createUuid();
      const token = createConnectedPickupToken();
      const documentId = file ? createUuid() : null;

      const { result } = await mutateWorkspace<PrintJob>(
        {
          expectedGeneration: raw.expectedLocalGeneration,
          message: 'Student submitted a print job.',
          jobId: id,
        },
        (working, now, tx) => {
          const existingEntry = Object.entries(
            working.observation.submissions,
          ).find(([, meta]) => meta.clientRequestId === input.clientRequestId);

          if (existingEntry) {
            const [existingJobId, existingMeta] = existingEntry;
            if (existingMeta.fingerprint !== fingerprint) {
              throw new DomainError(
                'IDEMPOTENCY_CONFLICT',
                'errors.requestConflict',
              );
            }
            const projected = projectStudentObservation(
              working.observation,
              DEMO_STUDENT_ID,
              aliasForId,
              'local-demo',
              working.generation,
            );
            const existingPrintJob = projected.jobs.find(
              (j) => j.id === existingJobId,
            );
            if (!existingPrintJob) {
              throw new DomainError('JOB_MISSING', 'errors.jobNotFound');
            }
            return { result: existingPrintJob, skipPersist: true };
          }

          requireThat(
            working.observation.snapshot.jobs.length < 1000,
            'The local queue is full.',
          );

          const at = new Date(now).toISOString();
          const job: Job = {
            id,
            token,
            documentName: input.documentName,
            documentId,
            originalFileName: file ? file.name : null,
            mimeType: prepared ? prepared.mimeType : null,
            fileSize: file ? file.size : null,
            pageCount: input.pageCount,
            copies: input.copies,
            colorMode: input.colorMode,
            duplex: input.duplex,
            paperSize: 'A4',
            instructions: input.instructions,
            status: 'queued',
            priority: 'normal',
            urgentRequestStatus: 'none',
            urgentRequestedAt: null,
            queuePosition: orderedQueue(working.observation.snapshot).length + 1,
            estimatedCost: 0,
            estimatedDurationMinutes: 0,
            estimatedWaitMinutes: null,
            estimatedPickupAt: null,
            pickupWindowEnd: null,
            createdAt: at,
            updatedAt: at,
            printingStartedAt: null,
            readyAt: null,
            collectedAt: null,
            remainingMinutes: null,
          };

          working.observation.snapshot.jobs.push(job);
          working.observation.submissions[id] = {
            studentId: DEMO_STUDENT_ID,
            clientRequestId: input.clientRequestId,
            pageCountSource: input.pageCountSource,
            fingerprint,
          };

          if (file && documentId && prepared) {
            const storedDoc: StoredDocument = {
              id: documentId,
              name: file.name,
              mimeType: prepared.mimeType,
              blob: file.slice(0, file.size, prepared.mimeType),
            };
            tx.objectStore('documents').put(storedDoc);
          }

          working.observation.snapshot = calculateSnapshot(
            working.observation.snapshot,
            now,
          );
          const projected = projectStudentObservation(
            working.observation,
            DEMO_STUDENT_ID,
            aliasForId,
            'local-demo',
            working.generation,
          );
          const createdPrintJob = projected.jobs.find((j) => j.id === id)!;
          return { state: working, result: createdPrintJob };
        },
      );

      return result;
    },

    async getJobs(): Promise<PrintJob[]> {
      const state = await readCalculatedState();
      return projectStudentObservation(
        state.observation,
        DEMO_STUDENT_ID,
        aliasForId,
        'local-demo',
        state.generation,
      ).jobs;
    },

    async getJobById(id: string): Promise<PrintJob | null> {
      const jobs = await studentService.getJobs();
      return jobs.find((j) => j.id === id) ?? null;
    },

    async getQuote(input: QuoteInput): Promise<PrintQuote> {
      assertQuote(input);
      const state = await readCalculatedState();
      return buildStudentQuote(
        state.observation.snapshot,
        state.observation.observedAt,
        input,
        'local-demo',
      );
    },

    async getQueueSnapshot(): Promise<QueueSnapshot> {
      const state = await readCalculatedState();
      return projectStudentObservation(
        state.observation,
        DEMO_STUDENT_ID,
        aliasForId,
        'local-demo',
        state.generation,
      ).queue;
    },

    async getPrinterStatus(): Promise<PrinterSnapshot> {
      const queue = await studentService.getQueueSnapshot();
      return {
        revision: queue.revision,
        observedAt: queue.observedAt,
        lastSyncedAt: queue.lastSyncedAt,
        source: queue.source,
        stale: queue.stale,
        ...queue.printer,
      };
    },

    async getPickupWindow(target: EstimateTarget): Promise<PickupWindowResult> {
      if (
        !isRecord(target) ||
        (target.kind !== 'job' && target.kind !== 'draft')
      ) {
        throw new DomainError('VALIDATION', 'errors.invalidInput');
      }
      if (target.kind === 'draft') {
        assertQuote(target.input);
      }
      const state = await readCalculatedState();
      return buildStudentPickupWindow(
        state.observation.snapshot,
        state.observation.observedAt,
        target,
        'local-demo',
      );
    },

    async getUrgentImpactPreview(jobId: string): Promise<UrgentImpact | null> {
      const state = await readCalculatedState();
      if (state.observation.submissions[jobId]?.studentId !== DEMO_STUDENT_ID) {
        return null;
      }
      const job = state.observation.snapshot.jobs.find((j) => j.id === jobId);
      if (!job || job.status !== 'queued' || job.priority !== 'normal') {
        return null;
      }
      return buildStudentUrgentImpact(
        state.observation.snapshot,
        state.observation.observedAt,
        jobId,
        'local-demo',
      );
    },

    async requestUrgent(jobId: string): Promise<PrintJob> {
      const { result } = await mutateWorkspace<PrintJob>(
        {
          message: 'Student requested urgent priority.',
          jobId,
        },
        (working, now) => {
          if (
            working.observation.submissions[jobId]?.studentId !== DEMO_STUDENT_ID
          ) {
            throw new DomainError('NOT_FOUND', 'errors.jobNotFound');
          }
          requestUrgency(working.observation.snapshot, jobId, now);
          working.observation.snapshot = calculateSnapshot(
            working.observation.snapshot,
            now,
          );
          const projected = projectStudentObservation(
            working.observation,
            DEMO_STUDENT_ID,
            aliasForId,
            'local-demo',
            working.generation,
          );
          const updated = projected.jobs.find((j) => j.id === jobId)!;
          return { state: working, result: updated };
        },
      );
      return result;
    },

    async getDocument(documentId: string): Promise<Blob | null> {
      await bootstrap();
      const doc = await readDocument(documentId);
      return doc?.blob ?? null;
    },

    async getShopInsights(): Promise<ShopInsights> {
      const state = await readCalculatedState();
      return buildStudentInsights(
        state.observation.snapshot,
        state.observation.observedAt,
        'local-demo',
      );
    },

    async simulateWhatIf(request: WhatIfRequest): Promise<WhatIfResult | null> {
      if (
        !isRecord(request) ||
        !isRecord(request.target) ||
        !isRecord(request.changes)
      ) {
        throw new DomainError('VALIDATION', 'errors.invalidInput');
      }
      const state = await readCalculatedState();
      return buildStudentWhatIf(
        state.observation.snapshot,
        state.observation.observedAt,
        request,
        'local-demo',
      );
    },

    subscribeToJobUpdates(callback: (event: ServiceEvent) => void): () => void {
      studentListeners.add(callback);
      const deliver = (event: ServiceEvent) => {
        try {
          callback(structuredClone(event));
        } catch {
          /* Isolate consumer callback errors. */
        }
      };
      deliver({
        type: 'connection-changed',
        mode: 'local-demo',
        state: 'local-ready',
        lastSyncedAt: null,
      });
      deliver({ type: 'diagnostics-changed', diagnostics: [] });
      void emitStudentSnapshot();
      return () => {
        studentListeners.delete(callback);
      };
    },
  };

  const shopkeeperService: ShopkeeperService = {
    initialize: async () => (await readCalculatedState()).observation.snapshot,
    getJobs: async () =>
      (await readCalculatedState()).observation.snapshot.jobs,
    getJobById: async (id) =>
      findJob((await readCalculatedState()).observation.snapshot, id),
    getQueueSnapshot: async () =>
      (await readCalculatedState()).observation.snapshot,
    getPrinterStatus: async () =>
      (await readCalculatedState()).observation.snapshot.printer,
    getDocument: async (id) => {
      await bootstrap();
      const doc = await readDocument(id);
      requireThat(
        doc,
        'Document information available — no file attached, or local file was removed.',
      );
      const state = await readCalculatedState();
      for (const job of state.observation.snapshot.jobs.filter(
        (j) => j.documentId === id,
      )) {
        requireThat(
          job.fileSize === doc.blob.size &&
            job.mimeType === doc.mimeType &&
            job.originalFileName === doc.name,
          'Stored document metadata does not match.',
        );
      }
      return doc;
    },
    updateJobStatus: async (id, status, revision) => {
      const { state } = await mutateWorkspace(
        {
          expectedRevision: revision,
          message: `Job status changed to ${status}.`,
          jobId: id,
        },
        (working, now) => {
          const isVerified =
            verified.has(id) && now - verified.get(id)! <= 5 * 60000;
          transitionJob(
            working.observation.snapshot,
            id,
            status,
            now,
            isVerified,
          );
          return { state: working };
        },
      );
      return state.observation.snapshot;
    },
    reorderQueue: async (ids, revision) => {
      const { state } = await mutateWorkspace(
        {
          expectedRevision: revision,
          message: 'Waiting queue reordered.',
        },
        (working, now) => {
          requireThat(Array.isArray(ids), 'Invalid queue order.');
          setOrder(working.observation.snapshot, ids, now);
          return { state: working };
        },
      );
      return state.observation.snapshot;
    },
    getUrgentRequests: async () =>
      (await readCalculatedState()).observation.snapshot.jobs.filter(
        (j) => j.urgentRequestStatus === 'pending',
      ),
    getUrgentImpactPreview: async (id) => {
      const state = await readCalculatedState();
      return simulate(state.observation.snapshot, { kind: 'urgent', jobId: id });
    },
    approveUrgentRequest: async (id, revision) => {
      const { state } = await mutateWorkspace(
        {
          expectedRevision: revision,
          message: 'Urgency request approved.',
          jobId: id,
        },
        (working, now) => {
          const job = findJob(working.observation.snapshot, id);
          requireThat(
            job.urgentRequestStatus === 'pending',
            'This job has no pending urgency request.',
          );
          promoteUrgent(working.observation.snapshot, id, now);
          return { state: working };
        },
      );
      return state.observation.snapshot;
    },
    rejectUrgentRequest: async (id, revision) => {
      const { state } = await mutateWorkspace(
        {
          expectedRevision: revision,
          message: 'Urgency request rejected.',
          jobId: id,
        },
        (working, now) => {
          const job = findJob(working.observation.snapshot, id);
          requireThat(
            job.status === 'queued' && job.urgentRequestStatus === 'pending',
            'This job has no pending urgency request.',
          );
          job.urgentRequestStatus = 'rejected';
          job.updatedAt = new Date(now).toISOString();
          return { state: working };
        },
      );
      return state.observation.snapshot;
    },
    markJobUrgent: async (id, revision) => {
      const { state } = await mutateWorkspace(
        {
          expectedRevision: revision,
          message: 'Job marked urgent after confirmation.',
          jobId: id,
        },
        (working, now) => {
          promoteUrgent(working.observation.snapshot, id, now);
          return { state: working };
        },
      );
      return state.observation.snapshot;
    },
    getOptimizationPreview: async () => {
      const now = Date.now();
      const before = (await readCalculatedState(now)).observation.snapshot;
      const after = optimize(before, now);
      return preview(
        before,
        after,
        'Shortest processing time for eligible normal jobs. Normal jobs waiting at least 60 minutes keep their positions; existing urgent jobs retain their stable front block.',
      );
    },
    applyOptimizedQueue: async (revision) => {
      const { state } = await mutateWorkspace(
        {
          expectedRevision: revision,
          message: 'Optimized queue applied after confirmation.',
        },
        (working, now) => {
          working.observation.snapshot = optimize(
            working.observation.snapshot,
            now,
          );
          return { state: working };
        },
      );
      return state.observation.snapshot;
    },
    getSimulationResult: async (scenario) =>
      simulate((await readCalculatedState()).observation.snapshot, scenario),
    applySimulation: async (scenario, revision) => {
      const { state } = await mutateWorkspace(
        {
          expectedRevision: revision,
          message: 'Confirmed simulation applied.',
        },
        (working, now) => {
          const result = simulate(working.observation.snapshot, scenario, now);
          requireThat(
            result.applicable,
            'Hypothetical jobs cannot be applied. Add a real demo job in Settings.',
          );
          working.observation.snapshot = result.after;
          return { state: working };
        },
      );
      return state.observation.snapshot;
    },
    updatePrinterStatus: async (printerState: PrinterState, downtime, revision) => {
      const { state } = await mutateWorkspace(
        {
          expectedRevision: revision,
          message: `Printer changed to ${printerState}.`,
        },
        (working, now) => {
          changePrinter(working.observation.snapshot, printerState, downtime, now);
          return { state: working };
        },
      );
      return state.observation.snapshot;
    },
    verifyPickupToken: async (input) => {
      text(input, 160);
      const token = decodePickupPayload(input, false);
      requireThat(
        token && TOKEN_PATTERN.test(token),
        'Invalid pickup token or unsupported QR payload.',
      );
      const state = await readCalculatedState();
      const job = state.observation.snapshot.jobs.find(
        (j) => j.token === token,
      );
      requireThat(job, 'No job matches this pickup token.');
      if (job.status === 'ready') {
        verified.set(job.id, Date.now());
      }
      return job;
    },
    markCollected: async (id, revision) => {
      const { state } = await mutateWorkspace(
        {
          expectedRevision: revision,
          message: 'Verified order collected.',
          jobId: id,
        },
        (working, now) => {
          const isVerified =
            verified.has(id) && now - verified.get(id)! <= 5 * 60000;
          transitionJob(
            working.observation.snapshot,
            id,
            'collected',
            now,
            isVerified,
          );
          return { state: working };
        },
      );
      return state.observation.snapshot;
    },
    getAnalytics: async (): Promise<Analytics> => {
      const now = Date.now();
      const state = await readCalculatedState(now);
      return calculateAnalytics(state.observation.snapshot, now);
    },
    updateSettings: async (settings: ShopSettings, revision) => {
      const { state } = await mutateWorkspace(
        {
          expectedRevision: revision,
          message: 'Shop pricing and operating hours updated.',
        },
        (working) => {
          validateSettings(settings);
          working.observation.snapshot.settings = structuredClone(settings);
          return { state: working };
        },
      );
      return state.observation.snapshot;
    },
    addDemoJob: async (input) => {
      requireThat(!!input && typeof input === 'object', 'Invalid job input.');
      text(input.documentName, 160);
      numeric(input.pageCount, 1, 1000, true);
      numeric(input.copies, 1, 100, true);
      requireThat(
        ['bw', 'colour'].includes(input.colorMode) &&
          typeof input.duplex === 'boolean',
        'Invalid print preferences.',
      );
      let document: StoredDocument | null = null;
      if (input.file) {
        requireThat(
          input.file instanceof Blob && typeof input.file.name === 'string',
          'Invalid attached file.',
        );
        const mimeType = await validateDocument(
          input.file,
          input.file.name,
          input.file.type,
        );
        document = {
          id: createUuid(),
          name: input.file.name,
          mimeType,
          blob: input.file.slice(0, input.file.size, mimeType),
        };
      }
      const current = await readCalculatedState();
      const { state } = await mutateWorkspace(
        {
          expectedRevision: current.observation.snapshot.revision,
          message: 'Fictional demo job added.',
        },
        (working, now, tx) => {
          requireThat(
            working.observation.snapshot.jobs.length < 1000,
            'The local queue is full.',
          );
          const at = new Date(now).toISOString();
          const year = new Date(now).getFullYear();
          const prefix = `PQ-${year}-`;
          const usedTokens = new Set(
            working.observation.snapshot.jobs.map((j) => j.token),
          );
          let number = 1001;
          while (usedTokens.has(prefix + number)) number++;
          const jobId = createUuid();
          const job: Job = {
            id: jobId,
            token: prefix + number,
            documentName: input.documentName.trim(),
            documentId: document?.id ?? null,
            originalFileName: document?.name ?? null,
            mimeType: document?.mimeType ?? null,
            fileSize: document?.blob.size ?? null,
            pageCount: input.pageCount,
            copies: input.copies,
            colorMode: input.colorMode,
            duplex: input.duplex,
            paperSize: 'A4',
            instructions: '',
            status: 'queued',
            priority: 'normal',
            urgentRequestStatus: 'none',
            urgentRequestedAt: null,
            queuePosition: orderedQueue(working.observation.snapshot).length + 1,
            estimatedCost: 0,
            estimatedDurationMinutes: 0,
            estimatedWaitMinutes: null,
            estimatedPickupAt: null,
            pickupWindowEnd: null,
            createdAt: at,
            updatedAt: at,
            printingStartedAt: null,
            readyAt: null,
            collectedAt: null,
            remainingMinutes: null,
          };
          working.observation.snapshot.jobs.push(job);
          working.observation.submissions[jobId] = {
            studentId: 'shopkeeper-demo',
            clientRequestId: `shopkeeper-demo-${jobId}`,
            pageCountSource: 'manual',
            fingerprint: `shopkeeper-demo-${jobId}`,
          };
          if (document) {
            tx.objectStore('documents').put(document);
          }
          return { state: working };
        },
      );
      return state.observation.snapshot;
    },
    requestDemoUrgency: async (id, revision) => {
      const { state } = await mutateWorkspace(
        {
          expectedRevision: revision,
          message: 'Demo urgency request received.',
          jobId: id,
        },
        (working, now) => {
          requestUrgency(working.observation.snapshot, id, now);
          return { state: working };
        },
      );
      return state.observation.snapshot;
    },
    resetDemo: async (revision) => {
      const { state } = await mutateWorkspace(
        {
          expectedRevision: revision,
          message: 'Fictional demo reset confirmed.',
        },
        (working, now, tx) => {
          verified.clear();
          tx.objectStore('documents').clear();
          tx.objectStore('documents').put(createSampleDocument());
          const seeded = createSeededState(now, working.generation + 1);
          return { state: seeded };
        },
      );
      return state.observation.snapshot;
    },
    subscribeToJobUpdates: (callback) => {
      requireThat(!disposed, 'This workspace has been disposed.');
      shopkeeperListeners.add(callback);
      return () => {
        shopkeeperListeners.delete(callback);
      };
    },
    dispose: () => {
      handle.dispose();
    },
  };

  const demoController: StudentDemoController = {
    async loadFixtures(): Promise<void> {
      await mutateWorkspace(
        { message: 'Demo fixtures loaded.' },
        (working, now, tx) => {
          const seeded = createDemoSnapshot(now);
          const existingIds = new Set(
            working.observation.snapshot.jobs.map((j) => j.id),
          );
          for (const fixtureJob of seeded.jobs) {
            if (!existingIds.has(fixtureJob.id)) {
              working.observation.snapshot.jobs.push(fixtureJob);
              working.observation.submissions[fixtureJob.id] = {
                studentId: DEMO_STUDENT_ID,
                clientRequestId: `demo-req-${fixtureJob.id}`,
                pageCountSource: 'manual',
                fingerprint: `demo-fixture-${fixtureJob.id}`,
              };
            }
          }
          tx.objectStore('documents').put(createSampleDocument());
          return { state: working };
        },
      );
    },
    async advanceJob(jobId: string): Promise<void> {
      await mutateWorkspace(
        { message: 'Demo job advanced.', jobId },
        (working, now) => {
          const job = findJob(working.observation.snapshot, jobId);
          const nextStatus: JobStatus =
            job.status === 'queued'
              ? 'printing'
              : job.status === 'printing'
                ? 'ready'
                : 'collected';
          transitionJob(
            working.observation.snapshot,
            jobId,
            nextStatus,
            now,
            true,
          );
          return { state: working };
        },
      );
    },
    async resolveUrgency(
      jobId: string,
      result: 'approved' | 'rejected',
    ): Promise<void> {
      if (result !== 'approved' && result !== 'rejected') {
        throw new DomainError('INVALID_URGENCY', 'errors.invalidInput');
      }
      await mutateWorkspace(
        {
          message:
            result === 'approved'
              ? 'Urgency request approved.'
              : 'Urgency request rejected.',
          jobId,
        },
        (working, now) => {
          const job = findJob(working.observation.snapshot, jobId);
          if (job.status !== 'queued' || job.urgentRequestStatus !== 'pending') {
            throw new DomainError('URGENT_INELIGIBLE', 'errors.urgentIneligible');
          }
          if (result === 'approved') {
            promoteUrgent(working.observation.snapshot, jobId, now);
          } else {
            job.urgentRequestStatus = 'rejected';
            job.updatedAt = new Date(now).toISOString();
          }
          return { state: working };
        },
      );
    },
    async setPrinterScenario(
      scenario: 'known-maintenance' | 'unknown-maintenance' | 'resumed',
    ): Promise<void> {
      await mutateWorkspace(
        { message: `Printer scenario changed to ${scenario}.` },
        (working, now) => {
          if (scenario === 'known-maintenance') {
            changePrinter(working.observation.snapshot, 'maintenance', 15, now);
          } else if (scenario === 'unknown-maintenance') {
            changePrinter(
              working.observation.snapshot,
              'maintenance',
              null,
              now,
            );
          } else if (scenario === 'resumed') {
            changePrinter(
              working.observation.snapshot,
              'operational',
              null,
              now,
            );
          } else {
            throw new DomainError(
              'INVALID_PRINTER_SCENARIO',
              'errors.invalidInput',
            );
          }
          return { state: working };
        },
      );
    },
    async resetDemo(): Promise<void> {
      await mutateWorkspace(
        { message: 'Fictional demo reset confirmed.' },
        (working, now, tx) => {
          verified.clear();
          tx.objectStore('documents').clear();
          tx.objectStore('documents').put(createSampleDocument());
          const seeded = createSeededState(now, working.generation + 1);
          return { state: seeded };
        },
      );
    },
    async clearLocalData(): Promise<void> {
      await mutateWorkspace(
        { message: 'Local demo data cleared.' },
        (working, now, tx) => {
          verified.clear();
          tx.objectStore('documents').clear();
          const emptySnapshot: Snapshot = {
            ...working.observation.snapshot,
            jobs: [],
            activity: [],
            printer: {
              state: 'operational',
              downtimeMinutes: null,
              changedAt: new Date(now).toISOString(),
              recordedDowntimeMinutes: 0,
            },
          };
          return {
            state: {
              generation: working.generation + 1,
              observation: {
                snapshot: emptySnapshot,
                observedAt: new Date(now).toISOString(),
                submissions: {},
              },
            },
          };
        },
      );
    },
  };

  const handle: WorkspaceHandle = {
    mode: 'demo',
    studentService,
    shopkeeperService,
    qrCodec: {
      encode: encodePickupPayload,
      decode: (payload) => decodePickupPayload(payload, false),
    },
    demoController,
    getConnection,
    subscribeConnection(callback: () => void): () => void {
      connectionListeners.add(callback);
      return () => {
        connectionListeners.delete(callback);
      };
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      channel?.close();
      channel = null;
      database?.close();
      database = null;
      opening = null;
      studentListeners.clear();
      shopkeeperListeners.clear();
      verified.clear();
      if (typeof window !== 'undefined') {
        window.removeEventListener('storage', storageListener);
      }
      notifyConnection();
      connectionListeners.clear();
    },
  };

  return handle;
}
