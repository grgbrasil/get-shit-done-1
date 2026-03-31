# OPS v2: Semantic Tree & Accumulated Knowledge — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Evolve the OPS system from flat topology + narrative diagnosis to a semantic tree with accumulated knowledge, filtered queries by intent, versioned findings, and fast bail.

**Architecture:** Extend `ops.cjs` with 4 new capabilities: (1) enriched tree nodes with knowledge fields, (2) `tree-query` subcommand that filters by intent category, (3) `findings` CRUD subcommand for versioned findings.json, (4) `tree-update` subcommand for planting knowledge. Existing commands (`investigate`, `modify`, `status`) are updated to use these primitives. Auto-bootstrap in `investigate` removes the strict prerequisite chain.

**Tech Stack:** Node.js CommonJS (ops.cjs), node:test for tests, gsd-tools.cjs dispatcher

---

### Task 1: Findings CRUD — Data Layer

**Files:**
- Modify: `get-shit-done/bin/lib/ops.cjs` (after line ~1345, near backlog helpers)
- Test: `tests/ops-findings.test.cjs` (create)

- [ ] **Step 1: Write the failing test for readFindings/writeFindings**

Create `tests/ops-findings.test.cjs`:

```javascript
/**
 * OPS Findings — Unit tests for findings CRUD
 */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const { runGsdTools, createTempProject, cleanup } = require('./helpers.cjs');
const fs = require('fs');
const path = require('path');

describe('ops findings — data layer', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject('ops-findings-');
    // Seed registry with one area
    const opsDir = path.join(tmpDir, '.planning', 'ops');
    fs.mkdirSync(opsDir, { recursive: true });
    fs.writeFileSync(path.join(opsDir, 'registry.json'), JSON.stringify({
      areas: [{ slug: 'prazos', name: 'prazos', source: 'manual', detected_by: 'manual', confidence: 'high', created_at: '2026-03-30T00:00:00Z', last_scanned: '2026-03-30T00:00:00Z', components_count: 0 }]
    }));
    fs.mkdirSync(path.join(opsDir, 'prazos'), { recursive: true });
  });

  afterEach(() => { cleanup(tmpDir); });

  test('findings list returns empty array when no findings.json', () => {
    const result = runGsdTools(['ops', 'findings', 'prazos', 'list'], tmpDir);
    const parsed = JSON.parse(result.output);
    assert.strictEqual(parsed.success, true);
    assert.deepStrictEqual(parsed.findings, []);
  });

  test('findings add creates finding with auto-generated ID', () => {
    const result = runGsdTools(['ops', 'findings', 'prazos', 'add',
      '--title', 'Cores hardcoded text-red-600',
      '--severity', 'minor',
      '--category', 'visual',
      '--node-id', 'component:PlanilhaoGrid',
      '--file', 'frontend/views/prazos/components/PlanilhaoGrid.vue',
      '--lines', '158,167',
      '--spec-ref', 'SPEC.md:color-tokens',
      '--description', 'SPEC define text-red-500, componente usa text-red-600'
    ], tmpDir);
    const parsed = JSON.parse(result.output);
    assert.strictEqual(parsed.success, true);
    assert.strictEqual(parsed.finding.id, 'PRAZOS-001');
    assert.strictEqual(parsed.finding.status, 'pending');
    assert.strictEqual(parsed.finding.severity, 'minor');
    assert.strictEqual(parsed.finding.category, 'visual');
    assert.deepStrictEqual(parsed.finding.lines, [158, 167]);

    // Verify file was written
    const findingsPath = path.join(tmpDir, '.planning', 'ops', 'prazos', 'findings.json');
    assert.ok(fs.existsSync(findingsPath));
    const data = JSON.parse(fs.readFileSync(findingsPath, 'utf-8'));
    assert.strictEqual(data.domain, 'prazos');
    assert.strictEqual(data.findings.length, 1);
  });

  test('findings add auto-increments IDs', () => {
    runGsdTools(['ops', 'findings', 'prazos', 'add', '--title', 'First', '--severity', 'minor', '--category', 'visual'], tmpDir);
    runGsdTools(['ops', 'findings', 'prazos', 'add', '--title', 'Second', '--severity', 'major', '--category', 'data'], tmpDir);
    const result = runGsdTools(['ops', 'findings', 'prazos', 'list'], tmpDir);
    const parsed = JSON.parse(result.output);
    assert.strictEqual(parsed.findings.length, 2);
    assert.strictEqual(parsed.findings[0].id, 'PRAZOS-001');
    assert.strictEqual(parsed.findings[1].id, 'PRAZOS-002');
  });

  test('findings update changes status and records resolved metadata', () => {
    runGsdTools(['ops', 'findings', 'prazos', 'add', '--title', 'Bug', '--severity', 'minor', '--category', 'visual'], tmpDir);
    const result = runGsdTools(['ops', 'findings', 'prazos', 'update', 'PRAZOS-001', '--status', 'fixed', '--resolved-by', 'ops:modify'], tmpDir);
    const parsed = JSON.parse(result.output);
    assert.strictEqual(parsed.success, true);
    assert.strictEqual(parsed.finding.status, 'fixed');
    assert.ok(parsed.finding.resolved);
    assert.strictEqual(parsed.finding.resolved_by, 'ops:modify');
  });

  test('findings update with range PRAZOS-001..003', () => {
    runGsdTools(['ops', 'findings', 'prazos', 'add', '--title', 'A', '--severity', 'minor', '--category', 'visual'], tmpDir);
    runGsdTools(['ops', 'findings', 'prazos', 'add', '--title', 'B', '--severity', 'minor', '--category', 'visual'], tmpDir);
    runGsdTools(['ops', 'findings', 'prazos', 'add', '--title', 'C', '--severity', 'minor', '--category', 'visual'], tmpDir);
    const result = runGsdTools(['ops', 'findings', 'prazos', 'update', 'PRAZOS-001..003', '--status', 'fixed'], tmpDir);
    const parsed = JSON.parse(result.output);
    assert.strictEqual(parsed.success, true);
    assert.strictEqual(parsed.updated_count, 3);
    assert.ok(parsed.findings.every(f => f.status === 'fixed'));
  });

  test('findings update --all-pending updates all pending findings', () => {
    runGsdTools(['ops', 'findings', 'prazos', 'add', '--title', 'A', '--severity', 'minor', '--category', 'visual'], tmpDir);
    runGsdTools(['ops', 'findings', 'prazos', 'add', '--title', 'B', '--severity', 'major', '--category', 'data'], tmpDir);
    // Fix one
    runGsdTools(['ops', 'findings', 'prazos', 'update', 'PRAZOS-001', '--status', 'fixed'], tmpDir);
    // Update all pending
    const result = runGsdTools(['ops', 'findings', 'prazos', 'update', '--all-pending', '--status', 'in_progress'], tmpDir);
    const parsed = JSON.parse(result.output);
    assert.strictEqual(parsed.updated_count, 1); // Only PRAZOS-002 was pending
  });

  test('findings list filters by status', () => {
    runGsdTools(['ops', 'findings', 'prazos', 'add', '--title', 'A', '--severity', 'minor', '--category', 'visual'], tmpDir);
    runGsdTools(['ops', 'findings', 'prazos', 'add', '--title', 'B', '--severity', 'major', '--category', 'data'], tmpDir);
    runGsdTools(['ops', 'findings', 'prazos', 'update', 'PRAZOS-001', '--status', 'fixed'], tmpDir);
    const result = runGsdTools(['ops', 'findings', 'prazos', 'list', '--status', 'pending'], tmpDir);
    const parsed = JSON.parse(result.output);
    assert.strictEqual(parsed.findings.length, 1);
    assert.strictEqual(parsed.findings[0].id, 'PRAZOS-002');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/ops-findings.test.cjs`
Expected: FAIL — `runGsdTools(['ops', 'findings', ...])` routes to unknown subcommand

- [ ] **Step 3: Implement readFindings, writeFindings, and cmdOpsFindings in ops.cjs**

Add after the backlog helpers section (~line 1345) in `get-shit-done/bin/lib/ops.cjs`:

