import type { Server } from 'node:http';
export interface DashboardEvent {
    type: string;
    project: string;
    [key: string]: unknown;
}
export declare class DashboardWS {
    private wss;
    constructor(server: Server);
    broadcast(event: DashboardEvent): void;
    close(): void;
}
//# sourceMappingURL=ws.d.ts.map