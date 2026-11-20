import chokidar from 'chokidar';
import { relative } from 'node:path';
export class ProjectWatcher {
    watchers = new Map();
    handler = null;
    onEvent(handler) {
        this.handler = handler;
    }
    async watch(project) {
        if (this.watchers.has(project.id))
            return;
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
    async unwatch(projectId) {
        const watcher = this.watchers.get(projectId);
        if (watcher) {
            await watcher.close();
            this.watchers.delete(projectId);
        }
    }
    async close() {
        for (const [id, watcher] of this.watchers) {
            await watcher.close();
            this.watchers.delete(id);
        }
    }
    emit(type, project, path) {
        this.handler?.({ type, project, path });
    }
}
//# sourceMappingURL=watcher.js.map