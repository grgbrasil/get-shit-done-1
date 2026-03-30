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

// ─── cmdOpsInvestigate ────────────────────────────────────────────────────

describe('cmdOpsInvestigate', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject('ops-investigate-');
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('errors on missing area', () => {
    const result = runGsdTools(['ops', 'investigate'], tmpDir);
    assert.strictEqual(result.success, false);
    assert.ok(result.error.includes('Usage:'), 'should show usage: ' + result.error);
  });

  test('errors on area not in registry', () => {
    // Create empty registry
    const opsDir = path.join(tmpDir, '.planning', 'ops');
    fs.mkdirSync(opsDir, { recursive: true });
    fs.writeFileSync(path.join(opsDir, 'registry.json'), JSON.stringify({ areas: [] }), 'utf-8');

    const result = runGsdTools(['ops', 'investigate', 'nonexistent', 'test'], tmpDir);
    assert.strictEqual(result.success, false);
    assert.ok(result.error.includes('Area not found'), 'should say area not found: ' + result.error);
  });

  test('errors on missing tree.json', () => {
    // Create registry with area but no tree.json
    const opsDir = path.join(tmpDir, '.planning', 'ops');
    fs.mkdirSync(opsDir, { recursive: true });
    fs.writeFileSync(path.join(opsDir, 'registry.json'), JSON.stringify({
      areas: [{ slug: 'auth', name: 'auth', source: 'manual', detected_by: 'manual', confidence: 'high', created_at: '2026-01-01T00:00:00Z', last_scanned: null, components_count: 0 }]
    }), 'utf-8');

    const result = runGsdTools(['ops', 'investigate', 'auth', 'test problem'], tmpDir);
    assert.strictEqual(result.success, false);
    assert.ok(result.error.includes('No tree.json'), 'should mention missing tree.json: ' + result.error);
  });

  test('outputs context with full tree', () => {
    // Create registry + tree.json
    const opsDir = path.join(tmpDir, '.planning', 'ops');
    const authDir = path.join(opsDir, 'auth');
    fs.mkdirSync(authDir, { recursive: true });
    fs.writeFileSync(path.join(opsDir, 'registry.json'), JSON.stringify({
      areas: [{ slug: 'auth', name: 'auth', source: 'manual', detected_by: 'manual', confidence: 'high', created_at: '2026-01-01T00:00:00Z', last_scanned: '2026-01-01T00:00:00Z', components_count: 2 }]
    }), 'utf-8');
    fs.writeFileSync(path.join(authDir, 'tree.json'), JSON.stringify({
      area: 'auth',
      generated_at: '2026-01-01T00:00:00Z',
      nodes: [
        { id: 'component:Login', type: 'component', file_path: 'src/auth/Login.vue', name: 'Login', metadata: {} },
        { id: 'service:AuthSvc', type: 'service', file_path: 'src/auth/AuthSvc.js', name: 'AuthSvc', metadata: {} }
      ],
      edges: [{ from: 'component:Login', to: 'service:AuthSvc', type: 'calls' }]
    }), 'utf-8');

    const result = runGsdTools(['ops', 'investigate', 'auth', 'login broken'], tmpDir);
    assert.ok(result.success, 'should succeed: ' + (result.error || ''));

    const parsed = JSON.parse(result.output);
    assert.strictEqual(parsed.success, true);
    assert.strictEqual(parsed.area, 'auth');
    assert.ok(parsed.context, 'should have context');
    assert.ok(parsed.context.tree, 'should have full tree in context');
    assert.strictEqual(parsed.context.nodes, 2);
    assert.strictEqual(parsed.context.edges, 1);
    assert.ok(parsed.tree_path, 'should have tree_path');
    assert.ok(parsed.diagnosis_path, 'should have diagnosis_path');
  });

  test('appends history entry', () => {
    // Create registry + tree.json
    const opsDir = path.join(tmpDir, '.planning', 'ops');
    const authDir = path.join(opsDir, 'auth');
    fs.mkdirSync(authDir, { recursive: true });
    fs.writeFileSync(path.join(opsDir, 'registry.json'), JSON.stringify({
      areas: [{ slug: 'auth', name: 'auth', source: 'manual', detected_by: 'manual', confidence: 'high', created_at: '2026-01-01T00:00:00Z', last_scanned: '2026-01-01T00:00:00Z', components_count: 1 }]
    }), 'utf-8');
    fs.writeFileSync(path.join(authDir, 'tree.json'), JSON.stringify({
      area: 'auth', generated_at: '2026-01-01T00:00:00Z',
      nodes: [{ id: 'component:A', type: 'component', file_path: 'src/auth/A.js', name: 'A', metadata: {} }],
      edges: []
    }), 'utf-8');

    runGsdTools(['ops', 'investigate', 'auth', 'test'], tmpDir);

    const historyPath = path.join(authDir, 'history.json');
    assert.ok(fs.existsSync(historyPath), 'history.json should exist');
    const history = JSON.parse(fs.readFileSync(historyPath, 'utf-8'));
    assert.ok(history.some(h => h.op === 'investigate'), 'should have investigate entry');
  });
});

