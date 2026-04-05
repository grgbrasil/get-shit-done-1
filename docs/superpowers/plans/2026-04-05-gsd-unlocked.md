# `/gsd-unlocked` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/gsd-unlocked` command that shows which phases can be started now, with file overlap analysis and execution recommendations.

**Architecture:** New `unlocked.cjs` lib module exposes `cmdUnlocked()` that reads the roadmap, classifies all incomplete phases into in_progress/ready/blocked, calculates `files_modified` overlap between ready and in_progress phases, and outputs structured JSON. A new `commands/gsd/unlocked.md` skill formats and presents the output. The `gsd-tools.cjs` dispatcher gets a new `unlocked` case.

**Tech Stack:** Node.js (CJS), node:test, existing GSD lib infrastructure (core.cjs, roadmap.cjs, phase.cjs, preflight.cjs patterns)

---

### Task 1: Create `unlocked.cjs` engine with phase classification

**Files:**
- Create: `get-shit-done/bin/lib/unlocked.cjs`
- Test: `tests/unlocked.test.cjs`

- [ ] **Step 1: Write test helpers for unlocked scenarios**

Create `tests/unlocked.test.cjs` with a helper that builds a multi-phase roadmap with configurable dependencies and completion states:

```javascript
/**
 * GSD Tools Tests - Unlocked
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { runGsdTools, createTempProject, cleanup } = require('./helpers.cjs');

// ─── Helper: write a multi-phase ROADMAP ────────────────────────────────────

function writeRoadmap(tmpDir, opts = {}) {
  const {
    phases = [
      { num: 1, name: 'Foundation', complete: true, dependsOn: 'Nothing' },
      { num: 2, name: 'Auth', complete: false, dependsOn: 'Phase 1' },
      { num: 3, name: 'Dashboard', complete: false, dependsOn: 'Phase 1' },
      { num: 4, name: 'Billing', complete: false, dependsOn: 'Phase 2, Phase 3' },
    ],
  } = opts;

  let checklist = phases
    .map(p => `- [${p.complete ? 'x' : ' '}] **Phase ${p.num}: ${p.name}** - ${p.name} work`)
    .join('\n');

  let details = phases
    .map(p => `### Phase ${p.num}: ${p.name}\n**Goal**: Build ${p.name}\n**Depends on**: ${p.dependsOn}`)
    .join('\n\n');

  const content = `# Roadmap\n\n## Phases\n\n${checklist}\n\n## Phase Details\n\n${details}\n`;
  fs.writeFileSync(path.join(tmpDir, '.planning', 'ROADMAP.md'), content);
}

// ─── Helper: create phase dir with optional PLAN.md ─────────────────────────

