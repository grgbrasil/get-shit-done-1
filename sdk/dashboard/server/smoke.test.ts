import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createApp } from './index.js';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer, type Server } from 'node:http';

describe('Dashboard API smoke test', () => {
  let tempDir: string;
  let registryPath: string;
  let projectDir: string;
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'gsd-smoke-'));
    registryPath = join(tempDir, 'dashboard.json');
    projectDir = join(tempDir, 'test-project');
    await mkdir(join(projectDir, '.planning'), { recursive: true });
    await writeFile(join(projectDir, '.planning', 'STATE.md'), '# State\n## Current Position\nPhase: 1 of 3');
    await writeFile(join(projectDir, '.planning', 'config.json'), '{"mode":"interactive"}');

    const { app } = createApp(registryPath);
    server = createServer(app);

    await new Promise<void>((resolve) => {
      server.listen(0, () => {
        const addr = server.address() as { port: number };
        baseUrl = `http://localhost:${addr.port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    server.close();
    await rm(tempDir, { recursive: true, force: true });
  });

  it('GET /api/health returns ok', async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
  });

  it('POST /api/projects registers a project', async () => {
    const res = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: projectDir }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe('test-project');
  });

  it('GET /api/projects lists the registered project', async () => {
    const res = await fetch(`${baseUrl}/api/projects`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].id).toBe('test-project');
  });

  it('GET /api/projects/:id/files/config.json reads a file', async () => {
    const res = await fetch(`${baseUrl}/api/projects/test-project/files/config.json`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.content).toContain('interactive');
  });

  it('PUT /api/projects/:id/files/config.json writes a file', async () => {
    const res = await fetch(`${baseUrl}/api/projects/test-project/files/config.json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: '{"mode":"auto"}' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.saved).toBe(true);
  });

  it('rejects path traversal', async () => {
    const res = await fetch(`${baseUrl}/api/projects/test-project/files/..%2F..%2Fetc%2Fpasswd`);
    expect(res.status).toBe(400);
  });

  it('DELETE /api/projects/:id removes a project', async () => {
    const res = await fetch(`${baseUrl}/api/projects/test-project`, { method: 'DELETE' });
    expect(res.status).toBe(204);
  });
});
