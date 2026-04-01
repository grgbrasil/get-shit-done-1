const { describe, test } = require('node:test');
const assert = require('node:assert/strict');

// ─── MODEL_PROFILES ──────────────────────────────────────────────────────────

describe('MODEL_PROFILES', () => {
  const { MODEL_PROFILES, VALID_PROFILES } = require('../get-shit-done/bin/lib/model-profiles.cjs');

  test('all 16 agents have profiles for all 3 valid profiles', () => {
    const expectedAgents = [
      'gsd-planner', 'gsd-executor', 'gsd-phase-researcher', 'gsd-project-researcher',
      'gsd-roadmapper', 'gsd-debugger', 'gsd-research-synthesizer', 'gsd-verifier',
      'gsd-plan-checker', 'gsd-codebase-mapper', 'gsd-integration-checker',
      'gsd-nyquist-auditor', 'gsd-ui-researcher', 'gsd-ui-checker', 'gsd-ui-auditor',
      'gsd-cataloger',
    ];
    for (const agent of expectedAgents) {
      assert.ok(MODEL_PROFILES[agent], `Missing agent: ${agent}`);
      for (const profile of VALID_PROFILES) {
        assert.ok(
          MODEL_PROFILES[agent][profile],
          `${agent} missing ${profile} profile`
        );
      }
    }
  });

  test('valid model names (opus, sonnet, haiku)', () => {
    const validModels = ['opus', 'sonnet', 'haiku'];
    for (const [agent, profiles] of Object.entries(MODEL_PROFILES)) {
      for (const [profile, model] of Object.entries(profiles)) {
        assert.ok(
          validModels.includes(model),
          `${agent}.${profile} = "${model}" is not a valid model`
        );
      }
    }
  });

  test('quality profile: planner uses opus', () => {
    assert.strictEqual(MODEL_PROFILES['gsd-planner'].quality, 'opus');
  });

  test('balanced profile: executor uses sonnet', () => {
    assert.strictEqual(MODEL_PROFILES['gsd-executor'].balanced, 'sonnet');
  });

  test('budget profile: cataloger uses haiku', () => {
    assert.strictEqual(MODEL_PROFILES['gsd-cataloger'].budget, 'haiku');
  });
});

// ─── VALID_PROFILES ──────────────────────────────────────────────────────────

test('VALID_PROFILES contains quality, balanced, budget', () => {
  const { VALID_PROFILES } = require('../get-shit-done/bin/lib/model-profiles.cjs');
  assert.deepStrictEqual(VALID_PROFILES, ['quality', 'balanced', 'budget']);
});

// ─── AGENT_ROUTING ───────────────────────────────────────────────────────────

describe('AGENT_ROUTING', () => {
  const { AGENT_ROUTING } = require('../get-shit-done/bin/lib/model-profiles.cjs');

  test('all routing entries have valid route type', () => {
    for (const [agent, routing] of Object.entries(AGENT_ROUTING)) {
      assert.ok(
        ['local', 'remote'].includes(routing.route),
        `${agent} has invalid route: ${routing.route}`
      );
    }
  });

  test('remote routes must have provider', () => {
    for (const [agent, routing] of Object.entries(AGENT_ROUTING)) {
      if (routing.route === 'remote') {
        assert.ok(routing.provider, `${agent} is remote but missing provider`);
      }
    }
  });

  test('gsd-assumptions-analyzer routes remote to deepseek-v3', () => {
    assert.strictEqual(AGENT_ROUTING['gsd-assumptions-analyzer'].route, 'remote');
    assert.strictEqual(AGENT_ROUTING['gsd-assumptions-analyzer'].provider, 'deepseek-v3');
  });

  test('gsd-plan-checker routes local (per D-07)', () => {
    assert.strictEqual(AGENT_ROUTING['gsd-plan-checker'].route, 'local');
    assert.strictEqual(AGENT_ROUTING['gsd-plan-checker'].provider, undefined);
  });
});

// ─── LEAN_MODEL_OVERRIDES ────────────────────────────────────────────────────

describe('LEAN_MODEL_OVERRIDES', () => {
  const { LEAN_MODEL_OVERRIDES } = require('../get-shit-done/bin/lib/model-profiles.cjs');

  test('overrides use haiku model', () => {
    for (const [agent, model] of Object.entries(LEAN_MODEL_OVERRIDES)) {
      assert.strictEqual(model, 'haiku', `${agent} override should be haiku`);
    }
  });

  test('cataloger is overridden in lean mode', () => {
    assert.strictEqual(LEAN_MODEL_OVERRIDES['gsd-cataloger'], 'haiku');
  });

  test('does not contain plan-checker (moved to local)', () => {
    assert.strictEqual(LEAN_MODEL_OVERRIDES['gsd-plan-checker'], undefined);
  });

  test('still contains other remote agents', () => {
    assert.strictEqual(LEAN_MODEL_OVERRIDES['gsd-cataloger'], 'haiku');
    assert.strictEqual(LEAN_MODEL_OVERRIDES['gsd-nyquist-auditor'], 'haiku');
  });
});

