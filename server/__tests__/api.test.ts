import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { S3Client } from '@aws-sdk/client-s3';
import express from 'express';
import type { Pool } from 'pg';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import type { AuthenticatedSession } from '../auth/session.ts';
import type { CloudConfig, DemoConfig } from '../config.ts';
import { createApp } from '../app.ts';

function makeDemoConfig(): DemoConfig {
  return {
    mode: 'demo',
    isProduction: false,
    host: '127.0.0.1',
    port: 0,
    appUrl: 'http://127.0.0.1:5173',
  };
}

function makeCloudConfig(isProduction = false): CloudConfig {
  return {
    mode: 'cloud',
    isProduction,
    host: '127.0.0.1',
    port: 0,
    appUrl: 'http://127.0.0.1:5173',
    databaseUrl: 'postgres://unused:unused@127.0.0.1:5432/unused',
    neonAuthBaseUrl: 'https://auth.example.test',
    sessionSecret: 'test-session-secret-0123456789abcdef',
    s3: {
      endpoint: 'https://s3.example.test',
      region: 'us-east-1',
      accessKeyId: 'test',
      secretAccessKey: 'test',
      bucket: 'test-bucket',
    },
  };
}

function makeFakePool(options?: {
  revision?: string;
  jobs?: Array<{ id: string; student_id: string; client_request_id: string; page_count_source: string; data: unknown }>;
  hasVerification?: boolean;
}): Pool {
  const revision = options?.revision ?? '3';
  const jobs = options?.jobs ?? [];
  const hasVerification = options?.hasVerification ?? false;

  const client = {
    query: vi.fn(async (sql: string) => {
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
        return { rows: [] };
      }
      if (sql.includes('FROM printq.shop_state')) {
        return {
          rows: [
            {
              id: 'campus',
              revision,
              observed_at: new Date().toISOString(),
              settings: {
                shopName: 'Campus Print Studio',
                bwPrice: 2,
                colourPrice: 10,
                pickupBufferMinutes: 15,
                opensAt: '08:00',
                closesAt: '20:00',
              },
              printer: {
                state: 'operational',
                downtimeMinutes: null,
                changedAt: '2026-01-01T00:00:00.000Z',
                recordedDowntimeMinutes: 0,
              },
              activity: [],
            },
          ],
        };
      }
      if (sql.includes('FROM printq.jobs')) {
        return { rows: jobs };
      }
      if (sql.includes('FROM printq.pickup_verifications')) {
        return { rows: hasVerification ? [{ job_id: 'job-1' }] : [] };
      }
      return { rows: [] };
    }),
    release: vi.fn(),
  };

  return {
    connect: vi.fn(async () => client),
    query: client.query,
  } as unknown as Pool;
}

