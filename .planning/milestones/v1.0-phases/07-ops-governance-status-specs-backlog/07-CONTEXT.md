# Phase 7: OPS Governance — Status + Specs + Backlog - Context

**Gathered:** 2026-03-30
**Status:** Ready for planning

<domain>
## Phase Boundary

Tres comandos de governance para areas OPS: `/ops:status` (visibilidade de saude), `/ops:spec` (regras/contratos que operacoes validam), `/ops:backlog` (items pendentes com priorizacao e promocao). Cada area ganha visibilidade do seu estado atual, regras explicitas, e fila de trabalho gerenciada.

Fora do escopo: novos workflows de operacao, mudancas no registry/tree format, UI/dashboard.

</domain>

<decisions>
## Implementation Decisions

### /ops:status — Metricas de saude (OPS-10)
- **D-01:** cmdOpsStatus recebe area slug, le tree.json + specs.md + backlog.json + history.json e computa metricas agregadas
- **D-02:** Metricas: nodes_count, edges_count, specs_defined (bool), spec_rules_count, backlog_items_count, backlog_by_priority, last_operation (do history.json), days_since_last_op, tree_last_scanned (do registry.json)
- **D-03:** Output JSON para consumo programatico (agents), human-readable summary quando chamado diretamente — mesmo padrao de cmdOpsList/cmdOpsGet
- **D-04:** Sem area = status de TODAS as areas (table summary). Com area = detalhe completo da area especifica
- **D-05:** Health scoring simples: green/yellow/red baseado em regras fixas (sem specs = yellow, >30 dias sem operacao = yellow, backlog >10 items = yellow, combinacao = red)

