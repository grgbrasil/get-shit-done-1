# Phase 3: Model Routing & Integration - Research

**Researched:** 2026-03-30
**Domain:** GSD config extension, workflow integration, context engine modification
**Confidence:** HIGH

## Summary

Phase 3 is an integration phase -- no new analysis capabilities, no new dependencies. All building blocks exist from Phases 1-2. The work is: (1) extend config.json defaults to include `model_overrides` and `impact_analysis` sections, (2) inject Function Map stats into the Context Engine, (3) add a post-wave cataloger step to execute-phase workflow, (4) add an opt-in question to new-project workflow, and (5) document third-party provider support.

The codebase is well-prepared. `resolveModelInternal()` in core.cjs already checks `config.model_overrides?.[agentType]` before profile fallback (line 1005). The impact guard hook already checks `impact_analysis.enabled` and exits silently when false (line 56). `cmdFmapStats()` and `cmdFmapChangedFiles()` are ready for context injection and post-wave cataloging respectively. The three-level merge in `buildNewProjectConfig()` handles new default sections automatically.

**Primary recommendation:** Organize into 3-4 plans across 2 waves: Wave 1 for config/defaults changes (independent, safe), Wave 2 for workflow integration that depends on the config being in place.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Extend existing `model_overrides` in config.json -- `resolveModelInternal()` in core.cjs already checks `config.model_overrides?.[agentType]` before profile fallback. No new resolution logic needed.
- **D-02:** `buildNewProjectConfig()` in config.cjs gains `model_overrides: {}` in hardcoded defaults. When empty, profile-based resolution applies. When user sets a key (e.g., `"gsd-cataloger": "haiku"`), it takes precedence.
- **D-03:** Auto-config on first run: if config.json exists but lacks `model_overrides`, `loadConfig()` fills it from defaults (existing three-level merge handles this). No lazy-write at resolve time.
- **D-04:** GSD passes model IDs verbatim to the runtime -- no provider registry, no API key management in GSD. Users set fully-qualified IDs in `model_overrides` (e.g., `"gsd-cataloger": "openrouter/meta-llama/llama-3"`). The AI runtime handles provider routing.
- **D-05:** Documentation-only for provider support -- a section in model-profiles reference doc explaining how to set third-party models. No code changes for provider routing itself.
- **D-06:** Summary injection, not full JSON. Context Engine's Execute manifest gets a `functionMapStats` key that injects `gsd-tools fmap stats` output. Agents use `gsd-tools fmap get <key>` for specific lookups on-demand.
- **D-07:** Rationale: function-map.json can grow to hundreds of KB. Full injection bloats context.
- **D-08:** Impact Analysis is already wired via PreToolUse hook (`gsd-impact-guard.js`). INT-03 is functionally complete from Phase 2. This phase validates hook registration in `install.js` and ensures it activates correctly when `impact_analysis.enabled: true`.
- **D-09:** Planner reads Function Map stats to inform task sizing. Both via the Context Engine summary injection (D-06).
- **D-10:** No new mandatory step in execute-phase workflow -- the PreToolUse hook IS the automatic step. Workflow markdown stays unchanged for impact analysis itself.
- **D-11:** Cataloger runs post-wave, not during waves. After each wave completes, a single cataloger pass processes all changed files from that wave. No concurrent writes to function-map.json.
- **D-12:** execute-phase workflow gains a `post_wave_cataloger` step between waves. Uses `gsd-tools fmap changed-files` to detect delta, then runs cataloger update on those files only.
- **D-13:** If `impact_analysis.enabled: false`, the post-wave cataloger step is skipped entirely.
- **D-14:** Single toggle: `impact_analysis.enabled` (boolean) in config.json root.
- **D-15:** `/gsd:new-project` workflow gains one question: "Activate Function Map + Impact Analysis?". Default: false (opt-in).
- **D-16:** When enabled, `impact_analysis` section stores `auto_resolve_threshold` (default: 10) and `escalation_threshold` (default: 50).

