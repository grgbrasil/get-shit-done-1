# Milestones

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
