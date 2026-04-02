# Milestones

## v1.0 Claude Code Insights (Shipped: 2026-04-02)

**Phases completed:** 5 phases, 13 plans, 24 tasks

**Key accomplishments:**

- Three discipline patterns from Claude Code fork children added to gsd-executor: scope echo, commit-before-report gate, and micro-compact context persistence
- Added synthesize_understanding step to planner agent enforcing "never delegate understanding" coordinator pattern from Claude Code source analysis
- MAX_TURNS config with three complexity tiers and 9-section structured phase handoff in summary template
- MODEL_ALIAS_MAP updated to opus-4-6/sonnet-4-6/haiku-4-5, EFFORT_PROFILES added with 16 agents, plan-checker moved from remote deepseek to local
- resolveEffort() function with 16-agent effort lookup, 25 init.cjs effort fields, 8 workflow updates, and stderr observability logging
- Four guardrail blocks added to global CLAUDE.md: anti-false-claims expansion (6 bidirectional rules), tool result preservation, read-before-edit enforcement, and context compaction instructions
- Destructive command detection (14 patterns) in gsd-workflow-guard.js + read-before-edit advisory in gsd-impact-guard.js, with build pipeline and installer registration fixes
- Anti-false-claims defense-in-depth for executor/verifier and role-specific context persistence for planner/researcher/debugger agents
- GSD-native brainstorm workflow with 10 interactive steps, one-question-at-a-time Q&A, 2-3 approach proposals with trade-offs, and BRAINSTORM.md template with 4 XML sections feeding into discuss-phase
- Brainstorm-phase wired into GSD infrastructure: artifact detection in core/init, discuss-phase BRAINSTORM.md consumption, and command routing in do.md/help.md
- Atomic file-based phase lock with PID liveness detection, stale recovery, and race-condition-safe acquire/release API
- PreToolUse blocking hook that auto-acquires phase locks on first write and blocks concurrent sessions, with gsd-tools lock dispatcher and unlock-phase escape hatch
- Phase lock wired into build pipeline, install flow, gitignore, and progress/init reporting with Lock column in table output

---

## v1.0 GSD Impact Analysis (Shipped: 2026-04-01)

**Phases completed:** 7 phases, 16 plans

**Key accomplishments:**

- Flat JSON function map with O(1) key lookup, merge/replace-file update, stats aggregation, and gsd-cataloger haiku profile
- gsd-cataloger agent with Serena MCP primary path, LLM-assisted grep fallback, and fmap changed-files for incremental scanning
- fmap impact subcommand returning pre-edit caller/signature snapshots plus normalizeSignature for structural diff detection
- PreToolUse advisory hook + executor prompt protocol for mid-execution impact analysis with threshold-split auto-resolve
- Preflight CLI command checking CONTEXT.md, UI-SPEC.md, dependent phases with config-gate suppression
- OPS registry CRUD with hybrid area auto-detection (routes + directories) and per-area directory persistence
- ops workflows: investigate, debug, feature, modify with blast-radius dispatch and tree edge impact analysis
- ops governance: status health scoring, specs management, and per-area backlog queue

**Known Gaps (from audit):**

- MODEL-01 through MODEL-04 unsatisfied (addressed in v2.0 Phase 2)

**Archive:** `.planning/milestones/v1.0-ROADMAP.md`

---
