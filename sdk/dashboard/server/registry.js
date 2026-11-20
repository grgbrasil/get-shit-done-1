import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, basename, resolve } from 'node:path';
import { existsSync } from 'node:fs';
export class ProjectRegistry {
    filePath;
    constructor(filePath) {
        this.filePath = filePath;
    }
    async list() {
        const data = await this.load();
        return data.projects;
    }
    async get(id) {
        const data = await this.load();
        return data.projects.find((p) => p.id === id);
    }
    async add(projectPath) {
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
        const entry = { id, name: basename(absPath), path: absPath };
        data.projects.push(entry);
        await this.save(data);
        return entry;
    }
    async remove(id) {
        const data = await this.load();
        data.projects = data.projects.filter((p) => p.id !== id);
        await this.save(data);
    }
    async load() {
        try {
            const raw = await readFile(this.filePath, 'utf-8');
            return JSON.parse(raw);
        }
        catch {
            return { projects: [] };
        }
    }
    async save(data) {
        await mkdir(dirname(this.filePath), { recursive: true });
        await writeFile(this.filePath, JSON.stringify(data, null, 2), 'utf-8');
    }
}
function slugify(name) {
    return name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');
}
//# sourceMappingURL=registry.js.map