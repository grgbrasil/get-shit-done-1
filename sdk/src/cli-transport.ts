/**
 * CLI Transport — renders GSD events as structured log lines to a Writable stream.
 *
 * Implements TransportHandler with plain-text structured output (no colors, no TUI).
 * Each event type maps to a specific formatted line: `[HH:MM:SS] [TYPE] message`.
 */

import type { Writable } from 'node:stream';
import { GSDEventType, type GSDEvent, type TransportHandler } from './types.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Extract HH:MM:SS from an ISO-8601 timestamp. */
function formatTime(ts: string): string {
  try {
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return '??:??:??';
    return d.toISOString().slice(11, 19);
  } catch {
    return '??:??:??';
  }
}

/** Truncate a string to `max` characters, appending '…' if truncated. */
function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + '…';
}

/** Format a USD amount. */
function usd(n: number): string {
  return `$${n.toFixed(2)}`;
}

// ─── CLITransport ────────────────────────────────────────────────────────────

export class CLITransport implements TransportHandler {
  private readonly out: Writable;

  constructor(out?: Writable) {
    this.out = out ?? process.stdout;
  }

  /** Format and write a GSD event as a structured log line. Never throws. */
  onEvent(event: GSDEvent): void {
    try {
      const line = this.formatEvent(event);
      this.out.write(line + '\n');
    } catch {
      // TransportHandler contract: onEvent must never throw
    }
  }

  /** No-op — stdout doesn't need cleanup. */
  close(): void {
    // Nothing to clean up
  }

  // ─── Private formatting ────────────────────────────────────────────

  private formatEvent(event: GSDEvent): string {
    const time = formatTime(event.timestamp);

    switch (event.type) {
      case GSDEventType.SessionInit:
        return `[${time}] [INIT] Session started — model: ${event.model}, tools: ${event.tools.length}, cwd: ${event.cwd}`;

      case GSDEventType.SessionComplete:
        return `[${time}] [DONE] Session complete — cost: ${usd(event.totalCostUsd)}, turns: ${event.numTurns}, duration: ${(event.durationMs / 1000).toFixed(1)}s`;

      case GSDEventType.SessionError:
        return `[${time}] [ERROR] Session failed — subtype: ${event.errorSubtype}, errors: [${event.errors.join(', ')}]`;

      case GSDEventType.ToolCall:
        return `[${time}] [TOOL] ${event.toolName}(${truncate(JSON.stringify(event.input), 80)})`;

      case GSDEventType.PhaseStart:
        return `[${time}] [PHASE] Starting phase ${event.phaseNumber}: ${event.phaseName}`;

      case GSDEventType.PhaseComplete:
        return `[${time}] [PHASE] Phase ${event.phaseNumber} complete — success: ${event.success}, cost: ${usd(event.totalCostUsd)}`;

      case GSDEventType.PhaseStepStart:
        return `[${time}] [STEP] Starting step: ${event.step}`;

      case GSDEventType.PhaseStepComplete:
        return `[${time}] [STEP] Step ${event.step} complete — success: ${event.success}, ${event.durationMs}ms`;

      case GSDEventType.WaveStart:
        return `[${time}] [WAVE] Wave ${event.waveNumber} starting — ${event.planCount} plans`;

      case GSDEventType.WaveComplete:
        return `[${time}] [WAVE] Wave ${event.waveNumber} complete — ${event.successCount} success, ${event.failureCount} failed, ${event.durationMs}ms`;

      case GSDEventType.CostUpdate:
        return `[${time}] [COST] Session: ${usd(event.sessionCostUsd)}, Cumulative: ${usd(event.cumulativeCostUsd)}`;

      case GSDEventType.MilestoneStart:
        return `[${time}] [MILESTONE] Starting — ${event.phaseCount} phases`;

      case GSDEventType.MilestoneComplete:
        return `[${time}] [MILESTONE] Complete — success: ${event.success}, cost: ${usd(event.totalCostUsd)}`;

      case GSDEventType.AssistantText:
        return `[${time}] [AGENT] ${truncate(event.text, 200)}`;

      // Generic fallback for event types without specific formatting
      default:
        return `[${time}] [EVENT] ${event.type}`;
    }
  }
}
