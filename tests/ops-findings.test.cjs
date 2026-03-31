/**
 * OPS Findings CRUD — Unit tests
 *
 * Covers findings data layer: readFindings, writeFindings, nextFindingId,
 * parseFindingRange, parseFindingArgs, and cmdOpsFindings dispatcher.
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const { runGsdTools, createTempProject, cleanup } = require('./helpers.cjs');
const fs = require('fs');
const path = require('path');

// ─── Helpers ────────────────────────────────────────────────────────────────

function seedArea(tmpDir, slug) {
  const registryDir = path.join(tmpDir, '.planning', 'ops');
  fs.mkdirSync(registryDir, { recursive: true });
  const registry = {
    areas: [{ slug, name: slug.charAt(0).toUpperCase() + slug.slice(1), source: 'manual', created_at: new Date().toISOString() }]
  };
  fs.writeFileSync(path.join(registryDir, 'registry.json'), JSON.stringify(registry, null, 2));
  const aDir = path.join(registryDir, slug);
  fs.mkdirSync(aDir, { recursive: true });
  return aDir;
}

function readFindingsFile(tmpDir, slug) {
  const p = path.join(tmpDir, '.planning', 'ops', slug, 'findings.json');
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

function writeFindingsFile(tmpDir, slug, data) {
  const dir = path.join(tmpDir, '.planning', 'ops', slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'findings.json'), JSON.stringify(data, null, 2));
}

// ─── findings list ──────────────────────────────────────────────────────────

describe('ops findings list', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = createTempProject('ops-findings-'); });
  afterEach(() => { cleanup(tmpDir); });

  test('returns empty findings list when no findings.json exists', () => {
    seedArea(tmpDir, 'prazos');
    const result = runGsdTools(['ops', 'findings', 'prazos', 'list', '--raw'], tmpDir);
    assert.ok(result.success, 'should succeed: ' + (result.error || ''));
    const parsed = JSON.parse(result.output);
    assert.strictEqual(parsed.area, 'prazos');
    assert.ok(Array.isArray(parsed.findings));
    assert.strictEqual(parsed.findings.length, 0);
  });

  test('returns all findings when no filter', () => {
    seedArea(tmpDir, 'prazos');
    writeFindingsFile(tmpDir, 'prazos', {
      domain: 'prazos',
      findings: [
        { id: 'PRAZOS-001', status: 'pending', title: 'A' },
        { id: 'PRAZOS-002', status: 'resolved', title: 'B' }
      ]
    });
    const result = runGsdTools(['ops', 'findings', 'prazos', 'list', '--raw'], tmpDir);
    assert.ok(result.success, 'should succeed: ' + (result.error || ''));
    const parsed = JSON.parse(result.output);
    assert.strictEqual(parsed.findings.length, 2);
  });

  test('filters findings by --status pending', () => {
    seedArea(tmpDir, 'prazos');
    writeFindingsFile(tmpDir, 'prazos', {
      domain: 'prazos',
      findings: [
        { id: 'PRAZOS-001', status: 'pending', title: 'A' },
        { id: 'PRAZOS-002', status: 'resolved', title: 'B' },
        { id: 'PRAZOS-003', status: 'pending', title: 'C' }
      ]
    });
    const result = runGsdTools(['ops', 'findings', 'prazos', 'list', '--status', 'pending', '--raw'], tmpDir);
    assert.ok(result.success, 'should succeed: ' + (result.error || ''));
    const parsed = JSON.parse(result.output);
    assert.strictEqual(parsed.findings.length, 2);
    assert.ok(parsed.findings.every(f => f.status === 'pending'));
  });
});

// ─── findings add ───────────────────────────────────────────────────────────

describe('ops findings add', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = createTempProject('ops-findings-'); });
  afterEach(() => { cleanup(tmpDir); });

  test('creates finding with auto-generated ID (SLUG-001)', () => {
    seedArea(tmpDir, 'prazos');
    const result = runGsdTools([
      'ops', 'findings', 'prazos', 'add',
      '--title', 'Missing deadline validation',
      '--severity', 'minor',
      '--category', 'visual',
      '--raw'
    ], tmpDir);
    assert.ok(result.success, 'should succeed: ' + (result.error || ''));
    const parsed = JSON.parse(result.output);
    assert.strictEqual(parsed.success, true);
    assert.strictEqual(parsed.finding.id, 'PRAZOS-001');
    assert.strictEqual(parsed.finding.status, 'pending');
    assert.strictEqual(parsed.finding.severity, 'minor');
    assert.strictEqual(parsed.finding.category, 'visual');
    assert.strictEqual(parsed.finding.title, 'Missing deadline validation');
    assert.ok(parsed.finding.created);
    assert.strictEqual(parsed.finding.resolved, null);

    // Verify persisted
    const data = readFindingsFile(tmpDir, 'prazos');
    assert.strictEqual(data.findings.length, 1);
    assert.strictEqual(data.findings[0].id, 'PRAZOS-001');
  });

  test('auto-increments IDs from max existing', () => {
    seedArea(tmpDir, 'prazos');
    writeFindingsFile(tmpDir, 'prazos', {
      domain: 'prazos',
      findings: [
        { id: 'PRAZOS-001', status: 'pending', title: 'First' },
        { id: 'PRAZOS-005', status: 'pending', title: 'Fifth' }
      ]
    });

    const result = runGsdTools([
      'ops', 'findings', 'prazos', 'add',
      '--title', 'Next finding',
      '--severity', 'major',
      '--category', 'logic',
      '--raw'
    ], tmpDir);
    assert.ok(result.success, 'should succeed: ' + (result.error || ''));
    const parsed = JSON.parse(result.output);
    assert.strictEqual(parsed.finding.id, 'PRAZOS-006');
  });
});

// ─── findings update ────────────────────────────────────────────────────────

describe('ops findings update', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject('ops-findings-');
    seedArea(tmpDir, 'prazos');
    writeFindingsFile(tmpDir, 'prazos', {
      domain: 'prazos',
      findings: [
        { id: 'PRAZOS-001', status: 'pending', title: 'A', resolved: null, resolved_by: null },
        { id: 'PRAZOS-002', status: 'pending', title: 'B', resolved: null, resolved_by: null },
        { id: 'PRAZOS-003', status: 'pending', title: 'C', resolved: null, resolved_by: null },
        { id: 'PRAZOS-004', status: 'resolved', title: 'D', resolved: '2026-01-01T00:00:00.000Z', resolved_by: 'manual' }
      ]
    });
  });

  afterEach(() => { cleanup(tmpDir); });

  test('updates single finding status to resolved', () => {
    const result = runGsdTools([
      'ops', 'findings', 'prazos', 'update', 'PRAZOS-001',
      '--status', 'resolved',
      '--resolved-by', 'agent',
      '--raw'
    ], tmpDir);
    assert.ok(result.success, 'should succeed: ' + (result.error || ''));
    const parsed = JSON.parse(result.output);
    assert.strictEqual(parsed.success, true);
    assert.strictEqual(parsed.updated.length, 1);
    assert.strictEqual(parsed.updated[0].id, 'PRAZOS-001');
    assert.strictEqual(parsed.updated[0].status, 'resolved');
    assert.ok(parsed.updated[0].resolved);
    assert.strictEqual(parsed.updated[0].resolved_by, 'agent');
  });

  test('updates a range of findings (PRAZOS-001..003)', () => {
    const result = runGsdTools([
      'ops', 'findings', 'prazos', 'update', 'PRAZOS-001..003',
      '--status', 'resolved',
      '--resolved-by', 'batch',
      '--raw'
    ], tmpDir);
    assert.ok(result.success, 'should succeed: ' + (result.error || ''));
    const parsed = JSON.parse(result.output);
    assert.strictEqual(parsed.updated.length, 3);
    const ids = parsed.updated.map(f => f.id).sort();
    assert.deepStrictEqual(ids, ['PRAZOS-001', 'PRAZOS-002', 'PRAZOS-003']);
    assert.ok(parsed.updated.every(f => f.status === 'resolved'));
  });

  test('updates all pending findings with --all-pending', () => {
    const result = runGsdTools([
      'ops', 'findings', 'prazos', 'update', '--all-pending',
      '--status', 'resolved',
      '--resolved-by', 'sweep',
      '--raw'
    ], tmpDir);
    assert.ok(result.success, 'should succeed: ' + (result.error || ''));
    const parsed = JSON.parse(result.output);
    // Should update PRAZOS-001, 002, 003 (pending), not 004 (already resolved)
    assert.strictEqual(parsed.updated.length, 3);

    // Verify persisted
    const data = readFindingsFile(tmpDir, 'prazos');
    const pending = data.findings.filter(f => f.status === 'pending');
    assert.strictEqual(pending.length, 0);
  });
});
