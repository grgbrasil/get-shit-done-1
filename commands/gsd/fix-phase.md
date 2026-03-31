---
name: gsd:fix-phase
description: Reopen a completed phase to fix scope gaps — reuses existing artifacts instead of rebuilding
argument-hint: "<phase-number> [--skip-interview] [--skip-analysis]"
allowed-tools:
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - Bash
  - Task
  - AskUserQuestion
---
<objective>
Reopen a completed phase to identify and fix scope gaps — features that were discussed or specified but not delivered, or delivered too superficially.

Unlike creating a new phase, fix-phase reuses all existing artifacts (CONTEXT, RESEARCH, UI-SPEC, plans) and generates surgical fix-plans that integrate into the existing phase structure.

Five stages:
1. **Freshness check** — evaluate if phase context is still current
2. **Gap analysis** — automatically cross-reference artifacts against deliveries
3. **Fix interview** — confirm gaps with user, capture additional gaps
4. **Fix planning** — generate targeted fix-plans (research only if needed)
5. **Fix execution** — execute fix-plans, re-verify, update state

Flag handling:
- `--skip-interview` — use all automatically detected gaps without user confirmation
- `--skip-analysis` — skip automatic gap detection, user provides all gaps manually
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/fix-phase.md
</execution_context>

<context>
Phase: $ARGUMENTS

Context files are resolved inside the workflow via `gsd-tools init fix-phase`.
</context>

<process>
Execute the fix-phase workflow from @~/.claude/get-shit-done/workflows/fix-phase.md end-to-end.
Preserve all workflow gates (freshness check, gap analysis, interview, planning validation, verification).
</process>
