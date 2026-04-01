# Phase 4: Pre-flight Dependency Resolver for Phase Commands - Research

**Researched:** 2026-03-30
**Domain:** GSD workflow orchestration / prerequisite resolution
**Confidence:** HIGH

## Summary

Phase 4 adds a pre-flight dependency resolver that runs before any phase command (`plan-phase`, `execute-phase`, `ui-phase`). Currently, each workflow handles its own prerequisite checks inline -- `plan-phase` checks for CONTEXT.md at step 4 and UI-SPEC.md at step 5.6, but these are scattered, inconsistent, and cannot auto-trigger upstream workflows. The resolver centralizes all prerequisite logic into a single reusable function that either confirms readiness or automatically triggers the missing upstream workflow before returning control.

The key challenge is the nested subagent limitation documented in plan-phase (#1009): `AskUserQuestion` does not work in nested subcontexts. This means the resolver cannot spawn discuss-phase as a child -- it must either exit with a redirect command or handle the chain at the CLI tool level. The current pattern (display command and exit) is the proven approach.

**Primary recommendation:** Implement as a new `preflight` subcommand in `gsd-tools.cjs` backed by a `preflight.cjs` lib module. The module checks all prerequisites for a given command+phase combination and returns a structured JSON result indicating either `ready` (proceed) or `blocked` (with the specific upstream command to run). Workflows call `gsd-tools preflight <command> <phase>` as their first step and branch on the result. This keeps the resolver in the CLI layer where all state queries already live, avoids the nested subagent problem entirely, and follows the existing `init` pattern.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TBD | Pre-flight check: CONTEXT.md exists before plan-phase | Covered by prerequisite matrix (row 1) |
| TBD | Pre-flight check: UI-SPEC.md when UI detected before plan-phase | Covered by prerequisite matrix (row 2) and UI detection logic |
| TBD | Pre-flight check: dependent phases complete before execute-phase | Covered by prerequisite matrix (row 3) and `roadmap analyze` dependency parsing |
| TBD | Auto-trigger upstream workflow when prerequisite missing | Covered by resolution strategy (redirect pattern) |
| TBD | Chain back to original command after prerequisites complete | Covered by `--resume` flag pattern |
| TBD | Gap-closure planning when verification finds holes | Covered by prerequisite matrix (row 4) |
| TBD | Reusable function wrapping existing GSD commands | Covered by architecture pattern (preflight.cjs module) |
</phase_requirements>

## Standard Stack

### Core

No new dependencies. This phase uses exclusively existing project infrastructure:

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js built-ins (fs, path) | Node 20+ | File existence checks, path resolution | Already used by all lib modules |
| gsd-tools.cjs dispatcher | current | Command routing for `preflight` subcommand | Existing pattern for all GSD commands |
| core.cjs utilities | current | `findPhaseInternal`, `getRoadmapPhaseInternal`, `loadConfig`, `planningDir` | Already handles all phase/config resolution |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| roadmap.cjs | current | `cmdRoadmapAnalyze` for dependency checking | When verifying dependent phase completion |
| config.cjs | current | `cmdConfigGet` for workflow settings | When checking `ui_phase`, `ui_safety_gate`, `skip_discuss` |
| state.cjs | current | STATE.md parsing | When checking current phase position |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| preflight.cjs lib module | Bash wrapper function | Bash lacks access to internal JS functions; would duplicate logic from core.cjs and roadmap.cjs |
| gsd-tools subcommand | Standalone script | Breaks the single-dispatcher pattern; harder to test |
| Workflow-level checks | Current inline approach | Scattered, inconsistent, cannot share logic between workflows |

## Architecture Patterns

### Recommended Project Structure

```
get-shit-done/bin/lib/
  preflight.cjs          # NEW: Pre-flight dependency resolver logic
get-shit-done/bin/
  gsd-tools.cjs          # MODIFIED: Add preflight command routing
```

### Pattern 1: Preflight Check Module (preflight.cjs)

**What:** A CommonJS module exporting `cmdPreflight(cwd, command, phase, raw)` that returns structured JSON.

**When to use:** Before any phase command execution.

**How it works:**

```javascript
// get-shit-done/bin/lib/preflight.cjs
const { findPhaseInternal, getRoadmapPhaseInternal, loadConfig, planningDir } = require('./core.cjs');

/**
 * Check all prerequisites for a phase command.
 * Returns { ready: boolean, blockers: [...], command_to_run: string|null }
 */
function cmdPreflight(cwd, command, phase, raw) {
  const config = loadConfig(cwd);
  const phaseInfo = findPhaseInternal(cwd, phase);
  const roadmapPhase = getRoadmapPhaseInternal(cwd, phase);

  const blockers = [];

  // Run checks based on command type
  if (command === 'plan-phase') {
    checkContextExists(cwd, phase, phaseInfo, config, blockers);
    checkUiSpec(cwd, phase, phaseInfo, roadmapPhase, config, blockers);
    checkDependentPhasesComplete(cwd, phase, roadmapPhase, blockers);
  }

  if (command === 'execute-phase') {
    checkPlansExist(cwd, phase, phaseInfo, blockers);
    checkDependentPhasesComplete(cwd, phase, roadmapPhase, blockers);
  }

  if (command === 'ui-phase') {
    checkContextExists(cwd, phase, phaseInfo, config, blockers);
  }

  // Return first blocker (resolve in order)
  const firstBlocker = blockers[0] || null;

  output({
    ready: blockers.length === 0,
    blockers,
    next_action: firstBlocker?.action || null,
    next_command: firstBlocker?.command || null,
    phase_number: phase,
    command_checked: command,
  }, raw);
}
```

### Pattern 2: Prerequisite Matrix

The resolver checks prerequisites in dependency order (earliest blocker first):

| Command | Check | Condition | Upstream Action |
|---------|-------|-----------|-----------------|
| plan-phase | CONTEXT.md exists | `has_context === false` AND `skip_discuss !== true` | `/gsd:discuss-phase {N}` |
| plan-phase | UI-SPEC.md exists | UI keywords in phase AND `ui_safety_gate === true` AND no UI-SPEC.md | `/gsd:ui-phase {N}` |
| plan-phase | Dependent phases complete | `depends_on` phases not marked `[x]` in ROADMAP | `/gsd:execute-phase {dep}` |
| execute-phase | Plans exist | `plan_count === 0` | `/gsd:plan-phase {N}` |
| execute-phase | Dependent phases complete | Same as above | `/gsd:execute-phase {dep}` |
| ui-phase | CONTEXT.md exists | `has_context === false` AND `skip_discuss !== true` | `/gsd:discuss-phase {N}` |
| plan-phase (--gaps) | VERIFICATION.md exists with gaps | No VERIFICATION.md | `/gsd:verify-phase {N}` |

### Pattern 3: Blocker Resolution Output

Each blocker has a structured shape:

```javascript
{
  type: 'missing_context',       // machine-readable type
  message: 'No CONTEXT.md found for Phase 4',  // human-readable
  action: 'run_command',         // resolution type
  command: '/gsd:discuss-phase 4',  // exact command to run
  severity: 'blocking',          // blocking | warning
  skippable: true,               // can user skip with --force?
}
```

### Pattern 4: Workflow Integration

Each workflow calls preflight as its first step after init:

```bash
# In plan-phase.md, step 1 (after init):
PREFLIGHT=$(node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" preflight plan-phase "${PHASE}")
READY=$(echo "$PREFLIGHT" | node -e "process.stdout.write(JSON.parse(require('fs').readFileSync(0,'utf-8')).ready.toString())")

if [ "$READY" = "false" ]; then
  NEXT_CMD=$(echo "$PREFLIGHT" | node -e "process.stdout.write(JSON.parse(require('fs').readFileSync(0,'utf-8')).next_command || '')")
  echo "Prerequisites not met. Run first:"
  echo ""
  echo "  ${NEXT_CMD}"
  echo ""
  echo "Then re-run /gsd:plan-phase ${PHASE}"
  # EXIT WORKFLOW
fi
```

### Pattern 5: UI Detection Logic (Avoiding False Positives)

The current UI detection in plan-phase uses a broad grep:

```bash
echo "$PHASE_SECTION" | grep -iE "UI|interface|frontend|component|layout|page|screen|view|form|dashboard|widget"
```

This produces false positives (e.g., "interface" in TypeScript, "form" in "transform"). The preflight module should use a more precise check:

```javascript
function hasUiIndicators(phaseSection) {
  if (!phaseSection) return false;

  // Check phase goal and name only (not full section which includes code references)
  const goalMatch = phaseSection.match(/\*\*Goal\*\*:?\s*([^\n]+)/i);
  const goal = goalMatch ? goalMatch[1].toLowerCase() : '';
  const name = phaseSection.match(/Phase\s+\d+[^:]*:\s*([^\n]+)/i)?.[1]?.toLowerCase() || '';
  const combined = `${goal} ${name}`;

  // More precise patterns that indicate actual UI work
  const uiPatterns = [
    /\bfrontend\b/,
    /\bdashboard\b/,
    /\bui\s/,           // "UI " but not "UIKit" in middle of word
    /\buser\s+interface\b/,
    /\blayout\b/,
    /\bpage\b/,
    /\bscreen\b/,
    /\bwidget\b/,
    /\bcomponent\s+library\b/,
    /\bform\s+(builder|validation|handling)\b/,
    /\bview\s+(layer|component|template)\b/,
  ];

  return uiPatterns.some(p => p.test(combined));
}
```

### Pattern 6: Dependency Parsing from ROADMAP.md

The `depends_on` field is already parsed by `roadmap.cjs`. The preflight module reuses this:

```javascript
function checkDependentPhasesComplete(cwd, phase, roadmapPhase, blockers) {
  if (!roadmapPhase?.depends_on) return;

  const depString = roadmapPhase.depends_on;
  // Parse "Phase 1, Phase 2" or "Phase 1" or "Nothing"
  if (/nothing|none|n\/a/i.test(depString)) return;

  const depPhases = depString.match(/\d+(?:\.\d+)*/g) || [];

  for (const dep of depPhases) {
    const depRoadmap = getRoadmapPhaseInternal(cwd, dep);
    // Check ROADMAP checkbox
    if (depRoadmap && !depRoadmap.roadmap_complete) {
      blockers.push({
        type: 'incomplete_dependency',
        message: `Phase ${dep} (${depRoadmap.phase_name}) must complete before Phase ${phase}`,
        action: 'run_command',
        command: `/gsd:execute-phase ${dep}`,
        severity: 'blocking',
        skippable: false,
      });
    }
  }
}
```

### Anti-Patterns to Avoid

- **Nested subagent spawning for upstream workflows:** AskUserQuestion breaks in nested contexts (#1009). Always redirect via exit-and-rerun pattern.
- **Duplicating prerequisite logic in each workflow:** Current problem -- plan-phase, execute-phase, and autonomous all have their own CONTEXT.md checks. Centralize in preflight.cjs.
- **Blocking on optional prerequisites:** CONTEXT.md is skippable (user can plan without it). UI-SPEC.md is skippable. Dependent phase completion is NOT skippable. Respect severity levels.
- **Auto-running upstream commands silently:** Always display what command needs to run and why. User confirms or skips.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Phase directory/file resolution | Custom file scanning | `findPhaseInternal()` from core.cjs | Already handles normalization, archived phases, all file patterns |
| Roadmap dependency parsing | Custom ROADMAP parser | `getRoadmapPhaseInternal()` + `roadmap analyze` | Already extracts `depends_on`, checkbox status, phase sections |
| Config value access | Direct JSON reading | `loadConfig()` from core.cjs | Handles defaults, cascading, missing files |
| UI detection | Copy paste the grep from plan-phase | New function in preflight.cjs that uses goal/name only | Current grep has false positives |
| Phase completion status | Manual SUMMARY counting | `roadmap analyze` `disk_status` field | Already compares plan vs summary counts |

## Common Pitfalls

### Pitfall 1: False Positive UI Detection

**What goes wrong:** Phase named "TypeScript interface refactoring" triggers UI-SPEC gate because "interface" matches.
**Why it happens:** Current grep is too broad -- matches programming keywords that overlap with UI terms.
**How to avoid:** Check only phase goal and name (not full section text). Use word-boundary patterns. Require compound terms ("user interface" not just "interface").
**Warning signs:** Non-frontend phases being flagged for UI-SPEC generation.

### Pitfall 2: Circular Dependency Chains

**What goes wrong:** Phase A depends on Phase B, Phase B depends on Phase A. Preflight enters infinite redirect loop.
**Why it happens:** ROADMAP.md allows arbitrary `Depends on` strings. No cycle detection.
**How to avoid:** Track visited phases in a Set. If a dependency check would revisit an already-checked phase, report as error instead of redirecting.
**Warning signs:** User sees repeated "run this first" messages for the same phases.

### Pitfall 3: Stale Completion Status

**What goes wrong:** ROADMAP.md says phase is complete (`[x]`) but disk state disagrees (missing summaries).
**Why it happens:** Manual edits to ROADMAP.md, or interrupted phase completion.
**How to avoid:** Check BOTH `roadmap_complete` (checkbox) AND `disk_status === 'complete'` from `roadmap analyze`. If they disagree, warn but use the more conservative (incomplete) interpretation.
**Warning signs:** Phase execution starts but plans are missing.

### Pitfall 4: Config Gate Mismatch

**What goes wrong:** Preflight blocks on UI-SPEC, but user has `ui_phase: false` in config. Or preflight requires CONTEXT.md, but user has `skip_discuss: true`.
**How to avoid:** Always read config gates FIRST before checking prerequisites. If `skip_discuss` is true, do not add CONTEXT.md blocker. If `ui_phase` and `ui_safety_gate` are both false, do not add UI-SPEC blocker.
**Warning signs:** Preflight blocks user from running a command they've explicitly configured to skip.

### Pitfall 5: Breaking Existing Workflow Behavior

**What goes wrong:** Adding preflight changes the behavior of plan-phase for users who are accustomed to the inline CONTEXT.md prompt.
**How to avoid:** Phase 1: add preflight as a new tool that workflows CAN use. Phase 2: migrate workflows to use it. Existing inline checks remain until explicitly removed. The preflight result includes `skippable: true` for optional prerequisites, preserving the "Continue without context" option.
**Warning signs:** Users confused that plan-phase no longer asks about missing CONTEXT.md.

## Code Examples

### Complete Blocker Check Functions

```javascript
// Source: Derived from plan-phase.md steps 4 and 5.6, verified against init.cjs

function checkContextExists(cwd, phase, phaseInfo, config, blockers) {
  // Respect skip_discuss config
  if (config.workflow?.skip_discuss === true) return;
  if (config.workflow?.discuss_mode === 'skip') return;

  if (phaseInfo?.has_context) return;

  blockers.push({
    type: 'missing_context',
    message: `No CONTEXT.md found for Phase ${phase}. Design preferences won't be included in plans.`,
    action: 'run_command',
    command: `/gsd:discuss-phase ${phase}`,
    severity: 'warning',
    skippable: true,
  });
}

