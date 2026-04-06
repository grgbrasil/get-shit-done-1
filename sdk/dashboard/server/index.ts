import express from 'express';
import cors from 'cors';
import { createServer } from 'node:http';
import { join, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { ProjectRegistry } from './registry.js';
import { projectsRouter } from './routes/projects.js';
import { overviewRouter } from './routes/overview.js';
import { phasesRouter } from './routes/phases.js';
import { filesRouter } from './routes/files.js';

export interface DashboardOptions {
  port: number;
  dev: boolean;
}

const __dirname = fileURLToPath(new URL('.', import.meta.url));

const DEFAULT_REGISTRY_PATH = join(homedir(), '.gsd', 'dashboard.json');

export function createApp(registryPath: string = DEFAULT_REGISTRY_PATH) {
  const app = express();
  const registry = new ProjectRegistry(registryPath);

  app.use(cors());
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', version: '0.1.0' });
  });

  app.use('/api/projects', projectsRouter(registry));
  app.use('/api/projects/:id/overview', overviewRouter(registry));
  app.use('/api/projects/:id/phases', phasesRouter(registry));
  app.use('/api/projects/:id/files', filesRouter(registry));

  return { app, registry };
}

export async function startDashboard(options: DashboardOptions): Promise<void> {
  const { app } = createApp();
  const server = createServer(app);

  if (!options.dev) {
    const uiDist = resolve(__dirname, '..', 'ui', 'dist');
    if (existsSync(uiDist)) {
      app.use(express.static(uiDist));
      app.get('*', (_req, res) => {
        res.sendFile(join(uiDist, 'index.html'));
      });
    }
  }

  return new Promise((resolvePromise) => {
    server.listen(options.port, () => {
      console.log(`GSD Dashboard running at http://localhost:${options.port}`);
      resolvePromise();
    });
  });
}
