import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

interface ActiveSession {
  pid: number;
  process: ChildProcess;
  projectId: string;
  wsPort: number;
  startedAt: string;
}

export class SessionManager {
  private sessions = new Map<string, ActiveSession>();

  start(projectId: string, projectDir: string, wsPort: number): { pid: number; wsPort: number; startedAt: string } {
    if (this.sessions.has(projectId)) {
      throw new Error(`Session already running for project "${projectId}"`);
    }

    const gsdSdkBin = resolve(__dirname, '..', '..', 'dist', 'cli.js');
    const child = spawn('node', [gsdSdkBin, 'auto', '--project-dir', projectDir, '--ws-port', String(wsPort)], {
      detached: true,
      stdio: 'ignore',
    });

    child.unref();

    const session: ActiveSession = {
      pid: child.pid!,
      process: child,
      projectId,
      wsPort,
      startedAt: new Date().toISOString(),
    };

    this.sessions.set(projectId, session);

    child.on('exit', () => {
      this.sessions.delete(projectId);
    });

    return { pid: session.pid, wsPort: session.wsPort, startedAt: session.startedAt };
  }

  stop(projectId: string): void {
    const session = this.sessions.get(projectId);
    if (!session) {
      throw new Error(`No active session for project "${projectId}"`);
    }

    try {
      process.kill(session.pid, 'SIGTERM');
    } catch {
      // Process may have already exited
    }
    this.sessions.delete(projectId);
  }

  status(projectId: string): { active: boolean; pid?: number; wsPort?: number; startedAt?: string } {
    const session = this.sessions.get(projectId);
    if (!session) return { active: false };
    return {
      active: true,
      pid: session.pid,
      wsPort: session.wsPort,
      startedAt: session.startedAt,
    };
  }

  stopAll(): void {
    for (const [id] of this.sessions) {
      try { this.stop(id); } catch { /* ignore */ }
    }
  }
}
