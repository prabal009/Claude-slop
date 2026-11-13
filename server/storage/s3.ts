import {
  DeleteObjectCommand,
  GetBucketCorsCommand,
  GetObjectCommand,
  PutBucketCorsCommand,
  PutObjectCommand,
  S3Client,
  type CORSRule,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Readable } from 'node:stream';
import type { S3Config } from '../config.ts';

export function createS3Client(config: S3Config): S3Client {
  return new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}

function corsAllowsUpload(rules: CORSRule[] | undefined, origin: string): boolean {
  if (!rules || rules.length === 0) return false;
  return rules.some((rule) => {
    const methods = rule.AllowedMethods ?? [];
    const origins = rule.AllowedOrigins ?? [];
    const hasPut = methods.includes('PUT') || methods.includes('*');
    const hasOrigin = origins.includes('*') || origins.includes(origin);
    return hasPut && hasOrigin;
  });
}

export async function ensureBucketCors(
  client: S3Client,
  bucket: string,
  appUrl: string,
  isProduction: boolean,
): Promise<void> {
  try {
    const existing = await client.send(new GetBucketCorsCommand({ Bucket: bucket }));
    if (corsAllowsUpload(existing.CORSRules, appUrl)) {
      return;
    }
  } catch {
    // Proceed to PutBucketCors if GetBucketCors is unsupported or no CORS policy exists
  }

  const allowedOrigins = isProduction
    ? [appUrl]
    : Array.from(new Set([appUrl, 'http://localhost:5173', 'http://127.0.0.1:5173']));

  try {
    await client.send(
      new PutBucketCorsCommand({
        Bucket: bucket,
        CORSConfiguration: {
          CORSRules: [
            {
              AllowedOrigins: allowedOrigins,
              AllowedMethods: ['PUT'],
              AllowedHeaders: ['Content-Type'],
              ExposeHeaders: ['ETag'],
              MaxAgeSeconds: 300,
            },
          ],
        },
      }),
    );
  } catch (error) {
    const name = error instanceof Error ? error.name : '';
    const status = (error as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
    if (name === 'AccessDenied' || name === 'NotImplemented' || status === 403 || status === 501) {
      // Managed bucket may disallow PutBucketCors while already allowing browser uploads
      return;
    }
    throw error;
  }
}

export async function createPresignedPutUrl(
  client: S3Client,
  bucket: string,
  objectKey: string,
  mimeType: string,
  expiresInSeconds = 300,
): Promise<{ putUrl: string; expiresAt: string }> {
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: objectKey,
    ContentType: mimeType,
  });

  const putUrl = await getSignedUrl(client, command, { expiresIn: expiresInSeconds });
  const expiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString();
  return { putUrl, expiresAt };
}

export async function readObjectBounded(
  client: S3Client,
  bucket: string,
  objectKey: string,
  maxBytes: number,
): Promise<Buffer> {
  const response = await client.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: objectKey,
      Range: `bytes=0-${maxBytes}`,
    }),
  );

  const body = response.Body;
  if (!body) {
    throw new Error('OBJECT_EMPTY');
  }

  const chunks: Buffer[] = [];
  let total = 0;

  for await (const chunk of body as Readable) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buf.length;
    chunks.push(buf);
    if (total > maxBytes) {
      break;
    }
  }

  return Buffer.concat(chunks);
}

export async function getObjectStream(
  client: S3Client,
  bucket: string,
  objectKey: string,
): Promise<{ stream: Readable; contentLength?: number }> {
  const response = await client.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: objectKey,
    }),
  );

  if (!response.Body) {
    throw new Error('OBJECT_NOT_FOUND');
  }

  return {
    stream: response.Body as Readable,
    contentLength: response.ContentLength,
  };
}

export async function deleteS3Object(
  client: S3Client,
  bucket: string,
  objectKey: string,
): Promise<void> {
  try {
    await client.send(
      new DeleteObjectCommand({
        Bucket: bucket,
        Key: objectKey,
      }),
    );
  } catch (error) {
    const name = error instanceof Error ? error.name : '';
    const status = (error as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
    if (name === 'NoSuchKey' || status === 404) {
      return;
    }
    throw error;
  }
}
