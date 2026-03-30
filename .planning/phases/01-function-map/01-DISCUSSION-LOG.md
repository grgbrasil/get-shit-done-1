# Phase 1: Function Map - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md -- this log preserves the alternatives considered.

**Date:** 2026-03-29
**Phase:** 01-function-map
**Mode:** discuss (advisor mode active, calibration: standard)
**Areas discussed:** Escopo de symbols, Estrategia de atualizacao, Schema do JSON, Grep fallback

---

## Escopo de Symbols

| Option | Description | Selected |
|--------|-------------|----------|
| Hybrid | Classes/exports top-level + metodos com callers externos | Y |
| Method-level completo | Todos os metodos de todas as classes | |
| Class-level only | So classes e exports | |

**User's choice:** Hybrid (Recomendado)
**Notes:** "gostei do" — user confirmed the hybrid approach as recommended

---

## Estrategia de Atualizacao

| Option | Description | Selected |
|--------|-------------|----------|
| Full rescan pre-plan | Rescan completo antes de cada plano | |
| Incremental (so alterados) | Rescan so dos arquivos tocados pelo plano anterior | Y |
| Full rescan on-demand | So quando o usuario pedir | partial |

**User's choice:** Incremental by default, full rescan as user-authorized fallback
**Notes:** "quando implantar, incremental, e caso comece a dar bugs, tenham problemas reescan autorizado ou requerido pelo usuario"
**Additional insight:** User wants a dedicated lookup script (`gsd-tools fmap get`) — "tem de ter um script para isto e nao ser feita na unha pela ia"

---

## Schema do JSON

| Option | Description | Selected |
|--------|-------------|----------|
| file::Class::method | Separador :: sem ambiguidade em JS/TS/PHP/Vue | |
| file::Class.method | Dot separator mais legivel | |
| file::function (sem classe) | Ignora hierarquia de classe | |

**User's choice:** "estuda a melhor forma" — delegated to Claude's Discretion
**Notes:** User trusts Claude to determine the best key format during implementation

---

## Grep Fallback

| Option | Description | Selected |
|--------|-------------|----------|
| LLM-assisted | Grep descobre arquivos, modelo barato extrai dados | Y |
| Language-aware regex | Patterns por linguagem | |
| Minimal + flag | So nomes e arquivos com flag de qualidade | |

**User's choice:** LLM-assisted (1)
**Notes:** "nao e so serena talvez o usuario use outros mcp como claude-mem, etc" — system should have pluggable provider abstraction, not hardcoded to Serena

---

## Claude's Discretion

- Key format for JSON entries (recommended: file::Class::method)
- Git diff vs file watcher strategy for incremental updates
- Cataloger agent internal prompt design
- Exact format of callers[] and calls[] arrays

## Deferred Ideas

None — discussion stayed within phase scope
