# GSD Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local web dashboard integrated into the SDK (`gsd-sdk dashboard`) that lets users navigate GSD projects, view plan status on a wave-based kanban board, edit markdown files inline, and optionally manage SDK sessions.

**Architecture:** Express server inside the SDK reads `.planning/` files via existing `gsd-tools.cjs` bridges and serves a Vue 3 SPA. The frontend uses Milkdown for markdown editing, Pinia for state management, and WebSocket for real-time file change notifications. A project registry at `~/.gsd/dashboard.json` enables multi-project support.

**Tech Stack:** Express, chokidar, Vue 3, Vite, Pinia, vue-router, Milkdown, WebSocket (ws)

---

## File Structure

### Server Files (inside `sdk/dashboard/server/`)

| File | Responsibility |
|------|---------------|
| `index.ts` | Express app factory, WS upgrade, static serving, startup |
| `registry.ts` | Read/write `~/.gsd/dashboard.json` project registry |
| `routes/projects.ts` | `GET/POST/DELETE /api/projects` |
| `routes/overview.ts` | `GET /api/projects/:id/overview` (state + roadmap parsed) |
| `routes/phases.ts` | `GET /api/projects/:id/phases`, `GET .../:phaseId` |
| `routes/files.ts` | `GET/PUT /api/projects/:id/files/*` with path traversal guard |
| `routes/session.ts` | `POST/DELETE/GET /api/projects/:id/session/*` |
| `watcher.ts` | chokidar watchers per project, emit events to WS |
| `ws.ts` | Dashboard WebSocket server (file events + SDK bridge) |
| `sdk-bridge.ts` | Connect to running SDK WebSocket and relay events |
| `safe-path.ts` | Path validation utility (traversal guard) |

### Frontend Files (inside `sdk/dashboard/ui/`)

| File | Responsibility |
|------|---------------|
| `index.html` | SPA shell |
| `vite.config.ts` | Vite config with proxy to Express in dev |
| `package.json` | Frontend dependencies |
| `src/main.ts` | Vue app bootstrap |
| `src/App.vue` | Root layout (sidebar + main content) |
| `src/router.ts` | Vue Router routes |
| `src/api.ts` | HTTP client (fetch wrapper for REST API) |
| `src/stores/projects.ts` | Pinia store for project list + active project |
| `src/stores/phases.ts` | Pinia store for phases/plans/kanban data |
| `src/stores/session.ts` | Pinia store for session status |
| `src/components/Sidebar.vue` | Project tree with progressive disclosure |
| `src/components/Breadcrumb.vue` | Navigation breadcrumb |
| `src/components/ProjectOverview.vue` | Metrics + progress bars |
| `src/components/KanbanBoard.vue` | Wave columns with plan cards |
| `src/components/KanbanCard.vue` | Single plan card with status badge |
| `src/components/MarkdownEditor.vue` | Milkdown WYSIWYG + source toggle |
| `src/components/FrontmatterForm.vue` | Typed form for plan YAML frontmatter |
| `src/components/SessionIndicator.vue` | Sidebar footer session dot + start/stop |
| `src/components/ConfigEditor.vue` | JSON editor for config.json |
| `src/composables/useWebSocket.ts` | WebSocket connection + reconnect logic |
| `src/composables/useFileConflicts.ts` | Compute file conflicts between plans |

### CLI Integration

| File | Change |
|------|--------|
| `sdk/src/cli.ts` | Add `dashboard` command with `--port` and `--dev` flags |
| `sdk/src/dashboard-launcher.ts` | New file: start Express server + optional Vite dev |
| `sdk/package.json` | Add express, chokidar, cors dependencies |

---

## Task 1: Project Scaffolding and Dependencies

**Files:**
- Create: `sdk/dashboard/server/index.ts`
- Create: `sdk/dashboard/ui/package.json`
- Create: `sdk/dashboard/ui/vite.config.ts`
- Create: `sdk/dashboard/ui/index.html`
- Create: `sdk/dashboard/ui/src/main.ts`
- Create: `sdk/dashboard/ui/src/App.vue`
- Modify: `sdk/package.json`
- Modify: `sdk/tsconfig.json`

- [ ] **Step 1: Install server dependencies into SDK**

```bash
cd sdk && npm install express cors chokidar @types/express @types/cors
```

- [ ] **Step 2: Create dashboard server entry point**

Create `sdk/dashboard/server/index.ts`:

```typescript
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

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', version: '0.1.0' });
  });

  return app;
}

export async function startDashboard(options: DashboardOptions): Promise<void> {
  const app = createApp();
  const server = createServer(app);

  if (!options.dev) {
    // Serve static build
    const uiDist = resolve(__dirname, '..', 'ui', 'dist');
    if (existsSync(uiDist)) {
      app.use(express.static(uiDist));
      // SPA fallback
      app.get('*', (_req, res) => {
        res.sendFile(join(uiDist, 'index.html'));
      });
    }
  }

  return new Promise((resolve) => {
    server.listen(options.port, () => {
      console.log(`GSD Dashboard running at http://localhost:${options.port}`);
      resolve();
    });
  });
}
```

- [ ] **Step 3: Create frontend package.json**

Create `sdk/dashboard/ui/package.json`:

```json
{
  "name": "@gsd-build/dashboard-ui",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "vue": "^3.5.0",
    "vue-router": "^4.5.0",
    "pinia": "^3.0.0"
  },
  "devDependencies": {
    "@vitejs/plugin-vue": "^5.2.0",
    "typescript": "^5.7.0",
    "vite": "^6.0.0",
    "vue-tsc": "^2.2.0"
  }
}
```

- [ ] **Step 4: Create Vite config with API proxy**

Create `sdk/dashboard/ui/vite.config.ts`:

```typescript
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:4747',
      '/ws': {
        target: 'ws://localhost:4747',
        ws: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
```

- [ ] **Step 5: Create index.html shell**

Create `sdk/dashboard/ui/index.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>GSD Dashboard</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
  </style>
</head>
<body>
  <div id="app"></div>
  <script type="module" src="/src/main.ts"></script>
</body>
</html>
```

- [ ] **Step 6: Create Vue app entry**

Create `sdk/dashboard/ui/src/main.ts`:

```typescript
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { router } from './router';

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.mount('#app');
```

Create `sdk/dashboard/ui/src/App.vue`:

```vue
<script setup lang="ts">
</script>

<template>
  <div class="app-shell">
    <div class="app-content">
      <router-view />
    </div>
  </div>
</template>

<style>
.app-shell {
  display: flex;
  height: 100vh;
  background: #0f1117;
  color: #e1e4e8;
}
.app-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
</style>
```

Create `sdk/dashboard/ui/src/router.ts`:

```typescript
import { createRouter, createWebHistory } from 'vue-router';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      component: () => import('./components/ProjectOverview.vue'),
    },
  ],
});
```

Create a placeholder `sdk/dashboard/ui/src/components/ProjectOverview.vue`:

```vue
<template>
  <div style="padding: 2rem; color: #e1e4e8;">
    <h1>GSD Dashboard</h1>
    <p>Server connected. Select a project to begin.</p>
  </div>
</template>
```

- [ ] **Step 7: Create frontend tsconfig**

Create `sdk/dashboard/ui/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "jsx": "preserve",
    "jsxImportSource": "vue",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src/**/*.ts", "src/**/*.vue"],
  "exclude": ["node_modules", "dist"]
}
```

Create `sdk/dashboard/ui/env.d.ts`:

```typescript
/// <reference types="vite/client" />
declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<object, object, unknown>;
  export default component;
}
```

- [ ] **Step 8: Update SDK tsconfig to exclude dashboard**

In `sdk/tsconfig.json`, add `"dashboard"` to the `exclude` array (the dashboard has its own tsconfig):

```json
"exclude": ["src/**/*.test.ts", "src/**/*.integration.test.ts", "dist", "node_modules", "dashboard"]
```

- [ ] **Step 9: Install frontend deps and verify build**

```bash
cd sdk/dashboard/ui && npm install && npx vite build
```

- [ ] **Step 10: Verify server starts**

```bash
cd sdk && npx tsx dashboard/server/index.ts
# Should print "GSD Dashboard running at http://localhost:4747"
# Ctrl-C to stop
```

- [ ] **Step 11: Commit**

```bash
git add sdk/dashboard/ sdk/package.json sdk/package-lock.json sdk/tsconfig.json
git commit -m "feat(dashboard): scaffold server and frontend project structure"
```

---

## Task 2: Project Registry and Projects API

**Files:**
- Create: `sdk/dashboard/server/registry.ts`
- Create: `sdk/dashboard/server/routes/projects.ts`
- Create: `sdk/dashboard/server/safe-path.ts`
- Modify: `sdk/dashboard/server/index.ts`

- [ ] **Step 1: Write test for registry**

Create `sdk/dashboard/server/registry.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ProjectRegistry } from './registry.js';

describe('ProjectRegistry', () => {
  let tempDir: string;
  let registryPath: string;
  let projectDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'gsd-reg-'));
    registryPath = join(tempDir, 'dashboard.json');
    projectDir = join(tempDir, 'my-project');
    await mkdir(join(projectDir, '.planning'), { recursive: true });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('returns empty list when no registry file', async () => {
    const reg = new ProjectRegistry(registryPath);
    const projects = await reg.list();
    expect(projects).toEqual([]);
  });

  it('adds a project with valid .planning/ directory', async () => {
    const reg = new ProjectRegistry(registryPath);
    const project = await reg.add(projectDir);
    expect(project.id).toBe('my-project');
    expect(project.name).toBe('my-project');
    expect(project.path).toBe(projectDir);

    const projects = await reg.list();
    expect(projects).toHaveLength(1);
  });

  it('rejects a path without .planning/ directory', async () => {
    const reg = new ProjectRegistry(registryPath);
    const badDir = join(tempDir, 'no-planning');
    await mkdir(badDir, { recursive: true });
    await expect(reg.add(badDir)).rejects.toThrow('.planning');
  });

  it('removes a project by id', async () => {
    const reg = new ProjectRegistry(registryPath);
    await reg.add(projectDir);
    await reg.remove('my-project');
    const projects = await reg.list();
    expect(projects).toEqual([]);
  });

  it('finds a project by id', async () => {
    const reg = new ProjectRegistry(registryPath);
    await reg.add(projectDir);
    const found = await reg.get('my-project');
    expect(found?.path).toBe(projectDir);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd sdk && npx vitest run dashboard/server/registry.test.ts
```

Expected: FAIL — `registry.js` does not exist.

- [ ] **Step 3: Implement ProjectRegistry**

Create `sdk/dashboard/server/registry.ts`:

```typescript
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, basename, resolve } from 'node:path';
import { existsSync } from 'node:fs';

export interface ProjectEntry {
  id: string;
  name: string;
  path: string;
}

interface RegistryData {
  projects: ProjectEntry[];
}

export class ProjectRegistry {
  constructor(private readonly filePath: string) {}

  async list(): Promise<ProjectEntry[]> {
    const data = await this.load();
    return data.projects;
  }

  async get(id: string): Promise<ProjectEntry | undefined> {
    const data = await this.load();
    return data.projects.find((p) => p.id === id);
  }

  async add(projectPath: string): Promise<ProjectEntry> {
    const absPath = resolve(projectPath);
    const planningDir = resolve(absPath, '.planning');

    if (!existsSync(planningDir)) {
      throw new Error(`No .planning/ directory found at ${absPath}`);
    }

    const id = slugify(basename(absPath));
    const data = await this.load();

    // Prevent duplicates
    if (data.projects.some((p) => p.id === id)) {
      throw new Error(`Project "${id}" already registered`);
    }

    const entry: ProjectEntry = { id, name: basename(absPath), path: absPath };
    data.projects.push(entry);
    await this.save(data);
    return entry;
  }

  async remove(id: string): Promise<void> {
    const data = await this.load();
    data.projects = data.projects.filter((p) => p.id !== id);
    await this.save(data);
  }

  private async load(): Promise<RegistryData> {
    try {
      const raw = await readFile(this.filePath, 'utf-8');
      return JSON.parse(raw) as RegistryData;
    } catch {
      return { projects: [] };
    }
  }

  private async save(data: RegistryData): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(data, null, 2), 'utf-8');
  }
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd sdk && npx vitest run dashboard/server/registry.test.ts
```

Expected: PASS

- [ ] **Step 5: Implement safe-path utility**

Create `sdk/dashboard/server/safe-path.ts`:

```typescript
import { resolve, relative } from 'node:path';