function createPhaseDir(tmpDir, num, name, opts = {}) {
  const { plans = [], summaries = [], verification = null } = opts;
  const slug = name.toLowerCase().replace(/\s+/g, '-');
  const dirName = `${num}-${slug}`;
  const phaseDir = path.join(tmpDir, '.planning', 'phases', dirName);
  fs.mkdirSync(phaseDir, { recursive: true });

  for (const plan of plans) {
    const planContent = `---\nphase: "${num}"\nplan: "${plan.id}"\ntype: implementation\nwave: ${plan.wave || 1}\ndepends_on: ""\nfiles_modified:\n${(plan.files || []).map(f => `  - "${f}"`).join('\n')}\nautonomous: true\nmust_haves: []\n---\n\n# Plan ${plan.id}\n`;
    fs.writeFileSync(path.join(phaseDir, `${plan.id}-PLAN.md`), planContent);
  }

  for (const s of summaries) {
    fs.writeFileSync(path.join(phaseDir, `${s}-SUMMARY.md`), `---\nphase: "${num}"\nplan: "${s}"\nsubsystem: test\ntags: []\nduration: 5m\ncompleted: "2026-04-05"\n---\n`);
  }

  if (verification) {
    fs.writeFileSync(path.join(phaseDir, 'VERIFICATION.md'), `---\nphase: "${num}"\nverified: true\nstatus: ${verification}\nscore: 100\n---\n`);
  }

  return phaseDir;
}
```

- [ ] **Step 2: Write failing test for basic phase classification**

Add to `tests/unlocked.test.cjs`:

```javascript
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
    // Phase 1: complete (should not appear)
    // Phase 2: depends on Phase 1 (complete) + has PLAN → in_progress
    // Phase 3: depends on Phase 1 (complete) + no artifacts → ready
    // Phase 4: depends on Phase 2,3 (incomplete) → blocked
    writeRoadmap(tmpDir);
    createPhaseDir(tmpDir, 2, 'Auth', {
      plans: [{ id: 'core', files: ['src/auth.js'] }],
    });

    const result = runGsdTools('unlocked json', tmpDir);
    assert.ok(result.success, `Command failed: ${result.output}`);
    const out = JSON.parse(result.output);

    assert.strictEqual(out.summary.in_progress, 1, 'Phase 2 should be in_progress');
    assert.strictEqual(out.summary.ready, 1, 'Phase 3 should be ready');
    assert.strictEqual(out.summary.blocked, 1, 'Phase 4 should be blocked');

    assert.strictEqual(out.in_progress[0].phase, '2');
    assert.strictEqual(out.ready[0].phase, '3');
    assert.strictEqual(out.blocked[0].phase, '4');
    assert.deepStrictEqual(out.blocked[0].blocked_by, ['2', '3']);
  });

  test('completed phases with passed verification are excluded', () => {
    writeRoadmap(tmpDir, {
      phases: [
        { num: 1, name: 'Foundation', complete: true, dependsOn: 'Nothing' },
        { num: 2, name: 'Auth', complete: true, dependsOn: 'Phase 1' },
      ],
    });
    createPhaseDir(tmpDir, 1, 'Foundation', {
      plans: [{ id: 'setup', files: [] }],
      summaries: ['setup'],
      verification: 'passed',
    });
    createPhaseDir(tmpDir, 2, 'Auth', {
      plans: [{ id: 'core', files: [] }],
      summaries: ['core'],
      verification: 'passed',
    });

    const result = runGsdTools('unlocked json', tmpDir);
    assert.ok(result.success);
    const out = JSON.parse(result.output);
    assert.strictEqual(out.summary.total_incomplete, 0);
  });

  test('phase with plan but no summary is in_progress', () => {
    writeRoadmap(tmpDir, {
      phases: [
        { num: 1, name: 'Foundation', complete: false, dependsOn: 'Nothing' },
      ],
    });
    createPhaseDir(tmpDir, 1, 'Foundation', {
      plans: [{ id: 'setup', files: ['src/index.js'] }],
    });

    const result = runGsdTools('unlocked json', tmpDir);
    assert.ok(result.success);
    const out = JSON.parse(result.output);
    assert.strictEqual(out.in_progress.length, 1);
    assert.strictEqual(out.in_progress[0].phase, '1');
  });

  test('returns empty arrays when no planning dir exists', () => {
    const { createTempDir } = require('./helpers.cjs');
    const bare = createTempDir();
    const result = runGsdTools('unlocked json', bare);
    assert.ok(result.success);
    const out = JSON.parse(result.output);
    assert.strictEqual(out.summary.total_incomplete, 0);
    assert.deepStrictEqual(out.in_progress, []);
    assert.deepStrictEqual(out.ready, []);
    assert.deepStrictEqual(out.blocked, []);
    cleanup(bare);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd /Volumes/SSD/Desenvolvimento/get-shit-done && node --test tests/unlocked.test.cjs`
Expected: FAIL — `unlocked` command not recognized

- [ ] **Step 4: Implement `unlocked.cjs` engine**

Create `get-shit-done/bin/lib/unlocked.cjs`:

```javascript
/**
 * Unlocked — Show actionable phases with overlap analysis
 */

const fs = require('fs');
const path = require('path');
const {
  escapeRegex,
  normalizePhaseName,
  comparePhaseNum,
  planningDir,
  planningPaths,
  extractCurrentMilestone,
  getMilestonePhaseFilter,
  getRoadmapPhaseInternal,
  output,
  error,
  phaseTokenMatches,
} = require('./core.cjs');
const { extractFrontmatter } = require('./frontmatter.cjs');

/**
 * Determine if a phase directory represents "in progress" work.
 * In progress = has PLAN.md artifacts but no passed VERIFICATION.md.
 */
function isInProgress(phaseDir) {
  let files;
  try {
    files = fs.readdirSync(phaseDir);
  } catch {
    return false;
  }

  const hasPlans = files.some(f => f.endsWith('-PLAN.md') || f === 'PLAN.md');
  if (!hasPlans) return false;

  // Check verification status
  const verificationFile = files.find(f => f === 'VERIFICATION.md' || f.endsWith('-VERIFICATION.md'));
  if (verificationFile) {
    const content = fs.readFileSync(path.join(phaseDir, verificationFile), 'utf-8');
    if (/status:\s*passed/i.test(content)) return false; // Complete, not in progress
  }

  return true;
}

/**
 * Extract all files_modified from PLAN.md files in a phase directory.
 */
function extractFilesModified(phaseDir) {
  let files;
  try {
    files = fs.readdirSync(phaseDir);
  } catch {
    return null;
  }

  const planFiles = files.filter(f => f.endsWith('-PLAN.md') || f === 'PLAN.md');
  if (planFiles.length === 0) return null;

  const allFiles = new Set();
  for (const planFile of planFiles) {
    const content = fs.readFileSync(path.join(phaseDir, planFile), 'utf-8');
    const fm = extractFrontmatter(content);
    const fmFiles = fm['files_modified'] || fm['files-modified'];
    if (fmFiles) {
      const list = Array.isArray(fmFiles) ? fmFiles : [fmFiles];
      for (const f of list) allFiles.add(f);
    }
  }

  return allFiles.size > 0 ? [...allFiles] : [];
}

/**
 * Check if all dependencies of a phase are marked complete in the roadmap.
 * Returns { satisfied: true } or { satisfied: false, blockedBy: [...] }.
 */
function checkDependenciesSatisfied(roadmapContent, phaseSection) {
  const dependsMatch = phaseSection.match(/\*\*Depends on(?::\*\*|\*\*:)\s*([^\n]+)/i);
  if (!dependsMatch) return { satisfied: true, blockedBy: [], blockedByNames: [] };

  const dependsRaw = dependsMatch[1].trim();
  if (/^(nothing|none|—|-|n\/a)$/i.test(dependsRaw)) {
    return { satisfied: true, blockedBy: [], blockedByNames: [] };
  }

  const depNums = [];
  const phaseRefs = dependsRaw.matchAll(/(?:Phase\s+)?(\d+(?:\.\d+)*)/gi);
  for (const m of phaseRefs) {
    depNums.push(m[1]);
  }

  if (depNums.length === 0) return { satisfied: true, blockedBy: [], blockedByNames: [] };

  const blockedBy = [];
  const blockedByNames = [];

  for (const depNum of depNums) {
    const escaped = escapeRegex(depNum);
    const checkboxPattern = new RegExp(`-\\s*\\[(x| )\\]\\s*.*Phase\\s+${escaped}[:\\s]`, 'i');
    const match = roadmapContent.match(checkboxPattern);
    const isComplete = match ? match[1] === 'x' : false;

    if (!isComplete) {
      blockedBy.push(depNum);
      // Extract name from roadmap
      const namePattern = new RegExp(`Phase\\s+${escaped}:\\s*([^*\\n]+)`, 'i');
      const nameMatch = roadmapContent.match(namePattern);
      blockedByNames.push(nameMatch ? nameMatch[1].trim() : `Phase ${depNum}`);
    }
  }

  return {
    satisfied: blockedBy.length === 0,
    blockedBy,
    blockedByNames,
  };
}

/**
 * Calculate file overlap between a ready phase and all in-progress phases.
 */
function calculateOverlap(readyFiles, inProgressPhases) {
  if (!readyFiles || readyFiles.length === 0) {
    return { score: 0, conflicting_phases: [], files: [] };
  }

  const readySet = new Set(readyFiles);
  const conflictingPhases = [];
  const conflictingFiles = new Set();

  for (const ipPhase of inProgressPhases) {
    if (!ipPhase.files_modified) continue;
    const overlap = ipPhase.files_modified.filter(f => readySet.has(f));
    if (overlap.length > 0) {
      conflictingPhases.push(ipPhase.phase);
      for (const f of overlap) conflictingFiles.add(f);
    }
  }

  return {
    score: conflictingFiles.size,
    conflicting_phases: conflictingPhases,
    files: [...conflictingFiles],
  };
}

function cmdUnlocked(cwd, format, raw) {
  const pDir = planningDir(cwd);
  const paths = planningPaths(cwd);
  const isDirInMilestone = getMilestonePhaseFilter(cwd);

  // ── Read roadmap ──
  let roadmapContent;
  try {
    roadmapContent = extractCurrentMilestone(fs.readFileSync(paths.roadmap, 'utf-8'), cwd);
  } catch {
    // No roadmap — return empty result
    const empty = {
      timestamp: new Date().toISOString(),
      summary: { total_incomplete: 0, in_progress: 0, ready: 0, blocked: 0 },
      in_progress: [],
      ready: [],
      blocked: [],
    };
    output(empty, raw);
    return;
  }

  // ── Parse all phases from roadmap headings ──
  const headingPattern = /#{2,4}\s*Phase\s+(\d+[A-Z]?(?:\.\d+)*)\s*:\s*([^\n]+)/gi;
  const allPhases = [];
  let match;
  while ((match = headingPattern.exec(roadmapContent)) !== null) {
    allPhases.push({
      num: match[1],
      name: match[2].replace(/\(INSERTED\)/i, '').trim(),
    });
  }

  // ── Check which are complete in the checklist ──
  const completePhases = new Set();
  const checklistPattern = /-\s*\[(x)\]\s*.*Phase\s+(\d+[A-Z]?(?:\.\d+)*)[:\s]/gi;
  let cm;
  while ((cm = checklistPattern.exec(roadmapContent)) !== null) {
    completePhases.add(cm[2]);
  }

  // ── Build phase directory lookup ──
  const phasesDir = path.join(pDir, 'phases');
  const phaseDirMap = new Map(); // phaseNum → dirPath
  try {
    const entries = fs.readdirSync(phasesDir, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      if (!isDirInMilestone(e.name)) continue;
      const dm = e.name.match(/^(\d+[A-Z]?(?:\.\d+)*)/i);
      if (dm) phaseDirMap.set(dm[1], path.join(phasesDir, e.name));
    }
  } catch { /* no phases dir */ }

  // ── Classify phases ──
  const inProgress = [];
  const ready = [];
  const blocked = [];

  for (const phase of allPhases) {
    // Skip completed phases
    if (completePhases.has(phase.num)) continue;

    const phaseDir = phaseDirMap.get(phase.num);
    const hasDir = !!phaseDir;

    // Check if in progress (has plan artifacts, not verified)
    if (hasDir && isInProgress(phaseDir)) {
      const filesModified = extractFilesModified(phaseDir);
      inProgress.push({
        phase: phase.num,
        name: phase.name,
        has_plan: true,
        files_modified: filesModified,
      });
      continue;
    }

    // Get phase section for dependency check
    const phaseInfo = getRoadmapPhaseInternal(cwd, phase.num);
    const section = phaseInfo ? phaseInfo.section : '';
    const deps = checkDependenciesSatisfied(roadmapContent, section);

    if (!deps.satisfied) {
      blocked.push({
        phase: phase.num,
        name: phase.name,
        blocked_by: deps.blockedBy,
        blocked_by_names: deps.blockedByNames,
      });
    } else {
      const hasPlan = hasDir && extractFilesModified(phaseDir) !== null;
      const filesModified = hasPlan ? extractFilesModified(phaseDir) : null;
      ready.push({
        phase: phase.num,
        name: phase.name,
        has_plan: hasPlan,
        files_modified: filesModified,
      });
    }
  }

  // ── Calculate overlap and recommendations for ready phases ──
  for (const r of ready) {
    if (!r.has_plan) {
      r.overlap = null;
      r.recommendation = 'plan_first';
      r.suggested_command = `/gsd-plan-phase ${r.phase}`;
    } else {
      r.overlap = calculateOverlap(r.files_modified, inProgress);
      if (r.overlap.score === 0) {
        r.recommendation = 'safe_parallel';
        r.suggested_command = `/gsd-execute-phase ${r.phase}`;
      } else {
        r.recommendation = 'worktree';
        r.suggested_command = `/gsd-execute-phase ${r.phase} (recommend worktree)`;
      }
    }
  }

  // ── Sort ready phases: safe_parallel first, then worktree by score, then plan_first ──
  const recOrder = { safe_parallel: 0, worktree: 1, plan_first: 2 };
  ready.sort((a, b) => {
    const orderDiff = recOrder[a.recommendation] - recOrder[b.recommendation];
    if (orderDiff !== 0) return orderDiff;
    if (a.recommendation === 'worktree') {
      return (a.overlap?.score || 0) - (b.overlap?.score || 0);
    }
    return comparePhaseNum(a.phase, b.phase);
  });

  const result = {
    timestamp: new Date().toISOString(),
    summary: {
      total_incomplete: inProgress.length + ready.length + blocked.length,
      in_progress: inProgress.length,
      ready: ready.length,
      blocked: blocked.length,
    },
    in_progress: inProgress,
    ready,
    blocked,
  };

  if (format === 'table') {
    let out = '';

    if (ready.length > 0) {
      out += '## Unlocked — Ready to Start\n\n';
      for (const r of ready) {
        if (r.recommendation === 'safe_parallel') {
          out += ` SAFE     Phase ${r.phase}: ${r.name} — 0 file conflicts\n`;
          out += `          → ${r.suggested_command}\n\n`;
        } else if (r.recommendation === 'worktree') {
          const conflictDesc = r.overlap.score === 1 ? '1 file conflict' : `${r.overlap.score} file conflicts`;
          const withPhases = r.overlap.conflicting_phases.map(p => `Phase ${p}`).join(', ');
          out += ` WORKTREE Phase ${r.phase}: ${r.name} — ${conflictDesc} with ${withPhases}\n`;
          for (const f of r.overlap.files) {
            out += `          ${f}\n`;
          }
          out += `          → ${r.suggested_command}\n\n`;
        } else {
          out += ` PLAN     Phase ${r.phase}: ${r.name} — no plan yet, overlap unknown\n`;
          out += `          → ${r.suggested_command}\n\n`;
        }
      }
    }

    if (inProgress.length > 0) {
      out += `## In Progress (${inProgress.length})\n`;
      for (const ip of inProgress) {
        out += `  Phase ${ip.phase}: ${ip.name}\n`;
      }
      out += '\n';
    }

    if (blocked.length > 0) {
      out += `## Blocked (${blocked.length})\n`;
      for (const b of blocked) {
        out += `  Phase ${b.phase}: ${b.name} — waiting on ${b.blocked_by.map(n => `Phase ${n}`).join(', ')}\n`;
      }
      out += '\n';
    }

    if (ready.length === 0 && inProgress.length === 0 && blocked.length === 0) {
      out += 'All phases complete — nothing to unlock.\n';
    }

    output({ rendered: out }, raw, out);
  } else {
    output(result, raw);
  }
}

module.exports = { cmdUnlocked };
```

- [ ] **Step 5: Wire `unlocked` into `gsd-tools.cjs` dispatcher**

In `get-shit-done/bin/gsd-tools.cjs`, add a new case before the `default` case (line 964):

```javascript
    case 'unlocked': {
      const unlocked = require('./lib/unlocked.cjs');
      const subcommand = args[1] || 'json';
      unlocked.cmdUnlocked(cwd, subcommand, raw);
      break;
    }
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd /Volumes/SSD/Desenvolvimento/get-shit-done && node --test tests/unlocked.test.cjs`
Expected: All 4 tests PASS

- [ ] **Step 7: Commit**

```bash
git add tests/unlocked.test.cjs get-shit-done/bin/lib/unlocked.cjs get-shit-done/bin/gsd-tools.cjs
git commit -m "feat(unlocked): add engine for phase classification with overlap analysis"
```

---

### Task 2: Add overlap detection tests

**Files:**
- Modify: `tests/unlocked.test.cjs`

- [ ] **Step 1: Write failing tests for overlap detection**

Add to `tests/unlocked.test.cjs`:

```javascript
// ─── Overlap detection tests ────────────────────────────────────────────────

describe('unlocked: overlap detection', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('safe_parallel when ready phase has no file overlap with in_progress', () => {
    writeRoadmap(tmpDir, {
      phases: [
        { num: 1, name: 'Auth', complete: false, dependsOn: 'Nothing' },
        { num: 2, name: 'Notify', complete: false, dependsOn: 'Nothing' },
      ],
    });
    // Phase 1 in progress with plans
    createPhaseDir(tmpDir, 1, 'Auth', {
      plans: [{ id: 'core', files: ['src/auth.js'] }],
    });
    // Phase 2 ready with plans but different files
    createPhaseDir(tmpDir, 2, 'Notify', {
      plans: [{ id: 'core', files: ['src/notify.js'] }],
    });

    const result = runGsdTools('unlocked json', tmpDir);
    assert.ok(result.success);
    const out = JSON.parse(result.output);

    // Phase 1 is in_progress (has plan, no verification)
    // Phase 2 should be... wait, it also has a plan so it's in_progress too
    // Let me adjust: Phase 2 needs to be "ready" — give it a passed verification
    // Actually no — in_progress means has plan but not verified.
    // Both will be in_progress. Need a different setup.
    // Phase 2 should NOT have a phase dir to be "ready" (or have completed plans).
    // Rethink: ready means deps satisfied and NOT in_progress.
    // To be ready with a plan, it needs all summaries + no verification (Executed state)
    // OR it needs no plan dir at all (plan_first).
    // For overlap testing, we need a ready phase with plans AND files_modified.
    // That means: all summaries written but no VERIFICATION.md.
    assert.ok(true); // Placeholder — see adjusted test below
  });

  test('worktree recommended when ready phase overlaps with in_progress', () => {
    writeRoadmap(tmpDir, {
      phases: [
        { num: 1, name: 'Auth', complete: false, dependsOn: 'Nothing' },
        { num: 2, name: 'Dashboard', complete: false, dependsOn: 'Nothing' },
        { num: 3, name: 'Notify', complete: false, dependsOn: 'Nothing' },
      ],
    });

    // Phase 1 in progress (has plan, no summary)
    createPhaseDir(tmpDir, 1, 'Auth', {
      plans: [{ id: 'core', files: ['src/auth.js', 'src/middleware.js'] }],
    });
    // Phase 2 executed but not verified (all summaries done) — overlaps with Phase 1
    createPhaseDir(tmpDir, 2, 'Dashboard', {
      plans: [{ id: 'ui', files: ['src/middleware.js', 'src/dashboard.js'] }],
      summaries: ['ui'],
    });
    // Phase 3 no artifacts — ready with plan_first
    // (no createPhaseDir call)

    const result = runGsdTools('unlocked json', tmpDir);
    assert.ok(result.success);
    const out = JSON.parse(result.output);

    // Phase 1: in_progress (has plan, no summary, no verification)
    assert.strictEqual(out.in_progress.length, 1);
    assert.strictEqual(out.in_progress[0].phase, '1');

    // Phase 2: has plan + all summaries + no verification = Executed = NOT in_progress
    // Wait — isInProgress checks: has plans AND no passed verification.
    // Phase 2 has plans and no verification → it IS in_progress.
    // To make it "ready", it needs passed verification → but then it's Complete.
    // The distinction: if a phase has ALL summaries done, is it still in_progress?
    // Per the code: isInProgress returns true if has plans + no passed verification.
    // So Phase 2 with summaries but no verification is still in_progress.
    // For overlap test to work, we need a ready phase WITH plans.
    // That's only possible for a plan_first=false phase that has completed execution.
    // Actually re-reading the spec: has_plan for ready means it has a PLAN.md.
    // The isInProgress check captures ANY phase with plans and no passed verification.
    // So a "ready with plan" only happens if it has passed verification... but then
    // it's complete and shouldn't appear. This is a design tension.

    // RESOLUTION: A ready phase with has_plan=true can only happen if
    // the phase has PLAN files AND a passed verification but the roadmap
    // checkbox is NOT checked. This is an edge case (forgot to check the box).
    // The primary case for overlap is plan_first (overlap=null).
    // The worktree recommendation mainly applies between ready-with-plans
    // and in-progress phases — but that requires the edge case above.

    // Let's test the more realistic scenario: plan_first phases show null overlap
    assert.ok(true);
  });
});
```

Actually, I need to reconsider the design. Let me revise.

Looking at the `isInProgress` logic more carefully: a phase with plans but all summaries done and no verification is in `Executed` state (from `determinePhaseStatus`). But `isInProgress` as written just checks "has plans + no passed verification" — so `Executed` phases would be classified as `in_progress`. That's correct behavior: they're still "in progress" because verification hasn't passed.

For a phase to be `ready` with `has_plan=true`, it needs to have gone through a full cycle (plans + summaries + passed verification) BUT the roadmap checkbox isn't checked. This is rare but valid.

The more realistic test is: ready phases WITHOUT plans (recommendation=plan_first) and ready phases where the phase dir doesn't exist yet. Let me rewrite these tests properly.

**Delete the placeholder test above.** Replace with:

```javascript
// ─── Overlap and recommendation tests ───────────────────────────────────────

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
    // Phase 2: deps satisfied, no phase dir → ready, plan_first

    const result = runGsdTools('unlocked json', tmpDir);
    assert.ok(result.success);
    const out = JSON.parse(result.output);

    assert.strictEqual(out.ready.length, 1);
    assert.strictEqual(out.ready[0].recommendation, 'plan_first');
    assert.strictEqual(out.ready[0].overlap, null);
    assert.strictEqual(out.ready[0].suggested_command, '/gsd-plan-phase 2');
  });

  test('safe_parallel when ready phase plan has no overlap with in_progress', () => {
    writeRoadmap(tmpDir, {
      phases: [
        { num: 1, name: 'Auth', complete: false, dependsOn: 'Nothing' },
        { num: 2, name: 'Notify', complete: true, dependsOn: 'Nothing' },
        { num: 3, name: 'Reports', complete: false, dependsOn: 'Phase 2' },
      ],
    });
    // Phase 1: in_progress (has plan)
    createPhaseDir(tmpDir, 1, 'Auth', {
      plans: [{ id: 'core', files: ['src/auth.js'] }],
    });
    // Phase 2: complete (roadmap checkbox checked) — skip
    // Phase 3: deps satisfied, has plan + all summaries + passed verification
    //   but roadmap says incomplete... actually roadmap says complete for Phase 2.
    //   Phase 3 depends on Phase 2 (complete) → ready.
    //   Phase 3 needs plan artifacts to test overlap.
    //   Give Phase 3 plans + summaries + passed verification but DON'T check roadmap box.
    //   Wait — Phase 3 IS unchecked in roadmap. But if verification passed, isInProgress=false.
    //   So Phase 3 with passed verification = not in_progress, deps satisfied = ready, has_plan=true.
    createPhaseDir(tmpDir, 3, 'Reports', {
      plans: [{ id: 'gen', files: ['src/reports.js'] }],
      summaries: ['gen'],
      verification: 'passed',
    });

    const result = runGsdTools('unlocked json', tmpDir);
    assert.ok(result.success);
    const out = JSON.parse(result.output);

    const readyPhase = out.ready.find(r => r.phase === '3');
    assert.ok(readyPhase, 'Phase 3 should be ready');
    assert.strictEqual(readyPhase.recommendation, 'safe_parallel');
    assert.strictEqual(readyPhase.overlap.score, 0);
  });

  test('worktree when ready phase overlaps files with in_progress phase', () => {
    writeRoadmap(tmpDir, {
      phases: [
        { num: 1, name: 'Auth', complete: false, dependsOn: 'Nothing' },
        { num: 2, name: 'Dashboard', complete: true, dependsOn: 'Nothing' },
        { num: 3, name: 'Settings', complete: false, dependsOn: 'Phase 2' },
      ],
    });
    // Phase 1: in_progress, touches src/middleware.js
    createPhaseDir(tmpDir, 1, 'Auth', {
      plans: [{ id: 'core', files: ['src/auth.js', 'src/middleware.js'] }],
    });
    // Phase 3: ready (deps satisfied), has passed verification, overlaps middleware.js
    createPhaseDir(tmpDir, 3, 'Settings', {
      plans: [{ id: 'ui', files: ['src/settings.js', 'src/middleware.js'] }],
      summaries: ['ui'],
      verification: 'passed',
    });

    const result = runGsdTools('unlocked json', tmpDir);
    assert.ok(result.success);
    const out = JSON.parse(result.output);

    const readyPhase = out.ready.find(r => r.phase === '3');
    assert.ok(readyPhase, 'Phase 3 should be ready');
    assert.strictEqual(readyPhase.recommendation, 'worktree');
    assert.strictEqual(readyPhase.overlap.score, 1);
    assert.deepStrictEqual(readyPhase.overlap.conflicting_phases, ['1']);
    assert.deepStrictEqual(readyPhase.overlap.files, ['src/middleware.js']);
  });

  test('ready phases sorted: safe_parallel first, worktree second, plan_first last', () => {
    writeRoadmap(tmpDir, {
      phases: [
        { num: 1, name: 'Auth', complete: false, dependsOn: 'Nothing' },
        { num: 2, name: 'Plan-Me', complete: false, dependsOn: 'Nothing' },
        { num: 3, name: 'Safe', complete: true, dependsOn: 'Nothing' },
        { num: 4, name: 'Safe-Ready', complete: false, dependsOn: 'Phase 3' },
        { num: 5, name: 'Overlap-Ready', complete: false, dependsOn: 'Phase 3' },
      ],
    });
    // Phase 1: in_progress
    createPhaseDir(tmpDir, 1, 'Auth', {
      plans: [{ id: 'core', files: ['src/auth.js'] }],
    });
    // Phase 2: ready, no plan → plan_first
    // Phase 4: ready, has plan, no overlap → safe_parallel
    createPhaseDir(tmpDir, 4, 'Safe-Ready', {
      plans: [{ id: 'work', files: ['src/safe.js'] }],
      summaries: ['work'],
      verification: 'passed',
    });
    // Phase 5: ready, has plan, overlaps with Phase 1 → worktree
    createPhaseDir(tmpDir, 5, 'Overlap-Ready', {
      plans: [{ id: 'work', files: ['src/auth.js'] }],
      summaries: ['work'],
      verification: 'passed',
    });

    const result = runGsdTools('unlocked json', tmpDir);
    assert.ok(result.success);
    const out = JSON.parse(result.output);

    // Ready should be ordered: safe_parallel, worktree, plan_first
    assert.strictEqual(out.ready.length, 3);
    assert.strictEqual(out.ready[0].recommendation, 'safe_parallel');
    assert.strictEqual(out.ready[1].recommendation, 'worktree');
    assert.strictEqual(out.ready[2].recommendation, 'plan_first');
  });
});
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `cd /Volumes/SSD/Desenvolvimento/get-shit-done && node --test tests/unlocked.test.cjs`
Expected: All 8 tests PASS

