# `/gsd:preflight` Command Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a standalone preflight validation command that checks phase readiness before any GSD workflow runs.

**Architecture:** JS engine (`preflight.cjs`) does all data work — parses ROADMAP, checks artifacts, validates file paths — and returns structured JSON. A workflow skill (`preflight.md`) calls the engine and formats the GO/NO-GO report. Routing in `gsd-tools.cjs` bridges the two.

**Tech Stack:** Node.js (CommonJS), existing GSD core internals (`getRoadmapPhaseInternal`, `findPhaseInternal`, `getPhaseFileStats`, `extractFrontmatter`, `extractCurrentMilestone`, `escapeRegex`, `planningPaths`, `planningDir`, `output`, `error`)

**Spec:** `docs/superpowers/specs/2026-04-03-preflight-command-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `get-shit-done/bin/lib/preflight.cjs` | Create | Engine — all 6 checks, returns JSON |
| `get-shit-done/bin/gsd-tools.cjs` | Modify | Route `preflight` command, parse args |
| `commands/gsd/preflight.md` | Create | Skill — call engine, format report |

---

### Task 1: Create preflight engine — planning checks (checks 1-2)

**Files:**
- Create: `get-shit-done/bin/lib/preflight.cjs`

- [ ] **Step 1: Create engine with checks 1-2 (planning exists + phase exists)**

```javascript
// get-shit-done/bin/lib/preflight.cjs
/**
 * Preflight — Pre-workflow validation for phase readiness
 */

const fs = require('fs');
const path = require('path');
const { planningDir, planningPaths, getRoadmapPhaseInternal, findPhaseInternal, getPhaseFileStats, extractCurrentMilestone, escapeRegex, output, error } = require('./core.cjs');
const { extractFrontmatter } = require('./frontmatter.cjs');

/**
 * Normalize workflow argument from various input formats.
 * Maps 'plan-phase' → 'plan', 'execute-phase' → 'execute', etc.
 */
function normalizeWorkflow(wf) {
  if (!wf) return null;
  const map = {
    'discuss-phase': 'discuss', 'discuss': 'discuss',
    'plan-phase': 'plan', 'plan': 'plan',
    'execute-phase': 'execute', 'execute': 'execute',
    'verify-phase': 'verify', 'verify': 'verify',
  };
  return map[wf] || null;
}

/**
 * Auto-detect the next workflow step based on artifact state.
 * No CONTEXT → discuss, CONTEXT no PLANs → plan, PLANs no SUMMARYs → execute, else verify.
 */
function detectWorkflow(phaseDir) {
  if (!phaseDir || !fs.existsSync(phaseDir)) return 'discuss';
  try {
    const stats = getPhaseFileStats(phaseDir);
    if (!stats.hasContext) return 'discuss';
    if (stats.plans.length === 0) return 'plan';
    if (stats.summaries.length === 0) return 'execute';
    return 'verify';
  } catch {
    return 'discuss';
  }
}

/**
 * Build the next command string for a given workflow and phase.
 */
function nextCommand(workflow, phase) {
  const map = {
    'discuss': `/gsd:discuss-phase ${phase}`,
    'plan': `/gsd:plan-phase ${phase}`,
    'execute': `/gsd:execute-phase ${phase}`,
    'verify': `/gsd:verify-work ${phase}`,
  };
  return map[workflow] || `/gsd:discuss-phase ${phase}`;
}

