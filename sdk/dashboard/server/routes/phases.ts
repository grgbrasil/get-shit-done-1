import { Router } from 'express';
import type { ProjectRegistry } from '../registry.js';
import { getPhases, getPhaseDetail } from '../gsd-bridge.js';

export function phasesRouter(registry: ProjectRegistry): Router {
  const router = Router({ mergeParams: true });

  router.get('/', async (req, res) => {
    const project = await registry.get((req.params as Record<string, string>).id);
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    try {
      const data = await getPhases(project.path);
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  router.get('/:phaseId', async (req, res) => {
    const project = await registry.get((req.params as Record<string, string>).id);
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    try {
      const detail = await getPhaseDetail(project.path, req.params.phaseId);
      res.json(detail);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  return router;
}
