# Phase 2: model-routing-fix (MODEL-01 through MODEL-04) - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-01
**Phase:** 02-model-routing-fix-model-01-through-model-04
**Areas discussed:** Effort data structure, Effort allocation, plan-checker routing, Effort propagation, Observabilidade

---

## Effort Data Structure

| Option | Description | Selected |
|--------|-------------|----------|
| Mapa paralelo EFFORT_PROFILES | Novo dict separado, zero breaking change | ✓ |
| Inline {model, effort} no MODEL_PROFILES | Mais limpo, mas quebra 15+ callsites | |

**User's choice:** Mapa paralelo — zero risco de regressão
**Notes:** Claude recomendou, usuário concordou. Padrão já existe com LEAN_MODEL_OVERRIDES.

---

## Effort Allocation per Agent

| Option | Description | Selected |
|--------|-------------|----------|
| Mapa completo com 4 tiers | max/high/medium/low por papel do agente | ✓ |
| Effort uniforme (tudo high) | Simples mas desperdiça em checkers | |

**User's choice:** Mapa com 4 tiers. Planner=max, researchers/debugger=high, executor/synthesizer=medium, checkers/auditors/cataloger=low
**Notes:** Usuário preocupado em não "nerfar" agentes importantes. Validou que researchers precisam de high. Questionou se planner/executor realmente precisam de high — Claude ajustou: planner subiu pra max (decide arquitetura), executor desceu pra medium (segue plano).

---

## plan-checker Routing

| Option | Description | Selected |
|--------|-------------|----------|
| Mover para local com effort: low | Acesso a tools, custo controlado | ✓ |
| Manter no DeepSeek | Mais barato mas sem acesso ao codebase | |

**User's choice:** Local com effort: low
**Notes:** Checker precisa de acesso ao codebase pra validar planos. Sem tools fica "cego". Todos os outros agentes remotos mantidos no DeepSeek.

---

## Effort Propagation

| Option | Description | Selected |
|--------|-------------|----------|
| resolveEffort() separado | Nova função, zero breaking change | ✓ |
| Alterar retorno de resolveModelInternal() | Retornar {model, effort}, atualizar 15+ callsites | |

**User's choice:** Função separada
**Notes:** Mesmo padrão de adição não-destrutiva que usamos na estrutura de dados.

---

## Observabilidade

**User's choice:** Logging mínimo ao resolver — stderr quando effort é resolvido, quando fallback acontece, quando plan-checker roda local
**Notes:** Usuário levantou a preocupação: "se falhar, como ficamos sabendo?" Verificação mostrou zero logging no resolver atual. Decisão de adicionar observabilidade mínima.

---

## Claude's Discretion

- Formato exato do log
- Ordem dos plans
- Localização do resolveEffort() (core.cjs vs model-profiles.cjs)

## Deferred Ideas

- Adaptive thinking config — fase futura
- Dynamic complexity detection — ADV-06
- effort_overrides em config.json — nice-to-have futuro
