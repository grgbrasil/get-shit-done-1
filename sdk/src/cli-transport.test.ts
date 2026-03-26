import { describe, it, expect } from 'vitest';
import { PassThrough } from 'node:stream';
import { CLITransport } from './cli-transport.js';
import { GSDEventType, type GSDEvent, type GSDEventBase } from './types.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeBase(overrides: Partial<GSDEventBase> = {}): Omit<GSDEventBase, 'type'> {
  return {
    timestamp: '2025-06-15T14:30:45.123Z',
    sessionId: 'test-session',
    ...overrides,
  };
}

function readOutput(stream: PassThrough): string {
  const chunks: Buffer[] = [];
  let chunk: Buffer | null;
  while ((chunk = stream.read() as Buffer | null) !== null) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf-8').trim();
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('CLITransport', () => {
  it('formats SessionInit event correctly', () => {
    const stream = new PassThrough();
    const transport = new CLITransport(stream);

    transport.onEvent({
      ...makeBase(),
      type: GSDEventType.SessionInit,
      model: 'claude-sonnet-4-20250514',
      tools: ['Read', 'Write', 'Bash'],
      cwd: '/home/project',
    } as GSDEvent);

    const output = readOutput(stream);
    expect(output).toBe(
      '[14:30:45] [INIT] Session started — model: claude-sonnet-4-20250514, tools: 3, cwd: /home/project',
    );
  });

  it('formats SessionComplete with cost and duration', () => {
    const stream = new PassThrough();
    const transport = new CLITransport(stream);

    transport.onEvent({
      ...makeBase(),
      type: GSDEventType.SessionComplete,
      success: true,
      totalCostUsd: 1.234,
      durationMs: 45600,
      numTurns: 12,
      result: 'done',
    } as GSDEvent);

    const output = readOutput(stream);
    expect(output).toBe(
      '[14:30:45] [DONE] Session complete — cost: $1.23, turns: 12, duration: 45.6s',
    );
  });

  it('formats SessionError with error details', () => {
    const stream = new PassThrough();
    const transport = new CLITransport(stream);

    transport.onEvent({
      ...makeBase(),
      type: GSDEventType.SessionError,
      success: false,
      totalCostUsd: 0.5,
      durationMs: 3000,
      numTurns: 2,
      errorSubtype: 'tool_error',
      errors: ['file not found', 'permission denied'],
    } as GSDEvent);

    const output = readOutput(stream);
    expect(output).toBe(
      '[14:30:45] [ERROR] Session failed — subtype: tool_error, errors: [file not found, permission denied]',
    );
  });

  it('formats PhaseStart and PhaseComplete events', () => {
    const stream = new PassThrough();
    const transport = new CLITransport(stream);

    transport.onEvent({
      ...makeBase(),
      type: GSDEventType.PhaseStart,
      phaseNumber: '01',
      phaseName: 'Authentication',
    } as GSDEvent);

    transport.onEvent({
      ...makeBase(),
      type: GSDEventType.PhaseComplete,
      phaseNumber: '01',
      phaseName: 'Authentication',
      success: true,
      totalCostUsd: 2.50,
      totalDurationMs: 60000,
      stepsCompleted: 5,
    } as GSDEvent);

    const output = readOutput(stream);
    const lines = output.split('\n');
    expect(lines[0]).toBe('[14:30:45] [PHASE] Starting phase 01: Authentication');
    expect(lines[1]).toBe('[14:30:45] [PHASE] Phase 01 complete — success: true, cost: $2.50');
  });

  it('formats ToolCall with truncated input', () => {
    const stream = new PassThrough();
    const transport = new CLITransport(stream);

    const longInput = { content: 'x'.repeat(200) };

    transport.onEvent({
      ...makeBase(),
      type: GSDEventType.ToolCall,
      toolName: 'Write',
      toolUseId: 'tool-123',
      input: longInput,
    } as GSDEvent);

    const output = readOutput(stream);
    expect(output).toMatch(/^\[14:30:45\] \[TOOL\] Write\(.+…\)$/);
    // The truncated input portion (inside parens) should be ≤80 chars
    const insideParens = output.match(/Write\((.+)\)/)![1]!;
    expect(insideParens.length).toBeLessThanOrEqual(80);
  });

  it('formats MilestoneStart and MilestoneComplete events', () => {
    const stream = new PassThrough();
    const transport = new CLITransport(stream);

    transport.onEvent({
      ...makeBase(),
      type: GSDEventType.MilestoneStart,
      phaseCount: 3,
      prompt: 'build the app',
    } as GSDEvent);

    transport.onEvent({
      ...makeBase(),
      type: GSDEventType.MilestoneComplete,
      success: true,
      totalCostUsd: 8.75,
      totalDurationMs: 300000,
      phasesCompleted: 3,
    } as GSDEvent);

    const output = readOutput(stream);
    const lines = output.split('\n');
    expect(lines[0]).toBe('[14:30:45] [MILESTONE] Starting — 3 phases');
    expect(lines[1]).toBe('[14:30:45] [MILESTONE] Complete — success: true, cost: $8.75');
  });

  it('close() is callable without error', () => {
    const stream = new PassThrough();
    const transport = new CLITransport(stream);
    expect(() => transport.close()).not.toThrow();
  });

  it('onEvent does not throw on unknown event type variant', () => {
    const stream = new PassThrough();
    const transport = new CLITransport(stream);

    // Use a known event type that hits the default/fallback branch
    transport.onEvent({
      ...makeBase(),
      type: GSDEventType.ToolProgress,
      toolName: 'Bash',
      toolUseId: 'tool-456',
      elapsedSeconds: 12,
    } as GSDEvent);

    const output = readOutput(stream);
    expect(output).toBe('[14:30:45] [EVENT] tool_progress');
  });

  it('formats AssistantText with truncation at 200 chars', () => {
    const stream = new PassThrough();
    const transport = new CLITransport(stream);

    const longText = 'A'.repeat(300);

    transport.onEvent({
      ...makeBase(),
      type: GSDEventType.AssistantText,
      text: longText,
    } as GSDEvent);

    const output = readOutput(stream);
    expect(output).toMatch(/^\[14:30:45\] \[AGENT\] A+…$/);
    // The text part after [AGENT] should be ≤200 chars
    const agentText = output.split('[AGENT] ')[1]!;
    expect(agentText.length).toBeLessThanOrEqual(200);
  });

  it('formats WaveStart and WaveComplete events', () => {
    const stream = new PassThrough();
    const transport = new CLITransport(stream);

    transport.onEvent({
      ...makeBase(),
      type: GSDEventType.WaveStart,
      phaseNumber: '01',
      waveNumber: 2,
      planCount: 4,
      planIds: ['plan-a', 'plan-b', 'plan-c', 'plan-d'],
    } as GSDEvent);

    transport.onEvent({
      ...makeBase(),
      type: GSDEventType.WaveComplete,
      phaseNumber: '01',
      waveNumber: 2,
      successCount: 3,
      failureCount: 1,
      durationMs: 25000,
    } as GSDEvent);

    const output = readOutput(stream);
    const lines = output.split('\n');
    expect(lines[0]).toBe('[14:30:45] [WAVE] Wave 2 starting — 4 plans');
    expect(lines[1]).toBe('[14:30:45] [WAVE] Wave 2 complete — 3 success, 1 failed, 25000ms');
  });
});
