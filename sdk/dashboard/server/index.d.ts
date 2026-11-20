import { ProjectRegistry } from './registry.js';
import { SessionManager } from './session-manager.js';
export interface DashboardOptions {
    port: number;
    dev: boolean;
}
export declare function createApp(registryPath?: string, port?: number): {
    app: import("express-serve-static-core").Express;
    registry: ProjectRegistry;
    sessionManager: SessionManager;
};
export declare function startDashboard(options: DashboardOptions): Promise<void>;
//# sourceMappingURL=index.d.ts.map