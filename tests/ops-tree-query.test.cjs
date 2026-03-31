/**
 * OPS Tree Query — Unit tests
 *
 * Covers intent-filtered tree queries: CARD_FIELDS, INTENT_FILTERS,
 * filterNodeByIntent, followEdgesForIntent, cmdOpsTreeQuery.
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

function seedTree(tmpDir, slug, tree) {
  const aDir = path.join(tmpDir, '.planning', 'ops', slug);
  fs.mkdirSync(aDir, { recursive: true });
  fs.writeFileSync(path.join(aDir, 'tree.json'), JSON.stringify(tree, null, 2));
}

/**
 * Build the standard 3-node tree used across tests:
 *  - view:PlanilhaoView
 *  - component:PlanilhaoGrid (with css_classes, endpoints_called, knowledge)
 *  - endpoint:prazos-listar (with query, indexes)
 *  Edges: view->component (renders), component->endpoint (calls)
 */
function makeTestTree() {
  return {
    area: 'prazos',
    generated_at: new Date().toISOString(),
    nodes: [
      {
        id: 'view:PlanilhaoView',
        type: 'view',
        file_path: 'src/views/PlanilhaoView.vue',
        name: 'PlanilhaoView',
        summary: 'Main view for planilhao'
      },
      {
        id: 'component:PlanilhaoGrid',
        type: 'component',
        file_path: 'src/components/PlanilhaoGrid.vue',
        name: 'PlanilhaoGrid',
        summary: 'Grid component for planilhao',
        css_classes: ['grid-container', 'planilhao-header'],
        endpoints_called: ['GET /api/prazos'],
        knowledge: ['Renders 500+ rows with virtual scroll'],
        props: ['items', 'loading'],
        emits: ['row-click']
      },
      {
        id: 'endpoint:prazos-listar',
        type: 'endpoint',
        file_path: 'app/Http/Controllers/PrazosController.php',
        name: 'prazos-listar',
        summary: 'List prazos endpoint',
        query: 'SELECT * FROM prazos WHERE ativo = 1',
        indexes: ['idx_prazos_ativo'],
        columns: ['id', 'nome', 'data_prazo']
      }
    ],
    edges: [
      { from: 'view:PlanilhaoView', to: 'component:PlanilhaoGrid', type: 'renders' },
      { from: 'component:PlanilhaoGrid', to: 'endpoint:prazos-listar', type: 'calls' }
    ]
  };
}

// ─── visual intent ─────────────────────────────────────────────────────────

describe('ops tree-query visual intent', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = createTempProject('ops-tree-query-'); });
  afterEach(() => { cleanup(tmpDir); });

  test('visual intent returns css_classes/knowledge but NOT query/indexes', () => {
    const aDir = seedArea(tmpDir, 'prazos');
    seedTree(tmpDir, 'prazos', makeTestTree());

    const result = runGsdTools(
      ['ops', 'tree-query', 'prazos', '--node', 'component:PlanilhaoGrid', '--intent', 'visual', '--raw'],
      tmpDir
    );
    assert.ok(result.success, 'should succeed: ' + (result.error || ''));
    const parsed = JSON.parse(result.output);
    assert.strictEqual(parsed.success, true);
    assert.strictEqual(parsed.intent, 'visual');

    // Find the PlanilhaoGrid node in results
    const gridNode = parsed.nodes.find(n => n.id === 'component:PlanilhaoGrid');
    assert.ok(gridNode, 'grid node should be in results');
    assert.ok(gridNode.css_classes, 'should include css_classes for visual intent');
    assert.ok(gridNode.knowledge, 'should include knowledge for visual intent');
    assert.strictEqual(gridNode.query, undefined, 'should NOT include query for visual intent');
    assert.strictEqual(gridNode.indexes, undefined, 'should NOT include indexes for visual intent');
  });
});

// ─── data intent ───────────────────────────────────────────────────────────

describe('ops tree-query data intent', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = createTempProject('ops-tree-query-'); });
  afterEach(() => { cleanup(tmpDir); });

  test('data intent follows edges to endpoint, returns query/indexes, NOT css_classes', () => {
    seedArea(tmpDir, 'prazos');
    seedTree(tmpDir, 'prazos', makeTestTree());

    const result = runGsdTools(
      ['ops', 'tree-query', 'prazos', '--node', 'component:PlanilhaoGrid', '--intent', 'data', '--raw'],
      tmpDir
    );
    assert.ok(result.success, 'should succeed: ' + (result.error || ''));
    const parsed = JSON.parse(result.output);
    assert.strictEqual(parsed.success, true);
    assert.strictEqual(parsed.intent, 'data');

    // Should have followed edges to endpoint
    const endpointNode = parsed.nodes.find(n => n.id === 'endpoint:prazos-listar');
    assert.ok(endpointNode, 'endpoint node should be included via edge following');
    assert.ok(endpointNode.query, 'should include query for data intent');
    assert.ok(endpointNode.indexes, 'should include indexes for data intent');

    // The starting node should also be included
    const gridNode = parsed.nodes.find(n => n.id === 'component:PlanilhaoGrid');
    assert.ok(gridNode, 'grid node should be in results');
    assert.strictEqual(gridNode.css_classes, undefined, 'should NOT include css_classes for data intent');
    assert.ok(gridNode.endpoints_called, 'should include endpoints_called for data intent');
  });
});

