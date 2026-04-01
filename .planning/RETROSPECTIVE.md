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

## Cross-Milestone Trends

### Process Evolution

| Milestone | Commits | Phases | Key Change |
|-----------|---------|--------|------------|
| v1.0 | ~149 | 7 | Established TDD + atomic commits + SUMMARY.md per plan |

### Cumulative Quality

| Milestone | Tests | Coverage | Zero-Dep Additions |
|-----------|-------|----------|-------------------|
| v1.0 | 73+ OPS + fmap + preflight + config | Not measured | fmap.cjs, ops.cjs, preflight.cjs (all zero external deps) |

### Top Lessons (Verified Across Milestones)

1. Small plans (1-2 tasks) execute faster and cleaner than large ones -- verified by 16/16 plans in v1.0
2. Structured frontmatter in SUMMARY.md enables cross-phase dependency tracking without extra tooling
