# Phase 6: OPS Workflows — Operar por area com contexto + planejamento - Research

**Researched:** 2026-03-30
**Domain:** OPS workflow commands (investigate, feature, modify, debug) + history tracking + context injection
**Confidence:** HIGH

## Summary

Phase 6 builds four OPS workflow commands on top of the Phase 5 foundation (ops.cjs, registry.json, tree.json). The core pattern is: each command loads area context (tree.json + registry entry), performs its specific operation (diagnose, plan, analyze impact, emit context), records history, and triggers a tree refresh. The dispatch decision (full GSD plan vs /gsd:quick) is determined by blast radius computed from tree.json edges at runtime.

All implementation follows the established lib module pattern: new cmd* functions in ops.cjs, new case routes in gsd-tools.cjs dispatcher, new skill command markdown files in commands/gsd/. Context injection into the init system follows the exact pattern used for function-map-stats.json (write a summary JSON file during init, agents pick it up automatically).

**Primary recommendation:** Implement as four cmd* functions in ops.cjs (cmdOpsInvestigate, cmdOpsFeature, cmdOpsModify, cmdOpsDebug) plus two shared helpers (appendHistory, computeBlastRadius), a cmdOpsSummary for context injection, and four skill command markdown files. Keep the dispatch logic (plan vs quick) as a pure function of edge count and cross-area edges in tree.json.

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Hibrido -- summary automatico com nodes/edges/cross-refs no contexto base (padrao functionMapStats) + leitura direta tree.json para investigate/debug que precisam de traversal profundo
- **D-02:** Summary inclui nodes por tipo, edges count, e areas cross-referenciadas -- nao contagem rasa. Garante que o summary seja suficiente pro caso base sem escalar pra tree.json
- **D-03:** Limiar definido pelo tipo de comando (investigate/debug = tree completo, feature/modify = summary), nao por heuristica ambigua
- **D-04:** tree.json determina blast radius em runtime -- quando edges cruzam mais de uma area ou afetam >5 nodes, rota para full GSD plan (PLAN.md com YAML frontmatter + XML tasks via plan-phase + execute-phase)
- **D-05:** Abaixo do threshold, rota para /gsd:quick com contexto da area injetado -- execucao imediata, sem PLAN.md
- **D-06:** Plans OPS full vivem em .planning/ops/{area}/ (nao em .planning/phases/) para nao poluir phases com ops triviais
- **D-07:** /ops:investigate = loop autonomo: navega tree -> le codigo -> formula hipotese -> verifica -> propoe fix. Produz diagnosis.md na area
- **D-08:** /ops:debug = emit de contexto estruturado: carrega tree.json, specs, stack chain da area, emite context-pack.md e para. Composavel com /gsd:debug
- **D-09:** /ops:debug NAO duplica /gsd:debug -- contribui contexto OPS-especifico (cadeia route->model, specs da area, historico) que /gsd:debug consome como input
- **D-10:** Thin history.json per-area em .planning/ops/{area}/history.json -- append-only log com campos {op, timestamp, summary, outcome}
- **D-11:** Sem deltas de arquivo no history -- git ja cobre versionamento. History e operacional (quem rodou o que, quando, resultado)
- **D-12:** tree.json atualiza como post-op step automatico dentro de cada cmdOps* -- mesmo padrao que cmdOpsMap ja usa com last_scanned
- **D-13:** Schema do history entry: `{ op: "investigate"|"feature"|"modify"|"debug", timestamp: ISO, area: slug, summary: string, outcome: "success"|"partial"|"failed", files_changed?: number }`

### Claude's Discretion
- Formato exato do ops summary (quais campos do tree.json sumarizar alem de nodes/edges/cross-refs)
- Threshold exato para dispatch plan/quick (>5 nodes e recomendacao, pode ajustar durante implementacao)
- Design interno dos prompts dos agents ops-investigate e ops-debug
- Formato exato do diagnosis.md e context-pack.md
- Onde plans OPS full ficam dentro de .planning/ops/{area}/ (subdir plans/ ou flat)

### Deferred Ideas (OUT OF SCOPE)
- /ops:status, /ops:spec, /ops:backlog -- Phase 7 (governance)
- Visual tree rendering in terminal -- backlog
- Context-pack caching between sessions -- futuro