// ─── cmdOpsDebug ──────────────────────────────────────────────────────────

describe('cmdOpsDebug', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject('ops-debug-');
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('errors on missing area', () => {
    const result = runGsdTools(['ops', 'debug'], tmpDir);
    assert.strictEqual(result.success, false);
    assert.ok(result.error.includes('Usage:'), 'should show usage: ' + result.error);
  });

  test('errors on area not in registry', () => {
    const opsDir = path.join(tmpDir, '.planning', 'ops');
    fs.mkdirSync(opsDir, { recursive: true });
    fs.writeFileSync(path.join(opsDir, 'registry.json'), JSON.stringify({ areas: [] }), 'utf-8');

    const result = runGsdTools(['ops', 'debug', 'nonexistent', 'test'], tmpDir);
    assert.strictEqual(result.success, false);
    assert.ok(result.error.includes('Area not found'), 'should say area not found: ' + result.error);
  });

  test('emits context-pack.md', () => {
    const opsDir = path.join(tmpDir, '.planning', 'ops');
    const authDir = path.join(opsDir, 'auth');
    fs.mkdirSync(authDir, { recursive: true });
    fs.writeFileSync(path.join(opsDir, 'registry.json'), JSON.stringify({
      areas: [{ slug: 'auth', name: 'auth', source: 'manual', detected_by: 'manual', confidence: 'high', created_at: '2026-01-01T00:00:00Z', last_scanned: '2026-01-01T00:00:00Z', components_count: 2 }]
    }), 'utf-8');
    fs.writeFileSync(path.join(authDir, 'tree.json'), JSON.stringify({
      area: 'auth', generated_at: '2026-01-01T00:00:00Z',
      nodes: [
        { id: 'route:login', type: 'route', file_path: 'src/routes/login.js', name: 'login', metadata: {} },
        { id: 'service:AuthSvc', type: 'service', file_path: 'src/auth/AuthSvc.js', name: 'AuthSvc', metadata: {} }
      ],
      edges: [{ from: 'route:login', to: 'service:AuthSvc', type: 'calls' }]
    }), 'utf-8');

    const result = runGsdTools(['ops', 'debug', 'auth', 'login fails'], tmpDir);
    assert.ok(result.success, 'should succeed: ' + (result.error || ''));

    const parsed = JSON.parse(result.output);
    assert.strictEqual(parsed.success, true);
    assert.ok(parsed.context_pack_path, 'should have context_pack_path');

    // Verify context-pack.md was written
    const contextPackPath = path.join(authDir, 'context-pack.md');
    assert.ok(fs.existsSync(contextPackPath), 'context-pack.md should exist');
    const content = fs.readFileSync(contextPackPath, 'utf-8');
    assert.ok(content.includes('## Area Overview'), 'should have Area Overview section');
    assert.ok(content.includes('## Dependency Chain'), 'should have Dependency Chain section');
    assert.ok(content.includes('## Specs'), 'should have Specs section');
    assert.ok(content.includes('## Recent History'), 'should have Recent History section');
  });

  test('context-pack includes symptom', () => {
    const opsDir = path.join(tmpDir, '.planning', 'ops');
    const authDir = path.join(opsDir, 'auth');
    fs.mkdirSync(authDir, { recursive: true });
    fs.writeFileSync(path.join(opsDir, 'registry.json'), JSON.stringify({
      areas: [{ slug: 'auth', name: 'auth', source: 'manual', detected_by: 'manual', confidence: 'high', created_at: '2026-01-01T00:00:00Z', last_scanned: '2026-01-01T00:00:00Z', components_count: 0 }]
    }), 'utf-8');
    // No tree.json — debug should still work
    const result = runGsdTools(['ops', 'debug', 'auth', 'session expires too fast'], tmpDir);
    assert.ok(result.success, 'should succeed without tree: ' + (result.error || ''));

    const contextPackPath = path.join(authDir, 'context-pack.md');
    assert.ok(fs.existsSync(contextPackPath), 'context-pack.md should exist');
    const content = fs.readFileSync(contextPackPath, 'utf-8');
    assert.ok(content.includes('session expires too fast'), 'should include symptom text');
  });

  test('appends history with op debug', () => {
    const opsDir = path.join(tmpDir, '.planning', 'ops');
    const authDir = path.join(opsDir, 'auth');
    fs.mkdirSync(authDir, { recursive: true });
    fs.writeFileSync(path.join(opsDir, 'registry.json'), JSON.stringify({
      areas: [{ slug: 'auth', name: 'auth', source: 'manual', detected_by: 'manual', confidence: 'high', created_at: '2026-01-01T00:00:00Z', last_scanned: '2026-01-01T00:00:00Z', components_count: 0 }]
    }), 'utf-8');

    runGsdTools(['ops', 'debug', 'auth', 'test symptom'], tmpDir);

    const historyPath = path.join(authDir, 'history.json');
    assert.ok(fs.existsSync(historyPath), 'history.json should exist');
    const history = JSON.parse(fs.readFileSync(historyPath, 'utf-8'));
    assert.ok(history.some(h => h.op === 'debug'), 'should have debug entry');
  });
});