function cmdPreflight(cwd, phaseNum, workflowArg, raw) {
  const blockers = [];
  const warnings = [];

  // ── Check 1: Planning exists ──
  const pDir = planningDir(cwd);
  if (!fs.existsSync(pDir)) {
    output({
      ready: false,
      phase: phaseNum || null,
      phase_name: null,
      detected_workflow: null,
      next_command: '/gsd:new-project',
      blockers: [{ type: 'no_planning', message: '.planning/ directory not found. Run /gsd:new-project first', command: '/gsd:new-project', skippable: false }],
      warnings: [],
    }, raw);
    return;
  }

  const paths = planningPaths(cwd);
  if (!fs.existsSync(paths.roadmap)) {
    output({
      ready: false,
      phase: phaseNum || null,
      phase_name: null,
      detected_workflow: null,
      next_command: '/gsd:new-project',
      blockers: [{ type: 'no_roadmap', message: 'ROADMAP.md not found. Run /gsd:new-project first', command: '/gsd:new-project', skippable: false }],
      warnings: [],
    }, raw);
    return;
  }

  if (!phaseNum) {
    output({
      ready: false,
      phase: null,
      phase_name: null,
      detected_workflow: null,
      next_command: null,
      blockers: [{ type: 'no_phase', message: 'Phase number required. Usage: preflight <phase>', command: null, skippable: false }],
      warnings: [],
    }, raw);
    return;
  }

  // ── Check 2: Phase exists ──
  const phaseInfo = getRoadmapPhaseInternal(cwd, phaseNum);
  if (!phaseInfo || !phaseInfo.found) {
    output({
      ready: false,
      phase: phaseNum,
      phase_name: null,
      detected_workflow: null,
      next_command: null,
      blockers: [{ type: 'phase_not_found', message: `Phase ${phaseNum} not found in ROADMAP.md`, command: null, skippable: false }],
      warnings: [],
    }, raw);
    return;
  }

  const phaseName = phaseInfo.phase_name;
  const phaseSection = phaseInfo.section;

  // Resolve phase directory (may not exist yet — that's ok for discuss)
  const phaseDir = findPhaseInternal(cwd, phaseNum);
  const phaseDirPath = phaseDir ? path.join(cwd, phaseDir.dir) : null;

  // Detect or normalize workflow
  const workflow = normalizeWorkflow(workflowArg) || detectWorkflow(phaseDirPath);

  // ── Check 3: Dependencies complete ──
  checkDependencies(cwd, phaseSection, phaseNum, blockers);

  // ── Check 4: Artifact gate ──
  checkArtifacts(phaseDirPath, workflow, phaseNum, phaseSection, blockers, warnings);

  // ── Check 5: Canonical refs ──
  const canonicalStats = checkCanonicalRefs(cwd, phaseDirPath, warnings);

  // ── Check 6: Plan files_modified ──
  const planPathStats = checkPlanPaths(cwd, phaseDirPath, warnings);

  const ready = blockers.every(b => b.skippable);

  output({
    ready,
    phase: phaseNum,
    phase_name: phaseName,
    detected_workflow: workflow,
    next_command: nextCommand(workflow, phaseNum),
    blockers,
    warnings,
    canonical_refs_checked: canonicalStats.checked,
    canonical_refs_valid: canonicalStats.valid,
    plan_paths_checked: planPathStats.checked,
    plan_paths_valid: planPathStats.valid,
  }, raw);
}

module.exports = { cmdPreflight };
```

- [ ] **Step 2: Verify file was created and has no syntax errors**

Run: `node -c get-shit-done/bin/lib/preflight.cjs`
Expected: `get-shit-done/bin/lib/preflight.cjs: OK` (syntax check passes — `checkDependencies` etc. are undefined at runtime but `node -c` only validates syntax)

- [ ] **Step 3: Commit skeleton**

```bash
git add get-shit-done/bin/lib/preflight.cjs
git commit -m "feat(preflight): add engine skeleton with checks 1-2 (planning + phase exists)"
```

---

### Task 2: Add dependency check (check 3)

**Files:**
- Modify: `get-shit-done/bin/lib/preflight.cjs`

- [ ] **Step 1: Add `checkDependencies` function**

Add this function before `cmdPreflight` in `preflight.cjs`:

```javascript
/**
 * Check 3: Verify all phase dependencies are marked complete.
 * Parses "Depends on" from phase section, cross-references roadmap checkboxes.
 */