// ─── no intent (card only) ─────────────────────────────────────────────────

describe('ops tree-query no intent (card only)', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = createTempProject('ops-tree-query-'); });
  afterEach(() => { cleanup(tmpDir); });

  test('no intent returns card-only fields', () => {
    seedArea(tmpDir, 'prazos');
    seedTree(tmpDir, 'prazos', makeTestTree());

    const result = runGsdTools(
      ['ops', 'tree-query', 'prazos', '--node', 'component:PlanilhaoGrid', '--raw'],
      tmpDir
    );
    assert.ok(result.success, 'should succeed: ' + (result.error || ''));
    const parsed = JSON.parse(result.output);
    assert.strictEqual(parsed.success, true);

    const gridNode = parsed.nodes.find(n => n.id === 'component:PlanilhaoGrid');
    assert.ok(gridNode, 'grid node should be in results');
    // Card fields should be present
    assert.ok(gridNode.id, 'should have id');
    assert.ok(gridNode.type, 'should have type');
    assert.ok(gridNode.name, 'should have name');
    // Intent-specific fields should NOT be present
    assert.strictEqual(gridNode.css_classes, undefined, 'should NOT include css_classes without intent');
    assert.strictEqual(gridNode.query, undefined, 'should NOT include query without intent');
    assert.strictEqual(gridNode.endpoints_called, undefined, 'should NOT include endpoints_called without intent');
    assert.strictEqual(gridNode.knowledge, undefined, 'should NOT include knowledge without intent');
  });
});

// ─── missing node bail ─────────────────────────────────────────────────────

describe('ops tree-query fast bail', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = createTempProject('ops-tree-query-'); });
  afterEach(() => { cleanup(tmpDir); });

  test('missing node returns fast-bail', () => {
    seedArea(tmpDir, 'prazos');
    seedTree(tmpDir, 'prazos', makeTestTree());

    const result = runGsdTools(
      ['ops', 'tree-query', 'prazos', '--node', 'component:NonExistent', '--raw'],
      tmpDir
    );
    assert.ok(result.success, 'should succeed (bail is not an error): ' + (result.error || ''));
    const parsed = JSON.parse(result.output);
    assert.strictEqual(parsed.success, true);
    assert.strictEqual(parsed.bail, true);
    assert.strictEqual(parsed.missing, 'node');
    assert.strictEqual(parsed.node_id, 'component:NonExistent');
    assert.ok(parsed.action, 'should include action suggestion');
  });

  test('require-field bail when field is undefined (not present)', () => {
    seedArea(tmpDir, 'prazos');
    seedTree(tmpDir, 'prazos', makeTestTree());

    // view:PlanilhaoView has no knowledge field at all
    const result = runGsdTools(
      ['ops', 'tree-query', 'prazos', '--node', 'view:PlanilhaoView', '--require-field', 'knowledge', '--raw'],
      tmpDir
    );
    assert.ok(result.success, 'should succeed (bail is not an error): ' + (result.error || ''));
    const parsed = JSON.parse(result.output);
    assert.strictEqual(parsed.success, true);
    assert.strictEqual(parsed.bail, true);
    assert.strictEqual(parsed.missing, 'field');
    assert.strictEqual(parsed.field, 'knowledge');
  });

  test('require-field does NOT bail when field is empty array', () => {
    seedArea(tmpDir, 'prazos');
    // Add a node with an empty array field
    const tree = makeTestTree();
    tree.nodes[1].slots = []; // PlanilhaoGrid gets empty slots array
    seedTree(tmpDir, 'prazos', tree);

    const result = runGsdTools(
      ['ops', 'tree-query', 'prazos', '--node', 'component:PlanilhaoGrid', '--require-field', 'slots', '--raw'],
      tmpDir
    );
    assert.ok(result.success, 'should succeed: ' + (result.error || ''));
    const parsed = JSON.parse(result.output);
    assert.strictEqual(parsed.success, true);
    assert.strictEqual(parsed.bail, undefined, 'should NOT bail when field exists (even if empty array)');
  });
});
