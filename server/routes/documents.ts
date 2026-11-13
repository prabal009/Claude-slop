import express from 'express';
import type { AuthenticatedSession } from '../auth/session.ts';
import type { WorkspaceRepository } from '../workspace/repository.ts';

export function createDocumentsRouter(
  repo: WorkspaceRepository,
  requireSession: express.RequestHandler,
): express.Router {
  const router = express.Router();

  router.get('/:id', requireSession, async (req, res, next) => {
    try {
      const session = res.locals.session as AuthenticatedSession;
      const doc = await repo.getAuthorizedDocument(session, String(req.params.id ?? ''));
      res.setHeader('Content-Type', doc.mimeType);
      res.setHeader(
        'Content-Disposition',
        `${doc.disposition}; filename="${doc.filename}"`,
      );
      res.setHeader('X-Content-Type-Options', 'nosniff');
      if (doc.contentLength !== undefined) {
        res.setHeader('Content-Length', String(doc.contentLength));
      }
      doc.stream.on('error', (err) => {
        if (!res.headersSent) {
          next(err);
        } else {
          res.destroy(err);
        }
      });
      doc.stream.pipe(res);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
