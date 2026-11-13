import express from 'express';
import type { AuthenticatedSession } from '../auth/session.ts';
import type { WorkspaceRepository } from '../workspace/repository.ts';

export function createUploadsRouter(
  repo: WorkspaceRepository,
  requireSession: express.RequestHandler,
): express.Router {
  const router = express.Router();

  router.post('/prepare', requireSession, async (req, res, next) => {
    try {
      const session = res.locals.session as AuthenticatedSession;
      const body = req.body as {
        clientRequestId?: string;
        input?: Parameters<WorkspaceRepository['prepareUpload']>[2];
        fileMeta?: Parameters<WorkspaceRepository['prepareUpload']>[3];
      };
      const clientRequestId = body?.clientRequestId ?? body?.input?.clientRequestId ?? '';
      const result = await repo.prepareUpload(
        session.user.id,
        clientRequestId,
        body.input!,
        body.fileMeta!,
      );
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