function checkDependencies(cwd, phaseSection, phaseNum, blockers) {
  const dependsMatch = phaseSection.match(/\*\*Depends on(?::\*\*|\*\*:)\s*([^\n]+)/i);
  if (!dependsMatch) return;

  const dependsRaw = dependsMatch[1].trim();
  // Skip if no real dependencies
  if (/^(nothing|none|—|-|n\/a)$/i.test(dependsRaw)) return;

  // Extract phase numbers from dependency string
  // Handles: "Phase 1", "Phase 1, Phase 2", "Phase 1 and Phase 2", "1, 2"
  const depNums = [];
  const phaseRefs = dependsRaw.matchAll(/(?:Phase\s+)?(\d+(?:\.\d+)*)/gi);
  for (const m of phaseRefs) {
    depNums.push(m[1]);
  }

  if (depNums.length === 0) return;

  // Read roadmap to check completion status
  const paths = planningPaths(cwd);
  let roadmapContent;
  try {
    roadmapContent = extractCurrentMilestone(fs.readFileSync(paths.roadmap, 'utf-8'), cwd);
  } catch {
    return; // Can't read roadmap — skip dependency check silently
  }

  for (const depNum of depNums) {
    const escaped = escapeRegex(depNum);
    const checkboxPattern = new RegExp(`-\\s*\\[(x| )\\]\\s*.*Phase\\s+${escaped}[:\\s]`, 'i');
    const match = roadmapContent.match(checkboxPattern);
    const isComplete = match ? match[1] === 'x' : false;

    if (!isComplete) {
      // Get dep phase name for better message
      const depInfo = getRoadmapPhaseInternal(cwd, depNum);
      const depName = depInfo ? depInfo.phase_name : `Phase ${depNum}`;
      blockers.push({
        type: 'dependency_incomplete',
        message: `Phase ${depNum} (${depName}) not complete — required by Phase ${phaseNum}`,
        command: `/gsd:execute-phase ${depNum}`,
        skippable: false,
      });
    }
  }
}
```

- [ ] **Step 2: Verify syntax**

Run: `node -c get-shit-done/bin/lib/preflight.cjs`
Expected: syntax OK (still missing checkArtifacts/checkCanonicalRefs/checkPlanPaths but file parses)

- [ ] **Step 3: Commit**

```bash
git add get-shit-done/bin/lib/preflight.cjs
git commit -m "feat(preflight): add dependency completeness check"
```

---

### Task 3: Add artifact gate + canonical refs + plan paths checks (checks 4-6)

**Files:**
- Modify: `get-shit-done/bin/lib/preflight.cjs`

- [ ] **Step 1: Add `checkArtifacts` function**

Add before `checkDependencies`:

```javascript
/**
 * Check 4: Verify required artifacts exist for the target workflow step.
 */
function checkArtifacts(phaseDirPath, workflow, phaseNum, phaseSection, blockers, warnings) {
  // discuss requires nothing
  if (workflow === 'discuss') return;

  // No phase dir at all — blocker for plan/execute/verify
  if (!phaseDirPath || !fs.existsSync(phaseDirPath)) {
    const artifactMap = { plan: 'CONTEXT.md', execute: 'PLAN.md', verify: 'SUMMARY.md' };
    blockers.push({
      type: 'artifact_missing',
      message: `Phase directory not found — ${artifactMap[workflow] || 'artifacts'} required for ${workflow}`,
      command: `/gsd:discuss-phase ${phaseNum}`,
      skippable: false,
    });
    return;
  }

  let stats;
  try {
    stats = getPhaseFileStats(phaseDirPath);
  } catch {
    blockers.push({
      type: 'artifact_missing',
      message: `Cannot read phase directory`,
      command: null,
      skippable: false,
    });
    return;
  }

  if (workflow === 'plan' && !stats.hasContext) {
    blockers.push({
      type: 'artifact_missing',
      message: `CONTEXT.md missing — required before planning`,
      command: `/gsd:discuss-phase ${phaseNum}`,
      skippable: false,
    });
  }

  if (workflow === 'execute' && stats.plans.length === 0) {
    blockers.push({
      type: 'artifact_missing',
      message: `No PLAN.md files found — required before execution`,
      command: `/gsd:plan-phase ${phaseNum}`,
      skippable: false,
    });
  }

  if (workflow === 'verify' && stats.summaries.length === 0) {
    blockers.push({
      type: 'artifact_missing',
      message: `No SUMMARY.md files found — required before verification`,
      command: `/gsd:execute-phase ${phaseNum}`,
      skippable: false,
    });
  }

  // UI-SPEC check: warning if frontend indicators present but no UI-SPEC
  if (workflow === 'plan' || workflow === 'execute') {
    const hasFrontendIndicators = /UI|interface|frontend|component|layout|page|screen|view|form|dashboard|widget/i.test(phaseSection || '');
    if (hasFrontendIndicators) {
      const files = fs.readdirSync(phaseDirPath);
      const hasUiSpec = files.some(f => f.endsWith('-UI-SPEC.md') || f === 'UI-SPEC.md');
      if (!hasUiSpec) {
        warnings.push({
          type: 'ui_spec_missing',
          message: `Frontend phase without UI-SPEC.md`,
          command: `/gsd:ui-phase ${phaseNum}`,
        });
      }
    }
  }
}
```

- [ ] **Step 2: Add `checkCanonicalRefs` function**

```javascript
/**
 * Check 5: Validate canonical refs in CONTEXT.md point to real files.
 * Returns { checked: number, valid: number }.
 */
