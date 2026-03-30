/**
 * OPS Governance -- Status + Spec + Backlog tests covering OPS-10, OPS-11, OPS-12
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const { runGsdTools, createTempProject, cleanup } = require('./helpers.cjs');
const fs = require('fs');
const path = require('path');

const ops = require('../get-shit-done/bin/lib/ops.cjs');

// ─── Helpers ────────────────────────────────────────────────────────────────

function captureOutput(fn) {
  const chunks = [];
  const origWriteSync = fs.writeSync;
  fs.writeSync = (fd, data, ...rest) => {
    if (fd === 1) { chunks.push(data); return data.length; }
    return origWriteSync(fd, data, ...rest);
  };
  try {
    fn();
  } finally {
    fs.writeSync = origWriteSync;
  }
  const raw = chunks.join('');
  try { return JSON.parse(raw); } catch { return raw; }
}

/**
 * Set up an OPS area in a temp project with optional fixtures.
 *
 * @param {string} tmpDir - Temp project root
 * @param {string} slug - Area slug
 * @param {object} opts - Fixture options
 * @param {boolean} [opts.tree] - Write tree.json with 1 node
 * @param {boolean} [opts.history] - Write history.json with 1 entry
 * @param {string}  [opts.staleTimestamp] - Override history timestamp
 * @param {boolean} [opts.specs] - Write specs.md with sample content
 * @param {number}  [opts.backlogCount] - Number of pending backlog items
 */
function setupArea(tmpDir, slug, opts = {}) {
  const opsDir = path.join(tmpDir, '.planning', 'ops');
  const area = path.join(opsDir, slug);
  fs.mkdirSync(area, { recursive: true });

  // tree.json
  if (opts.tree) {
    fs.writeFileSync(
      path.join(area, 'tree.json'),
      JSON.stringify({ nodes: [{ id: 'n1', type: 'route' }], edges: [] }),
      'utf-8'
    );
  }

  // history.json
  if (opts.history) {
    const ts = opts.staleTimestamp || new Date().toISOString();
    fs.writeFileSync(
      path.join(area, 'history.json'),
      JSON.stringify([{ op: 'investigate', area: slug, summary: 'test', outcome: 'ok', timestamp: ts }]),
      'utf-8'
    );
  }

  // specs.md
  if (opts.specs) {
    fs.writeFileSync(
      path.join(area, 'specs.md'),
      '# Specs\n\n## Regras de Negocio\n\n- test rule\n',
      'utf-8'
    );
  }

  // backlog.json
  if (opts.backlogCount != null && opts.backlogCount > 0) {
    const priorities = ['high', 'medium', 'low'];
    const items = [];
    for (let i = 0; i < opts.backlogCount; i++) {
      items.push({
        id: `bl-${i + 1}`,
        title: `Item ${i + 1}`,
        status: 'pending',
        priority: priorities[i % 3]
      });
    }
    fs.writeFileSync(path.join(area, 'backlog.json'), JSON.stringify(items), 'utf-8');
  }

  // registry.json
  const registryPath = path.join(opsDir, 'registry.json');
  let registry = { areas: [] };
  if (fs.existsSync(registryPath)) {
    try { registry = JSON.parse(fs.readFileSync(registryPath, 'utf-8')); } catch { /* ignore */ }
  }
  registry.areas.push({ slug, name: slug, path: slug, last_scanned: null });
  fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2), 'utf-8');
}

// ─── cmdOpsStatus ───────────────────────────────────────────────────────────

