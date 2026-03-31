/**
 * OPS Tree Update — Unit tests
 *
 * Covers cmdOpsTreeUpdate: planting knowledge on tree nodes,
 * dotted field paths, auto-updating investigation metadata,
 * and graceful error handling for missing nodes.
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const { runGsdTools, createTempProject, cleanup } = require('./helpers.cjs');
const fs = require('fs');
const path = require('path');

// ─── Helpers ────────────────────────────────────────────────────────────────

function seedAreaWithTree(tmpDir, slug, nodes) {
  const registryDir = path.join(tmpDir, '.planning', 'ops');
  fs.mkdirSync(registryDir, { recursive: true });
  const registry = {
    areas: [{ slug, name: slug.charAt(0).toUpperCase() + slug.slice(1), source: 'manual', created_at: new Date().toISOString() }]
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

function readHistory(tmpDir, slug) {
  const p = path.join(tmpDir, '.planning', 'ops', slug, 'history.json');
  if (!fs.existsSync(p)) return [];
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

// ─── tree-update: plant simple field ────────────────────────────────────────

describe('ops tree-update', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = createTempProject('ops-tree-update-'); });
  afterEach(() => { cleanup(tmpDir); });

  test('plants a simple field value (JSON array)', () => {
    seedAreaWithTree(tmpDir, 'planilhao', [
      { id: 'component:PlanilhaoGrid', type: 'component', name: 'PlanilhaoGrid', file_path: 'src/PlanilhaoGrid.vue', knowledge: {} }
    ]);

    const endpoints = JSON.stringify(['/api/planilhao', '/api/planilhao/:id']);
    const result = runGsdTools(['ops', 'tree-update', 'planilhao', 'component:PlanilhaoGrid', 'endpoints_called', endpoints, '--raw'], tmpDir);
    assert.ok(result.success, 'should succeed: ' + (result.error || ''));

    const parsed = JSON.parse(result.output);
    assert.strictEqual(parsed.success, true);
    assert.strictEqual(parsed.node_id, 'component:PlanilhaoGrid');
    assert.strictEqual(parsed.field, 'endpoints_called');

    // Verify tree.json was updated
    const tree = readTree(tmpDir, 'planilhao');
    const node = tree.nodes.find(n => n.id === 'component:PlanilhaoGrid');
    assert.deepStrictEqual(node.endpoints_called, ['/api/planilhao', '/api/planilhao/:id']);

    // Verify auto-updated investigation metadata
    assert.ok(node.knowledge.last_investigated, 'should set last_investigated');
    assert.strictEqual(node.knowledge.investigation_count, 1);
  });

  test('plants knowledge sub-field without overwriting existing knowledge', () => {
    seedAreaWithTree(tmpDir, 'planilhao', [
      { id: 'component:PlanilhaoGrid', type: 'component', name: 'PlanilhaoGrid', file_path: 'src/PlanilhaoGrid.vue', knowledge: { existing_key: 'keep_me' } }
    ]);

    // Plant knowledge.framework
    const result1 = runGsdTools(['ops', 'tree-update', 'planilhao', 'component:PlanilhaoGrid', 'knowledge.framework', 'Vue 3', '--raw'], tmpDir);
    assert.ok(result1.success, 'framework should succeed: ' + (result1.error || ''));

    // Plant knowledge.specs_applicable
    const specs = JSON.stringify(['SPEC-001', 'SPEC-002']);
    const result2 = runGsdTools(['ops', 'tree-update', 'planilhao', 'component:PlanilhaoGrid', 'knowledge.specs_applicable', specs, '--raw'], tmpDir);
    assert.ok(result2.success, 'specs should succeed: ' + (result2.error || ''));

    // Verify merge, not overwrite
    const tree = readTree(tmpDir, 'planilhao');
    const node = tree.nodes.find(n => n.id === 'component:PlanilhaoGrid');
    assert.strictEqual(node.knowledge.existing_key, 'keep_me', 'existing key must survive');
    assert.strictEqual(node.knowledge.framework, 'Vue 3');
    assert.deepStrictEqual(node.knowledge.specs_applicable, ['SPEC-001', 'SPEC-002']);
    assert.strictEqual(node.knowledge.investigation_count, 2, 'count should be 2 after two updates');
  });

  test('updates summary field with plain string', () => {
    seedAreaWithTree(tmpDir, 'planilhao', [
      { id: 'component:PlanilhaoGrid', type: 'component', name: 'PlanilhaoGrid', file_path: 'src/PlanilhaoGrid.vue', knowledge: {} }
    ]);

    const result = runGsdTools(['ops', 'tree-update', 'planilhao', 'component:PlanilhaoGrid', 'summary', 'Main grid component for spreadsheet view', '--raw'], tmpDir);
    assert.ok(result.success, 'should succeed: ' + (result.error || ''));

    const tree = readTree(tmpDir, 'planilhao');
    const node = tree.nodes.find(n => n.id === 'component:PlanilhaoGrid');
    assert.strictEqual(node.summary, 'Main grid component for spreadsheet view');

    // Verify history entry
    const history = readHistory(tmpDir, 'planilhao');
    const entry = history.find(h => h.op === 'tree-update');
    assert.ok(entry, 'should have history entry');
    assert.ok(entry.summary.includes('component:PlanilhaoGrid'), 'history should reference node');
  });

  test('fails gracefully for non-existent node', () => {
    seedAreaWithTree(tmpDir, 'planilhao', [
      { id: 'component:PlanilhaoGrid', type: 'component', name: 'PlanilhaoGrid', file_path: 'src/PlanilhaoGrid.vue', knowledge: {} }
    ]);

    const result = runGsdTools(['ops', 'tree-update', 'planilhao', 'component:NonExistent', 'summary', 'test', '--raw'], tmpDir);
    assert.strictEqual(result.success, false, 'should fail for missing node');
    assert.ok(result.error.includes('NonExistent') || result.output.includes('NonExistent'), 'error should mention missing node');
  });
});
