<purpose>
Reopen a completed phase for targeted gap closure. Reuses existing artifacts (CONTEXT, RESEARCH, UI-SPEC) instead of rebuilding from scratch. Five stages: freshness check → gap analysis → fix interview → fix planning → fix execution.
</purpose>

<core_principle>
Fix, don't rebuild. The phase already has its context, research, and specifications. This workflow identifies what was missed, confirms with the user, and generates surgical fix-plans that integrate into the existing phase.
</core_principle>

<process>

<step name="parse_args" priority="first">
Parse `$ARGUMENTS`:

- First positional token → `PHASE_ARG` (required)
- Optional `--skip-interview` → skip the interview step, use all gaps found
- Optional `--skip-analysis` → skip gap analysis, go straight to interview (user provides all gaps)

If no phase number provided, error: "Usage: /gsd:fix-phase {phase-number}"
</step>

<step name="initialize" priority="first">
Load context:

```bash
INIT=$(node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" init fix-phase "${PHASE_ARG}" --raw)
```

Parse JSON for: `phase_found`, `phase_completed`, `phase_dir`, `phase_number`, `phase_name`, `phase_slug`, `plans`, `summaries`, `plan_count`, `next_plan_num`, `artifacts`, `executor_model`, `verifier_model`, `planner_model`, `gap_analyzer_model`.

**Validation:**
- If `phase_found` is false → Error: "Phase {N} not found"
- If `phase_completed` is false → Error: "Phase {N} has incomplete plans. Use /gsd:execute-phase {N} to finish execution first, or /gsd:verify-work {N} to verify."
- If `artifacts.fix_context_exists` is true → Ask: "Phase {N} already has a FIX-CONTEXT.md from a previous fix session. Options: (1) Resume from existing FIX-CONTEXT → skip to planning, (2) Start fresh → re-analyze gaps"
</step>

<step name="freshness_check">
Evaluate if the phase's code context is still current:

```bash
FRESHNESS=$(node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" phase freshness "${PHASE_NUMBER}" --raw)
```

Parse JSON for: `fresh`, `staleness_pct`, `changed_files`, `completion_date`, `phases_since`.

**If fresh (staleness ≤ 30%):**
- Report: "Phase {N} artifacts are fresh ({staleness_pct}% files changed). Proceeding with existing context."
- Skip to gap_analysis.

**If stale (staleness > 30%):**
- Report: "Phase {N} has {staleness_pct}% of referenced files modified since completion (by phases {phases_since}). Running focused codebase mapping..."
- Spawn `gsd-codebase-mapper` agent focused on the changed files/directories:

```
Spawn agent: gsd-codebase-mapper
Prompt: "Map the current state of these files and their surrounding modules. Focus on understanding what changed since phase {N} was completed on {completion_date}. Files: {changed_files}. Write FIX-CODEBASE.md to {phase_dir}/ with the current state analysis."
```

- Wait for mapper to complete before proceeding.
</step>

<step name="gap_analysis">
**Skip if `--skip-analysis` flag is present.**

Spawn the gap analyzer agent:

```
Spawn agent: gsd-gap-analyzer
Prompt: "Analyze phase {PHASE_NUMBER} for scope gaps.

<files_to_read>
- {phase_dir}/{PHASE_NUMBER}-CONTEXT.md
- {phase_dir}/{PHASE_NUMBER}-RESEARCH.md (if exists)
- {phase_dir}/{PHASE_NUMBER}-UI-SPEC.md (if exists)
- {phase_dir}/{PHASE_NUMBER}-VERIFICATION.md (if exists)
- {phase_dir}/{PHASE_NUMBER}-DISCUSSION-LOG.md (if exists)
- {phase_dir}/FIX-CODEBASE.md (if exists)
- All {PHASE_NUMBER}-*-PLAN.md files
- All {PHASE_NUMBER}-*-SUMMARY.md files
</files_to_read>

Write FIX-GAPS.md to {phase_dir}/."
```

Wait for gap analyzer to complete. Read the produced FIX-GAPS.md.

**If zero gaps found and `--skip-analysis` not set:**
- Report: "Gap analysis found no scope gaps in phase {N}. If you believe something is missing, re-run with --skip-analysis to provide gaps manually."
- Ask: continue to interview (to add manual gaps) or exit?
</step>

<step name="fix_interview">
**Skip if `--skip-interview` flag is present** (use all gaps from analysis).

Present gap analysis results to user in simple terms:

```
## Fix-Phase {N}: Gap Review

{For each GAP in FIX-GAPS.md:}

**{GAP-XX}: {title}**
Esperado: {what was expected}
Entregue: {what was delivered}

→ Confirma? (sim / não / ajustar)
```

**For each gap, collect user response:**
- `sim` / `confirmo` → gap confirmed as-is
- `não` / `descarto` → gap removed
- Any other text → gap adjusted with user's description

**After all gaps reviewed, open question:**
"Além desses gaps, o que mais você notou que faltou ou ficou errado?"

Collect free-form input. Each item becomes a new gap with status "ADICIONADO PELO USUÁRIO".

**Write FIX-CONTEXT.md** to the phase directory:

```markdown
---
phase: {N}
fix_session: {YYYY-MM-DD}
gaps_confirmed: {count}
gaps_descartados: {count}
gaps_adicionados_usuario: {count}
---

## Gaps Confirmados

### GAP-XX: {title} — CONFIRMADO
- Detalhe: "{user detail or original description}"

### GAP-YY: {title} — ADICIONADO PELO USUÁRIO
- Descrição: "{user's description}"

## Gaps Descartados

### GAP-ZZ: {title} — DESCARTADO
- Motivo: "{user's reason}"
```

