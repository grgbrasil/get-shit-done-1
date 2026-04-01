# Phase 2: model-routing-fix (MODEL-01 through MODEL-04) - Research

**Researched:** 2026-04-01
**Domain:** Model routing, effort parameter, agent resolution in GSD CLI tooling
**Confidence:** HIGH

## Summary

This phase fixes stale model aliases, introduces effort-level routing, moves plan-checker back to local, and propagates effort through the resolver. All four requirements (MODEL-01 through MODEL-04) are well-scoped code changes in CommonJS modules with established patterns to follow. The prior research document (MODEL-ROUTING.md) already mapped Claude Code internals exhaustively, and the CONTEXT.md discussion locked every implementation decision.

The core insight: GSD already uses parallel data maps (`MODEL_PROFILES`, `LEAN_MODEL_OVERRIDES`, `AGENT_ROUTING`) in `model-profiles.cjs`. Adding `EFFORT_PROFILES` follows the exact same pattern. The `resolveModelInternal()` function in `core.cjs` stays untouched (zero breaking change) -- a new `resolveEffort()` function lives alongside it. The 25+ callsites in `init.cjs` need only additive changes (new `_effort` fields in the JSON output).

**Primary recommendation:** Implement as 4 small, sequential plans matching the requirement IDs. Each is independently testable. Total code delta: ~150 lines across 4 files + workflow updates.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Update `MODEL_ALIAS_MAP` in `core.cjs:1012` to: opus -> `claude-opus-4-6`, sonnet -> `claude-sonnet-4-6`, haiku -> `claude-haiku-4-5-20251001`
- **D-02:** Fix trivial de 3 linhas, bug objetivo -- sem ambiguidade
- **D-03:** Mapa paralelo `EFFORT_PROFILES` em `model-profiles.cjs`, separado do `MODEL_PROFILES` existente -- zero breaking change nos 15+ callsites em `init.cjs`
- **D-04:** Nao alterar a interface de `MODEL_PROFILES` (continua retornando string simples)
- **D-05:** Effort levels seguem o sistema do Claude Code: `low`, `medium`, `high`, `max`
- **D-06:** Mapa de effort por agente (16 agents, effort allocations fully defined in CONTEXT.md)
- **D-07:** Mover `gsd-plan-checker` de DeepSeek (remoto) para local com effort: low
- **D-08:** Manter todos os outros agentes remotos no DeepSeek -- funcionam sem tools
- **D-09:** Atualizar `AGENT_ROUTING` em `model-profiles.cjs:42` de `{ route: 'remote', provider: 'deepseek-v3' }` para `{ route: 'local' }`
- **D-10:** Criar funcao `resolveEffort(agentType)` separada em vez de alterar retorno de `resolveModelInternal()` -- zero breaking change
- **D-11:** `resolveEffort()` consulta `EFFORT_PROFILES[agentType]` com fallback para `'medium'` (default seguro)
- **D-12:** Callsites que precisam de effort (init.cjs) chamam `resolveEffort()` em paralelo ao `resolveModelInternal()` existente
- **D-13:** Adicionar logging minimo ao resolver -- loggar em stderr quando effort e resolvido: `[gsd] agent=X model=Y effort=Z`
- **D-14:** Loggar quando fallback acontece (agente nao encontrado em EFFORT_PROFILES)
- **D-15:** Loggar quando plan-checker roda local (confirmar que mudanca de routing pegou)

### Claude's Discretion
- Formato exato do log (structured JSON vs plain text)
- Ordem de implementacao dos plans dentro da fase
- Se `resolveEffort()` fica em `core.cjs` junto com `resolveModelInternal()` ou em `model-profiles.cjs` junto com `EFFORT_PROFILES`

