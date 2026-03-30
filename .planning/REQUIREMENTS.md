# Requirements: GSD Guardrails & Global Memory

**Defined:** 2026-03-29
**Core Value:** Nenhuma execução pode quebrar silenciosamente o que já funciona — mudanças estruturais são auto-resolvidas, mudanças de comportamento exigem decisão humana.

## v1 Requirements

### ADR System

- [ ] **ADR-01**: Executor/planner pode criar ADR usando template MADR 4.0 em `.planning/decisions/`
- [ ] **ADR-02**: ADRs ativos são injetados automaticamente no contexto de planners e executors via Context Engine
- [ ] **ADR-03**: ADRs possuem status (proposed, accepted, deprecated, superseded) e apenas ativos são injetados
- [ ] **ADR-04**: ADRs persistem entre milestones — decisões de milestone N informam milestone N+1
- [ ] **ADR-05**: Executor verifica se ação planejada contradiz ADR existente antes de executar

### Function Map

- [ ] **FMAP-01**: Function Map armazena em JSON flat todas as funções/métodos/classes com assinatura, propósito e arquivo
- [ ] **FMAP-02**: Cada entrada no Function Map inclui array de callers (arquivo:linha) e array de calls (dependências)
- [ ] **FMAP-03**: Function Map é populado via Serena MCP (get_symbols_overview + find_referencing_symbols)
- [ ] **FMAP-04**: Function Map possui grep fallback para ambientes sem Serena
- [ ] **FMAP-05**: Function Map é atualizado automaticamente a cada execução (não só a cada commit)
- [ ] **FMAP-06**: Function Map suporta lookup O(1) por chave `file::function`
- [ ] **FMAP-07**: Agente catalogador (que popula/atualiza o Function Map) roda em modelo barato (Haiku ou terceiros via OpenRouter) para processar codebases grandes sem custo alto
- [ ] **FMAP-08**: Usuário escolhe durante `/gsd:new-project` se ativa o sistema de Function Map + Impact Analysis (opt-in, não forçado)

### Impact Analysis

- [ ] **IMPACT-01**: Executor consulta Function Map ANTES de modificar qualquer função/service/controller/model
- [ ] **IMPACT-02**: Impact Analysis identifica todos os callers da função sendo modificada
- [ ] **IMPACT-03**: Mudanças estruturais (assinatura, argumentos, tipo retorno) são auto-resolvidas — executor atualiza todos os callers automaticamente
- [ ] **IMPACT-04**: Mudanças comportamentais (lógica de negócio, resultado semântico diferente) são escaladas ao usuário com explicação do impacto
- [ ] **IMPACT-05**: Cascade de callers — quando um caller é atualizado, verificar se essa atualização impacta callers do caller (1 nível)
- [ ] **IMPACT-06**: Após resolver impactos, Function Map é atualizado com as novas assinaturas/callers

### Cross-Plan Memory

- [ ] **MEM-01**: Memória estruturada em `.planning/memory/` com decisões, descobertas e constraints de cada plan
- [ ] **MEM-02**: Executor e planner leem memória de plans anteriores antes de agir
- [ ] **MEM-03**: Executor registra automaticamente decisões significativas na memória ao final de cada execução
- [ ] **MEM-04**: Memória possui budget de tokens com estratégia hot/cold — entradas recentes têm prioridade

### Model Routing

- [ ] **MODEL-01**: Cada tipo de agente GSD possui model recommendation configurável (catalogador → barato, planner → quality, executor → balanced)
- [ ] **MODEL-02**: Configuração de model por agente em config.json, com defaults inteligentes que o usuário pode sobrescrever
- [ ] **MODEL-03**: Suporte a providers terceiros (OpenRouter, local models) para agentes que não precisam de modelos premium
- [ ] **MODEL-04**: Se config de model por agente não existe no projeto, sistema auto-configura com defaults na primeira execução

### Integration

