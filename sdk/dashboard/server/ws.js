import { WebSocketServer, WebSocket } from 'ws';
export class DashboardWS {
    wss;
    constructor(server) {
        this.wss = new WebSocketServer({ server, path: '/ws' });
    }
    broadcast(event) {
        const payload = JSON.stringify(event);
        for (const client of this.wss.clients) {
            if (client.readyState === WebSocket.OPEN) {
                try {
                    client.send(payload);
                }
                catch {
                    // Ignore individual client errors
                }
            }
        }
    }
    close() {
        for (const client of this.wss.clients) {
            try {
                client.terminate();
            }
            catch { /* ignore */ }
        }
        this.wss.close();
    }
}
//# sourceMappingURL=ws.js.map