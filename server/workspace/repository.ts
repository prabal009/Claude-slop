import crypto from 'node:crypto';
import type { Readable } from 'node:stream';
import type { S3Client } from '@aws-sdk/client-s3';
import type { Pool, PoolClient } from 'pg';
import type { AuthenticatedSession } from '../auth/session.ts';
import { withTransaction } from '../db/pool.ts';
import {
  createPresignedPutUrl,
  deleteS3Object,
  getObjectStream,
  readObjectBounded,
} from '../storage/s3.ts';
import type {
  Analytics,
  Job,
  PrinterState,
  QueuePreview,
  ShopSettings,
  SimulationScenario,
  Snapshot,
} from '../../src/features/shopkeeper/types.ts';
import {
  calculateSnapshot,
  changePrinter,
  cost,
  duration,
  optimize,
  preview,
  promoteUrgent,
  setOrder,
  simulate,
} from '../../src/features/shopkeeper/services/engine.ts';
import {
  validateSettings,
} from '../../src/features/shopkeeper/services/validation.ts';
import type {
  JobInput,
  PageCountSource,
  PrintJob,
  PrintQuote,
  QuoteInput,
} from '../../src/features/student/contracts/jobs.ts';
import type {
  EstimateTarget,
  PickupWindowResult,
  ShopInsights,
  UrgentImpact,
  WhatIfRequest,
  WhatIfResult,
} from '../../src/features/student/contracts/scheduling.ts';
import { createConnectedPickupToken, decodePickupPayload } from '../../src/shared/printq/pickupCodec.ts';
import {
  calculateAnalytics,
  requestUrgency,
  transitionJob,
} from '../../src/shared/printq/mutations.ts';
import {
  CONNECTED_MAX_FILE_BYTES,
  MAX_COPIES,
  MAX_DOCUMENT_NAME_LENGTH,
  MAX_INSTRUCTIONS_LENGTH,
  MAX_PAGE_COUNT,
  MAX_QUEUE_JOBS,
} from '../../src/shared/printq/policy.ts';
import {
  buildStudentInsights,
  buildStudentPickupWindow,
  buildStudentQuote,
  buildStudentUrgentImpact,
  buildStudentWhatIf,
  projectStudentObservation,
  type StudentObservation,
  type SubmissionMetadata,
  type WorkspaceObservation,
} from '../../src/shared/printq/workspace.ts';

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly field?: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export interface UploadFileMeta {
  filename: string;
  mimeType: string;
  byteSize: number;
  sha256: string;
}

export interface PrepareUploadPendingResult {
  kind: 'pending';
  uploadId: string;
  objectKey: string;
  putUrl: string;
  expiresAt: string;
}

export interface PrepareUploadCommittedResult {
  kind: 'committed';
  job: PrintJob;
  observation: StudentObservation;
}

export type PrepareUploadResult = PrepareUploadPendingResult | PrepareUploadCommittedResult;

export interface CommitJobResult {
  created: boolean;
  job: PrintJob;
  observation: StudentObservation;
}

export interface AuthorizedDocumentStream {
  stream: Readable;
  mimeType: string;
  filename: string;
  disposition: 'inline' | 'attachment';
  contentLength?: number;
}

export interface WorkspaceRepositoryOptions {
  pool: Pool;
  s3: S3Client;
  bucket: string;
  sessionSecret: string;
  schema?: string;
  onWorkspaceChanged?: () => void;
}

interface ShopStateRow {
  id: string;
  revision: string;
  observed_at: Date | string;
  settings: ShopSettings;
  printer: Snapshot['printer'];
  activity: Snapshot['activity'];
}

interface JobRow {
  id: string;
  shop_id: string;
  student_id: string;
  client_request_id: string;
  fingerprint: string;
  page_count_source: PageCountSource;
  token: string;
  document_id: string | null;
  data: Job;
}

interface UploadRow {
  id: string;
  student_id: string;
  client_request_id: string;
  intent_hash: string;
  object_key: string;
  filename: string;
  mime_type: string;
  byte_size: string;
  sha256: string;
  state: 'pending' | 'committed';
  expires_at: Date | string;
}

const SHOP_ID = 'campus';
const UPLOAD_TTL_MS = 24 * 60 * 60 * 1000;
const PRESIGN_TTL_SECONDS = 300;
const PICKUP_VERIFICATION_TTL_MS = 5 * 60 * 1000;

const ALLOWED_MIME_BY_EXT: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
};

function parseSafeRevision(raw: string | number): number {
  const value = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new HttpError(500, 'INVALID_REVISION', 'Stored workspace revision is invalid.');
  }
  return value;
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function codePointLength(value: string): number {
  return Array.from(value).length;
}

