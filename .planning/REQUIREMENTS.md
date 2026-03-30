# Requirements: GSD Impact Analysis (Milestone 1)

**Defined:** 2026-03-29
**Core Value:** Nenhuma execucao pode quebrar silenciosamente o que ja funciona -- mudancas estruturais sao auto-resolvidas, mudancas de comportamento exigem decisao humana.

## v1 Requirements

### Function Map

- [x] **FMAP-01**: Function Map armazena em JSON flat todas as funcoes/metodos/classes com assinatura, proposito e arquivo
- [x] **FMAP-02**: Cada entrada no Function Map inclui array de callers (arquivo:linha) e array de calls (dependencias)
- [x] **FMAP-03**: Function Map e populado via Serena MCP (get_symbols_overview + find_referencing_symbols)
- [x] **FMAP-04**: Function Map possui grep fallback para ambientes sem Serena
- [x] **FMAP-05**: Function Map e atualizado automaticamente a cada execucao (nao so a cada commit)
- [x] **FMAP-06**: Function Map suporta lookup O(1) por chave `file::function`
- [x] **FMAP-07**: Agente catalogador (que popula/atualiza o Function Map) roda em modelo barato (Haiku ou terceiros via OpenRouter) para processar codebases grandes sem custo alto
- [ ] **FMAP-08**: Usuario escolhe durante `/gsd:new-project` se ativa o sistema de Function Map + Impact Analysis (opt-in, nao forcado)

### Impact Analysis

- [x] **IMPACT-01**: Executor consulta Function Map ANTES de modificar qualquer funcao/service/controller/model
- [x] **IMPACT-02**: Impact Analysis identifica todos os callers da funcao sendo modificada
- [ ] **IMPACT-03**: Mudancas estruturais (assinatura, argumentos, tipo retorno) sao auto-resolvidas -- executor atualiza todos os callers automaticamente
- [ ] **IMPACT-04**: Mudancas comportamentais (logica de negocio, resultado semantico diferente) sao escaladas ao usuario com explicacao do impacto
- [x] **IMPACT-05**: Cascade de callers -- quando um caller e atualizado, verificar se essa atualizacao impacta callers do caller (1 nivel)
- [x] **IMPACT-06**: Apos resolver impactos, Function Map e atualizado com as novas assinaturas/callers

### Model Routing

- [ ] **MODEL-01**: Cada tipo de agente GSD possui model recommendation configuravel (catalogador -> barato, planner -> quality, executor -> balanced)
- [ ] **MODEL-02**: Configuracao de model por agente em config.json, com defaults inteligentes que o usuario pode sobrescrever
- [ ] **MODEL-03**: Suporte a providers terceiros (OpenRouter, local models) para agentes que nao precisam de modelos premium
- [ ] **MODEL-04**: Se config de model por agente nao existe no projeto, sistema auto-configura com defaults na primeira execucao

### Integration

- [ ] **INT-01**: Todos os componentes se integram com workflow GSD existente (plan-phase, execute-phase, discuss-phase)
- [ ] **INT-02**: Function Map e injetado no contexto via extensao do Context Engine existente
- [ ] **INT-03**: Impact Analysis roda como step obrigatorio dentro do execute-phase (quando ativado pelo usuario)
- [ ] **INT-04**: Guardrails funcionam com execucao paralela (waves) sem conflitos de escrita
- [ ] **INT-05**: `/gsd:new-project` inclui pergunta de opt-in para Function Map + Impact Analysis

## v2 Requirements (Milestone 2: ADR & Global Memory)

### ADR System

- **ADR-01**: Executor/planner pode criar ADR usando template MADR 4.0 em `.planning/decisions/`
- **ADR-02**: ADRs ativos sao injetados automaticamente no contexto de planners e executors via Context Engine
- **ADR-03**: ADRs possuem status (proposed, accepted, deprecated, superseded) e apenas ativos sao injetados
- **ADR-04**: ADRs persistem entre milestones -- decisoes de milestone N informam milestone N+1
- **ADR-05**: Executor verifica se acao planejada contradiz ADR existente antes de executar

### Cross-Plan Memory

- **MEM-01**: Memoria estruturada em `.planning/memory/` com decisoes, descobertas e constraints de cada plan
- **MEM-02**: Executor e planner leem memoria de plans anteriores antes de agir
- **MEM-03**: Executor registra automaticamente decisoes significativas na memoria ao final de cada execucao
- **MEM-04**: Memoria possui budget de tokens com estrategia hot/cold -- entradas recentes tem prioridade

### Advanced Impact

- **IMPACT-V2-01**: Cascade multi-nivel (callers de callers de callers) para projetos grandes
- **IMPACT-V2-02**: Confidence scoring nas predicoes de impacto (HIGH/MEDIUM/LOW)
- **IMPACT-V2-03**: Impact analysis cross-repositorio para monorepos

### Advanced Memory

- **MEM-V2-01**: Sumarizacao automatica de memoria em milestone boundaries
- **MEM-V2-02**: Memoria semantica -- busca por similaridade, nao so por chave

### Tooling

- **TOOL-V2-01**: Comando `/gsd:impact <file>` para analise de impacto on-demand
- **TOOL-V2-02**: Comando `/gsd:decisions` para listar/buscar ADRs
- **TOOL-V2-03**: Visualizacao do Function Map via CLI (tree de dependencias)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Dashboard visual para Function Map | JSON consultavel e suficiente -- agentes leem JSON, nao dashboards |
| AST parsing nativo (tree-sitter) | Serena MCP + grep fallback e suficiente para v1 sem dependencias nativas |
| Analisadores por linguagem | Serena suporta 40+ linguagens via LSP -- manter GSD language-agnostic |
| Pre-commit hooks para impact analysis | Mid-execution e o momento correto -- pre-commit e tarde demais |
| Auto-resolve de mudancas comportamentais | Perigoso -- mudancas de logica SEMPRE exigem decisao humana |
| Versionamento separado do Function Map | Git ja prove historico -- nao duplicar |
| Multi-repo impact analysis | Single repo e complexo o suficiente para v1 |
| Poda/truncamento do Function Map | Usar modelo barato em vez de podar -- processar tudo sem cortar |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| FMAP-01 | Phase 1 | Complete |
| FMAP-02 | Phase 1 | Complete |
| FMAP-03 | Phase 1 | Complete |
| FMAP-04 | Phase 1 | Complete |
| FMAP-05 | Phase 1 | Complete |
| FMAP-06 | Phase 1 | Complete |
| FMAP-07 | Phase 1 | Complete |
| IMPACT-01 | Phase 2 | Complete |
| IMPACT-02 | Phase 2 | Complete |
| IMPACT-03 | Phase 2 | Pending |
| IMPACT-04 | Phase 2 | Pending |
| IMPACT-05 | Phase 2 | Complete |
| IMPACT-06 | Phase 2 | Complete |
| MODEL-01 | Phase 3 | Pending |
| MODEL-02 | Phase 3 | Pending |
| MODEL-03 | Phase 3 | Pending |
| MODEL-04 | Phase 3 | Pending |
| INT-01 | Phase 3 | Pending |
| INT-02 | Phase 3 | Pending |
| INT-03 | Phase 3 | Pending |
| INT-04 | Phase 3 | Pending |
| INT-05 | Phase 3 | Pending |
| FMAP-08 | Phase 3 | Pending |

**Coverage:**
- v1 requirements: 23 total
- Mapped to phases: 23/23
- Unmapped: 0

---
*Requirements defined: 2026-03-29*
*Last updated: 2026-03-29 after milestone split*
