/**
 * OPS Tree Preserve — Unit tests
 *
 * Covers refreshTree knowledge preservation: when refreshTree rebuilds
 * the tree from scratch, existing knowledge and enriched fields on nodes
 * that survive the refresh must be preserved.
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const { execSync } = require('child_process');
const { createTempProject, cleanup } = require('./helpers.cjs');
const fs = require('fs');
const path = require('path');

const { refreshTree } = require('../get-shit-done/bin/lib/ops.cjs');

// ─── Helpers ────────────────────────────────────────────────────────────────

function seedAreaWithTree(tmpDir, slug, nodes) {
  const registryDir = path.join(tmpDir, '.planning', 'ops');
  fs.mkdirSync(registryDir, { recursive: true });
  const registry = {
    areas: [{ slug, name: slug.charAt(0).toUpperCase() + slug.slice(1), source: 'manual', detected_by: 'directory', created_at: new Date().toISOString() }]
  };
  fs.writeFileSync(path.join(registryDir, 'registry.json'), JSON.stringify(registry, null, 2));
  const aDir = path.join(registryDir, slug);
  fs.mkdirSync(aDir, { recursive: true });
  const tree = {
    area: slug,
    generated_at: new Date().toISOString(),
    nodes: nodes,
    edges: []
  };
  fs.writeFileSync(path.join(aDir, 'tree.json'), JSON.stringify(tree, null, 2));
  return aDir;
}

function readTree(tmpDir, slug) {
  const p = path.join(tmpDir, '.planning', 'ops', slug, 'tree.json');
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

function initGit(tmpDir) {
  execSync('git init', { cwd: tmpDir, stdio: 'pipe' });
}

function gitCommitAll(tmpDir) {
  execSync('git add -A', { cwd: tmpDir, stdio: 'pipe' });
  execSync('git commit -m "init" --allow-empty', { cwd: tmpDir, stdio: 'pipe' });
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('ops refreshTree — knowledge preservation', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject('ops-tree-preserve-');
  });
  afterEach(() => { cleanup(tmpDir); });

  test('preserves knowledge fields on nodes that survive refresh', () => {
    // Create the actual source file so refreshTree can discover it
    const srcDir = path.join(tmpDir, 'src', 'auth');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(path.join(srcDir, 'AuthService.js'), 'export class AuthService {}');

    // Seed tree with rich knowledge on the node
    seedAreaWithTree(tmpDir, 'auth', [
      {
        id: 'service:AuthService',
        type: 'service',
        file_path: 'src/auth/AuthService.js',
        name: 'AuthService',
        metadata: {},
        knowledge: {
          framework: 'express',
          specs_applicable: ['AUTH-01', 'AUTH-02'],
          decisions: ['Use JWT tokens'],
          investigation_count: 3,
          last_investigated: '2026-03-29T00:00:00.000Z'
        },
        endpoints_called: ['/api/auth/login', '/api/auth/logout'],
        css_classes: ['auth-form'],
        columns: ['id', 'email', 'token'],
        query: 'SELECT * FROM users WHERE active = 1',
        indexes: ['idx_users_email'],
        props: ['userId'],
        emits: ['auth:login'],
        slots: ['default'],
        summary: 'Core authentication service handling JWT token lifecycle'
      }
    ]);

    // Init git so listProjectFiles (git ls-files) works
    initGit(tmpDir);
    gitCommitAll(tmpDir);

    // Call refreshTree directly
    refreshTree(tmpDir, 'auth');

    const tree = readTree(tmpDir, 'auth');

    // Find the node by file_path (id may differ if classifyFileType categorizes differently)
    const node = tree.nodes.find(n => n.file_path === 'src/auth/AuthService.js');
    assert.ok(node, 'node for AuthService.js should exist after refresh');

    // Assert knowledge fields are preserved
    assert.strictEqual(node.knowledge.framework, 'express', 'knowledge.framework preserved');
    assert.deepStrictEqual(node.knowledge.specs_applicable, ['AUTH-01', 'AUTH-02'], 'knowledge.specs_applicable preserved');
    assert.deepStrictEqual(node.knowledge.decisions, ['Use JWT tokens'], 'knowledge.decisions preserved');
    assert.strictEqual(node.knowledge.investigation_count, 3, 'knowledge.investigation_count preserved');
    assert.strictEqual(node.knowledge.last_investigated, '2026-03-29T00:00:00.000Z', 'knowledge.last_investigated preserved');

    // Assert enriched fields are preserved
    assert.deepStrictEqual(node.endpoints_called, ['/api/auth/login', '/api/auth/logout'], 'endpoints_called preserved');
    assert.deepStrictEqual(node.css_classes, ['auth-form'], 'css_classes preserved');
    assert.deepStrictEqual(node.columns, ['id', 'email', 'token'], 'columns preserved');
    assert.strictEqual(node.query, 'SELECT * FROM users WHERE active = 1', 'query preserved');
    assert.deepStrictEqual(node.indexes, ['idx_users_email'], 'indexes preserved');
    assert.deepStrictEqual(node.props, ['userId'], 'props preserved');
    assert.deepStrictEqual(node.emits, ['auth:login'], 'emits preserved');
    assert.deepStrictEqual(node.slots, ['default'], 'slots preserved');
    assert.strictEqual(node.summary, 'Core authentication service handling JWT token lifecycle', 'summary preserved');
  });

  test('does not overwrite new node fields with stale existing data', () => {
    // Create source file
    const srcDir = path.join(tmpDir, 'src', 'payments');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(path.join(srcDir, 'PaymentService.js'), 'export class PaymentService {}');

    // Seed with existing knowledge — metadata has old value
    seedAreaWithTree(tmpDir, 'payments', [
      {
        id: 'service:PaymentService',
        type: 'service',
        file_path: 'src/payments/PaymentService.js',
        name: 'PaymentService',
        metadata: { old_meta: true },
        knowledge: { framework: 'stripe' },
        summary: 'Handles payments'
      }
    ]);

    initGit(tmpDir);
    gitCommitAll(tmpDir);

    refreshTree(tmpDir, 'payments');

    const tree = readTree(tmpDir, 'payments');
    const node = tree.nodes.find(n => n.file_path === 'src/payments/PaymentService.js');
    assert.ok(node, 'node should exist');

    // metadata is generated fresh by refresh — the new value should win
    assert.ok(node.metadata !== undefined, 'metadata should exist from fresh scan');

    // knowledge should be preserved from existing
    assert.strictEqual(node.knowledge.framework, 'stripe', 'knowledge preserved from existing');
    // summary is an enriched field not generated by refresh — should be preserved
    assert.strictEqual(node.summary, 'Handles payments', 'summary preserved from existing');
  });

  test('handles refresh when no existing tree (first scan)', () => {
    // Create source file
    const srcDir = path.join(tmpDir, 'src', 'billing');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(path.join(srcDir, 'BillingService.js'), 'export class BillingService {}');

    // Seed registry but NO tree.json
    const registryDir = path.join(tmpDir, '.planning', 'ops');
    fs.mkdirSync(registryDir, { recursive: true });
    const registry = {
      areas: [{ slug: 'billing', name: 'Billing', source: 'manual', detected_by: 'directory', created_at: new Date().toISOString() }]
    };
    fs.writeFileSync(path.join(registryDir, 'registry.json'), JSON.stringify(registry, null, 2));
    fs.mkdirSync(path.join(registryDir, 'billing'), { recursive: true });

    initGit(tmpDir);
    gitCommitAll(tmpDir);

    // Should not throw when no existing tree
    refreshTree(tmpDir, 'billing');

    const tree = readTree(tmpDir, 'billing');
    assert.ok(tree.nodes.length > 0, 'should have discovered nodes');
    const node = tree.nodes.find(n => n.file_path === 'src/billing/BillingService.js');
    assert.ok(node, 'BillingService node should exist');
    // knowledge should be empty object (default from fresh scan)
    assert.deepStrictEqual(node.knowledge || {}, {}, 'knowledge starts empty on first scan');
  });
});
