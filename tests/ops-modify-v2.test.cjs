/**
 * OPS Modify v2 — Unit tests for findings-based mode
 *
 * Covers:
 * 1. Modify with finding ID loads specific finding context (findings_mode: true)
 * 2. Modify with range loads multiple findings
 * 3. Modify with --all-pending loads all pending findings
 * 4. Modify without finding ID falls back to description-based (findings_mode: false)
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const { runGsdTools, createTempProject, cleanup } = require('./helpers.cjs');
const fs = require('fs');
const path = require('path');

// ─── Helpers ────────────────────────────────────────────────────────────────

function seedAreaWithFindings(tmpDir, slug) {
  const opsDir = path.join(tmpDir, '.planning', 'ops');
  fs.mkdirSync(opsDir, { recursive: true });

  // Registry
  fs.writeFileSync(path.join(opsDir, 'registry.json'), JSON.stringify({
    areas: [{
      slug,
      name: slug,
      source: 'manual',
      detected_by: 'user',
      confidence: 'high',
      components_count: 1,
      last_scanned: '2026-01-01T00:00:00Z'
    }]
  }), 'utf-8');

  // Area dir with tree (1 node)
  const areaPath = path.join(opsDir, slug);
  fs.mkdirSync(areaPath, { recursive: true });

  fs.writeFileSync(path.join(areaPath, 'tree.json'), JSON.stringify({
    area: slug,
    generated_at: '2026-01-01T00:00:00Z',
    nodes: [
      { id: 'node-1', type: 'component', file_path: 'src/prazos/PrazoList.vue' }
    ],
    edges: []
  }), 'utf-8');

  // Findings (3 pending)
  fs.writeFileSync(path.join(areaPath, 'findings.json'), JSON.stringify({
    domain: slug,
    findings: [
      {
        id: 'PRAZOS-001',
        type: 'behavioral',
        severity: 'high',
        title: 'Prazo computation off by one',
        description: 'The deadline calculation is off by one day',
        file_path: 'src/prazos/PrazoList.vue',
        status: 'pending',
        source: 'investigate',
        created_at: '2026-01-01T00:00:00Z'
      },
      {
        id: 'PRAZOS-002',
        type: 'structural',
        severity: 'medium',
        title: 'Missing validation on save',
        description: 'No input validation before saving prazo',
        file_path: 'src/prazos/PrazoForm.vue',
        status: 'pending',
        source: 'investigate',
        created_at: '2026-01-01T00:00:00Z'
      },
      {
        id: 'PRAZOS-003',
        type: 'structural',
        severity: 'low',
        title: 'Duplicate import in helper',
        description: 'Same module imported twice in helper file',
        file_path: 'src/prazos/helpers.js',
        status: 'pending',
        source: 'investigate',
        created_at: '2026-01-01T00:00:00Z'
      }
    ]
  }), 'utf-8');
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('cmdOpsModify v2 — findings mode', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject('ops-mod-v2-');
    seedAreaWithFindings(tmpDir, 'prazos');
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  // Test 1: Single finding ID
  test('modify with finding ID loads specific finding context', () => {
    const result = runGsdTools(
      ['ops', 'modify', 'prazos', 'PRAZOS-001', '--raw'],
      tmpDir
    );

    assert.ok(result.success, 'command should succeed: ' + (result.error || ''));
    const parsed = JSON.parse(result.output);

    assert.strictEqual(parsed.success, true);
    assert.strictEqual(parsed.area, 'prazos');
    assert.strictEqual(parsed.findings_mode, true);
    assert.strictEqual(parsed.target_findings.length, 1);
    assert.strictEqual(parsed.target_findings[0].id, 'PRAZOS-001');
    assert.ok(Array.isArray(parsed.files_affected), 'files_affected should be an array');
    assert.ok(parsed.findings_by_file, 'findings_by_file should exist');
    assert.ok(parsed.blast_radius, 'blast_radius should exist');
    assert.ok(parsed.dispatch, 'dispatch should exist');
    assert.ok(parsed.tools, 'tools should exist');
    assert.ok(parsed.tools.mark_fixed, 'tools.mark_fixed should exist');
  });

  // Test 2: Range
  test('modify with range loads multiple findings', () => {
    const result = runGsdTools(
      ['ops', 'modify', 'prazos', 'PRAZOS-001..003', '--raw'],
      tmpDir
    );

    assert.ok(result.success, 'command should succeed: ' + (result.error || ''));
    const parsed = JSON.parse(result.output);

    assert.strictEqual(parsed.success, true);
    assert.strictEqual(parsed.findings_mode, true);
    assert.strictEqual(parsed.target_findings.length, 3);
    assert.ok(parsed.files_affected.length > 0, 'should have files_affected');
    assert.ok(parsed.findings_by_file, 'findings_by_file should exist');
  });

  // Test 3: --all-pending
  test('modify with --all-pending loads all pending findings', () => {
    const result = runGsdTools(
      ['ops', 'modify', 'prazos', '--all-pending', '--raw'],
      tmpDir
    );

    assert.ok(result.success, 'command should succeed: ' + (result.error || ''));
    const parsed = JSON.parse(result.output);

    assert.strictEqual(parsed.success, true);
    assert.strictEqual(parsed.findings_mode, true);
    assert.strictEqual(parsed.target_findings.length, 3);
    assert.ok(parsed.files_affected.length > 0, 'should have files_affected');
  });

  // Test 4: Legacy description-based mode
  test('modify without finding ID falls back to description-based', () => {
    const result = runGsdTools(
      ['ops', 'modify', 'prazos', 'Refactor the save logic', '--raw'],
      tmpDir
    );

    assert.ok(result.success, 'command should succeed: ' + (result.error || ''));
    const parsed = JSON.parse(result.output);

    assert.strictEqual(parsed.success, true);
    assert.strictEqual(parsed.area, 'prazos');
    assert.strictEqual(parsed.findings_mode, false);
    assert.ok(Array.isArray(parsed.affected_nodes), 'affected_nodes should exist');
    assert.ok(typeof parsed.affected_count === 'number', 'affected_count should be a number');
    assert.ok(parsed.blast_radius, 'blast_radius should exist');
    assert.ok(parsed.dispatch, 'dispatch should exist');
  });

  // Test 5: Dispatch logic — quick for <=5, plan for >5
  test('dispatch is quick when findings count <= 5', () => {
    const result = runGsdTools(
      ['ops', 'modify', 'prazos', 'PRAZOS-001', '--raw'],
      tmpDir
    );

    const parsed = JSON.parse(result.output);
    assert.strictEqual(parsed.dispatch, 'quick');
  });
});
