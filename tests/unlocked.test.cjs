/**
 * GSD Tools Tests - Unlocked Phases
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { runGsdTools, createTempProject, createTempDir, cleanup } = require('./helpers.cjs');

// ─── Helper: write a ROADMAP with configurable phases ────────────────────────

function writeRoadmap(tmpDir, opts = {}) {
  const { phases = [] } = opts;

  let checklist = '';
  let details = '';

  for (const p of phases) {
    const check = p.complete ? 'x' : ' ';
    checklist += `- [${check}] **Phase ${p.num}: ${p.name}** - Description\n`;

    const dep = p.dependsOn || 'Nothing';
    details += `\n### Phase ${p.num}: ${p.name}\n**Goal**: Build ${p.name}\n**Depends on**: ${dep}\n**Success Criteria**:\n  1. ${p.name} works\n`;
  }

  const content = `# Roadmap\n\n## Phases\n\n${checklist}\n## Phase Details\n${details}`;
  fs.writeFileSync(path.join(tmpDir, '.planning', 'ROADMAP.md'), content);
}

// ─── Helper: create phase directory with optional artifacts ──────────────────

function createPhaseDir(tmpDir, num, name, opts = {}) {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const dirName = `${num}-${slug}`;
  const phaseDir = path.join(tmpDir, '.planning', 'phases', dirName);
  fs.mkdirSync(phaseDir, { recursive: true });

  if (opts.plans) {
    for (const plan of opts.plans) {
      const filesModified = plan.files || [];
      const fmLines = filesModified.map(f => `  - "${f}"`).join('\n');
      const fm = filesModified.length > 0
        ? `---\nphase: "${num}"\nplan: "${plan.id}"\ntype: implementation\nwave: ${plan.wave || 1}\ndepends_on: ""\nfiles_modified:\n${fmLines}\nautonomous: true\nmust_haves: []\n---\n\n`
        : `---\nphase: "${num}"\nplan: "${plan.id}"\ntype: implementation\nwave: 1\ndepends_on: ""\nfiles_modified: []\nautonomous: true\nmust_haves: []\n---\n\n`;
      fs.writeFileSync(path.join(phaseDir, `${plan.id}-PLAN.md`), `${fm}# Plan ${plan.id}\n`);
    }
  } else if (opts.hasPlan) {
    const filesModified = opts.filesModified || [];
    const fmLines = filesModified.map(f => `  - "${f}"`).join('\n');
    const fm = filesModified.length > 0
      ? `---\nfiles_modified:\n${fmLines}\n---\n\n`
      : '---\nfiles_modified: []\n---\n\n';
    fs.writeFileSync(path.join(phaseDir, 'PLAN.md'), `${fm}# Plan for Phase ${num}\n`);
  }

  if (opts.summaries) {
    for (const s of opts.summaries) {
      fs.writeFileSync(path.join(phaseDir, `${s}-SUMMARY.md`), `---\nphase: "${num}"\nplan: "${s}"\nsubsystem: test\ntags: []\nduration: 5m\ncompleted: "2026-04-05"\n---\n`);
    }
  } else if (opts.hasSummary) {
    fs.writeFileSync(path.join(phaseDir, 'SUMMARY.md'), `# Summary for Phase ${num}\nDone.\n`);
  }

  if (opts.verificationStatus) {
    fs.writeFileSync(
      path.join(phaseDir, 'VERIFICATION.md'),
      `---\nstatus: ${opts.verificationStatus}\n---\n\n# Verification\nChecked.\n`
    );
  }

  return phaseDir;
}

// ─── Classification tests ───────────────────────────────────────────────────

describe('unlocked: phase classification', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('classifies phases into in_progress, ready, blocked', () => {
    writeRoadmap(tmpDir, {
      phases: [
        { num: 1, name: 'Foundation', complete: true, dependsOn: 'Nothing' },
        { num: 2, name: 'Auth', complete: false, dependsOn: 'Phase 1' },
        { num: 3, name: 'API', complete: false, dependsOn: 'Phase 1' },
        { num: 4, name: 'UI', complete: false, dependsOn: 'Phase 2, Phase 3' },
      ],
    });

    createPhaseDir(tmpDir, 2, 'Auth', { hasPlan: true });

    const result = runGsdTools('unlocked json', tmpDir);
    assert.ok(result.success, `expected success, got: ${result.output}`);
    const out = JSON.parse(result.output);

    // Verify summary
    assert.strictEqual(out.summary.in_progress, 1);
    assert.strictEqual(out.summary.ready, 1);
    assert.strictEqual(out.summary.blocked, 1);

    // Phase 2: has plan, no verification → in_progress
    assert.strictEqual(out.in_progress[0].phase, '2');
    assert.strictEqual(out.in_progress[0].name, 'Auth');

    // Phase 3: deps satisfied, no artifacts → ready
    assert.strictEqual(out.ready[0].phase, '3');
    assert.strictEqual(out.ready[0].name, 'API');

    // Phase 4: deps not satisfied → blocked
    assert.strictEqual(out.blocked[0].phase, '4');
    assert.deepStrictEqual(out.blocked[0].blocked_by, ['2', '3']);
    assert.deepStrictEqual(out.blocked[0].blocked_by_names, ['Auth', 'API']);
  });

  test('completed phases with passed verification are excluded', () => {
    writeRoadmap(tmpDir, {
      phases: [
        { num: 1, name: 'Foundation', complete: true, dependsOn: 'Nothing' },
        { num: 2, name: 'Auth', complete: true, dependsOn: 'Phase 1' },
      ],
    });

    createPhaseDir(tmpDir, 1, 'Foundation', { hasPlan: true, hasSummary: true, verificationStatus: 'passed' });
    createPhaseDir(tmpDir, 2, 'Auth', { hasPlan: true, hasSummary: true, verificationStatus: 'passed' });

    const result = runGsdTools('unlocked json', tmpDir);
    assert.ok(result.success);
    const out = JSON.parse(result.output);

    assert.strictEqual(out.summary.total_incomplete, 0);
    assert.deepStrictEqual(out.in_progress, []);
    assert.deepStrictEqual(out.ready, []);
    assert.deepStrictEqual(out.blocked, []);
  });

  test('phase with plan but no summary is in_progress', () => {
    writeRoadmap(tmpDir, {
      phases: [
        { num: 1, name: 'Foundation', complete: false, dependsOn: 'Nothing' },
      ],
    });

    createPhaseDir(tmpDir, 1, 'Foundation', { hasPlan: true, filesModified: ['src/index.js'] });

    const result = runGsdTools('unlocked json', tmpDir);
    assert.ok(result.success);
    const out = JSON.parse(result.output);

    assert.strictEqual(out.in_progress.length, 1);
    assert.strictEqual(out.in_progress[0].phase, '1');
    assert.ok(out.in_progress[0].has_plan);
    assert.deepStrictEqual(out.in_progress[0].files_modified, ['src/index.js']);
  });

  test('returns empty result when no planning dir exists', () => {
    const bareDir = createTempDir();

    const result = runGsdTools('unlocked json', bareDir);
    assert.ok(result.success);
    const out = JSON.parse(result.output);

    assert.strictEqual(out.summary.total_incomplete, 0);
    assert.deepStrictEqual(out.in_progress, []);
    assert.deepStrictEqual(out.ready, []);
    assert.deepStrictEqual(out.blocked, []);
    assert.ok(out.timestamp);

    cleanup(bareDir);
  });
});

// ─── Overlap & recommendation tests ─────────────────────────────────────────

describe('unlocked: overlap and recommendations', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('plan_first when ready phase has no plan', () => {
    writeRoadmap(tmpDir, {
      phases: [
        { num: 1, name: 'Foundation', complete: true, dependsOn: 'Nothing' },
        { num: 2, name: 'Auth', complete: false, dependsOn: 'Phase 1' },
      ],
    });

    // Phase 1 complete (no dir needed), Phase 2 has no phase dir

    const result = runGsdTools('unlocked json', tmpDir);
    assert.ok(result.success, `expected success, got: ${result.output}`);
    const out = JSON.parse(result.output);

    assert.strictEqual(out.ready.length, 1);
    const phase2 = out.ready[0];
    assert.strictEqual(phase2.phase, '2');
    assert.strictEqual(phase2.recommendation, 'plan_first');
    assert.strictEqual(phase2.overlap, null);
    assert.strictEqual(phase2.suggested_command, '/gsd:plan-phase 2');
  });

  test('safe_parallel when ready phase plan has no overlap with in_progress', () => {
    writeRoadmap(tmpDir, {
      phases: [
        { num: 1, name: 'Auth', complete: false, dependsOn: 'Nothing' },
        { num: 2, name: 'Foundation', complete: true, dependsOn: 'Nothing' },
        { num: 3, name: 'Reports', complete: false, dependsOn: 'Phase 2' },
      ],
    });

    // Phase 1: in_progress — has plan, no verification, touches src/auth.js
    createPhaseDir(tmpDir, 1, 'Auth', {
      hasPlan: true,
      filesModified: ['src/auth.js'],
    });

    // Phase 3: ready — has plan + summaries + passed verification, touches src/reports.js (no overlap)
    createPhaseDir(tmpDir, 3, 'Reports', {
      plans: [{ id: 'core', files: ['src/reports.js'], wave: 1 }],
      summaries: ['core'],
      verificationStatus: 'passed',
    });

    const result = runGsdTools('unlocked json', tmpDir);
    assert.ok(result.success, `expected success, got: ${result.output}`);
    const out = JSON.parse(result.output);

    assert.strictEqual(out.in_progress.length, 1);
    assert.strictEqual(out.in_progress[0].phase, '1');

    const phase3 = out.ready.find(r => r.phase === '3');
    assert.ok(phase3, 'Phase 3 should be in ready');
    assert.strictEqual(phase3.recommendation, 'safe_parallel');
    assert.strictEqual(phase3.overlap.score, 0);
  });

  test('worktree when ready phase overlaps files with in_progress phase', () => {
    writeRoadmap(tmpDir, {
      phases: [
        { num: 1, name: 'Auth', complete: false, dependsOn: 'Nothing' },
        { num: 2, name: 'Foundation', complete: true, dependsOn: 'Nothing' },
        { num: 3, name: 'Settings', complete: false, dependsOn: 'Phase 2' },
      ],
    });

    // Phase 1: in_progress — has plan, no verification, touches src/auth.js and src/middleware.js
    createPhaseDir(tmpDir, 1, 'Auth', {
      hasPlan: true,
      filesModified: ['src/auth.js', 'src/middleware.js'],
    });

    // Phase 3: ready — has plan + summaries + passed verification, touches src/settings.js and src/middleware.js (overlap!)
    createPhaseDir(tmpDir, 3, 'Settings', {
      plans: [{ id: 'core', files: ['src/settings.js', 'src/middleware.js'], wave: 1 }],
      summaries: ['core'],
      verificationStatus: 'passed',
    });

    const result = runGsdTools('unlocked json', tmpDir);
    assert.ok(result.success, `expected success, got: ${result.output}`);
    const out = JSON.parse(result.output);

    const phase3 = out.ready.find(r => r.phase === '3');
    assert.ok(phase3, 'Phase 3 should be in ready');
    assert.strictEqual(phase3.recommendation, 'worktree');
    assert.strictEqual(phase3.overlap.score, 1);
    assert.deepStrictEqual(phase3.overlap.conflicting_phases, ['1']);
    assert.deepStrictEqual(phase3.overlap.files, ['src/middleware.js']);
  });

  test('ready phases sorted: safe_parallel first, worktree second, plan_first last', () => {
    writeRoadmap(tmpDir, {
      phases: [
        { num: 1, name: 'Auth', complete: false, dependsOn: 'Nothing' },
        { num: 2, name: 'NoPlan', complete: false, dependsOn: 'Nothing' },
        { num: 3, name: 'Foundation', complete: true, dependsOn: 'Nothing' },
        { num: 4, name: 'Reports', complete: false, dependsOn: 'Phase 3' },
        { num: 5, name: 'Settings', complete: false, dependsOn: 'Phase 3' },
      ],
    });

    // Phase 1: in_progress — touches src/auth.js
    createPhaseDir(tmpDir, 1, 'Auth', {
      hasPlan: true,
      filesModified: ['src/auth.js'],
    });

    // Phase 2: ready — no plan → plan_first (no phase dir needed)

    // Phase 4: ready — plan + summaries + passed verification, no overlap → safe_parallel
    createPhaseDir(tmpDir, 4, 'Reports', {
      plans: [{ id: 'core', files: ['src/reports.js'], wave: 1 }],
      summaries: ['core'],
      verificationStatus: 'passed',
    });

    // Phase 5: ready — plan + summaries + passed verification, overlaps src/auth.js → worktree
    createPhaseDir(tmpDir, 5, 'Settings', {
      plans: [{ id: 'core', files: ['src/auth.js', 'src/settings.js'], wave: 1 }],
      summaries: ['core'],
      verificationStatus: 'passed',
    });

    const result = runGsdTools('unlocked json', tmpDir);
    assert.ok(result.success, `expected success, got: ${result.output}`);
    const out = JSON.parse(result.output);

    assert.strictEqual(out.ready.length, 3);
    assert.strictEqual(out.ready[0].recommendation, 'safe_parallel');
    assert.strictEqual(out.ready[1].recommendation, 'worktree');
    assert.strictEqual(out.ready[2].recommendation, 'plan_first');
  });
});
