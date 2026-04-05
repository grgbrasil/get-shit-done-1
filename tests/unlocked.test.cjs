/**
 * GSD Tools Tests - Unlocked Phases
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { runGsdTools, createTempProject, createTempDir, cleanup } = require('./helpers.cjs');

// ─── Helper: write a ROADMAP with configurable phases ────────────────────────

/**
 * Creates a multi-phase ROADMAP.md with configurable phases.
 * @param {string} tmpDir - temp project dir (must have .planning/)
 * @param {object} opts
 * @param {Array<{num: string|number, name: string, complete: boolean, dependsOn?: string}>} opts.phases
 */
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

/**
 * Creates a phase directory with optional PLANs, SUMMARYs, and VERIFICATION.
 * @param {string} tmpDir
 * @param {string|number} num
 * @param {string} name
 * @param {object} opts
 * @param {boolean} opts.hasPlan - create PLAN.md
 * @param {boolean} opts.hasSummary - create SUMMARY.md
 * @param {string} opts.verificationStatus - create VERIFICATION.md with this status
 * @param {string[]} opts.filesModified - files_modified frontmatter for PLAN.md
 */
function createPhaseDir(tmpDir, num, name, opts = {}) {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const dirName = `${num}-${slug}`;
  const phaseDir = path.join(tmpDir, '.planning', 'phases', dirName);
  fs.mkdirSync(phaseDir, { recursive: true });

  if (opts.hasPlan) {
    const filesModified = opts.filesModified || [];
    const fmLines = filesModified.map(f => `  - ${f}`).join('\n');
    const fm = filesModified.length > 0
      ? `---\nfiles_modified:\n${fmLines}\n---\n\n`
      : '---\nfiles_modified: []\n---\n\n';
    fs.writeFileSync(path.join(phaseDir, 'PLAN.md'), `${fm}# Plan for Phase ${num}\n`);
  }

  if (opts.hasSummary) {
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

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('unlocked: phase classification', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('classifies phases into in_progress, ready, blocked', () => {
    // Phase 1: complete
    // Phase 2: has plan → in_progress (depends on Phase 1 which is complete)
    // Phase 3: no artifacts, depends on Phase 1 (complete) → ready
    // Phase 4: depends on Phase 2 + Phase 3 → blocked (Phase 2 not complete)
    writeRoadmap(tmpDir, {
      phases: [
        { num: 1, name: 'Foundation', complete: true, dependsOn: 'Nothing' },
        { num: 2, name: 'Auth', complete: false, dependsOn: 'Phase 1' },
        { num: 3, name: 'API', complete: false, dependsOn: 'Phase 1' },
        { num: 4, name: 'UI', complete: false, dependsOn: 'Phase 2, Phase 3' },
      ],
    });

    createPhaseDir(tmpDir, 1, 'Foundation');
    createPhaseDir(tmpDir, 2, 'Auth', { hasPlan: true });
    // Phase 3: no artifacts at all → ready (deps satisfied, no plan = plan_first)
    // Phase 4: no dir needed

    const result = runGsdTools('unlocked json', tmpDir);
    assert.ok(result.success, `expected success, got: ${result.error || result.output}`);
    const out = JSON.parse(result.output);

    assert.ok(Array.isArray(out.in_progress), 'in_progress should be array');
    assert.ok(Array.isArray(out.ready), 'ready should be array');
    assert.ok(Array.isArray(out.blocked), 'blocked should be array');

    const ipNums = out.in_progress.map(p => String(p.phase_number));
    const readyNums = out.ready.map(p => String(p.phase_number));
    const blockedNums = out.blocked.map(p => String(p.phase_number));

    assert.ok(ipNums.includes('2'), 'Phase 2 should be in_progress');
    assert.ok(readyNums.includes('3'), 'Phase 3 should be ready');
    assert.ok(blockedNums.includes('4'), 'Phase 4 should be blocked');
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
    assert.ok(result.success, `expected success, got: ${result.error || result.output}`);
    const out = JSON.parse(result.output);

    assert.strictEqual(out.in_progress.length, 0, 'no in_progress phases');
    assert.strictEqual(out.ready.length, 0, 'no ready phases');
    assert.strictEqual(out.blocked.length, 0, 'no blocked phases');
  });

  test('phase with plan but no summary is in_progress', () => {
    writeRoadmap(tmpDir, {
      phases: [
        { num: 1, name: 'Foundation', complete: false, dependsOn: 'Nothing' },
      ],
    });

    createPhaseDir(tmpDir, 1, 'Foundation', { hasPlan: true });

    const result = runGsdTools('unlocked json', tmpDir);
    assert.ok(result.success, `expected success, got: ${result.error || result.output}`);
    const out = JSON.parse(result.output);

    assert.strictEqual(out.in_progress.length, 1);
    assert.strictEqual(String(out.in_progress[0].phase_number), '1');
  });

  test('returns empty arrays when no planning dir exists', () => {
    const bareDir = createTempDir();

    const result = runGsdTools('unlocked json', bareDir);
    assert.ok(result.success, `expected success, got: ${result.error || result.output}`);
    const out = JSON.parse(result.output);

    assert.strictEqual(out.in_progress.length, 0);
    assert.strictEqual(out.ready.length, 0);
    assert.strictEqual(out.blocked.length, 0);

    cleanup(bareDir);
  });
});
