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
import { ProjectWatcher } from './watcher.js';
import { DashboardWS } from './ws.js';
import { SessionManager } from './session-manager.js';
import { sessionRouter } from './routes/session.js';
const __dirname = fileURLToPath(new URL('.', import.meta.url));
const DEFAULT_REGISTRY_PATH = join(homedir(), '.gsd', 'dashboard.json');
export function createApp(registryPath = DEFAULT_REGISTRY_PATH, port = 4747) {
    const app = express();
    const registry = new ProjectRegistry(registryPath);
    const sessionManager = new SessionManager();
    app.use(cors());
    app.use(express.json());
    app.get('/api/health', (_req, res) => {
        res.json({ status: 'ok', version: '0.1.0' });
    });
    app.use('/api/projects', projectsRouter(registry));
    app.use('/api/projects/:id/overview', overviewRouter(registry));
    app.use('/api/projects/:id/phases', phasesRouter(registry));
    app.use('/api/projects/:id/files', filesRouter(registry));
    app.use('/api/projects/:id/session', sessionRouter(registry, sessionManager, port + 1));
    return { app, registry, sessionManager };
}
export async function startDashboard(options) {
    const { app, registry, sessionManager } = createApp(undefined, options.port);
    const server = createServer(app);
    // WebSocket
    const dashboardWs = new DashboardWS(server);
    // File watcher
    const watcher = new ProjectWatcher();
    watcher.onEvent((event) => {
        dashboardWs.broadcast(event);
    });
    // Watch all registered projects
    const projects = await registry.list();
    for (const project of projects) {
        await watcher.watch(project);
    }
    if (!options.dev) {
        const uiDist = resolve(__dirname, '..', 'ui', 'dist');
        if (existsSync(uiDist)) {
            app.use(express.static(uiDist));
            app.get('*', (_req, res) => {
                res.sendFile(join(uiDist, 'index.html'));
            });
        }
    }
    // Graceful shutdown
    const shutdown = async () => {
        sessionManager.stopAll();
        await watcher.close();
        dashboardWs.close();
        server.close();
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    return new Promise((resolvePromise) => {
        server.listen(options.port, () => {
            console.log(`GSD Dashboard running at http://localhost:${options.port}`);
            resolvePromise();
        });
    });
}
//# sourceMappingURL=index.js.map