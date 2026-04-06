import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'node:http';

export interface DashboardEvent {
  type: string;
  project: string;
  [key: string]: unknown;
}

export class DashboardWS {
  private wss: WebSocketServer;

  constructor(server: Server) {
    this.wss = new WebSocketServer({ server, path: '/ws' });
  }

  broadcast(event: DashboardEvent): void {
    const payload = JSON.stringify(event);
    for (const client of this.wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(payload);
        } catch {
          // Ignore individual client errors
        }
      }
    }
  }

  close(): void {
    for (const client of this.wss.clients) {
      try { client.terminate(); } catch { /* ignore */ }
    }
    this.wss.close();
  }
}
