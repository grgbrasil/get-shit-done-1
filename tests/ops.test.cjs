/**
 * OPS Registry — Unit tests
 *
 * Covers OPS-01 (init scan), OPS-03 (manual add), OPS-04 (per-area persistence).
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const { runGsdTools, createTempProject, cleanup } = require('./helpers.cjs');
const fs = require('fs');
const path = require('path');

// ─── ops init ───────────────────────────────────────────────────────────────

describe('ops init', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject('ops-init-');
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('creates registry.json with auto-detected areas from Express router files', () => {
    // Seed Express router file
    const routesDir = path.join(tmpDir, 'routes');
    fs.mkdirSync(routesDir, { recursive: true });
    fs.writeFileSync(path.join(routesDir, 'api.js'), `
      const router = require('express').Router();
      router.get('/users', (req, res) => {});
      router.get('/products', (req, res) => {});
      module.exports = router;
    `);

    const result = runGsdTools(['ops', 'init'], tmpDir);
    assert.ok(result.success, 'ops init should succeed: ' + (result.error || ''));

    const parsed = JSON.parse(result.output);
    assert.strictEqual(parsed.success, true);
    assert.strictEqual(parsed.areas_detected, 2);

    const slugs = parsed.areas.map(a => a.slug).sort();
    assert.deepStrictEqual(slugs, ['products', 'users']);

    // Check schema fields
    for (const area of parsed.areas) {
      assert.strictEqual(area.source, 'auto');
      assert.strictEqual(area.detected_by, 'route');
      assert.strictEqual(area.confidence, 'high');
      assert.ok(area.created_at);
      assert.ok(area.last_scanned);
      assert.strictEqual(area.components_count, 0);
    }

    // Verify registry.json was written
    const registryPath = path.join(tmpDir, '.planning', 'ops', 'registry.json');
    assert.ok(fs.existsSync(registryPath), 'registry.json should exist');
  });

  test('detects areas from Vue Router files', () => {
    const routerDir = path.join(tmpDir, 'src', 'router');
    fs.mkdirSync(routerDir, { recursive: true });
    fs.writeFileSync(path.join(routerDir, 'index.js'), `
      export default [
        { path: '/dashboard', component: Dashboard },
        { path: '/settings', component: Settings },
      ];
    `);

    const result = runGsdTools(['ops', 'init'], tmpDir);
    assert.ok(result.success, 'ops init should succeed: ' + (result.error || ''));

    const parsed = JSON.parse(result.output);
    assert.strictEqual(parsed.areas_detected, 2);
    const slugs = parsed.areas.map(a => a.slug).sort();
    assert.deepStrictEqual(slugs, ['dashboard', 'settings']);
  });

  test('detects areas from directory conventions', () => {
    // Seed src/views directories
    fs.mkdirSync(path.join(tmpDir, 'src', 'views', 'usuarios'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'src', 'views', 'produtos'), { recursive: true });
    // Need at least one file in a view dir for git ls-files to pick up the prefix
    fs.writeFileSync(path.join(tmpDir, 'src', 'views', 'usuarios', 'index.vue'), '<template></template>');
    fs.writeFileSync(path.join(tmpDir, 'src', 'views', 'produtos', 'index.vue'), '<template></template>');

    const result = runGsdTools(['ops', 'init'], tmpDir);
    assert.ok(result.success, 'ops init should succeed: ' + (result.error || ''));

    const parsed = JSON.parse(result.output);
    assert.ok(parsed.areas_detected >= 2, 'Should detect at least 2 areas');

    const slugs = parsed.areas.map(a => a.slug);
    assert.ok(slugs.includes('usuarios'), 'Should detect usuarios');
    assert.ok(slugs.includes('produtos'), 'Should detect produtos');

    const dirArea = parsed.areas.find(a => a.slug === 'usuarios');
    assert.strictEqual(dirArea.detected_by, 'directory');
    assert.strictEqual(dirArea.confidence, 'medium');
  });

  test('deduplicates route and directory detected areas', () => {
    // Seed both router and directory for 'users'
    const routesDir = path.join(tmpDir, 'routes');
    fs.mkdirSync(routesDir, { recursive: true });
    fs.writeFileSync(path.join(routesDir, 'api.js'), `
      const router = require('express').Router();
      router.get('/users', handler);
    `);

    fs.mkdirSync(path.join(tmpDir, 'src', 'views', 'users'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'src', 'views', 'users', 'index.vue'), '<template></template>');

    const result = runGsdTools(['ops', 'init'], tmpDir);
    assert.ok(result.success, 'ops init should succeed: ' + (result.error || ''));

    const parsed = JSON.parse(result.output);
    const usersAreas = parsed.areas.filter(a => a.slug === 'users');
    assert.strictEqual(usersAreas.length, 1, 'Should have exactly one users entry (deduplicated)');

    const entry = usersAreas[0];
    // detected_by should include both sources
    assert.ok(
      Array.isArray(entry.detected_by) && entry.detected_by.includes('route') && entry.detected_by.includes('directory'),
      'detected_by should contain both route and directory'
    );
  });

  test('returns empty areas for project with no recognizable patterns', () => {
    const result = runGsdTools(['ops', 'init'], tmpDir);
    assert.ok(result.success, 'ops init should succeed: ' + (result.error || ''));

    const parsed = JSON.parse(result.output);
    assert.strictEqual(parsed.success, true);
    assert.strictEqual(parsed.areas_detected, 0);
    assert.deepStrictEqual(parsed.areas, []);
  });

  test('does NOT create per-area directories during init', () => {
    const routesDir = path.join(tmpDir, 'routes');
    fs.mkdirSync(routesDir, { recursive: true });
    fs.writeFileSync(path.join(routesDir, 'api.js'), `
      const router = require('express').Router();
      router.get('/users', handler);
    `);

    const result = runGsdTools(['ops', 'init'], tmpDir);
    assert.ok(result.success);

    const parsed = JSON.parse(result.output);
    for (const area of parsed.areas) {
      const dirPath = path.join(tmpDir, '.planning', 'ops', area.slug);
      assert.ok(!fs.existsSync(dirPath), `Per-area directory should NOT exist for ${area.slug} after init`);
    }
  });

  test('overwrites registry on re-init (no duplicates)', () => {
    const routesDir = path.join(tmpDir, 'routes');
    fs.mkdirSync(routesDir, { recursive: true });
    fs.writeFileSync(path.join(routesDir, 'api.js'), `
      const router = require('express').Router();
      router.get('/users', handler);
    `);

    runGsdTools(['ops', 'init'], tmpDir);
    const result2 = runGsdTools(['ops', 'init'], tmpDir);
    assert.ok(result2.success);

    const parsed = JSON.parse(result2.output);
    const usersAreas = parsed.areas.filter(a => a.slug === 'users');
    assert.strictEqual(usersAreas.length, 1, 'No duplicates after re-init');
  });
});

// ─── ops add ────────────────────────────────────────────────────────────────

describe('ops add', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject('ops-add-');
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('registers manual area in registry', () => {
    const result = runGsdTools(['ops', 'add', 'User Management'], tmpDir);
    assert.ok(result.success, 'ops add should succeed: ' + (result.error || ''));

    const parsed = JSON.parse(result.output);
    assert.strictEqual(parsed.success, true);
    assert.strictEqual(parsed.area.slug, 'user-management');
    assert.strictEqual(parsed.area.source, 'manual');
    assert.strictEqual(parsed.area.detected_by, 'manual');
    assert.strictEqual(parsed.area.confidence, 'high');
    assert.strictEqual(parsed.area.last_scanned, null);
    assert.strictEqual(parsed.area.components_count, 0);
  });

  test('creates per-area directory for manual areas', () => {
    runGsdTools(['ops', 'add', 'Config'], tmpDir);

    const dirPath = path.join(tmpDir, '.planning', 'ops', 'config');
    assert.ok(fs.existsSync(dirPath), 'Per-area directory should exist after add');
  });

  test('rejects duplicate area slug', () => {
    runGsdTools(['ops', 'add', 'Users'], tmpDir);
    const result = runGsdTools(['ops', 'add', 'Users'], tmpDir);

    assert.strictEqual(result.success, false, 'Duplicate add should fail');
    assert.ok(result.error.includes('already exists'), 'Error should mention already exists');
  });

  test('errors on missing area name', () => {
    const result = runGsdTools(['ops', 'add'], tmpDir);
    assert.strictEqual(result.success, false, 'Missing name should fail');
    assert.ok(result.error.includes('Usage'), 'Error should show usage');
  });
});

// ─── ops list ───────────────────────────────────────────────────────────────

describe('ops list', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject('ops-list-');
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('lists all areas from registry', () => {
    runGsdTools(['ops', 'add', 'Users'], tmpDir);
    runGsdTools(['ops', 'add', 'Products'], tmpDir);

    const result = runGsdTools(['ops', 'list'], tmpDir);
    assert.ok(result.success, 'ops list should succeed: ' + (result.error || ''));

    const parsed = JSON.parse(result.output);
    assert.strictEqual(parsed.areas.length, 2);
    const slugs = parsed.areas.map(a => a.slug).sort();
    assert.deepStrictEqual(slugs, ['products', 'users']);
  });

  test('returns empty array when no areas', () => {
    const result = runGsdTools(['ops', 'list'], tmpDir);
    assert.ok(result.success, 'ops list should succeed: ' + (result.error || ''));

    const parsed = JSON.parse(result.output);
    assert.deepStrictEqual(parsed.areas, []);
  });
});

// ─── ops get ────────────────────────────────────────────────────────────────

describe('ops get', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject('ops-get-');
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('returns single area by slug', () => {
    runGsdTools(['ops', 'add', 'Users'], tmpDir);

    const result = runGsdTools(['ops', 'get', 'users'], tmpDir);
    assert.ok(result.success, 'ops get should succeed: ' + (result.error || ''));

    const parsed = JSON.parse(result.output);
    assert.strictEqual(parsed.slug, 'users');
    assert.strictEqual(parsed.name, 'Users');
    assert.ok('has_tree' in parsed, 'Should include has_tree field');
  });

  test('errors on non-existent area', () => {
    const result = runGsdTools(['ops', 'get', 'nonexistent'], tmpDir);
    assert.strictEqual(result.success, false);
    assert.ok(result.error.includes('not found'), 'Error should say not found');
  });

  test('includes has_tree field as false when no tree.json', () => {
    runGsdTools(['ops', 'add', 'Config'], tmpDir);

    const result = runGsdTools(['ops', 'get', 'config'], tmpDir);
    assert.ok(result.success);

    const parsed = JSON.parse(result.output);
    assert.strictEqual(parsed.has_tree, false);
  });
});

// ─── ops map ──────────────────────────────────────────────────────────────

describe('ops map', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject('ops-map-');
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('produces tree.json with nodes and edges', () => {
    // Register area manually
    runGsdTools(['ops', 'add', 'users'], tmpDir);

    // Seed files for the users area
    const viewsDir = path.join(tmpDir, 'src', 'views', 'users');
    fs.mkdirSync(viewsDir, { recursive: true });
    const apiDir = path.join(tmpDir, 'src', 'api');
    fs.mkdirSync(apiDir, { recursive: true });

    fs.writeFileSync(path.join(viewsDir, 'UsersView.js'),
      `import UserTable from './UserTable';\nexport default {};\n`);
    fs.writeFileSync(path.join(viewsDir, 'UserTable.js'),
      `import userApi from '../../api/userApi';\nexport default {};\n`);
    fs.writeFileSync(path.join(apiDir, 'userApi.js'),
      `export default { fetchUsers() {} };\n`);

    const result = runGsdTools(['ops', 'map', 'users'], tmpDir);
    assert.ok(result.success, 'ops map should succeed: ' + (result.error || ''));

    const parsed = JSON.parse(result.output);
    assert.strictEqual(parsed.success, true);
    assert.strictEqual(parsed.area, 'users');
    assert.ok(parsed.nodes >= 3, 'Should have at least 3 nodes');
    assert.ok(parsed.edges >= 2, 'Should have at least 2 edges');

    // Verify tree.json exists
    const treePath = path.join(tmpDir, '.planning', 'ops', 'users', 'tree.json');
    assert.ok(fs.existsSync(treePath), 'tree.json should exist');

    const tree = JSON.parse(fs.readFileSync(treePath, 'utf-8'));
    assert.ok(Array.isArray(tree.nodes), 'nodes should be array');
    assert.ok(Array.isArray(tree.edges), 'edges should be array');
    assert.ok(tree.nodes.length >= 3, 'Should have at least 3 nodes in tree.json');
    assert.ok(tree.edges.length >= 2, 'Should have at least 2 edges in tree.json');
  });

  test('tree.json follows adjacency list schema', () => {
    runGsdTools(['ops', 'add', 'products'], tmpDir);

    const viewsDir = path.join(tmpDir, 'src', 'views', 'products');
    fs.mkdirSync(viewsDir, { recursive: true });
    fs.writeFileSync(path.join(viewsDir, 'ProductList.js'),
      `export default {};\n`);

    runGsdTools(['ops', 'map', 'products'], tmpDir);

    const treePath = path.join(tmpDir, '.planning', 'ops', 'products', 'tree.json');
    const tree = JSON.parse(fs.readFileSync(treePath, 'utf-8'));

    // Validate node schema
    for (const node of tree.nodes) {
      assert.ok(node.id, 'node must have id');
      assert.ok(node.type, 'node must have type');
      assert.ok(node.file_path, 'node must have file_path');
      assert.ok(node.name, 'node must have name');
      assert.ok('metadata' in node, 'node must have metadata');
      assert.ok(
        ['route', 'view', 'component', 'endpoint', 'service', 'model', 'table'].includes(node.type),
        'node type must be valid: ' + node.type
      );
    }

    // Validate edge schema
    for (const edge of tree.edges) {
      assert.ok(edge.from, 'edge must have from');
      assert.ok(edge.to, 'edge must have to');
      assert.ok(edge.type, 'edge must have type');
      assert.ok(
        ['imports', 'calls', 'renders', 'serves', 'uses_table'].includes(edge.type),
        'edge type must be valid: ' + edge.type
      );
    }

    // Validate top-level fields
    assert.ok(tree.area, 'tree must have area');
    assert.ok(tree.generated_at, 'tree must have generated_at');
  });

  test('creates per-area directory on first map', () => {
    // Add area manually but note: cmdOpsAdd already creates the dir
    // Instead, create registry entry without directory
    const registryDir = path.join(tmpDir, '.planning', 'ops');
    fs.mkdirSync(registryDir, { recursive: true });
    const registry = {
      areas: [{
        slug: 'reports',
        name: 'Reports',
        source: 'manual',
        detected_by: 'manual',
        confidence: 'high',
        created_at: new Date().toISOString(),
        last_scanned: null,
        components_count: 0
      }]
    };
    fs.writeFileSync(path.join(registryDir, 'registry.json'), JSON.stringify(registry, null, 2));

    // Seed a file for the area
    const reportsDir = path.join(tmpDir, 'src', 'views', 'reports');
    fs.mkdirSync(reportsDir, { recursive: true });
    fs.writeFileSync(path.join(reportsDir, 'ReportsView.js'), `export default {};\n`);

    const areaPath = path.join(tmpDir, '.planning', 'ops', 'reports');
    assert.ok(!fs.existsSync(areaPath), 'Per-area directory should NOT exist before map');

    const result = runGsdTools(['ops', 'map', 'reports'], tmpDir);
    assert.ok(result.success, 'ops map should succeed: ' + (result.error || ''));

    assert.ok(fs.existsSync(areaPath), 'Per-area directory should exist after map');
    assert.ok(fs.existsSync(path.join(areaPath, 'tree.json')), 'tree.json should exist after map');
  });

  test('updates registry components_count after map', () => {
    runGsdTools(['ops', 'add', 'settings'], tmpDir);

    const viewsDir = path.join(tmpDir, 'src', 'views', 'settings');
    fs.mkdirSync(viewsDir, { recursive: true });
    fs.writeFileSync(path.join(viewsDir, 'SettingsView.js'), `export default {};\n`);
    fs.writeFileSync(path.join(viewsDir, 'SettingsForm.js'), `export default {};\n`);

    runGsdTools(['ops', 'map', 'settings'], tmpDir);

    const registryPath = path.join(tmpDir, '.planning', 'ops', 'registry.json');
    const registry = JSON.parse(fs.readFileSync(registryPath, 'utf-8'));
    const entry = registry.areas.find(a => a.slug === 'settings');

    assert.ok(entry.components_count >= 2, 'components_count should be at least 2, got: ' + entry.components_count);
    assert.ok(entry.last_scanned, 'last_scanned should be set');
  });

  test('errors on non-existent area', () => {
    const result = runGsdTools(['ops', 'map', 'nonexistent'], tmpDir);
    assert.strictEqual(result.success, false, 'Should fail for non-existent area');
    assert.ok(result.error.includes('not found') || result.error.includes('Area not found'),
      'Error should mention area not found');
  });

  test('errors on missing area argument', () => {
    const result = runGsdTools(['ops', 'map'], tmpDir);
    assert.strictEqual(result.success, false, 'Should fail without area argument');
    assert.ok(result.error.includes('Usage'), 'Error should show usage');
  });
});

// ─── dispatcher ─────────────────────────────────────────────────────────────

describe('ops dispatcher', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject('ops-dispatch-');
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('errors on unknown ops subcommand', () => {
    const result = runGsdTools(['ops', 'foobar'], tmpDir);
    assert.strictEqual(result.success, false);
    assert.ok(result.error.includes('Unknown ops subcommand'), 'Error should mention unknown subcommand');
  });
});
