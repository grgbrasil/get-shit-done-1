# OPS v2: Semantic Tree & Accumulated Knowledge

**Date:** 2026-03-30
**Status:** Draft
**Scope:** Evolução do sistema /ops — tree.json enriquecida, consulta filtrada por intenção, findings versionados, exit rápido

---

## Problem

O sistema /ops hoje tem duas limitações estruturais:

1. **Amnésia entre investigações.** Cada `/ops:investigate` parte do zero — relê arquivos, redescobre estrutura, reconstrói entendimento. O conhecimento obtido morre no diagnosis.md narrativo e não é reaproveitado.

2. **Findings sem ciclo de vida.** O diagnóstico gera um markdown solto que não sobrevive context reset. Não tem IDs, status, nem forma de ser consumido incrementalmente pelo `/ops:modify`. O usuário precisa de gambiarras (`/gsd:fast corrija as 9 violações conforme diagnosis.md`) em vez de um fluxo estruturado.

**Metáfora guia:** A tree.json deve ser uma "árvore de frutas" — o agente vai, colhe só o que precisa, e se a fruta não existe, planta pra próxima colheita.

---

## Design

### 1. Tree.json Enriquecida (Semantic Tree)

A tree.json evolui de topologia plana (nós + edges) para **índice semântico acumulativo do codebase**. Cada nó acumula conhecimento ao longo das investigações.

#### Estrutura de um Nó

```jsonc
{
  "id": "planilhao-grid",
  "type": "component",           // route | view | component | endpoint | service | model | table | style | composable
  "file": "frontend/views/prazos/components/PlanilhaoGrid.vue",
  "line": 1,
  "summary": "Grid AG-Grid v35+ Quartz theme para exibição de prazos com edição inline",

  // --- Relações (sempre presentes) ---
  "uses": ["ag-grid-vue:35", "EntityStyles", "ProcessoLinkCellRenderer", "prazos-endpoint"],
  "used_by": ["PlanilhaoView"],
  "props": ["filters", "dateRange"],
  "emits": ["row-selected", "cell-edited"],
  "slots": [],
  "endpoints_called": ["/api/prazos/listar"],

  // --- Conhecimento plantado (cresce a cada investigação) ---
  "knowledge": {
    "framework": "ag-grid-vue@35+, Quartz theme API",
    "specs_applicable": ["SPEC.md:table-tokens", "SPEC.md:typography-scale"],
    "decisions": [
      {
        "date": "2026-03-30",
        "decision": "Migrar de ag-theme-alpine CSS para Quartz theme API",
        "reason": "Override CSS morto em themes.css:1284 referencia classe inexistente"
      }
    ],
    "last_investigated": "2026-03-30",
    "investigation_count": 1
  },

  // --- Campos opcionais por tipo ---
  "css_classes": ["ag-theme-quartz", "custom-planilhao"],    // para components
  "columns": ["processo", "prazo", "responsavel", "status"],  // para grids
  "query": "SELECT * FROM prazos WHERE ...",                  // para endpoints/services
  "indexes": ["idx_prazo_data", "idx_prazo_responsavel"]      // para tables
}
```

#### Princípios da Tree

- **Acumulativa:** Cada investigação adiciona knowledge, nunca remove (exceto se explicitamente corrigido).
- **Enriquecimento lazy:** Nós são criados com cartão mínimo (type, file, line, summary) no `/ops:map`. Knowledge é plantado conforme investigações acontecem.
- **Profundidade horizontal:** Cada nó sabe seus filhos internos (sub-componentes, props, emits, endpoints chamados) — não só a cadeia vertical route→view→component.

### 2. Consulta Filtrada por Intenção

O chamador declara a **categoria do problema** e a tree retorna apenas os nós e campos relevantes.

#### Categorias de Intenção

| Categoria | Campos retornados | Ramos da tree seguidos |
|-----------|-------------------|----------------------|
| `visual` | CSS classes, tokens, specs_applicable, componentes filhos, props visuais | component → style → SPEC |
| `data` | endpoints_called, query, bindings, service, model | component → endpoint → service → model → table |
| `performance` | endpoints_called, query, indexes, volume | endpoint → service → model → table |
| `security` | endpoints_called, auth middleware, permissions | route → endpoint → service |
| `behavior` | props, emits, event handlers, state management | component → composable → service |