### Deferred Ideas (OUT OF SCOPE)
- Adaptive thinking config (detectar se modelo suporta `{ type: 'adaptive' }`)
- Dynamic complexity detection (orchestrator avalia complexidade e escolhe effort/model em runtime) -- ADV-06
- `effort_overrides.<agent>` em config.json -- analogo a model_overrides
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MODEL-01 | Corrigir MODEL_ALIAS_MAP -- atualizar de opus-4-0/sonnet-4-5/haiku-3-5 para 4.6/4.6/4.5 | Direct code location identified: `core.cjs:1012`. 3-line change. Existing tests in `core.test.cjs` cover `resolveModelInternal` with `resolve_model_ids` modes |
| MODEL-02 | Implementar effort parameter no sistema de profiles (low/medium/high/max por agente) | `EFFORT_PROFILES` map follows `LEAN_MODEL_OVERRIDES` pattern in `model-profiles.cjs`. All 16 agent effort levels defined in D-06. Existing test file `model-profiles.test.cjs` provides test patterns |
| MODEL-03 | Mover gsd-plan-checker de DeepSeek para local com effort: low | Single line change in `AGENT_ROUTING` at `model-profiles.cjs:42`. Also remove from `LEAN_MODEL_OVERRIDES`. Existing tests assert routing values directly |
| MODEL-04 | Propagar effort via resolveEffort() separado (nao altera resolveModelInternal) | New function `resolveEffort()` + 25+ callsite additions in `init.cjs` to expose `_effort` fields. Workflow files need `_effort` variable parsing |
</phase_requirements>

## Standard Stack

No new dependencies. This phase modifies existing CommonJS modules only.

### Core Files (modification targets)

| File | Purpose | Changes |
|------|---------|---------|
| `get-shit-done/bin/lib/core.cjs` | MODEL_ALIAS_MAP, resolveModelInternal | Fix alias map (MODEL-01). Optionally add `resolveEffort()` here |
| `get-shit-done/bin/lib/model-profiles.cjs` | MODEL_PROFILES, AGENT_ROUTING, LEAN_MODEL_OVERRIDES | Add EFFORT_PROFILES (MODEL-02), fix AGENT_ROUTING for plan-checker (MODEL-03) |
| `get-shit-done/bin/lib/init.cjs` | All init commands that output model info | Add `_effort` fields to JSON output (MODEL-04) |
| `get-shit-done/workflows/*.md` | Workflow templates consuming model info | Parse and propagate effort (MODEL-04) |

### Test Files (modification targets)

| File | Current Coverage | Changes Needed |
|------|-----------------|----------------|
| `tests/core.test.cjs` | `resolveModelInternal` with all config modes | Add tests for updated MODEL_ALIAS_MAP values, add tests for `resolveEffort()` if placed in core |
| `tests/model-profiles.test.cjs` | MODEL_PROFILES structure, AGENT_ROUTING, LEAN_MODEL_OVERRIDES | Add EFFORT_PROFILES structure tests, update AGENT_ROUTING assertion for plan-checker |

## Architecture Patterns

### Pattern 1: Parallel Data Map (established)

`model-profiles.cjs` already uses this pattern for three co-located maps:

```javascript
// Existing pattern — each map is flat, independent, same agent keys
const MODEL_PROFILES = { 'gsd-planner': { quality: 'opus', ... }, ... };
const AGENT_ROUTING = { 'gsd-planner': { route: 'local' }, ... };
const LEAN_MODEL_OVERRIDES = { 'gsd-cataloger': 'haiku', ... };

// New — follows the same pattern
const EFFORT_PROFILES = {
  'gsd-planner':              'max',
  'gsd-executor':             'medium',
  'gsd-phase-researcher':     'high',
  'gsd-project-researcher':   'high',
  'gsd-roadmapper':           'high',
  'gsd-debugger':             'high',
  'gsd-research-synthesizer': 'medium',
  'gsd-verifier':             'low',
  'gsd-plan-checker':         'low',
  'gsd-codebase-mapper':      'low',
  'gsd-integration-checker':  'low',
  'gsd-nyquist-auditor':      'low',
  'gsd-ui-researcher':        'high',
  'gsd-ui-checker':           'low',
  'gsd-ui-auditor':           'low',
  'gsd-cataloger':            'low',
};
```

### Pattern 2: Resolver Function with Fallback (established)

`resolveModelInternal()` in `core.cjs:1018` shows the pattern: override check -> profile lookup -> fallback default.

```javascript
// New function follows same pattern
function resolveEffort(cwd, agentType) {
  // No config override for now (deferred D-effort_overrides)
  const effort = EFFORT_PROFILES[agentType];
  if (!effort) {
    // D-14: log fallback
    process.stderr.write(`[gsd] effort fallback: agent=${agentType} default=medium\n`);
    return 'medium';
  }
  return effort;
}
```