// ─── cmdOpsFeature ──────────────────────────────────────────────────────────

describe('cmdOpsFeature', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject('ops-feature-');
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('errors on missing area', () => {
    const result = runGsdTools(['ops', 'feature'], tmpDir);
    assert.strictEqual(result.success, false);
    assert.ok(result.error.includes('Usage:'), 'should show usage: ' + result.error);
  });

  test('errors on area not in registry', () => {
    const opsDir = path.join(tmpDir, '.planning', 'ops');
    fs.mkdirSync(opsDir, { recursive: true });
    fs.writeFileSync(path.join(opsDir, 'registry.json'), JSON.stringify({ areas: [] }), 'utf-8');

    const result = runGsdTools(['ops', 'feature', 'nonexistent', 'add login'], tmpDir);
    assert.strictEqual(result.success, false);
    assert.ok(result.error.includes('Area not found'), 'should say area not found: ' + result.error);
  });

  test('errors on missing tree.json', () => {
    const opsDir = path.join(tmpDir, '.planning', 'ops');
    fs.mkdirSync(opsDir, { recursive: true });
    fs.writeFileSync(path.join(opsDir, 'registry.json'), JSON.stringify({
      areas: [{ slug: 'auth', name: 'auth', source: 'manual', detected_by: 'manual', confidence: 'high', created_at: '2026-01-01T00:00:00Z', last_scanned: null, components_count: 0 }]
    }), 'utf-8');

    const result = runGsdTools(['ops', 'feature', 'auth', 'add 2fa'], tmpDir);
    assert.strictEqual(result.success, false);
    assert.ok(result.error.includes('No tree.json'), 'should mention missing tree.json: ' + result.error);
  });

  test('small tree dispatches to quick', () => {
    const opsDir = path.join(tmpDir, '.planning', 'ops');
    const authDir = path.join(opsDir, 'auth');
    fs.mkdirSync(authDir, { recursive: true });
    fs.writeFileSync(path.join(opsDir, 'registry.json'), JSON.stringify({
      areas: [{ slug: 'auth', name: 'auth', source: 'manual', detected_by: 'manual', confidence: 'high', created_at: '2026-01-01T00:00:00Z', last_scanned: '2026-01-01T00:00:00Z', components_count: 3 }]
    }), 'utf-8');
    fs.writeFileSync(path.join(authDir, 'tree.json'), JSON.stringify({
      area: 'auth', generated_at: '2026-01-01T00:00:00Z',
      nodes: [
        { id: 'component:Login', type: 'component', file_path: 'src/auth/Login.vue', name: 'Login', metadata: {} },
        { id: 'service:AuthSvc', type: 'service', file_path: 'src/auth/AuthSvc.js', name: 'AuthSvc', metadata: {} },
        { id: 'endpoint:auth-api', type: 'endpoint', file_path: 'src/auth/api.js', name: 'auth-api', metadata: {} }
      ],
      edges: [
        { from: 'component:Login', to: 'service:AuthSvc', type: 'calls' },
        { from: 'service:AuthSvc', to: 'endpoint:auth-api', type: 'calls' }
      ]
    }), 'utf-8');

    const result = runGsdTools(['ops', 'feature', 'auth', 'add remember me'], tmpDir);
    assert.ok(result.success, 'should succeed: ' + (result.error || ''));

    const parsed = JSON.parse(result.output);
    assert.strictEqual(parsed.success, true);
    assert.strictEqual(parsed.needs_full_plan, false);
    assert.strictEqual(parsed.dispatch, 'quick');
    assert.ok(parsed.blast_radius, 'should have blast_radius');
    assert.ok(parsed.context_summary, 'should have context_summary');
    assert.ok(parsed.context_summary.nodes_by_type, 'should have nodes_by_type in context_summary');
  });

  test('large tree dispatches to plan', () => {
    const opsDir = path.join(tmpDir, '.planning', 'ops');
    const authDir = path.join(opsDir, 'auth');
    fs.mkdirSync(authDir, { recursive: true });
    fs.writeFileSync(path.join(opsDir, 'registry.json'), JSON.stringify({
      areas: [{ slug: 'auth', name: 'auth', source: 'manual', detected_by: 'manual', confidence: 'high', created_at: '2026-01-01T00:00:00Z', last_scanned: '2026-01-01T00:00:00Z', components_count: 7 }]
    }), 'utf-8');
    fs.writeFileSync(path.join(authDir, 'tree.json'), JSON.stringify({
      area: 'auth', generated_at: '2026-01-01T00:00:00Z',
      nodes: [
        { id: 'route:login', type: 'route', file_path: 'src/routes/login.js', name: 'login', metadata: {} },
        { id: 'view:LoginPage', type: 'view', file_path: 'src/views/LoginPage.vue', name: 'LoginPage', metadata: {} },
        { id: 'component:LoginForm', type: 'component', file_path: 'src/auth/LoginForm.vue', name: 'LoginForm', metadata: {} },
        { id: 'service:AuthSvc', type: 'service', file_path: 'src/auth/AuthSvc.js', name: 'AuthSvc', metadata: {} },
        { id: 'endpoint:auth-api', type: 'endpoint', file_path: 'src/api/auth.js', name: 'auth-api', metadata: {} },
        { id: 'model:User', type: 'model', file_path: 'src/models/User.js', name: 'User', metadata: {} },
        { id: 'service:TokenSvc', type: 'service', file_path: 'src/shared/TokenSvc.js', name: 'TokenSvc', metadata: {} }
      ],
      edges: [
        { from: 'route:login', to: 'view:LoginPage', type: 'renders' },
        { from: 'view:LoginPage', to: 'component:LoginForm', type: 'renders' },
        { from: 'component:LoginForm', to: 'service:AuthSvc', type: 'calls' },
        { from: 'service:AuthSvc', to: 'endpoint:auth-api', type: 'calls' },
        { from: 'endpoint:auth-api', to: 'model:User', type: 'uses_table' },
        { from: 'service:AuthSvc', to: 'service:TokenSvc', type: 'calls' }
      ]
    }), 'utf-8');

    const result = runGsdTools(['ops', 'feature', 'auth', 'add oauth provider'], tmpDir);
    assert.ok(result.success, 'should succeed: ' + (result.error || ''));

    const parsed = JSON.parse(result.output);
    assert.strictEqual(parsed.success, true);
    assert.strictEqual(parsed.needs_full_plan, true);
    assert.strictEqual(parsed.dispatch, 'plan');
    assert.ok(parsed.plan_dir, 'should have plan_dir when needs_full_plan');
    assert.ok(parsed.plan_dir.includes('.planning/ops/auth/plans'), 'plan_dir should point to ops area plans');
  });

  test('appends history with op feature', () => {
    const opsDir = path.join(tmpDir, '.planning', 'ops');
    const authDir = path.join(opsDir, 'auth');
    fs.mkdirSync(authDir, { recursive: true });
    fs.writeFileSync(path.join(opsDir, 'registry.json'), JSON.stringify({
      areas: [{ slug: 'auth', name: 'auth', source: 'manual', detected_by: 'manual', confidence: 'high', created_at: '2026-01-01T00:00:00Z', last_scanned: '2026-01-01T00:00:00Z', components_count: 2 }]
    }), 'utf-8');
    fs.writeFileSync(path.join(authDir, 'tree.json'), JSON.stringify({
      area: 'auth', generated_at: '2026-01-01T00:00:00Z',
      nodes: [
        { id: 'component:A', type: 'component', file_path: 'src/auth/A.js', name: 'A', metadata: {} },
        { id: 'component:B', type: 'component', file_path: 'src/auth/B.js', name: 'B', metadata: {} }
      ],
      edges: [{ from: 'component:A', to: 'component:B', type: 'imports' }]
    }), 'utf-8');

    runGsdTools(['ops', 'feature', 'auth', 'test feature'], tmpDir);

    const historyPath = path.join(authDir, 'history.json');
    assert.ok(fs.existsSync(historyPath), 'history.json should exist');
    const history = JSON.parse(fs.readFileSync(historyPath, 'utf-8'));
    assert.ok(history.some(h => h.op === 'feature'), 'should have feature entry');
  });

  test('includes context_summary with nodes_by_type', () => {
    const opsDir = path.join(tmpDir, '.planning', 'ops');
    const authDir = path.join(opsDir, 'auth');
    fs.mkdirSync(authDir, { recursive: true });
    fs.writeFileSync(path.join(opsDir, 'registry.json'), JSON.stringify({
      areas: [{ slug: 'auth', name: 'auth', source: 'manual', detected_by: 'manual', confidence: 'high', created_at: '2026-01-01T00:00:00Z', last_scanned: '2026-01-01T00:00:00Z', components_count: 3 }]
    }), 'utf-8');
    fs.writeFileSync(path.join(authDir, 'tree.json'), JSON.stringify({
      area: 'auth', generated_at: '2026-01-01T00:00:00Z',
      nodes: [
        { id: 'component:Login', type: 'component', file_path: 'src/auth/Login.vue', name: 'Login', metadata: {} },
        { id: 'service:AuthSvc', type: 'service', file_path: 'src/auth/AuthSvc.js', name: 'AuthSvc', metadata: {} },
        { id: 'endpoint:auth-api', type: 'endpoint', file_path: 'src/auth/api.js', name: 'auth-api', metadata: {} }
      ],
      edges: [
        { from: 'component:Login', to: 'service:AuthSvc', type: 'calls' },
        { from: 'service:AuthSvc', to: 'endpoint:auth-api', type: 'calls' }
      ]
    }), 'utf-8');

    const result = runGsdTools(['ops', 'feature', 'auth', 'check summary'], tmpDir);
    assert.ok(result.success, 'should succeed: ' + (result.error || ''));

    const parsed = JSON.parse(result.output);
    assert.ok(parsed.context_summary, 'should have context_summary');
    assert.strictEqual(parsed.context_summary.nodes_by_type.component, 1);
    assert.strictEqual(parsed.context_summary.nodes_by_type.service, 1);
    assert.strictEqual(parsed.context_summary.nodes_by_type.endpoint, 1);
    assert.strictEqual(parsed.context_summary.edges_count, 2);
    assert.strictEqual(parsed.context_summary.total_nodes, 3);
  });
});

