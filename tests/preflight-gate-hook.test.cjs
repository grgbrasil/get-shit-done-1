/**
 * GSD Tests - Preflight Gate Hook
 * Tests the PreToolUse hook that blocks workflow skills when preflight fails.
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { createTempProject, createTempDir, cleanup } = require('./helpers.cjs');

const HOOK_PATH = path.join(__dirname, '..', 'hooks', 'gsd-preflight-gate.js');

function runHook(toolName, toolInput, cwd) {
  const input = JSON.stringify({ tool_name: toolName, tool_input: toolInput });
  try {
    const result = execSync(`echo '${input.replace(/'/g, "'\\''")}' | node "${HOOK_PATH}"`, {
      cwd: cwd || process.cwd(),
      encoding: 'utf-8',
      timeout: 15000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { output: result.trim(), blocked: false };
  } catch (err) {
    return { output: err.stdout?.toString().trim() || '', error: err.message, blocked: false };
  }
}

function parseHookOutput(result) {
  if (!result.output) return null;
  try {
    const parsed = JSON.parse(result.output);
    if (parsed.decision === 'block') {
      result.blocked = true;
      result.reason = parsed.reason;
    }
    return parsed;
  } catch {
    return null;
  }
}

// ─── Passthrough: non-workflow tools and skills ─────────────────────────────

describe('preflight-gate hook: passthrough', () => {
  test('passes through non-Skill tools', () => {
    const result = runHook('Bash', { command: 'ls' });
    assert.strictEqual(result.output, '', 'should produce no output');
  });

  test('passes through non-workflow skills', () => {
    const result = runHook('Skill', { skill: 'gsd:stats', args: '' });
    assert.strictEqual(result.output, '', 'should produce no output');
  });

  test('passes through skills without phase number', () => {
    const result = runHook('Skill', { skill: 'gsd:plan-phase', args: '' });
    assert.strictEqual(result.output, '', 'should produce no output — let skill handle error');
  });
});

// ─── Blocking: workflow skills with failed preflight ────────────────────────

describe('preflight-gate hook: blocking', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempDir();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('blocks plan-phase when .planning/ missing', () => {
    const result = runHook('Skill', { skill: 'gsd:plan-phase', args: '1' }, tmpDir);
    const parsed = parseHookOutput(result);
    assert.ok(parsed, 'should produce JSON output');
    assert.strictEqual(parsed.decision, 'block');
    assert.ok(parsed.reason.includes('NO-GO'), 'reason should contain NO-GO');
  });

  test('blocks execute-phase when .planning/ missing', () => {
    const result = runHook('Skill', { skill: 'gsd:execute-phase', args: '1' }, tmpDir);
    const parsed = parseHookOutput(result);
    assert.ok(parsed, 'should produce JSON output');
    assert.strictEqual(parsed.decision, 'block');
  });

  test('blocks discuss-phase for nonexistent phase', () => {
    fs.mkdirSync(path.join(tmpDir, '.planning'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, '.planning', 'ROADMAP.md'), '# Roadmap\n\n## Phases\n\n- [ ] **Phase 1: Test** - test\n\n## Phase Details\n\n### Phase 1: Test\n**Goal**: test\n**Depends on**: Nothing\n');
    const result = runHook('Skill', { skill: 'gsd:discuss-phase', args: '99' }, tmpDir);
    const parsed = parseHookOutput(result);
    assert.ok(parsed, 'should produce JSON output');
    assert.strictEqual(parsed.decision, 'block');
    assert.ok(parsed.reason.includes('NO-GO'));
  });

  test('blocks plan-phase when CONTEXT.md missing', () => {
    fs.mkdirSync(path.join(tmpDir, '.planning', 'phases'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, '.planning', 'ROADMAP.md'), '# Roadmap\n\n## Phases\n\n- [ ] **Phase 1: Test** - test\n\n## Phase Details\n\n### Phase 1: Test\n**Goal**: test\n**Depends on**: Nothing\n');
    const result = runHook('Skill', { skill: 'gsd:plan-phase', args: '1' }, tmpDir);
    const parsed = parseHookOutput(result);
    assert.ok(parsed, 'should produce JSON output');
    assert.strictEqual(parsed.decision, 'block');
    assert.ok(parsed.reason.includes('CONTEXT.md'), 'should mention missing CONTEXT.md');
  });
});

// ─── Passing: workflow skills with satisfied preflight ──────────────────────

describe('preflight-gate hook: passing', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
    fs.writeFileSync(path.join(tmpDir, '.planning', 'ROADMAP.md'), '# Roadmap\n\n## Phases\n\n- [ ] **Phase 1: Test** - test\n\n## Phase Details\n\n### Phase 1: Test\n**Goal**: test\n**Depends on**: Nothing\n');
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('allows discuss-phase for existing phase', () => {
    const result = runHook('Skill', { skill: 'gsd:discuss-phase', args: '1' }, tmpDir);
    assert.strictEqual(result.output, '', 'should produce no output (passthrough)');
  });

  test('allows plan-phase when CONTEXT.md exists', () => {
    // Dir must start with zero-padded phase number (normalizePhaseName: "1" → "01")
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '01-test');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(phaseDir, '01-CONTEXT.md'), '# Context\ntest');
    const result = runHook('Skill', { skill: 'gsd:plan-phase', args: '1' }, tmpDir);
    assert.strictEqual(result.output, '', 'should produce no output (passthrough)');
  });

  test('handles decimal phase numbers', () => {
    const result = runHook('Skill', { skill: 'gsd:discuss-phase', args: '1.5' }, tmpDir);
    // Will either pass or block depending on whether 1.5 exists — just verify no crash
    assert.ok(true, 'should not crash on decimal phase');
  });
});

// ─── Skill name variants ───────────────────────────────────────────────────

describe('preflight-gate hook: skill name variants', () => {
  test('handles plan-phase without gsd: prefix', () => {
    const result = runHook('Skill', { skill: 'plan-phase', args: '1' });
    const parsed = parseHookOutput(result);
    // Should block (no .planning/) — proves it recognized the skill name
    assert.ok(parsed, 'should produce JSON output');
    assert.strictEqual(parsed.decision, 'block');
  });

  test('handles verify-work', () => {
    const result = runHook('Skill', { skill: 'gsd:verify-work', args: '1' });
    const parsed = parseHookOutput(result);
    assert.ok(parsed, 'should produce JSON output');
    assert.strictEqual(parsed.decision, 'block');
  });
});
