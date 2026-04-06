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