</user_constraints>

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| OPS-05 | `/ops:investigate [area/problema]` recebe descricao natural, navega o mapa, diagnostica causa raiz com contexto completo | cmdOpsInvestigate loads tree.json, traverses graph, produces diagnosis.md. Skill command delegates to agent with area context |
| OPS-06 | `/ops:feature [area] [descricao]` adiciona capacidade nova -- gera plano GSD usando contexto da arvore e executa | cmdOpsFeature computes blast radius, dispatches to /gsd:quick or full plan-phase+execute-phase. Plans stored in .planning/ops/{area}/ |
| OPS-07 | `/ops:modify [area] [o que]` altera comportamento existente com analise de impacto derivada da arvore | cmdOpsModify traverses tree edges to identify affected nodes, dispatches with impact context prepended |
| OPS-08 | `/ops:debug [area] [sintoma]` facilita debugging dando contexto completo da area | cmdOpsDebug emits context-pack.md (tree chain, specs, history) composable with /gsd:debug |
| OPS-09 | Toda operacao registra historico e atualiza mapa apos mudancas | appendHistory() writes to history.json; post-op step calls cmdOpsMap logic to refresh tree.json |

</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js built-ins (fs, path, child_process) | Node 20+ | File I/O, process spawning, path resolution | Project convention -- zero external deps for lib modules |
| node:test + node:assert | Node 20+ | Testing | Project convention (all tests use this, not vitest for CLI) |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| ops.cjs (existing) | N/A | Base module being extended | All new cmd* functions go here |
| core.cjs (existing) | N/A | planningRoot(), output(), error(), generateSlugInternal() | Every cmd* function uses these |
| init.cjs (existing) | N/A | Context injection pattern | ops summary injection follows functionMapStats pattern |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Inline blast radius calc | Separate graph library | Unnecessary -- adjacency list traversal is ~20 lines, no external dep needed |
| Agent-based investigate | Pure CLI function | Investigate needs autonomous loop (read code, hypothesize, verify) which requires agent context -- CLI just prepares and dispatches |

**Installation:** No new packages needed. All implementation uses existing Node.js built-ins and project modules.

## Architecture Patterns

### Recommended Project Structure
```
get-shit-done/bin/lib/ops.cjs          # Extended with 5 new exports
get-shit-done/bin/gsd-tools.cjs        # Extended case 'ops' block with new subcommands
commands/gsd/ops-investigate.md         # Skill command (agent-dispatching)
commands/gsd/ops-feature.md             # Skill command (dispatch hybrid)
commands/gsd/ops-modify.md              # Skill command (dispatch hybrid)
commands/gsd/ops-debug.md               # Skill command (context emitter)
.planning/ops/{area}/history.json       # Per-area append-only history log
.planning/ops/{area}/diagnosis.md       # Output of /ops:investigate
.planning/ops/{area}/context-pack.md    # Output of /ops:debug
.planning/ops/{area}/plans/             # Full GSD plans when blast radius exceeds threshold
```

### Pattern 1: CLI Command Handler (cmd* pattern)
**What:** Each OPS workflow is a cmdOps* function in ops.cjs that validates input, loads area data, performs operation, calls appendHistory(), triggers tree refresh.
**When to use:** Every new subcommand.
**Example:**
```javascript
// Source: ops.cjs existing pattern (cmdOpsMap)
function cmdOpsInvestigate(cwd, area, description, raw) {
  if (!area) { error('Usage: gsd-tools ops investigate <area> <description>'); return; }
  const slug = slugify(area);
  const registry = readRegistry(cwd);
  const entry = registry.areas.find(a => a.slug === slug);
  if (!entry) { error('Area not found: ' + slug); return; }

  const tree = readTreeJson(cwd, slug);
  if (!tree) { error('No tree.json for area: ' + slug + '. Run ops map first.'); return; }

  // ... perform investigation logic, produce diagnosis.md ...

  appendHistory(cwd, slug, { op: 'investigate', summary: description, outcome: 'success' });
  refreshTree(cwd, slug);  // post-op tree update
  output({ success: true, area: slug, diagnosis_path: '...' }, raw);
}
```