// ─── formatAgentToModelMapAsTable ────────────────────────────────────────────

describe('formatAgentToModelMapAsTable', () => {
  const { formatAgentToModelMapAsTable, getAgentToModelMapForProfile } = require('../get-shit-done/bin/lib/model-profiles.cjs');

  test('returns table with header and agent entries', () => {
    const map = getAgentToModelMapForProfile('quality');
    const table = formatAgentToModelMapAsTable(map);
    assert.ok(table.includes('Agent'));
    assert.ok(table.includes('gsd-planner'));
  });
});

// ─── getAgentToModelMapForProfile ────────────────────────────────────────────

describe('getAgentToModelMapForProfile', () => {
  const { getAgentToModelMapForProfile } = require('../get-shit-done/bin/lib/model-profiles.cjs');

  test('returns agent-to-model object for quality', () => {
    const map = getAgentToModelMapForProfile('quality');
    assert.strictEqual(map['gsd-planner'], 'opus');
    assert.strictEqual(typeof map, 'object');
  });

  test('returns agent-to-model object for balanced', () => {
    const map = getAgentToModelMapForProfile('balanced');
    assert.strictEqual(map['gsd-executor'], 'sonnet');
  });
});

// ─── resolveExecutionMode ────────────────────────────────────────────────────

test('resolveExecutionMode: CLI flag overrides config', () => {
  const { resolveExecutionMode } = require('../get-shit-done/bin/lib/model-profiles.cjs');
  assert.strictEqual(resolveExecutionMode({ cliFlag: 'full', configMode: 'lean' }), 'full');
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

// ─── EFFORT_PROFILES ──────────────────────────────────────────────────────────

describe('EFFORT_PROFILES', () => {
  const { EFFORT_PROFILES, VALID_EFFORT_LEVELS } = require('../get-shit-done/bin/lib/model-profiles.cjs');

  test('contains all 16 agents from D-06 allocation table', () => {
    const expectedAgents = [
      'gsd-planner', 'gsd-executor', 'gsd-phase-researcher', 'gsd-project-researcher',
      'gsd-roadmapper', 'gsd-debugger', 'gsd-research-synthesizer', 'gsd-verifier',
      'gsd-plan-checker', 'gsd-codebase-mapper', 'gsd-integration-checker',
      'gsd-nyquist-auditor', 'gsd-ui-researcher', 'gsd-ui-checker', 'gsd-ui-auditor',
      'gsd-cataloger',
    ];
    for (const agent of expectedAgents) {
      assert.ok(EFFORT_PROFILES[agent], `Missing agent: ${agent}`);
    }
    assert.strictEqual(Object.keys(EFFORT_PROFILES).length, 16);
  });

  test('all effort values are valid levels', () => {
    for (const [agent, effort] of Object.entries(EFFORT_PROFILES)) {
      assert.ok(
        VALID_EFFORT_LEVELS.includes(effort),
        `${agent} has invalid effort "${effort}" — expected one of ${VALID_EFFORT_LEVELS.join(', ')}`
      );
    }
  });

  test('planner gets max effort (architecture decisions)', () => {
    assert.strictEqual(EFFORT_PROFILES['gsd-planner'], 'max');
  });

  test('executor gets medium effort (follows plan)', () => {
    assert.strictEqual(EFFORT_PROFILES['gsd-executor'], 'medium');
  });

  test('researchers get high effort (synthesis work)', () => {
    assert.strictEqual(EFFORT_PROFILES['gsd-phase-researcher'], 'high');
    assert.strictEqual(EFFORT_PROFILES['gsd-project-researcher'], 'high');
    assert.strictEqual(EFFORT_PROFILES['gsd-ui-researcher'], 'high');
  });

  test('checkers and auditors get low effort (pass/fail)', () => {
    assert.strictEqual(EFFORT_PROFILES['gsd-verifier'], 'low');
    assert.strictEqual(EFFORT_PROFILES['gsd-plan-checker'], 'low');
    assert.strictEqual(EFFORT_PROFILES['gsd-codebase-mapper'], 'low');
    assert.strictEqual(EFFORT_PROFILES['gsd-nyquist-auditor'], 'low');
  });
});

// ─── VALID_EFFORT_LEVELS ──────────────────────────────────────────────────────

test('VALID_EFFORT_LEVELS contains low, medium, high, max', () => {
  const { VALID_EFFORT_LEVELS } = require('../get-shit-done/bin/lib/model-profiles.cjs');
  assert.deepStrictEqual(VALID_EFFORT_LEVELS, ['low', 'medium', 'high', 'max']);
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
