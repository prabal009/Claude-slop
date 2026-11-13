import express from 'express';
import type { AuthenticatedSession } from '../auth/session.ts';
import type {
  PrinterState,
  ShopSettings,
  SimulationScenario,
} from '../../src/features/shopkeeper/types.ts';
import type { WorkspaceRepository } from '../workspace/repository.ts';

export function createShopkeeperRouter(
  repo: WorkspaceRepository,
  requireShopkeeper: express.RequestHandler,
): express.Router {
  const router = express.Router();
  router.use(requireShopkeeper);

  router.get('/snapshot', async (_req, res, next) => {
    try {
      const snapshot = await repo.getShopkeeperSnapshot();
      res.status(200).json(snapshot);
    } catch (error) {
      next(error);
    }
  });

  router.post('/jobs/:id/status', async (req, res, next) => {
    try {
      const body = req.body as { status: 'printing' | 'ready'; revision: number };
      const snapshot = await repo.updateJobStatus(String(req.params.id ?? ''), body.status, body.revision);
      res.status(200).json(snapshot);
    } catch (error) {
      next(error);
    }
  });

  router.post('/queue/reorder', async (req, res, next) => {
    try {
      const body = req.body as { ids: string[]; revision: number };
      const snapshot = await repo.reorderQueue(body.ids, body.revision);
      res.status(200).json(snapshot);
    } catch (error) {
      next(error);
    }
  });

  router.get('/jobs/:id/urgent-impact', async (req, res, next) => {
    try {
      const preview = await repo.getUrgentImpactPreview(String(req.params.id ?? ''));
      res.status(200).json(preview);
    } catch (error) {
      next(error);
    }
  });

  router.post('/jobs/:id/urgent-approve', async (req, res, next) => {
    try {
      const body = req.body as { revision: number };
      const snapshot = await repo.approveUrgent(String(req.params.id ?? ''), body.revision);
      res.status(200).json(snapshot);
    } catch (error) {
      next(error);
    }
  });

  router.post('/jobs/:id/urgent-reject', async (req, res, next) => {
    try {
      const body = req.body as { revision: number };
      const snapshot = await repo.rejectUrgent(String(req.params.id ?? ''), body.revision);
      res.status(200).json(snapshot);
    } catch (error) {
      next(error);
    }
  });

  router.post('/jobs/:id/urgent-mark', async (req, res, next) => {
    try {
      const body = req.body as { revision: number };
      const snapshot = await repo.markUrgent(String(req.params.id ?? ''), body.revision);
      res.status(200).json(snapshot);
    } catch (error) {
      next(error);
    }
  });

  router.get('/optimize/preview', async (_req, res, next) => {
    try {
      const preview = await repo.getOptimizationPreview();
      res.status(200).json(preview);
    } catch (error) {
      next(error);
    }
  });

  router.post('/optimize/apply', async (req, res, next) => {
    try {
      const body = req.body as { revision: number };
      const snapshot = await repo.applyOptimizedQueue(body.revision);
      res.status(200).json(snapshot);
    } catch (error) {
      next(error);
    }
  });

  router.post('/simulate/preview', async (req, res, next) => {
    try {
      const preview = await repo.getSimulationPreview(req.body as SimulationScenario);
      res.status(200).json(preview);
    } catch (error) {
      next(error);
    }
  });

  router.post('/simulate/apply', async (req, res, next) => {
    try {
      const body = req.body as { scenario: SimulationScenario; revision: number };
      const snapshot = await repo.applySimulation(body.scenario, body.revision);
      res.status(200).json(snapshot);
    } catch (error) {
      next(error);
    }
  });

  router.post('/printer', async (req, res, next) => {
    try {
      const body = req.body as { state: PrinterState; downtimeMinutes: number | null; revision: number };
      const snapshot = await repo.updatePrinter(body.state, body.downtimeMinutes, body.revision);
      res.status(200).json(snapshot);
    } catch (error) {
      next(error);
    }
  });

  router.post('/settings', async (req, res, next) => {
    try {
      const body = req.body as { settings: ShopSettings; revision: number };
      const snapshot = await repo.updateSettings(body.settings, body.revision);
      res.status(200).json(snapshot);
    } catch (error) {
      next(error);
    }
  });

  router.get('/analytics', async (_req, res, next) => {
    try {
      const analytics = await repo.getAnalytics();
      res.status(200).json(analytics);
    } catch (error) {
      next(error);
    }
  });

  router.post('/pickup/verify', async (req, res, next) => {
    try {
      const session = res.locals.session as AuthenticatedSession;
      const body = req.body as { token: string };
      const job = await repo.verifyPickupToken(session.id, body.token);
      res.status(200).json(job);
    } catch (error) {
      next(error);
    }
  });

  router.post('/jobs/:id/collect', async (req, res, next) => {
    try {
      const session = res.locals.session as AuthenticatedSession;
      const body = req.body as { revision: number };
      const snapshot = await repo.collectJob(session.id, String(req.params.id ?? ''), body.revision);
      res.status(200).json(snapshot);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