#### Mecanismo

```
/ops:investigate prazos "border do select inconsistente no modo noite"

1. Classify intent → "visual"
2. Locate entry node → PlanilhaoGrid.vue (from URL/component name)
3. Filter tree → retorna só campos visual-relevant dos nós no caminho
4. Agente recebe ~20-30 linhas de contexto em vez de ~500+ linhas de código
```

A classificação é feita pelo agente chamador (ou inferida do problema descrito). Se ambíguo, retorna cartões mínimos e o agente pede refinamento.

### 3. Findings como Artefatos Versionados

O investigate gera findings com ciclo de vida completo, armazenados no domínio.

#### Estrutura: `{domain}/findings.json`

```jsonc
{
  "domain": "prazos",
  "findings": [
    {
      "id": "PRAZOS-001",
      "status": "pending",          // pending | in_progress | fixed | wontfix
      "severity": "minor",          // critical | major | minor | cosmetic
      "category": "visual",
      "title": "Cores hardcoded text-red-600 violam SPEC.md",
      "description": "SPEC define text-red-500, componente usa text-red-600 em linhas 158, 167",
      "node_id": "planilhao-grid",
      "file": "frontend/views/prazos/components/PlanilhaoGrid.vue",
      "lines": [158, 167],
      "spec_ref": "SPEC.md:color-tokens",
      "created": "2026-03-30",
      "created_by": "investigate",
      "resolved": null,
      "resolved_by": null
    }
    // ... PRAZOS-002 through PRAZOS-009
  ]
}
```

#### Operações sobre Findings

| Comando | Ação |
|---------|------|
| `/ops:investigate` | Cria findings novos, status `pending` |
| `/ops:modify prazos PRAZOS-001` | Executa fix de um finding específico, marca `fixed` |
| `/ops:modify prazos PRAZOS-001..005` | Executa fix de um range |
| `/ops:modify prazos --all-pending` | Executa todos os pending do domínio |
| `/ops:status prazos` | Mostra contagem por status |

#### Versionamento

- Findings persistem em `findings.json` — sobrevivem context reset.
- History em `history.json` registra cada transição de status.
- Git tracking natural (`.planning/ops/` é versionado).

### 4. Exit Rápido (Fast Bail)

Quando a tree não tem a informação solicitada, o sistema **não gasta contexto tentando**. Retorna imediatamente o que falta.

#### Fluxo

```
Consulta: "qual o endpoint chamado por PlanilhaoGrid?"

Tree tem o nó?
  → NÃO: EXIT { missing: "node", node_id: "planilhao-grid", action: "run /ops:map prazos" }

Tree tem o nó mas não tem endpoints_called?
  → EXIT { missing: "field", node_id: "planilhao-grid", field: "endpoints_called",
           action: "investigate and plant" }

Tree tem a info?
  → RETURN { endpoints_called: ["/api/prazos/listar"], confidence: "confirmed" }
```

#### Planting (Plantio)

Quando o agente descobre algo que a tree não sabia (via grep, leitura de código, etc.), ele **planta** a informação de volta:

```
ops-tools tree-update prazos planilhao-grid endpoints_called '["/api/prazos/listar"]'
```

Próxima consulta ao mesmo nó já terá a informação — zero custo.

---

## Auto-Bootstrap no Investigate

O investigate atual falha se o domínio não existe. Na v2, o investigate auto-resolve pré-requisitos:

```
/ops:investigate prazos "problema X"

1. Domínio "prazos" existe no registry?
   → NÃO: auto-registra via ops:add
2. tree.json existe?
   → NÃO: auto-mapeia via ops:map
3. Nó do componente mencionado existe na tree?
   → NÃO: mapeia o componente específico (não a tree inteira)
4. Procede com investigação usando a tree
```

Diferença crítica: bootstrapping é **silencioso e mínimo** — não mapeia o sistema inteiro, só o necessário pro problema atual.

---

## Impacto nos Comandos Existentes