### Claude's Discretion
- Exact placement of the new-project question (within Round 2 or as Round 3)
- Wording of the opt-in question
- Whether fmap stats output includes file-level detail or just aggregate counts
- Post-wave cataloger: inline in execute-phase workflow or spawned as background agent
- Format of function map stats in Context Engine output

### Deferred Ideas (OUT OF SCOPE)
- Provider registry with API key management
- Function Map size optimization / pagination for mega-codebases
- Cross-wave Function Map diff/merge for worktree-isolated execution
- UI/dashboard for model routing visualization
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MODEL-01 | Per-agent model recommendation configurable | `resolveModelInternal()` already checks `model_overrides` -- just add `model_overrides: {}` to `buildNewProjectConfig()` hardcoded defaults and `loadConfig()` defaults |
| MODEL-02 | Config of model per agent in config.json with defaults | Same as MODEL-01 -- extend hardcoded defaults object in config.cjs line ~103 |
| MODEL-03 | Third-party provider support (OpenRouter, local models) | Documentation-only per D-04/D-05 -- GSD passes model IDs verbatim, add docs to model-profiles.md |
| MODEL-04 | Auto-config with defaults on first run | `loadConfig()` returns `model_overrides: parsed.model_overrides \|\| null` (line 311) -- change to default `{}` so missing key is harmless |
| INT-01 | All components integrate with existing GSD workflows | Context Engine injection (D-06) + post-wave cataloger (D-12) + validated hook registration (D-08) |
| INT-02 | Function Map injected into context via Context Engine | Add `functionMapStats` to `PHASE_FILE_MANIFEST` Execute and Plan entries in context-engine.ts |
| INT-03 | Impact Analysis runs as automatic step in execute-phase when enabled | Already complete from Phase 2 via PreToolUse hook -- this phase validates activation path |
| INT-04 | Guardrails work with parallel execution (waves) without write conflicts | Post-wave cataloger pattern (D-11/D-12) ensures sequential writes to function-map.json |
| INT-05 | `/gsd:new-project` includes opt-in question | Add question to new-project.md Round 2, wire to `impact_analysis.enabled` in config |
| FMAP-08 | User chooses during new-project if activating Function Map + Impact Analysis | Same as INT-05 -- single toggle, default false |
</phase_requirements>

## Standard Stack

No new dependencies. This phase extends existing GSD infrastructure only.

### Core Files to Modify

| File | Purpose | Change Type |
|------|---------|-------------|
| `get-shit-done/bin/lib/config.cjs` | Config defaults builder | Add `model_overrides: {}` and `impact_analysis` section to hardcoded defaults, add to three-level merge |
| `get-shit-done/bin/lib/core.cjs` | Config loader + model resolver | Add `model_overrides` default `{}` instead of `null` in loadConfig defaults |
| `sdk/src/context-engine.ts` | Context file resolution per phase | Add `functionMapStats` to Execute and Plan manifests |
| `sdk/src/types.ts` | ContextFiles interface | Add `functionMapStats?: string` field |
| `get-shit-done/workflows/execute-phase.md` | Wave-based execution | Add post-wave cataloger step between waves |
| `get-shit-done/workflows/new-project.md` | Project initialization | Add opt-in question for impact analysis |
| `get-shit-done/references/model-profiles.md` | Model profile docs | Add third-party provider documentation section |
| `bin/install.js` | Hook registration | Validate gsd-impact-guard.js registration (may already be complete) |

### Existing Utilities (No Changes Needed)

| Utility | Location | Ready For |
|---------|----------|-----------|
| `cmdFmapStats()` | fmap.cjs:111 | Context injection -- returns `{total, by_kind, path}` |
| `cmdFmapChangedFiles()` | fmap.cjs:141 | Post-wave cataloger -- returns `{files, count}` |
| `cmdFmapImpact()` | fmap.cjs:209 | Impact guard on-demand lookup |
| `resolveModelInternal()` | core.cjs:1000 | Already checks model_overrides before profile |
| `gsd-impact-guard.js` | hooks/ | Already checks `impact_analysis.enabled` |

