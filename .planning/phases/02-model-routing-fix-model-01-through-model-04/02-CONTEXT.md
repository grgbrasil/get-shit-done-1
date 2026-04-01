# Phase 2: model-routing-fix (MODEL-01 through MODEL-04) - Context

**Gathered:** 2026-04-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Corrigir model aliases defasados (2+ versões atrás) e implementar effort parameter no GSD. Cada agente passa a rodar no modelo e nível de effort correto. gsd-plan-checker volta a rodar local. Não inclui: adaptive thinking config, dynamic complexity detection, ou worker continuation.

</domain>

<decisions>
## Implementation Decisions

### MODEL_ALIAS_MAP fix (MODEL-01)
- **D-01:** Atualizar `MODEL_ALIAS_MAP` em `core.cjs:1012` para: opus → `claude-opus-4-6`, sonnet → `claude-sonnet-4-6`, haiku → `claude-haiku-4-5-20251001`
- **D-02:** Fix trivial de 3 linhas, bug objetivo — sem ambiguidade

### Effort data structure (MODEL-02)
- **D-03:** Mapa paralelo `EFFORT_PROFILES` em `model-profiles.cjs`, separado do `MODEL_PROFILES` existente — zero breaking change nos 15+ callsites em `init.cjs`
- **D-04:** Não alterar a interface de `MODEL_PROFILES` (continua retornando string simples)
- **D-05:** Effort levels seguem o sistema do Claude Code: `low`, `medium`, `high`, `max`

### Effort allocation per agent
- **D-06:** Mapa de effort por agente:

| Agente | Effort | Justificativa |
|--------|--------|---------------|
| gsd-planner | max | Decide arquitetura, erro cascata pro resto |
| gsd-executor | medium | Segue plano já definido |
| gsd-phase-researcher | high | Sintetiza múltiplas fontes |
| gsd-project-researcher | high | Sintetiza múltiplas fontes |
| gsd-roadmapper | high | Define estrutura do projeto |
| gsd-debugger | high | Diagnóstico errado = tempo jogado fora |
| gsd-research-synthesizer | medium | Consolida, não cria |
| gsd-verifier | low | Pass/fail focado |
| gsd-plan-checker | low | Critério claro, resposta curta |
| gsd-codebase-mapper | low | Mecânico |
| gsd-integration-checker | low | Pass/fail focado |
| gsd-nyquist-auditor | low | Pass/fail focado |
| gsd-ui-researcher | high | Sintetiza múltiplas fontes |
| gsd-ui-checker | low | Pass/fail focado |
| gsd-ui-auditor | low | Pass/fail focado |
| gsd-cataloger | low | Mecânico |

### plan-checker routing (MODEL-03)
- **D-07:** Mover `gsd-plan-checker` de DeepSeek (remoto) para local com effort: low
- **D-08:** Manter todos os outros agentes remotos (cataloger, nyquist-auditor, assumptions-analyzer, advisor-researcher, ui-checker, research-synthesizer) no DeepSeek — funcionam sem tools
- **D-09:** Atualizar `AGENT_ROUTING` em `model-profiles.cjs:42` de `{ route: 'remote', provider: 'deepseek-v3' }` para `{ route: 'local' }`

### Effort propagation (MODEL-04)
- **D-10:** Criar função `resolveEffort(agentType)` separada em vez de alterar retorno de `resolveModelInternal()` — zero breaking change
- **D-11:** `resolveEffort()` consulta `EFFORT_PROFILES[agentType]` com fallback para `'medium'` (default seguro)
- **D-12:** Callsites que precisam de effort (init.cjs) chamam `resolveEffort()` em paralelo ao `resolveModelInternal()` existente

### Observabilidade
- **D-13:** Adicionar logging mínimo ao resolver — loggar em stderr quando effort é resolvido: `[gsd] agent=X model=Y effort=Z`
- **D-14:** Loggar quando fallback acontece (agente não encontrado em EFFORT_PROFILES)
- **D-15:** Loggar quando plan-checker roda local (confirmar que mudança de routing pegou)

