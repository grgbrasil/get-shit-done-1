# Phase 2: Impact Analysis - Research

**Researched:** 2026-03-30
**Domain:** Mid-execution guardrails for cascading impact detection and resolution
**Confidence:** HIGH

## Summary

Phase 2 adds impact analysis guardrails to the GSD executor. When the executor modifies any function, it must first consult the Function Map (built in Phase 1) to identify all callers, classify the change as structural or behavioral, auto-resolve structural impacts (updating callers), escalate behavioral impacts to the user, check one level of cascade, and update the Function Map after resolution.

The implementation builds entirely on existing infrastructure: `fmap.cjs` for Function Map CRUD, the `gsd-executor.md` agent prompt for executor behavior, the `checkpoint:decision` pattern for escalation UX, and the PreToolUse hook pattern for deterministic safety nets. No new dependencies are needed -- this is prompt engineering + CLI tooling + one hook script.

**Primary recommendation:** Implement as three layers: (1) new `fmap impact` CLI subcommand that returns callers + signature for pre-edit snapshot, (2) executor prompt instructions teaching impact analysis workflow, (3) PreToolUse hook as safety net catching skipped lookups.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Dual-layer trigger: prompt instruction in gsd-executor.md (primary guidance) + PreToolUse hook in agent frontmatter (deterministic safety net). The prompt instruction teaches the executor to consult `gsd-tools fmap get` before editing any function. The hook validates compliance -- if the executor skips the lookup, the hook catches it.
- **D-02:** Hybrid sentinel + LLM classification. Structural detection is deterministic: compare the `signature` field in function-map.json before vs after edit -- if it changed, the modification is structural. Behavioral detection uses LLM judgment by the executor, comparing the `purpose` field and code semantics. Bias toward escalation in ambiguous cases.
- **D-03:** Threshold-split approach for updating callers on structural changes: <=10 callers inline, 11-50 spawn sub-agent groups, >50 escalate to human. Thresholds configurable in `.planning/config.json`. IMPACT-05 cascade resolved inline after first-level callers confirmed.
- **D-04:** Hard stop with structured impact card. Extends existing `checkpoint:decision` pattern. Impact card schema: Function, Callers affected, Old behavior, New behavior, Options (Approve/Reject/Skip). "Modify" path excluded from v1.

### Claude's Discretion
- PreToolUse hook implementation details (shell script vs inline node call)
- Exact threshold values (10/50 are starting defaults)
- Impact card formatting/presentation within checkpoint output
- Function Map snapshot mechanism (how to capture pre-edit state)
- Sub-agent grouping strategy (by directory, by subsystem, or by caller count)

### Deferred Ideas (OUT OF SCOPE)
- "Modify" option in escalation UX -- future phase if needed
- Cross-phase impact analysis -- separate concern
- Automated rollback on rejection (git revert integration) -- future enhancement
- Impact analysis for non-function changes (config files, schema migrations) -- out of scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| IMPACT-01 | Executor consulta Function Map ANTES de modificar qualquer funcao | Dual-layer trigger (D-01): prompt instruction + PreToolUse hook. `fmap get` already exists with O(1) lookup. New `fmap impact` subcommand provides callers + snapshot in one call. |
| IMPACT-02 | Impact Analysis identifica todos os callers da funcao sendo modificada | `fmap get <key>` returns `callers[]` array. New `fmap impact <key>` wraps this with additional context (caller count, signature for snapshot). |
| IMPACT-03 | Mudancas estruturais auto-resolvidas -- executor atualiza todos os callers | Threshold-split (D-03): <=10 inline Edit, 11-50 sub-agents, >50 escalate. Signature comparison is exact string match on `signature` field. |
| IMPACT-04 | Mudancas comportamentais escaladas ao usuario com explicacao do impacto | Hard stop with impact card (D-04) extending `checkpoint:decision` pattern already in gsd-executor.md. LLM compares `purpose` field + code semantics. |
| IMPACT-05 | Cascade de callers -- verificar callers do caller (1 nivel) | After first-level callers updated, executor runs `fmap get` on each updated caller to check if THEIR callers need updates. Resolved inline. |
| IMPACT-06 | Apos resolver impactos, Function Map atualizado com novas assinaturas/callers | `fmap update --replace-file` already handles per-file atomic updates. Executor updates entries for modified function + all updated callers. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js built-ins (fs, path, child_process) | Node 20+ | CLI tooling, file I/O | Already used by all gsd-tools modules |
| gsd-tools.cjs fmap subcommand | Current | Function Map CRUD | Phase 1 deliverable, O(1) lookup |
| gsd-executor.md prompt | Current | Executor behavior definition | Primary integration point for impact analysis instructions |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| PreToolUse hook (Node.js script) | N/A | Safety net for skipped fmap lookups | Always active when impact analysis enabled |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| PreToolUse hook (Node script) | Shell script hook | Node script preferred -- consistent with existing hooks (gsd-workflow-guard.js, gsd-prompt-guard.js), can parse JSON stdin, can read config |
| Inline signature comparison | AST-based comparison | Exact string match on `signature` field is sufficient -- AST parsing out of scope per REQUIREMENTS.md |