function checkCanonicalRefs(cwd, phaseDirPath, warnings) {
  const result = { checked: 0, valid: 0 };
  if (!phaseDirPath || !fs.existsSync(phaseDirPath)) return result;

  // Find CONTEXT.md
  let contextFile;
  try {
    const files = fs.readdirSync(phaseDirPath);
    contextFile = files.find(f => f.endsWith('-CONTEXT.md') || f === 'CONTEXT.md');
  } catch {
    return result;
  }
  if (!contextFile) return result;

  let content;
  try {
    content = fs.readFileSync(path.join(phaseDirPath, contextFile), 'utf-8');
  } catch {
    return result;
  }

  // Extract <canonical_refs> section
  const sectionMatch = content.match(/<canonical_refs>([\s\S]*?)<\/canonical_refs>/);
  if (!sectionMatch) return result;

  const section = sectionMatch[1];

  // Skip if explicitly empty
  if (/no external specs/i.test(section)) return result;

  // Extract backtick-quoted paths
  const pathMatches = section.matchAll(/`([^`]+)`/g);
  for (const m of pathMatches) {
    let refPath = m[1].trim();

    // Skip non-path entries (commands, code snippets)
    if (refPath.startsWith('/gsd:') || refPath.startsWith('node ') || refPath.includes('(') || !refPath.includes('/')) continue;

    // Strip §N section references
    refPath = refPath.replace(/\s*§\d+.*$/, '');

    result.checked++;
    const fullPath = path.resolve(cwd, refPath);
    if (fs.existsSync(fullPath)) {
      result.valid++;
    } else {
      warnings.push({
        type: 'canonical_ref_missing',
        message: `Referenced file not found: ${refPath}`,
        path: refPath,
      });
    }
  }

  return result;
}
```

- [ ] **Step 3: Add `checkPlanPaths` function**

```javascript
/**
 * Check 6: Validate files_modified in PLAN frontmatter point to real files/dirs.
 * Returns { checked: number, valid: number }.
 */
function checkPlanPaths(cwd, phaseDirPath, warnings) {
  const result = { checked: 0, valid: 0 };
  if (!phaseDirPath || !fs.existsSync(phaseDirPath)) return result;

  let planFiles;
  try {
    const files = fs.readdirSync(phaseDirPath);
    planFiles = files.filter(f => f.endsWith('-PLAN.md') || f === 'PLAN.md');
  } catch {
    return result;
  }
  if (planFiles.length === 0) return result;

  for (const planFile of planFiles) {
    let content;
    try {
      content = fs.readFileSync(path.join(phaseDirPath, planFile), 'utf-8');
    } catch {
      continue;
    }

    let fm;
    try {
      fm = extractFrontmatter(content);
    } catch {
      warnings.push({
        type: 'malformed_frontmatter',
        message: `Malformed YAML frontmatter in ${planFile}`,
      });
      continue;
    }

    const filesModified = fm.files_modified || fm['files-modified'];
    if (!filesModified) continue;

    // Normalize to array
    const pathList = Array.isArray(filesModified) ? filesModified : String(filesModified).split(',').map(s => s.trim());

    for (const p of pathList) {
      if (!p) continue;
      // Skip globs
      if (p.includes('*')) continue;

      result.checked++;
      const fullPath = path.resolve(cwd, p);
      if (fs.existsSync(fullPath)) {
        result.valid++;
      } else {
        // Check if parent directory exists (new file is ok if parent dir exists)
        const parentDir = path.dirname(fullPath);
        if (fs.existsSync(parentDir)) {
          result.valid++; // New file in existing dir — ok
        } else {
          warnings.push({
            type: 'files_modified_missing',
            message: `Plan path not found (parent dir also missing): ${p}`,
            path: p,
            plan: planFile,
          });
        }
      }
    }
  }

  return result;
}
```