### Pattern 2: Blast Radius Computation (dispatch decision)
**What:** Pure function that analyzes tree.json edges to determine if operation needs full GSD plan or quick execution.
**When to use:** /ops:feature and /ops:modify dispatch decisions.
**Example:**
```javascript
// Source: D-04 from CONTEXT.md
function computeBlastRadius(tree) {
  const crossAreaEdges = tree.edges.filter(e => {
    const fromNode = tree.nodes.find(n => n.id === e.from);
    const toNode = tree.nodes.find(n => n.id === e.to);
    // Cross-area if nodes are in different directories at depth 2+
    return fromNode && toNode &&
      fromNode.file_path.split('/').slice(0, 2).join('/') !==
      toNode.file_path.split('/').slice(0, 2).join('/');
  });

  return {
    total_nodes: tree.nodes.length,
    cross_area_edges: crossAreaEdges.length,
    needs_full_plan: crossAreaEdges.length > 0 || tree.nodes.length > 5
  };
}
```

### Pattern 3: Context Injection (ops summary in init)
**What:** Write ops-summary.json during init for Context Engine injection, following the functionMapStats pattern.
**When to use:** cmdOpsSummary and init.cjs integration.
**Example:**
```javascript
// Source: init.cjs functionMapStats pattern (line 138-152)
// In init.cjs, add after the functionMapStats block:
try {
  const opsRegistryPath = path.join(planningRoot(cwd), 'ops', 'registry.json');
  if (fs.existsSync(opsRegistryPath)) {
    const registry = JSON.parse(fs.readFileSync(opsRegistryPath, 'utf-8'));
    const summary = {
      areas_count: registry.areas.length,
      areas: registry.areas.map(a => ({
        slug: a.slug, name: a.name, components: a.components_count,
        last_scanned: a.last_scanned
      }))
    };
    // Enrich with per-area tree stats
    for (const area of summary.areas) {
      const treePath = path.join(planningRoot(cwd), 'ops', area.slug, 'tree.json');
      if (fs.existsSync(treePath)) {
        try {
          const tree = JSON.parse(fs.readFileSync(treePath, 'utf-8'));
          const byType = {};
          for (const n of tree.nodes) { byType[n.type] = (byType[n.type] || 0) + 1; }
          area.nodes_by_type = byType;
          area.edges_count = tree.edges.length;
          // Cross-refs: areas referenced by edges pointing outside this area's directory
          area.cross_refs = [...new Set(tree.edges.map(e => {
            const target = tree.nodes.find(n => n.id === e.to);
            return target ? target.file_path.split('/')[1] : null;
          }).filter(Boolean))];
        } catch { /* non-fatal */ }
      }
    }
    const summaryPath = path.join(planningRoot(cwd), 'ops-summary.json');
    fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2), 'utf-8');
  }
} catch { /* non-fatal */ }
```

### Pattern 4: Append-Only History
**What:** appendHistory() helper writes to .planning/ops/{area}/history.json as append-only log.
**When to use:** Every cmdOps* workflow function calls this before returning.
**Example:**
```javascript
function appendHistory(cwd, slug, entry) {
  const historyPath = path.join(areaDir(cwd, slug), 'history.json');
  let history = [];
  if (fs.existsSync(historyPath)) {
    try { history = JSON.parse(fs.readFileSync(historyPath, 'utf-8')); } catch { history = []; }
  }
  history.push({
    ...entry,
    area: slug,
    timestamp: new Date().toISOString()
  });
  ensureAreaDir(cwd, slug);
  fs.writeFileSync(historyPath, JSON.stringify(history, null, 2), 'utf-8');
}
```

### Pattern 5: Skill Command Markdown (agent-dispatching)
**What:** Markdown files in commands/gsd/ that describe the command, delegate to gsd-tools for data, and optionally spawn agents for autonomous work.
**When to use:** /ops:investigate (spawns gsd-debugger-like agent), /ops:feature (dispatches to quick or plan-phase), /ops:modify (dispatches with impact context), /ops:debug (emits context then optionally chains to /gsd:debug).
**Reference:** commands/gsd/ops-init.md, commands/gsd/debug.md

