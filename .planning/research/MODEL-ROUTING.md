# Model Routing: Claude Code Internals vs GSD

**Researched:** 2026-04-01
**Source:** Claude Code restored source (`/restored-src/src/`) + GSD codebase
**Overall confidence:** HIGH (direct source code analysis)

---

## 1. How Claude Code Handles Model Selection

### 1.1 Model Identity System

Claude Code uses a layered model identity system:

**Model Configs** (`utils/model/configs.ts`): Each model has a config object mapping provider to model string. Current models:
- `haiku35`: claude-3-5-haiku-20241022
- `haiku45`: claude-haiku-4-5-20251001
- `sonnet40`: claude-sonnet-4-20250514
- `sonnet45`: claude-sonnet-4-5-20250929
- `sonnet46`: claude-sonnet-4-6 (latest)
- `opus40`: claude-opus-4-20250514
- `opus41`: claude-opus-4-1-20250805
- `opus45`: claude-opus-4-5-20251101
- `opus46`: claude-opus-4-6 (latest)

**Model Aliases** (`utils/model/aliases.ts`): Short names that resolve to defaults:
- `sonnet` -> current default Sonnet (4.6)
- `opus` -> current default Opus (4.6)
- `haiku` -> current default Haiku (4.5)
- `best` -> best available
- `sonnet[1m]` / `opus[1m]` -> 1M context variants
- `opusplan` -> Opus for plan mode, Sonnet otherwise

**Key detail**: Aliases resolve dynamically. `sonnet` always means the CURRENT Sonnet, not a pinned version.

### 1.2 Subagent Model Resolution

The function `getAgentModel()` in `utils/model/agent.ts` resolves the effective model for any subagent. Priority chain:

1. `CLAUDE_CODE_SUBAGENT_MODEL` env var (global override)
2. Tool-specified model (the `model` param in the Agent tool call)
3. Agent definition's `model` field (from frontmatter or built-in definition)
4. Default: `'inherit'` (use parent's exact model)

**Critical behavior**: When an alias like `opus` matches the parent's model family, the subagent inherits the parent's EXACT model string (not a default resolution). This prevents downgrades when a user is on a specific version.

### 1.3 Built-in Agents and Their Models

| Agent | Model | Purpose |
|-------|-------|---------|
| `general-purpose` | inherit (default) | Research, code search, multi-step tasks |
| `Plan` | `inherit` | Read-only architecture/planning |
| `Explore` | (inherit) | Codebase exploration |
| `Verification` | (inherit) | Verification tasks |
| `StatuslineSetup` | (inherit) | One-time setup |

**Notable**: Built-in agents almost always inherit the parent model. The model override comes from the Agent tool call itself, where the main loop can pass `model: 'sonnet'` or `model: 'haiku'` as a parameter.

### 1.4 The Agent Tool Schema

The Agent tool accepts an optional `model` parameter:
```typescript
model: z.enum(['sonnet', 'opus', 'haiku']).optional()
```

This means the MAIN MODEL (Opus/Sonnet) dynamically decides at runtime which model to assign each subagent. This is fundamentally different from GSD's static profile-based routing.

### 1.5 Agent Definition Schema

Custom agents (loaded from `.claude/agents/` or project agents) support:
```typescript
{
  model: string,        // 'sonnet', 'opus', 'haiku', 'inherit', or full model ID
  effort: EffortLevel,  // 'low', 'medium', 'high', 'max', or numeric
  maxTurns: number,
  permissionMode: string,
  // ...
}
```

The `effort` field is per-agent -- subagents can run at different effort levels than the parent.

---

## 2. Effort Level System

### 2.1 Levels and Semantics

Claude Code defines four effort levels in `utils/effort.ts`:

| Level | Description | Effect |
|-------|-------------|--------|
| `low` | Quick, straightforward | Minimal reasoning overhead |
| `medium` | Balanced approach | Standard implementation |
| `high` | Comprehensive | Extensive reasoning (API default when no param sent) |
| `max` | Maximum capability | Deepest reasoning, Opus 4.6 only |

**Numeric values** (Anthropic-internal only): <= 50 = low, <= 85 = medium, <= 100 = high, > 100 = max.

### 2.2 Model Support

- **Effort parameter**: Only Opus 4.6 and Sonnet 4.6 support the effort parameter. Older models silently ignore it.
- **Max effort**: Opus 4.6 ONLY. If `max` is set on a non-Opus-4.6 model, it auto-downgrades to `high`.
- **Default effort for Opus 4.6**: `medium` (for Pro users and when tengu_grey_step2 enabled for Max/Team).

### 2.3 Effort Resolution Chain

```
env CLAUDE_CODE_EFFORT_LEVEL -> appState.effortValue -> model default
```

### 2.4 Per-Agent Effort Override

In `runAgent.ts` (line 481-485):
```typescript
const effortValue =
  agentDefinition.effort !== undefined
    ? agentDefinition.effort
    : state.effortValue
```

Agents can define their own effort level that overrides the session effort.

---

## 3. Thinking / Extended Reasoning System

### 3.1 Thinking Modes

From `utils/thinking.ts`:

| Config | Meaning |
|--------|---------|
| `{ type: 'adaptive' }` | Model decides when/how much to think (4.6 models) |
| `{ type: 'enabled', budgetTokens: N }` | Fixed thinking budget |
| `{ type: 'disabled' }` | No thinking |

### 3.2 Adaptive Thinking

Only Opus 4.6 and Sonnet 4.6 support adaptive thinking. It is the DEFAULT for these models. The `effort` parameter controls HOW MUCH adaptive thinking occurs -- low effort = less thinking, high/max effort = more thinking.

### 3.3 Ultrathink

A keyword trigger ("ultrathink" in user message) that bumps effort from medium to high for the current turn. When ultrathink is enabled system-wide, default effort drops to `medium` with ultrathink providing the "boost" mechanism.

---

## 4. Fast Mode

### 4.1 What It Is

Fast mode (`utils/fastMode.ts`) is a server-side optimization that trades some quality for speed/throughput. It is:
- Toggled via settings or API
- Sent as a beta header (`fast-mode-2026-02-01`)
- Requires paid subscription
- Available on specific models

### 4.2 Interaction with Effort

Fast mode and effort are ORTHOGONAL. Fast mode affects how the server processes the request (routing, optimization), while effort affects reasoning depth. Both can be active simultaneously.

---

## 5. Small/Fast Model for Side Operations

Claude Code uses `getSmallFastModel()` (defaults to Haiku) for non-critical operations:
- Token estimation
- Away summaries (when user tabs away)
- Session search
- Hook prompt execution
- Web search content processing

This is the equivalent of GSD's "route SIMPLE agents to cheaper models" but applied at the OPERATION level rather than the AGENT level.

---

## 6. OpusPlan Mode

A hybrid routing mode: uses Opus for plan/architecture phases, Sonnet for execution. Set via `model: 'opusplan'`. In `getRuntimeMainLoopModel()`:
- If `permissionMode === 'plan'` -> getDefaultOpusModel()
- Otherwise -> Sonnet (the main loop model)

**This is conceptually similar to GSD's profile system**, but built into Claude Code's model resolution.

---

## 7. GSD's Current Routing (Comparison)

### 7.1 Static Profile System

GSD uses a static lookup table (`MODEL_PROFILES` in `model-profiles.cjs`):

```javascript
{
  'gsd-planner':    { quality: 'opus', balanced: 'opus',   budget: 'sonnet' },
  'gsd-executor':   { quality: 'opus', balanced: 'sonnet', budget: 'sonnet' },
  'gsd-debugger':   { quality: 'opus', balanced: 'sonnet', budget: 'sonnet' },
  'gsd-cataloger':  { quality: 'haiku', balanced: 'haiku', budget: 'haiku' },
  // ...
}
```

### 7.2 MODEL_ALIAS_MAP is STALE

```javascript
const MODEL_ALIAS_MAP = {
  'opus':   'claude-opus-4-0',    // STALE -- current is claude-opus-4-6
  'sonnet': 'claude-sonnet-4-5',  // STALE -- current is claude-sonnet-4-6
  'haiku':  'claude-haiku-3-5',   // STALE -- current is claude-haiku-4-5-20251001
};
```

**This is a critical bug when `resolve_model_ids` is enabled.** GSD resolves aliases to models that are TWO MAJOR VERSIONS behind. Users with `resolve_model_ids: true` are running on Opus 4.0, Sonnet 4.5, and Haiku 3.5 instead of 4.6/4.6/4.5.

### 7.3 Remote Routing (DeepSeek)

GSD routes "SIMPLE" agents to DeepSeek v3 via `AGENT_ROUTING`:
- `gsd-cataloger`, `gsd-nyquist-auditor`, `gsd-assumptions-analyzer`, `gsd-advisor-researcher`, `gsd-ui-checker`, `gsd-research-synthesizer`, `gsd-plan-checker`

This is a cost optimization. Claude Code does something analogous with `getSmallFastModel()` but at the operation level, not the agent level.

---

## 8. Concrete Gaps and Under-Routing

### GAP 1: No Effort Parameter (CRITICAL)

**What Claude Code does**: Sends `effort: 'medium'|'high'|'max'` to the API, controlling reasoning depth per-request. Subagents can have different effort levels.

**What GSD does**: Nothing. No effort parameter is ever sent.

**Impact**: All GSD agents run at the API default effort (which is `high`). This means:
- **Over-spending on simple agents**: `gsd-cataloger`, `gsd-verifier`, `gsd-plan-checker` run at `high` effort when `low` or `medium` would suffice.
- **Under-powering critical agents**: `gsd-planner` and `gsd-debugger` could benefit from `max` effort on Opus 4.6 for complex architectural decisions.

**Recommended effort mapping**:

| Agent | Recommended Effort | Rationale |
|-------|-------------------|-----------|
| gsd-planner | high or max | Architectural reasoning needs deep thinking |
| gsd-executor | medium | Following a plan, not designing |
| gsd-debugger | high | Root cause analysis needs depth |
| gsd-verifier | medium | Checking, not creating |
| gsd-plan-checker | low | Structural validation |
| gsd-cataloger | low | Mechanical extraction |
| gsd-phase-researcher | high | Discovery needs thorough exploration |
| gsd-project-researcher | high | Same as above |
| gsd-research-synthesizer | medium | Summarizing existing findings |
| gsd-roadmapper | high | Strategic planning |
| gsd-codebase-mapper | low | Mechanical scanning |
| gsd-integration-checker | medium | Cross-referencing |
| gsd-nyquist-auditor | low | Checklist verification |
| gsd-ui-researcher | high | Design exploration |
| gsd-ui-checker | low | Diff checking |
| gsd-ui-auditor | medium | Quality assessment |

### GAP 2: Stale Model Aliases (CRITICAL)

**What Claude Code does**: Dynamic resolution through `getModelStrings()` that always returns the CURRENT version. Model configs are updated at build time with each model launch.

**What GSD does**: Hardcoded `MODEL_ALIAS_MAP` pointing to claude-opus-4-0, claude-sonnet-4-5, claude-haiku-3-5.

**Fix**: Update `MODEL_ALIAS_MAP` to:
```javascript
const MODEL_ALIAS_MAP = {
  'opus':   'claude-opus-4-6',
  'sonnet': 'claude-sonnet-4-6',
  'haiku':  'claude-haiku-4-5-20251001',
};
```

### GAP 3: No Adaptive Thinking Awareness

**What Claude Code does**: Detects whether a model supports adaptive thinking and configures the API request accordingly. Opus 4.6 and Sonnet 4.6 use `{ type: 'adaptive' }` by default.

**What GSD does**: No thinking configuration at all.

**Impact**: When GSD spawns agents via the Task tool or Agent SDK, it does not set thinking configuration. The Claude Code runtime handles this for local agents (because they run inside Claude Code), but the GSD SDK (`sdk/src/`) may not be sending optimal thinking params.

**Note**: This gap is partially mitigated because GSD agents run inside Claude Code, which handles thinking config for the main loop. But for agents routed via the SDK's `session-runner.ts`, thinking config may be missing.

### GAP 4: No Dynamic Model Selection

**What Claude Code does**: The main model (Opus/Sonnet) dynamically decides at runtime which model to use for each subagent call by passing `model: 'haiku'|'sonnet'|'opus'` to the Agent tool.

**What GSD does**: Static profile-based resolution at workflow init time. The model is baked into the workflow template.

**Impact**: GSD cannot adapt to context. A simple plan should use Sonnet; a complex multi-service architecture should use Opus. GSD uses the same model regardless of task complexity.

**Note**: This is mitigated somewhat by the profile system (quality/balanced/budget), but it requires the USER to choose the profile, not the system.

### GAP 5: No Fast Mode Integration

**What Claude Code does**: Fast mode is a first-class feature with server-side beta header, user preference, and per-session toggling.

**What GSD does**: Nothing.

**Impact**: Low for now. Fast mode is a Claude Code subscription feature. But if GSD wants to optimize for speed on verification/checking passes, it could benefit from a fast mode flag.

### GAP 6: No OpusPlan-Style Hybrid Routing

**What Claude Code does**: `opusplan` alias uses Opus for planning, Sonnet for execution -- automatically.

**What GSD does**: The profile system is similar but coarser. In `balanced` profile, planner uses Opus but executor uses Sonnet. This is effectively manual opusplan.

**Impact**: Low. GSD's static approach works here because the workflow phases (research/plan/execute/verify) naturally map to different agent types.

### GAP 7: Remote Routing Has No Fallback Quality

**What Claude Code does**: When Haiku is used for side operations, it still goes through the full Claude API with thinking support, effort levels, and proper error handling.

**What GSD does**: Routes to DeepSeek v3 with a raw OpenAI-compatible API call, no thinking, no effort, 8192 max tokens, and a blunt "YOU HAVE NO TOOLS" system prefix.

**Impact**: Remote-routed agents get significantly degraded quality:
- No tool access (by design)
- No thinking/reasoning
- Hard 8192 token limit
- Sanitization strips tool-call XML but may lose legitimate content
- No retry/error handling sophistication

### GAP 8: gsd-plan-checker Routed to DeepSeek (QUESTIONABLE)

The plan checker validates plan structure, dependencies, and feasibility. In the `AGENT_ROUTING` table, it is routed to `deepseek-v3`. However, in `MODEL_PROFILES`, it is `sonnet/sonnet/haiku` -- suggesting it was originally considered medium-complexity.

**Risk**: DeepSeek v3 without tool access may miss structural issues that require reading the codebase. Plan checking often needs to cross-reference file paths, verify function signatures exist, and check dependency chains.

**Recommendation**: Keep plan-checker LOCAL with `effort: 'low'` on Sonnet. The cost savings of DeepSeek are not worth the quality loss on plan validation.

---

## 9. Architecture Comparison Summary

| Dimension | Claude Code | GSD | Gap Severity |
|-----------|-------------|-----|-------------|
| Model resolution | Dynamic aliases -> current versions | Static alias map, STALE versions | CRITICAL |
| Effort parameter | 4 levels, per-agent overridable | Not used at all | CRITICAL |
| Thinking config | Adaptive by default on 4.6 models | Not configured (relies on runtime) | MEDIUM |
| Subagent model | Runtime decision by main model | Static profile lookup | LOW-MEDIUM |
| Fast mode | First-class feature | Not used | LOW |
| Hybrid routing | opusplan built-in | Profile system (manual equivalent) | LOW |
| Side operations | Haiku via Claude API | DeepSeek via raw HTTP | MEDIUM |
| Fallback chain | Multiple layers of fallback | Single lookup + default | MEDIUM |

---

## 10. Recommended Actions (Priority Order)

### P0: Fix Stale Model Aliases
Update `MODEL_ALIAS_MAP` in `core.cjs`. This is a one-line fix with massive impact.

### P0: Add Effort Configuration to Agent Profiles
Extend `MODEL_PROFILES` to include effort levels:
```javascript
const MODEL_PROFILES = {
  'gsd-planner': { quality: { model: 'opus', effort: 'max' }, balanced: { model: 'opus', effort: 'high' }, budget: { model: 'sonnet', effort: 'high' } },
  'gsd-executor': { quality: { model: 'opus', effort: 'medium' }, balanced: { model: 'sonnet', effort: 'medium' }, budget: { model: 'sonnet', effort: 'low' } },
  // ...
};
```

Alternatively, add a parallel `EFFORT_PROFILES` map to avoid breaking the existing interface.

### P1: Move gsd-plan-checker Back to Local
The plan checker needs codebase access to validate properly. Route it locally with `effort: 'low'` to keep costs down.

### P1: Pass Effort in resolveModelInternal
Modify `resolveModelInternal()` to return `{ model, effort }` instead of just a model string. Propagate to workflow templates.

### P2: Implement Thinking Config for SDK Agents
When running agents via `session-runner.ts`, explicitly set thinking configuration for Opus 4.6 and Sonnet 4.6 models.

### P3: Consider Dynamic Complexity Detection
Long-term: let the orchestrator agent assess task complexity and choose effort/model accordingly, similar to how Claude Code's main model chooses subagent models at runtime.

---

## 11. Sources

All findings from direct source code analysis:

- Claude Code effort system: `restored-src/src/utils/effort.ts`
- Claude Code model configs: `restored-src/src/utils/model/configs.ts`
- Claude Code agent model resolution: `restored-src/src/utils/model/agent.ts`
- Claude Code model aliases: `restored-src/src/utils/model/aliases.ts`
- Claude Code model options/picker: `restored-src/src/utils/model/modelOptions.ts`
- Claude Code built-in agents: `restored-src/src/tools/AgentTool/builtInAgents.ts`
- Claude Code agent definitions: `restored-src/src/tools/AgentTool/loadAgentsDir.ts`
- Claude Code thinking system: `restored-src/src/utils/thinking.ts`
- Claude Code fast mode: `restored-src/src/utils/fastMode.ts`
- Claude Code Agent tool: `restored-src/src/tools/AgentTool/AgentTool.tsx`
- Claude Code subagent runner: `restored-src/src/tools/AgentTool/runAgent.ts`
- GSD model profiles: `get-shit-done/bin/lib/model-profiles.cjs`
- GSD model resolution: `get-shit-done/bin/lib/core.cjs` (resolveModelInternal)
- GSD LLM router: `get-shit-done/bin/lib/llm-router.cjs`