- [ ] **Step 4: Verify syntax**

Run: `node -c get-shit-done/bin/lib/preflight.cjs`
Expected: `get-shit-done/bin/lib/preflight.cjs: OK`

- [ ] **Step 5: Commit**

```bash
git add get-shit-done/bin/lib/preflight.cjs
git commit -m "feat(preflight): add artifact gate, canonical refs, and plan path checks"
```

---

### Task 4: Wire routing in gsd-tools.cjs

**Files:**
- Modify: `get-shit-done/bin/gsd-tools.cjs:144-158` (require block)
- Modify: `get-shit-done/bin/gsd-tools.cjs:653-665` (after `validate` case)

- [ ] **Step 1: Add require for preflight module**

In `get-shit-done/bin/gsd-tools.cjs`, after line 155 (`const frontmatter = require('./lib/frontmatter.cjs');`), add:

```javascript
const preflight = require('./lib/preflight.cjs');
```

- [ ] **Step 2: Add case routing**

In `get-shit-done/bin/gsd-tools.cjs`, after the `case 'validate': { ... break; }` block (ends around line 665), add:

```javascript
    case 'preflight': {
      // Support both: preflight <phase> --workflow plan
      //           and: preflight plan-phase <phase> (step 3.7 compat)
      const KNOWN_WORKFLOWS = ['discuss-phase','plan-phase','execute-phase','verify-phase','discuss','plan','execute','verify'];
      let wfArg = null, phaseArg = null;
      if (KNOWN_WORKFLOWS.includes(args[1])) {
        wfArg = args[1]; phaseArg = args[2];
      } else {
        phaseArg = args[1];
        const wfIdx = args.indexOf('--workflow');
        if (wfIdx !== -1) wfArg = args[wfIdx + 1];
      }
      preflight.cmdPreflight(cwd, phaseArg, wfArg, raw);
      break;
    }
```

- [ ] **Step 3: Verify syntax of gsd-tools.cjs**

Run: `node -c get-shit-done/bin/gsd-tools.cjs`
Expected: `OK`

- [ ] **Step 4: Smoke test — no .planning dir**

Run: `cd /tmp && node "/Volumes/SSD/Desenvolvimento/get-shit-done/get-shit-done/bin/gsd-tools.cjs" preflight 1`
Expected: JSON with `"ready": false` and blocker `no_planning`

- [ ] **Step 5: Commit**

```bash
git add get-shit-done/bin/gsd-tools.cjs
git commit -m "feat(preflight): wire routing in gsd-tools.cjs"
```

---

### Task 5: Create skill workflow file

**Files:**
- Create: `commands/gsd/preflight.md`

- [ ] **Step 1: Create the skill file**

