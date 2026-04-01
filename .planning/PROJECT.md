# Claude Code Insights

## What This Is

Estudo sistemático do source code do Claude Code (1902 arquivos, extraído via sourcemap) para minerar padrões internos da Anthropic e aplicar como patches no GSD e no CLAUDE.md global. Três eixos: phase scoping, model routing, e hooks/guardrails. Source em `/Volumes/SSD/Desenvolvimento/claude-code-sourcemap-main/restored-src/src/` como referência read-only.

## Core Value

Cada insight extraído se traduz em melhoria concreta — nenhuma análise pela análise.

## Requirements

### Validated

- [x] Análise inicial do source: arquitetura mapeada, USER_TYPE=ant confirmado, system prompts extraídos (Validated in session 2026-04-01)

### Validated (v1.0 — GSD Impact Analysis, shipped 2026-03-30)

- [x] **FMAP-01..07**: Function Map CRUD (fmap.cjs) with O(1) key lookup, merge/replace-file, stats, full-scan, gsd-cataloger agent (Serena MCP + grep fallback)
- [x] **IMPACT-01..06**: Impact Analysis — fmap impact CLI, normalizeSignature, PreToolUse advisory hook (gsd-impact-guard.js), executor protocol with threshold-split resolution
- [x] **MODEL-01..04, INT-01..05**: Model Routing Integration — config defaults (model_overrides, impact_analysis), Context Engine stats injection, post-wave cataloger, third-party provider docs
- [x] **PF-01..07**: Preflight Dependency Resolver — preflight.cjs with config-gate suppression, wired into plan-phase/execute-phase/ui-phase workflows
- [x] **OPS-01..04**: OPS Registry Foundation — ops.cjs with hybrid area auto-detection (routes + directories), adjacency-list graph builder (tree.json), multi-language import scanning
- [x] **OPS-05..09**: OPS Workflows — investigate, debug (context-pack.md), feature (blast-radius dispatch), modify (tree edge impact analysis), ops-summary.json context injection
- [x] **OPS-10..12**: OPS Governance — health scoring (status), specs template management (spec), priority queue backlog (backlog)

### Active

- [ ] **SCOPE-01**: Extrair regras de decomposição de fases do source (max arquivos/fase, phased execution, context decay)
- [ ] **SCOPE-02**: Aplicar regras de scoping como guardrails no GSD (discuss-phase e plan-phase)
- [ ] **SCOPE-03**: Implementar context decay awareness — re-read automático após N turnos
- [ ] **MODEL-01**: Auditar model-profiles.cjs e mapear quais agentes GSD estão sub-alocados
- [ ] **MODEL-02**: Extrair lógica de effort levels do source (effort.ts) e aplicar no GSD
- [ ] **MODEL-03**: Implementar effort routing inteligente por tipo de tarefa
- [ ] **HOOK-01**: Extrair padrões de verificação do source (verification agent, edit integrity, forced re-read)
- [ ] **HOOK-02**: Implementar hooks de verificação no CLAUDE.md global
- [ ] **HOOK-03**: Extrair bash security patterns e aplicar como guardrails
- [ ] **HOOK-04**: Implementar token budget awareness no CLAUDE.md

### Out of Scope

- Reescrever o core do GSD — apenas estender com novos componentes
- Modificar o source do Claude Code — é referência read-only
- Replicar features ant-only (modelos internos, undercover mode) — não são aplicáveis
- Segurança ofensiva — não explorar vulnerabilidades, só aprender padrões defensivos

## Context

- Source extraído de sourcemaps do pacote npm `@anthropic-ai/claude-code` v2.1.88
- Arquitetura: tools/, agents/, coordinator/, memory (memdir/), skills/, context/, security
- USER_TYPE=ant é build-time define — branches eliminadas do build público via constant folding
- Diferenças reais ant-only: modelos internos, effort max persistente, undercover mode, verification agent experimental
- O "CLAUDE.md secreto" do Reddit (u/iamfakeguru) é ~80% fabricação — as regras de qualidade são iguais pra todos
- Projeto anterior (v1.0 Impact Analysis) completou 7 fases em ~1h de execução ativa: function-map CRUD + cataloger, impact analysis CLI + advisory hook, model routing config + context engine injection, preflight resolver, OPS registry + workflows + governance (73+ tests, zero regressions, 16 plans via TDD)

## Constraints

- **Read-only source**: `/Volumes/SSD/Desenvolvimento/claude-code-sourcemap-main` não é modificado
- **Fork-first**: Patches vão pro get-shit-done-grg, upstream avaliado depois
- **Compatibilidade**: Não pode quebrar workflow GSD existente
- **Escopo por fase**: Cada fase toca no máximo o necessário — research + patch, não monografia

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Ordem: scoping → routing → hooks | Phase scoping é o que mais dói (contexto estourando) | Pending (v2.0) |
| Fork local primeiro, upstream depois | Velocidade de iteração sem preocupação de compat | Validated in v1.0: all 7 phases shipped on fork, zero upstream conflicts |
| Deliverable = patches, não documento | Gabriel quer código, não relatório | Validated in v1.0: 16 plans = 16 working code deliverables, zero docs-only plans |
| TDD RED/GREEN per plan | Catch regressions early, keep test count growing | Validated in v1.0: zero regressions across 16 plans, 73+ tests |
| Advisory hooks over blocking | Guide without obstructing, upgrade to blocking with data | Validated in v1.0: gsd-impact-guard.js advisory-only worked well |
| Small plans (1-2 tasks, <5min) | Keep context fresh, minimize deviation risk | Validated in v1.0: avg 3.5min/plan, deviations only on plans >4min |

---
*Last updated: 2026-04-01 after project initialization*