**Installation:** No new packages needed. Zero new dependencies.

## Architecture Patterns

### Integration Points Map
```
gsd-executor.md (prompt)
  |
  +-- Impact Analysis Instructions (new section)
  |     |-- Pre-edit: call `gsd-tools fmap impact <key>`
  |     |-- Post-edit: compare signatures, classify change
  |     |-- Structural: auto-resolve callers (threshold-split)
  |     |-- Behavioral: hard stop with impact card
  |     |-- Cascade: check callers-of-callers (1 level)
  |     +-- Post-resolve: `gsd-tools fmap update`
  |
  +-- PreToolUse hook (safety net)
        |-- hooks/gsd-impact-guard.js
        +-- Registered in settings.json via install.js

get-shit-done/bin/lib/fmap.cjs
  |
  +-- cmdFmapImpact() (NEW)
  |     |-- Returns: callers[], signature, purpose, caller_count
  |     +-- Used for pre-edit snapshot
  |
  +-- cmdFmapSnapshot() (NEW, optional)
        +-- Saves pre-edit state for post-edit comparison

get-shit-done/bin/gsd-tools.cjs
  |
  +-- fmap impact <key> (NEW route)
  +-- fmap snapshot <key> (NEW route, optional)

.planning/config.json
  |
  +-- impact_analysis.auto_resolve_threshold (default: 10)
  +-- impact_analysis.sub_agent_threshold (default: 50)
  +-- impact_analysis.enabled (default: true when fmap exists)
```

### Pattern 1: Pre-Edit Snapshot via CLI
**What:** Before modifying any function, executor calls `gsd-tools fmap impact <key>` to get a snapshot of the function's current state (signature, purpose, callers).
**When to use:** Every time the executor is about to edit a function that exists in the Function Map.
**Example:**
```bash
# Executor calls before editing
node gsd-tools.cjs fmap impact "sdk/src/phase-runner.ts::PhaseRunner::runPhase"
# Returns:
{
  "key": "sdk/src/phase-runner.ts::PhaseRunner::runPhase",
  "signature": "async runPhase(phaseNumber: string): Promise<PhaseResult>",
  "purpose": "Orchestrates full phase lifecycle",
  "callers": ["sdk/src/index.ts:142"],
  "caller_count": 1,
  "calls": ["sdk/src/context-engine.ts::ContextEngine::resolveContextFiles"]
}
```

### Pattern 2: Post-Edit Classification
**What:** After editing, executor compares pre-edit snapshot signature with current code. If signature changed = structural. If purpose/behavior changed = behavioral (LLM judgment).
**When to use:** Immediately after every function edit.
**Example (structural):**
```
Pre-edit signature:  "async runPhase(phaseNumber: string): Promise<PhaseResult>"
Post-edit signature: "async runPhase(phaseNumber: string, options?: RunOptions): Promise<PhaseResult>"
-> STRUCTURAL CHANGE: new parameter added
-> Auto-resolve: update 1 caller at sdk/src/index.ts:142
```