## Architecture Patterns

### Config Extension Pattern (established)

The config system uses two independent merge strategies:

1. **`loadConfig()` in core.cjs** -- flat key extraction with fallbacks. Returns a flat object. Used by all runtime code. Currently defaults `model_overrides` to `null` when absent (line 311).

2. **`buildNewProjectConfig()` in config.cjs** -- three-level deep merge (hardcoded < userDefaults < choices). Used only during `/gsd:new-project`. Currently lacks `model_overrides` and `impact_analysis` sections.

**Critical insight:** These two config paths are NOT unified. Adding `model_overrides: {}` to `buildNewProjectConfig()` hardcoded defaults ensures new projects get the key. But `loadConfig()` must ALSO change its fallback from `null` to `{}` (or keep `null` with caller guards) so existing projects without the key work correctly.

**Recommended approach:**
```javascript
// In buildNewProjectConfig() hardcoded defaults (config.cjs ~line 103):
model_overrides: {},
impact_analysis: {
  enabled: false,
  auto_resolve_threshold: 10,
  escalation_threshold: 50,
},

// In buildNewProjectConfig() three-level merge (config.cjs ~line 139):
impact_analysis: {
  ...hardcoded.impact_analysis,
  ...(userDefaults.impact_analysis || {}),
  ...(choices.impact_analysis || {}),
},
```

And for `loadConfig()` (core.cjs ~line 311):
```javascript
model_overrides: parsed.model_overrides || {},
// Add impact_analysis extraction:
impact_analysis: parsed.impact_analysis || { enabled: false, auto_resolve_threshold: 10, escalation_threshold: 50 },
```

### VALID_CONFIG_KEYS Registration

`config.cjs` maintains a `VALID_CONFIG_KEYS` Set (line 14) that gates `cmdConfigSet`. New keys must be registered:
```
'impact_analysis.enabled'
'impact_analysis.auto_resolve_threshold'
'impact_analysis.escalation_threshold'
```