- [ ] **Step 3: Commit**

```bash
git add tests/unlocked.test.cjs
git commit -m "test(unlocked): add overlap detection and recommendation tests"
```

---

### Task 3: Add table format test

**Files:**
- Modify: `tests/unlocked.test.cjs`

- [ ] **Step 1: Write test for table format output**

Add to `tests/unlocked.test.cjs`:

```javascript
// ─── Table format tests ─────────────────────────────────────────────────────

describe('unlocked: table format', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('table format includes section headers and phase info', () => {
    writeRoadmap(tmpDir, {
      phases: [
        { num: 1, name: 'Auth', complete: false, dependsOn: 'Nothing' },
        { num: 2, name: 'Dashboard', complete: false, dependsOn: 'Phase 1' },
      ],
    });
    createPhaseDir(tmpDir, 1, 'Auth', {
      plans: [{ id: 'core', files: ['src/auth.js'] }],
    });

    const result = runGsdTools('unlocked table', tmpDir);
    assert.ok(result.success);
    const out = JSON.parse(result.output);

    assert.ok(out.rendered.includes('In Progress'), 'should show In Progress section');
    assert.ok(out.rendered.includes('Phase 1: Auth'), 'should show in_progress phase');
    assert.ok(out.rendered.includes('Blocked'), 'should show Blocked section');
    assert.ok(out.rendered.includes('Phase 2: Dashboard'), 'should show blocked phase');
  });

  test('table format shows all-complete message when nothing to do', () => {
    writeRoadmap(tmpDir, {
      phases: [
        { num: 1, name: 'Done', complete: true, dependsOn: 'Nothing' },
      ],
    });
    createPhaseDir(tmpDir, 1, 'Done', {
      plans: [{ id: 'setup', files: [] }],
      summaries: ['setup'],
      verification: 'passed',
    });

    const result = runGsdTools('unlocked table', tmpDir);
    assert.ok(result.success);
    const out = JSON.parse(result.output);
    assert.ok(out.rendered.includes('nothing to unlock'), 'should show all-complete message');
  });
});
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `cd /Volumes/SSD/Desenvolvimento/get-shit-done && node --test tests/unlocked.test.cjs`
Expected: All 10 tests PASS

- [ ] **Step 3: Commit**

```bash
git add tests/unlocked.test.cjs
git commit -m "test(unlocked): add table format output tests"
```

---

### Task 4: Create the `/gsd-unlocked` skill command

**Files:**
- Create: `commands/gsd/unlocked.md`

- [ ] **Step 1: Create the skill file**

Create `commands/gsd/unlocked.md`:

```markdown
---
name: gsd:unlocked
description: Show which phases can be started now — with file overlap analysis and execution recommendations
allowed-tools:
  - Read
  - Bash
