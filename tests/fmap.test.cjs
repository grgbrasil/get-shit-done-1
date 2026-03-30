/**
 * Function Map (fmap) CRUD Tests
 *
 * Tests for gsd-tools fmap get/update/stats/full-scan subcommands
 * and key normalization behavior.
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const { execSync } = require('child_process');
const { runGsdTools, createTempProject, createTempGitProject, cleanup } = require('./helpers.cjs');
const fs = require('fs');
const path = require('path');

// Fixture entry shape per D-08
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

// ─── fmap get ────────────────────────────────────────────────────────────────

describe('fmap get', () => {
  let tmpDir;
  beforeEach(() => { tmpDir = createTempProject('fmap-get-'); });
  afterEach(() => { cleanup(tmpDir); });

  test('returns {} on empty map (no file)', () => {
    const res = runGsdTools(['fmap', 'get'], tmpDir);
    assert.strictEqual(res.success, true);
    assert.deepStrictEqual(JSON.parse(res.output), {});
  });

  test('returns full map when no key is given on populated map', () => {
    seedMap(tmpDir, FIXTURE_MAP);
    const res = runGsdTools(['fmap', 'get'], tmpDir);
    assert.strictEqual(res.success, true);
    const parsed = JSON.parse(res.output);
    assert.strictEqual(Object.keys(parsed).length, 2);
    assert.ok(parsed['sdk/src/phase-runner.ts::PhaseRunner::runPhase']);
  });

  test('returns entry for a specific key', () => {
    seedMap(tmpDir, FIXTURE_MAP);
    const res = runGsdTools(['fmap', 'get', 'sdk/src/index.ts::GSD'], tmpDir);
    assert.strictEqual(res.success, true);
    const parsed = JSON.parse(res.output);
    assert.strictEqual(parsed.kind, 'class');
    assert.strictEqual(parsed.purpose, 'Main SDK entry point');
  });

  test('returns error for nonexistent key', () => {
    seedMap(tmpDir, FIXTURE_MAP);
    const res = runGsdTools(['fmap', 'get', 'nonexistent::key'], tmpDir);
    assert.strictEqual(res.success, false);
    assert.ok(res.error.includes('key not found'), `Expected "key not found" in: ${res.error}`);
  });
});

// ─── fmap update ─────────────────────────────────────────────────────────────

describe('fmap update', () => {
  let tmpDir;
  beforeEach(() => { tmpDir = createTempProject('fmap-update-'); });
  afterEach(() => { cleanup(tmpDir); });

  test('merges new entries into existing map without losing others', () => {
    seedMap(tmpDir, FIXTURE_MAP);
    const patch = {
      'lib/utils.ts::helperFn': {
        kind: 'function',
        signature: 'function helperFn(): void',
        purpose: 'A helper',
        callers: [],
        calls: [],
        language: 'ts',
        exported: true,
        last_updated: '2026-03-29T15:00:00.000Z',
      },
    };
    const res = runGsdTools(['fmap', 'update', '--data', JSON.stringify(patch)], tmpDir);
    assert.strictEqual(res.success, true);
    const result = JSON.parse(res.output);
    assert.strictEqual(result.updated, 1);
    assert.strictEqual(result.total, 3);

    // Verify existing entries are preserved
    const mapOnDisk = JSON.parse(
      fs.readFileSync(path.join(tmpDir, '.planning', 'function-map.json'), 'utf-8')
    );
    assert.ok(mapOnDisk['sdk/src/phase-runner.ts::PhaseRunner::runPhase']);
    assert.ok(mapOnDisk['lib/utils.ts::helperFn']);
  });

  test('replace-file removes old entries for that file before merging', () => {
    seedMap(tmpDir, FIXTURE_MAP);
    const patch = {
      'sdk/src/index.ts::GSD::newMethod': {
        kind: 'method',
        signature: 'newMethod(): void',
        purpose: 'Replaced method',
        callers: [],
        calls: [],
        language: 'ts',
        exported: true,
        last_updated: '2026-03-29T16:00:00.000Z',
      },
    };
    const res = runGsdTools(
      ['fmap', 'update', '--replace-file', 'sdk/src/index.ts', '--data', JSON.stringify(patch)],
      tmpDir
    );
    assert.strictEqual(res.success, true);

    const mapOnDisk = JSON.parse(
      fs.readFileSync(path.join(tmpDir, '.planning', 'function-map.json'), 'utf-8')
    );
    // Old sdk/src/index.ts::GSD entry should be gone
    assert.strictEqual(mapOnDisk['sdk/src/index.ts::GSD'], undefined);
    // New entry should exist
    assert.ok(mapOnDisk['sdk/src/index.ts::GSD::newMethod']);
    // Entries from other files should be preserved
    assert.ok(mapOnDisk['sdk/src/phase-runner.ts::PhaseRunner::runPhase']);
  });
});

// ─── fmap stats ──────────────────────────────────────────────────────────────

describe('fmap stats', () => {
  let tmpDir;
  beforeEach(() => { tmpDir = createTempProject('fmap-stats-'); });
  afterEach(() => { cleanup(tmpDir); });

  test('returns total, by_kind, and path', () => {
    seedMap(tmpDir, FIXTURE_MAP);
    const res = runGsdTools(['fmap', 'stats'], tmpDir);
    assert.strictEqual(res.success, true);
    const parsed = JSON.parse(res.output);
    assert.strictEqual(parsed.total, 2);
    assert.deepStrictEqual(parsed.by_kind, { method: 1, class: 1 });
    assert.ok(parsed.path.includes('function-map.json'), `Expected path to contain function-map.json: ${parsed.path}`);
  });
});

// ─── fmap full-scan ──────────────────────────────────────────────────────────

describe('fmap full-scan', () => {
  let tmpDir;
  beforeEach(() => { tmpDir = createTempProject('fmap-fullscan-'); });
  afterEach(() => { cleanup(tmpDir); });

  test('returns action message', () => {
    const res = runGsdTools(['fmap', 'full-scan'], tmpDir);
    assert.strictEqual(res.success, true);
    const parsed = JSON.parse(res.output);
    assert.strictEqual(parsed.action, 'full-scan');
    assert.ok(parsed.message, 'Expected a message in full-scan response');
  });
});

// ─── Key normalization ───────────────────────────────────────────────────────

describe('key normalization', () => {
  let tmpDir;
  beforeEach(() => { tmpDir = createTempProject('fmap-norm-'); });
  afterEach(() => { cleanup(tmpDir); });

  test('strips leading ./ and normalizes to POSIX slashes on get', () => {
    const map = {
      'src/utils.ts::helper': {
        kind: 'function',
        signature: 'function helper(): void',
        purpose: 'test',
        callers: [],
        calls: [],
        language: 'ts',
        exported: true,
        last_updated: '2026-03-29T14:00:00.000Z',
      },
    };
    seedMap(tmpDir, map);

    // Query with ./ prefix should still find the entry
    const res = runGsdTools(['fmap', 'get', './src/utils.ts::helper'], tmpDir);
    assert.strictEqual(res.success, true);
    const parsed = JSON.parse(res.output);
    assert.strictEqual(parsed.kind, 'function');
  });

  test('normalizes keys in update data', () => {
    const patch = {
      './lib/foo.ts::bar': {
        kind: 'function',
        signature: 'function bar(): void',
        purpose: 'test normalize',
        callers: [],
        calls: [],
        language: 'ts',
        exported: true,
        last_updated: '2026-03-29T14:00:00.000Z',
      },
    };
    const res = runGsdTools(['fmap', 'update', '--data', JSON.stringify(patch)], tmpDir);
    assert.strictEqual(res.success, true);

    const mapOnDisk = JSON.parse(
      fs.readFileSync(path.join(tmpDir, '.planning', 'function-map.json'), 'utf-8')
    );
    // Key should be stored without ./
    assert.ok(mapOnDisk['lib/foo.ts::bar'], 'Expected normalized key lib/foo.ts::bar');
    assert.strictEqual(mapOnDisk['./lib/foo.ts::bar'], undefined, 'Should not store key with ./ prefix');
  });
});

// ─── fmap changed-files ─────────────────────────────────────────────────────

describe('fmap changed-files', () => {
  let tmpDir;
  beforeEach(() => { tmpDir = createTempGitProject('fmap-changed-'); });
  afterEach(() => { cleanup(tmpDir); });

  test('detects staged code files as changed', () => {
    fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'src', 'hello.ts'), 'export function hello() {}');
    execSync('git add src/hello.ts', { cwd: tmpDir, stdio: 'pipe' });

    const res = runGsdTools(['fmap', 'changed-files'], tmpDir);
    assert.strictEqual(res.success, true);
    const parsed = JSON.parse(res.output);
    assert.ok(parsed.files.includes('src/hello.ts'), `Expected src/hello.ts in files: ${JSON.stringify(parsed.files)}`);
    assert.ok(parsed.count >= 1, 'Expected at least 1 changed file');
  });

  test('filters out non-code files (e.g., .md)', () => {
    fs.writeFileSync(path.join(tmpDir, 'notes.md'), '# Notes');
    execSync('git add notes.md', { cwd: tmpDir, stdio: 'pipe' });

    const res = runGsdTools(['fmap', 'changed-files'], tmpDir);
    assert.strictEqual(res.success, true);
    const parsed = JSON.parse(res.output);
    assert.ok(!parsed.files.includes('notes.md'), `notes.md should be filtered out: ${JSON.stringify(parsed.files)}`);
  });

  test('returns count 0 when no files changed', () => {
    const res = runGsdTools(['fmap', 'changed-files'], tmpDir);
    assert.strictEqual(res.success, true);
    const parsed = JSON.parse(res.output);
    assert.strictEqual(parsed.count, 0);
    assert.deepStrictEqual(parsed.files, []);
  });
});
