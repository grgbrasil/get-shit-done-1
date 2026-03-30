# Phase 2: Impact Analysis - Context

**Gathered:** 2026-03-30
**Status:** Ready for planning

<domain>
## Phase Boundary

Mid-execution guardrails that detect, classify, and resolve cascading impacts when the executor modifies shared functions. The executor MUST consult the Function Map before modifying any function, identify all callers, auto-resolve structural changes, and escalate behavioral changes to the user. Cascade checks go 1 level deep. Function Map is updated after resolution.

</domain>

<decisions>
## Implementation Decisions

### Trigger Mechanism
- **D-01:** Dual-layer trigger: prompt instruction in gsd-executor.md (primary guidance) + PreToolUse hook in agent frontmatter (deterministic safety net). The prompt instruction teaches the executor to consult `gsd-tools fmap get` before editing any function. The hook validates compliance — if the executor skips the lookup, the hook catches it. Hook pattern already exists commented-out in gsd-executor.md frontmatter.

### Classification: Structural vs Behavioral
- **D-02:** Hybrid sentinel + LLM classification. Structural detection is deterministic: compare the `signature` field in function-map.json before vs after edit — if it changed, the modification is structural. Behavioral detection uses LLM judgment by the executor, comparing the `purpose` field and code semantics. Bias toward escalation in ambiguous cases (false positive escalation is cheaper than silent breakage).

### Auto-Resolve Strategy
- **D-03:** Threshold-split approach for updating callers on structural changes:
  - **<=10 callers:** Executor updates inline sequentially (Edit tool per caller file)
  - **11-50 callers:** Spawn sub-agent groups (batch callers by directory/subsystem)
  - **>50 callers:** Escalate to human — too many callers signals a refactoring need, not a silent fix
  - Thresholds configurable in `.planning/config.json`
  - IMPACT-05 cascade (1 level deeper): resolved inline after first-level callers are confirmed updated

### Escalation UX (Behavioral Changes)
- **D-04:** Hard stop with structured impact card. Extends existing `checkpoint:decision` pattern in gsd-executor.md. Impact card schema:
  - **Function:** which function changed semantically
  - **Callers affected:** count + file:line list
  - **Old behavior:** what the function used to do
  - **New behavior:** what it does now
  - **Options:** Approve (continue with change) / Reject (revert and continue without) / Skip (defer to deferred-items.md, continue task without behavioral change)
  - "Modify" path excluded from v1 (disproportionate complexity)
  - Hard stop blocks the wave until decision — acceptable because behavioral changes should be rare

### Claude's Discretion
- PreToolUse hook implementation details (shell script vs inline node call)
- Exact threshold values (10/50 are starting defaults, tune with usage)
- Impact card formatting/presentation within checkpoint output
- Function Map snapshot mechanism (how to capture pre-edit state)
- Sub-agent grouping strategy (by directory, by subsystem, or by caller count)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 1 artifacts (Function Map foundation)
- `.planning/phases/01-function-map/01-CONTEXT.md` -- Function Map schema, decisions D-01 through D-12
- `.planning/phases/01-function-map/01-VALIDATION.md` -- Phase 1 verification results

### Existing implementation
- `get-shit-done/bin/lib/fmap.cjs` -- Function Map CRUD operations (get, update, stats, changed-files)
- `agents/gsd-executor.md` -- Executor agent prompt with deviation rules and checkpoint patterns
- `agents/gsd-cataloger.md` -- Cataloger agent that populates/updates Function Map

### Requirements
- `.planning/REQUIREMENTS.md` -- IMPACT-01 through IMPACT-06 requirements for this phase
- `.planning/ROADMAP.md` -- Phase 2 scope and success criteria

### Architecture
- `.planning/codebase/ARCHITECTURE.md` -- System architecture and patterns

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `fmap.cjs` already has `cmdFmapGet()` with O(1) lookup by normalized key -- ready for pre-edit consultation
- `fmap.cjs` has `cmdFmapUpdate()` with `--replace-file` flag -- ready for post-resolution map updates
- `fmap.cjs` has `cmdFmapChangedFiles()` -- detects changed files via git diff, useful for incremental impact checks
- gsd-executor.md already has `checkpoint:decision` type and `checkpoint_return_format` -- impact card extends this

### Established Patterns
- Agent frontmatter hooks: PreToolUse/PostToolUse pattern exists (commented out) in gsd-executor.md
- Deviation rules: gsd-executor.md has Rule 1-4 pattern for handling deviations during execution
- Function Map entries include `callers[]` and `calls[]` arrays with `file:line` format

### Integration Points
- gsd-executor.md -- Primary integration point: add impact analysis instructions + uncomment/configure PreToolUse hook
- gsd-tools.cjs -- May need new subcommand for impact analysis (e.g., `fmap impact <key>` returning callers + classification hint)
- `.planning/config.json` -- New config keys for auto-resolve thresholds

</code_context>

<specifics>
## Specific Ideas

- Reuse the existing Rule 4 checkpoint pattern in gsd-executor.md ("STOP -> return checkpoint") as the foundation for impact cards
- The PreToolUse hook should call `gsd-tools fmap get` and surface the callers list to the agent's context
- Signature comparison should be exact string match (not fuzzy) since fmap entries are normalized

</specifics>

<deferred>
## Deferred Ideas

- "Modify" option in escalation UX (negotiate behavioral change with user) -- future phase if needed
- Cross-phase impact analysis (changes in one phase affecting another phase's code) -- separate concern
- Automated rollback on rejection (git revert integration) -- future enhancement
- Impact analysis for non-function changes (config files, schema migrations) -- out of scope

</deferred>

---

*Phase: 02-impact-analysis*
*Context gathered: 2026-03-30*
