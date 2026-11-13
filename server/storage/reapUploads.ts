import type { S3Client } from '@aws-sdk/client-s3';
import type { Pool } from 'pg';
import { deleteS3Object } from './s3.ts';

export async function reapExpiredUploads(
  pool: Pool,
  s3: S3Client,
  bucket: string,
): Promise<number> {
  let reaped = 0;

  while (true) {
    const client = await pool.connect();
    let batchCount = 0;

    try {
      await client.query('BEGIN');
      const { rows } = await client.query<{ id: string; object_key: string }>(
        `
        SELECT u.id, u.object_key
        FROM printq.uploads u
        WHERE u.state = 'pending'
          AND u.expires_at <= now()
          AND NOT EXISTS (
            SELECT 1 FROM printq.jobs j WHERE j.document_id = u.id
          )
        LIMIT 50
        FOR UPDATE OF u SKIP LOCKED
        `,
      );

      batchCount = rows.length;
      for (const row of rows) {
        await deleteS3Object(s3, bucket, row.object_key);
        await client.query('DELETE FROM printq.uploads WHERE id = $1', [row.id]);
        reaped += 1;
      }

      await client.query('COMMIT');
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // Ignore rollback error
      }
      throw error;
    } finally {
      client.release();
    }

    if (batchCount < 50) {
      break;
    }
  }

  return reaped;
}

export function startUploadReaper(
  pool: Pool,
  s3: S3Client,
  bucket: string,
): () => void {
  const run = () => {
    void reapExpiredUploads(pool, s3, bucket).catch((err) => {
      console.error('[upload-reaper] error:', err instanceof Error ? err.message : 'unknown');
    });
  };

  run();
  const timer = setInterval(run, 60 * 60 * 1000);
  timer.unref();

  return () => {
    clearInterval(timer);
  };
}