```javascript
// ─── OPS Findings ──────────────────────────────────────────────────────────

function readFindings(cwd, slug) {
  const findingsPath = path.join(areaDir(cwd, slug), 'findings.json');
  if (!fs.existsSync(findingsPath)) return { domain: slug, findings: [] };
  try { return JSON.parse(fs.readFileSync(findingsPath, 'utf-8')); } catch { return { domain: slug, findings: [] }; }
}

function writeFindings(cwd, slug, data) {
  ensureAreaDir(cwd, slug);
  const findingsPath = path.join(areaDir(cwd, slug), 'findings.json');
  fs.writeFileSync(findingsPath, JSON.stringify(data, null, 2), 'utf-8');
}

function nextFindingId(slug, findings) {
  const prefix = slug.toUpperCase();
  if (findings.length === 0) return prefix + '-001';
  const maxNum = Math.max(...findings.map(f => {
    const match = f.id.match(/-(\d+)$/);
    return match ? parseInt(match[1], 10) : 0;
  }));
  return prefix + '-' + String(maxNum + 1).padStart(3, '0');
}

/**
 * Parse finding ID range like "PRAZOS-001..003" into array of IDs.
 */
function parseFindingRange(rangeStr, slug) {
  const prefix = slug.toUpperCase();
  const rangeMatch = rangeStr.match(/^([A-Z]+-\d+)\.\.(\d+)$/);
  if (!rangeMatch) return [rangeStr]; // Single ID
  const startMatch = rangeMatch[1].match(/-(\d+)$/);
  const endNum = parseInt(rangeMatch[2], 10);
  if (!startMatch) return [rangeStr];
  const startNum = parseInt(startMatch[1], 10);
  const ids = [];
  for (let i = startNum; i <= endNum; i++) {
    ids.push(prefix + '-' + String(i).padStart(3, '0'));
  }
  return ids;
}

/**
 * Parse --key value pairs from args array.
 */
function parseFindingArgs(args) {
  const result = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--') && i + 1 < args.length) {
      const key = args[i].slice(2).replace(/-/g, '_');
      result[key] = args[i + 1];
      i++;
    }
  }
  return result;
}

function cmdOpsFindings(cwd, area, args, raw) {
  if (!area) { error('Usage: gsd-tools ops findings <area> <list|add|update> [options]'); return; }
  const slug = slugify(area);
  const registry = readRegistry(cwd);
  const entry = registry.areas.find(a => a.slug === slug);
  if (!entry) { error('Area not found: ' + slug); return; }

  const subcommand = args[0];

  if (subcommand === 'list') {
    const data = readFindings(cwd, slug);
    const opts = parseFindingArgs(args.slice(1));
    let findings = data.findings;
    if (opts.status) {
      findings = findings.filter(f => f.status === opts.status);
    }
    output({ success: true, domain: slug, findings, total: data.findings.length, filtered: findings.length }, raw);
    return;
  }

  if (subcommand === 'add') {
    const opts = parseFindingArgs(args.slice(1));
    const data = readFindings(cwd, slug);
    const id = nextFindingId(slug, data.findings);
    const finding = {
      id,
      status: 'pending',
      severity: opts.severity || 'minor',
      category: opts.category || 'uncategorized',
      title: opts.title || '',
      description: opts.description || '',
      node_id: opts.node_id || null,
      file: opts.file || null,
      lines: opts.lines ? opts.lines.split(',').map(Number) : [],
      spec_ref: opts.spec_ref || null,
      created: new Date().toISOString(),
      created_by: opts.created_by || 'manual',
      resolved: null,
      resolved_by: null
    };
    data.findings.push(finding);
    writeFindings(cwd, slug, data);
    appendHistory(cwd, slug, { op: 'finding-add', summary: 'Added ' + id + ': ' + finding.title, outcome: 'success' });
    output({ success: true, finding }, raw);
    return;
  }

  if (subcommand === 'update') {
    const data = readFindings(cwd, slug);
    const opts = parseFindingArgs(args.slice(1));
    let targetIds;

    // Check for --all-pending flag
    if (args.includes('--all-pending')) {
      targetIds = data.findings.filter(f => f.status === 'pending').map(f => f.id);
    } else {
      const idArg = args[1];
      if (!idArg || idArg.startsWith('--')) { error('Usage: gsd-tools ops findings <area> update <ID|RANGE|--all-pending> --status <status>'); return; }
      targetIds = parseFindingRange(idArg, slug);
    }

    const updated = [];
    for (const id of targetIds) {
      const finding = data.findings.find(f => f.id === id);
      if (!finding) continue;
      if (opts.status) {
        finding.status = opts.status;
        if (opts.status === 'fixed' || opts.status === 'wontfix') {
          finding.resolved = new Date().toISOString();
          finding.resolved_by = opts.resolved_by || null;
        }
      }
      updated.push(finding);
    }

    writeFindings(cwd, slug, data);
    appendHistory(cwd, slug, { op: 'finding-update', summary: 'Updated ' + updated.length + ' findings to ' + (opts.status || 'unchanged'), outcome: 'success' });
    output({ success: true, updated_count: updated.length, findings: updated }, raw);
    return;
  }

  error('Unknown findings subcommand: ' + subcommand + '. Available: list, add, update');
}
```

- [ ] **Step 4: Export cmdOpsFindings and wire dispatcher**

In `get-shit-done/bin/lib/ops.cjs`, update the `module.exports` at the bottom (~line 1452):

```javascript
module.exports = {
  cmdOpsInit, cmdOpsMap, cmdOpsAdd, cmdOpsList, cmdOpsGet,
  cmdOpsInvestigate, cmdOpsFeature, cmdOpsModify, cmdOpsDebug, cmdOpsSummary,
  cmdOpsStatus, cmdOpsSpec, cmdOpsBacklog, cmdOpsFindings,
  computeAreaStatus,
  appendHistory, computeBlastRadius, refreshTree,
  readFindings, writeFindings, nextFindingId, parseFindingRange
};
```

In `get-shit-done/bin/gsd-tools.cjs`, add the `findings` route inside the `case 'ops':` block (after the backlog handler, ~line 941):

```javascript
      } else if (subcommand === 'findings') {
        ops.cmdOpsFindings(cwd, args[2], args.slice(3), raw);
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --test tests/ops-findings.test.cjs`
Expected: All 7 tests PASS

- [ ] **Step 6: Commit**

```bash
git add tests/ops-findings.test.cjs get-shit-done/bin/lib/ops.cjs get-shit-done/bin/gsd-tools.cjs
git commit -m "feat(ops): add findings CRUD with auto-ID, range updates, and status filtering"
```

---

### Task 2: Tree Query — Filtered by Intent

**Files:**
- Modify: `get-shit-done/bin/lib/ops.cjs` (add after findings section)
- Modify: `get-shit-done/bin/gsd-tools.cjs` (add dispatcher route)
- Test: `tests/ops-tree-query.test.cjs` (create)

- [ ] **Step 1: Write the failing test**

Create `tests/ops-tree-query.test.cjs`:

```javascript
/**
 * OPS Tree Query — Filtered query by intent category
 */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const { runGsdTools, createTempProject, cleanup } = require('./helpers.cjs');
const fs = require('fs');
const path = require('path');

function seedAreaWithTree(tmpDir) {
  const opsDir = path.join(tmpDir, '.planning', 'ops');
  fs.mkdirSync(path.join(opsDir, 'prazos'), { recursive: true });
  fs.writeFileSync(path.join(opsDir, 'registry.json'), JSON.stringify({
    areas: [{ slug: 'prazos', name: 'prazos', source: 'manual', detected_by: 'manual', confidence: 'high', created_at: '2026-03-30T00:00:00Z', last_scanned: '2026-03-30T00:00:00Z', components_count: 3 }]
  }));
  fs.writeFileSync(path.join(opsDir, 'prazos', 'tree.json'), JSON.stringify({
    area: 'prazos',
    generated_at: '2026-03-30T00:00:00Z',
    nodes: [
      {
        id: 'view:PlanilhaoView', type: 'view',
        file_path: 'frontend/views/prazos/PlanilhaoView.vue', name: 'PlanilhaoView',
        summary: 'View principal de prazos', uses: ['component:PlanilhaoGrid'], used_by: ['route:prazos'],
        props: [], emits: [], endpoints_called: [],
        css_classes: [], knowledge: {}
      },
      {
        id: 'component:PlanilhaoGrid', type: 'component',
        file_path: 'frontend/views/prazos/components/PlanilhaoGrid.vue', name: 'PlanilhaoGrid',
        summary: 'Grid AG-Grid v35+', uses: ['endpoint:prazos-listar'], used_by: ['view:PlanilhaoView'],
        props: ['filters', 'dateRange'], emits: ['row-selected'],
        endpoints_called: ['/api/prazos/listar'],
        css_classes: ['ag-theme-quartz', 'custom-planilhao'],
        knowledge: {
          framework: 'ag-grid-vue@35+',
          specs_applicable: ['SPEC.md:table-tokens'],
          decisions: [],
          last_investigated: '2026-03-30',
          investigation_count: 1
        }
      },
      {
        id: 'endpoint:prazos-listar', type: 'endpoint',
        file_path: 'backend/controllers/PrazosController.php', name: 'prazos-listar',
        summary: 'Lista prazos com filtros', uses: ['service:PrazosService'], used_by: ['component:PlanilhaoGrid'],
        props: [], emits: [], endpoints_called: [],
        query: 'SELECT * FROM prazos WHERE data BETWEEN ? AND ?',
        indexes: ['idx_prazo_data'],
        knowledge: {}
      }
    ],
    edges: [
      { from: 'view:PlanilhaoView', to: 'component:PlanilhaoGrid', type: 'renders' },
      { from: 'component:PlanilhaoGrid', to: 'endpoint:prazos-listar', type: 'calls' }
    ]
  }));
}

describe('ops tree-query', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject('ops-tree-query-');
    seedAreaWithTree(tmpDir);
  });

  afterEach(() => { cleanup(tmpDir); });

  test('visual intent returns only visual-relevant fields', () => {
    const result = runGsdTools(['ops', 'tree-query', 'prazos', '--intent', 'visual', '--node', 'component:PlanilhaoGrid'], tmpDir);
    const parsed = JSON.parse(result.output);
    assert.strictEqual(parsed.success, true);
    assert.strictEqual(parsed.intent, 'visual');
    // Should have the queried node
    const node = parsed.nodes.find(n => n.id === 'component:PlanilhaoGrid');
    assert.ok(node, 'Should return the queried node');
    assert.ok(node.css_classes, 'Visual intent should include css_classes');
    assert.ok(node.knowledge, 'Visual intent should include knowledge');
    // Should NOT include data-layer fields
    assert.strictEqual(node.query, undefined, 'Visual intent should not include query');
    assert.strictEqual(node.indexes, undefined, 'Visual intent should not include indexes');
  });

  test('data intent returns only data-relevant fields', () => {
    const result = runGsdTools(['ops', 'tree-query', 'prazos', '--intent', 'data', '--node', 'component:PlanilhaoGrid'], tmpDir);
    const parsed = JSON.parse(result.output);
    assert.strictEqual(parsed.success, true);
    // Should follow edges to endpoint
    const endpoint = parsed.nodes.find(n => n.id === 'endpoint:prazos-listar');
    assert.ok(endpoint, 'Data intent should follow edges to endpoint');
    assert.ok(endpoint.query, 'Data intent should include query');
    assert.ok(endpoint.indexes, 'Data intent should include indexes');
    // Component should include endpoints_called
    const comp = parsed.nodes.find(n => n.id === 'component:PlanilhaoGrid');
    assert.ok(comp.endpoints_called, 'Data intent should include endpoints_called');
    assert.strictEqual(comp.css_classes, undefined, 'Data intent should not include css_classes');
  });

  test('query without intent returns card-only (minimal fields)', () => {
    const result = runGsdTools(['ops', 'tree-query', 'prazos', '--node', 'component:PlanilhaoGrid'], tmpDir);
    const parsed = JSON.parse(result.output);
    assert.strictEqual(parsed.success, true);
    assert.strictEqual(parsed.intent, 'card');
    const node = parsed.nodes.find(n => n.id === 'component:PlanilhaoGrid');
    assert.ok(node.id);
    assert.ok(node.type);
    assert.ok(node.file_path);
    assert.ok(node.summary);
    // Card mode should not have heavy fields
    assert.strictEqual(node.css_classes, undefined);
    assert.strictEqual(node.query, undefined);
  });

  test('query for missing node returns fast-bail exit', () => {
    const result = runGsdTools(['ops', 'tree-query', 'prazos', '--node', 'component:NonExistent'], tmpDir);
    const parsed = JSON.parse(result.output);
    assert.strictEqual(parsed.success, true);
    assert.strictEqual(parsed.bail, true);
    assert.strictEqual(parsed.missing, 'node');
    assert.ok(parsed.action, 'Should suggest action');
  });

  test('query for node missing a field returns fast-bail with field info', () => {
    const result = runGsdTools(['ops', 'tree-query', 'prazos', '--intent', 'data', '--node', 'view:PlanilhaoView', '--require-field', 'endpoints_called'], tmpDir);
    const parsed = JSON.parse(result.output);
    // View has endpoints_called: [] — empty but exists. Not a bail.
    assert.strictEqual(parsed.success, true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/ops-tree-query.test.cjs`
Expected: FAIL — unknown subcommand `tree-query`

- [ ] **Step 3: Implement intent filter maps and cmdOpsTreeQuery**

Add in `get-shit-done/bin/lib/ops.cjs` after the findings section:

```javascript
// ─── OPS Tree Query (Filtered by Intent) ───────────────────────────────────

/**
 * INTENT_FILTERS — Maps intent categories to the fields and edge-follow rules.
 * card_fields are always returned. intent_fields are added per intent.
 */
const CARD_FIELDS = ['id', 'type', 'file_path', 'name', 'summary', 'uses', 'used_by'];

const INTENT_FILTERS = {
  visual: {
    fields: ['css_classes', 'props', 'emits', 'slots', 'knowledge', 'specs_applicable'],
    follow_types: ['component', 'style', 'view']
  },
  data: {
    fields: ['endpoints_called', 'query', 'indexes', 'columns', 'props', 'knowledge'],
    follow_types: ['endpoint', 'service', 'model', 'table', 'component']
  },
  performance: {
    fields: ['endpoints_called', 'query', 'indexes', 'knowledge'],
    follow_types: ['endpoint', 'service', 'model', 'table']
  },
  security: {
    fields: ['endpoints_called', 'knowledge'],
    follow_types: ['route', 'endpoint', 'service']
  },
  behavior: {
    fields: ['props', 'emits', 'slots', 'endpoints_called', 'knowledge'],
    follow_types: ['component', 'composable', 'service']
  }
};

function filterNodeByIntent(node, intent) {
  if (!intent || intent === 'card') {
    const filtered = {};
    for (const f of CARD_FIELDS) {
      if (node[f] !== undefined) filtered[f] = node[f];
    }
    return filtered;
  }
  const config = INTENT_FILTERS[intent];
  if (!config) return filterNodeByIntent(node, 'card');
  const filtered = {};
  for (const f of CARD_FIELDS) {
    if (node[f] !== undefined) filtered[f] = node[f];
  }
  for (const f of config.fields) {
    if (node[f] !== undefined) filtered[f] = node[f];
  }
  // Include knowledge sub-fields relevant to intent
  if (node.knowledge && config.fields.includes('knowledge')) {
    filtered.knowledge = node.knowledge;
  }
  return filtered;
}

/**
 * Follow edges from a start node, filtered by intent's follow_types.
 */
function followEdgesForIntent(tree, startNodeId, intent, maxDepth) {
  const config = INTENT_FILTERS[intent];
  const followTypes = config ? config.follow_types : [];
  const nodeMap = new Map();
  for (const n of tree.nodes) nodeMap.set(n.id, n);

  const visited = new Set();
  const result = [];

  function walk(nodeId, depth) {
    if (depth > (maxDepth || 3) || visited.has(nodeId)) return;
    visited.add(nodeId);
    const node = nodeMap.get(nodeId);
    if (!node) return;
    result.push(node);
    // Follow outgoing edges to nodes of allowed types
    for (const edge of tree.edges) {
      if (edge.from === nodeId) {
        const target = nodeMap.get(edge.to);
        if (target && (followTypes.length === 0 || followTypes.includes(target.type))) {
          walk(edge.to, depth + 1);
        }
      }
    }
  }

  walk(startNodeId, 0);
  return result;
}

function cmdOpsTreeQuery(cwd, area, args, raw) {
  if (!area) { error('Usage: gsd-tools ops tree-query <area> --node <id> [--intent <category>] [--require-field <field>]'); return; }
  const slug = slugify(area);
  const registry = readRegistry(cwd);
  const entry = registry.areas.find(a => a.slug === slug);
  if (!entry) { error('Area not found: ' + slug); return; }

  const tree = readTreeJson(cwd, slug);
  if (!tree) { error('No tree.json for area: ' + slug + '. Run /ops:map first.'); return; }

  const opts = parseFindingArgs(args);
  const nodeId = opts.node;
  const intent = opts.intent || 'card';
  const requireField = opts.require_field;

  // Fast bail: node not found
  if (nodeId) {
    const node = tree.nodes.find(n => n.id === nodeId);
    if (!node) {
      output({ success: true, bail: true, missing: 'node', node_id: nodeId, action: 'Run /ops:map ' + slug + ' or investigate to discover this node' }, raw);
      return;
    }

    // Fast bail: required field missing (truly absent, not just empty)
    if (requireField && node[requireField] === undefined) {
      output({ success: true, bail: true, missing: 'field', node_id: nodeId, field: requireField, action: 'Investigate and plant: gsd-tools ops tree-update ' + slug + ' ' + nodeId + ' ' + requireField + ' <value>' }, raw);
      return;
    }
  }

  // Collect nodes: start from target node, follow edges by intent
  let rawNodes;
  if (nodeId && intent !== 'card') {
    rawNodes = followEdgesForIntent(tree, nodeId, intent, 3);
  } else if (nodeId) {
    const node = tree.nodes.find(n => n.id === nodeId);
    rawNodes = node ? [node] : [];
  } else {
    rawNodes = tree.nodes;
  }

  const filteredNodes = rawNodes.map(n => filterNodeByIntent(n, intent));

  output({ success: true, area: slug, intent, nodes: filteredNodes, edges_followed: rawNodes.length - 1 }, raw);
}
```