### Pattern 3: Impact Card (Behavioral Escalation)
**What:** When a behavioral change is detected, executor produces a structured impact card and stops execution.
**When to use:** When the executor's LLM judgment determines the function's behavior/purpose changed.
**Example:**
```markdown
## IMPACT DETECTED

**Type:** Behavioral Change
**Function:** `sdk/src/phase-runner.ts::PhaseRunner::runPhase`
**Callers affected:** 1 (sdk/src/index.ts:142)

**Old behavior:** Orchestrates full phase lifecycle
**New behavior:** Orchestrates full phase lifecycle with retry logic on failure

**Options:**
1. **Approve** - Continue with behavioral change (callers may need review)
2. **Reject** - Revert this change, continue without it
3. **Skip** - Defer to deferred-items.md, continue task without behavioral change
```

### Pattern 4: Cascade Check (1 Level)
**What:** After updating a caller due to structural change, check if that caller's own callers need updates.
**When to use:** After every first-level caller update.
**Example:**
```
Function A (modified) -> Caller B (updated) -> Caller C (check if impacted)
- If B's signature changed due to propagation: update C too
- If B's signature is unchanged: no cascade needed
- Only 1 level deep in v1
```

### Anti-Patterns to Avoid
- **Reading function-map.json directly**: Always use `gsd-tools fmap get/impact`. The tool handles path resolution and normalization.
- **Running impact analysis during parallel waves**: Function Map is a single shared file. Impact analysis + updates must be sequential.
- **Silently skipping impact analysis**: If `fmap impact` returns no entry (function not in map), the executor should still proceed but log a warning, NOT skip the edit.
- **Auto-resolving behavioral changes**: Behavioral changes ALWAYS require human approval. No exceptions. Bias toward escalation in ambiguous cases.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Function lookup | Custom JSON reading | `gsd-tools fmap get <key>` | Already normalized, O(1) lookup, handles missing keys |
| Function Map updates | Direct file writes | `gsd-tools fmap update --replace-file` | Atomic per-file updates, handles normalization |
| Checkpoint/escalation UX | Custom stop mechanism | `checkpoint:decision` pattern in executor | Already handles auto-mode, continuation agents, structured return |
| Hook registration | Manual settings.json edits | `bin/install.js` hook registration flow | Handles all runtimes (Claude Code, Gemini, Antigravity) |
| Changed file detection | Custom git diff parsing | `gsd-tools fmap changed-files` | Handles staged, unstaged, and untracked files |

**Key insight:** Phase 2 is almost entirely prompt engineering + a thin CLI wrapper. The heavy infrastructure (Function Map CRUD, hook registration, checkpoint protocol, deviation rules) all exists from Phase 1 and the existing executor agent.

## Common Pitfalls

### Pitfall 1: Hook Blocks Execution Instead of Advising
**What goes wrong:** PreToolUse hook written to block/reject the edit when fmap lookup is skipped, causing executor to stall.
**Why it happens:** Confusing safety net (advisory) with enforcement (blocking).
**How to avoid:** Hook MUST be advisory only -- inject `additionalContext` warning into the agent's context, never exit with non-zero or return a blocking signal. Match the pattern in `gsd-workflow-guard.js` (line 78-88).
**Warning signs:** Executor stops making edits after hook triggers.

### Pitfall 2: Stale Function Map Leads to Missed Callers
**What goes wrong:** Function Map not updated after Phase 1 cataloging, so callers[] is incomplete. Impact analysis misses callers.
**Why it happens:** Cataloger didn't run recently, or incremental update missed a file.
**How to avoid:** Before impact analysis, verify the entry's `last_updated` timestamp. If stale (>24h or before current execution), warn executor to request re-catalog of the affected file.
**Warning signs:** `callers[]` is empty for a function that clearly has callers in the codebase.

### Pitfall 3: Signature Comparison False Positives
**What goes wrong:** Whitespace or formatting differences in signature field cause false structural change detection.
**Why it happens:** Different tools produce slightly different signature formatting.
**How to avoid:** Normalize signatures before comparison -- strip extra whitespace, normalize type syntax. Or use a simple semantic comparison (parameter names + types + return type) rather than exact string match.
**Warning signs:** Every function edit triggers structural change resolution even when only the body changed.

