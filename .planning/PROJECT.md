# GSD Impact Analysis (Milestone 1)

## What This Is

Sistema de análise de impacto mid-execution para o GSD (Get Shit Done). Previne quebra silenciosa quando executores modificam funções compartilhadas — auto-resolve mudanças estruturais, escala mudanças comportamentais ao usuário. Fork local do GSD, entregue como PR upstream. Milestone 2 (ADR & Global Memory) será iniciado após este PR.

## Core Value

Nenhuma execução pode quebrar silenciosamente o que já funciona — mudanças estruturais são auto-resolvidas, mudanças de comportamento exigem decisão humana.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] ADR compartilhado — registro de decisões arquiteturais lido por todos os agentes/executores antes de agir
- [ ] Function Map (JSON) — mapa estruturado de todas as funções, assinaturas, propósito e callers, consultável instantaneamente
- [ ] Atualização automática do Function Map a cada execução (não só a cada commit)
- [ ] Impact Analysis mid-execution — executor consulta Function Map antes de modificar qualquer função
- [ ] Auto-resolve de mudanças estruturais (assinatura, argumentos, tipo de retorno) sem perguntar ao usuário
- [ ] Escalação para o usuário quando mudança altera lógica de negócio/comportamento semântico
- [ ] Memória cross-plan — decisões e descobertas de um plan acessíveis por todos os plans subsequentes
- [ ] Integração com workflow GSD existente (plan-phase, execute-phase, discuss-phase)

### Out of Scope

- Reescrever o core do GSD — apenas estender com novos componentes
- UI/dashboard para visualizar o Function Map — JSON consultável é suficiente
- Análise estática profunda (AST parsing) — mapeamento baseado em grep/serena é suficiente para v1
- Suporte a linguagens além das usadas nos projetos do usuário (JS/TS/Vue/PHP)

## Context

- Fork local do repositório gsd-build/get-shit-done
- Usado primariamente com projetos SIJUR (Vue 3, Node.js, PHP/Laravel)
- O GSD já tem subagent orchestration, mas cada executor roda em contexto isolado
- O sistema de codebase mapping (`/gsd:map-codebase`) já existe mas é snapshot estático
- Serena MCP está disponível para análise simbólica de código (find_symbol, find_referencing_symbols, get_symbols_overview)
- Contribuições upstream devem ser genéricas o suficiente para qualquer stack

## Constraints

- **Compatibilidade**: Não pode quebrar o workflow GSD existente — extensão, não substituição
- **Performance**: Function Map deve ser consultável em <1s (JSON flat, não queries pesadas)
- **Contexto**: Artifacts de memória devem caber no context window sem inflá-lo demais
- **Upstream**: Componentes devem ser genéricos o suficiente para PR ao repo principal
- **Stack**: Deve funcionar com qualquer linguagem que o GSD suporte, não só JS/Vue/PHP

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Function Map como JSON flat | Performance de leitura instantânea, sem dependência externa | — Pending |
| Impact analysis mid-execution (não pré-commit hook) | Permite abortar antes de fazer a mudança, não depois | — Pending |
| Auto-resolve estrutural vs escalação comportamental | Equilibra autonomia com segurança — como dev senior faria | — Pending |
| ADR como markdown compartilhado | Legível por humanos e LLMs, versionado no git | — Pending |
| Serena como engine de análise simbólica | Já disponível via MCP, faz find_referencing_symbols nativamente | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd:transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-03-29 after initialization*
