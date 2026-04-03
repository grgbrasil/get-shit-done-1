# Design: `/gsd:preflight <phase>`

**Date:** 2026-04-03
**Status:** Approved
**Approach:** Hybrid — JS engine (data) + workflow .md (presentation)

## Purpose

Standalone pre-workflow validation layer. Checks phase readiness before any discuss/plan/execute workflow runs. Complementary to existing inline checks — does not replace them.

## Components

### 1. JS Engine: `get-shit-done/bin/lib/preflight.cjs`

Single exported function: `cmdPreflight(cwd, phaseNum, raw)`

**Input formats:**
- `node gsd-tools.cjs preflight <phase>` — standalone, auto-detects workflow
- `node gsd-tools.cjs preflight <phase> --workflow <discuss|plan|execute|verify>` — explicit workflow
- `node gsd-tools.cjs preflight <workflow> <phase>` — called from within workflows (compatible with plan-phase step 3.7 format: `preflight plan-phase "${padded_phase}"`)

The second positional arg is checked: if it matches a known workflow name (`discuss-phase`, `plan-phase`, `execute-phase`, `verify-phase`, `discuss`, `plan`, `execute`, `verify`), it's treated as workflow. Otherwise it's the phase number.

If workflow not specified, auto-detects next step from artifact state:
- No CONTEXT.md → `discuss`
- CONTEXT.md exists, no PLANs → `plan`
- PLANs exist, no SUMMARYs → `execute`
- SUMMARYs exist → `verify`

### 2. Routing in `gsd-tools.cjs`

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

### 3. Workflow: `commands/gsd/preflight.md`

Calls the JS engine, formats GO/NO-GO report using ui-brand patterns, shows next command with `/clear` suggestion.

## Checks (in order)

### 1. Planning exists
- `.planning/` directory and `ROADMAP.md` must exist
- Missing → blocker `no_planning` / `no_roadmap`

### 2. Phase exists
- Uses existing `roadmapGetPhase()` from `roadmap.cjs`
- Not found → blocker `phase_not_found`

### 3. Dependencies complete
- Parses `depends_on` field from phase section in ROADMAP
- Values "Nothing", "None", "—" → skip (no dependencies)
- For each dependency phase number: checks `roadmap_complete` via `roadmapAnalyze()`
- Incomplete dependency → blocker `dependency_incomplete` with command to complete it

### 4. Artifact gate
Based on detected/specified workflow:

| Workflow | Required artifact | Blocker if missing |
|----------|------------------|--------------------|
| `discuss` | None | — |
| `plan` | `*-CONTEXT.md` | `artifact_missing` |
| `execute` | At least 1 `*-PLAN.md` | `artifact_missing` |
| `verify` | At least 1 `*-SUMMARY.md` | `artifact_missing` |

Additional: if phase ROADMAP section contains frontend indicators (`UI|interface|frontend|component|layout|page|screen|view|form|dashboard|widget`) and workflow is `plan` or `execute`, checks for `*-UI-SPEC.md`. Missing → warning `ui_spec_missing` (not blocker).

### 5. Canonical refs validation
- Skip if: no `*-CONTEXT.md`, or no `<canonical_refs>` section, or section is empty, or contains "No external specs"
- Extracts paths via regex `` `([^`]+)` `` from the section
- Strips `§N` suffixes (section references) before checking
- Resolves paths relative to cwd
- Missing file → warning `canonical_ref_missing` with exact path

### 6. Plan files_modified validation
- Skip if: no `*-PLAN.md` files exist
- For each PLAN: extracts `files_modified` from YAML frontmatter
- Skip conditions per plan: field absent, empty, malformed YAML, contains globs (`*`, `**`)
- For existing paths: validates with `fs.existsSync()`
- For new files (not on disk): checks `path.dirname()` exists. Parent missing → warning `files_modified_missing`
- Malformed frontmatter → warning `malformed_frontmatter`, continue to next plan

## Guards

- Any parser failure (YAML, regex, fs) → warning with context, never crash/throw
- Section not found in artifact → silent skip
- Phase dir doesn't exist but phase is in ROADMAP → not a blocker (discuss-phase creates it)
- `.planning/` missing → single blocker, skip all other checks

## Output JSON

```json
{
  "ready": true,
  "phase": "3",
  "phase_name": "API Integration",
  "detected_workflow": "plan",
  "next_command": "/gsd:plan-phase 3",
  "blockers": [
    {
      "type": "dependency_incomplete",
      "message": "Phase 2 (Core Features) not complete",
      "command": "/gsd:execute-phase 2",
      "skippable": false
    }
  ],
  "warnings": [
    {
      "type": "canonical_ref_missing",
      "message": "Referenced file not found: docs/api-spec.md",
      "path": "docs/api-spec.md"
    }
  ]
}
```

- `ready` = `false` if any blocker has `skippable: false`
- Blocker types: `no_planning`, `no_roadmap`, `phase_not_found`, `dependency_incomplete`, `artifact_missing`
- Warning types: `canonical_ref_missing`, `files_modified_missing`, `ui_spec_missing`, `malformed_frontmatter`

## Workflow Output Format

### GO report
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► PREFLIGHT PHASE {N} — GO ✓
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Phase {N}: {Name}
Dependencies: ✓ All complete
Artifacts: ✓ Ready for {workflow}
Canonical refs: ✓ {X}/{X} valid
Plan paths: ✓ {Y}/{Y} valid

───────────────────────────────────────────────────────────────

## ▶ Next Up

/gsd:{workflow}-phase {N}

<sub>/clear first → fresh context window</sub>

───────────────────────────────────────────────────────────────
```

### NO-GO report
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► PREFLIGHT PHASE {N} — NO-GO ✗
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Phase {N}: {Name}

✗ {blocker.message}
  → {blocker.command}

⚠ {warning.message}
  → {warning.command}
```

## Integration with Existing Workflows

The `plan-phase.md` step 3.7 already calls:
```bash
PREFLIGHT=$(node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" preflight plan-phase "${padded_phase}" 2>/dev/null || echo '{"ready":true,"blockers":[]}')
```

Once this engine exists, the fallback stops triggering. The JSON contract is already compatible. No workflow refactoring needed.

## Files to Create/Modify

| File | Action |
|------|--------|
| `get-shit-done/bin/lib/preflight.cjs` | Create — engine |
| `get-shit-done/bin/gsd-tools.cjs` | Modify — add `case 'preflight'` + require |
| `commands/gsd/preflight.md` | Create — skill/workflow |

## Dependencies

Uses existing modules only:
- `roadmap.cjs` — `cmdRoadmapGetPhase()`, `cmdRoadmapAnalyze()`
- `core.cjs` — `planningPaths()`, `planningDir()`, `findPhaseInternal()`, `output()`, `error()`
- `frontmatter.cjs` — `extractFrontmatter()` for PLAN YAML parsing