### /ops:spec — Regras e contratos (OPS-11)
- **D-06:** Specs vivem em `.planning/ops/{area}/specs.md` — markdown estruturado, nao YAML. Legivel por humanos E LLMs, editavel manualmente
- **D-07:** Formato: sections com headers (## Regras de Negocio, ## Contratos de API, ## Invariantes, ## Notas) — categories emergem do conteudo, nao predefinidas
- **D-08:** cmdOpsSpec subcomandos: `show` (exibe specs), `edit` (abre/cria specs.md com template), `add <rule>` (append regra ao final da secao relevante)
- **D-09:** `/ops:investigate` e `/ops:feature` ja leem specs.md se existir (Phase 6 codigo em ops.cjs:990-994). Phase 7 formaliza o formato e adiciona o comando de gestao
- **D-10:** Specs sao advisory — operacoes leem e consideram, nao bloqueiam execucao. Alinhado com impact guard advisory-only (Phase 2 D-01)

### /ops:backlog — Items pendentes (OPS-12)
- **D-11:** Backlog vive em `.planning/ops/{area}/backlog.json` — array de items com schema `{ id, title, description?, priority: "high"|"medium"|"low", created_at, promoted_to?, status: "pending"|"promoted"|"done" }`
- **D-12:** cmdOpsBacklog subcomandos: `list` (mostra items por prioridade), `add <title>` (append item, default priority medium), `prioritize <id> <priority>` (muda prioridade), `promote <id>` (marca como promoted, retorna contexto para /gsd:quick ou /gsd:plan-phase)
- **D-13:** `promote` nao executa — apenas marca o item e emite contexto (area, tree summary, item description) para o usuario decidir como executar (/gsd:quick, /ops:feature, etc.)
- **D-14:** IDs numericos auto-incrementais simples (1, 2, 3...) — nao UUIDs. Backlog e per-area, nao precisa de unicidade global
- **D-15:** `done <id>` marca item como concluido. Items concluidos permanecem no JSON para historico (nao deleta)

### CLI Integration
- **D-16:** Tres novos subcomandos no dispatcher ops do gsd-tools.cjs: `status`, `spec`, `backlog`
- **D-17:** Tres novas funcoes em ops.cjs: cmdOpsStatus, cmdOpsSpec, cmdOpsBacklog — seguindo padrao cmd* existente
- **D-18:** Tres novos skill commands: `commands/gsd/ops-status.md`, `commands/gsd/ops-spec.md`, `commands/gsd/ops-backlog.md`
- **D-19:** registry.json nao muda de schema — status le dados existentes sem adicionar campos ao registry

### Claude's Discretion
- Template exato do specs.md quando criado pela primeira vez
- Formato exato do human-readable output do status (table vs lista)
- Logica de auto-detect da secao relevante no `spec add`
- Ordenacao do backlog list (por prioridade, por data, ou ambos)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### OPS Requirements
- `.planning/REQUIREMENTS.md` — OPS-10, OPS-11, OPS-12: status, spec, backlog requirements

### Phase 5 Foundation (registry schema, per-area persistence)
- `.planning/phases/05-ops-foundation-registry-mapa-do-sistema/05-CONTEXT.md` — Registry schema (D-01 through D-05), tree format (D-10 through D-14), per-area dirs (D-03)

### Phase 6 Workflows (patterns to follow, history.json schema)
- `.planning/phases/06-ops-workflows-operar-por-area-com-contexto-planejamento/06-CONTEXT.md` — History schema (D-10 through D-13), context injection (D-01 through D-03), blast radius dispatch (D-04 through D-06)

### Existing Implementation (must read before coding)
- `get-shit-done/bin/lib/ops.cjs` — All existing cmd* functions, appendHistory(), readTreeJson(), areaDir() helpers. Specs.md already referenced at line 990-994
- `get-shit-done/bin/gsd-tools.cjs` — CLI dispatcher, existing `case 'ops':` block
- `get-shit-done/bin/lib/core.cjs` — planningRoot(), output(), error() helpers

### Existing Skill Commands (pattern to follow)
- `commands/gsd/ops-investigate.md` — Skill command pattern for ops workflows
- `commands/gsd/ops-add.md` — Simpler skill command pattern

### Testing Convention
- `tests/` — node:test + node:assert pattern

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ops.cjs` — readRegistry(), areaDir(), readTreeJson(), appendHistory() all reusable for status/spec/backlog
- `core.cjs` — planningRoot(), output(), error() for path resolution and CLI output
- `cmdOpsList` — Pattern for iterating all areas and producing summary table
- `cmdOpsGet` — Pattern for single-area detail view

### Established Patterns
- Per-area persistence in `.planning/ops/{area}/` (tree.json, history.json already live there)
- JSON read/write with fs.readFileSync/writeFileSync for structured data
- Markdown files for human-readable content (specs.md follows this)
- cmd* function exports, require core.cjs convention

### Integration Points
- gsd-tools.cjs — extend existing `case 'ops':` with status/spec/backlog subcommands
- ops.cjs — add cmdOpsStatus, cmdOpsSpec, cmdOpsBacklog to module.exports
- commands/gsd/ — three new skill markdown files
- specs.md already referenced by cmdOpsDebug — formalizing the format

</code_context>

<specifics>
## Specific Ideas

- specs.md ja e referenciado no codigo existente (ops.cjs:990-994 no cmdOpsDebug) — Phase 7 formaliza o que ja existe implicitamente
- Health scoring deve ser simples e util, nao over-engineered — green/yellow/red e suficiente
- promote no backlog emite contexto mas nao executa — usuario decide o workflow

</specifics>

<deferred>
## Deferred Ideas

- Dashboard visual de saude de todas as areas — backlog
- Spec validation automatica (assertions executaveis) — complexidade desnecessaria para v1, advisory e suficiente
- Cross-area backlog view (todos os backlogs unificados) — backlog
- Backlog auto-promotion baseado em prioridade e tempo — backlog

</deferred>

---

*Phase: 07-ops-governance-status-specs-backlog*
*Context gathered: 2026-03-30*
