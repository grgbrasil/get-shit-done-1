import WebSocket from 'ws';
export class SdkBridge {
    dashboardWs;
    connections = new Map();
    reconnectTimers = new Map();
    constructor(dashboardWs) {
        this.dashboardWs = dashboardWs;
    }
    connect(projectId, wsPort) {
        if (this.connections.has(projectId))
            return;
        const url = `ws://localhost:${wsPort}`;
        const ws = new WebSocket(url);
        ws.on('open', () => {
            this.connections.set(projectId, ws);
            this.dashboardWs.broadcast({
                type: 'session:started',
                project: projectId,
                pid: 0,
            });
        });
        ws.on('message', (data) => {
            try {
                const event = JSON.parse(data.toString());
                this.dashboardWs.broadcast({
                    type: 'sdk:event',
                    project: projectId,
                    event,
                });
            }
            catch {
                // Ignore malformed messages
            }
        });
        ws.on('close', () => {
            this.connections.delete(projectId);
            this.dashboardWs.broadcast({
                type: 'session:stopped',
                project: projectId,
            });
        });
        ws.on('error', () => {
            this.connections.delete(projectId);
            // Retry after 3 seconds
            const timer = setTimeout(() => {
                this.reconnectTimers.delete(projectId);
                this.connect(projectId, wsPort);
            }, 3000);
            this.reconnectTimers.set(projectId, timer);
        });
    }
    disconnect(projectId) {
        const timer = this.reconnectTimers.get(projectId);
        if (timer) {
            clearTimeout(timer);
            this.reconnectTimers.delete(projectId);
        }
        const ws = this.connections.get(projectId);
        if (ws) {
            ws.close();
            this.connections.delete(projectId);
        }
    }
    disconnectAll() {
        for (const [id] of this.connections) {
            this.disconnect(id);
        }
    }
}
//# sourceMappingURL=sdk-bridge.js.map