// ─── cmdOpsModify ──────────────────────────────────────────────────────────

describe('cmdOpsModify', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject('ops-modify-');
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('errors on missing area', () => {
    const result = runGsdTools(['ops', 'modify'], tmpDir);
    assert.strictEqual(result.success, false);
    assert.ok(result.error.includes('Usage:'), 'should show usage: ' + result.error);
  });

  test('returns affected_nodes from tree traversal', () => {
    const opsDir = path.join(tmpDir, '.planning', 'ops');
    const authDir = path.join(opsDir, 'auth');
    fs.mkdirSync(authDir, { recursive: true });
    fs.writeFileSync(path.join(opsDir, 'registry.json'), JSON.stringify({
      areas: [{ slug: 'auth', name: 'auth', source: 'manual', detected_by: 'manual', confidence: 'high', created_at: '2026-01-01T00:00:00Z', last_scanned: '2026-01-01T00:00:00Z', components_count: 3 }]
    }), 'utf-8');
    fs.writeFileSync(path.join(authDir, 'tree.json'), JSON.stringify({
      area: 'auth', generated_at: '2026-01-01T00:00:00Z',
      nodes: [
        { id: 'component:Login', type: 'component', file_path: 'src/auth/Login.vue', name: 'Login', metadata: {} },
        { id: 'service:AuthSvc', type: 'service', file_path: 'src/auth/AuthSvc.js', name: 'AuthSvc', metadata: {} },
        { id: 'endpoint:auth-api', type: 'endpoint', file_path: 'src/auth/api.js', name: 'auth-api', metadata: {} }
      ],
      edges: [
        { from: 'component:Login', to: 'service:AuthSvc', type: 'calls' },
        { from: 'service:AuthSvc', to: 'endpoint:auth-api', type: 'calls' }
      ]
    }), 'utf-8');

    const result = runGsdTools(['ops', 'modify', 'auth', 'change token expiry'], tmpDir);
    assert.ok(result.success, 'should succeed: ' + (result.error || ''));

    const parsed = JSON.parse(result.output);
    assert.strictEqual(parsed.success, true);
    assert.ok(Array.isArray(parsed.affected_nodes), 'should have affected_nodes array');
    assert.ok(parsed.affected_count > 0, 'should have affected_count > 0');
  });

  test('computes blast radius for dispatch', () => {
    const opsDir = path.join(tmpDir, '.planning', 'ops');
    const authDir = path.join(opsDir, 'auth');
    fs.mkdirSync(authDir, { recursive: true });
    fs.writeFileSync(path.join(opsDir, 'registry.json'), JSON.stringify({
      areas: [{ slug: 'auth', name: 'auth', source: 'manual', detected_by: 'manual', confidence: 'high', created_at: '2026-01-01T00:00:00Z', last_scanned: '2026-01-01T00:00:00Z', components_count: 2 }]
    }), 'utf-8');
    fs.writeFileSync(path.join(authDir, 'tree.json'), JSON.stringify({
      area: 'auth', generated_at: '2026-01-01T00:00:00Z',
      nodes: [
        { id: 'component:A', type: 'component', file_path: 'src/auth/A.js', name: 'A', metadata: {} },
        { id: 'component:B', type: 'component', file_path: 'src/auth/B.js', name: 'B', metadata: {} }
      ],
      edges: [{ from: 'component:A', to: 'component:B', type: 'imports' }]
    }), 'utf-8');

    const result = runGsdTools(['ops', 'modify', 'auth', 'refactor service'], tmpDir);
    assert.ok(result.success, 'should succeed: ' + (result.error || ''));

    const parsed = JSON.parse(result.output);
    assert.ok(parsed.blast_radius, 'should have blast_radius');
    assert.ok('needs_full_plan' in parsed.blast_radius, 'blast_radius should have needs_full_plan');
    assert.ok('total_nodes' in parsed.blast_radius, 'blast_radius should have total_nodes');
    assert.ok(parsed.dispatch, 'should have dispatch field');
  });

  test('appends history with op modify', () => {
    const opsDir = path.join(tmpDir, '.planning', 'ops');
    const authDir = path.join(opsDir, 'auth');
    fs.mkdirSync(authDir, { recursive: true });
    fs.writeFileSync(path.join(opsDir, 'registry.json'), JSON.stringify({
      areas: [{ slug: 'auth', name: 'auth', source: 'manual', detected_by: 'manual', confidence: 'high', created_at: '2026-01-01T00:00:00Z', last_scanned: '2026-01-01T00:00:00Z', components_count: 2 }]
    }), 'utf-8');
    fs.writeFileSync(path.join(authDir, 'tree.json'), JSON.stringify({
      area: 'auth', generated_at: '2026-01-01T00:00:00Z',
      nodes: [
        { id: 'component:A', type: 'component', file_path: 'src/auth/A.js', name: 'A', metadata: {} },
        { id: 'component:B', type: 'component', file_path: 'src/auth/B.js', name: 'B', metadata: {} }
      ],
      edges: [{ from: 'component:A', to: 'component:B', type: 'imports' }]
    }), 'utf-8');

    runGsdTools(['ops', 'modify', 'auth', 'test modify'], tmpDir);

    const historyPath = path.join(authDir, 'history.json');
    assert.ok(fs.existsSync(historyPath), 'history.json should exist');
    const history = JSON.parse(fs.readFileSync(historyPath, 'utf-8'));
    assert.ok(history.some(h => h.op === 'modify'), 'should have modify entry');
  });
});
