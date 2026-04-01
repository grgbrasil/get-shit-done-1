# Roadmap: Claude Code Insights (Milestone 2)

## Milestones

- **v1.0 GSD Impact Analysis** — Phases 1-7 (shipped 2026-04-01) → [archive](milestones/v1.0-ROADMAP.md)
- **v2.0 Claude Code Insights** — Phases 1-4 (in progress)

## Overview

Estudo sistemático do source code do Claude Code para extrair insights acionáveis e aplicar como patches no GSD e CLAUDE.md global. Fases 1-3 em ordem de impacto: phase scoping → model routing → hooks/guardrails. Phase 4: integrar brainstorming como pré-discuss com output nativo GSD. Cada fase produz patches concretos, não documentos.

## Phases

### Phase 1: executor-discipline (SCOPE-01 through SCOPE-06)

**Goal:** Tornar executores GSD mais disciplinados usando padrões do Claude Code — scope echo, commit-before-report, turn limits, synthesis step, handoff summaries, context awareness.

**Requirements:** SCOPE-01, SCOPE-02, SCOPE-03, SCOPE-04, SCOPE-05, SCOPE-06

**Plans:** 3/3 plans complete

Plans:
- [x] 01-01-PLAN.md — Executor discipline: scope echo, commit-before-report, micro-compact awareness
- [x] 01-02-PLAN.md — Planner synthesis step: "never delegate understanding"
- [x] 01-03-PLAN.md — maxTurns config, structured handoff summaries, context budget awareness

**Key files:**
- `agents/gsd-executor.md` — adicionar scope echo e commit-before-report
- `agents/gsd-planner.md` — adicionar synthesis step
- `get-shit-done/bin/lib/core.cjs` — maxTurns config
- `get-shit-done/workflows/execute-phase.md` — structured handoff
- `commands/gsd/execute-phase.md` — context budget awareness

**Success criteria:**
- Executor declara escopo no início de cada plan execution
- Nenhum report de "done" sem commit hash
- Turn limits configurados por complexidade
- Phase transitions incluem summary estruturado

### Phase 2: model-routing-fix (MODEL-01 through MODEL-04)

**Goal:** Corrigir model aliases defasados e implementar effort parameter no GSD — cada agente roda no modelo e nível de effort correto.

**Requirements:** MODEL-01, MODEL-02, MODEL-03, MODEL-04

**Plans:** 2/2 plans complete

Plans:
- [x] 02-01-PLAN.md — Fix MODEL_ALIAS_MAP, add EFFORT_PROFILES, fix plan-checker routing
- [x] 02-02-PLAN.md — Implement resolveEffort() and propagate effort to init commands and workflows

**Key files:**
- `get-shit-done/bin/lib/core.cjs` — MODEL_ALIAS_MAP fix
- `get-shit-done/bin/lib/model-profiles.cjs` — effort levels per agent
- `get-shit-done/bin/lib/init.cjs` — effort propagation to init commands
- `get-shit-done/workflows/*.md` — effort field parsing

**Success criteria:**
- MODEL_ALIAS_MAP resolve para opus-4-6, sonnet-4-6, haiku-4-5
- Effort parameter propagado na resolução de modelo
- gsd-plan-checker roda local com effort: low
- Cada agente tem effort level documentado no profile

### Phase 3: guardrails-upgrade (GUARD-01 through GUARD-06)

**Goal:** Aplicar padrões de guardrails do Claude Code no CLAUDE.md global e hooks do GSD — anti-false-claims, tool result preservation, scope enforcement, destructive command detection.

**Requirements:** GUARD-01, GUARD-02, GUARD-03, GUARD-04, GUARD-05, GUARD-06

**Plans:** 1/3 plans executed

Plans:
- [ ] 03-01-PLAN.md — CLAUDE.md global text guardrails (GUARD-01, 02, 05-text, 06-global)
- [x] 03-02-PLAN.md — Hook code: destructive cmd detection + read-before-edit advisory (GUARD-04, 05-runtime)
- [x] 03-03-PLAN.md — Agent prompts: anti-false-claims reinforcement + context_persistence (GUARD-01, 06)

**Key files:**
- `/Users/gg/.claude/CLAUDE.md` — global guardrails
- `hooks/gsd-workflow-guard.js` — destructive command detection
- `hooks/gsd-impact-guard.js` — read-before-edit enforcement
- `agents/gsd-executor.md`, `agents/gsd-verifier.md` — anti-false-claims reinforcement
- `agents/gsd-planner.md`, `agents/gsd-phase-researcher.md`, `agents/gsd-debugger.md` — context_persistence

**Success criteria:**
- CLAUDE.md global tem anti-false-claims, tool result preservation, read-before-edit, compaction instructions
- Hook detecta e warn em comandos git destrutivos durante execução
- gsd-impact-guard emite advisory read-before-edit em edits de code files
- context_persistence em todos os agents long-running (executor, planner, researcher, debugger)

## Phase Dependencies

```
Phase 1 (executor-discipline)
    ↓ (nenhuma dependência, mas informa effort mapping)
Phase 2 (model-routing-fix)
    ↓ (nenhuma dependência técnica)
Phase 3 (guardrails-upgrade)
    ↓ (independente tecnicamente)
Phase 4 (brainstorm-phase-integration)
```

Fases 1-3 independentes mas ordenadas por impacto: scoping reduz desperdício de contexto, routing melhora qualidade de output, guardrails previnem falhas silenciosas. Phase 4 é feature nova independente.

### Phase 4: brainstorm-phase-integration (BRAIN-01 through BRAIN-04)

**Goal:** Criar comando `/gsd:brainstorm-phase <N>` que roda exploração criativa (estilo brainstorming skill) e gera artifacts GSD-nativos — `{NN}-BRAINSTORM.md` com pré-contexto e pré-plano que alimentam discuss-phase e plan-phase downstream.

**Requirements:** BRAIN-01, BRAIN-02, BRAIN-03, BRAIN-04

**Plans:** 2 plans

Plans:
- [ ] 04-01-PLAN.md — Command, workflow, and template for brainstorm-phase
- [ ] 04-02-PLAN.md — Infrastructure patches: artifact detection, discuss-phase integration, routing

**Key files:**
- `commands/gsd/brainstorm-phase.md` — novo comando
- `get-shit-done/workflows/brainstorm-phase.md` — workflow principal
- `get-shit-done/templates/brainstorm.md` — template do BRAINSTORM.md
- `get-shit-done/workflows/discuss-phase.md` — patch pra ler BRAINSTORM.md como prior context

**Success criteria:**
- `/gsd:brainstorm-phase 3` roda exploração criativa com perguntas uma por vez
- Gera `{NN}-BRAINSTORM.md` no diretório da fase com seções de design, decisões e trade-offs
- discuss-phase lê BRAINSTORM.md como prior context (decisões não são re-perguntadas)
- Ao finalizar, sugere `/clear` + `/gsd:discuss-phase <N>` como próximo passo

## Progress

| Phase | Status | Plans | Progress |
|-------|--------|-------|----------|
| 1     | 3/3 | Complete   | 2026-04-01 |
| 2     | ○      | 0/2   | 0%       |
| 3     | 1/3 | In Progress|  |
| 4     | ○      | 0/2   | 0%       |

---
*Roadmap created: 2026-04-01*
*Last updated: 2026-04-01 after phase 4 planning*
