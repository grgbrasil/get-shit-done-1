/**
 * GSD Tools Bridge — shells out to `gsd-tools.cjs` for state management.
 *
 * All `.planning/` state operations go through gsd-tools.cjs rather than
 * reimplementing 12K+ lines of logic.
 */

import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';

// ─── Error type ──────────────────────────────────────────────────────────────

export class GSDToolsError extends Error {
  constructor(
    message: string,
    public readonly command: string,
    public readonly args: string[],
    public readonly exitCode: number | null,
    public readonly stderr: string,
  ) {
    super(message);
    this.name = 'GSDToolsError';
  }
}

// ─── GSDTools class ──────────────────────────────────────────────────────────

const DEFAULT_TIMEOUT_MS = 30_000;

export class GSDTools {
  private readonly projectDir: string;
  private readonly gsdToolsPath: string;
  private readonly timeoutMs: number;

  constructor(opts: {
    projectDir: string;
    gsdToolsPath?: string;
    timeoutMs?: number;
  }) {
    this.projectDir = opts.projectDir;
    this.gsdToolsPath =
      opts.gsdToolsPath ??
      join(homedir(), '.claude', 'get-shit-done', 'bin', 'gsd-tools.cjs');
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  // ─── Core exec ───────────────────────────────────────────────────────────

  /**
   * Execute a gsd-tools command and return parsed JSON output.
   * Appends `--raw` to get machine-readable JSON output.
   * Handles the `@file:` prefix pattern for large results.
   */
  async exec(command: string, args: string[] = []): Promise<unknown> {
    const fullArgs = [this.gsdToolsPath, command, ...args, '--raw'];

    return new Promise<unknown>((resolve, reject) => {
      const child = execFile(
        'node',
        fullArgs,
        {
          cwd: this.projectDir,
          maxBuffer: 10 * 1024 * 1024, // 10MB
          timeout: this.timeoutMs,
          env: { ...process.env },
        },
        async (error, stdout, stderr) => {
          const stderrStr = stderr?.toString() ?? '';

          if (error) {
            // Distinguish timeout from other errors
            if (error.killed || (error as NodeJS.ErrnoException).code === 'ETIMEDOUT') {
              reject(
                new GSDToolsError(
                  `gsd-tools timed out after ${this.timeoutMs}ms: ${command} ${args.join(' ')}`,
                  command,
                  args,
                  null,
                  stderrStr,
                ),
              );
              return;
            }

            reject(
              new GSDToolsError(
                `gsd-tools exited with code ${error.code ?? 'unknown'}: ${command} ${args.join(' ')}${stderrStr ? `\n${stderrStr}` : ''}`,
                command,
                args,
                typeof error.code === 'number' ? error.code : (error as { status?: number }).status ?? 1,
                stderrStr,
              ),
            );
            return;
          }

          const raw = stdout?.toString() ?? '';

          try {
            const parsed = await this.parseOutput(raw);
            resolve(parsed);
          } catch (parseErr) {
            reject(
              new GSDToolsError(
                `Failed to parse gsd-tools output for "${command}": ${parseErr instanceof Error ? parseErr.message : String(parseErr)}\nRaw output: ${raw.slice(0, 500)}`,
                command,
                args,
                0,
                stderrStr,
              ),
            );
          }
        },
      );

      // Safety net: kill if child doesn't respond to timeout signal
      child.on('error', (err) => {
        reject(
          new GSDToolsError(
            `Failed to execute gsd-tools: ${err.message}`,
            command,
            args,
            null,
            '',
          ),
        );
      });
    });
  }

  /**
   * Parse gsd-tools output, handling `@file:` prefix.
   */
  private async parseOutput(raw: string): Promise<unknown> {
    const trimmed = raw.trim();

    if (trimmed === '') {
      return null;
    }

    let jsonStr = trimmed;
    if (jsonStr.startsWith('@file:')) {
      const filePath = jsonStr.slice(6).trim();
      jsonStr = await readFile(filePath, 'utf-8');
    }

    return JSON.parse(jsonStr);
  }

  // ─── Typed convenience methods ─────────────────────────────────────────

  async stateLoad(): Promise<unknown> {
    return this.exec('state', ['load']);
  }

  async roadmapAnalyze(): Promise<unknown> {
    return this.exec('roadmap', ['analyze']);
  }

  async phaseComplete(phase: string): Promise<unknown> {
    return this.exec('phase', ['complete', phase]);
  }

  async commit(message: string, files?: string[]): Promise<unknown> {
    const args = [message];
    if (files?.length) {
      args.push('--files', ...files);
    }
    return this.exec('commit', args);
  }

  async verifySummary(path: string): Promise<unknown> {
    return this.exec('verify-summary', [path]);
  }

  async initExecutePhase(phase: string): Promise<unknown> {
    return this.exec('state', ['begin-phase', '--phase', phase]);
  }
}