### Anti-Patterns to Avoid
- **Duplicating /gsd:debug logic in /ops:debug:** D-09 is explicit -- /ops:debug emits OPS-specific context (context-pack.md) that /gsd:debug consumes. It does NOT contain debugging logic itself.
- **Storing OPS plans in .planning/phases/:** D-06 mandates .planning/ops/{area}/ for OPS plans to avoid polluting the phase system.
- **Hardcoding blast radius threshold:** The threshold (>5 nodes / cross-area edges) should be a constant at the top of ops.cjs, tunable during implementation per Claude's discretion.
- **Reading tree.json in feature/modify by default:** D-03 says feature/modify use summary only; only investigate/debug load full tree. However, blast radius computation (D-04) needs edge data, so computeBlastRadius reads tree.json selectively for the dispatch decision, then passes summary-level context to the executor.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Graph traversal for blast radius | Full graph library | Simple adjacency list iteration over tree.nodes/tree.edges | tree.json is already flat adjacency list; iteration is trivial |
| Slug generation | Custom slug function | Existing slugify() wrapping generateSlugInternal() from core.cjs | Already used throughout ops.cjs |
| JSON persistence | Custom file locking / DB | fs.readFileSync + fs.writeFileSync | Consistent with all other GSD lib modules; single-process CLI |
| Context injection | Custom context loader | Follow init.cjs functionMapStats pattern (write JSON, agents read) | Proven pattern, zero new infrastructure |
| Autonomous investigation loop | Custom agent runner | Spawn gsd-debugger or similar agent via Task tool from skill command | Agent framework already handles multi-turn reasoning |

**Key insight:** Phase 6 adds NO new infrastructure. Everything is extension of existing patterns -- new cmd* functions, new dispatcher routes, new skill commands. The complexity is in the agent prompts and dispatch logic, not in new architectural concepts.

## Common Pitfalls

### Pitfall 1: Tree.json Missing When Command Runs
**What goes wrong:** User runs /ops:investigate on an area that has never been mapped.
**Why it happens:** /ops:init creates registry entries but does NOT run /ops:map automatically.
**How to avoid:** Every cmdOps* must check readTreeJson() and error with clear message: "No tree for area X. Run /ops:map first." Consider auto-mapping as fallback (call cmdOpsMap internals) but this adds latency.
**Warning signs:** null return from readTreeJson().

### Pitfall 2: Blast Radius Over-Triggers Full Plan
**What goes wrong:** Small changes always route to full GSD plan because every area has >5 nodes.
**Why it happens:** Threshold set too low for typical codebases.
**How to avoid:** Make the threshold a constant (BLAST_RADIUS_THRESHOLD) that can be tuned. Start at 5 nodes + any cross-area edges (per D-04) but allow adjustment. Consider the threshold applies to AFFECTED nodes (reachable from the change point), not total area nodes.
**Warning signs:** Users always getting full plan mode even for trivial changes.

### Pitfall 3: History.json Grows Unbounded
**What goes wrong:** After months of use, history.json becomes large, slowing reads.
**Why it happens:** Append-only with no rotation.
**How to avoid:** For v1, keep it simple (D-10 says thin log). If needed later, add optional max-entries trim on write. Current entries are ~100 bytes each, so 1000 operations = ~100KB -- acceptable for now.
**Warning signs:** Slow JSON.parse on history read.

### Pitfall 4: Post-Op Tree Refresh Fails Silently
**What goes wrong:** tree.json is stale after /ops:feature creates new files because the refresh step failed.
**Why it happens:** New files not yet in git (listProjectFiles uses git ls-files), or import patterns don't match the new code.
**How to avoid:** Post-op tree refresh should use the same logic as cmdOpsMap but be wrapped in try/catch with non-fatal handling. Log warning if refresh fails.
**Warning signs:** tree.json nodes/edges count unchanged after adding new code.