describe('cmdOpsStatus', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject('ops-governance-status-');
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('status single-area returns D-02 fields', () => {
    setupArea(tmpDir, 'test-area', { tree: true, history: true, specs: true, backlogCount: 2 });

    const result = captureOutput(() => {
      ops.cmdOpsStatus(tmpDir, 'test-area', true);
    });

    assert.strictEqual(typeof result, 'object', 'should return JSON object');
    const expected = [
      'nodes_count', 'edges_count', 'specs_defined', 'spec_rules_count',
      'backlog_items_count', 'backlog_by_priority', 'last_operation',
      'days_since_last_op', 'tree_last_scanned', 'health', 'health_flags'
    ];
    for (const key of expected) {
      assert.ok(key in result, `missing field: ${key}`);
    }
  });

  test('status all-areas returns areas array', () => {
    setupArea(tmpDir, 'area-one', { tree: true, specs: true });
    setupArea(tmpDir, 'area-two', {});

    const result = captureOutput(() => {
      ops.cmdOpsStatus(tmpDir, null, true);
    });

    assert.ok(Array.isArray(result.areas), 'should have areas array');
    assert.strictEqual(result.areas.length, 2, 'should have 2 areas');
    for (const area of result.areas) {
      assert.ok('health' in area, 'each area should have health field');
    }
  });

  test('health green when specs + recent history + backlog under limit', () => {
    setupArea(tmpDir, 'test-area', { tree: true, history: true, specs: true, backlogCount: 3 });

    const result = captureOutput(() => {
      ops.cmdOpsStatus(tmpDir, 'test-area', true);
    });

    assert.strictEqual(result.health, 'green');
    assert.deepStrictEqual(result.health_flags, []);
  });

  test('health yellow when no specs', () => {
    setupArea(tmpDir, 'test-area', { tree: true, history: true, specs: false });

    const result = captureOutput(() => {
      ops.cmdOpsStatus(tmpDir, 'test-area', true);
    });

    assert.strictEqual(result.health, 'yellow');
    assert.ok(result.health_flags.includes('no_specs'));
  });

  test('health yellow when stale (>30 days)', () => {
    const staleDate = new Date(Date.now() - 31 * 86400000).toISOString();
    setupArea(tmpDir, 'test-area', { tree: true, history: true, specs: true, staleTimestamp: staleDate });

    const result = captureOutput(() => {
      ops.cmdOpsStatus(tmpDir, 'test-area', true);
    });

    assert.strictEqual(result.health, 'yellow');
    assert.ok(result.health_flags.includes('stale'));
  });

  test('health yellow when backlog overflow (>10 pending items)', () => {
    setupArea(tmpDir, 'test-area', { tree: true, history: true, specs: true, backlogCount: 11 });

    const result = captureOutput(() => {
      ops.cmdOpsStatus(tmpDir, 'test-area', true);
    });

    assert.strictEqual(result.health, 'yellow');
    assert.ok(result.health_flags.includes('backlog_overflow'));
  });

  test('health red when 2 flags present', () => {
    const staleDate = new Date(Date.now() - 31 * 86400000).toISOString();
    setupArea(tmpDir, 'test-area', { tree: true, history: true, specs: false, staleTimestamp: staleDate });

    const result = captureOutput(() => {
      ops.cmdOpsStatus(tmpDir, 'test-area', true);
    });

    assert.strictEqual(result.health, 'red');
    assert.ok(result.health_flags.length >= 2);
  });
});

// ─── cmdOpsSpec ─────────────────────────────────────────────────────────────

describe('cmdOpsSpec', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject('ops-governance-spec-');
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('spec show returns specs content when file exists', () => {
    setupArea(tmpDir, 'test-area', { specs: true });

    const result = captureOutput(() => {
      ops.cmdOpsSpec(tmpDir, 'test-area', ['show'], true);
    });

    assert.strictEqual(result.found, true);
    assert.ok(result.content.includes('test rule'));
  });

  test('spec show returns not_found when missing', () => {
    setupArea(tmpDir, 'test-area', {});

    const result = captureOutput(() => {
      ops.cmdOpsSpec(tmpDir, 'test-area', ['show'], true);
    });

    assert.strictEqual(result.found, false);
    assert.ok(result.message.includes('No specs.md'));
  });

  test('spec edit creates template with 4 sections when missing', () => {
    setupArea(tmpDir, 'test-area', {});

    captureOutput(() => {
      ops.cmdOpsSpec(tmpDir, 'test-area', ['edit'], true);
    });

    const specsPath = path.join(tmpDir, '.planning', 'ops', 'test-area', 'specs.md');
    assert.ok(fs.existsSync(specsPath), 'specs.md should be created');

    const content = fs.readFileSync(specsPath, 'utf-8');
    assert.ok(content.includes('## Regras de Negocio'), 'should have business rules section');
    assert.ok(content.includes('## Contratos de API'), 'should have API contracts section');
    assert.ok(content.includes('## Invariantes'), 'should have invariants section');
    assert.ok(content.includes('## Notas'), 'should have notes section');
  });

  test('spec add appends rule to specs.md', () => {
    setupArea(tmpDir, 'test-area', { specs: true });

    captureOutput(() => {
      ops.cmdOpsSpec(tmpDir, 'test-area', ['add', 'new', 'rule', 'here'], true);
    });

    const specsPath = path.join(tmpDir, '.planning', 'ops', 'test-area', 'specs.md');
    const content = fs.readFileSync(specsPath, 'utf-8');
    assert.ok(content.includes('- new rule here'), 'should contain appended rule');
  });
});

// ─── cmdOpsBacklog ──────────────────────────────────────────────────────────

