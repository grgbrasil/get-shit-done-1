# Phase 1: Function Map - Context

**Gathered:** 2026-03-29
**Status:** Ready for planning

<domain>
## Phase Boundary

JSON registry of all symbols, signatures, callers, and dependencies with O(1) lookup. Any agent can instantly look up any function's signature, purpose, callers, and dependencies from a single JSON file. Populated via MCP providers (Serena as default) with LLM-assisted grep fallback.

</domain>

<decisions>
## Implementation Decisions

### Escopo de Symbols
- **D-01:** Hybrid approach — classes/exports como entries top-level, metodos catalogados somente quando tem callers externos (referenciados fora do proprio arquivo)
- **D-02:** `get_symbols_overview` do MCP para classes/exports top-level, `find_referencing_symbols` somente nos que aparecem referenciados fora do proprio arquivo
- **D-03:** Constantes e tipos re-exportados entram como `exports[]` no nivel de arquivo, nao como entries de metodo

### Estrategia de Atualizacao
- **D-04:** Incremental por padrao — rescan somente dos arquivos alterados por cada plan (via git diff ou file tracking)
- **D-05:** Full rescan disponivel como fallback — ativado pelo usuario ou quando problemas forem detectados
- **D-06:** Script dedicado para consultas ao Function Map (`gsd-tools fmap get`) — a IA nunca le o JSON diretamente, sempre usa a ferramenta

### Schema do JSON
- **D-07:** JSON flat file com O(1) lookup por chave (FMAP-06)
- **D-08:** Campos por entry: `kind` (function/method/class/arrow), `signature`, `purpose`, `callers[]` (arquivo:linha), `calls[]` (dependencias), `language` (js/ts/vue/php), `exported` (boolean), `last_updated` (ISO timestamp)
- **D-09:** Sem `return_type`/`param_types` no map — MCP provider da isso on-demand quando necessario
- **D-10:** File location: `.planning/function-map.json`

### Grep Fallback
- **D-11:** LLM-assisted: grep descobre arquivos candidatos, modelo barato (Haiku/OpenRouter) le chunks e extrai dados estruturados
- **D-12:** Zero regex maintenance — o modelo interpreta qualquer linguagem genericamente
- **D-13:** JSON output identico ao path Serena — mesma estrutura independente da fonte

### Abstracacao de Providers
- **D-14:** Interface plugavel para fontes de symbols — Serena MCP e o provider padrao, mas outros MCPs (claude-mem, etc.) podem servir como fonte
- **D-15:** O cataloger agent detecta qual MCP esta disponivel e usa o melhor disponivel, fallback para LLM-assisted grep

### Claude's Discretion
- Formato exato do key (recomendacao: `file::Class::method` pela robustez multi-linguagem, mas pode ajustar se encontrar razao melhor durante implementacao)
- Estrategia de deteccao de arquivos alterados (git diff vs file watcher vs outra abordagem)
- Design interno do cataloger agent prompt
- Formato exato de `callers[]` e `calls[]` (arquivo:linha vs arquivo::funcao vs ambos)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Function Map Requirements
- `.planning/REQUIREMENTS.md` — FMAP-01 through FMAP-07: schema, population, update, lookup requirements

### Existing Architecture
- `sdk/src/context-engine.ts` — Context Engine that resolves .planning/ files per phase type. Function Map will need integration point here (INT-02)
- `sdk/src/phase-runner.ts` — Phase lifecycle state machine. Update trigger hooks here
- `get-shit-done/bin/gsd-tools.cjs` — CLI dispatcher where `fmap` subcommand will be added
- `get-shit-done/bin/lib/` — 17 CommonJS modules; new `fmap.cjs` module goes here

### Codebase Maps
- `.planning/codebase/STRUCTURE.md` — Directory layout and where to add new code
- `.planning/codebase/CONVENTIONS.md` — Naming patterns, code style, module design
- `.planning/codebase/ARCHITECTURE.md` — Layer overview, data flow, key abstractions

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `sdk/src/context-engine.ts`: ContextEngine class with PHASE_FILE_MANIFEST — pattern for injecting Function Map into agent context
- `get-shit-done/bin/lib/core.cjs`: Path helpers, output formatters, project root detection — reuse for fmap module
- `get-shit-done/bin/lib/config.cjs`: Config file parsing — pattern for reading/writing JSON config
- `get-shit-done/workflows/map-codebase.md`: Existing codebase mapping workflow (produces markdown) — reference for file discovery patterns

### Established Patterns
- CLI commands: `gsd-tools {domain} {action}` dispatcher pattern (e.g., `gsd-tools state load`, `gsd-tools phase list`)
- Module design: One primary export per CJS file in `get-shit-done/bin/lib/`, registered in gsd-tools.cjs dispatcher
- Agent definitions: Markdown files in `agents/` with role definition and tool permissions
- JSON structured output: gsd-tools commands output JSON for agent consumption

### Integration Points
- `get-shit-done/bin/gsd-tools.cjs`: Add `fmap` command group (get, update, stats)
- `get-shit-done/bin/lib/`: Add `fmap.cjs` module for Function Map CRUD
- `agents/`: Add `gsd-cataloger.md` agent definition for cheap-model cataloger
- `.planning/function-map.json`: New artifact in planning directory

</code_context>

<specifics>
## Specific Ideas

- Script dedicado para consultas — "tem de ter um script para isto e nao ser feita na unha pela IA" (gsd-tools fmap get)
- Providers plugaveis — "nao e so Serena, talvez o usuario use outros MCPs como claude-mem, etc"
- Incremental por padrao com full rescan como safety net quando problemas surgirem

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-function-map*
*Context gathered: 2026-03-29*