### Pitfall 4: Cascade Loop
**What goes wrong:** Cascade check goes beyond 1 level because a caller-of-caller also has callers.
**Why it happens:** Recursive logic without depth limit.
**How to avoid:** Explicit depth counter. v1 is hardcoded to 1 level. Pass `depth=0` initially, increment on each cascade, stop when `depth >= 1`.
**Warning signs:** Executor enters long loop of updating callers and their callers.

### Pitfall 5: Concurrent Function Map Writes During Auto-Resolve
**What goes wrong:** When updating multiple callers, simultaneous `fmap update` calls from sub-agents corrupt the JSON.
**Why it happens:** Sub-agent parallelism without file locking.
**How to avoid:** Sub-agents update callers but do NOT write to Function Map. Only the orchestrating executor writes fmap updates after all caller edits are confirmed. Batch fmap updates sequentially.
**Warning signs:** Missing entries in function-map.json after auto-resolve.

### Pitfall 6: Impact Card in Auto-Mode Blocks Pipeline
**What goes wrong:** Behavioral change triggers hard stop even in auto-mode, stalling the entire pipeline.
**Why it happens:** Impact cards treated as blocking regardless of auto-mode setting.
**How to avoid:** In auto-mode, behavioral changes should still hard-stop (this is correct behavior per D-04). Behavioral changes are rare and should always require human decision. This is NOT a pitfall to "fix" -- document it so planners expect it.
**Warning signs:** N/A -- this is intentional behavior.

## Code Examples

### Example 1: fmap impact subcommand (new in fmap.cjs)
```javascript
// Source: Pattern derived from existing cmdFmapGet() in fmap.cjs
/**
 * Get impact analysis data for a function map key.
 * Returns callers, signature, purpose, and caller count for pre-edit snapshot.
 */
function cmdFmapImpact(cwd, key, raw) {
  if (!key) {
    error('fmap impact requires a key argument');
    return;
  }
  const map = readMap(cwd);
  const normalized = normalizeKey(key);
  if (!(normalized in map)) {
    // Function not in map -- return empty impact (executor should still proceed)
    output({ key: normalized, found: false, callers: [], caller_count: 0 }, raw);
    return;
  }
  const entry = map[normalized];
  output({
    key: normalized,
    found: true,
    signature: entry.signature,
    purpose: entry.purpose,
    callers: entry.callers || [],
    caller_count: (entry.callers || []).length,
    calls: entry.calls || [],
  }, raw);
}
```

### Example 2: PreToolUse Hook (gsd-impact-guard.js)
```javascript
// Source: Pattern from hooks/gsd-workflow-guard.js
#!/usr/bin/env node
// GSD Impact Analysis Guard — PreToolUse hook
// Safety net: if executor is about to Write/Edit a code file
// and hasn't consulted fmap impact yet, inject advisory warning.

const fs = require('fs');
const path = require('path');

let input = '';
const stdinTimeout = setTimeout(() => process.exit(0), 3000);
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => input += chunk);
process.stdin.on('end', () => {
  clearTimeout(stdinTimeout);
  try {
    const data = JSON.parse(input);
    const toolName = data.tool_name;

    // Only guard Write and Edit tool calls
    if (toolName !== 'Write' && toolName !== 'Edit') {
      process.exit(0);
    }

    const filePath = data.tool_input?.file_path || data.tool_input?.path || '';

    // Skip non-code files
    const codeExts = ['.ts', '.js', '.cjs', '.mjs', '.tsx', '.jsx', '.vue', '.php', '.py'];
    if (!codeExts.some(ext => filePath.endsWith(ext))) {
      process.exit(0);
    }

    // Skip .planning/ files
    if (filePath.includes('.planning/') || filePath.includes('.planning\\')) {
      process.exit(0);
    }

    // Check if impact analysis is enabled
    const cwd = data.cwd || process.cwd();
    const configPath = path.join(cwd, '.planning', 'config.json');
    if (fs.existsSync(configPath)) {
      try {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        if (config.impact_analysis?.enabled === false) {
          process.exit(0);
        }
      } catch (e) {
        process.exit(0);
      }
    }

    // Check if function-map.json exists (no map = no impact analysis possible)
    const fmapPath = path.join(cwd, '.planning', 'function-map.json');
    if (!fs.existsSync(fmapPath)) {
      process.exit(0);
    }

    // Advisory: remind executor to check impact
    const output = {
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        additionalContext:
          `IMPACT ANALYSIS REMINDER: Before editing ${path.basename(filePath)}, ` +
          'ensure you have consulted the Function Map via `gsd-tools fmap impact <key>` ' +
          'to identify callers and assess impact. If you already checked, proceed. ' +
          'If this file has no functions in the map, proceed normally.'
      }
    };

    process.stdout.write(JSON.stringify(output));
  } catch (e) {
    process.exit(0); // Silent fail -- never block
  }
});
```

