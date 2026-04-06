import { Router } from 'express';
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { ProjectRegistry } from '../registry.js';
import { safePath } from '../safe-path.js';

export function filesRouter(registry: ProjectRegistry): Router {
  const router = Router({ mergeParams: true });

  // GET /api/projects/:id/files/*
  router.get('/*', async (req, res) => {
    const project = await registry.get(req.params.id);
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    const relativePath = req.params[0];
    if (!relativePath) {
      res.status(400).json({ error: 'File path required' });
      return;
    }

    try {
      const planningDir = join(project.path, '.planning');
      const filePath = safePath(planningDir, relativePath);

      if (!existsSync(filePath)) {
        res.status(404).json({ error: 'File not found' });
        return;
      }

      const content = await readFile(filePath, 'utf-8');
      res.json({ path: relativePath, content });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  // PUT /api/projects/:id/files/*
  router.put('/*', async (req, res) => {
    const project = await registry.get(req.params.id);
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    const relativePath = req.params[0];
    const { content } = req.body as { content?: string };

    if (!relativePath) {
      res.status(400).json({ error: 'File path required' });
      return;
    }
    if (content === undefined) {
      res.status(400).json({ error: 'content is required' });
      return;
    }

    try {
      const planningDir = join(project.path, '.planning');
      const filePath = safePath(planningDir, relativePath);

      await writeFile(filePath, content, 'utf-8');
      res.json({ path: relativePath, saved: true });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  return router;
}
