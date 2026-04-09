import { Router } from 'express';
import type { ProjectRegistry } from '../registry.js';
import type { SessionManager } from '../session-manager.js';

export function sessionRouter(registry: ProjectRegistry, sessionManager: SessionManager, baseWsPort: number): Router {
  const router = Router({ mergeParams: true });

  router.post('/start', async (req, res) => {
    const project = await registry.get((req.params as Record<string, string>).id);
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    try {
      const result = sessionManager.start(project.id, project.path, baseWsPort);
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  router.delete('/stop', async (req, res) => {
    try {
      sessionManager.stop((req.params as Record<string, string>).id);
      res.status(204).end();
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  router.get('/status', (req, res) => {
    const status = sessionManager.status((req.params as Record<string, string>).id);
    res.json(status);
  });

  return router;
}