### Example 3: Impact Analysis Instructions for Executor Prompt
```markdown
<!-- New section to add to gsd-executor.md -->
<impact_analysis>
## Impact Analysis Protocol

**When active:** Impact analysis is active when `.planning/function-map.json` exists.

**BEFORE editing any function/method/class:**

1. Identify the function key: `<relative_path>::<ClassName>::<methodName>` or `<relative_path>::<functionName>`
2. Run: `node gsd-tools.cjs fmap impact "<key>"`
3. Record the pre-edit snapshot: signature, purpose, callers, caller_count
4. If `found: false`: proceed with edit but log that function is not in the map

**AFTER editing:**

5. Compare pre-edit signature with the new code:
   - **Signature changed** (parameters, return type, function name) = STRUCTURAL CHANGE
   - **Signature unchanged but behavior/logic changed** = BEHAVIORAL CHANGE
   - **Neither** = no impact (cosmetic/internal refactor)

**STRUCTURAL CHANGE resolution:**

6. Count callers from the pre-edit snapshot:
   - **0 callers:** No impact. Skip to step 9.
   - **1-10 callers:** Update each caller inline using Edit tool. Adapt call sites to match new signature.
   - **11-50 callers:** Group callers by directory. Request sub-agents for each group.
   - **>50 callers:** STOP. Return checkpoint:decision -- too many callers signals refactoring need.
7. **Cascade check (1 level):** For each updated caller, run `gsd-tools fmap impact "<caller_key>"`.
   If the caller's signature also changed due to your edit, repeat step 6 for the caller's callers.
   Only go 1 level deep.
8. Verify all updated callers compile/work.

**BEHAVIORAL CHANGE escalation:**

6b. STOP execution. Return an impact card as `checkpoint:decision`:
   - Function: which function changed
   - Callers affected: count + file:line list
   - Old behavior: purpose field from pre-edit snapshot
   - New behavior: your assessment of what changed
   - Options: Approve / Reject / Skip (defer to deferred-items.md)

**POST-RESOLUTION:**

9. Update the Function Map:
   - For the modified function: `gsd-tools fmap update --data '{"<key>": { ...updated entry... }}'`
   - For each updated caller: update their entries too if their signatures changed
   - Set `last_updated` to current ISO timestamp
</impact_analysis>
```

