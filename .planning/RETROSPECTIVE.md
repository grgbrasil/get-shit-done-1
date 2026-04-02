# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v1.0 — GSD Impact Analysis

**Shipped:** 2026-03-30
**Phases:** 7 | **Plans:** 16 | **Sessions:** ~149 commits

### What Was Built
- **Function Map CRUD** (Phase 01): fmap.cjs module with O(1) key lookup, merge/replace-file update, stats, full-scan trigger, and gsd-cataloger agent with Serena MCP primary + grep fallback
- **Impact Analysis** (Phase 02): fmap impact CLI for pre-edit caller/signature snapshots, normalizeSignature for structural diff detection, PreToolUse advisory hook (gsd-impact-guard.js), and full impact protocol in gsd-executor
- **Model Routing Integration** (Phase 03): model_overrides and impact_analysis config defaults with three-level merge, Context Engine function-map-stats.json injection, post-wave cataloger in execute-phase, impact analysis opt-in in new-project, third-party provider docs
- **Preflight Dependency Resolver** (Phase 04): preflight.cjs module checking CONTEXT.md/UI-SPEC.md/dependent phases/plans existence with config-gate suppression, wired into plan-phase/execute-phase/ui-phase workflows with backward-compatible fallback
- **OPS Foundation** (Phase 05): ops.cjs with registry CRUD, hybrid area auto-detection (routes + directories), adjacency-list graph builder (tree.json) with multi-language import scanning (ES6/CJS/PHP), /ops:init /ops:map /ops:add skill commands
- **OPS Workflows** (Phase 06): appendHistory, computeBlastRadius (threshold=5), refreshTree helpers; cmdOpsInvestigate (full tree context), cmdOpsDebug (context-pack.md emitter), cmdOpsFeature (blast-radius dispatch), cmdOpsModify (tree edge impact analysis); ops-summary.json Context Engine injection
- **OPS Governance** (Phase 07): cmdOpsStatus with health scoring (green/yellow/red), cmdOpsSpec with 4-section template management, cmdOpsBacklog with priority queue (list/add/prioritize/promote/done); 73 OPS tests total

### What Worked
- **TDD discipline**: RED/GREEN cycle on every plan kept regressions at zero across 16 plans
- **Atomic commits per task**: Every task had its own commit, making rollback trivial and history readable
- **Plan-level SUMMARY.md with structured frontmatter**: Dependency graphs, key decisions, and deviations documented per-plan enabled cross-phase awareness
- **Wave-based parallel execution**: Plans within a phase ran in parallel when independent (e.g., 03-01 config + 03-02 context engine)
- **5-minute average plan execution**: Tight plans with 1-2 tasks each kept context fresh and execution fast
- **Provider detection pattern**: Serena MCP probe-then-fallback established a reusable pattern for optional tool dependencies
- **Auto-fix deviation tracking**: Every deviation from plan was documented with severity, fix, and verification -- no silent workarounds

### What Was Inefficient
- **Late milestone archival**: v1.0 was fully built and verified but not archived until a separate cleanup session -- the milestone completion step should be part of the last phase verification
- **Worktree branch drift**: Plans 06-01 and 06-02 hit blocking deviations because worktree branches predated Phase 05 code -- parallel execution across worktrees needs prerequisite checks
- **No per-phase SUMMARY.md**: Only per-plan summaries exist; a phase-level rollup would have made this retrospective easier to write
- **captureOutput test infrastructure**: Had to be discovered and fixed mid-execution (fs.writeSync vs process.stdout.write) -- test helpers for output interception should be documented in a testing conventions file
- **loadConfig flattening surprise**: preflight.cjs had to create loadRawConfig() because loadConfig() loses nested keys -- config access patterns need documentation

### Patterns Established
- **Function Map key format**: `file::Class::method` with POSIX slashes, no ./ prefix, normalized on read and write
- **fmap CLI pattern**: `gsd-tools fmap <subcommand>` routing to fmap.cjs cmd* functions
- **OPS registry pattern**: Slim registry.json index + per-area directories for heavy data (tree.json, history.json, specs.md, backlog.json)
- **Blast-radius dispatch**: computeBlastRadius returns `needs_full_plan` boolean, routing to quick vs plan execution
- **Context-pack composability**: Structured markdown emitted by one command, consumed by another (/ops:debug -> /gsd:debug)
- **Health flag scoring**: Array of string flags, count determines severity (0=green, 1=yellow, 2+=red)
- **Preflight gate pattern**: Run gsd-tools preflight, parse JSON, exit on non-skippable blockers, warn on skippable
- **Impact card format**: IMPACT DETECTED with Type/Function/Callers/Old behavior/New behavior/Risk/Options
- **Threshold-split resolution**: <=10 callers inline, 11-50 sub-agents, >50 escalate to human

### Key Lessons
1. **Plans should be 1-2 tasks, under 5 minutes each.** Every plan that hit this target had zero issues. The few that grew larger (07-01 at 5min with 3 tasks) were the ones where infrastructure surprises appeared.
2. **Worktrees need prerequisite validation.** When running parallel plans on different branches, check that prerequisite phase code is present before starting execution. Two plans lost time copying code from main.
3. **Config access patterns must be documented.** The loadConfig flattening vs raw JSON distinction caused a bug that could have been prevented with clear documentation of when to use each.
4. **Advisory hooks are the right default.** gsd-impact-guard.js as advisory-only (never blocks) was the correct call -- it guides without obstructing, and can be upgraded to blocking later with data.
5. **Milestone archival should be automated.** The gap between "all phases verified" and "milestone archived" is a process hole that should be closed by making archival part of the last verification step.