### Pattern 3: Init JSON Output Extension (established)

`init.cjs` callsites follow a consistent pattern of `xxx_model: resolveModelInternal(cwd, 'gsd-xxx')`. New effort fields follow the same naming:

```javascript
// Existing
executor_model: resolveModelInternal(cwd, 'gsd-executor'),
// New — additive, no change to existing line
executor_effort: resolveEffort(cwd, 'gsd-executor'),
```

### Discretion Decision: Where to Place resolveEffort()

**Recommendation: Place in `model-profiles.cjs`** alongside `EFFORT_PROFILES`.

Rationale:
- `EFFORT_PROFILES` data lives in `model-profiles.cjs` (per D-03)
- `resolveEffort()` only needs to read `EFFORT_PROFILES` -- no `loadConfig()` dependency (no config override for effort, per deferred ideas)
- Keeps `core.cjs` unchanged beyond the MODEL_ALIAS_MAP fix
- `init.cjs` already imports from both `core.cjs` and `model-profiles.cjs`

If effort_overrides are added later (deferred), the function can be moved to `core.cjs` at that point.

### Discretion Decision: Log Format

**Recommendation: Plain text to stderr**, following `core.cjs` convention.

- `core.cjs` uses `error()` (stderr + exit) and `output()` (stdout JSON). No console.log.
- For non-fatal diagnostic logging, `process.stderr.write()` is the simplest approach.
- Format: `[gsd] agent={name} model={model} effort={effort}\n`
- Fallback format: `[gsd] effort fallback: agent={name} default=medium\n`

This is diagnostic only — not part of the JSON API contract.

### Anti-Patterns to Avoid
- **Breaking resolveModelInternal return type:** D-10 explicitly forbids changing from string to object. A new function is required.
- **Adding effort to MODEL_PROFILES values:** D-04 explicitly forbids changing from string to object in MODEL_PROFILES.
- **Removing plan-checker from COLLECTORS in llm-router.cjs:** The collector is still useful code. Just changing the routing entry is sufficient — `shouldRouteRemote()` will return false when route is 'local'.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Effort validation | Custom effort level parser | Simple includes check: `['low','medium','high','max'].includes(e)` | Only 4 valid values, no need for a validation library |
| Agent-to-effort lookup | Complex config cascade | Flat `EFFORT_PROFILES` map with fallback | KISS principle, matches existing patterns |

## Common Pitfalls

### Pitfall 1: Breaking the 25+ init.cjs callsites
**What goes wrong:** Changing `resolveModelInternal()` return type from string to object breaks every workflow that does `model="{xxx_model}"`.
**Why it happens:** Natural instinct is to extend the existing function.
**How to avoid:** D-10 locks this: separate `resolveEffort()` function. Never touch `resolveModelInternal()` signature.
**Warning signs:** Any test in `core.test.cjs` failing after MODEL-01 changes.

### Pitfall 2: Forgetting to export new symbols
**What goes wrong:** `resolveEffort` or `EFFORT_PROFILES` added but not exported from `module.exports`.
**Why it happens:** CommonJS explicit exports are easy to forget.
**How to avoid:** Update both `module.exports` in the file AND the `require()` destructuring in `init.cjs`.

### Pitfall 3: AGENT_ROUTING plan-checker change not reflected in tests
**What goes wrong:** Test `model-profiles.test.cjs:148-153` asserts `gsd-plan-checker` is NOT in the remote group. But wait -- the current test does NOT assert plan-checker routing. The test asserts cataloger, synthesizer, ui-checker are remote. A separate test at line 155 checks planner/executor/debugger are local.
**Why it happens:** Plan-checker routing isn't explicitly tested.
**How to avoid:** Add explicit test: `assert.strictEqual(AGENT_ROUTING['gsd-plan-checker'].route, 'local')` after the change.

### Pitfall 4: LEAN_MODEL_OVERRIDES inconsistency
**What goes wrong:** Plan-checker is moved to local routing but remains in `LEAN_MODEL_OVERRIDES` with `'haiku'`. This creates a contradictory state: routing says local, but lean mode overrides the model to haiku.
**Why it happens:** LEAN_MODEL_OVERRIDES and AGENT_ROUTING are separate maps that need to stay in sync.
**How to avoid:** Remove `'gsd-plan-checker': 'haiku'` from `LEAN_MODEL_OVERRIDES` when changing routing to local. Plan-checker on local will use its `MODEL_PROFILES` entry (sonnet/sonnet/haiku) which is already correct.