| Comando | Mudança |
|---------|---------|
| `/ops:init` | Sem mudança — continua criando registry |
| `/ops:map` | Gera nós com cartão mínimo + relações. Preserva knowledge existente |
| `/ops:investigate` | Consulta tree filtrada por intenção → gera findings → planta knowledge |
| `/ops:modify` | Consome findings por ID/range em vez de ler diagnosis.md narrativo |
| `/ops:status` | Inclui contagem de findings por status |
| `/ops:spec` | Sem mudança — specs do domínio continuam separadas |
| `/ops:add` | Sem mudança |

Comandos novos:
- Nenhum comando novo necessário. A evolução é interna aos comandos existentes.

---

## Estrutura de Arquivos por Domínio (v2)

```
.planning/ops/
  registry.json              # índice de domínios (sem mudança)
  prazos/
    tree.json                # árvore semântica enriquecida (EVOLUÇÃO)
    findings.json            # findings versionados com IDs e status (NOVO)
    specs.md                 # regras do domínio (sem mudança)
    backlog.json             # features pendentes (sem mudança — escopo diferente de findings)
    history.json             # log de operações (sem mudança)
```

Nota: `diagnosis.md` é **substituído** por `findings.json`. O formato narrativo não serve pra consumo programático.

---

## Boundaries: findings vs backlog

- **findings.json**: Problemas detectados por investigação — violações de spec, bugs, inconsistências. Criados por `/ops:investigate`, consumidos por `/ops:modify`.
- **backlog.json**: Features novas e melhorias planejadas. Criados manualmente ou por `/ops:add`, consumidos por `/ops:execute`.

São fluxos paralelos: um é reativo (algo está errado), outro é proativo (algo deve ser construído).

---

## Exemplo de Fluxo Completo (v2)

```
# Sessão 1: Investigação
/ops:investigate prazos "border do select inconsistente no modo noite"
  → Auto-bootstrap: domínio existe ✓, tree existe ✓
  → Classifica intenção: "visual"
  → Consulta tree filtrada → recebe nós visuais de PlanilhaoGrid
  → Investiga código → encontra 9 violações
  → Gera PRAZOS-001..009 em findings.json
  → Planta knowledge nos nós investigados
  → Output: "9 findings criados. Use /ops:modify prazos para corrigir."

# Sessão 2: Correção (novo contexto, zero re-investigação)
/ops:modify prazos PRAZOS-001..005
  → Lê findings 001-005 de findings.json (IDs, arquivos, linhas)
  → Consulta tree para contexto mínimo do nó
  → Aplica correções
  → Marca findings como fixed
  → Atualiza history.json

# Sessão 3: Correção restante
/ops:modify prazos --all-pending
  → Lê findings 006-009
  → Já sabe tudo sobre PlanilhaoGrid (knowledge na tree)
  → Corrige → marca fixed

# Sessão 4: Nova investigação no mesmo domínio
/ops:investigate prazos "coluna de processo não ordena"
  → Classifica intenção: "data"
  → Consulta tree → PlanilhaoGrid já tem knowledge rico
  → Só investiga o binding da coluna específica (delta)
  → Planta novo knowledge → gera PRAZOS-010
```

---

## Riscos e Mitigações

| Risco | Mitigação |
|-------|-----------|
| Tree.json cresce demais | Consulta filtrada por intenção garante que só o relevante é carregado. Nós sem knowledge recente podem ser podados |
| Knowledge desatualizado após refactor | `/ops:map` com flag `--refresh` revalida nós contra codebase atual. Nós com arquivo inexistente são marcados stale |
| Classificação de intenção errada | Fallback: retorna cartões mínimos. Agente pode reclassificar e re-consultar |
| Findings acumulam sem resolver | `/ops:status` mostra aging. Findings pending > 30 dias podem ser escalados |

---

## Success Criteria

1. Segunda investigação no mesmo domínio gasta <50% dos tokens da primeira
2. `/ops:modify` funciona em contexto novo sem reler código — só findings.json + tree
3. Findings sobrevivem context reset e podem ser atacados incrementalmente
4. Exit rápido quando tree não tem a info — sem gasto de contexto inútil