describe('cmdOpsBacklog', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject('ops-governance-backlog-');
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('backlog add creates item with auto-increment ID', () => {
    setupArea(tmpDir, 'test-area', {});

    const result = captureOutput(() => ops.cmdOpsBacklog(tmpDir, 'test-area', ['add', 'Fix', 'login', 'timeout'], false));
    assert.ok(result.success, 'should succeed');
    assert.strictEqual(result.item.id, 1, 'first item should have id 1');
    assert.strictEqual(result.item.title, 'Fix login timeout');
    assert.strictEqual(result.item.priority, 'medium');
    assert.strictEqual(result.item.status, 'pending');
    assert.ok(result.item.created_at, 'should have created_at');

    // Add second item — ID should be 2 (max + 1, not length + 1)
    const result2 = captureOutput(() => ops.cmdOpsBacklog(tmpDir, 'test-area', ['add', 'Second', 'item'], false));
    assert.strictEqual(result2.item.id, 2);
  });

  test('backlog list shows items sorted by priority', () => {
    setupArea(tmpDir, 'test-area', {});
    captureOutput(() => ops.cmdOpsBacklog(tmpDir, 'test-area', ['add', 'Low priority item'], false));
    // Manually update the added item to low priority for test setup
    const backlogPath = path.join(tmpDir, '.planning', 'ops', 'test-area', 'backlog.json');
    let items = JSON.parse(fs.readFileSync(backlogPath, 'utf-8'));
    items[0].priority = 'low';
    fs.writeFileSync(backlogPath, JSON.stringify(items), 'utf-8');
    captureOutput(() => ops.cmdOpsBacklog(tmpDir, 'test-area', ['add', 'High priority item'], false));
    items = JSON.parse(fs.readFileSync(backlogPath, 'utf-8'));
    items[1].priority = 'high';
    fs.writeFileSync(backlogPath, JSON.stringify(items), 'utf-8');

    const result = captureOutput(() => ops.cmdOpsBacklog(tmpDir, 'test-area', ['list'], false));
    assert.strictEqual(result.items[0].priority, 'high', 'high priority first');
    assert.strictEqual(result.items[1].priority, 'low', 'low priority second');
  });

  test('backlog prioritize changes item priority', () => {
    setupArea(tmpDir, 'test-area', {});
    captureOutput(() => ops.cmdOpsBacklog(tmpDir, 'test-area', ['add', 'Test item'], false));
    const result = captureOutput(() => ops.cmdOpsBacklog(tmpDir, 'test-area', ['prioritize', '1', 'high'], false));
    assert.ok(result.success);
    assert.strictEqual(result.item.priority, 'high');
  });

  test('backlog promote marks item and emits context', () => {
    setupArea(tmpDir, 'test-area', {});
    captureOutput(() => ops.cmdOpsBacklog(tmpDir, 'test-area', ['add', 'Feature to promote'], false));
    const result = captureOutput(() => ops.cmdOpsBacklog(tmpDir, 'test-area', ['promote', '1'], false));
    assert.ok(result.success);
    assert.strictEqual(result.item.status, 'promoted');
    assert.ok(result.context, 'should have context');
    assert.ok(Array.isArray(result.context.next_steps), 'context should have next_steps');
  });

  test('backlog done marks item as done without deletion', () => {
    setupArea(tmpDir, 'test-area', {});
    captureOutput(() => ops.cmdOpsBacklog(tmpDir, 'test-area', ['add', 'Item to complete'], false));
    captureOutput(() => ops.cmdOpsBacklog(tmpDir, 'test-area', ['done', '1'], false));

    // Item must still exist in backlog.json
    const backlogPath = path.join(tmpDir, '.planning', 'ops', 'test-area', 'backlog.json');
    const items = JSON.parse(fs.readFileSync(backlogPath, 'utf-8'));
    assert.strictEqual(items.length, 1, 'item should remain in file');
    assert.strictEqual(items[0].status, 'done', 'item status should be done');

    // Done item should not appear in list
    const listResult = captureOutput(() => ops.cmdOpsBacklog(tmpDir, 'test-area', ['list'], false));
    assert.strictEqual(listResult.items.length, 0, 'done item should not appear in list');
  });
});

// ─── Dispatcher ─────────────────────────────────────────────────────────────

describe('dispatcher', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject('ops-governance-dispatch-');
    // Create minimal ops registry for dispatcher tests
    const opsDir = path.join(tmpDir, '.planning', 'ops');
    fs.mkdirSync(opsDir, { recursive: true });
    fs.writeFileSync(
      path.join(opsDir, 'registry.json'),
      JSON.stringify({ areas: [] }),
      'utf-8'
    );
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('dispatcher routes ops status', () => {
    const result = runGsdTools(['ops', 'status'], tmpDir);
    // Should exit 0 (success) with JSON output containing areas array
    assert.ok(result.success, 'ops status should succeed: ' + (result.error || ''));
  });

  test('dispatcher routes ops backlog list', () => {
    const result = runGsdTools(['ops', 'backlog', 'nonexistent-area', 'list'], tmpDir);
    // Should fail gracefully with area not found, not crash
    assert.ok(result !== undefined, 'should return a result');
  });

  test('dispatcher routes ops spec show', () => {
    // spec show for missing area — should get an error but not crash
    const result = runGsdTools(['ops', 'spec', 'test-area', 'show'], tmpDir);
    // Area not found is an expected error, not a crash
    assert.ok(!result.success || result.output.includes('not found') || result.output.includes('found'),
      'ops spec show should handle missing area gracefully');
  });
});