### Pitfall 5: Workflow effort propagation incomplete
**What goes wrong:** `init.cjs` outputs `_effort` fields but workflows don't parse or use them.
**Why it happens:** Effort is a new concept; existing workflows only parse `_model` fields.
**How to avoid:** Update workflow `Parse JSON for:` instructions to include effort fields. Update Task() calls to include effort where applicable.

### Pitfall 6: resolve_model_ids: "omit" and effort interaction
**What goes wrong:** When `resolve_model_ids` is `'omit'`, `resolveModelInternal` returns empty string. But effort should still be resolved -- effort is independent of model ID resolution.
**Why it happens:** Confusing model resolution mode with effort applicability.
**How to avoid:** `resolveEffort()` should NOT check `resolve_model_ids`. Effort always resolves regardless of model ID mode.

## Code Examples

### MODEL-01: Fix MODEL_ALIAS_MAP (core.cjs:1012)

```javascript
// Before
const MODEL_ALIAS_MAP = {
  'opus': 'claude-opus-4-0',
  'sonnet': 'claude-sonnet-4-5',
  'haiku': 'claude-haiku-3-5',
};

// After
const MODEL_ALIAS_MAP = {
  'opus': 'claude-opus-4-6',
  'sonnet': 'claude-sonnet-4-6',
  'haiku': 'claude-haiku-4-5-20251001',
};
```

### MODEL-02: EFFORT_PROFILES (model-profiles.cjs)

```javascript
const VALID_EFFORT_LEVELS = ['low', 'medium', 'high', 'max'];

const EFFORT_PROFILES = {
  'gsd-planner':              'max',
  'gsd-executor':             'medium',
  'gsd-phase-researcher':     'high',
  'gsd-project-researcher':   'high',
  'gsd-roadmapper':           'high',
  'gsd-debugger':             'high',
  'gsd-research-synthesizer': 'medium',
  'gsd-verifier':             'low',
  'gsd-plan-checker':         'low',
  'gsd-codebase-mapper':      'low',
  'gsd-integration-checker':  'low',
  'gsd-nyquist-auditor':      'low',
  'gsd-ui-researcher':        'high',
  'gsd-ui-checker':           'low',
  'gsd-ui-auditor':           'low',
  'gsd-cataloger':            'low',
};
```

### MODEL-03: AGENT_ROUTING fix (model-profiles.cjs:42)

```javascript
// Before
'gsd-plan-checker':         { route: 'remote', provider: 'deepseek-v3' },

// After
'gsd-plan-checker':         { route: 'local' },
```

Also remove from LEAN_MODEL_OVERRIDES:
```javascript
// Before
const LEAN_MODEL_OVERRIDES = {
  'gsd-cataloger':            'haiku',
  'gsd-nyquist-auditor':      'haiku',
  'gsd-assumptions-analyzer': 'haiku',
  'gsd-advisor-researcher':   'haiku',
  'gsd-ui-checker':           'haiku',
  'gsd-research-synthesizer': 'haiku',
  'gsd-plan-checker':         'haiku',  // REMOVE THIS LINE
};
```

### MODEL-04: resolveEffort function (model-profiles.cjs)

```javascript
/**
 * Resolve the effort level for a given agent type.
 * Returns the configured effort from EFFORT_PROFILES, falling back to 'medium'.
 *
 * @param {string} agentType - The agent identifier (e.g., 'gsd-planner')
 * @returns {string} The effort level: 'low' | 'medium' | 'high' | 'max'
 */
function resolveEffort(agentType) {
  const effort = EFFORT_PROFILES[agentType];
  if (!effort) {
    process.stderr.write(`[gsd] effort fallback: agent=${agentType} default=medium\n`);
    return 'medium';
  }
  return effort;
}
```

### MODEL-04: init.cjs callsite pattern

```javascript
// In each init command, add effort fields alongside existing model fields:
executor_model: resolveModelInternal(cwd, 'gsd-executor'),
executor_effort: resolveEffort('gsd-executor'),
verifier_model: resolveModelInternal(cwd, 'gsd-verifier'),
verifier_effort: resolveEffort('gsd-verifier'),
```

