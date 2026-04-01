# Roadmap: Claude Code Insights (Milestone 2)

## Milestones

- **v1.0 GSD Impact Analysis** — Phases 1-7 (shipped 2026-04-01) → [archive](milestones/v1.0-ROADMAP.md)
- **v2.0 Claude Code Insights** — Phases 1-3 (in progress)

## Overview

Estudo sistemático do source code do Claude Code para extrair insights acionáveis e aplicar como patches no GSD e CLAUDE.md global. Três fases em ordem de impacto: phase scoping → model routing → hooks/guardrails. Cada fase produz patches concretos, não documentos.

## Phases

### Phase 1: executor-discipline (SCOPE-01 through SCOPE-06)

**Goal:** Tornar executores GSD mais disciplinados usando padrões do Claude Code — scope echo, commit-before-report, turn limits, synthesis step, handoff summaries, context awareness.

**Requirements:** SCOPE-01, SCOPE-02, SCOPE-03, SCOPE-04, SCOPE-05, SCOPE-06

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

**Key files:**
- `get-shit-done/bin/lib/core.cjs` — MODEL_ALIAS_MAP fix
- `get-shit-done/bin/lib/model-profiles.cjs` — effort levels per agent
- `get-shit-done/bin/lib/llm-router.cjs` — plan-checker routing fix
- `agents/*.md` — effort frontmatter per agent

**Success criteria:**
- MODEL_ALIAS_MAP resolve para opus-4-6, sonnet-4-6, haiku-4-5
- Effort parameter propagado na resolução de modelo
- gsd-plan-checker roda local com effort: low
- Cada agente tem effort level documentado no profile

### Phase 3: guardrails-upgrade (GUARD-01 through GUARD-06)

**Goal:** Aplicar padrões de guardrails do Claude Code no CLAUDE.md global e hooks do GSD — anti-false-claims, tool result preservation, scope enforcement, destructive command detection.

**Requirements:** GUARD-01, GUARD-02, GUARD-03, GUARD-04, GUARD-05, GUARD-06

**Key files:**
- `/Users/gg/.claude/CLAUDE.md` — global guardrails
- `CLAUDE.md` (project) — project-level guardrails
- `hooks/gsd-workflow-guard.js` — destructive command detection
- `hooks/gsd-impact-guard.js` — read-before-edit enforcement

**Success criteria:**
- CLAUDE.md global tem anti-false-claims, tool result preservation, anti-scope-creep
- Hook detecta e warn em comandos git destrutivos durante execução
- gsd-impact-guard valida read-before-edit
- Instruções de compaction adicionadas ao CLAUDE.md

## Phase Dependencies

```
Phase 1 (executor-discipline)
    ↓ (nenhuma dependência, mas informa effort mapping)
Phase 2 (model-routing-fix)
    ↓ (nenhuma dependência técnica)
Phase 3 (guardrails-upgrade)
```

As fases são independentes tecnicamente mas ordenadas por impacto: scoping reduz desperdício de contexto, routing melhora qualidade de output, guardrails previnem falhas silenciosas.

## Progress

| Phase | Status | Plans | Progress |
|-------|--------|-------|----------|
| 1     | ○      | 0/0   | 0%       |
| 2     | ○      | 0/0   | 0%       |
| 3     | ○      | 0/0   | 0%       |

---
*Roadmap created: 2026-04-01*
*Last updated: 2026-04-01 after research synthesis*