```markdown
---
name: gsd:preflight
description: Pre-workflow validation — checks phase readiness before discuss/plan/execute
allowed-tools:
  - Bash
  - Read
---
<objective>
Run preflight checks for a phase and display a GO/NO-GO report.
Validates: phase exists, dependencies complete, required artifacts present, canonical refs valid, plan paths valid.
</objective>

<execution_context>
@~/.claude/get-shit-done/references/ui-brand.md
</execution_context>

<process>

## 1. Parse Arguments

Extract phase number from $ARGUMENTS. If empty, show usage:
```
Usage: /gsd:preflight <phase-number> [--workflow discuss|plan|execute|verify]
```

## 2. Run Engine

```bash
RESULT=$(node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" preflight ${PHASE} ${WORKFLOW_FLAG} 2>/dev/null)
if [[ "$RESULT" == @file:* ]]; then RESULT=$(cat "${RESULT#@file:}"); fi
```

Parse JSON fields: `ready`, `phase`, `phase_name`, `detected_workflow`, `next_command`, `blockers`, `warnings`, `canonical_refs_checked`, `canonical_refs_valid`, `plan_paths_checked`, `plan_paths_valid`.

## 3. Format Report

**If `ready` is true (GO):**

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► PREFLIGHT PHASE {N} — GO ✓
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Phase {N}: {phase_name}
Dependencies: ✓ All complete
Artifacts: ✓ Ready for {detected_workflow}
Canonical refs: ✓ {canonical_refs_valid}/{canonical_refs_checked} valid
Plan paths: ✓ {plan_paths_valid}/{plan_paths_checked} valid
```

If there are warnings, append after the summary:

```
⚠ {warning.message}
  → {warning.command}
```

Then show Next Up block:

```
───────────────────────────────────────────────────────────────

## ▶ Next Up

**{detected_workflow} Phase {N}** — {phase_name}

`{next_command}`

<sub>`/clear` first → fresh context window</sub>

───────────────────────────────────────────────────────────────
```

**If `ready` is false (NO-GO):**

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► PREFLIGHT PHASE {N} — NO-GO ✗
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Phase {N}: {phase_name}

{For each blocker:}
✗ {blocker.message}
  → {blocker.command}

{For each warning:}
⚠ {warning.message}
  → {warning.command}
```

No Next Up block on NO-GO — the remediation commands ARE the next steps.

**Display rules:**
- If `canonical_refs_checked` is 0: show "Canonical refs: — (none to check)"
- If `plan_paths_checked` is 0: show "Plan paths: — (none to check)"
- If a blocker/warning has no `command`: omit the `→` line

</process>

<success_criteria>
- [ ] Engine called and JSON parsed
- [ ] GO/NO-GO report displayed with ui-brand formatting
- [ ] All blockers shown with remediation commands
- [ ] All warnings shown
- [ ] Next Up block shown on GO only
</success_criteria>
```

- [ ] **Step 2: Verify file exists**

Run: `ls -la commands/gsd/preflight.md`
Expected: file exists

- [ ] **Step 3: Commit**

```bash
git add commands/gsd/preflight.md
git commit -m "feat(preflight): add skill workflow for GO/NO-GO report"
```

---

### Task 6: End-to-end validation

**Files:**
- None (read-only testing)

- [ ] **Step 1: Syntax check all modified files**

Run:
```bash
node -c get-shit-done/bin/lib/preflight.cjs && echo "preflight.cjs OK"
node -c get-shit-done/bin/gsd-tools.cjs && echo "gsd-tools.cjs OK"
```
Expected: both OK

- [ ] **Step 2: Test no-planning scenario**

Run: `cd /tmp && mkdir -p preflight-test && cd preflight-test && node "/Volumes/SSD/Desenvolvimento/get-shit-done/get-shit-done/bin/gsd-tools.cjs" preflight 1`
Expected: `{"ready":false,"blockers":[{"type":"no_planning",...}]}`

- [ ] **Step 3: Test no-phase-arg scenario**

Run: `cd /tmp/preflight-test && mkdir -p .planning && touch .planning/ROADMAP.md && node "/Volumes/SSD/Desenvolvimento/get-shit-done/get-shit-done/bin/gsd-tools.cjs" preflight`
Expected: `{"ready":false,"blockers":[{"type":"no_phase",...}]}`

- [ ] **Step 4: Test workflow-first arg format (step 3.7 compat)**

Run: `node "/Volumes/SSD/Desenvolvimento/get-shit-done/get-shit-done/bin/gsd-tools.cjs" preflight plan-phase 1`
Expected: JSON output (may be `phase_not_found` if test ROADMAP is empty — that's correct)

- [ ] **Step 5: Clean up test directory**

Run: `rm -rf /tmp/preflight-test`

- [ ] **Step 6: Verify skill file has valid frontmatter**

Run: `head -7 commands/gsd/preflight.md`
Expected: YAML frontmatter with `name: gsd:preflight`

- [ ] **Step 7: Final commit if any fixes were needed**

Only if changes were made during testing:
```bash
git add -A && git commit -m "fix(preflight): address issues found during e2e validation"
```