/**
 * Validates that `requestedPath` resolves inside `basePath`.
 * Returns the resolved absolute path or throws if traversal detected.
 */
export function safePath(basePath: string, requestedPath: string): string {
  const resolved = resolve(basePath, requestedPath);
  const rel = relative(basePath, resolved);

  if (rel.startsWith('..') || resolve(basePath, rel) !== resolved) {
    throw new Error('Path traversal detected');
  }

  return resolved;
}
```

- [ ] **Step 6: Implement projects route**

Create `sdk/dashboard/server/routes/projects.ts`:

```typescript
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
```

- [ ] **Step 7: Wire routes into Express app**

Update `sdk/dashboard/server/index.ts` — replace the `createApp` function:

```typescript
import express from 'express';
import cors from 'cors';
import { createServer } from 'node:http';
import { join, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { ProjectRegistry } from './registry.js';
import { projectsRouter } from './routes/projects.js';

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

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', version: '0.1.0' });
  });

  // Project CRUD
  app.use('/api/projects', projectsRouter(registry));

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

  return new Promise((resolve) => {
    server.listen(options.port, () => {
      console.log(`GSD Dashboard running at http://localhost:${options.port}`);
      resolve();
    });
  });
}
```

- [ ] **Step 8: Commit**

```bash
git add sdk/dashboard/server/
git commit -m "feat(dashboard): project registry and REST API for CRUD"
```

---

## Task 3: Overview and Phases API (gsd-tools bridge)

**Files:**
- Create: `sdk/dashboard/server/routes/overview.ts`
- Create: `sdk/dashboard/server/routes/phases.ts`
- Create: `sdk/dashboard/server/gsd-bridge.ts`
- Modify: `sdk/dashboard/server/index.ts`

- [ ] **Step 1: Create gsd-tools bridge**

This bridge creates a `GSDTools` instance for a given project path and provides typed access to roadmap/phase/state data.

Create `sdk/dashboard/server/gsd-bridge.ts`:

```typescript
import { GSDTools, resolveGsdToolsPath } from '../../src/gsd-tools.js';
import type { RoadmapAnalysis, PhasePlanIndex } from '../../src/types.js';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';

export function createTools(projectDir: string): GSDTools {
  return new GSDTools({
    projectDir,
    gsdToolsPath: resolveGsdToolsPath(projectDir),
  });
}

export async function getOverview(projectDir: string): Promise<{
  state: string | null;
  roadmap: RoadmapAnalysis | null;
}> {
  const tools = createTools(projectDir);

  let state: string | null = null;
  try {
    state = await tools.stateLoad();
  } catch {
    // STATE.md may not exist
  }

  let roadmap: RoadmapAnalysis | null = null;
  try {
    roadmap = await tools.roadmapAnalyze();
  } catch {
    // ROADMAP.md may not exist
  }

  return { state, roadmap };
}

export async function getPhases(projectDir: string): Promise<{
  roadmap: RoadmapAnalysis;
  phaseDetails: Record<string, PhasePlanIndex>;
}> {
  const tools = createTools(projectDir);
  const roadmap = await tools.roadmapAnalyze();
  const phaseDetails: Record<string, PhasePlanIndex> = {};

  for (const phase of roadmap.phases) {
    try {
      phaseDetails[phase.number] = await tools.phasePlanIndex(phase.number);
    } catch {
      // Phase may not have plans yet
    }
  }

  return { roadmap, phaseDetails };
}

export async function getPhaseDetail(
  projectDir: string,
  phaseNumber: string,
): Promise<PhasePlanIndex> {
  const tools = createTools(projectDir);
  return tools.phasePlanIndex(phaseNumber);
}

export async function getConfig(projectDir: string): Promise<unknown> {
  const configPath = join(projectDir, '.planning', 'config.json');
  if (!existsSync(configPath)) return null;
  const raw = await readFile(configPath, 'utf-8');
  return JSON.parse(raw);
}
```

- [ ] **Step 2: Create overview route**

Create `sdk/dashboard/server/routes/overview.ts`:

```typescript
import { Router } from 'express';
import type { ProjectRegistry } from '../registry.js';
import { getOverview, getConfig } from '../gsd-bridge.js';