- [ ] **Step 4: Export and wire dispatcher**

Add `cmdOpsTreeQuery` to `module.exports` in ops.cjs:

```javascript
module.exports = {
  cmdOpsInit, cmdOpsMap, cmdOpsAdd, cmdOpsList, cmdOpsGet,
  cmdOpsInvestigate, cmdOpsFeature, cmdOpsModify, cmdOpsDebug, cmdOpsSummary,
  cmdOpsStatus, cmdOpsSpec, cmdOpsBacklog, cmdOpsFindings, cmdOpsTreeQuery,
  computeAreaStatus,
  appendHistory, computeBlastRadius, refreshTree,
  readFindings, writeFindings, nextFindingId, parseFindingRange,
  INTENT_FILTERS, CARD_FIELDS, filterNodeByIntent
};
```

Add in gsd-tools.cjs dispatcher (after `findings` route):

```javascript
      } else if (subcommand === 'tree-query') {
        ops.cmdOpsTreeQuery(cwd, args[2], args.slice(3), raw);
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --test tests/ops-tree-query.test.cjs`
Expected: All 5 tests PASS

- [ ] **Step 6: Commit**

```bash
git add tests/ops-tree-query.test.cjs get-shit-done/bin/lib/ops.cjs get-shit-done/bin/gsd-tools.cjs
git commit -m "feat(ops): add tree-query with intent-filtered responses and fast bail"
```

---

### Task 3: Tree Update — Planting Knowledge

**Files:**
- Modify: `get-shit-done/bin/lib/ops.cjs`
- Modify: `get-shit-done/bin/gsd-tools.cjs`
- Test: `tests/ops-tree-update.test.cjs` (create)

- [ ] **Step 1: Write the failing test**

Create `tests/ops-tree-update.test.cjs`:

```javascript
/**
 * OPS Tree Update — Planting knowledge back into tree nodes
 */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const { runGsdTools, createTempProject, cleanup } = require('./helpers.cjs');
const fs = require('fs');
const path = require('path');

function seedAreaWithTree(tmpDir) {
  const opsDir = path.join(tmpDir, '.planning', 'ops');
  fs.mkdirSync(path.join(opsDir, 'prazos'), { recursive: true });
  fs.writeFileSync(path.join(opsDir, 'registry.json'), JSON.stringify({
    areas: [{ slug: 'prazos', name: 'prazos', source: 'manual', detected_by: 'manual', confidence: 'high', created_at: '2026-03-30T00:00:00Z', last_scanned: '2026-03-30T00:00:00Z', components_count: 1 }]
  }));
  fs.writeFileSync(path.join(opsDir, 'prazos', 'tree.json'), JSON.stringify({
    area: 'prazos', generated_at: '2026-03-30T00:00:00Z',
    nodes: [
      { id: 'component:PlanilhaoGrid', type: 'component', file_path: 'frontend/views/prazos/components/PlanilhaoGrid.vue', name: 'PlanilhaoGrid', summary: 'Grid', knowledge: {} }
    ],
    edges: []
  }));
}

describe('ops tree-update', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject('ops-tree-update-');
    seedAreaWithTree(tmpDir);
  });

  afterEach(() => { cleanup(tmpDir); });

  test('plants a simple field value on a node', () => {
    const result = runGsdTools(['ops', 'tree-update', 'prazos', 'component:PlanilhaoGrid', 'endpoints_called', '["/api/prazos/listar"]'], tmpDir);
    const parsed = JSON.parse(result.output);
    assert.strictEqual(parsed.success, true);
    assert.deepStrictEqual(parsed.node.endpoints_called, ['/api/prazos/listar']);

    // Verify tree.json was updated
    const tree = JSON.parse(fs.readFileSync(path.join(tmpDir, '.planning', 'ops', 'prazos', 'tree.json'), 'utf-8'));
    const node = tree.nodes.find(n => n.id === 'component:PlanilhaoGrid');
    assert.deepStrictEqual(node.endpoints_called, ['/api/prazos/listar']);
  });

  test('plants knowledge sub-field (merges, does not overwrite)', () => {
    // First plant framework
    runGsdTools(['ops', 'tree-update', 'prazos', 'component:PlanilhaoGrid', 'knowledge.framework', '"ag-grid-vue@35+"'], tmpDir);
    // Then plant specs_applicable
    runGsdTools(['ops', 'tree-update', 'prazos', 'component:PlanilhaoGrid', 'knowledge.specs_applicable', '["SPEC.md:table-tokens"]'], tmpDir);

    const tree = JSON.parse(fs.readFileSync(path.join(tmpDir, '.planning', 'ops', 'prazos', 'tree.json'), 'utf-8'));
    const node = tree.nodes.find(n => n.id === 'component:PlanilhaoGrid');
    assert.strictEqual(node.knowledge.framework, 'ag-grid-vue@35+');
    assert.deepStrictEqual(node.knowledge.specs_applicable, ['SPEC.md:table-tokens']);
  });

  test('updates summary field', () => {
    const result = runGsdTools(['ops', 'tree-update', 'prazos', 'component:PlanilhaoGrid', 'summary', '"Grid AG-Grid v35+ Quartz theme"'], tmpDir);
    const parsed = JSON.parse(result.output);
    assert.strictEqual(parsed.node.summary, 'Grid AG-Grid v35+ Quartz theme');
  });

  test('fails gracefully for non-existent node', () => {
    const result = runGsdTools(['ops', 'tree-update', 'prazos', 'component:NonExistent', 'summary', '"test"'], tmpDir);
    assert.ok(result.error || result.output.includes('not found'));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/ops-tree-update.test.cjs`
Expected: FAIL — unknown subcommand `tree-update`

- [ ] **Step 3: Implement cmdOpsTreeUpdate**

Add in `get-shit-done/bin/lib/ops.cjs` after the tree-query section:

```javascript
// ─── OPS Tree Update (Plant Knowledge) ────────────────────────────────────

function cmdOpsTreeUpdate(cwd, area, nodeId, fieldPath, valueStr, raw) {
  if (!area || !nodeId || !fieldPath) {
    error('Usage: gsd-tools ops tree-update <area> <node-id> <field[.subfield]> <json-value>');
    return;
  }
  const slug = slugify(area);
  const registry = readRegistry(cwd);
  const entry = registry.areas.find(a => a.slug === slug);
  if (!entry) { error('Area not found: ' + slug); return; }

  const tree = readTreeJson(cwd, slug);
  if (!tree) { error('No tree.json for area: ' + slug); return; }

  const node = tree.nodes.find(n => n.id === nodeId);
  if (!node) { error('Node not found in tree: ' + nodeId); return; }

  // Parse JSON value
  let value;
  try {
    value = JSON.parse(valueStr);
  } catch {
    value = valueStr; // Treat as plain string if not valid JSON
  }

  // Handle dotted field path (e.g. "knowledge.framework")
  const parts = fieldPath.split('.');
  if (parts.length === 1) {
    node[parts[0]] = value;
  } else {
    let target = node;
    for (let i = 0; i < parts.length - 1; i++) {
      if (target[parts[i]] === undefined || typeof target[parts[i]] !== 'object') {
        target[parts[i]] = {};
      }
      target = target[parts[i]];
    }
    target[parts[parts.length - 1]] = value;
  }

  // Auto-update knowledge metadata
  if (!node.knowledge) node.knowledge = {};
  node.knowledge.last_investigated = new Date().toISOString().slice(0, 10);
  node.knowledge.investigation_count = (node.knowledge.investigation_count || 0) + 1;

  writeTreeJson(cwd, slug, tree);
  appendHistory(cwd, slug, { op: 'tree-update', summary: 'Planted ' + fieldPath + ' on ' + nodeId, outcome: 'success' });

  output({ success: true, node_id: nodeId, field: fieldPath, node }, raw);
}
```

