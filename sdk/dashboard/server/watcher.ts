import chokidar, { type FSWatcher } from 'chokidar';
import { relative } from 'node:path';
import type { ProjectEntry } from './registry.js';

export type FileEventType = 'file:changed' | 'file:created' | 'file:deleted';

export interface FileEvent {
  type: FileEventType;
  project: string;
  path: string;
  [key: string]: unknown;
}

export type FileEventHandler = (event: FileEvent) => void;

export class ProjectWatcher {
  private watchers = new Map<string, FSWatcher>();
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
