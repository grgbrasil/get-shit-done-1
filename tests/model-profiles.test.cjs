/**
 * Model Profiles Tests
 *
 * Tests for MODEL_PROFILES data structure, VALID_PROFILES list,
 * formatAgentToModelMapAsTable, and getAgentToModelMapForProfile.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');

const {
  MODEL_PROFILES,
  VALID_PROFILES,
  formatAgentToModelMapAsTable,
  getAgentToModelMapForProfile,
} = require('../get-shit-done/bin/lib/model-profiles.cjs');

// ─── MODEL_PROFILES data integrity ────────────────────────────────────────────

describe('MODEL_PROFILES', () => {
  test('contains all expected GSD agents', () => {
    const expectedAgents = [
      'gsd-planner', 'gsd-roadmapper', 'gsd-executor',
      'gsd-phase-researcher', 'gsd-project-researcher', 'gsd-research-synthesizer',
      'gsd-debugger', 'gsd-codebase-mapper', 'gsd-verifier',
      'gsd-plan-checker', 'gsd-integration-checker', 'gsd-nyquist-auditor',
      'gsd-ui-researcher', 'gsd-ui-checker', 'gsd-ui-auditor',
    ];
    for (const agent of expectedAgents) {
      assert.ok(MODEL_PROFILES[agent], `Missing agent: ${agent}`);
    }
  });

  test('every agent has quality, balanced, and budget profiles', () => {
    for (const [agent, profiles] of Object.entries(MODEL_PROFILES)) {
      assert.ok(profiles.quality, `${agent} missing quality profile`);
      assert.ok(profiles.balanced, `${agent} missing balanced profile`);
      assert.ok(profiles.budget, `${agent} missing budget profile`);
    }
  });

  test('all profile values are valid model aliases', () => {
    const validModels = ['opus', 'sonnet', 'haiku'];
    for (const [agent, profiles] of Object.entries(MODEL_PROFILES)) {
      for (const [profile, model] of Object.entries(profiles)) {
        assert.ok(
          validModels.includes(model),
          `${agent}.${profile} has invalid model "${model}" — expected one of ${validModels.join(', ')}`
        );
      }
    }
  });

  test('quality profile never uses haiku (except cataloger)', () => {
    const exemptions = ['gsd-cataloger']; // cataloger always runs on haiku per FMAP-07
    for (const [agent, profiles] of Object.entries(MODEL_PROFILES)) {
      if (exemptions.includes(agent)) continue;
      assert.notStrictEqual(
        profiles.quality, 'haiku',
        `${agent} quality profile should not use haiku`
      );
    }
  });

  test('gsd-cataloger resolves to haiku on all profiles', () => {
    assert.deepStrictEqual(MODEL_PROFILES['gsd-cataloger'], {
      quality: 'haiku',
      balanced: 'haiku',
      budget: 'haiku',
    });
  });
});

// ─── VALID_PROFILES ───────────────────────────────────────────────────────────

describe('VALID_PROFILES', () => {
  test('contains quality, balanced, and budget', () => {
    assert.deepStrictEqual(VALID_PROFILES.sort(), ['balanced', 'budget', 'quality']);
  });

  test('is derived from MODEL_PROFILES keys', () => {
    const fromData = Object.keys(MODEL_PROFILES['gsd-planner']);
    assert.deepStrictEqual(VALID_PROFILES.sort(), fromData.sort());
  });
});

// ─── getAgentToModelMapForProfile ─────────────────────────────────────────────

describe('getAgentToModelMapForProfile', () => {
  test('returns correct models for balanced profile', () => {
    const map = getAgentToModelMapForProfile('balanced');
    assert.strictEqual(map['gsd-planner'], 'opus');
    assert.strictEqual(map['gsd-codebase-mapper'], 'haiku');
    assert.strictEqual(map['gsd-verifier'], 'sonnet');
  });

  test('returns correct models for budget profile', () => {
    const map = getAgentToModelMapForProfile('budget');
    assert.strictEqual(map['gsd-planner'], 'sonnet');
    assert.strictEqual(map['gsd-phase-researcher'], 'haiku');
  });

  test('returns correct models for quality profile', () => {
    const map = getAgentToModelMapForProfile('quality');
    assert.strictEqual(map['gsd-planner'], 'opus');
    assert.strictEqual(map['gsd-executor'], 'opus');
  });

  test('returns all agents in the map', () => {
    const map = getAgentToModelMapForProfile('balanced');
    const agentCount = Object.keys(MODEL_PROFILES).length;
    assert.strictEqual(Object.keys(map).length, agentCount);
  });
});

// ─── formatAgentToModelMapAsTable ─────────────────────────────────────────────

describe('formatAgentToModelMapAsTable', () => {
  test('produces a table with header and separator', () => {
    const map = { 'gsd-planner': 'opus', 'gsd-executor': 'sonnet' };
    const table = formatAgentToModelMapAsTable(map);
    assert.ok(table.includes('Agent'), 'should have Agent header');
    assert.ok(table.includes('Model'), 'should have Model header');
    assert.ok(table.includes('─'), 'should have separator line');
    assert.ok(table.includes('gsd-planner'), 'should list agent');
    assert.ok(table.includes('opus'), 'should list model');
  });

  test('pads columns correctly', () => {
    const map = { 'a': 'opus', 'very-long-agent-name': 'haiku' };
    const table = formatAgentToModelMapAsTable(map);
    const lines = table.split('\n').filter(l => l.trim());
    // Separator line uses ┼, data/header lines use │
    const dataLines = lines.filter(l => l.includes('│'));
    const pipePositions = dataLines.map(l => l.indexOf('│'));
    const unique = [...new Set(pipePositions)];
    assert.strictEqual(unique.length, 1, 'all data lines should align on │');
  });

  test('handles empty map', () => {
    const table = formatAgentToModelMapAsTable({});
    assert.ok(table.includes('Agent'), 'should still have header');
  });
});

// ─── AGENT_ROUTING ───────────────────────────────────────────────────────────

test('AGENT_ROUTING maps simple agents to remote', () => {
  const { AGENT_ROUTING } = require('../get-shit-done/bin/lib/model-profiles.cjs');
  assert.strictEqual(AGENT_ROUTING['gsd-cataloger'].route, 'remote');
  assert.strictEqual(AGENT_ROUTING['gsd-research-synthesizer'].route, 'remote');
  assert.strictEqual(AGENT_ROUTING['gsd-ui-checker'].route, 'remote');
});

test('AGENT_ROUTING maps complex agents to local', () => {
  const { AGENT_ROUTING } = require('../get-shit-done/bin/lib/model-profiles.cjs');
  assert.strictEqual(AGENT_ROUTING['gsd-planner'].route, 'local');
  assert.strictEqual(AGENT_ROUTING['gsd-executor'].route, 'local');
  assert.strictEqual(AGENT_ROUTING['gsd-debugger'].route, 'local');
});

test('AGENT_ROUTING defaults to undefined for unknown agents', () => {
  const { AGENT_ROUTING } = require('../get-shit-done/bin/lib/model-profiles.cjs');
  assert.strictEqual(AGENT_ROUTING['unknown-agent'], undefined);
});

// ─── LEAN_MODEL_OVERRIDES ────────────────────────────────────────────────────

test('LEAN_MODEL_OVERRIDES downgrades simple agents to haiku', () => {
  const { LEAN_MODEL_OVERRIDES } = require('../get-shit-done/bin/lib/model-profiles.cjs');
  assert.strictEqual(LEAN_MODEL_OVERRIDES['gsd-nyquist-auditor'], 'haiku');
  assert.strictEqual(LEAN_MODEL_OVERRIDES['gsd-ui-checker'], 'haiku');
  assert.strictEqual(LEAN_MODEL_OVERRIDES['gsd-research-synthesizer'], 'haiku');
});

// ─── resolveExecutionMode ────────────────────────────────────────────────────

test('resolveExecutionMode: CLI flag takes priority over config', () => {
  const { resolveExecutionMode } = require('../get-shit-done/bin/lib/model-profiles.cjs');
  assert.strictEqual(resolveExecutionMode({ cliFlag: 'full', configMode: 'lean' }), 'full');
  assert.strictEqual(resolveExecutionMode({ cliFlag: 'lean', configMode: 'full' }), 'lean');
});

test('resolveExecutionMode: config fallback when no CLI flag', () => {
  const { resolveExecutionMode } = require('../get-shit-done/bin/lib/model-profiles.cjs');
  assert.strictEqual(resolveExecutionMode({ cliFlag: null, configMode: 'lean' }), 'lean');
});

test('resolveExecutionMode: defaults to auto', () => {
  const { resolveExecutionMode } = require('../get-shit-done/bin/lib/model-profiles.cjs');
  assert.strictEqual(resolveExecutionMode({ cliFlag: null, configMode: null }), 'auto');
  assert.strictEqual(resolveExecutionMode({}), 'auto');
});

// ─── EFFORT_PROFILES ────────────────────────────────────────────────────────

describe('EFFORT_PROFILES', () => {
  const { EFFORT_PROFILES, VALID_EFFORT_LEVELS } = require('../get-shit-done/bin/lib/model-profiles.cjs');

  test('contains all 16 expected agents', () => {
    const expectedAgents = [
      'gsd-planner', 'gsd-executor', 'gsd-phase-researcher', 'gsd-project-researcher',
      'gsd-roadmapper', 'gsd-debugger', 'gsd-research-synthesizer', 'gsd-verifier',
      'gsd-plan-checker', 'gsd-codebase-mapper', 'gsd-integration-checker',
      'gsd-nyquist-auditor', 'gsd-ui-researcher', 'gsd-ui-checker', 'gsd-ui-auditor',
      'gsd-cataloger',
    ];
    for (const agent of expectedAgents) {
      assert.ok(EFFORT_PROFILES[agent], `Missing effort for agent: ${agent}`);
    }
  });

  test('all effort values are valid levels', () => {
    for (const [agent, effort] of Object.entries(EFFORT_PROFILES)) {
      assert.ok(
        VALID_EFFORT_LEVELS.includes(effort),
        `${agent} has invalid effort "${effort}" — expected one of ${VALID_EFFORT_LEVELS.join(', ')}`
      );
    }
  });

  test('planner has max effort', () => {
    assert.strictEqual(EFFORT_PROFILES['gsd-planner'], 'max');
  });

  test('verifier has low effort', () => {
    assert.strictEqual(EFFORT_PROFILES['gsd-verifier'], 'low');
  });
});

// ─── resolveEffort ────────────────────────────────────────────────────────────

describe('resolveEffort', () => {
  const { resolveEffort } = require('../get-shit-done/bin/lib/model-profiles.cjs');

  test('returns max for gsd-planner', () => {
    assert.strictEqual(resolveEffort('gsd-planner'), 'max');
  });

  test('returns medium for gsd-executor', () => {
    assert.strictEqual(resolveEffort('gsd-executor'), 'medium');
  });

  test('returns low for gsd-verifier', () => {
    assert.strictEqual(resolveEffort('gsd-verifier'), 'low');
  });

  test('returns high for gsd-debugger', () => {
    assert.strictEqual(resolveEffort('gsd-debugger'), 'high');
  });

  test('falls back to medium for unknown agent', () => {
    assert.strictEqual(resolveEffort('gsd-nonexistent'), 'medium');
  });

  test('logs fallback warning to stderr for unknown agent', () => {
    const originalWrite = process.stderr.write;
    let captured = '';
    process.stderr.write = (msg) => { captured += msg; };
    try {
      resolveEffort('gsd-unknown-agent');
      assert.ok(captured.includes('[gsd] effort fallback:'), 'should log fallback warning');
      assert.ok(captured.includes('gsd-unknown-agent'), 'should include agent name');
      assert.ok(captured.includes('default=medium'), 'should include default value');
    } finally {
      process.stderr.write = originalWrite;
    }
  });

  test('does not log for known agents', () => {
    const originalWrite = process.stderr.write;
    let captured = '';
    process.stderr.write = (msg) => { captured += msg; };
    try {
      resolveEffort('gsd-planner');
      assert.strictEqual(captured, '', 'should not log for known agents');
    } finally {
      process.stderr.write = originalWrite;
    }
  });
});
