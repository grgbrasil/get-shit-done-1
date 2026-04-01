# Phase 4: brainstorm-phase-integration (BRAIN-01 through BRAIN-04) - Context

**Gathered:** 2026-04-01 (assumptions mode)
**Status:** Ready for planning

<domain>
## Phase Boundary

Criar comando `/gsd:brainstorm-phase <N>` que roda exploração criativa (estilo brainstorming skill) e gera artifacts GSD-nativos — `{NN}-BRAINSTORM.md` com pré-contexto e pré-plano que alimentam discuss-phase e plan-phase downstream. Não inclui: modificar o brainstorming skill do superpowers, alterar plan-phase ou execute-phase, nem criar novos agents.

</domain>

<decisions>
## Implementation Decisions

### Artifact Naming and Location
- **D-01:** Arquivo `{NN}-BRAINSTORM.md` no diretório da fase (ex: `.planning/phases/03-name/03-BRAINSTORM.md`), seguindo o padrão de `CONTEXT.md`, `RESEARCH.md`, `VERIFICATION.md`
- **D-02:** Adicionar detecção `has_brainstorm` em `getPhaseFileStats()` (core.cjs) e exposição via `init.cjs`, mesmo padrão dos outros artifacts

### Brainstorm-to-Discuss Integration
- **D-03:** discuss-phase detecta `{NN}-BRAINSTORM.md` durante `load_prior_context` (mesmo-fase, não cross-fase) e injeta decisões como gray areas pré-respondidas
- **D-04:** Decisões do BRAINSTORM.md tratadas como "Likely" confidence — discuss-phase as apresenta como assumptions pré-populadas que o usuário pode corrigir (não são locked como prior CONTEXT.md de fases anteriores)

### Interaction Model
- **D-05:** Workflow independente GSD-nativo inspirado no superpowers brainstorming — NÃO reutiliza o skill diretamente
- **D-06:** Perguntas uma por vez (one question at a time) — nunca múltiplas perguntas no mesmo turno
- **D-07:** Propor 2-3 approaches com trade-offs e recomendação antes de cada decisão de design
- **D-08:** Output é `{NN}-BRAINSTORM.md` com seções: domain boundary, design decisions, trade-offs explorados, pré-contexto para discuss-phase
- **D-09:** Ao finalizar, sugere `/clear` + `/gsd:discuss-phase <N>` como próximo passo (nunca transiciona para writing-plans ou plan-phase diretamente)

### Command and Workflow Structure
- **D-10:** Comando `commands/gsd/brainstorm-phase.md` segue padrão exato de `discuss-phase.md` (frontmatter + objective + execution_context → workflow)
- **D-11:** Workflow `get-shit-done/workflows/brainstorm-phase.md` segue padrão de steps XML como `discuss-phase.md` e `discuss-phase-assumptions.md`
- **D-12:** Template `get-shit-done/templates/brainstorm.md` define a estrutura do `{NN}-BRAINSTORM.md`
- **D-13:** Atualizar `do.md` routing para apontar "brainstorming" ao novo comando em vez de discuss-phase
- **D-14:** Atualizar `help.md` para incluir o novo comando na lista de comandos disponíveis

### Claude's Discretion
- Texto exato das perguntas de brainstorming (adaptar ao domínio da fase)
- Quantas perguntas fazer antes de propor approaches (heurística baseada em complexidade)
- Se inclui visual companion offer (como superpowers) ou se mantém text-only por default
- Estrutura interna exata das seções do BRAINSTORM.md template

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Command pattern (closest analog)
- `commands/gsd/discuss-phase.md` — Frontmatter, objective, execution_context, process delegation pattern
- `get-shit-done/workflows/discuss-phase.md` — Interactive Q&A workflow with steps XML, gray area analysis, CONTEXT.md generation
- `get-shit-done/workflows/discuss-phase-assumptions.md` — Assumptions mode: codebase-first analysis, `load_prior_context` step, `scout_codebase` step

### Artifact detection infrastructure
- `get-shit-done/bin/lib/core.cjs` §getPhaseFileStats (~line 1183) — Suffix-based artifact detection (`-CONTEXT.md`, `-RESEARCH.md`)
- `get-shit-done/bin/lib/init.cjs` (lines 750-755) — Boolean exposure (`has_context`, `has_research`) from getPhaseFileStats

### Template pattern
- `get-shit-done/templates/context.md` — 6-section template with domain, decisions, canonical_refs, code_context, specifics, deferred

### Routing references
- `get-shit-done/workflows/do.md` (line 44) — Routes "brainstorming" intent to discuss-phase (needs update)
- `get-shit-done/workflows/help.md` — Command listing (needs update)

### Brainstorming interaction reference
- `~/.claude/plugins/cache/claude-plugins-official/superpowers/5.0.7/skills/brainstorming/SKILL.md` — One-question-at-a-time pattern, 2-3 approaches with trade-offs, design presentation flow

### Requirements
- `.planning/REQUIREMENTS.md` — BRAIN-01 through BRAIN-04 (added by plan 04-01, Task 1)
- `.planning/ROADMAP.md` §Phase 4 — Goal, key files, success criteria

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `discuss-phase.md` workflow: load_prior_context, scout_codebase, and CONTEXT.md generation steps can inform brainstorm workflow structure
- `discuss-phase-assumptions.md`: gsd-assumptions-analyzer spawning pattern, structured output format
- `get-shit-done/templates/context.md`: Section-based template with XML tags — brainstorm template should follow same approach
- `getPhaseFileStats()` in core.cjs: Artifact detection function to extend with BRAINSTORM.md

### Established Patterns
- Commands delegate to workflows via `execution_context` references
- Workflows use `gsd-tools.cjs init phase-op` for bootstrapping
- Artifacts follow `{NN}-{TYPE}.md` naming in phase directories
- Init exposes `has_*` booleans for artifact detection
- Interactive workflows use `AskUserQuestion` with fallback to text mode
- Git commits use `gsd-tools.cjs commit` with descriptive messages

### Integration Points
- `core.cjs` getPhaseFileStats() — needs `has_brainstorm` detection
- `init.cjs` — needs to expose `has_brainstorm` in JSON output
- `discuss-phase.md` load_prior_context step — needs to check for same-phase BRAINSTORM.md
- `discuss-phase-assumptions.md` load_prior_context step — same patch
- `do.md` routing table — brainstorming intent routing
- `help.md` — command listing

</code_context>

<specifics>
## Specific Ideas

- BRAINSTORM.md NAO substitui CONTEXT.md — e um pre-passo que alimenta discuss-phase com decisoes exploratorias
- Decisoes no BRAINSTORM.md sao "soft" (Likely confidence) vs "hard" (locked) no CONTEXT.md — discuss-phase pode desafiar/refinar
- O brainstorm workflow deve ser util para fases que o usuario nao tem visao clara ainda — ajuda a formar a visao antes de discuss-phase capturar decisoes finais
- Fluxo completo fica: brainstorm-phase (opcional) → discuss-phase → plan-phase → execute-phase

</specifics>

<deferred>
## Deferred Ideas

- **Visual companion**: Superpowers brainstorming tem visual companion para mockups no browser — deixar para iteracao futura se houver demanda
- **Auto mode (--auto)**: Brainstorming e inerentemente interativo — auto mode nao faz sentido na v1, talvez em futuro com heuristicas

</deferred>

---

*Phase: 04-brainstorm-phase-integration*
*Context gathered: 2026-04-01 via assumptions mode*
