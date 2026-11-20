import type { ProjectEntry } from './registry.js';
export type FileEventType = 'file:changed' | 'file:created' | 'file:deleted';
export interface FileEvent {
    type: FileEventType;
    project: string;
    path: string;
}
export type FileEventHandler = (event: FileEvent) => void;
export declare class ProjectWatcher {
    private watchers;
    private handler;
    onEvent(handler: FileEventHandler): void;
    watch(project: ProjectEntry): Promise<void>;
    unwatch(projectId: string): Promise<void>;
    close(): Promise<void>;
    private emit;
}
//# sourceMappingURL=watcher.d.ts.map