describe('API unit tests', () => {
  it('exposes only /api/runtime in demo mode and returns 404 for cloud routes', async () => {
    const { app } = createApp(makeDemoConfig());

    const runtimeRes = await request(app).get('/api/runtime');
    expect(runtimeRes.status).toBe(200);
    expect(runtimeRes.body).toEqual({ mode: 'demo', shopId: 'campus' });

    const studentRes = await request(app).get('/api/student/observation');
    expect(studentRes.status).toBe(404);
    expect(studentRes.body.error.code).toBe('NOT_FOUND');
  });

  it('enforces 401 unauthenticated and 403 shopkeeper role on protected routes', async () => {
    const pool = makeFakePool();
    const s3 = {} as S3Client;

    const requireSessionMw: express.RequestHandler = (req, res, next) => {
      const roleHeader = req.header('x-test-role');
      if (!roleHeader) {
        res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required.' } });
        return;
      }
      const session: AuthenticatedSession = {
        id: 'sess-1',
        user: { id: 'user-1', name: 'Test User', email: 'test@example.com' },
        role: roleHeader === 'shopkeeper' ? 'shopkeeper' : 'student',
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      };
      res.locals.session = session;
      next();
    };

    const requireShopkeeperMw: express.RequestHandler = (req, res, next) => {
      requireSessionMw(req, res, () => {
        const session = res.locals.session as AuthenticatedSession;
        if (session.role !== 'shopkeeper') {
          res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Shopkeeper role required.' } });
          return;
        }
        next();
      });
    };

    const { app } = createApp(makeCloudConfig(false), {
      pool,
      s3,
      authRouter: express.Router(),
      sessionHandler: (_req, res) => res.status(200).json({ session: null }),
      requireSessionMiddleware: requireSessionMw,
      requireShopkeeperMiddleware: requireShopkeeperMw,
    });

    const unauth = await request(app).get('/api/student/observation');
    expect(unauth.status).toBe(401);

    const forbidden = await request(app)
      .get('/api/shopkeeper/snapshot')
      .set('x-test-role', 'student');
    expect(forbidden.status).toBe(403);

    const ok = await request(app)
      .get('/api/shopkeeper/snapshot')
      .set('x-test-role', 'shopkeeper');
    expect(ok.status).toBe(200);
    expect(ok.body.revision).toBe(3);
  });

  it('returns 409 REVISION_CONFLICT on stale shopkeeper mutation', async () => {
    const pool = makeFakePool({ revision: '5' });
    const s3 = {} as S3Client;
    const allowShopkeeper: express.RequestHandler = (_req, res, next) => {
      res.locals.session = {
        id: 'sess-1',
        user: { id: 'shop-1', name: 'Shopkeeper', email: 'shop@example.com' },
        role: 'shopkeeper',
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      } satisfies AuthenticatedSession;
      next();
    };

    const { app } = createApp(makeCloudConfig(false), {
      pool,
      s3,
      authRouter: express.Router(),
      sessionHandler: (_req, res) => res.status(200).json({ session: null }),
      requireSessionMiddleware: allowShopkeeper,
      requireShopkeeperMiddleware: allowShopkeeper,
    });

    const res = await request(app)
      .post('/api/shopkeeper/printer')
      .send({ state: 'paused', downtimeMinutes: 10, revision: 2 });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('REVISION_CONFLICT');
  });

  it('rejects invalid upload metadata with 400', async () => {
    const pool = makeFakePool();
    const s3 = {} as S3Client;
    const allowStudent: express.RequestHandler = (_req, res, next) => {
      res.locals.session = {
        id: 'sess-1',
        user: { id: 'stu-1', name: 'Student', email: 'stu@example.com' },
        role: 'student',
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      } satisfies AuthenticatedSession;
      next();
    };

    const { app } = createApp(makeCloudConfig(false), {
      pool,
      s3,
      authRouter: express.Router(),
      sessionHandler: (_req, res) => res.status(200).json({ session: null }),
      requireSessionMiddleware: allowStudent,
      requireShopkeeperMiddleware: allowStudent,
    });

    const res = await request(app)
      .post('/api/uploads/prepare')
      .send({
        clientRequestId: 'req-1',
        input: {
          clientRequestId: 'req-1',
          documentName: 'test.exe',
          pageCount: 2,
          pageCountSource: 'manual',
          copies: 1,
          colorMode: 'bw',
          duplex: false,
          paperSize: 'A4',
          instructions: '',
        },
        fileMeta: {
          filename: 'test.exe',
          mimeType: 'application/octet-stream',
          byteSize: 1024,
          sha256: 'a'.repeat(64),
        },
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_DOCUMENT');
  });

  it('requires pickup verification proof before collecting a job', async () => {
    const pool = makeFakePool({ revision: '3', hasVerification: false });
    const s3 = {} as S3Client;
    const allowShopkeeper: express.RequestHandler = (_req, res, next) => {
      res.locals.session = {
        id: 'sess-1',
        user: { id: 'shop-1', name: 'Shopkeeper', email: 'shop@example.com' },
        role: 'shopkeeper',
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      } satisfies AuthenticatedSession;
      next();
    };

    const { app } = createApp(makeCloudConfig(false), {
      pool,
      s3,
      authRouter: express.Router(),
      sessionHandler: (_req, res) => res.status(200).json({ session: null }),
      requireSessionMiddleware: allowShopkeeper,
      requireShopkeeperMiddleware: allowShopkeeper,
    });

    const res = await request(app)
      .post('/api/shopkeeper/jobs/job-1/collect')
      .send({ revision: 3 });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('PICKUP_VERIFICATION_REQUIRED');
  });

  it('blocks dotfiles and unknown routes in production static serving while allowing recognized client routes', async () => {
    const tempDist = fs.mkdtempSync(path.join(os.tmpdir(), 'printq-dist-'));
    fs.writeFileSync(path.join(tempDist, 'index.html'), '<html><body>PrintQ</body></html>');
    fs.writeFileSync(path.join(tempDist, '.env'), 'SECRET=1');
    fs.writeFileSync(path.join(tempDist, '.antideploy.json'), '{}');

    try {
      const pool = makeFakePool();
      const s3 = {} as S3Client;
      const { app } = createApp(makeCloudConfig(true), {
        pool,
        s3,
        distDir: tempDist,
        authRouter: express.Router(),
        sessionHandler: (_req, res) => res.status(200).json({ session: null }),
        requireSessionMiddleware: (_req, _res, next) => next(),
        requireShopkeeperMiddleware: (_req, _res, next) => next(),
      });

      const envRes = await request(app).get('/.env');
      expect(envRes.status).toBe(404);

      const antiRes = await request(app).get('/.antideploy.json');
      expect(antiRes.status).toBe(404);

      const unknownRes = await request(app).get('/unknown-route');
      expect(unknownRes.status).toBe(404);

      const studentRes = await request(app).get('/student/jobs');
      expect(studentRes.status).toBe(200);
      expect(studentRes.text).toContain('PrintQ');
    } finally {
      fs.rmSync(tempDist, { recursive: true, force: true });
    }
  });
});
