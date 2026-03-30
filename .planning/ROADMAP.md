# Roadmap: GSD Impact Analysis (Milestone 1)

## Overview

First of two independent contributions to the GSD ecosystem. This milestone delivers Function Map + mid-execution impact analysis + model routing — the headline feature that prevents silent breakage when agents modify shared functions. Delivered as a single PR to gsd-build/get-shit-done.

**Milestone 2** (ADR & Global Memory) will be initialized via `/gsd:new-milestone` after this PR ships.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Function Map** - JSON registry of all symbols, signatures, callers, and dependencies with O(1) lookup
- [ ] **Phase 2: Impact Analysis** - Mid-execution guardrails that detect, classify, and resolve cascading impacts
- [ ] **Phase 3: Model Routing & Integration** - Cheap model for cataloger + wire into GSD workflows + opt-in toggle

## Phase Details

### Phase 1: Function Map
**Goal**: Any agent can instantly look up any function's signature, purpose, callers, and dependencies from a single JSON file
**Depends on**: Nothing (first phase)
**Requirements**: FMAP-01, FMAP-02, FMAP-03, FMAP-04, FMAP-05, FMAP-06, FMAP-07
**Success Criteria** (what must be TRUE):
  1. A flat JSON file exists with every function/method/class in the project, including signature, purpose, file path, callers, and dependencies
  2. Looking up a function by `file::function` key returns its entry in O(1) -- no scanning or filtering needed
  3. The Function Map can be populated via Serena MCP, and falls back to grep-based extraction when Serena is unavailable
  4. The Function Map is refreshed automatically during each execution, not just at commit time
  5. The cataloger agent that populates the map runs on a cheap model (Haiku/OpenRouter), not on premium models
**Plans**: 2 plans

Plans:
- [x] 01-01-PLAN.md — fmap.cjs CRUD module + gsd-tools dispatcher + model-profiles + tests
- [ ] 01-02-PLAN.md — gsd-cataloger agent definition + changed-files incremental update support

### Phase 2: Impact Analysis
**Goal**: No execution can silently break existing callers -- structural changes are auto-fixed, behavioral changes require human approval
**Depends on**: Phase 1
**Requirements**: IMPACT-01, IMPACT-02, IMPACT-03, IMPACT-04, IMPACT-05, IMPACT-06
**Success Criteria** (what must be TRUE):
  1. Before modifying any function, the executor knows every caller of that function and what would break
  2. When a function's signature changes (arguments, return type), all callers are automatically updated without human intervention
  3. When a function's behavior changes (business logic, semantic result), the executor stops and explains the impact to the user before proceeding
  4. When a caller is auto-updated, the system checks one level deeper -- callers of that caller -- for cascading impact
  5. After all impacts are resolved, the Function Map reflects the new state (updated signatures, new callers)
**Plans**: 2 plans

Plans:
- [x] 02-01-PLAN.md — fmap impact CLI subcommand + normalizeSignature helper + TDD tests
- [x] 02-02-PLAN.md — PreToolUse hook (gsd-impact-guard.js) + executor prompt impact analysis protocol + install.js registration

### Phase 3: Model Routing & Integration
**Goal**: Cataloger runs on cheap model, all Impact Analysis components wired into GSD workflows, opt-in toggle in new-project
**Depends on**: Phase 1, Phase 2
**Requirements**: MODEL-01, MODEL-02, MODEL-03, MODEL-04, INT-01, INT-02, INT-03, INT-04, INT-05, FMAP-08
**Success Criteria** (what must be TRUE):
  1. config.json contains per-agent model configuration that the user can override
  2. A project without explicit model config auto-generates sensible defaults on first run
  3. Third-party providers (OpenRouter, local models) work for agents that do not need premium models
  4. Running existing GSD workflows works exactly as before when guardrails are not activated
  5. Function Map is injected into agent context via the existing Context Engine
  6. Impact Analysis runs as an automatic step within execute-phase when the user has opted in
  7. Parallel execution (waves) works without write conflicts on shared files
  8. `/gsd:new-project` asks the user whether to activate Function Map + Impact Analysis (opt-in)
**Plans**: 3 plans

Plans:
- [ ] 03-01-PLAN.md — Config defaults (model_overrides, impact_analysis) + VALID_CONFIG_KEYS + tests
- [x] 03-02-PLAN.md — Context Engine functionMapStats injection + init stats file write
- [x] 03-03-PLAN.md — Post-wave cataloger + new-project opt-in + provider docs + hook validation

## Progress

