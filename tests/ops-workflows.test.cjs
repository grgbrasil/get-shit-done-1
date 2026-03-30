/**
 * OPS Workflows — Unit tests for shared helpers and dispatcher routing
 *
 * Covers OPS-09 (appendHistory), D-04 (computeBlastRadius), D-12 (refreshTree),
 * D-01/D-02 (cmdOpsSummary), dispatcher routing for new subcommands.
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const { runGsdTools, createTempProject, cleanup } = require('./helpers.cjs');
const fs = require('fs');
const path = require('path');

// Direct require of ops module for unit testing helpers
const ops = require('../get-shit-done/bin/lib/ops.cjs');

// ─── appendHistory ─────────────────────────────────────────────────────────

describe('appendHistory', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject('ops-history-');
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('creates history.json in empty area dir', () => {
    // Ensure area dir exists
    const areaPath = path.join(tmpDir, '.planning', 'ops', 'test-area');
    fs.mkdirSync(areaPath, { recursive: true });

    ops.appendHistory(tmpDir, 'test-area', {
      op: 'investigate',
      summary: 'Checked auth flow',
      outcome: 'Found 3 endpoints'
    });

    const historyPath = path.join(areaPath, 'history.json');
    assert.ok(fs.existsSync(historyPath), 'history.json should exist');

    const history = JSON.parse(fs.readFileSync(historyPath, 'utf-8'));
    assert.strictEqual(history.length, 1);
    assert.strictEqual(history[0].op, 'investigate');
    assert.strictEqual(history[0].area, 'test-area');
    assert.strictEqual(history[0].summary, 'Checked auth flow');
    assert.strictEqual(history[0].outcome, 'Found 3 endpoints');
    assert.ok(history[0].timestamp, 'should have timestamp');
  });

  test('appends to existing history', () => {
    const areaPath = path.join(tmpDir, '.planning', 'ops', 'test-area');
    fs.mkdirSync(areaPath, { recursive: true });
    fs.writeFileSync(
      path.join(areaPath, 'history.json'),
      JSON.stringify([{ op: 'debug', timestamp: '2026-01-01T00:00:00Z', area: 'test-area', summary: 'Initial', outcome: 'OK' }]),
      'utf-8'
    );

    ops.appendHistory(tmpDir, 'test-area', {
      op: 'feature',
      summary: 'Added pagination',
      outcome: 'Success'
    });

    const history = JSON.parse(fs.readFileSync(path.join(areaPath, 'history.json'), 'utf-8'));
    assert.strictEqual(history.length, 2);
    assert.strictEqual(history[1].op, 'feature');
  });

  test('auto-generates timestamp in ISO format', () => {
    const areaPath = path.join(tmpDir, '.planning', 'ops', 'test-area');
    fs.mkdirSync(areaPath, { recursive: true });

    ops.appendHistory(tmpDir, 'test-area', {
      op: 'modify',
      summary: 'Test',
      outcome: 'Done'
    });

    const history = JSON.parse(fs.readFileSync(path.join(areaPath, 'history.json'), 'utf-8'));
    const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/;
    assert.ok(isoRegex.test(history[0].timestamp), `Timestamp "${history[0].timestamp}" should be ISO format`);
  });
});

// ─── computeBlastRadius ────────────────────────────────────────────────────

describe('computeBlastRadius', () => {
  test('small tree no cross-area -> needs_full_plan false', () => {
    const tree = {
      nodes: [
        { id: 'component:A', type: 'component', file_path: 'src/auth/A.js' },
        { id: 'component:B', type: 'component', file_path: 'src/auth/B.js' },
        { id: 'service:C', type: 'service', file_path: 'src/auth/C.js' }
      ],
      edges: [
        { from: 'component:A', to: 'component:B', type: 'imports' },
        { from: 'component:B', to: 'service:C', type: 'calls' }
      ]
    };

    const result = ops.computeBlastRadius(tree);
    assert.strictEqual(result.total_nodes, 3);
    assert.strictEqual(result.cross_area_edges, 0);
    assert.strictEqual(result.needs_full_plan, false);
  });

  test('cross-area edges -> needs_full_plan true', () => {
    const tree = {
      nodes: [
        { id: 'component:A', type: 'component', file_path: 'src/auth/A.js' },
        { id: 'component:B', type: 'component', file_path: 'src/users/B.js' },
        { id: 'service:C', type: 'service', file_path: 'src/auth/C.js' }
      ],
      edges: [
        { from: 'component:A', to: 'component:B', type: 'imports' }
      ]
    };

    const result = ops.computeBlastRadius(tree);
    assert.strictEqual(result.cross_area_edges, 1);
    assert.strictEqual(result.needs_full_plan, true);
  });

  test('exceeds threshold -> needs_full_plan true', () => {
    const tree = {
      nodes: [
        { id: 'a:1', type: 'component', file_path: 'src/auth/1.js' },
        { id: 'a:2', type: 'component', file_path: 'src/auth/2.js' },
        { id: 'a:3', type: 'component', file_path: 'src/auth/3.js' },
        { id: 'a:4', type: 'component', file_path: 'src/auth/4.js' },
        { id: 'a:5', type: 'component', file_path: 'src/auth/5.js' },
        { id: 'a:6', type: 'component', file_path: 'src/auth/6.js' }
      ],
      edges: []
    };

    const result = ops.computeBlastRadius(tree);
    assert.strictEqual(result.total_nodes, 6);
    assert.strictEqual(result.cross_area_edges, 0);
    assert.strictEqual(result.needs_full_plan, true);
  });
});

// ─── cmdOpsSummary ─────────────────────────────────────────────────────────

describe('cmdOpsSummary', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject('ops-summary-');
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('no registry -> empty summary', () => {
    const result = runGsdTools(['ops', 'summary'], tmpDir);
    assert.ok(result.success, 'ops summary should succeed: ' + (result.error || ''));

    const parsed = JSON.parse(result.output);
    assert.strictEqual(parsed.areas_count, 0);
    assert.deepStrictEqual(parsed.areas, []);
  });

  test('enriches with tree stats', () => {
    // Create registry
    const opsDir = path.join(tmpDir, '.planning', 'ops');
    fs.mkdirSync(opsDir, { recursive: true });
    fs.writeFileSync(path.join(opsDir, 'registry.json'), JSON.stringify({
      areas: [{
        slug: 'auth',
        name: 'auth',
        source: 'manual',
        detected_by: 'manual',
        confidence: 'high',
        created_at: '2026-01-01T00:00:00Z',
        last_scanned: '2026-01-01T00:00:00Z',
        components_count: 3
      }]
    }), 'utf-8');

    // Create tree.json for the area
    const authDir = path.join(opsDir, 'auth');
    fs.mkdirSync(authDir, { recursive: true });
    fs.writeFileSync(path.join(authDir, 'tree.json'), JSON.stringify({
      area: 'auth',
      generated_at: '2026-01-01T00:00:00Z',
      nodes: [
        { id: 'component:Login', type: 'component', file_path: 'src/auth/Login.vue' },
        { id: 'service:AuthService', type: 'service', file_path: 'src/auth/AuthService.js' },
        { id: 'endpoint:auth-api', type: 'endpoint', file_path: 'src/auth/api.js' }
      ],
      edges: [
        { from: 'component:Login', to: 'service:AuthService', type: 'calls' },
        { from: 'service:AuthService', to: 'endpoint:auth-api', type: 'calls' }
      ]
    }), 'utf-8');

    const result = runGsdTools(['ops', 'summary'], tmpDir);
    assert.ok(result.success, 'ops summary should succeed: ' + (result.error || ''));

    const parsed = JSON.parse(result.output);
    assert.strictEqual(parsed.areas_count, 1);
    assert.strictEqual(parsed.areas[0].slug, 'auth');
    assert.ok(parsed.areas[0].nodes_by_type, 'should have nodes_by_type');
    assert.strictEqual(parsed.areas[0].nodes_by_type.component, 1);
    assert.strictEqual(parsed.areas[0].nodes_by_type.service, 1);
    assert.strictEqual(parsed.areas[0].nodes_by_type.endpoint, 1);
    assert.strictEqual(parsed.areas[0].edges_count, 2);
    assert.ok(Array.isArray(parsed.areas[0].cross_refs), 'should have cross_refs array');
  });
});

// ─── Dispatcher routing ────────────────────────────────────────────────────

describe('dispatcher routing', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject('ops-dispatch-');
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('ops investigate routes correctly', () => {
    const result = runGsdTools(['ops', 'investigate', 'auth', 'check login flow'], tmpDir);
    // Stub returns error message but routing works (not "Unknown ops subcommand")
    assert.ok(
      !result.error?.includes('Unknown ops subcommand'),
      'Should route to investigate, not unknown: ' + (result.error || '')
    );
  });

  test('ops summary routes correctly', () => {
    const result = runGsdTools(['ops', 'summary'], tmpDir);
    assert.ok(result.success, 'ops summary should route and succeed: ' + (result.error || ''));
    const parsed = JSON.parse(result.output);
    assert.ok('areas_count' in parsed, 'should return areas_count in JSON output');
  });
});