- [ ] **INT-01**: Todos os componentes se integram com workflow GSD existente (plan-phase, execute-phase, discuss-phase)
- [ ] **INT-02**: Function Map e ADRs são injetados no contexto via extensão do Context Engine existente
- [ ] **INT-03**: Impact Analysis roda como step obrigatório dentro do execute-phase (quando ativado pelo usuário)
- [ ] **INT-04**: Guardrails funcionam com execução paralela (waves) sem conflitos de escrita
- [ ] **INT-05**: `/gsd:new-project` inclui pergunta de opt-in para Function Map + Impact Analysis + ADR system

## v2 Requirements

### Advanced Impact

- **IMPACT-V2-01**: Cascade multi-nível (callers de callers de callers) para projetos grandes
- **IMPACT-V2-02**: Confidence scoring nas predições de impacto (HIGH/MEDIUM/LOW)
- **IMPACT-V2-03**: Impact analysis cross-repositório para monorepos

### Advanced Memory

- **MEM-V2-01**: Sumarização automática de memória em milestone boundaries
- **MEM-V2-02**: Memória semântica — busca por similaridade, não só por chave

### Tooling

- **TOOL-V2-01**: Comando `/gsd:impact <file>` para análise de impacto on-demand
- **TOOL-V2-02**: Comando `/gsd:decisions` para listar/buscar ADRs
- **TOOL-V2-03**: Visualização do Function Map via CLI (tree de dependências)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Dashboard visual para Function Map | JSON consultável é suficiente — agentes leem JSON, não dashboards |
| AST parsing nativo (tree-sitter) | Serena MCP + grep fallback é suficiente para v1 sem dependências nativas |
| Analisadores por linguagem | Serena suporta 40+ linguagens via LSP — manter GSD language-agnostic |
| Pre-commit hooks para impact analysis | Mid-execution é o momento correto — pre-commit é tarde demais |
| Auto-resolve de mudanças comportamentais | Perigoso — mudanças de lógica SEMPRE exigem decisão humana |
| Versionamento separado do Function Map | Git já provê histórico — não duplicar |
| Multi-repo impact analysis | Single repo é complexo o suficiente para v1 |
| Poda/truncamento do Function Map | Usar modelo barato em vez de podar — processar tudo sem cortar |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| ADR-01 | Pending | Pending |
| ADR-02 | Pending | Pending |
| ADR-03 | Pending | Pending |
| ADR-04 | Pending | Pending |
| ADR-05 | Pending | Pending |
| FMAP-01 | Pending | Pending |
| FMAP-02 | Pending | Pending |
| FMAP-03 | Pending | Pending |
| FMAP-04 | Pending | Pending |
| FMAP-05 | Pending | Pending |
| FMAP-06 | Pending | Pending |
| FMAP-07 | Pending | Pending |
| FMAP-08 | Pending | Pending |
| IMPACT-01 | Pending | Pending |
| IMPACT-02 | Pending | Pending |
| IMPACT-03 | Pending | Pending |
| IMPACT-04 | Pending | Pending |
| IMPACT-05 | Pending | Pending |
| IMPACT-06 | Pending | Pending |
| MEM-01 | Pending | Pending |
| MEM-02 | Pending | Pending |
| MEM-03 | Pending | Pending |
| MEM-04 | Pending | Pending |
| INT-01 | Pending | Pending |
| INT-02 | Pending | Pending |
| INT-03 | Pending | Pending |
| INT-04 | Pending | Pending |
| INT-05 | Pending | Pending |
| MODEL-01 | Pending | Pending |
| MODEL-02 | Pending | Pending |
| MODEL-03 | Pending | Pending |
| MODEL-04 | Pending | Pending |

**Coverage:**
- v1 requirements: 31 total
- Mapped to phases: 0
- Unmapped: 31 ⚠️

---
*Requirements defined: 2026-03-29*
*Last updated: 2026-03-29 after initial definition*