function checkPlansExist(cwd, phase, phaseInfo, blockers) {
  const planCount = phaseInfo?.plans?.length || 0;
  if (planCount > 0) return;

  blockers.push({
    type: 'no_plans',
    message: `No plans found for Phase ${phase}. Run plan-phase first.`,
    action: 'run_command',
    command: `/gsd:plan-phase ${phase}`,
    severity: 'blocking',
    skippable: false,
  });
}
```

### gsd-tools.cjs Dispatcher Integration

```javascript
// Source: Pattern from gsd-tools.cjs dispatcher (line 1-80)

// In the command dispatcher switch/case:
case 'preflight':
  const preflightCmd = args[0];  // 'plan-phase', 'execute-phase', 'ui-phase'
  const preflightPhase = args[1];
  if (!preflightCmd || !preflightPhase) {
    error('Usage: gsd-tools preflight <command> <phase>');
  }
  require('./lib/preflight.cjs').cmdPreflight(cwd, preflightCmd, preflightPhase, raw);
  break;
```

### Test Structure

```javascript
// Source: Project convention from Phase 01 (node:test + node:assert)

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('preflight', () => {
  describe('plan-phase', () => {
    it('returns ready when CONTEXT.md exists', () => {
      // Setup temp dir with CONTEXT.md, call cmdPreflight
    });

    it('returns blocker when CONTEXT.md missing', () => {
      // Setup temp dir without CONTEXT.md, verify blocker type
    });

    it('skips CONTEXT.md check when skip_discuss is true', () => {
      // Setup config with skip_discuss: true, verify no blocker
    });

    it('detects UI phase correctly', () => {
      // Phase with "dashboard" in goal -> UI detected
      // Phase with "interface refactoring" in goal -> NOT UI detected
    });

    it('checks dependent phases', () => {
      // Phase with depends_on: "Phase 1" where Phase 1 is incomplete -> blocker
    });
  });
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Each workflow checks its own prerequisites inline | Each workflow checks its own prerequisites inline (CURRENT) | Since GSD v1 | Duplicated logic, inconsistent behavior |
| N/A | Centralized preflight resolver (THIS PHASE) | Phase 4 | Single source of truth for all prerequisite checks |

**Current inline checks that will be superseded:**
- `plan-phase.md` step 4: CONTEXT.md check with AskUserQuestion
- `plan-phase.md` step 5.6: UI-SPEC gate with grep-based UI detection
- `execute-phase.md` step validate_phase: plan count validation
- `autonomous.md` step 4: skip_discuss check + UI phase check

## Open Questions

1. **Should preflight replace or augment existing inline checks?**
   - What we know: Replacing inline checks is cleaner but changes behavior. Augmenting means duplicate code temporarily.
   - What's unclear: Whether users rely on the specific AskUserQuestion flow in plan-phase step 4.
   - Recommendation: Add preflight as new command first. Workflows adopt it in a follow-up refactor. Inline checks stay until all workflows are migrated.

2. **Should the resolver auto-chain commands or just redirect?**
   - What we know: Auto-chaining via nested Task/Skill calls breaks AskUserQuestion (#1009). The autonomous.md workflow chains via sequential Skill() calls at the top level.
   - What's unclear: Whether a `--auto-resolve` flag on preflight could auto-run upstream commands sequentially.
   - Recommendation: Start with redirect pattern (display command, exit). Auto-chain is a future enhancement that can reuse the autonomous.md sequential Skill() pattern.

3. **How to handle `--force` flag to skip all preflight checks?**
   - What we know: Some prerequisites are skippable (CONTEXT.md), others are not (missing plans for execute-phase).
   - Recommendation: `--force` skips only `skippable: true` blockers. Hard blockers (no plans, incomplete dependencies) cannot be forced.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | node:test + node:assert (project convention from Phase 01) |
| Config file | None needed (node:test is built-in) |
| Quick run command | `node --test get-shit-done/bin/lib/preflight.test.cjs` |
| Full suite command | `node --test get-shit-done/bin/lib/*.test.cjs` |

### Phase Requirements -> Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PF-01 | Detect missing CONTEXT.md for plan-phase | unit | `node --test get-shit-done/bin/lib/preflight.test.cjs` | Wave 0 |
| PF-02 | Detect missing UI-SPEC.md for UI phases | unit | same | Wave 0 |
| PF-03 | Detect incomplete dependencies | unit | same | Wave 0 |
| PF-04 | Respect config gates (skip_discuss, ui_phase) | unit | same | Wave 0 |
| PF-05 | Return structured blocker JSON | unit | same | Wave 0 |
| PF-06 | False positive UI detection prevention | unit | same | Wave 0 |
| PF-07 | Detect missing plans for execute-phase | unit | same | Wave 0 |

### Sampling Rate
- **Per task commit:** `node --test get-shit-done/bin/lib/preflight.test.cjs`
- **Per wave merge:** `node --test get-shit-done/bin/lib/*.test.cjs`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `get-shit-done/bin/lib/preflight.test.cjs` -- covers PF-01 through PF-07
- [ ] Test helpers for creating temp planning directories with specific artifact combinations

## Project Constraints (from CLAUDE.md)

- **Compatibilidade**: Cannot break existing GSD workflow -- extension, not substitution. Existing inline checks remain until explicitly migrated.
- **Performance**: Preflight must complete in <1s. Uses only synchronous fs operations and in-memory JSON parsing (same as init commands).
- **Upstream**: Module must be generic enough for PR to main GSD repo. No project-specific hardcoding.
- **Stack**: Must work language-agnostically. The preflight resolver checks planning artifacts, not source code.
- **Convention**: CommonJS module in `get-shit-done/bin/lib/`, follows `state.cjs`/`fmap.cjs` pattern. Tests use `node:test` + `node:assert`.
- **No workarounds**: If the nested subagent problem (#1009) cannot be solved cleanly, use the redirect pattern. Do not hack around it.
- **Causa raiz**: The root cause is scattered prerequisite logic. Fix by centralizing, not by adding another scattered check.

## Sources

### Primary (HIGH confidence)
- `get-shit-done/workflows/plan-phase.md` -- Steps 4 and 5.6 showing current inline prerequisite checks
- `get-shit-done/workflows/execute-phase.md` -- Step validate_phase showing plan existence check
- `get-shit-done/workflows/ui-phase.md` -- Step 1 showing init pattern and UI config check
- `get-shit-done/workflows/autonomous.md` -- Full auto-chain showing discuss+plan+execute sequencing
- `get-shit-done/bin/lib/init.cjs` -- `cmdInitPlanPhase` and `cmdInitExecutePhase` showing all available phase metadata
- `get-shit-done/bin/lib/roadmap.cjs` -- `cmdRoadmapAnalyze` showing dependency parsing from `depends_on`
- `get-shit-done/bin/lib/core.cjs` -- `findPhaseInternal` showing phase resolution with artifact detection
- `.planning/config.json` -- Current config showing `ui_phase`, `ui_safety_gate`, `skip_discuss` settings

### Secondary (MEDIUM confidence)
- `get-shit-done/workflows/discuss-phase.md` -- CONTEXT.md structure and purpose
- `get-shit-done/workflows/transition.md` -- Phase completion and advancement patterns

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new dependencies, all existing infrastructure verified in source
- Architecture: HIGH -- follows proven patterns (init.cjs, fmap.cjs) with direct source verification
- Pitfalls: HIGH -- all pitfalls derived from actual bugs/patterns found in workflow source code (#1009, UI grep false positives)

**Research date:** 2026-03-30
**Valid until:** 2026-04-30 (stable -- internal tooling, no external dependency drift)
