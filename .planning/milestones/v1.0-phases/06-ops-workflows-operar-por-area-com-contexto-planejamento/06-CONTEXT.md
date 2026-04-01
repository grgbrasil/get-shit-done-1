# Phase 6: OPS Workflows — Operar por area com contexto + planejamento - Context

**Gathered:** 2026-03-30
**Status:** Ready for planning

<domain>
## Phase Boundary

Usuario aponta pra uma area e descreve o que quer (investigar, adicionar, modificar, debugar) — sistema usa mapa pra contexto, gera plano GSD, e executa. Inclui /ops:investigate, /ops:feature, /ops:modify, /ops:debug. Toda operacao registra historico e atualiza mapa apos mudancas.

Fora do escopo: governance (status, specs, backlog) — Phase 7.

</domain>

<decisions>
## Implementation Decisions

### Context Injection Strategy
- **D-01:** Hibrido — summary automatico com nodes/edges/cross-refs no contexto base (padrao functionMapStats) + leitura direta tree.json para investigate/debug que precisam de traversal profundo
- **D-02:** Summary inclui nodes por tipo, edges count, e areas cross-referenciadas — nao contagem rasa. Garante que o summary seja suficiente pro caso base sem escalar pra tree.json
- **D-03:** Limiar definido pelo tipo de comando (investigate/debug = tree completo, feature/modify = summary), nao por heuristica ambigua

### Plan Generation (Dispatch Hibrido)
- **D-04:** tree.json determina blast radius em runtime — quando edges cruzam mais de uma area ou afetam >5 nodes, rota para full GSD plan (PLAN.md com YAML frontmatter + XML tasks via plan-phase + execute-phase)
- **D-05:** Abaixo do threshold, rota para /gsd:quick com contexto da area injetado — execucao imediata, sem PLAN.md
- **D-06:** Plans OPS full vivem em .planning/ops/{area}/ (nao em .planning/phases/) para nao poluir phases com ops triviais

### Investigate vs Debug (Phase-driven)
- **D-07:** /ops:investigate = loop autonomo: navega tree -> le codigo -> formula hipotese -> verifica -> propoe fix. Produz diagnosis.md na area
- **D-08:** /ops:debug = emit de contexto estruturado: carrega tree.json, specs, stack chain da area, emite context-pack.md e para. Composavel com /gsd:debug
- **D-09:** /ops:debug NAO duplica /gsd:debug — contribui contexto OPS-especifico (cadeia route->model, specs da area, historico) que /gsd:debug consome como input

### History & Map Update (OPS-09)
- **D-10:** Thin history.json per-area em .planning/ops/{area}/history.json — append-only log com campos {op, timestamp, summary, outcome}
- **D-11:** Sem deltas de arquivo no history — git ja cobre versionamento. History e operacional (quem rodou o que, quando, resultado)
- **D-12:** tree.json atualiza como post-op step automatico dentro de cada cmdOps* — mesmo padrao que cmdOpsMap ja usa com last_scanned
- **D-13:** Schema do history entry: `{ op: "investigate"|"feature"|"modify"|"debug", timestamp: ISO, area: slug, summary: string, outcome: "success"|"partial"|"failed", files_changed?: number }`

### Claude's Discretion
- Formato exato do ops summary (quais campos do tree.json sumarizar alem de nodes/edges/cross-refs)
- Threshold exato para dispatch plan/quick (>5 nodes e recomendacao, pode ajustar durante implementacao)
- Design interno dos prompts dos agents ops-investigate e ops-debug
- Formato exato do diagnosis.md e context-pack.md
- Onde plans OPS full ficam dentro de .planning/ops/{area}/ (subdir plans/ ou flat)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### OPS Requirements
- `.planning/REQUIREMENTS.md` — OPS-05 through OPS-09: investigate, feature, modify, debug, history tracking

### Phase 5 Foundation (must understand before building on top)
- `.planning/phases/05-ops-foundation-registry-mapa-do-sistema/05-CONTEXT.md` — Registry schema (D-01 through D-05), tree format (D-10 through D-14), CLI interface (D-15 through D-20)
- `get-shit-done/bin/lib/ops.cjs` — Existing cmdOpsInit, cmdOpsMap, cmdOpsAdd, cmdOpsList, cmdOpsGet implementations

### Existing Patterns to Follow
- `get-shit-done/bin/lib/fmap.cjs` — Function Map CRUD module pattern (readMap/writeMap, cmd* exports)
- `get-shit-done/bin/lib/core.cjs` — Path helpers, output formatters, planningRoot(), resolveModelInternal()
- `get-shit-done/bin/gsd-tools.cjs` — CLI dispatcher case routing

### Related Workflows
- `get-shit-done/workflows/execute-phase.md` — Wave-based execution pattern (for full GSD plan path)
- `commands/gsd/quick.md` — Quick inline execution (for lightweight ops path)
- `commands/gsd/debug.md` — Existing debug workflow that /ops:debug feeds into

### Existing Skill Commands
- `commands/gsd/ops-init.md` — /ops:init skill command pattern to follow
- `commands/gsd/ops-map.md` — /ops:map skill command pattern
- `commands/gsd/ops-add.md` — /ops:add skill command pattern

### Context Engine Integration
- `get-shit-done/bin/lib/init.cjs` — Where functionMapStats injection happens (pattern for ops summary)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ops.cjs` — Already has cmdOpsInit, cmdOpsMap, cmdOpsAdd, cmdOpsList, cmdOpsGet. Phase 6 adds cmdOpsInvestigate, cmdOpsFeature, cmdOpsModify, cmdOpsDebug, cmdOpsSummary, appendHistory()
- `core.cjs` — planningRoot(), output(), error(), generateSlugInternal() all reusable
- `fmap.cjs` — readMap/writeMap pattern directly replicable for history.json read/append
- Context Engine in init.cjs — functionMapStats injection pattern replicable for opsSummary

### Established Patterns
- lib module convention: cmd* function exports, require core.cjs, JSON read/write with fs.readFileSync/writeFileSync
- gsd-tools.cjs dispatcher: case-based routing, subcommand extraction
- Skill commands: markdown files in commands/gsd/ that delegate to gsd-tools
- Per-area persistence in .planning/ops/{area}/ (Phase 5 D-03)
- Adjacency list tree format: nodes[] + edges[] (Phase 5 D-10)

### Integration Points
- gsd-tools.cjs — extend existing `case 'ops':` block with new subcommands (investigate, feature, modify, debug, summary)
- ops.cjs — extend module.exports with new cmd* functions
- init.cjs — add opsSummary injection alongside functionMapStats
- commands/gsd/ — new skill markdown files: ops-investigate.md, ops-feature.md, ops-modify.md, ops-debug.md

</code_context>

<specifics>
## Specific Ideas

- Summary de contexto deve incluir nodes por tipo + edges count + cross-refs (nao contagem rasa) para mitigar risco de insuficiencia
- /ops:debug deve ser composavel com /gsd:debug — emit context-pack.md que /gsd:debug pode consumir como input

</specifics>

<deferred>
## Deferred Ideas

- /ops:status, /ops:spec, /ops:backlog — Phase 7 (governance)
- Visual tree rendering in terminal — backlog
- Context-pack caching between sessions — futuro

</deferred>

---

*Phase: 06-ops-workflows-operar-por-area-com-contexto-planejamento*
*Context gathered: 2026-03-30*
