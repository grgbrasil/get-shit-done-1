import express from 'express';
import cors from 'cors';
import { createServer } from 'node:http';
import { join, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export interface DashboardOptions {
  port: number;
  dev: boolean;
}

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', version: '0.1.0' });
  });

  return app;
}

export async function startDashboard(options: DashboardOptions): Promise<void> {
  const app = createApp();
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
