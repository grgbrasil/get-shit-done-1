# Phase 3: Model Routing & Integration - Context

**Gathered:** 2026-03-30
**Status:** Ready for planning

<domain>
## Phase Boundary

Wire all Phase 1 (Function Map) and Phase 2 (Impact Analysis) components into GSD workflows. Per-agent model configuration with third-party provider passthrough. Opt-in toggle in `/gsd:new-project`. No new analysis capabilities — this is the integration and configuration phase.

</domain>

<decisions>
## Implementation Decisions

### Model Routing (MODEL-01, MODEL-02, MODEL-04)
- **D-01:** Extend existing `model_overrides` in config.json — `resolveModelInternal()` in core.cjs already checks `config.model_overrides?.[agentType]` before profile fallback. No new resolution logic needed.
- **D-02:** `buildNewProjectConfig()` in config.cjs gains `model_overrides: {}` in hardcoded defaults. When empty, profile-based resolution applies. When user sets a key (e.g., `"gsd-cataloger": "haiku"`), it takes precedence.
- **D-03:** Auto-config on first run: if config.json exists but lacks `model_overrides`, `loadConfig()` fills it from defaults (existing three-level merge handles this). No lazy-write at resolve time.

### Third-Party Providers (MODEL-03)
- **D-04:** GSD passes model IDs verbatim to the runtime — no provider registry, no API key management in GSD. Users set fully-qualified IDs in `model_overrides` (e.g., `"gsd-cataloger": "openrouter/meta-llama/llama-3"`). The AI runtime (Claude Code, OpenCode, Copilot) handles provider routing.
- **D-05:** Documentation-only for provider support — a section in model-profiles reference doc explaining how to set third-party models. No code changes for provider routing itself.

### Function Map Context Injection (INT-02)
- **D-06:** Summary injection, not full JSON. Context Engine's Execute manifest gets a `functionMapStats` key that injects `gsd-tools fmap stats` output (counts, file coverage, staleness). Agents use `gsd-tools fmap get <key>` for specific lookups on-demand.
- **D-07:** Rationale: function-map.json can grow to hundreds of KB for real codebases. Full injection bloats context. The impact guard hook already calls `fmap get` per-function — this pattern works and scales.

### Impact Analysis Workflow Integration (INT-01, INT-03)
- **D-08:** Impact Analysis is already wired via PreToolUse hook (`gsd-impact-guard.js`) and prompt instructions in `gsd-executor.md`. INT-03 is functionally complete from Phase 2. This phase validates the hook registration in `install.js` and ensures it activates correctly when `impact_analysis.enabled: true`.
- **D-09:** Integration with plan-phase and discuss-phase (INT-01) means: planner reads Function Map stats to inform task sizing (how many functions in scope), researcher can reference fmap for existing code analysis. Both via the Context Engine summary injection (D-06).
- **D-10:** No new mandatory step in execute-phase workflow — the PreToolUse hook IS the automatic step. Workflow markdown stays unchanged.

### Parallel Wave Safety (INT-04)
- **D-11:** Cataloger runs post-wave, not during waves. After each wave completes, a single cataloger pass processes all changed files from that wave. No concurrent writes to function-map.json.
- **D-12:** Implementation: execute-phase workflow gains a `post_wave_cataloger` step between waves. Uses `gsd-tools fmap changed-files` to detect what changed, then runs cataloger update on those files only.
- **D-13:** If a project has `impact_analysis.enabled: false`, the post-wave cataloger step is skipped entirely.

### Opt-in Toggle (INT-05, FMAP-08)
- **D-14:** Single toggle: `impact_analysis.enabled` (boolean) in config.json root. The impact guard hook already checks this key and silently exits when false.
- **D-15:** `/gsd:new-project` workflow gains one question in Round 2 config: "Activate Function Map + Impact Analysis? (Prevents silent breakage when agents modify shared functions)". Default: false (opt-in, not forced).
- **D-16:** When enabled, `impact_analysis` section in config also stores `auto_resolve_threshold` (default: 10) and `escalation_threshold` (default: 50) — the Phase 2 thresholds that are currently hardcoded.