export function overviewRouter(registry: ProjectRegistry): Router {
  const router = Router({ mergeParams: true });

  router.get('/', async (req, res) => {
    const project = await registry.get(req.params.id);
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    try {
      const overview = await getOverview(project.path);
      res.json(overview);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  return router;
}
```

- [ ] **Step 3: Create phases route**

Create `sdk/dashboard/server/routes/phases.ts`:

```typescript
import { Router } from 'express';
import type { ProjectRegistry } from '../registry.js';
import { getPhases, getPhaseDetail } from '../gsd-bridge.js';

export function phasesRouter(registry: ProjectRegistry): Router {
  const router = Router({ mergeParams: true });

  // GET /api/projects/:id/phases
  router.get('/', async (req, res) => {
    const project = await registry.get(req.params.id);
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

  // GET /api/projects/:id/phases/:phaseId
  router.get('/:phaseId', async (req, res) => {
    const project = await registry.get(req.params.id);
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
```

- [ ] **Step 4: Wire new routes into Express app**

In `sdk/dashboard/server/index.ts`, add imports and mount points after the projects router:

```typescript
import { overviewRouter } from './routes/overview.js';
import { phasesRouter } from './routes/phases.js';

// Inside createApp(), after the projects router:
app.use('/api/projects/:id/overview', overviewRouter(registry));
app.use('/api/projects/:id/phases', phasesRouter(registry));
```

- [ ] **Step 5: Commit**

```bash
git add sdk/dashboard/server/
git commit -m "feat(dashboard): overview and phases API via gsd-tools bridge"
```

---

## Task 4: Files API (Read/Write with Security)

**Files:**
- Create: `sdk/dashboard/server/routes/files.ts`
- Create: `sdk/dashboard/server/safe-path.test.ts`
- Modify: `sdk/dashboard/server/index.ts`

- [ ] **Step 1: Write test for safe-path**

Create `sdk/dashboard/server/safe-path.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { safePath } from './safe-path.js';

describe('safePath', () => {
  it('allows paths within base', () => {
    const result = safePath('/project/.planning', 'phases/01/PLAN.md');
    expect(result).toBe('/project/.planning/phases/01/PLAN.md');
  });

  it('rejects path traversal with ../', () => {
    expect(() => safePath('/project/.planning', '../../../etc/passwd')).toThrow('Path traversal');
  });

  it('rejects absolute paths outside base', () => {
    expect(() => safePath('/project/.planning', '/etc/passwd')).toThrow('Path traversal');
  });

  it('allows nested paths', () => {
    const result = safePath('/project/.planning', 'phases/02-features/02-01-PLAN.md');
    expect(result).toBe('/project/.planning/phases/02-features/02-01-PLAN.md');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd sdk && npx vitest run dashboard/server/safe-path.test.ts
```

Expected: PASS (safe-path.ts was created in Task 2 Step 5). If not, revisit.

- [ ] **Step 3: Implement files route**

Create `sdk/dashboard/server/routes/files.ts`:

```typescript
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
```

- [ ] **Step 4: Wire files route into Express app**

In `sdk/dashboard/server/index.ts`, add:

```typescript
import { filesRouter } from './routes/files.js';

// Inside createApp(), after phases router:
app.use('/api/projects/:id/files', filesRouter(registry));
```

- [ ] **Step 5: Commit**

```bash
git add sdk/dashboard/server/
git commit -m "feat(dashboard): files API with path traversal protection"
```

---

## Task 5: File Watcher and Dashboard WebSocket

**Files:**
- Create: `sdk/dashboard/server/watcher.ts`
- Create: `sdk/dashboard/server/ws.ts`
- Modify: `sdk/dashboard/server/index.ts`

- [ ] **Step 1: Implement file watcher**

Create `sdk/dashboard/server/watcher.ts`:

```typescript
import chokidar from 'chokidar';
import { relative } from 'node:path';
import type { ProjectEntry } from './registry.js';

export type FileEventType = 'file:changed' | 'file:created' | 'file:deleted';

export interface FileEvent {
  type: FileEventType;
  project: string;
  path: string;
}

export type FileEventHandler = (event: FileEvent) => void;

export class ProjectWatcher {
  private watchers = new Map<string, chokidar.FSWatcher>();
  private handler: FileEventHandler | null = null;

  onEvent(handler: FileEventHandler): void {
    this.handler = handler;
  }

  async watch(project: ProjectEntry): Promise<void> {
    if (this.watchers.has(project.id)) return;

    const planningDir = `${project.path}/.planning`;
    const watcher = chokidar.watch(planningDir, {
      ignoreInitial: true,
      persistent: true,
      depth: 10,
    });

    watcher.on('change', (filePath) => {
      this.emit('file:changed', project.id, relative(planningDir, filePath));
    });
    watcher.on('add', (filePath) => {
      this.emit('file:created', project.id, relative(planningDir, filePath));
    });
    watcher.on('unlink', (filePath) => {
      this.emit('file:deleted', project.id, relative(planningDir, filePath));
    });

    this.watchers.set(project.id, watcher);
  }

  async unwatch(projectId: string): Promise<void> {
    const watcher = this.watchers.get(projectId);
    if (watcher) {
      await watcher.close();
      this.watchers.delete(projectId);
    }
  }

  async close(): Promise<void> {
    for (const [id, watcher] of this.watchers) {
      await watcher.close();
      this.watchers.delete(id);
    }
  }

  private emit(type: FileEventType, project: string, path: string): void {
    this.handler?.({ type, project, path });
  }
}
```

- [ ] **Step 2: Implement WebSocket server**

Create `sdk/dashboard/server/ws.ts`:

```typescript
import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'node:http';

export interface DashboardEvent {
  type: string;
  project: string;
  [key: string]: unknown;
}

export class DashboardWS {
  private wss: WebSocketServer;

  constructor(server: Server) {
    this.wss = new WebSocketServer({ server, path: '/ws' });
  }

  broadcast(event: DashboardEvent): void {
    const payload = JSON.stringify(event);
    for (const client of this.wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(payload);
        } catch {
          // Ignore individual client errors
        }
      }
    }
  }

  close(): void {
    for (const client of this.wss.clients) {
      try { client.terminate(); } catch { /* ignore */ }
    }
    this.wss.close();
  }
}
```

- [ ] **Step 3: Wire watcher + WS into server startup**

Update `sdk/dashboard/server/index.ts` `startDashboard` function to integrate watcher and WS:

```typescript
import { ProjectWatcher } from './watcher.js';
import { DashboardWS } from './ws.js';

export async function startDashboard(options: DashboardOptions): Promise<void> {
  const { app, registry } = createApp();
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
    await watcher.close();
    dashboardWs.close();
    server.close();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  return new Promise((resolve) => {
    server.listen(options.port, () => {
      console.log(`GSD Dashboard running at http://localhost:${options.port}`);
      resolve();
    });
  });
}
```

- [ ] **Step 4: Commit**

```bash
git add sdk/dashboard/server/
git commit -m "feat(dashboard): file watcher and WebSocket for real-time events"
```

---

## Task 6: Session Management API

**Files:**
- Create: `sdk/dashboard/server/routes/session.ts`
- Create: `sdk/dashboard/server/session-manager.ts`
- Modify: `sdk/dashboard/server/index.ts`

- [ ] **Step 1: Implement session manager**

Create `sdk/dashboard/server/session-manager.ts`:

```typescript
import { spawn, ChildProcess } from 'node:child_process';
import { resolve } from 'node:path';

interface ActiveSession {
  pid: number;
  process: ChildProcess;
  projectId: string;
  wsPort: number;
  startedAt: string;
}

export class SessionManager {
  private sessions = new Map<string, ActiveSession>();

  start(projectId: string, projectDir: string, wsPort: number): ActiveSession {
    if (this.sessions.has(projectId)) {
      throw new Error(`Session already running for project "${projectId}"`);
    }

    const gsdSdkBin = resolve(__dirname, '..', '..', 'dist', 'cli.js');
    const child = spawn('node', [gsdSdkBin, 'auto', '--project-dir', projectDir, '--ws-port', String(wsPort)], {
      detached: true,
      stdio: 'ignore',
    });

    child.unref();

    const session: ActiveSession = {
      pid: child.pid!,
      process: child,
      projectId,
      wsPort,
      startedAt: new Date().toISOString(),
    };

    this.sessions.set(projectId, session);

    child.on('exit', () => {
      this.sessions.delete(projectId);
    });

    return session;
  }

  stop(projectId: string): void {
    const session = this.sessions.get(projectId);
    if (!session) {
      throw new Error(`No active session for project "${projectId}"`);
    }

    try {
      process.kill(session.pid, 'SIGTERM');
    } catch {
      // Process may have already exited
    }
    this.sessions.delete(projectId);
  }

  status(projectId: string): { active: boolean; pid?: number; wsPort?: number; startedAt?: string } {
    const session = this.sessions.get(projectId);
    if (!session) return { active: false };
    return {
      active: true,
      pid: session.pid,
      wsPort: session.wsPort,
      startedAt: session.startedAt,
    };
  }

  stopAll(): void {
    for (const [id] of this.sessions) {
      try { this.stop(id); } catch { /* ignore */ }
    }
  }
}
```

- [ ] **Step 2: Implement session route**

Create `sdk/dashboard/server/routes/session.ts`:

```typescript
import { Router } from 'express';
import type { ProjectRegistry } from '../registry.js';
import type { SessionManager } from '../session-manager.js';

export function sessionRouter(registry: ProjectRegistry, sessionManager: SessionManager, baseWsPort: number): Router {
  const router = Router({ mergeParams: true });

  // POST /api/projects/:id/session/start
  router.post('/start', async (req, res) => {
    const project = await registry.get(req.params.id);
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    try {
      const session = sessionManager.start(project.id, project.path, baseWsPort);
      res.json({ pid: session.pid, wsPort: session.wsPort, startedAt: session.startedAt });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  // DELETE /api/projects/:id/session/stop
  router.delete('/stop', async (req, res) => {
    try {
      sessionManager.stop(req.params.id);
      res.status(204).end();
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  // GET /api/projects/:id/session/status
  router.get('/status', (req, res) => {
    const status = sessionManager.status(req.params.id);
    res.json(status);
  });

  return router;
}
```

- [ ] **Step 3: Wire session route into server**

In `sdk/dashboard/server/index.ts`, add:

```typescript
import { SessionManager } from './session-manager.js';
import { sessionRouter } from './routes/session.js';

// In createApp():
const sessionManager = new SessionManager();

// Mount after other routes:
app.use('/api/projects/:id/session', sessionRouter(registry, sessionManager, options.port + 1));

// Return sessionManager for shutdown:
return { app, registry, sessionManager };
```

Update `startDashboard` shutdown to also stop sessions:

```typescript
const shutdown = async () => {
  sessionManager.stopAll();
  await watcher.close();
  dashboardWs.close();
  server.close();
};
```

- [ ] **Step 4: Commit**

```bash
git add sdk/dashboard/server/
git commit -m "feat(dashboard): session management API for gsd-sdk auto spawning"
```

---

## Task 7: SDK Bridge (relay SDK WebSocket events)

**Files:**
- Create: `sdk/dashboard/server/sdk-bridge.ts`
- Modify: `sdk/dashboard/server/index.ts`

- [ ] **Step 1: Implement SDK bridge**

Create `sdk/dashboard/server/sdk-bridge.ts`:

```typescript
import WebSocket from 'ws';
import type { DashboardWS } from './ws.js';

export class SdkBridge {
  private connections = new Map<string, WebSocket>();
  private reconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(private readonly dashboardWs: DashboardWS) {}

  connect(projectId: string, wsPort: number): void {
    if (this.connections.has(projectId)) return;

    const url = `ws://localhost:${wsPort}`;
    const ws = new WebSocket(url);

    ws.on('open', () => {
      this.connections.set(projectId, ws);
      this.dashboardWs.broadcast({
        type: 'session:started',
        project: projectId,
        pid: 0,
      });
    });

    ws.on('message', (data) => {
      try {
        const event = JSON.parse(data.toString());
        this.dashboardWs.broadcast({
          type: 'sdk:event',
          project: projectId,
          event,
        });
      } catch {
        // Ignore malformed messages
      }
    });

    ws.on('close', () => {
      this.connections.delete(projectId);
      this.dashboardWs.broadcast({
        type: 'session:stopped',
        project: projectId,
      });
    });

    ws.on('error', () => {
      this.connections.delete(projectId);
      // Retry after 3 seconds
      const timer = setTimeout(() => {
        this.reconnectTimers.delete(projectId);
        this.connect(projectId, wsPort);
      }, 3000);
      this.reconnectTimers.set(projectId, timer);
    });
  }

  disconnect(projectId: string): void {
    const timer = this.reconnectTimers.get(projectId);
    if (timer) {
      clearTimeout(timer);
      this.reconnectTimers.delete(projectId);
    }

    const ws = this.connections.get(projectId);
    if (ws) {
      ws.close();
      this.connections.delete(projectId);
    }
  }

  disconnectAll(): void {
    for (const [id] of this.connections) {
      this.disconnect(id);
    }
  }
}
```

- [ ] **Step 2: Wire bridge into session start/stop**

In the session route's `POST /start` handler, after successfully spawning the session, also connect the bridge:

```typescript
// In session.ts, add sdkBridge parameter:
export function sessionRouter(
  registry: ProjectRegistry,
  sessionManager: SessionManager,
  sdkBridge: SdkBridge,
  baseWsPort: number,
): Router {
  // In POST /start, after sessionManager.start():
  sdkBridge.connect(project.id, baseWsPort);

  // In DELETE /stop, before sessionManager.stop():
  sdkBridge.disconnect(req.params.id);
}
```

- [ ] **Step 3: Commit**

```bash
git add sdk/dashboard/server/
git commit -m "feat(dashboard): SDK WebSocket bridge for live session events"
```

---

## Task 8: CLI Integration (`gsd-sdk dashboard`)

**Files:**
- Create: `sdk/src/dashboard-launcher.ts`
- Modify: `sdk/src/cli.ts`

- [ ] **Step 1: Create dashboard launcher**

Create `sdk/src/dashboard-launcher.ts`:

```typescript
import { resolve } from 'node:path';

export interface DashboardCliOptions {
  port: number;
  dev: boolean;
}

export async function launchDashboard(options: DashboardCliOptions): Promise<void> {
  // Dynamic import to avoid loading Express/chokidar unless dashboard is used
  const { startDashboard } = await import('../dashboard/server/index.js');
  await startDashboard(options);

  if (options.dev) {
    console.log(`Dev mode: run 'cd sdk/dashboard/ui && npm run dev' for hot reload`);
  }

  // Keep process alive
  await new Promise(() => {});
}
```

- [ ] **Step 2: Add dashboard command to CLI**

In `sdk/src/cli.ts`, update the `USAGE` string:

```typescript
export const USAGE = `
Usage: gsd-sdk <command> [args] [options]

Commands:
  run <prompt>          Run a full milestone from a text prompt
  auto                  Run the full autonomous lifecycle (discover -> execute -> advance)
  init [input]          Bootstrap a new project from a PRD or description
  dashboard             Start the web dashboard

Options:
  --init <input>        Bootstrap from a PRD before running (auto only)
  --project-dir <dir>   Project directory (default: cwd)
  --ws-port <port>      Enable WebSocket transport on <port>
  --port <port>         Dashboard port (default: 4747)
  --dev                 Run dashboard in dev mode with Vite proxy
  --model <model>       Override LLM model
  --max-budget <n>      Max budget per step in USD
  -h, --help            Show this help
  -v, --version         Show version
`.trim();
```

Update `parseCliArgs` to add `port` and `dev` options:

```typescript
// In parseArgs options:
port: { type: 'string' },
dev: { type: 'boolean', default: false },
```

Update the `ParsedCliArgs` interface:

```typescript
export interface ParsedCliArgs {
  // ... existing fields ...
  port: number;
  dev: boolean;
}
```

In the return:

```typescript
port: values.port ? Number(values.port) : 4747,
dev: values.dev as boolean,
```

Add dashboard command handling in `main()`, before the run/auto/init command check:

```typescript
if (args.command === 'dashboard') {
  const { launchDashboard } = await import('./dashboard-launcher.js');
  await launchDashboard({ port: args.port, dev: args.dev });
  return;
}
```

Update the command validation:

```typescript
if (args.command !== 'run' && args.command !== 'init' && args.command !== 'auto' && args.command !== 'dashboard') {
```

- [ ] **Step 3: Commit**

```bash
git add sdk/src/cli.ts sdk/src/dashboard-launcher.ts
git commit -m "feat(dashboard): add 'gsd-sdk dashboard' CLI command"
```

---

## Task 9: Frontend — API Client and Stores

**Files:**
- Create: `sdk/dashboard/ui/src/api.ts`
- Create: `sdk/dashboard/ui/src/stores/projects.ts`
- Create: `sdk/dashboard/ui/src/stores/phases.ts`
- Create: `sdk/dashboard/ui/src/stores/session.ts`
- Create: `sdk/dashboard/ui/src/composables/useWebSocket.ts`
- Create: `sdk/dashboard/ui/src/composables/useFileConflicts.ts`

- [ ] **Step 1: Create API client**

Create `sdk/dashboard/ui/src/api.ts`:

```typescript
const BASE = '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export interface Project {
  id: string;
  name: string;
  path: string;
}

export interface PlanInfo {
  id: string;
  wave: number;
  autonomous: boolean;
  objective: string | null;
  files_modified: string[];
  task_count: number;
  has_summary: boolean;
}

export interface PhasePlanIndex {
  phase: string;
  plans: PlanInfo[];
  waves: Record<string, string[]>;
  incomplete: string[];
  has_checkpoints: boolean;
}

export interface RoadmapPhase {
  number: string;
  disk_status: string;
  roadmap_complete: boolean;
  phase_name: string;
}

export interface Overview {
  state: string | null;
  roadmap: { phases: RoadmapPhase[] } | null;
}

export interface PhaseData {
  roadmap: { phases: RoadmapPhase[] };
  phaseDetails: Record<string, PhasePlanIndex>;
}

export interface FileContent {
  path: string;
  content: string;
}

export interface SessionStatus {
  active: boolean;
  pid?: number;
  wsPort?: number;
  startedAt?: string;
}

export const api = {
  projects: {
    list: () => request<Project[]>('/projects'),
    add: (path: string) => request<Project>('/projects', {
      method: 'POST',
      body: JSON.stringify({ path }),
    }),
    remove: (id: string) => request<void>(`/projects/${id}`, { method: 'DELETE' }),
  },

  overview: (projectId: string) => request<Overview>(`/projects/${projectId}/overview`),

  phases: {
    list: (projectId: string) => request<PhaseData>(`/projects/${projectId}/phases`),
    get: (projectId: string, phaseId: string) => request<PhasePlanIndex>(`/projects/${projectId}/phases/${phaseId}`),
  },

  files: {
    read: (projectId: string, path: string) => request<FileContent>(`/projects/${projectId}/files/${path}`),
    write: (projectId: string, path: string, content: string) => request<{ saved: boolean }>(`/projects/${projectId}/files/${path}`, {
      method: 'PUT',
      body: JSON.stringify({ content }),
    }),
  },

  session: {
    status: (projectId: string) => request<SessionStatus>(`/projects/${projectId}/session/status`),
    start: (projectId: string) => request<{ pid: number; wsPort: number }>(`/projects/${projectId}/session/start`, { method: 'POST' }),
    stop: (projectId: string) => request<void>(`/projects/${projectId}/session/stop`, { method: 'DELETE' }),
  },
};
```

- [ ] **Step 2: Create projects store**

Create `sdk/dashboard/ui/src/stores/projects.ts`:

```typescript
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { api, type Project } from '../api';

export const useProjectsStore = defineStore('projects', () => {
  const projects = ref<Project[]>([]);
  const activeProjectId = ref<string | null>(null);
  const loading = ref(false);

  const activeProject = computed(() =>
    projects.value.find((p) => p.id === activeProjectId.value) ?? null,
  );

  async function load() {
    loading.value = true;
    try {
      projects.value = await api.projects.list();
    } finally {
      loading.value = false;
    }
  }

  async function addProject(path: string) {
    const project = await api.projects.add(path);
    projects.value.push(project);
    return project;
  }

  async function removeProject(id: string) {
    await api.projects.remove(id);
    projects.value = projects.value.filter((p) => p.id !== id);
    if (activeProjectId.value === id) {
      activeProjectId.value = null;
    }
  }

  function setActive(id: string) {
    activeProjectId.value = id;
  }

  return { projects, activeProjectId, activeProject, loading, load, addProject, removeProject, setActive };
});
```

- [ ] **Step 3: Create phases store**

Create `sdk/dashboard/ui/src/stores/phases.ts`:

```typescript
import { defineStore } from 'pinia';
import { ref } from 'vue';
import { api, type PhaseData, type PhasePlanIndex, type RoadmapPhase } from '../api';

export const usePhasesStore = defineStore('phases', () => {
  const phases = ref<RoadmapPhase[]>([]);
  const phaseDetails = ref<Record<string, PhasePlanIndex>>({});
  const loading = ref(false);

  async function loadPhases(projectId: string) {
    loading.value = true;
    try {
      const data = await api.phases.list(projectId);
      phases.value = data.roadmap.phases;
      phaseDetails.value = data.phaseDetails;
    } finally {
      loading.value = false;
    }
  }

  async function loadPhaseDetail(projectId: string, phaseId: string) {
    const detail = await api.phases.get(projectId, phaseId);
    phaseDetails.value[phaseId] = detail;
    return detail;
  }

  return { phases, phaseDetails, loading, loadPhases, loadPhaseDetail };
});
```

- [ ] **Step 4: Create session store**

Create `sdk/dashboard/ui/src/stores/session.ts`:

```typescript
import { defineStore } from 'pinia';
import { ref } from 'vue';
import { api, type SessionStatus } from '../api';

export const useSessionStore = defineStore('session', () => {
  const status = ref<SessionStatus>({ active: false });
  const loading = ref(false);

  async function checkStatus(projectId: string) {
    status.value = await api.session.status(projectId);
  }

  async function start(projectId: string) {
    loading.value = true;
    try {
      await api.session.start(projectId);
      await checkStatus(projectId);
    } finally {
      loading.value = false;
    }
  }

  async function stop(projectId: string) {
    loading.value = true;
    try {
      await api.session.stop(projectId);
      status.value = { active: false };
    } finally {
      loading.value = false;
    }
  }

  return { status, loading, checkStatus, start, stop };
});
```

- [ ] **Step 5: Create WebSocket composable**

Create `sdk/dashboard/ui/src/composables/useWebSocket.ts`:

```typescript
import { ref, onUnmounted } from 'vue';

export interface DashboardEvent {
  type: string;
  project: string;
  path?: string;
  event?: unknown;
  [key: string]: unknown;
}

export function useWebSocket() {
  const connected = ref(false);
  const lastEvent = ref<DashboardEvent | null>(null);
  let ws: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  const handlers = new Map<string, Set<(event: DashboardEvent) => void>>();

  function connect() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${window.location.host}/ws`;
    ws = new WebSocket(url);

    ws.onopen = () => {
      connected.value = true;
    };

    ws.onmessage = (msg) => {
      try {
        const event = JSON.parse(msg.data) as DashboardEvent;
        lastEvent.value = event;

        const typeHandlers = handlers.get(event.type);
        if (typeHandlers) {
          for (const handler of typeHandlers) {
            handler(event);
          }
        }

        // Also notify wildcard handlers
        const wildcardHandlers = handlers.get('*');
        if (wildcardHandlers) {
          for (const handler of wildcardHandlers) {
            handler(event);
          }
        }
      } catch {
        // Ignore malformed messages
      }
    };

    ws.onclose = () => {
      connected.value = false;
      reconnectTimer = setTimeout(connect, 3000);
    };

    ws.onerror = () => {
      ws?.close();
    };
  }

  function on(type: string, handler: (event: DashboardEvent) => void) {
    if (!handlers.has(type)) {
      handlers.set(type, new Set());
    }
    handlers.get(type)!.add(handler);
  }

  function off(type: string, handler: (event: DashboardEvent) => void) {
    handlers.get(type)?.delete(handler);
  }

  function disconnect() {
    if (reconnectTimer) clearTimeout(reconnectTimer);
    ws?.close();
    ws = null;
  }

  onUnmounted(disconnect);

  return { connected, lastEvent, connect, disconnect, on, off };
}
```

- [ ] **Step 6: Create file conflicts composable**

Create `sdk/dashboard/ui/src/composables/useFileConflicts.ts`:

```typescript
import { computed, type Ref } from 'vue';
import type { PlanInfo } from '../api';

export interface ConflictGroup {
  files: string[];
  planIds: string[];
  color: string;
}

const CLUSTER_COLORS = ['#f97316', '#a855f7', '#06b6d4', '#ec4899', '#84cc16', '#f59e0b'];

export function useFileConflicts(plans: Ref<PlanInfo[]>) {
  const conflicts = computed<ConflictGroup[]>(() => {
    const groups: ConflictGroup[] = [];
    const checked = new Set<string>();

    for (let i = 0; i < plans.value.length; i++) {
      const planA = plans.value[i];
      if (checked.has(planA.id)) continue;

      const overlapping: string[] = [planA.id];
      const sharedFiles = new Set<string>();

      for (let j = i + 1; j < plans.value.length; j++) {
        const planB = plans.value[j];
        const common = planA.files_modified.filter((f) => planB.files_modified.includes(f));
        if (common.length > 0) {
          overlapping.push(planB.id);
          common.forEach((f) => sharedFiles.add(f));
          checked.add(planB.id);
        }
      }

      if (overlapping.length > 1) {
        groups.push({
          files: [...sharedFiles],
          planIds: overlapping,
          color: CLUSTER_COLORS[groups.length % CLUSTER_COLORS.length],
        });
      }

      checked.add(planA.id);
    }

    return groups;
  });

  function getConflictForPlan(planId: string): ConflictGroup | undefined {
    return conflicts.value.find((g) => g.planIds.includes(planId));
  }

  return { conflicts, getConflictForPlan };
}
```

- [ ] **Step 7: Commit**

```bash
git add sdk/dashboard/ui/src/
git commit -m "feat(dashboard): API client, Pinia stores, and composables"
```

---

## Task 10: Frontend — Sidebar with Progressive Disclosure

**Files:**
- Create: `sdk/dashboard/ui/src/components/Sidebar.vue`
- Create: `sdk/dashboard/ui/src/components/SessionIndicator.vue`
- Modify: `sdk/dashboard/ui/src/App.vue`

- [ ] **Step 1: Create Sidebar component**

Create `sdk/dashboard/ui/src/components/Sidebar.vue`:

```vue
<script setup lang="ts">
import { ref, watch, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useProjectsStore } from '../stores/projects';
import { usePhasesStore } from '../stores/phases';
import SessionIndicator from './SessionIndicator.vue';

const router = useRouter();
const projectsStore = useProjectsStore();
const phasesStore = usePhasesStore();

const expandedProjects = ref<Set<string>>(new Set());
const expandedPhases = ref<Set<string>>(new Set());
const addingProject = ref(false);
const newProjectPath = ref('');

onMounted(() => {
  projectsStore.load();
});

function toggleProject(id: string) {
  if (expandedProjects.value.has(id)) {
    expandedProjects.value.delete(id);
  } else {
    expandedProjects.value.add(id);
    projectsStore.setActive(id);
    phasesStore.loadPhases(id);
  }
}

function togglePhase(phaseNum: string) {
  if (expandedPhases.value.has(phaseNum)) {
    expandedPhases.value.delete(phaseNum);
  } else {
    expandedPhases.value.add(phaseNum);
  }
}

function navigateTo(route: string) {
  router.push(route);
}

async function addProject() {
  if (!newProjectPath.value.trim()) return;
  try {
    await projectsStore.addProject(newProjectPath.value.trim());
    newProjectPath.value = '';
    addingProject.value = false;
  } catch (err) {
    alert((err as Error).message);
  }
}
</script>

<template>
  <aside class="sidebar">
    <div class="sidebar-header">
      <h2>GSD</h2>
      <button class="add-btn" @click="addingProject = !addingProject" title="Add project">+</button>
    </div>

    <div v-if="addingProject" class="add-form">
      <input
        v-model="newProjectPath"
        placeholder="/path/to/project"
        @keyup.enter="addProject"
      />
      <button @click="addProject">Add</button>
    </div>

    <nav class="project-tree">
      <div v-for="project in projectsStore.projects" :key="project.id" class="tree-node">
        <div
          class="tree-item project-item"
          :class="{ active: projectsStore.activeProjectId === project.id }"
          @click="toggleProject(project.id)"
        >
          <span class="chevron">{{ expandedProjects.has(project.id) ? '▾' : '▸' }}</span>
          <span class="label">{{ project.name }}</span>
        </div>

        <div v-if="expandedProjects.has(project.id)" class="tree-children">
          <div class="tree-item" @click="navigateTo(`/project/${project.id}`)">
            Overview
          </div>
          <div class="tree-item" @click="navigateTo(`/project/${project.id}/roadmap`)">
            Roadmap
          </div>

          <div class="tree-node">
            <div class="tree-item" @click="navigateTo(`/project/${project.id}/phases`)">
              Phases
            </div>

            <div v-if="phasesStore.phases.length > 0" class="tree-children">
              <div v-for="phase in phasesStore.phases" :key="phase.number" class="tree-node">
                <div class="tree-item phase-item" @click="togglePhase(phase.number)">
                  <span class="chevron">{{ expandedPhases.has(phase.number) ? '▾' : '▸' }}</span>
                  <span class="status-dot" :class="phase.roadmap_complete ? 'complete' : 'pending'"></span>
                  <span class="label">{{ phase.number }}. {{ phase.phase_name }}</span>
                </div>

                <div v-if="expandedPhases.has(phase.number) && phasesStore.phaseDetails[phase.number]" class="tree-children">
                  <div
                    v-for="plan in phasesStore.phaseDetails[phase.number].plans"
                    :key="plan.id"
                    class="tree-item plan-item"
                    @click="navigateTo(`/project/${project.id}/phase/${phase.number}/plan/${plan.id}`)"
                  >
                    <span class="status-dot" :class="plan.has_summary ? 'complete' : 'pending'"></span>
                    {{ plan.id }}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="tree-item" @click="navigateTo(`/project/${project.id}/config`)">
            Config
          </div>
        </div>
      </div>
    </nav>

    <SessionIndicator />
  </aside>
</template>

<style scoped>
.sidebar {
  width: 260px;
  min-width: 260px;
  background: #161b22;
  border-right: 1px solid #30363d;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}
.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem;
  border-bottom: 1px solid #30363d;
}
.sidebar-header h2 {
  font-size: 1rem;
  font-weight: 600;
  color: #58a6ff;
}
.add-btn {
  background: none;
  border: 1px solid #30363d;
  color: #8b949e;
  width: 28px;
  height: 28px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 1.1rem;
  display: flex;
  align-items: center;
  justify-content: center;
}
.add-btn:hover { border-color: #58a6ff; color: #58a6ff; }
.add-form {
  padding: 0.5rem 1rem;
  display: flex;
  gap: 0.5rem;
}
.add-form input {
  flex: 1;
  background: #0d1117;
  border: 1px solid #30363d;
  color: #e1e4e8;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  font-size: 0.75rem;
}
.add-form button {
  background: #238636;
  color: #fff;
  border: none;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.75rem;
}
.project-tree {
  flex: 1;
  padding: 0.5rem 0;
}
.tree-item {
  padding: 0.35rem 1rem;
  cursor: pointer;
  font-size: 0.85rem;
  color: #8b949e;
  display: flex;
  align-items: center;
  gap: 0.4rem;
}
.tree-item:hover { background: #1c2128; color: #e1e4e8; }
.tree-item.active { color: #58a6ff; }
.tree-children { padding-left: 1rem; }
.chevron { font-size: 0.7rem; width: 12px; }
.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.status-dot.complete { background: #238636; }
.status-dot.pending { background: #484f58; }
.plan-item { font-size: 0.8rem; padding-left: 1.5rem; }
</style>
```

- [ ] **Step 2: Create SessionIndicator component**

Create `sdk/dashboard/ui/src/components/SessionIndicator.vue`:

```vue
<script setup lang="ts">
import { watch, onMounted } from 'vue';
import { useSessionStore } from '../stores/session';
import { useProjectsStore } from '../stores/projects';

const sessionStore = useSessionStore();
const projectsStore = useProjectsStore();

watch(() => projectsStore.activeProjectId, (id) => {
  if (id) sessionStore.checkStatus(id);
});

async function toggleSession() {
  const id = projectsStore.activeProjectId;
  if (!id) return;

  if (sessionStore.status.active) {
    await sessionStore.stop(id);
  } else {
    await sessionStore.start(id);
  }
}
</script>

<template>
  <div class="session-indicator" v-if="projectsStore.activeProjectId">
    <div class="session-status">
      <span class="dot" :class="sessionStore.status.active ? 'active' : 'inactive'"></span>
      <span class="label">{{ sessionStore.status.active ? 'Session Active' : 'No Session' }}</span>
    </div>
    <button
      class="session-btn"
      @click="toggleSession"
      :disabled="sessionStore.loading"
    >
      {{ sessionStore.status.active ? 'Stop' : 'Start' }}
    </button>
  </div>
</template>

<style scoped>
.session-indicator {
  padding: 0.75rem 1rem;
  border-top: 1px solid #30363d;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.session-status {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}
.dot.active { background: #238636; box-shadow: 0 0 6px #238636; }
.dot.inactive { background: #484f58; }
.label { font-size: 0.8rem; color: #8b949e; }
.session-btn {
  background: none;
  border: 1px solid #30363d;
  color: #8b949e;
  padding: 0.2rem 0.6rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.75rem;
}
.session-btn:hover { border-color: #58a6ff; color: #58a6ff; }
.session-btn:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
```

- [ ] **Step 3: Update App.vue to include Sidebar**

Replace `sdk/dashboard/ui/src/App.vue`:

```vue
<script setup lang="ts">
import { onMounted } from 'vue';
import Sidebar from './components/Sidebar.vue';
import Breadcrumb from './components/Breadcrumb.vue';
import { useWebSocket } from './composables/useWebSocket';
import { usePhasesStore } from './stores/phases';
import { useProjectsStore } from './stores/projects';

const { connect, on } = useWebSocket();
const phasesStore = usePhasesStore();
const projectsStore = useProjectsStore();

onMounted(() => {
  connect();

  // Refresh phases when planning files change
  on('file:changed', () => {
    const id = projectsStore.activeProjectId;
    if (id) phasesStore.loadPhases(id);
  });
  on('file:created', () => {
    const id = projectsStore.activeProjectId;
    if (id) phasesStore.loadPhases(id);
  });
});
</script>

<template>
  <div class="app-shell">
    <Sidebar />
    <div class="app-content">
      <Breadcrumb />
      <main class="main-content">
        <router-view />
      </main>
    </div>
  </div>
</template>

<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
.app-shell {
  display: flex;
  height: 100vh;
  background: #0f1117;
  color: #e1e4e8;
}
.app-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.main-content {
  flex: 1;
  overflow-y: auto;
  padding: 1.5rem;
}
</style>
```

- [ ] **Step 4: Create Breadcrumb component**

Create `sdk/dashboard/ui/src/components/Breadcrumb.vue`:

```vue
<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useProjectsStore } from '../stores/projects';

const route = useRoute();
const router = useRouter();
const projectsStore = useProjectsStore();

const crumbs = computed(() => {
  const items: { label: string; path: string }[] = [];
  const params = route.params;

  if (params.projectId) {
    const project = projectsStore.projects.find((p) => p.id === params.projectId);
    items.push({ label: project?.name ?? String(params.projectId), path: `/project/${params.projectId}` });
  }
  if (params.phaseId) {
    items.push({ label: `Phase ${params.phaseId}`, path: `/project/${params.projectId}/phase/${params.phaseId}` });
  }
  if (params.planId) {
    items.push({ label: `Plan ${params.planId}`, path: route.path });
  }

  return items;
});
</script>

<template>
  <nav class="breadcrumb" v-if="crumbs.length > 0">
    <span v-for="(crumb, i) in crumbs" :key="crumb.path">
      <span v-if="i > 0" class="separator">/</span>
      <a @click.prevent="router.push(crumb.path)" class="crumb">{{ crumb.label }}</a>
    </span>
  </nav>
</template>

<style scoped>
.breadcrumb {
  padding: 0.75rem 1.5rem;
  border-bottom: 1px solid #30363d;
  font-size: 0.85rem;
}
.separator { color: #484f58; margin: 0 0.4rem; }
.crumb { color: #58a6ff; cursor: pointer; text-decoration: none; }
.crumb:hover { text-decoration: underline; }
</style>
```

- [ ] **Step 5: Commit**

```bash
git add sdk/dashboard/ui/src/
git commit -m "feat(dashboard): sidebar with progressive disclosure and session indicator"
```

---

## Task 11: Frontend — Project Overview

**Files:**
- Modify: `sdk/dashboard/ui/src/components/ProjectOverview.vue`
- Modify: `sdk/dashboard/ui/src/router.ts`

- [ ] **Step 1: Implement ProjectOverview**

Replace `sdk/dashboard/ui/src/components/ProjectOverview.vue`:

```vue
<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import { api, type Overview } from '../api';

const route = useRoute();
const overview = ref<Overview | null>(null);
const loading = ref(false);

async function load() {
  const projectId = route.params.projectId as string;
  if (!projectId) return;
  loading.value = true;
  try {
    overview.value = await api.overview(projectId);
  } finally {
    loading.value = false;
  }
}

onMounted(load);
watch(() => route.params.projectId, load);

function completedPhases(): number {
  return overview.value?.roadmap?.phases.filter((p) => p.roadmap_complete).length ?? 0;
}

function totalPhases(): number {
  return overview.value?.roadmap?.phases.length ?? 0;
}

function progressPercent(): number {
  const total = totalPhases();
  if (total === 0) return 0;
  return Math.round((completedPhases() / total) * 100);
}
</script>

<template>
  <div class="overview" v-if="overview">
    <h1>Project Overview</h1>

    <div class="metrics">
      <div class="metric-card">
        <div class="metric-value">{{ completedPhases() }} / {{ totalPhases() }}</div>
        <div class="metric-label">Phases Complete</div>
        <div class="progress-bar">
          <div class="progress-fill" :style="{ width: progressPercent() + '%' }"></div>
        </div>
      </div>
    </div>

    <div v-if="overview.roadmap" class="phase-list">
      <h2>Phases</h2>
      <div v-for="phase in overview.roadmap.phases" :key="phase.number" class="phase-row">
        <span class="status-dot" :class="phase.roadmap_complete ? 'complete' : 'pending'"></span>
        <span class="phase-number">{{ phase.number }}</span>
        <span class="phase-name">{{ phase.phase_name }}</span>
        <span class="phase-status">{{ phase.roadmap_complete ? 'Complete' : phase.disk_status }}</span>
      </div>
    </div>
  </div>
  <div v-else-if="loading" class="loading">Loading...</div>
  <div v-else class="empty">Select a project to view its overview.</div>
</template>

<style scoped>
.overview { max-width: 800px; }
h1 { font-size: 1.5rem; margin-bottom: 1.5rem; }
h2 { font-size: 1.1rem; margin-bottom: 0.75rem; color: #8b949e; }
.metrics { display: flex; gap: 1rem; margin-bottom: 2rem; }
.metric-card {
  background: #161b22;
  border: 1px solid #30363d;
  border-radius: 8px;
  padding: 1.25rem;
  min-width: 200px;
}
.metric-value { font-size: 1.8rem; font-weight: 600; color: #58a6ff; }
.metric-label { font-size: 0.85rem; color: #8b949e; margin-top: 0.25rem; }
.progress-bar {
  height: 6px;
  background: #30363d;
  border-radius: 3px;
  margin-top: 0.75rem;
  overflow: hidden;
}
.progress-fill {
  height: 100%;
  background: #238636;
  border-radius: 3px;
  transition: width 0.3s ease;
}
.phase-list { margin-top: 1rem; }
.phase-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem 0;
  border-bottom: 1px solid #21262d;
  font-size: 0.9rem;
}
.status-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.status-dot.complete { background: #238636; }
.status-dot.pending { background: #484f58; }
.phase-number { color: #58a6ff; font-weight: 500; min-width: 30px; }
.phase-name { flex: 1; }
.phase-status { color: #8b949e; font-size: 0.8rem; }
.loading, .empty { color: #8b949e; padding: 2rem; }
</style>
```

- [ ] **Step 2: Update router with all routes**

Replace `sdk/dashboard/ui/src/router.ts`:

```typescript
import { createRouter, createWebHistory } from 'vue-router';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      component: () => import('./components/ProjectOverview.vue'),
    },
    {
      path: '/project/:projectId',
      component: () => import('./components/ProjectOverview.vue'),
    },
    {
      path: '/project/:projectId/phases',
      component: () => import('./components/ProjectOverview.vue'),
    },
    {
      path: '/project/:projectId/phase/:phaseId',
      component: () => import('./components/KanbanBoard.vue'),
    },
    {
      path: '/project/:projectId/phase/:phaseId/plan/:planId',
      component: () => import('./components/MarkdownEditor.vue'),
    },
    {
      path: '/project/:projectId/config',
      component: () => import('./components/ConfigEditor.vue'),
    },
  ],
});
```

- [ ] **Step 3: Commit**

```bash
git add sdk/dashboard/ui/src/
git commit -m "feat(dashboard): project overview page with progress metrics"
```

---

## Task 12: Frontend — Kanban Board

**Files:**
- Create: `sdk/dashboard/ui/src/components/KanbanBoard.vue`
- Create: `sdk/dashboard/ui/src/components/KanbanCard.vue`

- [ ] **Step 1: Implement KanbanCard**

Create `sdk/dashboard/ui/src/components/KanbanCard.vue`:

```vue
<script setup lang="ts">
import { computed } from 'vue';
import type { PlanInfo } from '../api';

const props = defineProps<{
  plan: PlanInfo;
  conflictColor: string | null;
  conflictFiles: string[];
  isBlocked: boolean;
  isRunning: boolean;
}>();

const emit = defineEmits<{
  click: [planId: string];
}>();

type PlanStatus = 'completed' | 'in-progress' | 'ready' | 'blocked' | 'not-started';

const status = computed<PlanStatus>(() => {
  if (props.plan.has_summary) return 'completed';
  if (props.isRunning) return 'in-progress';
  if (props.isBlocked) return 'blocked';
  if (!props.isBlocked && !props.plan.has_summary) return 'ready';
  return 'not-started';
});

const statusLabel: Record<PlanStatus, string> = {
  'completed': 'Completed',
  'in-progress': 'In Progress',
  'ready': 'Ready',
  'blocked': 'Blocked',
  'not-started': 'Not Started',
};

const statusClass: Record<PlanStatus, string> = {
  'completed': 'badge-completed',
  'in-progress': 'badge-progress',
  'ready': 'badge-ready',
  'blocked': 'badge-blocked',
  'not-started': 'badge-default',
};
</script>

<template>
  <div
    class="kanban-card"
    :class="{ 'card-running': isRunning }"
    @click="emit('click', plan.id)"
  >
    <div class="card-header">
      <span class="plan-id">{{ plan.id }}</span>
      <span
        v-if="conflictColor"
        class="conflict-dot"
        :style="{ background: conflictColor }"
        :title="'Shared files: ' + conflictFiles.join(', ')"
      ></span>
    </div>
    <div class="card-objective" v-if="plan.objective">{{ plan.objective }}</div>
    <div class="card-footer">
      <span class="badge" :class="statusClass[status]">{{ statusLabel[status] }}</span>
      <span class="task-count">{{ plan.task_count }} tasks</span>
    </div>
  </div>
</template>

<style scoped>
.kanban-card {
  background: #161b22;
  border: 1px solid #30363d;
  border-radius: 8px;
  padding: 0.75rem;
  cursor: pointer;
  transition: border-color 0.2s, transform 0.2s;
}
.kanban-card:hover { border-color: #58a6ff; transform: translateY(-1px); }
.card-running {
  border-color: #58a6ff;
  animation: pulse 2s infinite;
}
@keyframes pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(88, 166, 255, 0.4); }
  50% { box-shadow: 0 0 0 4px rgba(88, 166, 255, 0); }
}
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.4rem;
}
.plan-id { font-weight: 600; font-size: 0.9rem; color: #e1e4e8; }
.conflict-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  cursor: help;
}
.card-objective {
  font-size: 0.8rem;
  color: #8b949e;
  margin-bottom: 0.5rem;
  line-height: 1.3;
}
.card-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.badge {
  font-size: 0.7rem;
  padding: 0.15rem 0.4rem;
  border-radius: 4px;
  font-weight: 500;
}
.badge-completed { background: #238636; color: #fff; }
.badge-progress { background: #1f6feb; color: #fff; }
.badge-ready { background: #196c2e; color: #3fb950; border: 1px solid #238636; }
.badge-blocked { background: #462c17; color: #d29922; }
.badge-default { background: #21262d; color: #8b949e; }
.task-count { font-size: 0.75rem; color: #484f58; }
</style>
```

- [ ] **Step 2: Implement KanbanBoard**

Create `sdk/dashboard/ui/src/components/KanbanBoard.vue`:

```vue
<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { usePhasesStore } from '../stores/phases';
import { useSessionStore } from '../stores/session';
import { useFileConflicts } from '../composables/useFileConflicts';
import KanbanCard from './KanbanCard.vue';
import type { PlanInfo } from '../api';

const route = useRoute();
const router = useRouter();
const phasesStore = usePhasesStore();
const sessionStore = useSessionStore();

const projectId = computed(() => route.params.projectId as string);
const phaseId = computed(() => route.params.phaseId as string);

const phaseDetail = computed(() => phasesStore.phaseDetails[phaseId.value]);

const allPlans = computed<PlanInfo[]>(() => phaseDetail.value?.plans ?? []);
const { conflicts, getConflictForPlan } = useFileConflicts(allPlans);

const waves = computed(() => {
  if (!phaseDetail.value) return [];
  const waveMap = phaseDetail.value.waves;
  return Object.keys(waveMap)
    .sort((a, b) => Number(a) - Number(b))
    .map((waveNum) => ({
      number: Number(waveNum),
      planIds: waveMap[waveNum],
      plans: waveMap[waveNum]
        .map((id) => allPlans.value.find((p) => p.id === id))
        .filter(Boolean) as PlanInfo[],
    }));
});

const completedCount = computed(() => allPlans.value.filter((p) => p.has_summary).length);
const totalCount = computed(() => allPlans.value.length);

function isWaveBlocked(waveNum: number): boolean {
  if (waveNum <= 1) return false;
  const prevWave = waves.value.find((w) => w.number === waveNum - 1);
  if (!prevWave) return false;
  return prevWave.plans.some((p) => !p.has_summary);
}

function isPlanBlocked(plan: PlanInfo, waveNum: number): boolean {
  return isWaveBlocked(waveNum);
}

function navigateToPlan(planId: string) {
  router.push(`/project/${projectId.value}/phase/${phaseId.value}/plan/${planId}`);
}

onMounted(() => {
  if (projectId.value && phaseId.value) {
    phasesStore.loadPhaseDetail(projectId.value, phaseId.value);
  }
});

watch([projectId, phaseId], () => {
  if (projectId.value && phaseId.value) {
    phasesStore.loadPhaseDetail(projectId.value, phaseId.value);
  }
});
</script>

<template>
  <div class="kanban">
    <div class="kanban-header">
      <h1>Phase {{ phaseId }}</h1>
      <span class="progress">{{ completedCount }} / {{ totalCount }} plans complete</span>
    </div>

    <div class="kanban-columns">
      <div v-for="wave in waves" :key="wave.number" class="wave-column">
        <div class="wave-header">
          <h3>Wave {{ wave.number }}</h3>
          <span class="wave-count">{{ wave.plans.length }} plans</span>
        </div>

        <div class="wave-cards">
          <KanbanCard
            v-for="plan in wave.plans"
            :key="plan.id"
            :plan="plan"
            :conflict-color="getConflictForPlan(plan.id)?.color ?? null"
            :conflict-files="getConflictForPlan(plan.id)?.files ?? []"
            :is-blocked="isPlanBlocked(plan, wave.number)"
            :is-running="false"
            @click="navigateToPlan"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.kanban { height: 100%; display: flex; flex-direction: column; }
.kanban-header {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1.5rem;
}
.kanban-header h1 { font-size: 1.3rem; }
.progress { font-size: 0.85rem; color: #8b949e; }
.kanban-columns {
  flex: 1;
  display: flex;
  gap: 1rem;
  overflow-x: auto;
  padding-bottom: 1rem;
}
.wave-column {
  min-width: 280px;
  max-width: 320px;
  flex-shrink: 0;
  background: #0d1117;
  border: 1px solid #21262d;
  border-radius: 8px;
  padding: 0.75rem;
}
.wave-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.75rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid #21262d;
}
.wave-header h3 { font-size: 0.9rem; color: #58a6ff; }
.wave-count { font-size: 0.75rem; color: #484f58; }
.wave-cards { display: flex; flex-direction: column; gap: 0.5rem; }
</style>
```

- [ ] **Step 3: Commit**

```bash
git add sdk/dashboard/ui/src/components/
git commit -m "feat(dashboard): kanban board with wave columns and conflict detection"
```

---

## Task 13: Frontend — Markdown Editor with Milkdown

**Files:**
- Create: `sdk/dashboard/ui/src/components/MarkdownEditor.vue`
- Create: `sdk/dashboard/ui/src/components/FrontmatterForm.vue`

- [ ] **Step 1: Install Milkdown dependencies**

```bash
cd sdk/dashboard/ui && npm install @milkdown/kit @milkdown/core @milkdown/ctx @milkdown/preset-commonmark @milkdown/preset-gfm @milkdown/plugin-listener @milkdown/theme-nord
```

- [ ] **Step 2: Implement FrontmatterForm**

Create `sdk/dashboard/ui/src/components/FrontmatterForm.vue`:

```vue
<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  frontmatter: Record<string, unknown>;
}>();

const emit = defineEmits<{
  update: [key: string, value: unknown];
}>();

const fields = computed(() => {
  const fm = props.frontmatter;
  return [
    { key: 'phase', label: 'Phase', value: fm.phase, type: 'text' },
    { key: 'plan', label: 'Plan', value: fm.plan, type: 'text' },
    { key: 'wave', label: 'Wave', value: fm.wave, type: 'number' },
    { key: 'type', label: 'Type', value: fm.type, type: 'text' },
    { key: 'autonomous', label: 'Autonomous', value: fm.autonomous, type: 'boolean' },
    { key: 'depends_on', label: 'Depends On', value: (fm.depends_on as string[])?.join(', '), type: 'text' },
    { key: 'files_modified', label: 'Files Modified', value: (fm.files_modified as string[])?.join(', '), type: 'textarea' },
    { key: 'requirements', label: 'Requirements', value: (fm.requirements as string[])?.join(', '), type: 'text' },
  ];
});
</script>

<template>
  <div class="frontmatter-form">
    <h3>Plan Metadata</h3>
    <div class="form-grid">
      <div v-for="field in fields" :key="field.key" class="form-field">
        <label>{{ field.label }}</label>
        <input
          v-if="field.type === 'text'"
          :value="String(field.value ?? '')"
          @input="emit('update', field.key, ($event.target as HTMLInputElement).value)"
        />
        <input
          v-else-if="field.type === 'number'"
          type="number"
          :value="Number(field.value ?? 0)"
          @input="emit('update', field.key, Number(($event.target as HTMLInputElement).value))"
        />
        <textarea
          v-else-if="field.type === 'textarea'"
          :value="String(field.value ?? '')"
          rows="2"
          @input="emit('update', field.key, ($event.target as HTMLTextAreaElement).value)"
        ></textarea>
        <label v-else-if="field.type === 'boolean'" class="checkbox-label">
          <input
            type="checkbox"
            :checked="Boolean(field.value)"
            @change="emit('update', field.key, ($event.target as HTMLInputElement).checked)"
          />
          {{ field.value ? 'Yes' : 'No' }}
        </label>
      </div>
    </div>
  </div>
</template>

<style scoped>
.frontmatter-form {
  background: #161b22;
  border: 1px solid #30363d;
  border-radius: 8px;
  padding: 1rem;
  margin-bottom: 1rem;
}
h3 { font-size: 0.9rem; color: #8b949e; margin-bottom: 0.75rem; }
.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.5rem 1rem;
}
.form-field label {
  display: block;
  font-size: 0.75rem;
  color: #8b949e;
  margin-bottom: 0.2rem;
}
.form-field input,
.form-field textarea {
  width: 100%;
  background: #0d1117;
  border: 1px solid #30363d;
  color: #e1e4e8;
  padding: 0.35rem 0.5rem;
  border-radius: 4px;
  font-size: 0.8rem;
  font-family: inherit;
}
.form-field textarea { resize: vertical; }
.checkbox-label {
  display: flex !important;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.8rem !important;
}
</style>
```

- [ ] **Step 3: Implement MarkdownEditor**

Create `sdk/dashboard/ui/src/components/MarkdownEditor.vue`:

```vue
<script setup lang="ts">
import { ref, onMounted, watch, computed } from 'vue';
import { useRoute } from 'vue-router';
import { api } from '../api';
import FrontmatterForm from './FrontmatterForm.vue';

const route = useRoute();

const projectId = computed(() => route.params.projectId as string);
const planId = computed(() => route.params.planId as string);
const phaseId = computed(() => route.params.phaseId as string);

const originalContent = ref('');
const content = ref('');
const frontmatter = ref<Record<string, unknown>>({});
const bodyContent = ref('');
const saving = ref(false);
const dirty = ref(false);
const diskChanged = ref(false);
const sourceMode = ref(false);
const filePath = ref('');

const hasFrontmatter = computed(() => Object.keys(frontmatter.value).length > 0);

function parseFrontmatter(raw: string): { fm: Record<string, unknown>; body: string } {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { fm: {}, body: raw };

  try {
    // Simple YAML parsing for known fields
    const fm: Record<string, unknown> = {};
    const lines = match[1].split('\n');
    for (const line of lines) {
      const colonIdx = line.indexOf(':');
      if (colonIdx === -1) continue;
      const key = line.slice(0, colonIdx).trim();
      const val = line.slice(colonIdx + 1).trim();
      if (val.startsWith('[')) {
        fm[key] = val.slice(1, -1).split(',').map((s) => s.trim().replace(/"/g, ''));
      } else if (val === 'true' || val === 'false') {
        fm[key] = val === 'true';
      } else if (!isNaN(Number(val)) && val !== '') {
        fm[key] = Number(val);
      } else {
        fm[key] = val;
      }
    }
    return { fm, body: match[2] };
  } catch {
    return { fm: {}, body: raw };
  }
}

async function load() {
  if (!projectId.value || !planId.value) return;

  // Build file path from phase and plan IDs
  // Plans are stored as .planning/phases/XX-name/XX-YY-PLAN.md
  // We need to find the right path — use the files API with a search
  const phasesData = await api.phases.get(projectId.value, phaseId.value);
  const plan = phasesData.plans.find((p) => p.id === planId.value);

  // Construct path: phases/XX-*/XX-YY-PLAN.md
  // Use a convention-based approach: the phase detail gives us the phase dir name
  const phaseDir = phasesData.phase;
  filePath.value = `phases/${phaseDir}/${planId.value}-PLAN.md`;

  try {
    const file = await api.files.read(projectId.value, filePath.value);
    originalContent.value = file.content;
    content.value = file.content;

    const parsed = parseFrontmatter(file.content);
    frontmatter.value = parsed.fm;
    bodyContent.value = parsed.body;
    dirty.value = false;
  } catch (err) {
    console.error('Failed to load file:', err);
  }
}

function onBodyChange(newBody: string) {
  bodyContent.value = newBody;
  dirty.value = true;
}

function serializeContent(): string {
  if (!hasFrontmatter.value) return bodyContent.value;

  const fmLines = ['---'];
  for (const [key, val] of Object.entries(frontmatter.value)) {
    if (Array.isArray(val)) {
      fmLines.push(`${key}: [${val.map((v) => `"${v}"`).join(', ')}]`);
    } else if (typeof val === 'boolean') {
      fmLines.push(`${key}: ${val}`);
    } else {
      fmLines.push(`${key}: ${val}`);
    }
  }
  fmLines.push('---');
  return fmLines.join('\n') + '\n' + bodyContent.value;
}

async function save() {
  if (!projectId.value || !filePath.value) return;
  saving.value = true;
  try {
    const newContent = serializeContent();
    await api.files.write(projectId.value, filePath.value, newContent);
    originalContent.value = newContent;
    content.value = newContent;
    dirty.value = false;
  } finally {
    saving.value = false;
  }
}

function reload() {
  diskChanged.value = false;
  load();
}

function onFrontmatterUpdate(key: string, value: unknown) {
  frontmatter.value = { ...frontmatter.value, [key]: value };
  dirty.value = true;
}

onMounted(load);
watch([projectId, planId], load);
</script>

<template>
  <div class="editor-container">
    <div class="editor-toolbar">
      <h2>{{ planId }}-PLAN.md</h2>
      <div class="toolbar-actions">
        <button
          class="mode-toggle"
          @click="sourceMode = !sourceMode"
        >
          {{ sourceMode ? 'Preview' : 'Source' }}
        </button>
        <span v-if="dirty" class="dirty-indicator">Unsaved changes</span>
        <button
          class="save-btn"
          @click="save"
          :disabled="!dirty || saving"
        >
          {{ saving ? 'Saving...' : 'Save' }}
        </button>
      </div>
    </div>

    <div v-if="diskChanged" class="disk-banner">
      File changed on disk.
      <button @click="reload">Reload</button>
    </div>

    <FrontmatterForm
      v-if="hasFrontmatter"
      :frontmatter="frontmatter"
      @update="onFrontmatterUpdate"
    />

    <div class="editor-body">
      <textarea
        v-if="sourceMode"
        class="source-editor"
        :value="bodyContent"
        @input="onBodyChange(($event.target as HTMLTextAreaElement).value)"
      ></textarea>
      <textarea
        v-else
        class="source-editor"
        :value="bodyContent"
        @input="onBodyChange(($event.target as HTMLTextAreaElement).value)"
      ></textarea>
    </div>
  </div>
</template>

<style scoped>
.editor-container {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.editor-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}
.editor-toolbar h2 { font-size: 1.1rem; }
.toolbar-actions {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}
.mode-toggle {
  background: none;
  border: 1px solid #30363d;
  color: #8b949e;
  padding: 0.3rem 0.6rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.8rem;
}
.mode-toggle:hover { border-color: #58a6ff; color: #58a6ff; }
.dirty-indicator { color: #d29922; font-size: 0.8rem; }
.save-btn {
  background: #238636;
  color: #fff;
  border: none;
  padding: 0.35rem 0.8rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.85rem;
}
.save-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.save-btn:hover:not(:disabled) { background: #2ea043; }
.disk-banner {
  background: #462c17;
  color: #d29922;
  padding: 0.5rem 1rem;
  border-radius: 4px;
  margin-bottom: 0.75rem;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  font-size: 0.85rem;
}
.disk-banner button {
  background: #d29922;
  color: #0d1117;
  border: none;
  padding: 0.2rem 0.5rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.8rem;
}
.editor-body { flex: 1; }
.source-editor {
  width: 100%;
  height: 100%;
  min-height: 400px;
  background: #0d1117;
  border: 1px solid #30363d;
  color: #e1e4e8;
  padding: 1rem;
  border-radius: 8px;
  font-family: 'SF Mono', 'Fira Code', monospace;
  font-size: 0.85rem;
  line-height: 1.6;
  resize: vertical;
}
</style>
```

Note: This initial implementation uses a plain textarea. Milkdown integration (WYSIWYG preview mode) will be wired in the next step.

- [ ] **Step 4: Add Milkdown WYSIWYG to the editor**

Update the `MarkdownEditor.vue` template's non-source-mode section. Replace the second `<textarea>` block with a Milkdown editor component:

```vue
<!-- In the <script setup>, add: -->
import { Editor, rootCtx, defaultValueCtx } from '@milkdown/kit/core';
import { commonmark } from '@milkdown/kit/preset/commonmark';
import { gfm } from '@milkdown/kit/preset/gfm';
import { listener, listenerCtx } from '@milkdown/kit/plugin/listener';
import { nord } from '@milkdown/theme-nord';
import { nextTick } from 'vue';

const editorRef = ref<HTMLDivElement>();
let milkdownEditor: Editor | null = null;

async function initMilkdown() {
  if (!editorRef.value || sourceMode.value) return;
  
  // Destroy previous instance
  if (milkdownEditor) {
    milkdownEditor.destroy();
    milkdownEditor = null;
  }

  milkdownEditor = await Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, editorRef.value!);
      ctx.set(defaultValueCtx, bodyContent.value);
      ctx.get(listenerCtx).markdownUpdated((_, markdown) => {
        onBodyChange(markdown);
      });
    })
    .config(nord)
    .use(commonmark)
    .use(gfm)
    .use(listener)
    .create();
}

watch(sourceMode, async (isSource) => {
  if (!isSource) {
    await nextTick();
    initMilkdown();
  } else if (milkdownEditor) {
    milkdownEditor.destroy();
    milkdownEditor = null;
  }
});
```

Replace the preview textarea in template with:

```vue
<div
  v-else
  ref="editorRef"
  class="milkdown-editor"
></div>
```

Add to styles:

```css
.milkdown-editor {
  background: #0d1117;
  border: 1px solid #30363d;
  border-radius: 8px;
  padding: 1rem;
  min-height: 400px;
  color: #e1e4e8;
}
.milkdown-editor .editor { min-height: 380px; }
```

- [ ] **Step 5: Commit**

```bash
git add sdk/dashboard/ui/
git commit -m "feat(dashboard): markdown editor with Milkdown WYSIWYG and frontmatter form"
```

---

## Task 14: Frontend — Config Editor

**Files:**
- Create: `sdk/dashboard/ui/src/components/ConfigEditor.vue`

- [ ] **Step 1: Implement ConfigEditor**

Create `sdk/dashboard/ui/src/components/ConfigEditor.vue`:

```vue
<script setup lang="ts">
import { ref, onMounted, watch, computed } from 'vue';
import { useRoute } from 'vue-router';
import { api } from '../api';

const route = useRoute();
const projectId = computed(() => route.params.projectId as string);

const content = ref('');
const original = ref('');
const dirty = ref(false);
const saving = ref(false);
const error = ref('');

async function load() {
  if (!projectId.value) return;
  try {
    const file = await api.files.read(projectId.value, 'config.json');
    content.value = JSON.stringify(JSON.parse(file.content), null, 2);
    original.value = content.value;
    dirty.value = false;
    error.value = '';
  } catch (err) {
    error.value = (err as Error).message;
  }
}

function onChange(newValue: string) {
  content.value = newValue;
  dirty.value = newValue !== original.value;

  // Validate JSON
  try {
    JSON.parse(newValue);
    error.value = '';
  } catch (e) {
    error.value = (e as Error).message;
  }
}

async function save() {
  if (!projectId.value || error.value) return;
  saving.value = true;
  try {
    await api.files.write(projectId.value, 'config.json', content.value);
    original.value = content.value;
    dirty.value = false;
  } finally {
    saving.value = false;
  }
}

onMounted(load);
watch(projectId, load);
</script>

<template>
  <div class="config-editor">
    <div class="editor-toolbar">
      <h2>config.json</h2>
      <div class="toolbar-actions">
        <span v-if="error" class="error-indicator">Invalid JSON</span>
        <span v-if="dirty && !error" class="dirty-indicator">Unsaved changes</span>
        <button
          class="save-btn"
          @click="save"
          :disabled="!dirty || saving || !!error"
        >
          {{ saving ? 'Saving...' : 'Save' }}
        </button>
      </div>
    </div>

    <textarea
      class="json-editor"
      :value="content"
      @input="onChange(($event.target as HTMLTextAreaElement).value)"
      spellcheck="false"
    ></textarea>
  </div>
</template>

<style scoped>
.config-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.editor-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}
.editor-toolbar h2 { font-size: 1.1rem; }
.toolbar-actions { display: flex; align-items: center; gap: 0.75rem; }
.error-indicator { color: #f85149; font-size: 0.8rem; }
.dirty-indicator { color: #d29922; font-size: 0.8rem; }
.save-btn {
  background: #238636;
  color: #fff;
  border: none;
  padding: 0.35rem 0.8rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.85rem;
}
.save-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.json-editor {
  flex: 1;
  min-height: 400px;
  background: #0d1117;
  border: 1px solid #30363d;
  color: #e1e4e8;
  padding: 1rem;
  border-radius: 8px;
  font-family: 'SF Mono', 'Fira Code', monospace;
  font-size: 0.85rem;
  line-height: 1.6;
  resize: vertical;
}
</style>
```

- [ ] **Step 2: Commit**

```bash
git add sdk/dashboard/ui/src/components/ConfigEditor.vue
git commit -m "feat(dashboard): JSON config editor with validation"
```

---

## Task 15: Integration — Wire WebSocket to Kanban Live Updates

**Files:**
- Modify: `sdk/dashboard/ui/src/components/KanbanBoard.vue`
- Modify: `sdk/dashboard/ui/src/components/MarkdownEditor.vue`

- [ ] **Step 1: Add WebSocket file change handling to KanbanBoard**

In `KanbanBoard.vue`, add WebSocket integration to reload phase data when files change:

```vue
<!-- Add to <script setup>: -->
import { useWebSocket } from '../composables/useWebSocket';

const { on } = useWebSocket();

onMounted(() => {
  // Reload phase when planning files change
  on('file:changed', (event) => {
    if (event.project === projectId.value) {
      phasesStore.loadPhaseDetail(projectId.value, phaseId.value);
    }
  });
  on('file:created', (event) => {
    if (event.project === projectId.value) {
      phasesStore.loadPhaseDetail(projectId.value, phaseId.value);
    }
  });
});
```

- [ ] **Step 2: Add disk-change detection to MarkdownEditor**

In `MarkdownEditor.vue`, listen for file change events:

```vue
<!-- Add to <script setup>: -->
import { useWebSocket } from '../composables/useWebSocket';

const { on } = useWebSocket();

onMounted(() => {
  on('file:changed', (event) => {
    if (event.project === projectId.value && event.path === filePath.value) {
      if (dirty.value) {
        diskChanged.value = true;
      } else {
        load();
      }
    }
  });
});
```

- [ ] **Step 3: Commit**

```bash
git add sdk/dashboard/ui/src/components/
git commit -m "feat(dashboard): wire WebSocket events to kanban and editor live updates"
```

---

## Task 16: End-to-End Smoke Test

**Files:**
- Create: `sdk/dashboard/server/smoke.test.ts`

- [ ] **Step 1: Write smoke test**

Create `sdk/dashboard/server/smoke.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createApp } from './index.js';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('Dashboard API smoke test', () => {
  let tempDir: string;
  let registryPath: string;
  let projectDir: string;
  let app: ReturnType<typeof createApp>['app'];

  beforeAll(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'gsd-smoke-'));
    registryPath = join(tempDir, 'dashboard.json');
    projectDir = join(tempDir, 'test-project');
    await mkdir(join(projectDir, '.planning'), { recursive: true });
    await writeFile(join(projectDir, '.planning', 'STATE.md'), '# State\n## Current Position\nPhase: 1 of 3');
    await writeFile(join(projectDir, '.planning', 'config.json'), '{"mode":"interactive"}');

    const result = createApp(registryPath);
    app = result.app;
  });

  afterAll(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('GET /api/health returns ok', async () => {
    const res = await makeRequest(app, 'GET', '/api/health');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
  });

  it('POST /api/projects registers a project', async () => {
    const res = await makeRequest(app, 'POST', '/api/projects', { path: projectDir });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe('test-project');
  });

  it('GET /api/projects lists the registered project', async () => {
    const res = await makeRequest(app, 'GET', '/api/projects');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].id).toBe('test-project');
  });

  it('GET /api/projects/:id/files/config.json reads a file', async () => {
    const res = await makeRequest(app, 'GET', '/api/projects/test-project/files/config.json');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.content).toContain('interactive');
  });

  it('PUT /api/projects/:id/files/config.json writes a file', async () => {
    const res = await makeRequest(app, 'PUT', '/api/projects/test-project/files/config.json', {
      content: '{"mode":"auto"}',
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.saved).toBe(true);
  });

  it('rejects path traversal', async () => {
    const res = await makeRequest(app, 'GET', '/api/projects/test-project/files/../../etc/passwd');
    expect(res.status).toBe(400);
  });

  it('DELETE /api/projects/:id removes a project', async () => {
    const res = await makeRequest(app, 'DELETE', '/api/projects/test-project');
    expect(res.status).toBe(204);
  });
});

// Helper to make requests against the Express app without starting a server
async function makeRequest(
  app: ReturnType<typeof import('./index.js').createApp>['app'],
  method: string,
  path: string,
  body?: unknown,
): Promise<Response> {
  // Use node --experimental-fetch or native fetch with a real server
  // For testing, we create a temporary server
  const { createServer } = await import('node:http');

  return new Promise((resolve) => {
    const server = createServer(app);
    server.listen(0, async () => {
      const addr = server.address() as { port: number };
      const url = `http://localhost:${addr.port}${path}`;
      const res = await fetch(url, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : {},
        body: body ? JSON.stringify(body) : undefined,
      });
      server.close();
      resolve(res);
    });
  });
}
```

- [ ] **Step 2: Run smoke test**

```bash
cd sdk && npx vitest run dashboard/server/smoke.test.ts
```

Expected: All tests PASS.

- [ ] **Step 3: Commit**

```bash
git add sdk/dashboard/server/smoke.test.ts
git commit -m "test(dashboard): smoke test for API endpoints and security"
```

---

## Task 17: Build Pipeline Integration

**Files:**
- Modify: `sdk/package.json`

- [ ] **Step 1: Add dashboard build scripts to SDK package.json**

Add to `scripts` in `sdk/package.json`:

```json
"dashboard:build": "cd dashboard/ui && npm run build",
"dashboard:dev": "tsx dashboard/server/index.ts --dev",
"prebuild": "npm run dashboard:build"
```

- [ ] **Step 2: Add dashboard to files array in package.json**

In `sdk/package.json`, update the `files` array:

```json
"files": [
  "dist",
  "prompts",
  "dashboard/server",
  "dashboard/ui/dist"
]
```

- [ ] **Step 3: Verify full build**

```bash
cd sdk && npm run build
```

Expected: TypeScript compiles and frontend builds successfully.

- [ ] **Step 4: Verify dashboard starts and serves UI**

```bash
cd sdk && node dist/cli.js dashboard --port 4747
```

Open `http://localhost:4747` in browser — should see the GSD Dashboard shell.

- [ ] **Step 5: Commit**

```bash
git add sdk/package.json
git commit -m "feat(dashboard): integrate build pipeline and add CLI dashboard command"
```