### Pitfall 5: Skill Commands Trying to Be Both CLI and Agent
**What goes wrong:** Skill command markdown tries to implement investigation logic inline instead of delegating to an agent.
**Why it happens:** Confusion between what ops.cjs does (data loading, validation, history, dispatch decision) and what the agent does (reasoning, code reading, hypothesis forming).
**How to avoid:** Clear separation: ops.cjs handles data/state, skill command handles orchestration (load context, spawn agent or dispatch to quick/plan-phase), agent handles reasoning.
**Warning signs:** Skill command markdown longer than 60 lines with inline code logic.

## Code Examples

### gsd-tools.cjs Dispatcher Extension
```javascript
// Source: existing ops case block (line 939-955 of gsd-tools.cjs)
// Extend with new subcommands:
case 'ops': {
  const subcommand = args[1];
  if (subcommand === 'init') {
    ops.cmdOpsInit(cwd, args.slice(2), raw);
  } else if (subcommand === 'map') {
    ops.cmdOpsMap(cwd, args[2], raw);
  } else if (subcommand === 'add') {
    ops.cmdOpsAdd(cwd, args[2], args.slice(3), raw);
  } else if (subcommand === 'list') {
    ops.cmdOpsList(cwd, raw);
  } else if (subcommand === 'get') {
    ops.cmdOpsGet(cwd, args[2], raw);
  } else if (subcommand === 'investigate') {
    ops.cmdOpsInvestigate(cwd, args[2], args.slice(3).join(' '), raw);
  } else if (subcommand === 'feature') {
    ops.cmdOpsFeature(cwd, args[2], args.slice(3).join(' '), raw);
  } else if (subcommand === 'modify') {
    ops.cmdOpsModify(cwd, args[2], args.slice(3).join(' '), raw);
  } else if (subcommand === 'debug') {
    ops.cmdOpsDebug(cwd, args[2], args.slice(3).join(' '), raw);
  } else if (subcommand === 'summary') {
    ops.cmdOpsSummary(cwd, raw);
  } else {
    error(`Unknown ops subcommand: ${subcommand}`);
  }
  break;
}
```

### History Entry Schema (D-13)
```javascript
// Each entry in .planning/ops/{area}/history.json:
{
  "op": "investigate",        // "investigate"|"feature"|"modify"|"debug"
  "timestamp": "2026-03-30T16:00:00.000Z",
  "area": "auth",
  "summary": "Investigated login timeout bug",
  "outcome": "success",       // "success"|"partial"|"failed"
  "files_changed": 3          // optional
}
```

### OPS Summary for Context Injection (D-01, D-02)
```javascript
// Written to .planning/ops-summary.json during init
// Follows functionMapStats pattern
{
  "areas_count": 5,
  "areas": [
    {
      "slug": "auth",
      "name": "Auth",
      "components": 12,
      "last_scanned": "2026-03-30T15:00:00Z",
      "nodes_by_type": { "route": 1, "view": 2, "component": 5, "service": 2, "model": 2 },
      "edges_count": 14,
      "cross_refs": ["users", "sessions"]
    }
  ]
}
```

### Skill Command Pattern (ops-investigate.md)
```markdown
---
name: ops:investigate
description: Investigate an area - navigate map, diagnose root cause, propose fix
argument-hint: <area> <problem description>
allowed-tools:
  - Read
  - Bash
  - Task
  - Grep
  - Glob
---
<objective>
Investigate a problem in an OPS area using the dependency tree for navigation.
Autonomous loop: navigate tree -> read code -> form hypothesis -> verify -> propose fix.
Produces diagnosis.md in the area directory.
</objective>

<context>
Area and problem: $ARGUMENTS

Load area context:
\```bash
AREA_DATA=$(node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" ops get <area> --raw)
TREE=$(cat .planning/ops/<area>/tree.json)
\```
</context>

<process>
1. Load tree.json for the area (full tree per D-03)
2. Parse problem description, identify likely entry points in tree
3. Read relevant source files following edges
4. Form hypothesis about root cause
5. Verify hypothesis by reading related code
6. Write diagnosis.md with findings and proposed fix
7. Record in history: `node gsd-tools.cjs ops investigate <area> "<summary>"`
</process>
```

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | node:test + node:assert (project convention) |
| Config file | scripts/run-tests.cjs |
| Quick run command | `node --test tests/ops-workflows.test.cjs` |
| Full suite command | `npm test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| OPS-05 | cmdOpsInvestigate validates area, loads tree, errors on missing tree | unit | `node --test tests/ops-workflows.test.cjs` | Wave 0 |
| OPS-06 | cmdOpsFeature computes blast radius, dispatches correctly, writes plan path | unit | `node --test tests/ops-workflows.test.cjs` | Wave 0 |
| OPS-07 | cmdOpsModify identifies affected nodes from tree edges | unit | `node --test tests/ops-workflows.test.cjs` | Wave 0 |
| OPS-08 | cmdOpsDebug emits context-pack.md with tree chain and specs | unit | `node --test tests/ops-workflows.test.cjs` | Wave 0 |
| OPS-09 | appendHistory appends correct schema; post-op refreshes tree | unit | `node --test tests/ops-workflows.test.cjs` | Wave 0 |

### Sampling Rate
- **Per task commit:** `node --test tests/ops-workflows.test.cjs`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/ops-workflows.test.cjs` -- covers OPS-05 through OPS-09
- [ ] Test fixtures: temp project with registry.json + tree.json + area dirs (reuse createTempProject pattern from helpers.cjs)

