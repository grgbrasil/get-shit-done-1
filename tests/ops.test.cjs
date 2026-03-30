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
