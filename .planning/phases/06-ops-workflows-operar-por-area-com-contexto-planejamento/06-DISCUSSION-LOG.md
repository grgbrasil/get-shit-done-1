# Phase 6: OPS Workflows — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-30
**Phase:** 06-ops-workflows-operar-por-area-com-contexto-planejamento
**Areas discussed:** Context injection, Plan generation, Investigate vs Debug, History & map update

---

## Context Injection Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Summary via gsd-tools CLI | Sempre summary slim, agentes nunca leem tree.json diretamente | |
| Leitura direta do tree.json | Agentes leem tree.json diretamente, zero infraestrutura nova | |
| Hibrido: summary auto + tree.json on-demand | Summary no contexto base + tree completo sob demanda para investigate/debug | ✓ |

**User's choice:** Hibrido (Recomendado)
**Notes:** Usuario expressou preocupacao de que o summary poderia nao ser suficiente. Mitigacao: summary inclui nodes por tipo + edges count + cross-refs, nao contagem rasa. Limiar definido por tipo de comando.

---

## Plan Generation Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Full GSD plan (PLAN.md) | Todas as garantias GSD sempre, mesmo pra tasks triviais | |
| Inline leve (/gsd:quick) | Sem PLAN.md, execucao imediata via /gsd:quick sempre | |
| Dispatch hibrido (scope-gated) | tree.json decide: >5 nodes ou cross-area -> full GSD plan, senao -> /gsd:quick | ✓ |

**User's choice:** Dispatch hibrido (Recomendado)
**Notes:** Nenhuma nota adicional.

---

## Investigate vs Debug

| Option | Description | Selected |
|--------|-------------|----------|
| Intent-driven | investigate = "nao sei o que ta errado"; debug = "sei, me da contexto" | |
| Output-driven | Diferencia so pelo artefato produzido | |
| Phase-driven | investigate = loop autonomo com diagnosis.md; debug = emit de contexto (context-pack.md) | ✓ |

**User's choice:** Phase-driven (Recomendado)
**Notes:** /ops:debug composavel com /gsd:debug existente — contribui contexto OPS-especifico sem duplicar o loop de debugging.

---

## History & Map Update (OPS-09)

| Option | Description | Selected |
|--------|-------------|----------|
| Full history.json (append-only + delta) | Append-only com delta completo + auto tree update | |
| Git log puro | Sem arquivos novos, git e o historico, remap on-demand | |
| Thin history.json | Log slim {op, timestamp, summary, outcome} per-area + tree.json post-op step | ✓ |

**User's choice:** Thin history.json (Recomendado)
**Notes:** Nenhuma nota adicional.

---

## Claude's Discretion

- Formato exato do ops summary
- Threshold exato para dispatch plan/quick
- Design interno dos prompts dos agents
- Formato exato do diagnosis.md e context-pack.md
- Organizacao de plans OPS dentro de .planning/ops/{area}/

## Deferred Ideas

- /ops:status, /ops:spec, /ops:backlog — Phase 7
- Visual tree rendering — backlog
- Context-pack caching — futuro