### Claude's Discretion
- Exact placement of the new-project question (within Round 2 or as Round 3)
- Wording of the opt-in question
- Whether fmap stats output includes file-level detail or just aggregate counts
- Post-wave cataloger: inline in execute-phase workflow or spawned as background agent
- Format of function map stats in Context Engine output

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Model Routing
- `get-shit-done/bin/lib/model-profiles.cjs` — MODEL_PROFILES mapping, VALID_PROFILES, getAgentToModelMapForProfile()
- `get-shit-done/bin/lib/core.cjs` — resolveModelInternal() with model_overrides check (line ~1000)
- `get-shit-done/bin/lib/config.cjs` — buildNewProjectConfig(), loadConfig(), three-level merge, model_profile default
- `get-shit-done/references/model-profiles.md` — Human-readable profile documentation

### Function Map & Impact Analysis (from Phases 1-2)
- `get-shit-done/bin/lib/fmap.cjs` — Function Map CRUD: get, update, stats, changed-files, writeMap()
- `hooks/gsd-impact-guard.js` — PreToolUse hook checking impact_analysis.enabled, calling fmap get
- `agents/gsd-executor.md` — Executor prompt with impact analysis instructions and checkpoint patterns
- `agents/gsd-cataloger.md` — Cataloger agent definition for cheap-model Function Map population

### Context Engine
- `sdk/src/context-engine.ts` — PHASE_FILE_MANIFEST, ContextEngine class, resolveContextFiles()
- `sdk/src/types.ts` — ContextFiles interface (line ~734), PhaseType enum

### Workflow Integration Points
- `get-shit-done/workflows/execute-phase.md` — Wave execution, agent spawning, post-wave steps
- `get-shit-done/workflows/new-project.md` — Round 2 config questions, buildNewProjectConfig call
- `get-shit-done/workflows/plan-phase.md` — Planner context injection

### Requirements
- `.planning/REQUIREMENTS.md` — MODEL-01 through MODEL-04, INT-01 through INT-05, FMAP-08

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `resolveModelInternal()` in core.cjs: Already checks `model_overrides` before profile fallback — MODEL-01/02 nearly complete
- `buildNewProjectConfig()` in config.cjs: Three-level merge (hardcoded < userDefaults < choices) — add model_overrides to hardcoded defaults
- `gsd-impact-guard.js` hook: Already checks `impact_analysis.enabled` and exits silently when false — INT-05 toggle already functional
- `fmap.cjs` cmdFmapStats(): Returns aggregate stats — ready for context injection
- `fmap.cjs` cmdFmapChangedFiles(): Detects changed files via git diff — ready for post-wave cataloger

### Established Patterns
- Config keys: dot-notation sections in config.json (`workflow.X`, `git.X`), merged at three levels
- CLI dispatcher: `gsd-tools <domain> <action>` routing in gsd-tools.cjs
- Agent model resolution: init.cjs calls `resolveModelInternal()` and includes result in init JSON output
- Hook registration: `install.js` registers hooks in settings.json, hooks read config via gsd-tools

### Integration Points
- `config.cjs` hardcoded defaults object (line ~103): Add `model_overrides: {}` and `impact_analysis: { enabled: false, auto_resolve_threshold: 10, escalation_threshold: 50 }`
- `context-engine.ts` PHASE_FILE_MANIFEST: Add functionMapStats to Execute and Plan manifests
- `execute-phase.md` wave loop: Add post-wave cataloger step (conditional on impact_analysis.enabled)
- `new-project.md` Round 2: Add opt-in question for impact analysis

</code_context>

<specifics>
## Specific Ideas

- Post-wave cataloger should be lightweight — call `gsd-tools fmap changed-files` to get the delta, then `gsd-tools fmap update --files <changed>` to refresh only what changed. No full rescan per wave.
- The impact guard hook is already the "automatic step" for INT-03 — no need to add workflow-level orchestration. The hook fires on every file edit when enabled.
- Third-party provider support is a documentation concern, not a code concern. GSD's job is to pass the model ID through; the runtime handles the rest.

</specifics>

<deferred>
## Deferred Ideas

- Provider registry with API key management — out of scope, runtime handles this
- Function Map size optimization / pagination for mega-codebases — future enhancement if needed
- Cross-wave Function Map diff/merge for worktree-isolated execution — not needed with post-wave single-pass approach
- UI/dashboard for model routing visualization — JSON config is sufficient

</deferred>

---

*Phase: 03-model-routing-integration*
*Context gathered: 2026-03-30*