### Claude's Discretion
- Formato exato do log (structured JSON vs plain text)
- Ordem de implementação dos plans dentro da fase
- Se `resolveEffort()` fica em `core.cjs` junto com `resolveModelInternal()` ou em `model-profiles.cjs` junto com `EFFORT_PROFILES`

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Model routing internals
- `.planning/research/MODEL-ROUTING.md` — Análise completa do source do Claude Code: effort levels, model aliases, agent model resolution, gaps identificados
- `.planning/REQUIREMENTS.md` §Model Routing — Requirements MODEL-01 through MODEL-04

### Key source files
- `get-shit-done/bin/lib/core.cjs` §resolveModelInternal (line 1018) — Resolver atual, MODEL_ALIAS_MAP (line 1012)
- `get-shit-done/bin/lib/model-profiles.cjs` — MODEL_PROFILES, AGENT_ROUTING, LEAN_MODEL_OVERRIDES
- `get-shit-done/bin/lib/llm-router.cjs` — Infraestrutura de roteamento remoto (DeepSeek/Gemini)
- `get-shit-done/bin/lib/init.cjs` — 15+ callsites de resolveModelInternal() que NÃO devem quebrar
- `get-shit-done/bin/lib/commands.cjs` §resolve-model (line 211) — Comando CLI que expõe o resolver

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `MODEL_PROFILES` dict em `model-profiles.cjs:9` — estrutura existente que será espelhada pelo novo `EFFORT_PROFILES`
- `resolveModelInternal()` em `core.cjs:1018` — padrão de resolução (override → profile → alias → fallback) a ser replicado em `resolveEffort()`
- `AGENT_ROUTING` em `model-profiles.cjs:29` — já tem a entrada do plan-checker pra mudar
- `LEAN_MODEL_OVERRIDES` em `model-profiles.cjs:53` — padrão de mapa paralelo já existente, mesma abordagem que usaremos

### Established Patterns
- Mapas paralelos: `MODEL_PROFILES` + `LEAN_MODEL_OVERRIDES` + `AGENT_ROUTING` já coexistem no mesmo arquivo — adicionar `EFFORT_PROFILES` segue o padrão
- Config override: `model_overrides.<agent>` em config.json permite override por agente — considerar `effort_overrides.<agent>` análogo
- Zero console.log em `core.cjs` — todo output vai via `output()` (stdout JSON) ou `error()` (stderr + exit). Logging novo precisa seguir esse padrão

### Integration Points
- `init.cjs` — Todos os init commands (execute-phase, plan-phase, etc.) chamam `resolveModelInternal()` e expõem resultado no JSON. Precisarão expor effort também
- `commands.cjs:211` — `resolve-model` CLI command. Precisará de um `resolve-effort` análogo ou extensão
- `get-shit-done/workflows/plan-phase.md` — Workflow que consome o modelo resolvido. Precisará consumir effort também

</code_context>

<specifics>
## Specific Ideas

- Effort é conceito Anthropic API — não se aplica a providers terceiros (DeepSeek, Gemini). Agentes remotos no AGENT_ROUTING não recebem effort.
- A preocupação principal é não "nerfar" agentes importantes — researchers e planner precisam de raciocínio profundo, checkers/auditors são pass/fail
- Observabilidade é requisito — sem logging, mudanças silenciosas de routing passam despercebidas

</specifics>

<deferred>
## Deferred Ideas

- Adaptive thinking config (detectar se modelo suporta `{ type: 'adaptive' }`) — gap identificado na research, mas escopo de fase futura
- Dynamic complexity detection (orchestrator avalia complexidade e escolhe effort/model em runtime) — ADV-06 em REQUIREMENTS.md
- `effort_overrides.<agent>` em config.json — análogo a model_overrides, pode ser útil mas não é necessário agora

None — discussion stayed within phase scope

</deferred>

---

*Phase: 02-model-routing-fix-model-01-through-model-04*
*Context gathered: 2026-04-01*