---
<objective>
Show all actionable phases: what's in progress, what's ready to start (with overlap analysis), and what's blocked by dependencies. Recommends execution order and worktree usage.
</objective>

<process>

## Step 1: Run the unlocked engine

```bash
node ~/.claude/get-shit-done/bin/gsd-tools.cjs unlocked table --raw
```

## Step 2: Present the output

Display the rendered table output directly to the user. The table includes:

- **Unlocked — Ready to Start**: Phases with all dependencies satisfied, sorted by recommendation:
  - `SAFE` — no file conflicts, can execute directly
  - `WORKTREE` — file conflicts with in-progress phases, recommend worktree isolation
  - `PLAN` — needs planning first (no PLAN.md yet)
- **In Progress**: Phases currently being worked on
- **Blocked**: Phases waiting on incomplete dependencies

## Step 3: Offer next action

If there are `SAFE` phases, suggest starting with the first one.
If there are only `WORKTREE` phases, explain the worktree recommendation.
If there are only `PLAN` phases, suggest planning the first one.
If everything is blocked, explain what needs to complete first.

</process>
```

- [ ] **Step 2: Commit**

```bash
git add commands/gsd/unlocked.md
git commit -m "feat(unlocked): add /gsd-unlocked skill command"
```

---

### Task 5: Remove phantom `unlock-phase` skill entry

**Files:**
- Modify: wherever `unlock-phase` is registered (search for it)

- [ ] **Step 1: Search for the phantom registration**

Run: `grep -r "unlock-phase" /Volumes/SSD/Desenvolvimento/get-shit-done/commands/ /Volumes/SSD/Desenvolvimento/get-shit-done/get-shit-done/`

If found in a registry file, remove the entry. If it only exists in our spec doc, no action needed — the skill system likely auto-discovers from `commands/` directory, and since there's no `commands/gsd/unlock-phase.md`, it may be a stale cache or auto-generated listing.

- [ ] **Step 2: If removal was needed, commit**

```bash
git add <file>
git commit -m "chore: remove phantom unlock-phase skill entry"
```

---

### Task 6: Run full test suite and verify

**Files:** None (verification only)

- [ ] **Step 1: Run unlocked tests**

Run: `cd /Volumes/SSD/Desenvolvimento/get-shit-done && node --test tests/unlocked.test.cjs`
Expected: All 10 tests PASS

- [ ] **Step 2: Run full test suite to ensure no regressions**

Run: `cd /Volumes/SSD/Desenvolvimento/get-shit-done && node --test tests/*.test.cjs`
Expected: All existing tests PASS

- [ ] **Step 3: Manual smoke test**

Run in a project with a roadmap:
```bash
node get-shit-done/bin/gsd-tools.cjs unlocked json
node get-shit-done/bin/gsd-tools.cjs unlocked table
```

Verify JSON structure matches spec and table output is readable.