Note: `model_overrides` is NOT a simple config-set key (it's a nested object with dynamic agent-type keys). It should be set via `model_overrides.<agent-type>` pattern, similar to existing `agent_skills.<agent-type>`. Add dynamic pattern:
```javascript
if (/^model_overrides\.[a-zA-Z0-9_-]+$/.test(keyPath)) return true;
```

### Context Engine Extension Pattern

The Context Engine (SDK, TypeScript) resolves files per phase type via `PHASE_FILE_MANIFEST`. To inject fmap stats, two approaches:

**Approach A (file-based -- matches existing pattern):** Have a pre-execution step write fmap stats to a file (e.g., `.planning/function-map-stats.json`), add it to the manifest as a file spec.

**Approach B (command-based -- cleaner):** Extend ContextEngine to support command-based context resolution alongside file-based. Execute `gsd-tools fmap stats` and inject the output.

**Recommended: Approach A** -- it follows the existing pattern exactly (all manifest entries are files), avoids adding subprocess execution to the TypeScript SDK, and the stats file is tiny (~100 bytes). The `init` command for execute-phase already runs pre-execution setup; it can write the stats file as a side effect.

Implementation in context-engine.ts:
```typescript
// Add to PHASE_FILE_MANIFEST[PhaseType.Execute]:
{ key: 'functionMapStats', filename: 'function-map-stats.json', required: false },

// Add to PHASE_FILE_MANIFEST[PhaseType.Plan]:
{ key: 'functionMapStats', filename: 'function-map-stats.json', required: false },
```

Add to ContextFiles interface in types.ts:
```typescript
export interface ContextFiles {
  // ... existing fields
  functionMapStats?: string;
}
```

**Stats file generation:** Add to `gsd-tools.cjs` a command like `fmap stats --write` that writes the JSON output to `.planning/function-map-stats.json`. Or have the init command call `cmdFmapStats()` and write the result. The init approach is better since it already runs as the first step of every workflow.

### Post-Wave Cataloger Pattern

The execute-phase workflow processes waves sequentially. Between wave N completion and wave N+1 start, insert a cataloger step:

```markdown
<step name="post_wave_cataloger">
After each wave completes (before proceeding to next wave):

**Skip if** `impact_analysis.enabled` is false in config.

1. Detect changed code files:
```bash
CHANGED=$(node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" fmap changed-files --since-commit ${WAVE_START_COMMIT})
```

2. If files changed, run incremental cataloger:
```bash
Task(
  subagent_type="gsd-cataloger",
  model="{cataloger_model}",
  prompt="Update Function Map for these files: ${CHANGED_FILES}. Use gsd-tools fmap update --data to merge entries."
)
```

3. Report:
```
Function Map updated: {count} files cataloged after Wave {N}
```
</step>
```

**Inline vs spawned:** Spawning a gsd-cataloger subagent is recommended because:
- The cataloger agent definition already exists (`agents/gsd-cataloger.md`)
- It runs on the cheapest model (haiku in all profiles)
- Inline execution would force the orchestrator to do Serena/grep analysis, wasting expensive orchestrator tokens
- A subagent isolates the cataloger's context window from the orchestrator

**Wave start commit tracking:** Before spawning wave N agents, capture the current HEAD commit hash. After wave completes, use `--since-commit` to get only wave N's changes. This is more reliable than `changed-files` without arguments (which also picks up unstaged changes from other sources).

### New-Project Opt-In Pattern

The new-project workflow has two config collection points:
1. **Round 1** -- Core settings (mode, granularity, execution, git)
2. **Round 2** -- Workflow agents (research, plan check, verifier, AI models)

**Recommended placement:** Add as the last question in Round 2. It logically groups with "workflow agents" since it enables the impact analysis workflow. Adding a separate Round 3 creates unnecessary UX friction for a single boolean.

```javascript
{
  header: "Impact Analysis",
  question: "Activate Function Map + Impact Analysis? (Prevents silent breakage when agents modify shared functions)",
  multiSelect: false,
  options: [
    { label: "No (Default)", description: "Standard execution without impact tracking" },
    { label: "Yes", description: "Track function dependencies, warn before breaking changes" }
  ]
}
```

Wire to config: `impact_analysis: { enabled: true/false }`.

For auto-mode (Step 2a), also add this question to the Round 2 auto-mode config collection.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Provider routing/API keys | Custom provider registry | Pass model IDs verbatim to runtime | Runtimes (Claude Code, OpenCode, Copilot) already handle provider routing |
| Config validation | Custom schema validator | Existing `VALID_CONFIG_KEYS` set + `isValidConfigKey()` | Pattern already handles dynamic keys via regex |
| Function Map full injection | Custom context compression | Stats summary + on-demand `fmap get` calls | Scales to any codebase size without bloating context |
| Wave synchronization | File locking / mutex | Post-wave sequential cataloger | Eliminates concurrency entirely by design |

## Common Pitfalls

### Pitfall 1: loadConfig vs buildNewProjectConfig Divergence
**What goes wrong:** Adding defaults to `buildNewProjectConfig()` but not to `loadConfig()` means new projects work but existing projects break when code reads the new key.
**Why it happens:** Two separate config paths with independent default logic.
**How to avoid:** Every new config key must be added to BOTH: (1) `hardcoded` object in `buildNewProjectConfig()` at config.cjs ~line 103, and (2) the `defaults` object + return statement in `loadConfig()` at core.cjs ~line 199 and ~line 282.
**Warning signs:** Tests pass for new projects but fail for projects initialized before Phase 3.

### Pitfall 2: VALID_CONFIG_KEYS Omission
**What goes wrong:** Adding `impact_analysis.*` keys to config but not registering them in `VALID_CONFIG_KEYS` means `gsd-tools config-set impact_analysis.enabled true` returns "Unknown config key" error.
**Why it happens:** The allowlist is manually maintained.
**How to avoid:** Add all new dot-notation config paths to `VALID_CONFIG_KEYS` Set in config.cjs line 14. Add dynamic pattern for `model_overrides.<agent>` to `isValidConfigKey()`.
**Warning signs:** `config-set` commands fail with "Unknown config key" error.

### Pitfall 3: TypeScript ContextFiles Interface Out of Sync
**What goes wrong:** Adding `functionMapStats` to the manifest but not to the `ContextFiles` interface causes TypeScript compilation errors.
**Why it happens:** The manifest uses `keyof ContextFiles` for type safety (FileSpec.key field).
**How to avoid:** Update `ContextFiles` in types.ts BEFORE updating the manifest in context-engine.ts.
**Warning signs:** `npm run build` fails in sdk/ directory.

### Pitfall 4: Post-Wave Cataloger Running When Disabled
**What goes wrong:** The post-wave cataloger step runs even when `impact_analysis.enabled: false`, wasting tokens on a haiku agent for no purpose.
**Why it happens:** Missing guard check at the start of the post-wave step.
**How to avoid:** First line of post-wave cataloger step must check config. The init JSON already loads config -- pass `impact_analysis_enabled` as a field.
**Warning signs:** Cataloger subagent spawns in projects that never opted in to impact analysis.

### Pitfall 5: Stats File Not Refreshed
**What goes wrong:** Function Map stats in context reflect stale data from project init, not from the current execution.
**Why it happens:** Stats file written once during `init` but never updated during execution.
**How to avoid:** The post-wave cataloger already updates function-map.json. After the cataloger completes, also refresh the stats file. Or generate stats on-demand in the context engine.
**Warning signs:** Context shows "total: 50" when the map actually has 200 entries after cataloger runs.

### Pitfall 6: Three-Level Merge Missing impact_analysis
**What goes wrong:** `buildNewProjectConfig()` adds `impact_analysis` to hardcoded defaults but the merge at line ~139 doesn't include it, so user choices for `impact_analysis.enabled` are overwritten by hardcoded defaults.
**Why it happens:** The three-level merge is explicit per section (git, workflow, hooks, agent_skills). New sections must be added to the merge.
**How to avoid:** Add explicit merge block:
```javascript
impact_analysis: {
  ...hardcoded.impact_analysis,
  ...(userDefaults.impact_analysis || {}),
  ...(choices.impact_analysis || {}),
},
```
**Warning signs:** User selects "Yes" for impact analysis during new-project, but config.json shows `enabled: false`.

## Code Examples

### Adding model_overrides to buildNewProjectConfig defaults (config.cjs)

```javascript
// Source: config.cjs line ~103 hardcoded object
const hardcoded = {
  model_profile: 'balanced',
  commit_docs: true,
  // ... existing keys ...
  agent_skills: {},
  // NEW:
  model_overrides: {},
  impact_analysis: {
    enabled: false,
    auto_resolve_threshold: 10,
    escalation_threshold: 50,
  },
};
```

### Adding impact_analysis to three-level merge (config.cjs)

```javascript
// Source: config.cjs line ~139 merge block
return {
  ...hardcoded,
  ...userDefaults,
  ...choices,
  git: { /* existing */ },
  workflow: { /* existing */ },
  hooks: { /* existing */ },
  agent_skills: { /* existing */ },
  // NEW:
  model_overrides: {
    ...hardcoded.model_overrides,
    ...(userDefaults.model_overrides || {}),
    ...(choices.model_overrides || {}),
  },
  impact_analysis: {
    ...hardcoded.impact_analysis,
    ...(userDefaults.impact_analysis || {}),
    ...(choices.impact_analysis || {}),
  },
};
```

### Adding impact_analysis to loadConfig (core.cjs)

```javascript
// Source: core.cjs line ~282 return statement
return {
  // ... existing keys ...
  model_overrides: parsed.model_overrides || {},  // Changed from || null
  agent_skills: parsed.agent_skills || {},
  // NEW:
  impact_analysis: parsed.impact_analysis || {
    enabled: false,
    auto_resolve_threshold: 10,
    escalation_threshold: 50,
  },
};
```

### Registering new config keys (config.cjs)

```javascript
// Source: config.cjs line ~14 VALID_CONFIG_KEYS
const VALID_CONFIG_KEYS = new Set([
  // ... existing keys ...
  'impact_analysis.enabled',
  'impact_analysis.auto_resolve_threshold',
  'impact_analysis.escalation_threshold',
]);

// Source: config.cjs line ~35 isValidConfigKey
function isValidConfigKey(keyPath) {
  if (VALID_CONFIG_KEYS.has(keyPath)) return true;
  if (/^agent_skills\.[a-zA-Z0-9_-]+$/.test(keyPath)) return true;
  // NEW:
  if (/^model_overrides\.[a-zA-Z0-9_-]+$/.test(keyPath)) return true;
  return false;
}
```

### Context Engine manifest extension (context-engine.ts)

```typescript
// Source: sdk/src/context-engine.ts PHASE_FILE_MANIFEST
[PhaseType.Execute]: [
  { key: 'state', filename: 'STATE.md', required: true },
  { key: 'config', filename: 'config.json', required: false },
  // NEW:
  { key: 'functionMapStats', filename: 'function-map-stats.json', required: false },
],
[PhaseType.Plan]: [
  { key: 'state', filename: 'STATE.md', required: true },
  { key: 'roadmap', filename: 'ROADMAP.md', required: true },
  { key: 'context', filename: 'CONTEXT.md', required: true },
  { key: 'research', filename: 'RESEARCH.md', required: false },
  { key: 'requirements', filename: 'REQUIREMENTS.md', required: false },
  // NEW:
  { key: 'functionMapStats', filename: 'function-map-stats.json', required: false },
],
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `model_overrides` defaults to `null` in loadConfig | Change to `{}` | Phase 3 | Callers no longer need null guards |
| No impact_analysis config section | Full section with thresholds | Phase 3 | Centralizes previously-hardcoded thresholds from gsd-executor.md |
| No fmap stats in context | Stats file injected via Context Engine | Phase 3 | Planners/executors see function coverage at a glance |

## Open Questions

1. **Stats file generation timing**
   - What we know: The `init` command runs before every workflow. `cmdFmapStats()` is fast (reads JSON, counts entries).
   - What's unclear: Should the init command write the stats file, or should a separate `fmap stats --write` command exist?
   - Recommendation: Add stats file write to the init command when function-map.json exists. Simple, no new CLI surface area.

2. **Post-wave cataloger: --since-commit or working tree diff?**
   - What we know: `cmdFmapChangedFiles()` supports both `--since-commit <hash>` and default (working tree diff). In parallel execution with `--no-verify`, commits happen but may not be on HEAD when checked.
   - What's unclear: After parallel agents complete a wave, is HEAD reliably pointing to the latest commit?
   - Recommendation: Use `--since-commit` with a pre-wave captured commit hash. This is deterministic regardless of branch state. Capture hash before spawning wave agents.

3. **Context Engine: file path for stats**
   - What we know: ContextEngine reads from `.planning/` directory. Stats file would be `.planning/function-map-stats.json`.
   - What's unclear: Should this be a transient file (regenerated each run, not committed) or committed?
   - Recommendation: Transient -- add to `.gitignore` pattern or simply don't commit. It's derived data from function-map.json.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | node:test + node:assert (CJS modules), vitest (SDK TypeScript) |
| Config file | vitest.config.ts (SDK), none for CJS tests |
| Quick run command | `node --test tests/core.test.cjs` |
| Full suite command | `npm test` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MODEL-01 | model_overrides in config defaults | unit | `node --test tests/config.test.cjs` | Wave 0 |
| MODEL-02 | Per-agent model config read from config.json | unit | `node --test tests/core.test.cjs` | Exists (REG-01 test) |
| MODEL-03 | Third-party provider docs accuracy | manual | Review model-profiles.md | N/A |
| MODEL-04 | Auto-config when model_overrides missing | unit | `node --test tests/core.test.cjs` | Exists (tests 88-98) |
| INT-01 | Workflows integrate correctly | integration | Manual workflow run | N/A |
| INT-02 | Function Map stats in context engine | unit | `cd sdk && npx vitest run src/context-engine.test.ts` | Exists |
| INT-03 | Impact guard activates when enabled | unit | `node --test tests/hooks.test.cjs` | Wave 0 |
| INT-04 | No write conflicts in parallel waves | integration | Manual parallel execution | N/A |
| INT-05 | New-project opt-in question present | manual | Review new-project.md | N/A |
| FMAP-08 | Opt-in toggle wires to config | unit | `node --test tests/config.test.cjs` | Wave 0 |

### Sampling Rate
- **Per task commit:** `node --test tests/core.test.cjs && node --test tests/config.test.cjs`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/config.test.cjs` -- test buildNewProjectConfig includes model_overrides and impact_analysis defaults, test three-level merge for impact_analysis section (may need to create if not exists)
- [ ] `sdk/src/context-engine.test.ts` -- test functionMapStats field resolves when file exists, returns undefined when absent

## Project Constraints (from CLAUDE.md)

- **Compatibility:** Cannot break existing GSD workflow -- extension, not substitution
- **Performance:** Function Map consultable in <1s (flat JSON)
- **Context:** Artifacts must fit in context window without bloating
- **Upstream:** Components must be generic enough for upstream PR
- **Stack:** Must work with any language GSD supports, not just JS/Vue/PHP
- **SOLID/DRY/MVC/SSoT:** Architecture principles are mandatory
- **No workarounds** without explicit user approval
- **No npm install** -- request user runs the command
- **Cause root fix:** Always fix root cause, never symptoms
- **Existing tests:** node:test + node:assert for CJS, vitest for SDK TypeScript

## Sources

### Primary (HIGH confidence)
- Direct code reading: `core.cjs` lines 197-317 (loadConfig), 1000-1031 (resolveModelInternal)
- Direct code reading: `config.cjs` lines 14-28 (VALID_CONFIG_KEYS), 71-164 (buildNewProjectConfig)
- Direct code reading: `fmap.cjs` lines 111-124 (cmdFmapStats), 141-181 (cmdFmapChangedFiles)
- Direct code reading: `context-engine.ts` lines 1-100 (PHASE_FILE_MANIFEST, ContextEngine)
- Direct code reading: `types.ts` lines 734-743 (ContextFiles interface)
- Direct code reading: `gsd-impact-guard.js` lines 1-80 (hook implementation)
- Direct code reading: `execute-phase.md` (full workflow)
- Direct code reading: `new-project.md` (full workflow, config collection rounds)
- Direct code reading: `model-profiles.cjs` (MODEL_PROFILES, getAgentToModelMapForProfile)
- Direct code reading: `.planning/config.json` (current project config -- no model_overrides, no impact_analysis)
- Existing test coverage: `tests/core.test.cjs` (REG-01 model_overrides, resolveModelInternal tests)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - no new dependencies, all code paths verified by reading source
- Architecture: HIGH - extending well-established patterns (config merge, context engine, workflow steps)
- Pitfalls: HIGH - identified by tracing actual code paths and finding the two-config-system divergence
- Integration points: HIGH - every file and line number verified against current source

**Research date:** 2026-03-30
**Valid until:** 2026-04-30 (stable codebase, no external dependency changes expected)
