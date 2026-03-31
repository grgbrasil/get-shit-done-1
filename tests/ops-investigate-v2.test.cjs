/**
 * OPS Investigate v2 — Unit tests for auto-bootstrap and findings-aware output
 *
 * Covers:
 * 1. Auto-registers domain if not in registry
 * 2. Returns findings_path and tools hints
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const { runGsdTools, createTempProject, cleanup } = require('./helpers.cjs');
const fs = require('fs');
const path = require('path');

// ─── Helpers ────────────────────────────────────────────────────────────────

function seedArea(tmpDir, slug, treeNodes, treeEdges) {
  const opsDir = path.join(tmpDir, '.planning', 'ops');
  fs.mkdirSync(opsDir, { recursive: true });
  fs.writeFileSync(path.join(opsDir, 'registry.json'), JSON.stringify({
    areas: [{
      slug,
      name: slug,
      source: 'manual',
      detected_by: 'user',
      confidence: 'high',
      components_count: treeNodes ? treeNodes.length : 0,
      last_scanned: '2026-01-01T00:00:00Z'
    }]
  }), 'utf-8');

  const areaPath = path.join(opsDir, slug);
  fs.mkdirSync(areaPath, { recursive: true });
  fs.writeFileSync(path.join(areaPath, 'tree.json'), JSON.stringify({
    area: slug,
    generated_at: '2026-01-01T00:00:00Z',
    nodes: treeNodes || [],
    edges: treeEdges || []
  }), 'utf-8');
}

// ─── Test 1: Auto-registers domain if not in registry ──────────────────────

describe('cmdOpsInvestigate v2 — auto-bootstrap', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject('ops-inv-v2-');
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('auto-registers domain if not in registry at all', () => {
    // No registry, no area dir, no tree — everything must be bootstrapped
    const registryPath = path.join(tmpDir, '.planning', 'ops', 'registry.json');
    assert.ok(!fs.existsSync(registryPath), 'registry should not exist yet');

    // Call investigate with a brand-new area
    const result = runGsdTools(
      ['ops', 'investigate', 'auth-flow', 'Login is failing', '--raw'],
      tmpDir
    );

    assert.ok(result.success, 'command should succeed: ' + (result.error || ''));
    const parsed = JSON.parse(result.output);

    // Registry should have been auto-created with the area
    assert.ok(fs.existsSync(registryPath), 'registry.json should be auto-created');
    const registry = JSON.parse(fs.readFileSync(registryPath, 'utf-8'));
    const entry = registry.areas.find(a => a.slug === 'auth-flow');
    assert.ok(entry, 'area should be in registry');
    assert.strictEqual(entry.source, 'auto-bootstrap');
    assert.strictEqual(entry.detected_by, 'investigate');
    assert.strictEqual(entry.confidence, 'medium');

    // Area dir should exist
    const areaPath = path.join(tmpDir, '.planning', 'ops', 'auth-flow');
    assert.ok(fs.existsSync(areaPath), 'area dir should be auto-created');

    // Tree should exist (empty)
    const treePath = path.join(areaPath, 'tree.json');
    assert.ok(fs.existsSync(treePath), 'tree.json should be auto-created');
    const tree = JSON.parse(fs.readFileSync(treePath, 'utf-8'));
    assert.strictEqual(tree.area, 'auth-flow');
    assert.deepStrictEqual(tree.nodes, []);
    assert.deepStrictEqual(tree.edges, []);

    // Output bootstrapped flags
    assert.strictEqual(parsed.success, true);
    assert.strictEqual(parsed.bootstrapped.registry, true);
    assert.strictEqual(parsed.bootstrapped.area_dir, true);
    assert.strictEqual(parsed.bootstrapped.tree, true);
  });

  test('returns findings_path and tools hints', () => {
    // Seed minimal registry + empty tree (no nodes to avoid refreshTree re-scan)
    seedArea(tmpDir, 'payments', [], []);

    const result = runGsdTools(
      ['ops', 'investigate', 'payments', 'Refund not working', '--raw'],
      tmpDir
    );

    assert.ok(result.success, 'command should succeed: ' + (result.error || ''));
    const parsed = JSON.parse(result.output);

    // findings_path
    assert.strictEqual(parsed.findings_path, '.planning/ops/payments/findings.json');

    // tools object
    assert.ok(parsed.tools, 'tools object should exist');
    assert.ok(parsed.tools.tree_query, 'tools.tree_query should exist');
    assert.ok(parsed.tools.tree_update, 'tools.tree_update should exist');
    assert.ok(parsed.tools.findings_add, 'tools.findings_add should exist');
    assert.ok(parsed.tools.findings_list, 'tools.findings_list should exist');

    // tools should reference gsd-tools.cjs
    const base = 'node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs"';
    assert.ok(parsed.tools.tree_query.includes(base), 'tree_query should use gsd-tools base');
    assert.ok(parsed.tools.tree_query.includes('payments'), 'tree_query should include area slug');
    assert.ok(parsed.tools.findings_add.includes('payments'), 'findings_add should include area slug');

    // bootstrapped should all be false (pre-seeded)
    assert.strictEqual(parsed.bootstrapped.registry, false);
    assert.strictEqual(parsed.bootstrapped.area_dir, false);
    assert.strictEqual(parsed.bootstrapped.tree, false);

    // context should reflect existing tree (empty, no refresh triggered)
    assert.strictEqual(parsed.context.nodes, 0);
    assert.strictEqual(parsed.context.edges, 0);
  });
});
