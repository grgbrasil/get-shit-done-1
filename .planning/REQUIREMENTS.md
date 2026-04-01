# Requirements: Claude Code Insights

**Defined:** 2026-04-01
**Core Value:** Cada insight extraído se traduz em melhoria concreta — nenhuma análise pela análise.

## v1 Requirements

### Phase Scoping (SCOPE)

- [x] **SCOPE-01**: Adicionar scope echo nos prompts de executor — executor deve declarar escopo antes de executar
- [x] **SCOPE-02**: Enforce commit-before-report — executor não pode reportar "done" sem commit hash
- [x] **SCOPE-03**: Implementar maxTurns por complexidade de plan (simple: 30, medium: 100, complex: 200)
- [x] **SCOPE-04**: Adicionar synthesis step entre research e plan — "never delegate understanding"
- [x] **SCOPE-05**: Structured phase handoff summaries usando template de 9 seções do compact
- [x] **SCOPE-06**: Micro-compact awareness — instruir executores a persistir findings antes de context decay

### Model Routing (MODEL)

- [x] **MODEL-01**: Corrigir MODEL_ALIAS_MAP — atualizar de opus-4-0/sonnet-4-5/haiku-3-5 para 4.6/4.6/4.5
- [x] **MODEL-02**: Implementar effort parameter no sistema de profiles (low/medium/high/max por agente)
- [x] **MODEL-03**: Mover gsd-plan-checker de DeepSeek para local com effort: low
- [x] **MODEL-04**: Propagar effort via resolveModelInternal() retornando { model, effort }

### Hooks & CLAUDE.md (GUARD)

- [x] **GUARD-01**: Anti-false-claims no CLAUDE.md — "Never claim done when tests fail, never suppress failures"
- [ ] **GUARD-02**: Tool result preservation — "Write down key findings, tool results may be cleared"
- [ ] **GUARD-03**: Anti-scope-creep — "Don't add features beyond the plan, 3 lines > premature abstraction"
- [x] **GUARD-04**: Destructive command detection no gsd-workflow-guard hook
- [x] **GUARD-05**: Read-before-edit enforcement reforçado no CLAUDE.md + hook validation
- [x] **GUARD-06**: Context compaction instructions — preservar file paths, snippets, errors, pending tasks

### Brainstorm Phase (BRAIN)

- [x] **BRAIN-01**: `/gsd:brainstorm-phase N` command exists and runs interactive creative exploration with one-question-at-a-time pattern
- [x] **BRAIN-02**: Generates `{NN}-BRAINSTORM.md` with domain_boundary, design_decisions, tradeoffs_explored, pre_context sections; artifact detected by getPhaseFileStats()
- [x] **BRAIN-03**: discuss-phase detects and integrates same-phase BRAINSTORM.md as Likely-confidence assumptions (not locked decisions)
- [x] **BRAIN-04**: Workflow ends with `/clear` + `/gsd:discuss-phase <N>` suggestion, never transitions to plan-phase

## v2 Requirements

### Advanced Patterns

- **ADV-01**: Verification agent adversarial — read-only, roda comandos reais, VERDICT format
- **ADV-02**: Worker continuation para multi-plan phases — reusar executor quente
- **ADV-03**: Worktree isolation para parallel wave execution
- **ADV-04**: Path-conditional skills — ativar skills baseado em working directory
- **ADV-05**: Two-tier cross-phase memory — MEMORY.md index + topic files com staleness tracking
- **ADV-06**: Dynamic complexity detection — orchestrator avalia complexidade e escolhe effort/model

## Out of Scope

| Feature | Reason |
|---------|--------|
| Replicar features ant-only (undercover, modelos internos) | Não aplicável a builds públicos |
| Fork subagent model (context inheritance) | Depende de feature gate do Claude Code, não controlável pelo GSD |
| Coordinator mode completo | Arquitetura diferente do GSD, exigiria rewrite |
| Cache boundary marker no system prompt | Controlado pelo Claude Code runtime, não pelo GSD |
| Plugin toggle system | Overengineering para o escopo atual do GSD |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| SCOPE-01 | Phase 1 | Complete |
| SCOPE-02 | Phase 1 | Complete |
| SCOPE-03 | Phase 1 | Complete |
| SCOPE-04 | Phase 1 | Complete |
| SCOPE-05 | Phase 1 | Complete |
| SCOPE-06 | Phase 1 | Complete |
| MODEL-01 | Phase 2 | Complete |
| MODEL-02 | Phase 2 | Complete |
| MODEL-03 | Phase 2 | Complete |
| MODEL-04 | Phase 2 | Complete |
| GUARD-01 | Phase 3 | Complete |
| GUARD-02 | Phase 3 | Pending |
| GUARD-03 | Phase 3 | Pending |
| GUARD-04 | Phase 3 | Complete |
| GUARD-05 | Phase 3 | Complete |
| GUARD-06 | Phase 3 | Complete |
| BRAIN-01 | Phase 4 | Complete |
| BRAIN-02 | Phase 4 | Complete |
| BRAIN-03 | Phase 4 | Complete |
| BRAIN-04 | Phase 4 | Complete |

**Coverage:**
- v1 requirements: 20 total
- Mapped to phases: 20
- Unmapped: 0

---
*Requirements defined: 2026-04-01*
*Last updated: 2026-04-01 after research synthesis*