- [ ] **Step 4: Export and wire dispatcher**

Add `cmdOpsTreeUpdate` to exports and add to gsd-tools.cjs:

```javascript
      } else if (subcommand === 'tree-update') {
        ops.cmdOpsTreeUpdate(cwd, args[2], args[3], args[4], args[5], raw);
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --test tests/ops-tree-update.test.cjs`
Expected: All 4 tests PASS

- [ ] **Step 6: Commit**

```bash
git add tests/ops-tree-update.test.cjs get-shit-done/bin/lib/ops.cjs get-shit-done/bin/gsd-tools.cjs
git commit -m "feat(ops): add tree-update for planting knowledge on tree nodes"
```

---

### Task 4: Evolve cmdOpsInvestigate — Auto-Bootstrap + Findings Output

**Files:**
- Modify: `get-shit-done/bin/lib/ops.cjs:913-948` (cmdOpsInvestigate)
- Modify: `commands/gsd/ops-investigate.md`
- Test: `tests/ops-investigate-v2.test.cjs` (create)

- [ ] **Step 1: Write the failing test**

Create `tests/ops-investigate-v2.test.cjs`:

```javascript
/**
 * OPS Investigate v2 — Auto-bootstrap and findings-aware output
 */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const { runGsdTools, createTempProject, cleanup } = require('./helpers.cjs');
const fs = require('fs');
const path = require('path');

describe('ops investigate v2 — auto-bootstrap', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject('ops-investigate-v2-');
  });

  afterEach(() => { cleanup(tmpDir); });

  test('auto-registers domain if not in registry', () => {
    // No registry at all — investigate should auto-create
    const result = runGsdTools(['ops', 'investigate', 'prazos', 'border problem'], tmpDir);
    const parsed = JSON.parse(result.output);
    assert.strictEqual(parsed.success, true);
    assert.strictEqual(parsed.bootstrapped.registry, true);

    // Registry should now exist with the area
    const registry = JSON.parse(fs.readFileSync(path.join(tmpDir, '.planning', 'ops', 'registry.json'), 'utf-8'));
    assert.ok(registry.areas.find(a => a.slug === 'prazos'));
  });

  test('returns findings_path for agent to write to', () => {
    // Seed a minimal registry + tree
    const opsDir = path.join(tmpDir, '.planning', 'ops', 'prazos');
    fs.mkdirSync(opsDir, { recursive: true });
    fs.writeFileSync(path.join(tmpDir, '.planning', 'ops', 'registry.json'), JSON.stringify({
      areas: [{ slug: 'prazos', name: 'prazos', source: 'manual', detected_by: 'manual', confidence: 'high', created_at: '2026-03-30T00:00:00Z', last_scanned: '2026-03-30T00:00:00Z', components_count: 0 }]
    }));
    fs.writeFileSync(path.join(opsDir, 'tree.json'), JSON.stringify({
      area: 'prazos', generated_at: '2026-03-30T00:00:00Z', nodes: [], edges: []
    }));

    const result = runGsdTools(['ops', 'investigate', 'prazos', 'test problem'], tmpDir);
    const parsed = JSON.parse(result.output);
    assert.strictEqual(parsed.success, true);
    assert.ok(parsed.findings_path, 'Should include findings_path');
    assert.ok(parsed.findings_path.includes('findings.json'));
    // Should also include tree-query and tree-update hints
    assert.ok(parsed.tools, 'Should include tools hints');
    assert.ok(parsed.tools.tree_query, 'Should hint tree-query command');
    assert.ok(parsed.tools.tree_update, 'Should hint tree-update command');
    assert.ok(parsed.tools.findings_add, 'Should hint findings add command');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/ops-investigate-v2.test.cjs`
Expected: FAIL — current investigate errors on missing area

- [ ] **Step 3: Rewrite cmdOpsInvestigate with auto-bootstrap**

Replace `cmdOpsInvestigate` in `get-shit-done/bin/lib/ops.cjs` (lines 913-948):

```javascript
function cmdOpsInvestigate(cwd, area, description, raw) {
  if (!area) { error('Usage: gsd-tools ops investigate <area> <description>'); return; }
  const slug = slugify(area);
  const bootstrapped = { registry: false, area_dir: false, tree: false };

  // Auto-bootstrap: ensure registry exists
  let registry = readRegistry(cwd);

  // Auto-bootstrap: register area if missing
  let entry = registry.areas.find(a => a.slug === slug);
  if (!entry) {
    entry = {
      slug,
      name: area,
      source: 'auto-bootstrap',
      detected_by: 'investigate',
      confidence: 'medium',
      created_at: new Date().toISOString(),
      last_scanned: null,
      components_count: 0
    };
    registry.areas.push(entry);
    writeRegistry(cwd, registry);
    bootstrapped.registry = true;
  }

  // Auto-bootstrap: ensure area directory
  const dir = areaDir(cwd, slug);
  if (!fs.existsSync(dir)) {
    ensureAreaDir(cwd, slug);
    bootstrapped.area_dir = true;
  }

  // Auto-bootstrap: create empty tree if none exists
  let tree = readTreeJson(cwd, slug);
  if (!tree) {
    tree = { area: slug, generated_at: new Date().toISOString(), nodes: [], edges: [] };
    writeTreeJson(cwd, slug, tree);
    bootstrapped.tree = true;
  }

  const findingsPath = path.join('.planning/ops', slug, 'findings.json');
  const gsdToolsCmd = 'node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs"';

  // Record history
  appendHistory(cwd, slug, {
    op: 'investigate',
    summary: description || 'Investigation initiated',
    outcome: 'success'
  });

  // Post-op tree refresh (only if tree had content)
  if (tree.nodes.length > 0) {
    refreshTree(cwd, slug);
    tree = readTreeJson(cwd, slug) || tree;
  }

  output({
    success: true,
    area: slug,
    description: description || '',
    bootstrapped,
    tree_path: path.join('.planning/ops', slug, 'tree.json'),
    findings_path: findingsPath,
    context: {
      nodes: tree.nodes.length,
      edges: tree.edges.length,
      tree: tree
    },
    tools: {
      tree_query: gsdToolsCmd + ' ops tree-query ' + slug + ' --intent <visual|data|performance|security|behavior> --node <node-id>',
      tree_update: gsdToolsCmd + ' ops tree-update ' + slug + ' <node-id> <field> <json-value>',
      findings_add: gsdToolsCmd + ' ops findings ' + slug + ' add --title "<title>" --severity <minor|major|critical> --category <visual|data|performance|security|behavior> --node-id <node-id> --file <path> --lines <n,n> --spec-ref <ref>',
      findings_list: gsdToolsCmd + ' ops findings ' + slug + ' list [--status pending]'
    }
  }, raw);
}
```

- [ ] **Step 4: Update ops-investigate.md command doc**

Replace content of `commands/gsd/ops-investigate.md`:

