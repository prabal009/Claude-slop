import crypto from 'node:crypto';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import type { S3Client } from '@aws-sdk/client-s3';
import { runMigrations } from '../../db/migrations.ts';
import { createPool } from '../../db/pool.ts';
import { reapExpiredUploads } from '../../storage/reapUploads.ts';
import { createS3Client, deleteS3Object } from '../../storage/s3.ts';
import { WorkspaceRepository } from '../../workspace/repository.ts';

const REQUIRED_ENV = [
  'DATABASE_URL',
  'S3_ENDPOINT',
  'S3_REGION',
  'S3_ACCESS_KEY_ID',
  'S3_SECRET_ACCESS_KEY',
  'S3_BUCKET',
] as const;

describe('Connected Postgres + S3 integration', () => {
  const missingEnv = REQUIRED_ENV.filter((key) => !process.env[key]);
  const schema = `printq_test_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
  const uploadedKeys: string[] = [];

  let pool: Pool;
  let s3: S3Client;
  let bucket: string;
  let repo: WorkspaceRepository;

  beforeAll(async () => {
    if (missingEnv.length > 0) {
      throw new Error(
        `Missing required integration environment variables: ${missingEnv.join(', ')}`,
      );
    }

    pool = createPool(process.env.DATABASE_URL!);
    bucket = process.env.S3_BUCKET!;
    s3 = createS3Client({
      endpoint: process.env.S3_ENDPOINT!,
      region: process.env.S3_REGION!,
      accessKeyId: process.env.S3_ACCESS_KEY_ID!,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
      bucket,
    });

    await runMigrations(pool, schema);
    repo = new WorkspaceRepository({
      pool,
      s3,
      bucket,
      sessionSecret: 'integration-test-secret-0123456789',
      schema,
    });
  });

  afterAll(async () => {
    for (const key of uploadedKeys) {
      try {
        await deleteS3Object(s3, bucket, key);
      } catch {
        // Ignore cleanup errors
      }
    }
    if (pool) {
      await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await pool.end();
    }
  });

  it('exercises upload -> commit -> snapshot -> urgency -> pickup verify -> collect -> reaper', async () => {
    const pdfBytes = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n', 'utf8');
    const sha256 = crypto.createHash('sha256').update(pdfBytes).digest('hex');
    const studentId = 'stu-integration-1';
    const clientRequestId = `req-${crypto.randomUUID()}`;

    const jobInput = {
      clientRequestId,
      documentName: 'integration-test.pdf',
      pageCount: 4,
      pageCountSource: 'manual' as const,
      copies: 1,
      colorMode: 'bw' as const,
      duplex: false,
      paperSize: 'A4' as const,
      instructions: 'Integration test',
    };

    const prepared = await repo.prepareUpload(studentId, clientRequestId, jobInput, {
      filename: 'integration-test.pdf',
      mimeType: 'application/pdf',
      byteSize: pdfBytes.length,
      sha256,
    });

    expect(prepared.kind).toBe('pending');
    if (prepared.kind !== 'pending') throw new Error('Expected pending upload');
    uploadedKeys.push(prepared.objectKey);

    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: prepared.objectKey,
        Body: pdfBytes,
        ContentType: 'application/pdf',
      }),
    );

    const committed = await repo.commitStudentJob(studentId, clientRequestId, jobInput, prepared.uploadId);
    expect(committed.created).toBe(true);
    expect(committed.job.status).toBe('queued');

    const urgentObs = await repo.requestStudentUrgent(studentId, committed.job.id);
    expect(urgentObs.jobs.find((j) => j.id === committed.job.id)?.urgentRequestStatus).toBe('pending');

    let snap = await repo.getShopkeeperSnapshot();
    snap = await repo.approveUrgent(committed.job.id, snap.revision);
    snap = await repo.updateJobStatus(committed.job.id, 'printing', snap.revision);
    snap = await repo.updateJobStatus(committed.job.id, 'ready', snap.revision);

    const verifiedJob = await repo.verifyPickupToken('shop-session-1', committed.job.token);
    expect(verifiedJob.id).toBe(committed.job.id);

    const collectedSnap = await repo.collectJob('shop-session-1', committed.job.id, snap.revision);
    expect(collectedSnap.jobs.find((j) => j.id === committed.job.id)?.status).toBe('collected');

    const reaped = await reapExpiredUploads(pool, s3, bucket);
    expect(reaped).toBeGreaterThanOrEqual(0);
  });
});