### Example 4: Config Schema for Thresholds
```json
// .planning/config.json additions
{
  "impact_analysis": {
    "enabled": true,
    "auto_resolve_threshold": 10,
    "sub_agent_threshold": 50
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| No impact checking | Function Map + pre-edit consultation | Phase 2 (this phase) | Prevents silent caller breakage |
| Manual caller search (grep) | O(1) lookup via `fmap get` | Phase 1 | Instant, reliable caller discovery |
| No behavioral change detection | LLM-judged behavioral classification | Phase 2 (this phase) | Human approval for semantic changes |

## Open Questions

1. **Signature normalization depth**
   - What we know: Exact string comparison on the `signature` field works when both pre-edit and post-edit signatures come from the same source (fmap entry vs. executor's reading of the new code).
   - What's unclear: The executor reads the NEW signature from the code it just wrote -- formatting may differ from how the cataloger originally normalized it.
   - Recommendation: Define a simple normalization: collapse whitespace, remove trailing semicolons. Implement in `fmap.cjs` as a `normalizeSignature()` helper. Executor compares normalized forms.

2. **Sub-agent spawning mechanism for 11-50 callers**
   - What we know: The executor can spawn sub-agents via Task tool. D-03 says batch callers by directory/subsystem.
   - What's unclear: Exact Task tool invocation pattern for "update these N callers to match new signature X."
   - Recommendation: Claude's discretion per CONTEXT.md. Group by directory (callers in same directory = one sub-agent batch). Each sub-agent gets: new signature, old signature, list of files:lines to update.

3. **Function not in map -- what happens?**
   - What we know: `fmap impact` returns `found: false` when the function isn't cataloged.
   - What's unclear: Should the executor still proceed with the edit? Yes -- per CONTEXT.md, the map may be incomplete.
   - Recommendation: Proceed with edit, log warning. After edit, run cataloger on the modified file to add it to the map.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.2 (main project tests use node:test + node:assert) |
| Config file | `vitest.config.ts` (SDK) / direct `node --test` (main) |
| Quick run command | `node --test tests/fmap.test.cjs tests/impact-analysis.test.cjs` |
| Full suite command | `node --test tests/*.test.cjs` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| IMPACT-01 | fmap impact subcommand returns callers + snapshot | unit | `node --test tests/impact-analysis.test.cjs` | No -- Wave 0 |
| IMPACT-02 | fmap impact returns complete callers array | unit | `node --test tests/impact-analysis.test.cjs` | No -- Wave 0 |
| IMPACT-03 | Config thresholds read correctly from config.json | unit | `node --test tests/impact-analysis.test.cjs` | No -- Wave 0 |
| IMPACT-04 | Impact card schema matches checkpoint:decision format | manual | Executor agent prompt review | N/A -- prompt-based |
| IMPACT-05 | Cascade logic stops at 1 level | unit | `node --test tests/impact-analysis.test.cjs` | No -- Wave 0 |
| IMPACT-06 | fmap update after impact resolution preserves other entries | unit | `node --test tests/fmap.test.cjs` | Yes -- existing |

### Sampling Rate
- **Per task commit:** `node --test tests/fmap.test.cjs tests/impact-analysis.test.cjs`
- **Per wave merge:** `node --test tests/*.test.cjs`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/impact-analysis.test.cjs` -- covers IMPACT-01, IMPACT-02, IMPACT-03, IMPACT-05 (fmap impact subcommand, config thresholds, cascade depth)
- [ ] Test for hook script output format (gsd-impact-guard.js produces valid JSON with hookSpecificOutput)

## Sources

### Primary (HIGH confidence)
- `/Volumes/SSD/Desenvolvimento/get-shit-done/get-shit-done/bin/lib/fmap.cjs` -- existing Function Map CRUD implementation
- `/Volumes/SSD/Desenvolvimento/get-shit-done/agents/gsd-executor.md` -- executor agent prompt with checkpoint and deviation patterns
- `/Volumes/SSD/Desenvolvimento/get-shit-done/agents/gsd-cataloger.md` -- cataloger agent with entry schema definition
- `/Volumes/SSD/Desenvolvimento/get-shit-done/hooks/gsd-workflow-guard.js` -- reference PreToolUse hook implementation
- `/Volumes/SSD/Desenvolvimento/get-shit-done/tests/fmap.test.cjs` -- existing fmap test patterns
- `/Volumes/SSD/Desenvolvimento/get-shit-done/.planning/phases/02-impact-analysis/02-CONTEXT.md` -- locked decisions D-01 through D-04

### Secondary (MEDIUM confidence)
- `/Volumes/SSD/Desenvolvimento/get-shit-done/bin/install.js` -- hook registration flow for PreToolUse events

### Tertiary (LOW confidence)
- Signature normalization approach -- needs validation with real executor behavior to confirm string comparison is sufficient

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - zero new dependencies, all existing infrastructure
- Architecture: HIGH - all integration points verified in source code, patterns match existing hooks and commands
- Pitfalls: HIGH - derived from actual code patterns (concurrent writes, hook blocking vs advisory, stale map data)

**Research date:** 2026-03-30
**Valid until:** 2026-04-30 (stable -- no external dependencies to go stale)
