import express from 'express';
import type { AuthenticatedSession } from '../auth/session.ts';
import type { QuoteInput } from '../../src/features/student/contracts/jobs.ts';
import type { EstimateTarget, WhatIfRequest } from '../../src/features/student/contracts/scheduling.ts';
import type { WorkspaceRepository } from '../workspace/repository.ts';

export function createStudentRouter(
  repo: WorkspaceRepository,
  requireSession: express.RequestHandler,
): express.Router {
  const router = express.Router();
  router.use(requireSession);

  router.get('/observation', async (_req, res, next) => {
    try {
      const session = res.locals.session as AuthenticatedSession;
      const observation = await repo.getStudentObservation(session.user.id);
      res.status(200).json(observation);
    } catch (error) {
      next(error);
    }
  });

  router.post('/quote', async (req, res, next) => {
    try {
      const quote = await repo.getStudentQuote(req.body as QuoteInput);
      res.status(200).json(quote);
    } catch (error) {
      next(error);
    }
  });

  router.post('/jobs', async (req, res, next) => {
    try {
      const session = res.locals.session as AuthenticatedSession;
      const body = req.body as {
        clientRequestId?: string;
        input?: Parameters<WorkspaceRepository['commitStudentJob']>[2];
        uploadId?: string | null;
      };
      const clientRequestId = body?.clientRequestId ?? body?.input?.clientRequestId ?? '';
      const result = await repo.commitStudentJob(
        session.user.id,
        clientRequestId,
        body.input!,
        body.uploadId ?? null,
      );
      res.status(result.created ? 201 : 200).json(result);
    } catch (error) {
      next(error);
    }
  });

  router.get('/jobs/:id', async (req, res, next) => {
    try {
      const session = res.locals.session as AuthenticatedSession;
      const job = await repo.getStudentJob(session.user.id, String(req.params.id ?? ''));
      res.status(200).json(job);
    } catch (error) {
      next(error);
    }
  });

  router.post('/pickup-window', async (req, res, next) => {
    try {
      const session = res.locals.session as AuthenticatedSession;
      const result = await repo.getStudentPickupWindow(session.user.id, req.body as EstimateTarget);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  });

  router.get('/jobs/:id/urgent-impact', async (req, res, next) => {
    try {
      const session = res.locals.session as AuthenticatedSession;
      const impact = await repo.getStudentUrgentImpact(session.user.id, String(req.params.id ?? ''));
      res.status(200).json(impact);
    } catch (error) {
      next(error);
    }
  });

  router.post('/jobs/:id/urgent-request', async (req, res, next) => {
    try {
      const session = res.locals.session as AuthenticatedSession;
      const observation = await repo.requestStudentUrgent(session.user.id, String(req.params.id ?? ''));
      res.status(200).json(observation);
    } catch (error) {
      next(error);
    }
  });

  router.get('/insights', async (_req, res, next) => {
    try {
      const insights = await repo.getStudentInsights();
      res.status(200).json(insights);
    } catch (error) {
      next(error);
    }
  });

  router.post('/what-if', async (req, res, next) => {
    try {
      const session = res.locals.session as AuthenticatedSession;
      const result = await repo.simulateStudentWhatIf(session.user.id, req.body as WhatIfRequest);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