**If zero gaps confirmed and zero added:**
- Report: "No gaps to fix. Phase {N} remains as-is."
- Exit workflow.

Commit FIX-CONTEXT.md:
```bash
node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" commit "docs(phase-${PHASE_NUMBER}): fix-phase gap analysis and interview" --files "${PHASE_DIR}/FIX-GAPS.md" "${PHASE_DIR}/FIX-CONTEXT.md"
```
</step>

<step name="fix_planning">
Read FIX-CONTEXT.md to get confirmed gaps.

**Evaluate research needs:**
For each confirmed gap, check if the existing RESEARCH.md or UI-SPEC.md covers it:
- Read the gap description
- Search RESEARCH.md for relevant keywords
- Search UI-SPEC.md for relevant component/behavior references

**If gaps require new research** (topic not covered in existing artifacts):
- Spawn `gsd-phase-researcher` focused only on the uncovered gaps
- Append findings to a FIX-RESEARCH.md in the phase directory

**If gaps require UI research** (UI component/behavior not in UI-SPEC):
- Spawn `gsd-ui-researcher` focused only on the uncovered UI gaps
- Append findings to a FIX-UI-SPEC.md in the phase directory

**Generate fix plans:**
Spawn `gsd-planner` with fix context:

```
Spawn agent: gsd-planner
Prompt: "Create fix plans for phase {PHASE_NUMBER}.

MODE: gap_closure (fix)

<files_to_read>
- {phase_dir}/{PHASE_NUMBER}-CONTEXT.md
- {phase_dir}/FIX-CONTEXT.md
- {phase_dir}/{PHASE_NUMBER}-RESEARCH.md (if exists)
- {phase_dir}/FIX-RESEARCH.md (if exists)
- {phase_dir}/{PHASE_NUMBER}-UI-SPEC.md (if exists)
- {phase_dir}/FIX-UI-SPEC.md (if exists)
- {phase_dir}/FIX-CODEBASE.md (if exists)
- All existing {PHASE_NUMBER}-*-PLAN.md and {PHASE_NUMBER}-*-SUMMARY.md
</files_to_read>

<user_decisions>
{Content of FIX-CONTEXT.md — confirmed gaps}
</user_decisions>

IMPORTANT:
- Plan numbers start at {NEXT_PLAN_NUM} (e.g., {PHASE_NUMBER}-{NEXT_PLAN_NUM:02d}-PLAN.md)
- Each plan frontmatter MUST include: fix: true, fixes_gaps: [GAP-XX, ...]
- Reuse existing CONTEXT/RESEARCH — do NOT re-research topics already covered
- Each gap should map to at least one plan
- Plans should be self-contained — do not reference original plan tasks
"
```

**Validate fix plans:**
Spawn `gsd-plan-checker` on each generated plan. Standard revision loop (max 3 iterations).

Report: "Generated {N} fix plans for phase {PHASE_NUMBER}. Plans: {plan_ids}"
</step>

<step name="fix_execution">
**Update state to "fixing":**
```bash
node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" state begin-fix --phase "${PHASE_NUMBER}" --name "${PHASE_NAME}" --plans "${FIX_PLAN_COUNT}"
```

**Update ROADMAP.md** — mark phase as "Fixing":
Read ROADMAP.md. Find the phase section. If it says "Complete" or "completed", update status to show fixing is in progress. Use the Edit tool to update the status cell or completion note.

**Check for concurrent execution:**
```bash
CURRENT_STATUS=$(node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" state get --raw 2>/dev/null | node -e "const d=require('fs').readFileSync('/dev/stdin','utf-8');try{const j=JSON.parse(d);console.log(j.Status||'')}catch{console.log('')}")
```

If `CURRENT_STATUS` contains "Executing Phase" (different phase):
- Warn: "Phase {X} is currently executing. Options: (1) Pause current execution and fix phase {N}, (2) Run fix in a worktree (/gsd:new-workspace)"
- Wait for user decision.

**Execute fix plans:**
Use the same execution pattern as execute-phase but only for fix plans.

For each fix plan (sequentially or by wave):
- Spawn `gsd-executor` agent with the fix plan
- Wait for completion
- Verify SUMMARY.md created
- Commit

**Re-verify phase:**
After all fix plans executed, spawn `gsd-verifier`:

```
Spawn agent: gsd-verifier
Prompt: "Verify phase {PHASE_NUMBER} goal achievement. This is a re-verification after fix-phase.

<files_to_read>
- All PLAN.md files in {phase_dir}/ (including fix plans)
- All SUMMARY.md files in {phase_dir}/
- {phase_dir}/{PHASE_NUMBER}-CONTEXT.md
- {phase_dir}/FIX-CONTEXT.md
</files_to_read>

Check that BOTH the original phase goals AND the fix gaps have been addressed.
Write updated VERIFICATION.md to {phase_dir}/."
```

**Handle verification result:**
- If PASSED → proceed to completion
- If gaps_found → Ask: "Verification found remaining gaps. Run another fix cycle? (yes/no)"
  - If yes → loop back to gap_analysis with the new VERIFICATION.md
  - If no → complete with warnings

**Restore state:**
```bash
node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" state end-fix --phase "${PHASE_NUMBER}"
```

**Update ROADMAP.md** — mark as fixed:
Update the phase section to show completion with fix date:
- Plan list: append fix plans with "Fix (GAP-XX)" labels
- Status: "Complete"
- Add: "Fixed: {DATE}"

Commit all changes:
```bash
node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" commit "docs(phase-${PHASE_NUMBER}): fix-phase complete" --files "${PHASE_DIR}/" ".planning/STATE.md" ".planning/ROADMAP.md"
```

Report: "Fix-phase {N} complete. {FIX_PLAN_COUNT} fix plans executed. Phase re-verified."
</step>

</process>
