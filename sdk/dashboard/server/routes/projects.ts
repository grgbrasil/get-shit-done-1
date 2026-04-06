import { Router } from 'express';
import type { ProjectRegistry } from '../registry.js';

export function projectsRouter(registry: ProjectRegistry): Router {
  const router = Router();

  router.get('/', async (_req, res) => {
    const projects = await registry.list();
    res.json(projects);
  });

  router.post('/', async (req, res) => {
    const { path } = req.body as { path?: string };
    if (!path) {
      res.status(400).json({ error: 'path is required' });
      return;
    }
    try {
      const project = await registry.add(path);
      res.status(201).json(project);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  router.delete('/:id', async (req, res) => {
    await registry.remove(req.params.id);
    res.status(204).end();
  });

  return router;
}
