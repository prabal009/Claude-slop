import path from 'node:path';
import express from 'express';
import type { S3Client } from '@aws-sdk/client-s3';
import type { Pool } from 'pg';
import type { AppConfig, CloudConfig } from './config.ts';
import { createAuthRouter } from './auth/proxy.ts';
import {
  createSessionHandler,
  requireSession,
  requireShopkeeper,
  type AuthenticatedSession,
} from './auth/session.ts';
import { WorkspaceEventBus } from './workspace/events.ts';
import { HttpError, WorkspaceRepository } from './workspace/repository.ts';
import { createDocumentsRouter } from './routes/documents.ts';
import { createShopkeeperRouter } from './routes/shopkeeper.ts';
import { createStudentRouter } from './routes/student.ts';
import { createUploadsRouter } from './routes/uploads.ts';

export interface CloudAppDependencies {
  pool: Pool;
  s3: S3Client;
  schema?: string;
  distDir?: string;
  authRouter?: express.Router;
  sessionHandler?: express.RequestHandler;
  requireSessionMiddleware?: express.RequestHandler;
  requireShopkeeperMiddleware?: express.RequestHandler;
}

export interface CreatedApp {
  app: express.Express;
  eventBus: WorkspaceEventBus | null;
  repository: WorkspaceRepository | null;
}

const CLIENT_ROUTE_PATTERNS = [
  /^\/$/,
  /^\/login$/,
  /^\/signup$/,
  /^\/student(?:\/.*)?$/,
  /^\/shopkeeper(?:\/.*)?$/,
];

function isRecognizedClientRoute(urlPath: string): boolean {
  if (urlPath.includes('..') || urlPath.split('/').some((seg) => seg.startsWith('.'))) {
    return false;
  }
  return CLIENT_ROUTE_PATTERNS.some((pattern) => pattern.test(urlPath));
}

export function createApp(config: AppConfig, deps?: CloudAppDependencies): CreatedApp {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '64kb' }));

  app.get('/api/runtime', (_req, res) => {
    res.status(200).json({ mode: config.mode, shopId: 'campus' });
  });

  let eventBus: WorkspaceEventBus | null = null;
  let repository: WorkspaceRepository | null = null;

  if (config.mode === 'cloud') {
    if (!deps) {
      throw new Error('Cloud mode requires database and S3 dependencies.');
    }
    const cloudConfig: CloudConfig = config;
    let busRef: WorkspaceEventBus | null = null;

    repository = new WorkspaceRepository({
      pool: deps.pool,
      s3: deps.s3,
      bucket: cloudConfig.s3.bucket,
      sessionSecret: cloudConfig.sessionSecret,
      schema: deps.schema,
      onWorkspaceChanged: () => {
        void busRef?.notifyChanged();
      },
    });

    eventBus = new WorkspaceEventBus({
      pool: deps.pool,
      getObservation: () => repository!.getObservation(),
      aliasForId: repository.aliasForId,
      schema: deps.schema,
    });
    busRef = eventBus;

    const authRouter = deps.authRouter ?? createAuthRouter(deps.pool, cloudConfig);
    const sessionHandler = deps.sessionHandler ?? createSessionHandler(deps.pool, cloudConfig);
    const requireSessionMw = deps.requireSessionMiddleware ?? requireSession(deps.pool, cloudConfig);
    const requireShopkeeperMw = deps.requireShopkeeperMiddleware ?? requireShopkeeper(deps.pool, cloudConfig);

    app.use('/api/auth', authRouter);
    app.get('/api/session', sessionHandler);
    app.use('/api/uploads', createUploadsRouter(repository, requireSessionMw));
    app.use('/api/student', createStudentRouter(repository, requireSessionMw));
    app.use('/api/shopkeeper', createShopkeeperRouter(repository, requireShopkeeperMw));
    app.use('/api/documents', createDocumentsRouter(repository, requireSessionMw));

    app.get('/api/events', requireSessionMw, (req, res) => {
      const session = res.locals.session as AuthenticatedSession;
      void eventBus!.handleSseConnection(req, res, session);
    });
  }

  app.use('/api/{*path}', (_req, res) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'API route not found.' } });
  });

  if (config.isProduction) {
    const distDir = deps?.distDir ?? path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir, { dotfiles: 'deny', index: false }));

    app.get('/{*path}', (req, res) => {
      if (!isRecognizedClientRoute(req.path)) {
        res.status(404).send('Not Found');
        return;
      }
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err instanceof HttpError) {
      res.status(err.status).json({
        error: {
          code: err.code,
          message: err.message,
          ...(err.field ? { field: err.field } : {}),
        },
      });
      return;
    }

    if (err instanceof SyntaxError && 'status' in err && err.status === 400) {
      res.status(400).json({ error: { code: 'INVALID_JSON', message: 'Malformed JSON body.' } });
      return;
    }

    console.error('[server] unhandled error:', err instanceof Error ? err.message : err);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error.' } });
  });

  return { app, eventBus, repository };
}
