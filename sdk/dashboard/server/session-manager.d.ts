export declare class SessionManager {
    private sessions;
    start(projectId: string, projectDir: string, wsPort: number): {
        pid: number;
        wsPort: number;
        startedAt: string;
    };
    stop(projectId: string): void;
    status(projectId: string): {
        active: boolean;
        pid?: number;
        wsPort?: number;
        startedAt?: string;
    };
    stopAll(): void;
}
//# sourceMappingURL=session-manager.d.ts.map