## Project Constraints (from CLAUDE.md)

- **SOLID, DRY, MVC, SSoT** architecture principles mandatory
- **No workarounds** without explicit user authorization
- **No npm install** -- request user to run; no new deps needed for this phase anyway
- **Always fix root cause**, never symptoms
- **Never destroy working code** to create new -- extend ops.cjs, don't rewrite
- **GSD workflow enforcement** -- follow discuss -> plan -> execute sequence
- **Zero external dependencies** in lib modules -- Node.js built-ins only
- **node:test + node:assert** for tests (not vitest for CLI-level tests)
- **cmd* export pattern** for all new functions in ops.cjs
- **JSON output** for programmatic consumption, human-readable when called directly

## Open Questions

1. **Auto-map on missing tree**
   - What we know: cmdOpsMap exists and works. Commands error when tree.json missing.
   - What's unclear: Should workflow commands auto-trigger map before erroring? Adds latency but improves UX.
   - Recommendation: Error with clear message suggesting /ops:map. Let Claude's discretion decide during implementation.

2. **Context-pack.md format for /ops:debug**
   - What we know: Must include tree chain (route->model), specs, area history. Must be consumable by /gsd:debug.
   - What's unclear: Exact markdown structure that /gsd:debug can best consume.
   - Recommendation: Use structured markdown with ## sections (Area Overview, Dependency Chain, Specs, Recent History). Keep it under 2KB for context budget.

3. **Full GSD plan structure in .planning/ops/{area}/**
   - What we know: D-06 says plans live in .planning/ops/{area}/, not .planning/phases/
   - What's unclear: Whether to use a plans/ subdirectory or flat layout
   - Recommendation: Use .planning/ops/{area}/plans/ subdirectory to keep tree.json, history.json, diagnosis.md, context-pack.md separate from plan files. Claude's discretion area.

## Sources

### Primary (HIGH confidence)
- ops.cjs source code (681 lines) -- complete Phase 5 implementation with all existing patterns
- init.cjs source code -- functionMapStats injection pattern (lines 138-152)
- gsd-tools.cjs dispatcher -- existing ops case block (lines 939-955)
- 06-CONTEXT.md -- all 13 locked decisions and discretion areas
- 05-CONTEXT.md -- Phase 5 foundation decisions (D-01 through D-20)

### Secondary (MEDIUM confidence)
- commands/gsd/debug.md -- agent-dispatching pattern for /ops:investigate skill command
- commands/gsd/quick.md -- dispatch target for lightweight ops operations
- tests/dispatcher.test.cjs + tests/helpers.cjs -- test conventions and helper patterns

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - no new dependencies, all patterns verified in existing codebase
- Architecture: HIGH - direct extension of Phase 5 patterns, all integration points verified in source
- Pitfalls: HIGH - derived from reading actual implementation (git ls-files for tree refresh, append-only history)

**Research date:** 2026-03-30
**Valid until:** 2026-04-30 (stable -- internal project patterns, no external dependency drift)
