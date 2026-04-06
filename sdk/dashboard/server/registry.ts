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