**Execution Order:**
Phase 1 -> 2 -> 3

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Function Map | 0/2 | Not started | - |
| 2. Impact Analysis | 0/2 | Not started | - |
| 3. Model Routing & Integration | 0/3 | Not started | - |

### Phase 4: Pre-flight dependency resolver for phase commands

**Goal:** Centralized prerequisite checker that validates all dependencies before any phase command executes, eliminating scattered inline checks and enabling consistent prerequisite resolution
**Depends on:** Phase 3
**Requirements**: PF-01, PF-02, PF-03, PF-04, PF-05, PF-06, PF-07
**Success Criteria** (what must be TRUE):
  1. Running `gsd-tools preflight <command> <phase>` returns structured JSON indicating readiness or blockers
  2. Missing CONTEXT.md, UI-SPEC.md, plans, and incomplete dependencies are all detected
  3. Config gates (skip_discuss, ui_safety_gate) correctly suppress optional checks
  4. UI detection avoids false positives on programming terms
  5. All three phase workflows (plan-phase, execute-phase, ui-phase) call preflight as first validation step
**Plans**: 2 plans

Plans:
- [x] 04-01-PLAN.md — preflight.cjs module + gsd-tools dispatcher + TDD tests
- [x] 04-02-PLAN.md — Wire preflight into plan-phase, execute-phase, ui-phase workflows + integration tests

### Phase 5: OPS Foundation — Registry + Mapa do Sistema
**Goal**: Qualquer agente ou comando pode consultar o mapa completo de uma area do sistema (route→view→component→endpoint→service→model) a partir de um registry central
**Depends on**: Nothing (independent track)
**Requirements**: OPS-01, OPS-02, OPS-03, OPS-04
**Success Criteria** (what must be TRUE):
  1. `/ops:init` escaneia codebase e produz registry.json com areas detectadas automaticamente
  2. `/ops:map [area]` produz tree.json com cadeia completa de dependencias da area
  3. `/ops:add [area]` registra area manual no registry quando auto-deteccao nao cobre
  4. Dados por area persistem em `.planning/ops/{area}/` com estrutura padrao
  5. Mapa e consultavel por outros comandos /ops como base de contexto
**Plans**: 2 plans

Plans:
- [x] 05-01-PLAN.md — ops.cjs registry CRUD module + area detection heuristics + gsd-tools dispatcher + tests
- [x] 05-02-PLAN.md — cmdOpsMap tree builder (adjacency list graph) + skill commands (/ops:init, /ops:map, /ops:add)

### Phase 6: OPS Workflows — Operar por area com contexto + planejamento
**Goal**: Usuario aponta pra uma area e descreve o que quer (investigar, adicionar, modificar, debugar) — sistema usa mapa pra contexto, gera plano GSD, e executa
**Depends on**: Phase 5
**Requirements**: OPS-05, OPS-06, OPS-07, OPS-08, OPS-09
**Success Criteria** (what must be TRUE):
  1. `/ops:investigate` navega arvore, encontra causa raiz, e propoe fix com contexto completo
  2. `/ops:feature` gera plano GSD com tarefas derivadas da arvore e executa com garantias
  3. `/ops:modify` analisa impacto via arvore antes de alterar comportamento existente
  4. `/ops:debug` fornece contexto completo da area (stack, conexoes, specs) pra facilitar diagnostico
  5. Toda operacao registra historico e atualiza mapa apos mudancas
**Plans**: 3 plans

Plans:
- [x] 06-01-PLAN.md — Shared helpers (appendHistory, computeBlastRadius, refreshTree, cmdOpsSummary) + dispatcher routing + tests
- [x] 06-02-PLAN.md — cmdOpsInvestigate + cmdOpsDebug implementations + /ops:investigate and /ops:debug skill commands
- [x] 06-03-PLAN.md — cmdOpsFeature + cmdOpsModify implementations + /ops:feature and /ops:modify skill commands + init.cjs context injection

### Phase 7: OPS Governance — Status + Specs + Backlog
**Goal**: Cada area tem visibilidade de saude, regras explicitas que operacoes validam, e backlog gerenciado
**Depends on**: Phase 5
**Requirements**: OPS-10, OPS-11, OPS-12
**Success Criteria** (what must be TRUE):
  1. `/ops:status` mostra cobertura de specs, backlog pendente, e mudancas recentes da area
  2. `/ops:spec` permite criar/editar regras que investigate e feature validam
  3. `/ops:backlog` gerencia items pendentes com priorizacao e promocao pra execucao
**Plans**: TBD

Plans:
- [x] 07-01: TBD
- [x] 07-02: TBD
