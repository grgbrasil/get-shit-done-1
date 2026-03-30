/**
 * Impact Analysis Tests
 *
 * Tests for gsd-tools fmap impact subcommand and normalizeSignature utility.
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const { runGsdTools, createTempProject, cleanup } = require('./helpers.cjs');
const fs = require('fs');
const path = require('path');

// Fixture entry shape (copied from fmap.test.cjs)
const FIXTURE_ENTRY = {
  kind: 'method',
  signature: 'async runPhase(phaseNumber: string): Promise<PhaseResult>',
  purpose: 'Orchestrates full phase lifecycle',
  callers: ['sdk/src/index.ts:142'],
  calls: ['sdk/src/context-engine.ts::ContextEngine::resolveContextFiles'],
  language: 'ts',
  exported: true,
  last_updated: '2026-03-29T14:00:00.000Z',
};

const FIXTURE_MAP = {
  'sdk/src/phase-runner.ts::PhaseRunner::runPhase': FIXTURE_ENTRY,
  'sdk/src/index.ts::GSD': {
    kind: 'class',
    signature: 'class GSD',
    purpose: 'Main SDK entry point',
    callers: [],
    calls: ['sdk/src/phase-runner.ts::PhaseRunner::runPhase'],
    language: 'ts',
    exported: true,
    last_updated: '2026-03-29T14:00:00.000Z',
  },
};

function seedMap(tmpDir, map) {
  const mapPath = path.join(tmpDir, '.planning', 'function-map.json');
  fs.writeFileSync(mapPath, JSON.stringify(map, null, 2), 'utf-8');
}

// ─── fmap impact ────────────────────────────────────────────────────────────

describe('fmap impact', () => {
  let tmpDir;
  beforeEach(() => { tmpDir = createTempProject('fmap-impact-'); });
  afterEach(() => { cleanup(tmpDir); });

  test('Test 1: returns impact data for a mapped function', () => {
    seedMap(tmpDir, FIXTURE_MAP);
    const res = runGsdTools(['fmap', 'impact', 'sdk/src/phase-runner.ts::PhaseRunner::runPhase'], tmpDir);
    assert.strictEqual(res.success, true);
    const parsed = JSON.parse(res.output);
    assert.strictEqual(parsed.key, 'sdk/src/phase-runner.ts::PhaseRunner::runPhase');
    assert.strictEqual(parsed.found, true);
    assert.strictEqual(parsed.signature, FIXTURE_ENTRY.signature);
    assert.strictEqual(parsed.purpose, FIXTURE_ENTRY.purpose);
    assert.deepStrictEqual(parsed.callers, ['sdk/src/index.ts:142']);
    assert.strictEqual(parsed.caller_count, 1);
    assert.deepStrictEqual(parsed.calls, FIXTURE_ENTRY.calls);
  });

  test('Test 2: returns found:false for unmapped function', () => {
    seedMap(tmpDir, FIXTURE_MAP);
    const res = runGsdTools(['fmap', 'impact', 'nonexistent::fn'], tmpDir);
    assert.strictEqual(res.success, true);
    const parsed = JSON.parse(res.output);
    assert.strictEqual(parsed.key, 'nonexistent::fn');
    assert.strictEqual(parsed.found, false);
    assert.deepStrictEqual(parsed.callers, []);
    assert.strictEqual(parsed.caller_count, 0);
  });

  test('Test 3: errors when no key argument provided', () => {
    const res = runGsdTools(['fmap', 'impact'], tmpDir);
    assert.strictEqual(res.success, false);
    assert.ok(res.error.includes('fmap impact requires a key argument'), `Expected key error in: ${res.error}`);
  });

  test('Test 4: normalizes key with leading ./', () => {
    seedMap(tmpDir, FIXTURE_MAP);
    const res = runGsdTools(['fmap', 'impact', './sdk/src/phase-runner.ts::PhaseRunner::runPhase'], tmpDir);
    assert.strictEqual(res.success, true);
    const parsed = JSON.parse(res.output);
    assert.strictEqual(parsed.found, true);
    assert.strictEqual(parsed.key, 'sdk/src/phase-runner.ts::PhaseRunner::runPhase');
  });
});

// ─── normalizeSignature ─────────────────────────────────────────────────────

describe('normalizeSignature', () => {
  // Import directly from fmap.cjs
  const { normalizeSignature } = require('../get-shit-done/bin/lib/fmap.cjs');

  test('Test 5: collapses whitespace and strips trailing semicolon', () => {
    const result = normalizeSignature('async  foo( x: string ) : void ;');
    assert.strictEqual(result, 'async foo(x: string): void');
  });

  test('Test 6: returns already-clean signature unchanged', () => {
    const result = normalizeSignature('foo(x: number): string');
    assert.strictEqual(result, 'foo(x: number): string');
  });

  test('Test 7: collapses newlines in multi-line signatures', () => {
    const result = normalizeSignature('function bar(\n  a: string,\n  b: number\n): void');
    assert.strictEqual(result, 'function bar(a: string, b: number): void');
  });
});