function sanitizeFilename(name: string): string {
  const base = name.replace(/[\r\n"\\/]/g, '_').trim();
  return base.length > 0 ? base.slice(0, 180) : 'document';
}

function getFileExtension(filename: string): string {
  const idx = filename.lastIndexOf('.');
  return idx >= 0 ? filename.slice(idx + 1).toLowerCase() : '';
}

function validateJobInput(input: JobInput): JobInput {
  if (!input || typeof input !== 'object') {
    throw new HttpError(400, 'INVALID_INPUT', 'Job input is required.');
  }
  if (typeof input.clientRequestId !== 'string' || input.clientRequestId.trim().length === 0 || input.clientRequestId.length > 120) {
    throw new HttpError(400, 'INVALID_INPUT', 'Invalid clientRequestId.', 'clientRequestId');
  }
  const documentName = typeof input.documentName === 'string' ? input.documentName.trim() : '';
  if (documentName.length === 0 || codePointLength(documentName) > MAX_DOCUMENT_NAME_LENGTH) {
    throw new HttpError(400, 'INVALID_INPUT', 'Document name must be 1..120 characters.', 'documentName');
  }
  if (!Number.isInteger(input.pageCount) || input.pageCount < 1 || input.pageCount > MAX_PAGE_COUNT) {
    throw new HttpError(400, 'INVALID_INPUT', `Page count must be an integer between 1 and ${MAX_PAGE_COUNT}.`, 'pageCount');
  }
  if (!Number.isInteger(input.copies) || input.copies < 1 || input.copies > MAX_COPIES) {
    throw new HttpError(400, 'INVALID_INPUT', `Copies must be an integer between 1 and ${MAX_COPIES}.`, 'copies');
  }
  if (input.colorMode !== 'bw' && input.colorMode !== 'colour') {
    throw new HttpError(400, 'INVALID_INPUT', 'Invalid colorMode.', 'colorMode');
  }
  if (typeof input.duplex !== 'boolean') {
    throw new HttpError(400, 'INVALID_INPUT', 'Invalid duplex flag.', 'duplex');
  }
  if (input.paperSize !== 'A4') {
    throw new HttpError(400, 'INVALID_INPUT', 'Only A4 paperSize is supported.', 'paperSize');
  }
  if (input.pageCountSource !== 'assumed' && input.pageCountSource !== 'manual' && input.pageCountSource !== 'image') {
    throw new HttpError(400, 'INVALID_INPUT', 'Invalid pageCountSource.', 'pageCountSource');
  }
  const instructions = typeof input.instructions === 'string' ? input.instructions.trim() : '';
  if (codePointLength(instructions) > MAX_INSTRUCTIONS_LENGTH) {
    throw new HttpError(400, 'INVALID_INPUT', `Instructions must be at most ${MAX_INSTRUCTIONS_LENGTH} characters.`, 'instructions');
  }
  return {
    clientRequestId: input.clientRequestId.trim(),
    documentName,
    pageCount: input.pageCount,
    pageCountSource: input.pageCountSource,
    copies: input.copies,
    colorMode: input.colorMode,
    duplex: input.duplex,
    paperSize: 'A4',
    instructions,
  };
}

function validateFileMeta(meta: UploadFileMeta): UploadFileMeta {
  if (!meta || typeof meta !== 'object') {
    throw new HttpError(400, 'INVALID_DOCUMENT', 'File metadata is required.');
  }
  const filename = typeof meta.filename === 'string' ? meta.filename.trim() : '';
  const ext = getFileExtension(filename);
  const expectedMime = ALLOWED_MIME_BY_EXT[ext];
  if (!filename || !expectedMime) {
    throw new HttpError(400, 'INVALID_DOCUMENT', 'Unsupported file extension.', 'filename');
  }
  if (meta.mimeType !== expectedMime) {
    throw new HttpError(400, 'INVALID_DOCUMENT', 'File MIME type does not match extension.', 'mimeType');
  }
  if (!Number.isInteger(meta.byteSize) || meta.byteSize < 1 || meta.byteSize > CONNECTED_MAX_FILE_BYTES) {
    throw new HttpError(400, 'INVALID_DOCUMENT', `File size must be between 1 and ${CONNECTED_MAX_FILE_BYTES} bytes.`, 'byteSize');
  }
  if (typeof meta.sha256 !== 'string' || !/^[0-9a-f]{64}$/i.test(meta.sha256)) {
    throw new HttpError(400, 'INVALID_DOCUMENT', 'Invalid SHA-256 digest.', 'sha256');
  }
  return {
    filename: sanitizeFilename(filename),
    mimeType: meta.mimeType,
    byteSize: meta.byteSize,
    sha256: meta.sha256.toLowerCase(),
  };
}

function computeIntentHash(input: JobInput, fileMeta?: UploadFileMeta): string {
  const canonical = {
    clientRequestId: input.clientRequestId,
    documentName: input.documentName,
    pageCount: input.pageCount,
    pageCountSource: input.pageCountSource,
    copies: input.copies,
    colorMode: input.colorMode,
    duplex: input.duplex,
    paperSize: input.paperSize,
    instructions: input.instructions,
    ...(fileMeta
      ? {
          filename: fileMeta.filename,
          mimeType: fileMeta.mimeType,
          byteSize: fileMeta.byteSize,
          sha256: fileMeta.sha256,
        }
      : {}),
  };
  return crypto.createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

function validateUploadedBytes(bytes: Buffer, filename: string): void {
  const ext = getFileExtension(filename);
  const starts = (sig: number[]) => sig.every((b, i) => bytes[i] === b);
  let valid = false;
  if (ext === 'pdf') {
    valid = starts([37, 80, 68, 70, 45]) && bytes.subarray(Math.max(0, bytes.length - 1024)).toString('utf8').includes('%%EOF');
  } else if (ext === 'png') {
    valid = starts([137, 80, 78, 71, 13, 10, 26, 10]);
  } else if (ext === 'jpg' || ext === 'jpeg') {
    valid = starts([255, 216, 255]);
  } else if (ext === 'doc') {
    valid = starts([208, 207, 17, 224, 161, 177, 26, 225]);
  } else if (ext === 'docx') {
    const text = bytes.toString('utf8');
    valid = starts([80, 75, 3, 4]) && text.includes('[Content_Types].xml') && text.includes('word/');
  }
  if (!valid) {
    throw new HttpError(400, 'INVALID_DOCUMENT', 'Uploaded file content does not match its declared format.');
  }
}

export class WorkspaceRepository {
  private readonly pool: Pool;
  private readonly s3: S3Client;
  private readonly bucket: string;
  private readonly sessionSecret: string;
  private readonly schema: string;
  private readonly notifyChannel: string;
  private readonly onWorkspaceChanged?: () => void;

  constructor(options: WorkspaceRepositoryOptions) {
    this.pool = options.pool;
    this.s3 = options.s3;
    this.bucket = options.bucket;
    this.sessionSecret = options.sessionSecret;
    this.schema = options.schema ?? 'printq';
    this.notifyChannel = this.schema !== 'printq'
      ? `${this.schema}_workspace_changed`
      : 'printq_workspace_changed';
    this.onWorkspaceChanged = options.onWorkspaceChanged;
  }

  aliasForId = (jobId: string): string => {
    const hex = crypto
      .createHmac('sha256', this.sessionSecret)
      .update(jobId)
      .digest('hex')
      .slice(0, 16);
    return `job-${hex}`;
  };

  async getObservation(existingClient?: PoolClient): Promise<WorkspaceObservation> {
    if (existingClient) {
      return this.loadAndAdvanceObservation(existingClient, false);
    }
    return withTransaction(this.pool, (client) => this.loadAndAdvanceObservation(client, false));
  }

  async getStudentObservation(userId: string): Promise<StudentObservation> {
    const obs = await this.getObservation();
    return projectStudentObservation(obs, userId, this.aliasForId, 'shared', null);
  }

  async getStudentQuote(input: QuoteInput): Promise<PrintQuote> {
    const obs = await this.getObservation();
    return buildStudentQuote(obs.snapshot, obs.observedAt, input, 'shared');
  }

  async getStudentJob(userId: string, jobId: string): Promise<PrintJob> {
    const obs = await this.getObservation();
    const studentObs = projectStudentObservation(obs, userId, this.aliasForId, 'shared', null);
    const job = studentObs.jobs.find((j) => j.id === jobId);
    if (!job) {
      throw new HttpError(404, 'JOB_NOT_FOUND', 'Job not found.');
    }
    return job;
  }

  async getStudentPickupWindow(userId: string, target: EstimateTarget): Promise<PickupWindowResult> {
    const obs = await this.getObservation();
    if (target.kind === 'job') {
      const meta = obs.submissionsByJobId[target.jobId];
      if (!meta || meta.studentId !== userId) {
        throw new HttpError(404, 'JOB_NOT_FOUND', 'Job not found.');
      }
    }
    return buildStudentPickupWindow(obs.snapshot, obs.observedAt, target, 'shared');
  }

  async getStudentUrgentImpact(userId: string, jobId: string): Promise<UrgentImpact> {
    const obs = await this.getObservation();
    const meta = obs.submissionsByJobId[jobId];
    if (!meta || meta.studentId !== userId) {
      throw new HttpError(404, 'JOB_NOT_FOUND', 'Job not found.');
    }
    const impact = buildStudentUrgentImpact(obs.snapshot, obs.observedAt, jobId, 'shared');
    if (!impact) {
      throw new HttpError(404, 'JOB_NOT_FOUND', 'Job not found.');
    }
    return impact;
  }

  async requestStudentUrgent(userId: string, jobId: string): Promise<StudentObservation> {
    const obs = await withTransaction(this.pool, async (client) => {
      const current = await this.loadAndAdvanceObservation(client, true);
      const meta = current.submissionsByJobId[jobId];
      if (!meta || meta.studentId !== userId) {
        throw new HttpError(404, 'JOB_NOT_FOUND', 'Job not found.');
      }
      const now = Date.now();
      try {
        requestUrgency(current.snapshot, jobId, now);
      } catch (error) {
        throw new HttpError(409, 'INVALID_TRANSITION', error instanceof Error ? error.message : 'Cannot request urgency.');
      }
      const nextSnapshot = calculateSnapshot(current.snapshot, now);
      return this.persistSnapshotUpdate(client, nextSnapshot, current.submissionsByJobId, now);
    });
    this.onWorkspaceChanged?.();
    return projectStudentObservation(obs, userId, this.aliasForId, 'shared', null);
  }

  async getStudentInsights(): Promise<ShopInsights> {
    const obs = await this.getObservation();
    return buildStudentInsights(obs.snapshot, obs.observedAt, 'shared');
  }

  async simulateStudentWhatIf(userId: string, request: WhatIfRequest): Promise<WhatIfResult> {
    const obs = await this.getObservation();
    if (request.jobId) {
      const meta = obs.submissionsByJobId[request.jobId];
      if (!meta || meta.studentId !== userId) {
        throw new HttpError(404, 'JOB_NOT_FOUND', 'Job not found.');
      }
    }
    const result = buildStudentWhatIf(obs.snapshot, obs.observedAt, request, 'shared');
    if (!result) {
      throw new HttpError(400, 'INVALID_WHAT_IF', 'Unable to simulate scenario.');
    }
    return result;
  }

  async prepareUpload(
    studentId: string,
    clientRequestId: string,
    rawInput: JobInput,
    rawFileMeta: UploadFileMeta,
  ): Promise<PrepareUploadResult> {
    const input = validateJobInput({ ...rawInput, clientRequestId });
    const fileMeta = validateFileMeta(rawFileMeta);
    const intentHash = computeIntentHash(input, fileMeta);

    return withTransaction(this.pool, async (client) => {
      const uploadRes = await client.query<UploadRow>(
        `SELECT * FROM ${this.schema}.uploads WHERE student_id = $1 AND client_request_id = $2 FOR UPDATE`,
        [studentId, input.clientRequestId],
      );

      const jobRes = await client.query<JobRow>(
        `SELECT * FROM ${this.schema}.jobs WHERE student_id = $1 AND client_request_id = $2`,
        [studentId, input.clientRequestId],
      );

      if (jobRes.rows.length > 0) {
        const existingJob = jobRes.rows[0]!;
        if (existingJob.fingerprint !== intentHash) {
          throw new HttpError(409, 'IDEMPOTENCY_CONFLICT', 'A different job was already submitted with this clientRequestId.');
        }
        const obs = await this.loadAndAdvanceObservation(client, false);
        const studentObs = projectStudentObservation(obs, studentId, this.aliasForId, 'shared', null);
        const job = studentObs.jobs.find((j) => j.id === existingJob.id);
        if (!job) {
          throw new HttpError(500, 'JOB_MISSING', 'Committed job could not be projected.');
        }
        return { kind: 'committed', job, observation: studentObs };
      }

      if (uploadRes.rows.length > 0) {
        const existing = uploadRes.rows[0]!;
        if (existing.intent_hash !== intentHash) {
          throw new HttpError(409, 'IDEMPOTENCY_CONFLICT', 'A different upload was already prepared with this clientRequestId.');
        }

        const expired = new Date(existing.expires_at).getTime() <= Date.now();
        if (!expired) {
          const presigned = await createPresignedPutUrl(
            this.s3,
            this.bucket,
            existing.object_key,
            existing.mime_type,
            PRESIGN_TTL_SECONDS,
          );
          return {
            kind: 'pending',
            uploadId: existing.id,
            objectKey: existing.object_key,
            putUrl: presigned.putUrl,
            expiresAt: presigned.expiresAt,
          };
        }

        await deleteS3Object(this.s3, this.bucket, existing.object_key);
        const newObjectKey = `uploads/${studentId}/${crypto.randomUUID()}-${fileMeta.filename}`;
        const newExpiresAt = new Date(Date.now() + UPLOAD_TTL_MS).toISOString();
        await client.query(
          `UPDATE ${this.schema}.uploads SET object_key = $1, expires_at = $2 WHERE id = $3`,
          [newObjectKey, newExpiresAt, existing.id],
        );
        const presigned = await createPresignedPutUrl(
          this.s3,
          this.bucket,
          newObjectKey,
          fileMeta.mimeType,
          PRESIGN_TTL_SECONDS,
        );
        return {
          kind: 'pending',
          uploadId: existing.id,
          objectKey: newObjectKey,
          putUrl: presigned.putUrl,
          expiresAt: presigned.expiresAt,
        };
      }

      const uploadId = crypto.randomUUID();
      const objectKey = `uploads/${studentId}/${crypto.randomUUID()}-${fileMeta.filename}`;
      const expiresAt = new Date(Date.now() + UPLOAD_TTL_MS).toISOString();
      await client.query(
        `
        INSERT INTO ${this.schema}.uploads
          (id, student_id, client_request_id, intent_hash, object_key, filename, mime_type, byte_size, sha256, state, expires_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending', $10)
        `,
        [
          uploadId,
          studentId,
          input.clientRequestId,
          intentHash,
          objectKey,
          fileMeta.filename,
          fileMeta.mimeType,
          fileMeta.byteSize,
          fileMeta.sha256,
          expiresAt,
        ],
      );

      const presigned = await createPresignedPutUrl(
        this.s3,
        this.bucket,
        objectKey,
        fileMeta.mimeType,
        PRESIGN_TTL_SECONDS,
      );

      return {
        kind: 'pending',
        uploadId,
        objectKey,
        putUrl: presigned.putUrl,
        expiresAt: presigned.expiresAt,
      };
    });
  }

  async commitStudentJob(
    studentId: string,
    clientRequestId: string,
    rawInput: JobInput,
    uploadId: string | null,
  ): Promise<CommitJobResult> {
    const input = validateJobInput({ ...rawInput, clientRequestId });

    const result = await withTransaction(this.pool, async (client) => {
      let uploadRow: UploadRow | null = null;
      if (uploadId) {
        const uRes = await client.query<UploadRow>(
          `SELECT * FROM ${this.schema}.uploads WHERE id = $1 FOR UPDATE`,
          [uploadId],
        );
        if (uRes.rows.length === 0 || uRes.rows[0]!.student_id !== studentId) {
          throw new HttpError(404, 'UPLOAD_NOT_FOUND', 'Upload not found.');
        }
        uploadRow = uRes.rows[0]!;
      }

      const intentHash = computeIntentHash(
        input,
        uploadRow
          ? {
              filename: uploadRow.filename,
              mimeType: uploadRow.mime_type,
              byteSize: Number(uploadRow.byte_size),
              sha256: uploadRow.sha256,
            }
          : undefined,
      );

      const existingJobRes = await client.query<JobRow>(
        `SELECT * FROM ${this.schema}.jobs WHERE student_id = $1 AND client_request_id = $2`,
        [studentId, input.clientRequestId],
      );

      if (existingJobRes.rows.length > 0) {
        const existingJob = existingJobRes.rows[0]!;
        if (existingJob.fingerprint !== intentHash) {
          throw new HttpError(409, 'IDEMPOTENCY_CONFLICT', 'A different job was already submitted with this clientRequestId.');
        }
        const obs = await this.loadAndAdvanceObservation(client, false);
        const studentObs = projectStudentObservation(obs, studentId, this.aliasForId, 'shared', null);
        const job = studentObs.jobs.find((j) => j.id === existingJob.id);
        if (!job) {
          throw new HttpError(500, 'JOB_MISSING', 'Committed job could not be projected.');
        }
        return { created: false, job, observation: studentObs };
      }

      if (uploadRow) {
        if (uploadRow.state !== 'pending') {
          throw new HttpError(409, 'UPLOAD_ALREADY_COMMITTED', 'Upload has already been committed.');
        }
        if (uploadRow.intent_hash !== intentHash) {
          throw new HttpError(409, 'IDEMPOTENCY_CONFLICT', 'Upload intent does not match job input.');
        }
        if (new Date(uploadRow.expires_at).getTime() <= Date.now()) {
          throw new HttpError(410, 'UPLOAD_EXPIRED', 'Upload has expired.');
        }

        const bytes = await readObjectBounded(this.s3, this.bucket, uploadRow.object_key, CONNECTED_MAX_FILE_BYTES);
        if (bytes.length !== Number(uploadRow.byte_size) || bytes.length > CONNECTED_MAX_FILE_BYTES) {
          throw new HttpError(400, 'UPLOAD_SIZE_MISMATCH', 'Uploaded object size does not match declared byteSize.');
        }
        const actualSha256 = crypto.createHash('sha256').update(bytes).digest('hex');
        if (actualSha256 !== uploadRow.sha256) {
          throw new HttpError(400, 'UPLOAD_CHECKSUM_MISMATCH', 'Uploaded object checksum does not match declared sha256.');
        }
        validateUploadedBytes(bytes, uploadRow.filename);

        await client.query(
          `UPDATE ${this.schema}.uploads SET state = 'committed' WHERE id = $1`,
          [uploadRow.id],
        );
      }

      const current = await this.loadAndAdvanceObservation(client, true);
      if (current.snapshot.jobs.length >= MAX_QUEUE_JOBS) {
        throw new HttpError(409, 'QUEUE_FULL', 'Print queue has reached maximum capacity.');
      }

      const now = Date.now();
      const nowIso = new Date(now).toISOString();
      const jobId = crypto.randomUUID();
      const token = createConnectedPickupToken();
      const queuedCount = current.snapshot.jobs.filter((j) => j.status === 'queued').length;

      const newJob: Job = {
        id: jobId,
        token,
        documentName: input.documentName,
        documentId: uploadRow ? uploadRow.id : null,
        originalFileName: uploadRow ? uploadRow.filename : null,
        mimeType: uploadRow ? uploadRow.mime_type : null,
        fileSize: uploadRow ? Number(uploadRow.byte_size) : null,
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
        queuePosition: queuedCount + 1,
        estimatedCost: cost(
          { pageCount: input.pageCount, copies: input.copies, colorMode: input.colorMode },
          current.snapshot.settings,
        ),
        estimatedDurationMinutes: duration({
          pageCount: input.pageCount,
          copies: input.copies,
          colorMode: input.colorMode,
        }),
        estimatedWaitMinutes: null,
        estimatedPickupAt: null,
        pickupWindowEnd: null,
        createdAt: nowIso,
        updatedAt: nowIso,
        printingStartedAt: null,
        readyAt: null,
        collectedAt: null,
        remainingMinutes: null,
      };

      const nextSubmissions: Record<string, SubmissionMetadata> = {
        ...current.submissionsByJobId,
        [jobId]: {
          studentId,
          clientRequestId: input.clientRequestId,
          pageCountSource: input.pageCountSource,
        },
      };

      current.snapshot.jobs.push(newJob);
      const calculated = calculateSnapshot(current.snapshot, now);

      await client.query(
        `
        INSERT INTO ${this.schema}.jobs
          (id, shop_id, student_id, client_request_id, fingerprint, page_count_source, token, document_id, data)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
        `,
        [
          jobId,
          SHOP_ID,
          studentId,
          input.clientRequestId,
          intentHash,
          input.pageCountSource,
          token,
          uploadRow ? uploadRow.id : null,
          JSON.stringify(calculated.jobs.find((j) => j.id === jobId) ?? newJob),
        ],
      );

      const updatedObs = await this.persistSnapshotUpdate(client, calculated, nextSubmissions, now);
      const studentObs = projectStudentObservation(updatedObs, studentId, this.aliasForId, 'shared', null);
      const createdJob = studentObs.jobs.find((j) => j.id === jobId);
      if (!createdJob) {
        throw new HttpError(500, 'JOB_MISSING', 'Created job could not be projected.');
      }
      return { created: true, job: createdJob, observation: studentObs };
    });

    if (result.created) {
      this.onWorkspaceChanged?.();
    }
    return result;
  }

  async getAuthorizedDocument(session: AuthenticatedSession, docId: string): Promise<AuthorizedDocumentStream> {
    const res = await this.pool.query<UploadRow & { job_student_id: string | null }>(
      `
      SELECT u.*, j.student_id AS job_student_id
      FROM ${this.schema}.uploads u
      LEFT JOIN ${this.schema}.jobs j ON j.document_id = u.id
      WHERE u.id = $1
      LIMIT 1
      `,
      [docId],
    );

    if (res.rows.length === 0) {
      throw new HttpError(404, 'DOCUMENT_NOT_FOUND', 'Document not found.');
    }

    const row = res.rows[0]!;
    const ownerId = row.job_student_id ?? row.student_id;
    if (session.role !== 'shopkeeper' && ownerId !== session.user.id) {
      throw new HttpError(404, 'DOCUMENT_NOT_FOUND', 'Document not found.');
    }

    try {
      const obj = await getObjectStream(this.s3, this.bucket, row.object_key);
      const ext = getFileExtension(row.filename);
      const disposition = ext === 'doc' || ext === 'docx' ? 'attachment' : 'inline';
      return {
        stream: obj.stream,
        mimeType: row.mime_type,
        filename: sanitizeFilename(row.filename),
        disposition,
        contentLength: obj.contentLength,
      };
    } catch (error) {
      const name = error instanceof Error ? error.name : '';
      if (name === 'NoSuchKey' || name === 'NotFound') {
        throw new HttpError(404, 'DOCUMENT_NOT_FOUND', 'Document object not found in storage.');
      }
      throw error;
    }
  }

  async getShopkeeperSnapshot(): Promise<Snapshot> {
    const obs = await this.getObservation();
    return obs.snapshot;
  }

  async updateJobStatus(id: string, status: 'printing' | 'ready', expectedRevision: number): Promise<Snapshot> {
    return this.mutateShopkeeperSnapshot(expectedRevision, (snapshot, now) => {
      try {
        transitionJob(snapshot, id, status, now, false);
      } catch (error) {
        throw new HttpError(409, 'INVALID_TRANSITION', error instanceof Error ? error.message : 'Invalid status transition.');
      }
    });
  }

  async reorderQueue(ids: string[], expectedRevision: number): Promise<Snapshot> {
    return this.mutateShopkeeperSnapshot(expectedRevision, (snapshot, now) => {
      try {
        setOrder(snapshot, ids, now);
      } catch (error) {
        throw new HttpError(400, 'INVALID_REORDER', error instanceof Error ? error.message : 'Invalid queue order.');
      }
    });
  }

  async getUrgentImpactPreview(id: string): Promise<QueuePreview> {
    const obs = await this.getObservation();
    const after = structuredClone(obs.snapshot);
    const now = Date.now();
    try {
      promoteUrgent(after, id, now);
    } catch (error) {
      throw new HttpError(400, 'INVALID_URGENT_PREVIEW', error instanceof Error ? error.message : 'Cannot preview urgent impact.');
    }
    return preview(obs.snapshot, calculateSnapshot(after, now));
  }

  async approveUrgent(id: string, expectedRevision: number): Promise<Snapshot> {
    return this.mutateShopkeeperSnapshot(expectedRevision, (snapshot, now) => {
      try {
        promoteUrgent(snapshot, id, now);
      } catch (error) {
        throw new HttpError(409, 'INVALID_TRANSITION', error instanceof Error ? error.message : 'Cannot approve urgent request.');
      }
    });
  }

  async rejectUrgent(id: string, expectedRevision: number): Promise<Snapshot> {
    return this.mutateShopkeeperSnapshot(expectedRevision, (snapshot, now) => {
      const job = snapshot.jobs.find((j) => j.id === id);
      if (!job) {
        throw new HttpError(404, 'JOB_NOT_FOUND', 'Job not found.');
      }
      if (job.urgentRequestStatus !== 'pending') {
        throw new HttpError(409, 'INVALID_TRANSITION', 'Job does not have a pending urgent request.');
      }
      job.urgentRequestStatus = 'rejected';
      job.updatedAt = new Date(now).toISOString();
    });
  }

  async markUrgent(id: string, expectedRevision: number): Promise<Snapshot> {
    return this.mutateShopkeeperSnapshot(expectedRevision, (snapshot, now) => {
      try {
        promoteUrgent(snapshot, id, now);
      } catch (error) {
        throw new HttpError(409, 'INVALID_TRANSITION', error instanceof Error ? error.message : 'Cannot mark job urgent.');
      }
    });
  }

  async getOptimizationPreview(): Promise<QueuePreview> {
    const obs = await this.getObservation();
    const now = Date.now();
    return preview(obs.snapshot, optimize(obs.snapshot, now));
  }

  async applyOptimizedQueue(expectedRevision: number): Promise<Snapshot> {
    return this.mutateShopkeeperSnapshot(expectedRevision, (snapshot, now) => {
      const optimized = optimize(snapshot, now);
      snapshot.jobs = optimized.jobs;
    });
  }

  async getSimulationPreview(scenario: SimulationScenario): Promise<QueuePreview> {
    const obs = await this.getObservation();
    const now = Date.now();
    try {
      return simulate(obs.snapshot, scenario, now);
    } catch (error) {
      throw new HttpError(400, 'INVALID_SIMULATION', error instanceof Error ? error.message : 'Invalid simulation scenario.');
    }
  }

  async applySimulation(scenario: SimulationScenario, expectedRevision: number): Promise<Snapshot> {
    return this.mutateShopkeeperSnapshot(expectedRevision, (snapshot, now) => {
      try {
        const result = simulate(snapshot, scenario, now);
        snapshot.jobs = result.after.jobs.filter((j) => !j.hypothetical);
        snapshot.printer = result.after.printer;
      } catch (error) {
        throw new HttpError(400, 'INVALID_SIMULATION', error instanceof Error ? error.message : 'Invalid simulation scenario.');
      }
    });
  }

  async updatePrinter(state: PrinterState, downtime: number | null, expectedRevision: number): Promise<Snapshot> {
    return this.mutateShopkeeperSnapshot(expectedRevision, (snapshot, now) => {
      try {
        changePrinter(snapshot, state, downtime, now);
      } catch (error) {
        throw new HttpError(400, 'INVALID_PRINTER_STATE', error instanceof Error ? error.message : 'Invalid printer update.');
      }
    });
  }

  async updateSettings(settings: ShopSettings, expectedRevision: number): Promise<Snapshot> {
    try {
      validateSettings(settings);
    } catch (error) {
      throw new HttpError(400, 'INVALID_SETTINGS', error instanceof Error ? error.message : 'Invalid settings.');
    }
    return this.mutateShopkeeperSnapshot(expectedRevision, (snapshot) => {
      snapshot.settings = { ...settings };
    });
  }

  async getAnalytics(): Promise<Analytics> {
    const obs = await this.getObservation();
    return calculateAnalytics(obs.snapshot, Date.now());
  }

  async verifyPickupToken(sessionId: string, payload: string): Promise<Job> {
    const token = decodePickupPayload(payload, false);
    if (!token) {
      throw new HttpError(400, 'INVALID_PICKUP_TOKEN', 'Invalid pickup token format.');
    }

    return withTransaction(this.pool, async (client) => {
      const obs = await this.loadAndAdvanceObservation(client, false);
      const job = obs.snapshot.jobs.find((j) => j.token === token && j.status === 'ready');
      if (!job) {
        throw new HttpError(404, 'READY_JOB_NOT_FOUND', 'No ready job matches this pickup token.');
      }

      const expiresAt = new Date(Date.now() + PICKUP_VERIFICATION_TTL_MS).toISOString();
      await client.query(
        `
        INSERT INTO ${this.schema}.pickup_verifications (session_id, job_id, expires_at)
        VALUES ($1, $2, $3)
        ON CONFLICT (session_id, job_id) DO UPDATE SET expires_at = EXCLUDED.expires_at
        `,
        [sessionId, job.id, expiresAt],
      );

      return job;
    });
  }

  async collectJob(sessionId: string, id: string, expectedRevision: number): Promise<Snapshot> {
    const obs = await withTransaction(this.pool, async (client) => {
      const current = await this.loadAndAdvanceObservation(client, true);
      if (current.snapshot.revision !== expectedRevision) {
        throw new HttpError(409, 'REVISION_CONFLICT', 'Workspace revision has changed.');
      }

      const verifyRes = await client.query<{ job_id: string }>(
        `
        SELECT job_id FROM ${this.schema}.pickup_verifications
        WHERE session_id = $1 AND job_id = $2 AND expires_at > now()
        FOR UPDATE
        `,
        [sessionId, id],
      );
      if (verifyRes.rows.length === 0) {
        throw new HttpError(403, 'PICKUP_VERIFICATION_REQUIRED', 'Pickup token verification is required before collecting this job.');
      }

      const now = Date.now();
      try {
        transitionJob(current.snapshot, id, 'collected', now, true);
      } catch (error) {
        throw new HttpError(409, 'INVALID_TRANSITION', error instanceof Error ? error.message : 'Cannot collect job.');
      }

      await client.query(
        `DELETE FROM ${this.schema}.pickup_verifications WHERE session_id = $1 AND job_id = $2`,
        [sessionId, id],
      );

      const nextSnapshot = calculateSnapshot(current.snapshot, now);
      return this.persistSnapshotUpdate(client, nextSnapshot, current.submissionsByJobId, now);
    });

    this.onWorkspaceChanged?.();
    return obs.snapshot;
  }

  private async mutateShopkeeperSnapshot(
    expectedRevision: number,
    mutator: (snapshot: Snapshot, now: number) => void,
  ): Promise<Snapshot> {
    const obs = await withTransaction(this.pool, async (client) => {
      const current = await this.loadAndAdvanceObservation(client, true);
      if (current.snapshot.revision !== expectedRevision) {
        throw new HttpError(409, 'REVISION_CONFLICT', 'Workspace revision has changed.');
      }
      const now = Date.now();
      mutator(current.snapshot, now);
      const nextSnapshot = calculateSnapshot(current.snapshot, now);
      return this.persistSnapshotUpdate(client, nextSnapshot, current.submissionsByJobId, now);
    });
    this.onWorkspaceChanged?.();
    return obs.snapshot;
  }

  private async loadAndAdvanceObservation(
    client: PoolClient,
    forUpdate: boolean,
  ): Promise<WorkspaceObservation> {
    const lockClause = forUpdate ? ' FOR UPDATE' : '';
    const stateRes = await client.query<ShopStateRow>(
      `SELECT * FROM ${this.schema}.shop_state WHERE id = $1${lockClause}`,
      [SHOP_ID],
    );
    if (stateRes.rows.length === 0) {
      throw new HttpError(500, 'SHOP_STATE_MISSING', 'Shop state row is missing.');
    }
    const stateRow = stateRes.rows[0]!;
    const revision = parseSafeRevision(stateRow.revision);
    const observedAtIso = toIsoString(stateRow.observed_at);

    const jobsRes = await client.query<JobRow>(
      `SELECT * FROM ${this.schema}.jobs WHERE shop_id = $1 ORDER BY (data->>'createdAt') ASC, id ASC`,
      [SHOP_ID],
    );

    const submissionsByJobId: Record<string, SubmissionMetadata> = {};
    const jobs: Job[] = [];
    for (const row of jobsRes.rows) {
      jobs.push(row.data);
      submissionsByJobId[row.id] = {
        studentId: row.student_id,
        clientRequestId: row.client_request_id,
        pageCountSource: row.page_count_source,
      };
    }

    const baseSnapshot: Snapshot = {
      revision,
      jobs,
      printer: stateRow.printer,
      settings: stateRow.settings,
      activity: stateRow.activity,
      mode: 'integrated',
    };

    const now = Date.now();
    const observedMs = Date.parse(observedAtIso);
    const downtimeExpired =
      baseSnapshot.printer.state !== 'operational' &&
      baseSnapshot.printer.downtimeMinutes !== null &&
      Date.parse(baseSnapshot.printer.changedAt) + baseSnapshot.printer.downtimeMinutes * 60_000 <= now;

    if (now - observedMs >= 15_000 || downtimeExpired) {
      const recalculated = calculateSnapshot(baseSnapshot, now);
      const changed =
        JSON.stringify(recalculated.jobs) !== JSON.stringify(baseSnapshot.jobs) ||
        JSON.stringify(recalculated.printer) !== JSON.stringify(baseSnapshot.printer);

      if (changed) {
        return this.persistSnapshotUpdate(client, recalculated, submissionsByJobId, now);
      }
    }

    return {
      snapshot: baseSnapshot,
      observedAt: observedAtIso,
      submissionsByJobId,
    };
  }

  private async persistSnapshotUpdate(
    client: PoolClient,
    snapshot: Snapshot,
    submissionsByJobId: Record<string, SubmissionMetadata>,
    now: number,
  ): Promise<WorkspaceObservation> {
    const nextRevision = snapshot.revision + 1;
    const observedAt = new Date(now).toISOString();
    const updatedSnapshot: Snapshot = {
      ...snapshot,
      revision: nextRevision,
    };

    await client.query(
      `
      UPDATE ${this.schema}.shop_state
      SET revision = $1, observed_at = $2, settings = $3::jsonb, printer = $4::jsonb, activity = $5::jsonb
      WHERE id = $6
      `,
      [
        nextRevision,
        observedAt,
        JSON.stringify(updatedSnapshot.settings),
        JSON.stringify(updatedSnapshot.printer),
        JSON.stringify(updatedSnapshot.activity),
        SHOP_ID,
      ],
    );

    for (const job of updatedSnapshot.jobs) {
      await client.query(
        `UPDATE ${this.schema}.jobs SET data = $1::jsonb WHERE id = $2`,
        [JSON.stringify(job), job.id],
      );
    }

    await client.query(`SELECT pg_notify($1, $2)`, [this.notifyChannel, String(nextRevision)]);

    return {
      snapshot: updatedSnapshot,
      observedAt,
      submissionsByJobId,
    };
  }
}