### Cost Observations
- Model mix: Predominantly haiku for cataloger/simple agents, sonnet for planning, opus for complex execution
- Sessions: ~149 commits across 7 phases in a single day (2026-03-30)
- Notable: Average plan execution of 3.5 minutes across 16 plans -- total active execution under 1 hour for the entire milestone

---

## Milestone: v2.0 — Claude Code Insights

**Shipped:** 2026-04-02
**Phases:** 5 | **Plans:** 13 | **Sessions:** ~85 commits (2026-04-01 to 2026-04-02)

### What Was Built
- **Executor Discipline** (Phase 01): scope echo, commit-before-report gate, context persistence, synthesis step, maxTurns config (3 tiers), 9-section structured handoff
- **Model Routing Fix** (Phase 02): MODEL_ALIAS_MAP updated to 4.6/4.6/4.5, EFFORT_PROFILES for 16 agents, plan-checker moved local, resolveEffort() with 25 init.cjs fields and 8 workflow updates
- **Guardrails Upgrade** (Phase 03): CLAUDE.md global (anti-false-claims, preservation, read-before-edit, compaction), destructive cmd hook (14 patterns), impact advisory hook, agent-level anti_false_claims + context_persistence blocks
- **Brainstorm Integration** (Phase 04): /gsd:brainstorm-phase command, 10-step interactive workflow, BRAINSTORM.md template with 4 XML sections, discuss-phase Step 2.5 integration, artifact detection in core/init
- **Phase Lock** (Phase 05): lock.cjs with atomic wx file creation, PID liveness via signal 0, PreToolUse blocking hook, auto-acquire on first write, gsd-tools dispatcher, unlock-phase command, progress Lock column

### What Worked
- **Three-layer guardrail pattern**: CLAUDE.md global + agent XML blocks + runtime hooks proved effective — each layer catches what others miss
- **Source code mining**: Reading Claude Code source directly produced concrete, actionable patterns vs. speculative improvements
- **Parallel phase execution**: Phases 1-3 independent ordering by impact allowed fast sequential delivery
- **Infrastructure detection in autonomous mode**: Skipping discuss for infrastructure phases saved significant time
- **Cross-phase integration stayed clean**: core.cjs, init.cjs, install.js modified by 3-5 phases each with zero conflicts

### What Was Inefficient
- **Tracking staleness**: REQUIREMENTS.md traceability table and ROADMAP progress fell behind execution. Fixed late.
- **GUARD-03 planning overhead**: Created Phase 6, planned it, started execution, then user deferred — wasted context on unnecessary planning
- **Nyquist validation gap**: 4 of 5 phases have partial/missing VALIDATION.md — nyquist workflow not integrated smoothly yet
- **SUMMARY frontmatter parsing**: summary-extract tool failed to parse MODEL-04 from 02-02-SUMMARY.md despite it being present — brittle YAML parsing

### Patterns Established
- **Anti-false-claims bidirectional**: "Never claim done" + "When confirmed, say clearly" — prevents both false positives and false negatives
- **Context persistence per role**: Each long-running agent gets role-specific persistence instructions (executor: decisions/findings, planner: architecture, researcher: sources, debugger: root cause)
- **Advisory hook escalation path**: Start advisory (gsd-impact-guard), upgrade to blocking when proven (gsd-phase-lock)
- **Phase lock via PreToolUse**: Hook-based locking with process.ppid session identity — zero changes to existing workflows

### Key Lessons
1. **Defer uncertain features early.** GUARD-03 was flagged as uncertain in discuss-phase but carried through planning/execution anyway. Should have deferred during planning, not during execution.
2. **Tracking updates should be automated.** REQUIREMENTS.md traceability and ROADMAP progress require manual gsd-tools commands that are easy to forget. Consider auto-updating on plan completion.
3. **Three-layer guardrails work.** The pattern of global rules + agent reinforcement + runtime hooks provides defense-in-depth that catches failures at multiple levels.
4. **Infrastructure phases don't need discuss.** Detecting and skipping discuss for pure-infrastructure phases (no user-facing behavior) saves significant time without quality loss.

### Cost Observations
- Model mix: Opus for orchestration/execution, sonnet for planning/research, haiku for verification/checking
- Sessions: 2 days (2026-04-01 to 2026-04-02), ~85 commits
- Notable: 5 phases planned and executed in under 2 hours total active time. Milestone audit + completion added ~30 min.

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Commits | Phases | Key Change |
|-----------|---------|--------|------------|
| v1.0 | ~149 | 7 | Established TDD + atomic commits + SUMMARY.md per plan |
| v2.0 | ~85 | 5 | Three-layer guardrail pattern + infrastructure phase detection |

### Cumulative Quality

| Milestone | Tests | Coverage | Zero-Dep Additions |
|-----------|-------|----------|-------------------|
| v1.0 | 73+ OPS + fmap + preflight + config | Not measured | fmap.cjs, ops.cjs, preflight.cjs (all zero external deps) |
| v2.0 | 225+ (41 guard + 17 lock + 167 model) | Not measured | lock.cjs, gsd-workflow-guard.js, gsd-phase-lock.js |

### Top Lessons (Verified Across Milestones)

1. Small plans (1-2 tasks) execute faster and cleaner than large ones -- verified across 29 plans in v1.0 + v2.0
2. Structured frontmatter in SUMMARY.md enables cross-phase dependency tracking without extra tooling
3. Three-layer guardrail pattern (global + agent + hook) provides defense-in-depth — verified in v2.0 Phase 3
4. Advisory-first hooks are the right default — can escalate to blocking with confidence (advisory in v1.0 → blocking lock in v2.0)
