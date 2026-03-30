/**
 * Preflight dependency resolver tests
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { runGsdTools, createTempProject, cleanup } = require('./helpers.cjs');

// ─── Helpers ────────────────────────────────────────────────────────────────

function seedPhaseDir(tmpDir, phaseNum, phaseName) {
  const dirName = `${String(phaseNum).padStart(2, '0')}-${phaseName}`;
  const phaseDir = path.join(tmpDir, '.planning', 'phases', dirName);
  fs.mkdirSync(phaseDir, { recursive: true });
  return phaseDir;
}

function seedContext(tmpDir, phaseNum, phaseName) {
  const phaseDir = seedPhaseDir(tmpDir, phaseNum, phaseName);
  fs.writeFileSync(path.join(phaseDir, 'CONTEXT.md'), '# Context\n\nDiscussion results.\n');
  return phaseDir;
}

function seedConfig(tmpDir, overrides = {}) {
  const configPath = path.join(tmpDir, '.planning', 'config.json');
  const base = { workflow: {} };
  const merged = { ...base, workflow: { ...base.workflow, ...overrides } };
  fs.writeFileSync(configPath, JSON.stringify(merged, null, 2));
}

function seedRoadmap(tmpDir, content) {
  fs.writeFileSync(path.join(tmpDir, '.planning', 'ROADMAP.md'), content);
}

function seedPlans(tmpDir, phaseNum, phaseName, planFiles) {
  const phaseDir = seedPhaseDir(tmpDir, phaseNum, phaseName);
  for (const pf of planFiles) {
    fs.writeFileSync(path.join(phaseDir, pf), '---\nphase: test\n---\n# Plan\n');
  }
  return phaseDir;
}

function seedSummaries(tmpDir, phaseNum, phaseName, summaryFiles) {
  const phaseDir = seedPhaseDir(tmpDir, phaseNum, phaseName);
  for (const sf of summaryFiles) {
    fs.writeFileSync(path.join(phaseDir, sf), '---\nphase: test\n---\n# Summary\n');
  }
  return phaseDir;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('preflight', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject('preflight-test-');
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  describe('plan-phase command', () => {
    it('returns ready:true when CONTEXT.md present', () => {
      seedContext(tmpDir, 1, 'test-phase');
      seedRoadmap(tmpDir, '## Phase 1: Test Phase\n\n**Goal**: Build something\n\n**Depends on:** nothing\n');
      const result = runGsdTools(['preflight', 'plan-phase', '1'], tmpDir);
      assert.ok(result.success, `Expected success but got: ${result.error}`);
      const json = JSON.parse(result.output);
      assert.equal(json.ready, true);
      assert.deepEqual(json.blockers, []);
    });

    it('returns missing_context blocker without CONTEXT.md', () => {
      seedPhaseDir(tmpDir, 1, 'test-phase');
      seedRoadmap(tmpDir, '## Phase 1: Test Phase\n\n**Goal**: Build something\n\n**Depends on:** nothing\n');
      const result = runGsdTools(['preflight', 'plan-phase', '1'], tmpDir);
      assert.ok(result.success, `Expected success but got: ${result.error}`);
      const json = JSON.parse(result.output);
      assert.equal(json.ready, false);
      const blocker = json.blockers.find(b => b.type === 'missing_context');
      assert.ok(blocker, 'Expected missing_context blocker');
      assert.equal(blocker.severity, 'warning');
      assert.equal(blocker.skippable, true);
      assert.ok(blocker.command.includes('discuss-phase'));
    });

    it('skip_discuss:true suppresses missing_context blocker', () => {
      seedPhaseDir(tmpDir, 1, 'test-phase');
      seedConfig(tmpDir, { skip_discuss: true });
      seedRoadmap(tmpDir, '## Phase 1: Test Phase\n\n**Goal**: Build something\n\n**Depends on:** nothing\n');
      const result = runGsdTools(['preflight', 'plan-phase', '1'], tmpDir);
      assert.ok(result.success, `Expected success but got: ${result.error}`);
      const json = JSON.parse(result.output);
      assert.equal(json.ready, true);
      assert.ok(!json.blockers.find(b => b.type === 'missing_context'));
    });

    it('discuss_mode:skip suppresses missing_context blocker', () => {
      seedPhaseDir(tmpDir, 1, 'test-phase');
      seedConfig(tmpDir, { discuss_mode: 'skip' });
      seedRoadmap(tmpDir, '## Phase 1: Test Phase\n\n**Goal**: Build something\n\n**Depends on:** nothing\n');
      const result = runGsdTools(['preflight', 'plan-phase', '1'], tmpDir);
      assert.ok(result.success, `Expected success but got: ${result.error}`);
      const json = JSON.parse(result.output);
      assert.equal(json.ready, true);
    });

    it('UI phase without UI-SPEC.md returns missing_ui_spec blocker', () => {
      seedPhaseDir(tmpDir, 2, 'dashboard-redesign');
      seedContext(tmpDir, 2, 'dashboard-redesign');
      seedConfig(tmpDir, { ui_safety_gate: true });
      seedRoadmap(tmpDir, '## Phase 2: Dashboard Redesign\n\n**Goal**: Build the dashboard\n\n**Depends on:** nothing\n');
      const result = runGsdTools(['preflight', 'plan-phase', '2'], tmpDir);
      assert.ok(result.success, `Expected success but got: ${result.error}`);
      const json = JSON.parse(result.output);
      const blocker = json.blockers.find(b => b.type === 'missing_ui_spec');
      assert.ok(blocker, 'Expected missing_ui_spec blocker');
      assert.equal(blocker.severity, 'warning');
      assert.equal(blocker.skippable, true);
    });

    it('phase with "interface refactoring" in goal does NOT trigger UI blocker', () => {
      seedPhaseDir(tmpDir, 3, 'api-interface-refactoring');
      seedContext(tmpDir, 3, 'api-interface-refactoring');
      seedConfig(tmpDir, { ui_safety_gate: true });
      seedRoadmap(tmpDir, '## Phase 3: API Interface Refactoring\n\n**Goal**: Refactor the interface contracts\n\n**Depends on:** nothing\n');
      const result = runGsdTools(['preflight', 'plan-phase', '3'], tmpDir);
      assert.ok(result.success, `Expected success but got: ${result.error}`);
      const json = JSON.parse(result.output);
      assert.ok(!json.blockers.find(b => b.type === 'missing_ui_spec'), 'Should NOT have UI blocker for "interface refactoring"');
    });

    it('ui_safety_gate:false suppresses UI blocker', () => {
      seedPhaseDir(tmpDir, 2, 'dashboard-redesign');
      seedContext(tmpDir, 2, 'dashboard-redesign');
      seedConfig(tmpDir, { ui_safety_gate: false });
      seedRoadmap(tmpDir, '## Phase 2: Dashboard Redesign\n\n**Goal**: Build the dashboard\n\n**Depends on:** nothing\n');
      const result = runGsdTools(['preflight', 'plan-phase', '2'], tmpDir);
      assert.ok(result.success, `Expected success but got: ${result.error}`);
      const json = JSON.parse(result.output);
      assert.ok(!json.blockers.find(b => b.type === 'missing_ui_spec'));
    });

    it('ui_phase:false suppresses UI blocker', () => {
      seedPhaseDir(tmpDir, 2, 'dashboard-redesign');
      seedContext(tmpDir, 2, 'dashboard-redesign');
      seedConfig(tmpDir, { ui_phase: false });
      seedRoadmap(tmpDir, '## Phase 2: Dashboard Redesign\n\n**Goal**: Build the dashboard\n\n**Depends on:** nothing\n');
      const result = runGsdTools(['preflight', 'plan-phase', '2'], tmpDir);
      assert.ok(result.success, `Expected success but got: ${result.error}`);
      const json = JSON.parse(result.output);
      assert.ok(!json.blockers.find(b => b.type === 'missing_ui_spec'));
    });

    it('incomplete dependency returns blocking blocker', () => {
      seedPhaseDir(tmpDir, 1, 'foundation');
      seedPhaseDir(tmpDir, 2, 'dependent-phase');
      seedContext(tmpDir, 2, 'dependent-phase');
      seedRoadmap(tmpDir, [
        '## Phase 1: Foundation',
        '',
        '**Goal**: Setup base',
        '',
        '**Depends on:** nothing',
        '',
        '## Phase 2: Dependent Phase',
        '',
        '**Goal**: Build on foundation',
        '',
        '**Depends on:** Phase 1',
        '',
      ].join('\n'));
      const result = runGsdTools(['preflight', 'plan-phase', '2'], tmpDir);
      assert.ok(result.success, `Expected success but got: ${result.error}`);
      const json = JSON.parse(result.output);
      const blocker = json.blockers.find(b => b.type === 'incomplete_dependency');
      assert.ok(blocker, 'Expected incomplete_dependency blocker');
      assert.equal(blocker.severity, 'blocking');
      assert.equal(blocker.skippable, false);
    });
  });

  describe('execute-phase command', () => {
    it('returns no_plans blocker when no plans exist', () => {
      seedPhaseDir(tmpDir, 4, 'empty-phase');
      seedRoadmap(tmpDir, '## Phase 4: Empty Phase\n\n**Goal**: Nothing yet\n\n**Depends on:** nothing\n');
      const result = runGsdTools(['preflight', 'execute-phase', '4'], tmpDir);
      assert.ok(result.success, `Expected success but got: ${result.error}`);
      const json = JSON.parse(result.output);
      const blocker = json.blockers.find(b => b.type === 'no_plans');
      assert.ok(blocker, 'Expected no_plans blocker');
      assert.equal(blocker.severity, 'blocking');
      assert.equal(blocker.skippable, false);
    });

    it('returns ready:true when plans exist', () => {
      seedPlans(tmpDir, 4, 'has-plans', ['04-01-PLAN.md']);
      // Mark dependency as complete for clean test
      seedSummaries(tmpDir, 4, 'has-plans', []);
      seedRoadmap(tmpDir, '## Phase 4: Has Plans\n\n**Goal**: Do work\n\n**Depends on:** nothing\n');
      const result = runGsdTools(['preflight', 'execute-phase', '4'], tmpDir);
      assert.ok(result.success, `Expected success but got: ${result.error}`);
      const json = JSON.parse(result.output);
      assert.equal(json.ready, true);
    });
  });

  describe('ui-phase command', () => {
    it('returns missing_context blocker without CONTEXT.md', () => {
      seedPhaseDir(tmpDir, 1, 'test-phase');
      seedRoadmap(tmpDir, '## Phase 1: Test Phase\n\n**Goal**: Build something\n\n**Depends on:** nothing\n');
      const result = runGsdTools(['preflight', 'ui-phase', '1'], tmpDir);
      assert.ok(result.success, `Expected success but got: ${result.error}`);
      const json = JSON.parse(result.output);
      const blocker = json.blockers.find(b => b.type === 'missing_context');
      assert.ok(blocker, 'Expected missing_context blocker');
    });
  });

  describe('output structure', () => {
    it('all blockers have required fields', () => {
      seedPhaseDir(tmpDir, 1, 'test-phase');
      seedRoadmap(tmpDir, '## Phase 1: Test Phase\n\n**Goal**: Build something\n\n**Depends on:** nothing\n');
      const result = runGsdTools(['preflight', 'plan-phase', '1'], tmpDir);
      assert.ok(result.success, `Expected success but got: ${result.error}`);
      const json = JSON.parse(result.output);
      for (const blocker of json.blockers) {
        assert.ok('type' in blocker, 'blocker missing type');
        assert.ok('message' in blocker, 'blocker missing message');
        assert.ok('action' in blocker, 'blocker missing action');
        assert.ok('command' in blocker, 'blocker missing command');
        assert.ok('severity' in blocker, 'blocker missing severity');
        assert.ok('skippable' in blocker, 'blocker missing skippable');
      }
    });

    it('output JSON has all required top-level fields', () => {
      seedPhaseDir(tmpDir, 1, 'test-phase');
      seedRoadmap(tmpDir, '## Phase 1: Test Phase\n\n**Goal**: Build something\n\n**Depends on:** nothing\n');
      const result = runGsdTools(['preflight', 'plan-phase', '1'], tmpDir);
      assert.ok(result.success, `Expected success but got: ${result.error}`);
      const json = JSON.parse(result.output);
      assert.ok('ready' in json, 'missing ready field');
      assert.ok('blockers' in json, 'missing blockers field');
      assert.ok('next_action' in json, 'missing next_action field');
      assert.ok('next_command' in json, 'missing next_command field');
      assert.ok('phase_number' in json, 'missing phase_number field');
      assert.ok('command_checked' in json, 'missing command_checked field');
    });
  });
});
