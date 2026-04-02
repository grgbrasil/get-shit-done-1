/**
 * GSD Tools Tests - Fix-Phase Commands
 *
 * Tests for: cmdPhaseFreshness, cmdStateBeginFix, cmdStateEndFix, cmdInitFixPhase
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { runGsdTools, createTempProject, createTempGitProject, cleanup } = require('./helpers.cjs');

// ---------------------------------------------------------------------------
// phase freshness
// ---------------------------------------------------------------------------
describe('phase freshness command', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempGitProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('missing phase number returns error', () => {
    const result = runGsdTools('phase freshness', tmpDir);
    assert.strictEqual(result.success, false, 'should fail without phase number');
  });

  test('nonexistent phase returns error', () => {
    const result = runGsdTools('phase freshness 99', tmpDir);
    assert.strictEqual(result.success, false, 'should fail for missing phase');
  });

  test('phase with no summaries returns fresh with zero referenced files', () => {
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '03-api');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(phaseDir, '03-01-PLAN.md'), '# Plan 1\n');
    fs.writeFileSync(path.join(phaseDir, '03-01-SUMMARY.md'), '# Summary\nNo file paths here.\n');

    // Need a completion date — add ROADMAP.md
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'ROADMAP.md'),
      '## Phase 3 — API Layer completed 2024-01-01\n'
    );

    execSync('git add -A && git commit -m "add phase"', { cwd: tmpDir, stdio: 'pipe' });

    const result = runGsdTools('phase freshness 03', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.fresh, true, 'should be fresh');
    assert.strictEqual(output.staleness_pct, 0, 'staleness should be 0');
    assert.strictEqual(output.total_referenced, 0, 'no referenced files');
  });

  test('phase with referenced files and no changes is fresh', () => {
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '02-core');
    fs.mkdirSync(phaseDir, { recursive: true });

    // Create a source file
    const srcDir = path.join(tmpDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(path.join(srcDir, 'main.js'), 'console.log("hello");\n');

    // Summary references the file
    fs.writeFileSync(
      path.join(phaseDir, '02-01-SUMMARY.md'),
      '# Summary\nImplemented src/main.js with basic setup.\n'
    );
    fs.writeFileSync(path.join(phaseDir, '02-01-PLAN.md'), '# Plan\n');
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'ROADMAP.md'),
      '## Phase 02 — Core completed 2024-06-01\n'
    );

    // Commit with a date before completion so git log --since won't find changes
    execSync('git add -A && git commit -m "add phase 2" --date="2024-05-01T00:00:00"', { cwd: tmpDir, stdio: 'pipe' });

    // Use a future completion date so no commits appear after it
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'ROADMAP.md'),
      `## Phase 02 — Core completed ${tomorrow}\n`
    );
    execSync('git add -A && git commit -m "update roadmap"', { cwd: tmpDir, stdio: 'pipe' });

    const result = runGsdTools('phase freshness 02', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.fresh, true, 'should be fresh');
    assert.strictEqual(output.total_referenced, 1, 'one referenced file');
  });

  test('phase with changed referenced files reports stale', () => {
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '01-setup');
    fs.mkdirSync(phaseDir, { recursive: true });

    const srcDir = path.join(tmpDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(path.join(srcDir, 'app.js'), 'v1\n');

    fs.writeFileSync(
      path.join(phaseDir, '01-01-SUMMARY.md'),
      '# Summary\nCreated src/app.js for the app entry.\n'
    );
    fs.writeFileSync(path.join(phaseDir, '01-01-PLAN.md'), '# Plan\n');
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'ROADMAP.md'),
      '## Phase 1 — Setup completed 2024-01-01\n'
    );

    execSync('git add -A && git commit -m "initial" --date="2024-01-01T00:00:00"', { cwd: tmpDir, stdio: 'pipe' });

    // Modify the file after completion date
    fs.writeFileSync(path.join(srcDir, 'app.js'), 'v2 — modified\n');
    execSync('git add -A && git commit -m "modify app.js"', { cwd: tmpDir, stdio: 'pipe' });

    const result = runGsdTools('phase freshness 01', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.fresh, false, 'should be stale');
    assert.strictEqual(output.staleness_pct, 100, '100% files changed');
    assert.ok(output.changed_files.includes('src/app.js'), 'should list changed file');
  });
});

// ---------------------------------------------------------------------------
// state begin-fix
// ---------------------------------------------------------------------------
describe('state begin-fix command', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('missing phase number returns error', () => {
    const result = runGsdTools('state begin-fix', tmpDir);
    assert.strictEqual(result.success, false, 'should fail without phase');
  });

  test('missing STATE.md returns error json', () => {
    const result = runGsdTools('state begin-fix --phase 03 --name "API" --plans 2', tmpDir);
    assert.ok(result.success, `Command should succeed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.error, 'STATE.md not found');
  });

  test('updates STATE.md with fixing status', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'STATE.md'),
      `# Project State

**Status:** Ready to plan
**Last Activity:** 2024-01-01
**Last Activity Description:** Completed phase 2

## Current Position
Status: Ready to plan
Last activity: 2024-01-01 -- Completed phase 2
`
    );

    const result = runGsdTools('state begin-fix --phase 03 --name "API Layer" --plans 2', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.ok(output.updated.includes('Status'), 'should update Status');
    assert.strictEqual(output.phase, '03');

    // Verify file was written
    const stateContent = fs.readFileSync(path.join(tmpDir, '.planning', 'STATE.md'), 'utf-8');
    assert.ok(stateContent.includes('Fixing Phase 03'), 'STATE.md should contain fixing status');
    assert.ok(stateContent.includes('Fix-phase 03 started'), 'should have activity description');
  });
});

// ---------------------------------------------------------------------------
// state end-fix
// ---------------------------------------------------------------------------
describe('state end-fix command', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('missing phase number returns error', () => {
    const result = runGsdTools('state end-fix', tmpDir);
    assert.strictEqual(result.success, false, 'should fail without phase');
  });

  test('missing STATE.md returns error json', () => {
    const result = runGsdTools('state end-fix --phase 03', tmpDir);
    assert.ok(result.success, `Command should succeed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.error, 'STATE.md not found');
  });

  test('restores STATE.md after fix completes', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'STATE.md'),
      `# Project State

**Status:** Fixing Phase 03
**Last Activity:** 2024-06-15
**Last Activity Description:** Fix-phase 03 started (2 fix plans)

## Current Position
Status: Fixing Phase 03
Last activity: 2024-06-15 -- Fix-phase 03 started (2 fix plans)
`
    );

    const result = runGsdTools('state end-fix --phase 03', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.ok(output.updated.includes('Status'), 'should update Status');
    assert.strictEqual(output.phase, '03');

    // Verify file was written
    const stateContent = fs.readFileSync(path.join(tmpDir, '.planning', 'STATE.md'), 'utf-8');
    assert.ok(stateContent.includes('Ready to plan'), 'STATUS should be restored');
    assert.ok(stateContent.includes('Fix-phase 03 completed'), 'should have completion description');
  });

  test('begin-fix then end-fix round-trip', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'STATE.md'),
      `# Project State

**Status:** Ready to plan
**Last Activity:** 2024-01-01
**Last Activity Description:** Phase 2 done

## Current Position
Status: Ready to plan
Last activity: 2024-01-01 -- Phase 2 done
`
    );

    // Begin fix
    const beginResult = runGsdTools('state begin-fix --phase 05 --name "UI" --plans 3', tmpDir);
    assert.ok(beginResult.success, `begin-fix failed: ${beginResult.error}`);

    let stateContent = fs.readFileSync(path.join(tmpDir, '.planning', 'STATE.md'), 'utf-8');
    assert.ok(stateContent.includes('Fixing Phase 05'), 'should be in fixing state');

    // End fix
    const endResult = runGsdTools('state end-fix --phase 05', tmpDir);
    assert.ok(endResult.success, `end-fix failed: ${endResult.error}`);

    stateContent = fs.readFileSync(path.join(tmpDir, '.planning', 'STATE.md'), 'utf-8');
    assert.ok(stateContent.includes('Ready to plan'), 'should be restored after end-fix');
    assert.ok(stateContent.includes('Fix-phase 05 completed'), 'should show completion');
  });
});

// ---------------------------------------------------------------------------
// init fix-phase
// ---------------------------------------------------------------------------
describe('init fix-phase command', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('missing phase returns error', () => {
    const result = runGsdTools('init fix-phase', tmpDir);
    assert.strictEqual(result.success, false, 'should fail without phase');
  });

  test('nonexistent phase returns error', () => {
    const result = runGsdTools('init fix-phase 99', tmpDir);
    assert.strictEqual(result.success, false, 'should fail for missing phase');
  });

  test('returns phase metadata and artifact inventory', () => {
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '03-api');
    fs.mkdirSync(phaseDir, { recursive: true });

    // Create plans and summaries (completed phase)
    fs.writeFileSync(path.join(phaseDir, '03-01-PLAN.md'), '# Plan 1\n');
    fs.writeFileSync(path.join(phaseDir, '03-01-SUMMARY.md'), '# Summary 1\n');
    fs.writeFileSync(path.join(phaseDir, '03-02-PLAN.md'), '# Plan 2\n');
    fs.writeFileSync(path.join(phaseDir, '03-02-SUMMARY.md'), '# Summary 2\n');

    // Create context and research
    fs.writeFileSync(path.join(phaseDir, '03-CONTEXT.md'), '# Context\n');
    fs.writeFileSync(path.join(phaseDir, '03-RESEARCH.md'), '# Research\n');
    fs.writeFileSync(path.join(phaseDir, '03-VERIFICATION.md'), '# Verification\n');

    const result = runGsdTools('init fix-phase 03', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);

    // Phase info
    assert.strictEqual(output.phase_found, true);
    assert.strictEqual(output.phase_completed, true, 'all plans have summaries');
    assert.strictEqual(output.phase_number, '03');
    assert.ok(output.phase_dir.includes('03-api'));

    // Plan inventory
    assert.strictEqual(output.plan_count, 2);
    assert.strictEqual(output.next_plan_num, 3, 'next plan should be 3');

    // Artifacts
    assert.strictEqual(output.artifacts.has_context, true);
    assert.strictEqual(output.artifacts.has_research, true);
    assert.strictEqual(output.artifacts.has_verification, true);
    assert.strictEqual(output.artifacts.fix_gaps_exists, false);
    assert.strictEqual(output.artifacts.fix_context_exists, false);

    // File paths
    assert.strictEqual(output.state_path, '.planning/STATE.md');
    assert.strictEqual(output.roadmap_path, '.planning/ROADMAP.md');
  });

  test('detects incomplete phase (missing summaries)', () => {
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '04-ui');
    fs.mkdirSync(phaseDir, { recursive: true });

    fs.writeFileSync(path.join(phaseDir, '04-01-PLAN.md'), '# Plan 1\n');
    fs.writeFileSync(path.join(phaseDir, '04-01-SUMMARY.md'), '# Summary 1\n');
    fs.writeFileSync(path.join(phaseDir, '04-02-PLAN.md'), '# Plan 2\n');
    // No summary for plan 2 — incomplete

    const result = runGsdTools('init fix-phase 04', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.phase_completed, false, 'phase should be incomplete');
  });

  test('detects existing fix artifacts', () => {
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '02-core');
    fs.mkdirSync(phaseDir, { recursive: true });

    fs.writeFileSync(path.join(phaseDir, '02-01-PLAN.md'), '# Plan\n');
    fs.writeFileSync(path.join(phaseDir, '02-01-SUMMARY.md'), '# Summary\n');
    fs.writeFileSync(path.join(phaseDir, 'FIX-GAPS.md'), '# Gaps\n');
    fs.writeFileSync(path.join(phaseDir, 'FIX-CONTEXT.md'), '# Fix Context\n');
    fs.writeFileSync(path.join(phaseDir, 'FIX-CODEBASE.md'), '# Fix Codebase\n');

    const result = runGsdTools('init fix-phase 02', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.artifacts.fix_gaps_exists, true, 'should detect FIX-GAPS.md');
    assert.strictEqual(output.artifacts.fix_context_exists, true, 'should detect FIX-CONTEXT.md');
    assert.strictEqual(output.artifacts.fix_codebase_exists, true, 'should detect FIX-CODEBASE.md');
  });

  test('counts existing fix plans', () => {
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '03-api');
    fs.mkdirSync(phaseDir, { recursive: true });

    // Regular plans
    fs.writeFileSync(path.join(phaseDir, '03-01-PLAN.md'), '# Plan 1\n');
    fs.writeFileSync(path.join(phaseDir, '03-01-SUMMARY.md'), '# Summary 1\n');

    // Fix plan (has fix: true in frontmatter)
    fs.writeFileSync(path.join(phaseDir, '03-02-PLAN.md'), '---\nfix: true\nfixes_gaps: [GAP-01]\n---\n# Fix Plan\n');
    fs.writeFileSync(path.join(phaseDir, '03-02-SUMMARY.md'), '# Fix Summary\n');

    const result = runGsdTools('init fix-phase 03', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.fix_plan_count, 1, 'should count one fix plan');
    assert.strictEqual(output.plan_count, 2, 'total plans should be 2');
    assert.strictEqual(output.next_plan_num, 3, 'next plan num should be 3');
  });
});