### MODEL-04: Observability logging in init.cjs

```javascript
// After resolving both model and effort, log the combined result
const model = resolveModelInternal(cwd, agentType);
const effort = resolveEffort(agentType);
process.stderr.write(`[gsd] agent=${agentType} model=${model || 'runtime-default'} effort=${effort}\n`);
```

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | node:test (built-in, no external dependency) |
| Config file | none (uses node --test glob) |
| Quick run command | `node --test tests/core.test.cjs tests/model-profiles.test.cjs` |
| Full suite command | `npm test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MODEL-01 | MODEL_ALIAS_MAP resolves to opus-4-6, sonnet-4-6, haiku-4-5 | unit | `node --test tests/core.test.cjs` | Partial -- needs new assertions for resolved IDs |
| MODEL-02 | EFFORT_PROFILES contains all 16 agents with valid effort levels | unit | `node --test tests/model-profiles.test.cjs` | No -- new test section needed |
| MODEL-03 | gsd-plan-checker routes local, removed from LEAN_MODEL_OVERRIDES | unit | `node --test tests/model-profiles.test.cjs` | Partial -- existing AGENT_ROUTING tests need update |
| MODEL-04 | resolveEffort() returns correct effort, falls back to medium | unit | `node --test tests/model-profiles.test.cjs` | No -- new test section needed |

### Sampling Rate
- **Per task commit:** `node --test tests/core.test.cjs tests/model-profiles.test.cjs`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/core.test.cjs` -- add assertions for MODEL_ALIAS_MAP resolved values with `resolve_model_ids: true`
- [ ] `tests/model-profiles.test.cjs` -- add EFFORT_PROFILES structure tests (all agents present, valid levels)
- [ ] `tests/model-profiles.test.cjs` -- add resolveEffort() tests (known agent, unknown agent fallback)
- [ ] `tests/model-profiles.test.cjs` -- update AGENT_ROUTING assertion for plan-checker (remote -> local)
- [ ] `tests/model-profiles.test.cjs` -- update LEAN_MODEL_OVERRIDES assertion (plan-checker removed)

## Open Questions

1. **Effort in workflow Task() calls -- how is it consumed?**
   - What we know: Workflows use `model="{xxx_model}"` in Task() calls. Claude Code's Agent tool accepts an `effort` field per agent definition.
   - What's unclear: Whether the Task tool in Claude Code accepts an `effort` parameter directly, or if it needs to be set via agent frontmatter.
   - Recommendation: For this phase, expose effort in init JSON output. Workflow consumption can be validated during execution -- if Task() doesn't accept effort directly, the agent definition frontmatter is the alternative path. This does NOT block MODEL-01 through MODEL-03.

2. **Agent frontmatter effort field**
   - What we know: CONTEXT.md mentions "Cada agente tem effort level documentado no profile" as success criteria.
   - What's unclear: Whether agent `.md` files in `agents/` need an `effort:` frontmatter field, or if `EFFORT_PROFILES` in code is sufficient.
   - Recommendation: Add `effort:` to agent frontmatter as documentation. The code map (`EFFORT_PROFILES`) is the SSoT for runtime behavior; frontmatter is informational.

## Sources

### Primary (HIGH confidence)
- Direct source code analysis: `core.cjs:1005-1049` (MODEL_ALIAS_MAP + resolveModelInternal)
- Direct source code analysis: `model-profiles.cjs:1-118` (all maps + functions)
- Direct source code analysis: `init.cjs` (25+ resolveModelInternal callsites)
- Direct source code analysis: `llm-router.cjs:1-347` (remote routing infrastructure)
- `.planning/research/MODEL-ROUTING.md` -- Claude Code internals analysis (effort system, model configs, agent resolution)

### Secondary (MEDIUM confidence)
- `tests/core.test.cjs` and `tests/model-profiles.test.cjs` -- existing test patterns and coverage

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all target files read and analyzed, patterns confirmed in source
- Architecture: HIGH - parallel map pattern established in codebase, no ambiguity
- Pitfalls: HIGH - callsite count verified (25+), test coverage mapped, edge cases identified

**Research date:** 2026-04-01
**Valid until:** 2026-05-01 (stable codebase, no external dependencies)
