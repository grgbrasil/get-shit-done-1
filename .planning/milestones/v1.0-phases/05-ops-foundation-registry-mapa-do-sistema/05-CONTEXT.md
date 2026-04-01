# Phase 5: OPS Foundation — Registry + Mapa do Sistema - Context

**Gathered:** 2026-03-30
**Status:** Ready for planning

<domain>
## Phase Boundary

Central registry que escaneia codebase e constrói mapa por área (route→view→component→endpoint→service→model). Qualquer agente ou comando pode consultar o mapa completo de uma área do sistema a partir de um registry central. Inclui /ops:init (scan), /ops:map (tree), /ops:add (manual), persistência em .planning/ops/{area}/.

Fora do escopo: workflows de operação (Phase 6), governance/status/specs/backlog (Phase 7).

</domain>

<decisions>
## Implementation Decisions

### Registry Schema & Storage
- **D-01:** Híbrido: `registry.json` como índice slim + per-area directories em `.planning/ops/{area}/`
- **D-02:** Campos por entry no registry.json: `{ slug, name, source: "auto"|"manual", created_at, last_scanned, components_count }`
- **D-03:** Heavy data (tree.json, specs, backlog, history) vive em `.planning/ops/{area}/` — registry.json só indexa
- **D-04:** registry.json location: `.planning/ops/registry.json`
- **D-05:** Slug normalization: lowercase, hyphens, sem caracteres especiais (mesma lógica de phase_slug)

### Auto-detecção de Áreas (/ops:init)
- **D-06:** Hybrid detection: route-file-driven primeiro (Vue Router, Laravel web.php, Express routers), directory-convention fallback para áreas não cobertas por rotas
- **D-07:** Cada área detectada recebe tag `detected_by: "route"|"directory"` para dedup transparente
- **D-08:** Framework patterns configuráveis via JSON mapping (similar a model-profiles.cjs) — extensível sem mudar código
- **D-09:** Sem Serena como engine principal de detecção — heurísticas simples (grep/fs scan), alinhado com decisão anti-AST-parsing do projeto

### Formato da Árvore (tree.json)
- **D-10:** Flat adjacency list com `nodes[]` e `edges[]` — O(1) lookup por node ID, traversal bidirecional
- **D-11:** Node schema: `{ id, type: "route"|"view"|"component"|"endpoint"|"service"|"model"|"table", file_path, name, metadata: {} }`
- **D-12:** Edge schema: `{ from, to, type: "imports"|"calls"|"renders"|"serves"|"uses_table", weight?: number }`
- **D-13:** Cross-area dependencies representadas como edges normais (nenhuma duplicação de nodes)
- **D-14:** tree.json location: `.planning/ops/{area}/tree.json`

### Interface CLI
- **D-15:** Novo lib module `ops.cjs` seguindo padrão fmap.cjs — require core.cjs, export cmd* functions
- **D-16:** Novo domínio `ops` no gsd-tools.cjs dispatcher (case 'ops':)
- **D-17:** Subcomandos CLI: `gsd-tools ops init`, `gsd-tools ops map <area>`, `gsd-tools ops add <area>`, `gsd-tools ops list`, `gsd-tools ops get <area>`
- **D-18:** Skill commands: `/ops:init`, `/ops:map`, `/ops:add` como markdown files em commands/ que delegam para gsd-tools
- **D-19:** Output JSON para consumo programático (agents), human-readable table quando chamado diretamente
- **D-20:** Extensível para Phase 6-7: subcomandos futuros (investigate, debug, status, spec, backlog) adicionam funções ao ops.cjs sem mudança estrutural

### Claude's Discretion
- Estratégia exata de dedup entre route-detected e directory-detected areas
- Heurísticas de confidence scoring por detected area
- Metadata específica por tipo de node (view metadata vs service metadata)
- Formato exato do human-readable table output
- Estratégia de per-area directory initialization (criar dirs vazios ou lazy on first map?)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### OPS Requirements
- `.planning/REQUIREMENTS.md` — OPS-01 through OPS-04: init scan, map area, add manual, per-area persistence

### Existing Architecture (patterns to follow)
- `get-shit-done/bin/lib/fmap.cjs` — Function Map CRUD module pattern (readMap/writeMap, cmd* exports, core.cjs require)
- `get-shit-done/bin/lib/core.cjs` — Path helpers, output formatters, planningRoot()
- `get-shit-done/bin/gsd-tools.cjs` — CLI dispatcher with case routing to lib modules
- `get-shit-done/bin/lib/phase.cjs` — Phase CRUD module (reference for slug normalization)

### Prior Phase Decisions
- `.planning/phases/01-function-map/01-CONTEXT.md` — Function Map schema decisions (D-07 JSON flat, D-10 file location pattern)

### Testing Convention
- `tests/` — node:test + node:assert pattern used by Phase 1-4 tests

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `fmap.cjs` — readMap/writeMap pattern directly replicable for registry.json read/write
- `core.cjs` — planningRoot(), output(), error() helpers for path resolution and CLI output
- `phase.cjs` — slug normalization logic reusable for area slug generation

### Established Patterns
- lib module convention: `cmd*` function exports, require core.cjs, JSON read/write with fs.readFileSync/writeFileSync
- gsd-tools.cjs dispatcher: case-based routing, subcommand extraction, error handling
- JSON flat files in `.planning/`: function-map.json, STATE.md frontmatter, config.json

### Integration Points
- gsd-tools.cjs — new `case 'ops':` block routing to ops.cjs
- `.planning/ops/` — new directory tree for registry and per-area data
- commands/ — new skill markdown files for /ops:* commands

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches following established codebase patterns.

</specifics>

<deferred>
## Deferred Ideas

- /ops:investigate, /ops:feature, /ops:modify, /ops:debug — Phase 6
- /ops:status, /ops:spec, /ops:backlog — Phase 7
- Serena-based semantic clustering for area detection — descartado (anti-AST-parsing decision)
- Visual tree rendering in terminal — possível backlog

</deferred>

---

*Phase: 05-ops-foundation-registry-mapa-do-sistema*
*Context gathered: 2026-03-30*