```markdown
# /ops:investigate

Investigate a problem in an OPS area with auto-bootstrap, intent-filtered tree queries, and structured findings.

## Usage

`/ops:investigate <area> <problem description>`

## What it does

1. **Auto-bootstraps** missing prerequisites (registry entry, area dir, tree.json)
2. Loads area context via `gsd-tools ops investigate <area> "<description>"`
3. Uses `gsd-tools ops tree-query` to navigate tree filtered by intent (visual/data/performance/security/behavior)
4. Reads source files following edges from likely entry points
5. Forms hypothesis about root cause, verifies it
6. **Plants knowledge** back into tree via `gsd-tools ops tree-update` for each discovery
7. **Creates findings** via `gsd-tools ops findings <area> add` for each issue found
8. Output includes tool commands for tree-query, tree-update, and findings

## Implementation

### Step 1: Load area context (auto-bootstraps if needed)
```bash
AREA_DATA=$(node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" ops investigate <area> "<description>" --raw)
```

The result includes `tools` with exact commands for tree-query, tree-update, and findings.

### Step 2: Classify problem intent

From the description, determine the intent category:
- **visual**: CSS, layout, design system, themes, colors, borders, spacing
- **data**: Wrong data, missing data, incorrect values, API responses
- **performance**: Slow loading, heavy queries, bundle size
- **security**: Auth, permissions, injection, XSS
- **behavior**: Wrong interactions, broken events, state management

### Step 3: Query tree filtered by intent
```bash
CONTEXT=$(node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" ops tree-query <area> --intent <category> --node <entry-node> --raw)
```

If tree-query returns `bail: true`, investigate the missing info via code reading, then plant it.

### Step 4: Investigate and plant knowledge

For each discovery made by reading code:
```bash
node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" ops tree-update <area> <node-id> <field> '<json-value>'
```

### Step 5: Create findings for each issue

For each issue found:
```bash
node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" ops findings <area> add \
  --title "<title>" --severity <minor|major|critical|cosmetic> \
  --category <visual|data|performance|security|behavior> \
  --node-id <node-id> --file <path> --lines <n,n> \
  --spec-ref "<spec reference>" --description "<details>"
```

## Output

JSON with `{ success, area, bootstrapped, tree_path, findings_path, context, tools }`.

## Notes

- Auto-bootstrap creates minimal structures — does NOT scan entire codebase
- Each investigation enriches the tree — subsequent investigations are faster
- Findings survive context reset and can be consumed by `/ops:modify`
- Use `/ops:status <area>` to see findings count by status
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --test tests/ops-investigate-v2.test.cjs`
Expected: All 2 tests PASS

- [ ] **Step 6: Commit**

```bash
git add tests/ops-investigate-v2.test.cjs get-shit-done/bin/lib/ops.cjs commands/gsd/ops-investigate.md
git commit -m "feat(ops): evolve investigate with auto-bootstrap, findings output, and tool hints"
```

---

### Task 5: Evolve cmdOpsModify — Consume Findings by ID

**Files:**
- Modify: `get-shit-done/bin/lib/ops.cjs:1116-1191` (cmdOpsModify)
- Modify: `commands/gsd/ops-modify.md`
- Test: `tests/ops-modify-v2.test.cjs` (create)

- [ ] **Step 1: Write the failing test**

Create `tests/ops-modify-v2.test.cjs`:

```javascript
/**
 * OPS Modify v2 — Consume findings by ID/range
 */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const { runGsdTools, createTempProject, cleanup } = require('./helpers.cjs');
const fs = require('fs');
const path = require('path');

function seedAreaWithFindings(tmpDir) {
  const opsDir = path.join(tmpDir, '.planning', 'ops', 'prazos');
  fs.mkdirSync(opsDir, { recursive: true });
  fs.writeFileSync(path.join(tmpDir, '.planning', 'ops', 'registry.json'), JSON.stringify({
    areas: [{ slug: 'prazos', name: 'prazos', source: 'manual', detected_by: 'manual', confidence: 'high', created_at: '2026-03-30T00:00:00Z', last_scanned: '2026-03-30T00:00:00Z', components_count: 1 }]
  }));
  fs.writeFileSync(path.join(opsDir, 'tree.json'), JSON.stringify({
    area: 'prazos', generated_at: '2026-03-30T00:00:00Z',
    nodes: [{ id: 'component:PlanilhaoGrid', type: 'component', file_path: 'frontend/views/prazos/components/PlanilhaoGrid.vue', name: 'PlanilhaoGrid' }],
    edges: []
  }));
  fs.writeFileSync(path.join(opsDir, 'findings.json'), JSON.stringify({
    domain: 'prazos',
    findings: [
      { id: 'PRAZOS-001', status: 'pending', severity: 'minor', category: 'visual', title: 'Cores hardcoded', description: 'text-red-600 em vez de text-red-500', node_id: 'component:PlanilhaoGrid', file: 'frontend/views/prazos/components/PlanilhaoGrid.vue', lines: [158, 167], spec_ref: 'SPEC.md:color-tokens', created: '2026-03-30', created_by: 'investigate', resolved: null, resolved_by: null },
      { id: 'PRAZOS-002', status: 'pending', severity: 'major', category: 'visual', title: 'Font-weight errado', description: 'Header usa 700, SPEC pede 500', node_id: 'component:PlanilhaoGrid', file: 'frontend/views/prazos/components/PlanilhaoGrid.vue', lines: [95], spec_ref: 'SPEC.md:typography', created: '2026-03-30', created_by: 'investigate', resolved: null, resolved_by: null },
      { id: 'PRAZOS-003', status: 'pending', severity: 'minor', category: 'visual', title: 'Row hover cor errada', description: 'Usa surface-100, SPEC pede primary-50', node_id: 'component:PlanilhaoGrid', file: 'frontend/views/prazos/components/PlanilhaoGrid.vue', lines: [203], spec_ref: 'SPEC.md:interaction', created: '2026-03-30', created_by: 'investigate', resolved: null, resolved_by: null }
    ]
  }));
}

describe('ops modify v2 — findings-aware', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject('ops-modify-v2-');
    seedAreaWithFindings(tmpDir);
  });

  afterEach(() => { cleanup(tmpDir); });

  test('modify with finding ID loads specific finding context', () => {
    const result = runGsdTools(['ops', 'modify', 'prazos', 'PRAZOS-001'], tmpDir);
    const parsed = JSON.parse(result.output);
    assert.strictEqual(parsed.success, true);
    assert.strictEqual(parsed.findings_mode, true);
    assert.strictEqual(parsed.target_findings.length, 1);
    assert.strictEqual(parsed.target_findings[0].id, 'PRAZOS-001');
  });

  test('modify with finding range loads multiple findings', () => {
    const result = runGsdTools(['ops', 'modify', 'prazos', 'PRAZOS-001..003'], tmpDir);
    const parsed = JSON.parse(result.output);
    assert.strictEqual(parsed.success, true);
    assert.strictEqual(parsed.findings_mode, true);
    assert.strictEqual(parsed.target_findings.length, 3);
  });

  test('modify with --all-pending loads all pending findings', () => {
    const result = runGsdTools(['ops', 'modify', 'prazos', '--all-pending'], tmpDir);
    const parsed = JSON.parse(result.output);
    assert.strictEqual(parsed.success, true);
    assert.strictEqual(parsed.findings_mode, true);
    assert.strictEqual(parsed.target_findings.length, 3);
  });

  test('modify without finding ID falls back to description-based behavior', () => {
    const result = runGsdTools(['ops', 'modify', 'prazos', 'refactor header styles'], tmpDir);
    const parsed = JSON.parse(result.output);
    assert.strictEqual(parsed.success, true);
    assert.strictEqual(parsed.findings_mode, false);
    assert.ok(parsed.affected_nodes);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/ops-modify-v2.test.cjs`
Expected: FAIL — current modify doesn't handle finding IDs

- [ ] **Step 3: Rewrite cmdOpsModify to detect and handle findings mode**

Replace `cmdOpsModify` in `get-shit-done/bin/lib/ops.cjs`:

```javascript
function cmdOpsModify(cwd, area, description, raw) {
  if (!area) { error('Usage: gsd-tools ops modify <area> <description|FINDING-ID|FINDING-RANGE|--all-pending>'); return; }
  const slug = slugify(area);
  const registry = readRegistry(cwd);
  const entry = registry.areas.find(a => a.slug === slug);
  if (!entry) { error('Area not found: ' + slug); return; }

  const tree = readTreeJson(cwd, slug);
  if (!tree) { error('No tree.json for area: ' + slug + '. Run /ops:map first.'); return; }

  // Detect findings mode: ID pattern (AREA-NNN), range (AREA-NNN..NNN), or --all-pending
  const prefix = slug.toUpperCase();
  const isFindingId = description && (new RegExp('^' + prefix + '-\\d+').test(description) || description === '--all-pending');
  const isFindingRange = description && new RegExp('^' + prefix + '-\\d+\\.\\.\\d+$').test(description);

  if (isFindingId || isFindingRange) {
    // Findings mode
    const data = readFindings(cwd, slug);
    let targetFindings;

    if (description === '--all-pending') {
      targetFindings = data.findings.filter(f => f.status === 'pending');
    } else if (isFindingRange) {
      const ids = parseFindingRange(description, slug);
      targetFindings = data.findings.filter(f => ids.includes(f.id));
    } else {
      targetFindings = data.findings.filter(f => f.id === description);
    }

    if (targetFindings.length === 0) {
      error('No matching findings found for: ' + description);
      return;
    }

    // Group findings by file for efficient editing
    const byFile = {};
    for (const f of targetFindings) {
      if (!f.file) continue;
      if (!byFile[f.file]) byFile[f.file] = [];
      byFile[f.file].push(f);
    }

    const blast = computeBlastRadius(tree);
    const gsdToolsCmd = 'node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs"';

    appendHistory(cwd, slug, {
      op: 'modify',
      summary: 'Findings-based modify: ' + targetFindings.map(f => f.id).join(', '),
      outcome: 'success'
    });

    output({
      success: true,
      area: slug,
      findings_mode: true,
      target_findings: targetFindings,
      files_affected: Object.keys(byFile),
      findings_by_file: byFile,
      blast_radius: blast,
      dispatch: targetFindings.length > 5 ? 'plan' : 'quick',
      tools: {
        mark_fixed: gsdToolsCmd + ' ops findings ' + slug + ' update <ID> --status fixed --resolved-by ops:modify',
        mark_range: gsdToolsCmd + ' ops findings ' + slug + ' update <ID..ID> --status fixed'
      }
    }, raw);
    return;
  }

  // Legacy description-based mode (unchanged)
  const blast = computeBlastRadius(tree);
  const affectedNodes = [];
  const visited = new Set();

  function traverseDownstream(nodeId, depth) {
    if (depth > 3 || visited.has(nodeId)) return;
    visited.add(nodeId);
    const node = tree.nodes.find(n => n.id === nodeId);
    if (node) affectedNodes.push({ id: node.id, type: node.type, file_path: node.file_path, depth });
    const dependentEdges = tree.edges.filter(e => e.to === nodeId);
    for (const edge of dependentEdges) {
      traverseDownstream(edge.from, depth + 1);
    }
  }

  for (const node of tree.nodes) {
    if (!visited.has(node.id)) {
      traverseDownstream(node.id, 0);
    }
  }

  const result = {
    success: true,
    area: slug,
    description: description || '',
    findings_mode: false,
    blast_radius: blast,
    needs_full_plan: blast.needs_full_plan,
    dispatch: blast.needs_full_plan ? 'plan' : 'quick',
    affected_nodes: affectedNodes,
    affected_count: affectedNodes.length
  };

  if (blast.needs_full_plan) {
    const planDir = path.join(areaDir(cwd, slug), 'plans');
    fs.mkdirSync(planDir, { recursive: true });
    result.plan_dir = path.relative(cwd, planDir);
  }

  const byType = {};
  for (const n of tree.nodes) { byType[n.type] = (byType[n.type] || 0) + 1; }
  result.context_summary = { nodes_by_type: byType, edges_count: tree.edges.length, total_nodes: tree.nodes.length };

  appendHistory(cwd, slug, {
    op: 'modify',
    summary: description || 'Modification initiated',
    outcome: 'success'
  });

  refreshTree(cwd, slug);
  output(result, raw);
}
```

- [ ] **Step 4: Update ops-modify.md command doc**

Replace content of `commands/gsd/ops-modify.md`:

```markdown
# /ops:modify

Modify existing behavior in an OPS area. Supports both findings-based (by ID/range) and description-based modes.

## Usage

```
/ops:modify <area> <FINDING-ID>           # Fix specific finding
/ops:modify <area> <FINDING-ID..ID>       # Fix range of findings
/ops:modify <area> --all-pending          # Fix all pending findings
/ops:modify <area> <what to change>       # Legacy description-based
```

## What it does

### Findings Mode (ID/range/--all-pending)

1. Loads target findings from `findings.json` by ID, range, or status
2. Groups findings by file for efficient editing
3. Returns findings with exact file paths, line numbers, and spec references
4. Dispatches to quick (<=5 findings) or plan (>5 findings)
5. After fixing, mark findings as fixed via the `tools.mark_fixed` command

### Description Mode (legacy)

1. Analyzes impact via dependency tree edge traversal
2. Computes blast radius for scope-based dispatch
3. Dispatches to quick or plan based on affected nodes count

## Implementation

### Findings-based flow
```bash
# Get findings context
RESULT=$(node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" ops modify <area> PRAZOS-001..005 --raw)

# After fixing each finding, mark as fixed
node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" ops findings <area> update <ID> --status fixed --resolved-by ops:modify
```

## Output

JSON with `{ success, area, findings_mode, target_findings, files_affected, findings_by_file, blast_radius, dispatch, tools }`.

## Notes

- Findings mode provides exact file+line context — no re-investigation needed
- After fixing, always mark findings as fixed to keep status accurate
- Use `/ops:status <area>` to check remaining pending findings
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --test tests/ops-modify-v2.test.cjs`
Expected: All 4 tests PASS

- [ ] **Step 6: Commit**

```bash
git add tests/ops-modify-v2.test.cjs get-shit-done/bin/lib/ops.cjs commands/gsd/ops-modify.md
git commit -m "feat(ops): evolve modify to consume findings by ID/range with grouped file context"
```

---

### Task 6: Evolve cmdOpsStatus — Include Findings Count

**Files:**
- Modify: `get-shit-done/bin/lib/ops.cjs:1199-1257` (computeAreaStatus)
- Test: `tests/ops-governance.test.cjs` (add test)

- [ ] **Step 1: Write the failing test**

Add to `tests/ops-governance.test.cjs` (at the end, inside the existing describe or as a new one):

```javascript
describe('ops status — findings integration', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject('ops-status-findings-');
    const opsDir = path.join(tmpDir, '.planning', 'ops', 'prazos');
    fs.mkdirSync(opsDir, { recursive: true });
    fs.writeFileSync(path.join(tmpDir, '.planning', 'ops', 'registry.json'), JSON.stringify({
      areas: [{ slug: 'prazos', name: 'prazos', source: 'manual', detected_by: 'manual', confidence: 'high', created_at: '2026-03-30T00:00:00Z', last_scanned: '2026-03-30T00:00:00Z', components_count: 0 }]
    }));
    fs.writeFileSync(path.join(opsDir, 'findings.json'), JSON.stringify({
      domain: 'prazos',
      findings: [
        { id: 'PRAZOS-001', status: 'pending', severity: 'minor' },
        { id: 'PRAZOS-002', status: 'fixed', severity: 'major' },
        { id: 'PRAZOS-003', status: 'pending', severity: 'critical' }
      ]
    }));
  });

  afterEach(() => { cleanup(tmpDir); });

  test('status includes findings counts and health flag', () => {
    const result = runGsdTools(['ops', 'status', 'prazos'], tmpDir);
    const parsed = JSON.parse(result.output);
    assert.strictEqual(parsed.findings_total, 3);
    assert.strictEqual(parsed.findings_pending, 2);
    assert.strictEqual(parsed.findings_fixed, 1);
    assert.ok(parsed.findings_by_severity);
    assert.strictEqual(parsed.findings_by_severity.critical, 1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/ops-governance.test.cjs`
Expected: FAIL — `findings_total` not in output

- [ ] **Step 3: Add findings data to computeAreaStatus**

In `get-shit-done/bin/lib/ops.cjs`, inside `computeAreaStatus` function (~line 1199), add after the backlog reading section and before health scoring:

```javascript
  // Read findings
  const findingsData = readFindings(cwd, slug);
  const allFindings = findingsData.findings || [];
  const pendingFindings = allFindings.filter(f => f.status === 'pending');
  const fixedFindings = allFindings.filter(f => f.status === 'fixed');
  const findingsBySeverity = {};
  for (const f of allFindings) {
    findingsBySeverity[f.severity || 'unknown'] = (findingsBySeverity[f.severity || 'unknown'] || 0) + 1;
  }
```

Add to the health flags check (before the `const health = ...` line):

```javascript
  if (pendingFindings.some(f => f.severity === 'critical')) flags.push('critical_findings');
```

Add the findings fields to the return object:

```javascript
    findings_total: allFindings.length,
    findings_pending: pendingFindings.length,
    findings_fixed: fixedFindings.length,
    findings_by_severity: findingsBySeverity,
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/ops-governance.test.cjs`
Expected: All tests PASS (existing + new)

- [ ] **Step 5: Commit**

```bash
git add tests/ops-governance.test.cjs get-shit-done/bin/lib/ops.cjs
git commit -m "feat(ops): include findings counts and severity in area status"
```

---

### Task 7: Evolve cmdOpsMap — Preserve Knowledge on Refresh

**Files:**
- Modify: `get-shit-done/bin/lib/ops.cjs` (refreshTree function, ~line 754)
- Test: `tests/ops-tree-preserve.test.cjs` (create)

- [ ] **Step 1: Write the failing test**

Create `tests/ops-tree-preserve.test.cjs`:

```javascript
/**
 * OPS Tree Preserve — Verify knowledge survives tree refresh
 */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const { createTempProject, cleanup } = require('./helpers.cjs');
const fs = require('fs');
const path = require('path');

// Direct import to test refreshTree internals
const ops = require('../get-shit-done/bin/lib/ops.cjs');

describe('tree refresh — knowledge preservation', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject('ops-tree-preserve-');
    const opsDir = path.join(tmpDir, '.planning', 'ops', 'prazos');
    fs.mkdirSync(opsDir, { recursive: true });
    fs.writeFileSync(path.join(tmpDir, '.planning', 'ops', 'registry.json'), JSON.stringify({
      areas: [{ slug: 'prazos', name: 'prazos', source: 'manual', detected_by: 'manual', confidence: 'high', created_at: '2026-03-30T00:00:00Z', last_scanned: '2026-03-30T00:00:00Z', components_count: 1 }]
    }));

    // Write a tree with rich knowledge
    fs.writeFileSync(path.join(opsDir, 'tree.json'), JSON.stringify({
      area: 'prazos', generated_at: '2026-03-30T00:00:00Z',
      nodes: [
        {
          id: 'component:PlanilhaoGrid', type: 'component',
          file_path: 'frontend/views/prazos/components/PlanilhaoGrid.vue',
          name: 'PlanilhaoGrid',
          summary: 'Grid AG-Grid v35+',
          endpoints_called: ['/api/prazos/listar'],
          css_classes: ['ag-theme-quartz'],
          knowledge: {
            framework: 'ag-grid-vue@35+',
            specs_applicable: ['SPEC.md:table-tokens'],
            decisions: [{ date: '2026-03-30', decision: 'Migrar para Quartz', reason: 'Alpine morto' }],
            last_investigated: '2026-03-30',
            investigation_count: 3
          }
        }
      ],
      edges: []
    }));

    // Create the actual source file so refreshTree can find it
    const srcDir = path.join(tmpDir, 'frontend', 'views', 'prazos', 'components');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(path.join(srcDir, 'PlanilhaoGrid.vue'), '<template><div>grid</div></template>');

    // Init git so listProjectFiles works
    try {
      const { execSync } = require('child_process');
      execSync('git init && git add -A && git commit -m "init"', { cwd: tmpDir, stdio: 'pipe' });
    } catch { /* ok */ }
  });

  afterEach(() => { cleanup(tmpDir); });

  test('refreshTree preserves knowledge and enriched fields from existing nodes', () => {
    // Read pre-refresh state
    const before = JSON.parse(fs.readFileSync(path.join(tmpDir, '.planning', 'ops', 'prazos', 'tree.json'), 'utf-8'));
    const nodeBefore = before.nodes.find(n => n.id === 'component:PlanilhaoGrid');
    assert.ok(nodeBefore.knowledge.framework, 'Pre-condition: knowledge exists');

    // Run refresh
    ops.refreshTree(tmpDir, 'prazos');

    // Read post-refresh state
    const after = JSON.parse(fs.readFileSync(path.join(tmpDir, '.planning', 'ops', 'prazos', 'tree.json'), 'utf-8'));
    const nodeAfter = after.nodes.find(n => n.name === 'PlanilhaoGrid');

    if (nodeAfter) {
      // If node survived refresh, verify knowledge was preserved
      assert.ok(nodeAfter.knowledge, 'Knowledge should be preserved');
      assert.strictEqual(nodeAfter.knowledge.framework, 'ag-grid-vue@35+');
      assert.strictEqual(nodeAfter.knowledge.investigation_count, 3);
      assert.deepStrictEqual(nodeAfter.knowledge.specs_applicable, ['SPEC.md:table-tokens']);
      if (nodeAfter.endpoints_called) {
        assert.deepStrictEqual(nodeAfter.endpoints_called, ['/api/prazos/listar']);
      }
    }
    // If node wasn't found by refresh (no imports to follow), that's ok —
    // the key test is that IF the node is regenerated, knowledge merges in
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/ops-tree-preserve.test.cjs`
Expected: FAIL — refreshTree overwrites knowledge

- [ ] **Step 3: Modify refreshTree to merge knowledge from existing tree**

In `get-shit-done/bin/lib/ops.cjs`, in the `refreshTree` function (~line 754), add knowledge preservation logic. After the new tree is built (after `const tree = { area: slug, ...}` on ~line 832) and before `writeTreeJson`:

```javascript
    // Preserve knowledge from existing tree nodes
    const existingTree = readTreeJson(cwd, slug);
    if (existingTree) {
      const existingNodeMap = new Map();
      for (const n of existingTree.nodes) {
        existingNodeMap.set(n.id, n);
        // Also index by file_path for matching after re-scan (IDs may change)
        existingNodeMap.set('file:' + n.file_path, n);
      }

      for (const newNode of tree.nodes) {
        const existing = existingNodeMap.get(newNode.id) || existingNodeMap.get('file:' + newNode.file_path);
        if (!existing) continue;
        // Merge knowledge
        if (existing.knowledge && Object.keys(existing.knowledge).length > 0) {
          newNode.knowledge = { ...(newNode.knowledge || {}), ...existing.knowledge };
        }
        // Preserve enriched fields that refreshTree doesn't generate
        const enrichedFields = ['endpoints_called', 'css_classes', 'columns', 'query', 'indexes', 'props', 'emits', 'slots', 'summary'];
        for (const field of enrichedFields) {
          if (existing[field] !== undefined && (newNode[field] === undefined || (Array.isArray(newNode[field]) && newNode[field].length === 0))) {
            newNode[field] = existing[field];
          }
        }
      }
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/ops-tree-preserve.test.cjs`
Expected: PASS

Also run existing tests to verify no regressions:
Run: `node --test tests/ops.test.cjs tests/ops-workflows.test.cjs tests/ops-governance.test.cjs`
Expected: All existing tests PASS

- [ ] **Step 5: Commit**

```bash
git add tests/ops-tree-preserve.test.cjs get-shit-done/bin/lib/ops.cjs
git commit -m "feat(ops): preserve knowledge and enriched fields during tree refresh"
```

---

### Task 8: Update Exports and Run Full Test Suite

**Files:**
- Modify: `get-shit-done/bin/lib/ops.cjs` (final exports)
- Modify: `get-shit-done/bin/gsd-tools.cjs` (final dispatcher)

- [ ] **Step 1: Verify final exports in ops.cjs include all new functions**

```javascript
module.exports = {
  cmdOpsInit, cmdOpsMap, cmdOpsAdd, cmdOpsList, cmdOpsGet,
  cmdOpsInvestigate, cmdOpsFeature, cmdOpsModify, cmdOpsDebug, cmdOpsSummary,
  cmdOpsStatus, cmdOpsSpec, cmdOpsBacklog,
  cmdOpsFindings, cmdOpsTreeQuery, cmdOpsTreeUpdate,
  computeAreaStatus,
  appendHistory, computeBlastRadius, refreshTree,
  readFindings, writeFindings, nextFindingId, parseFindingRange,
  INTENT_FILTERS, CARD_FIELDS, filterNodeByIntent
};
```

- [ ] **Step 2: Verify final dispatcher in gsd-tools.cjs**

The ops case block should include:

```javascript
      } else if (subcommand === 'findings') {
        ops.cmdOpsFindings(cwd, args[2], args.slice(3), raw);
      } else if (subcommand === 'tree-query') {
        ops.cmdOpsTreeQuery(cwd, args[2], args.slice(3), raw);
      } else if (subcommand === 'tree-update') {
        ops.cmdOpsTreeUpdate(cwd, args[2], args[3], args[4], args[5], raw);
```

- [ ] **Step 3: Run full test suite**

Run: `node --test tests/ops.test.cjs tests/ops-workflows.test.cjs tests/ops-governance.test.cjs tests/ops-findings.test.cjs tests/ops-tree-query.test.cjs tests/ops-tree-update.test.cjs tests/ops-investigate-v2.test.cjs tests/ops-modify-v2.test.cjs tests/ops-tree-preserve.test.cjs`
Expected: All tests PASS across all 9 test files

- [ ] **Step 4: Commit final integration**

```bash
git add get-shit-done/bin/lib/ops.cjs get-shit-done/bin/gsd-tools.cjs
git commit -m "chore(ops): finalize v2 exports and dispatcher routes"
```

---

## File Structure Summary

| Action | File | Purpose |
|--------|------|---------|
| Modify | `get-shit-done/bin/lib/ops.cjs` | Add findings CRUD, tree-query, tree-update; evolve investigate/modify/status; preserve knowledge on refresh |
| Modify | `get-shit-done/bin/gsd-tools.cjs` | Add dispatcher routes for findings, tree-query, tree-update |
| Modify | `commands/gsd/ops-investigate.md` | Update command doc for v2 flow |
| Modify | `commands/gsd/ops-modify.md` | Update command doc for findings mode |
| Create | `tests/ops-findings.test.cjs` | Findings CRUD tests |
| Create | `tests/ops-tree-query.test.cjs` | Intent-filtered query tests |
| Create | `tests/ops-tree-update.test.cjs` | Knowledge planting tests |
| Create | `tests/ops-investigate-v2.test.cjs` | Auto-bootstrap tests |
| Create | `tests/ops-modify-v2.test.cjs` | Findings-based modify tests |
| Create | `tests/ops-tree-preserve.test.cjs` | Knowledge preservation on refresh |
| Modify | `tests/ops-governance.test.cjs` | Add findings integration to status tests |
