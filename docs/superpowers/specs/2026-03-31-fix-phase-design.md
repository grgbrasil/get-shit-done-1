# `/gsd:fix-phase` — Reabrir e Corrigir Fases Completadas

**Data:** 2026-03-31  
**Status:** Draft  
**Autor:** Gabriel + Claude

## Problema

Quando uma fase é executada e marcada como `completed`, o usuário pode perceber que features inteiras ficaram de fora — escopo cortado entre a entrevista e a execução, ou features não migradas que deveriam ter sido. Hoje, a única saída é criar uma fase nova do zero com todo o ciclo de pesquisa/planejamento, desperdiçando os artifacts já construídos (CONTEXT, RESEARCH, UI-SPEC, planos).

O ciclo de gap-closure existente no `verify-work` só funciona para bugs detectados antes do `phase complete`. Depois disso, não há caminho de volta.

## Solução

Novo comando `/gsd:fix-phase {N}` que reabre uma fase completada para corrigir gaps de escopo, reutilizando toda a infraestrutura de artifacts existente.

## Fluxo Completo

```
/gsd:fix-phase {N}
    │
    ├─ 1. FRESHNESS CHECK
    │     Avalia se o código da fase mudou desde o completion
    │     Se stale → roda map-codebase focado nos domínios da fase
    │
    ├─ 2. GAP ANALYSIS (automático)
    │     Cruza artifacts originais contra entregas reais
    │     Produz FIX-GAPS.md com gaps candidatos
    │
    ├─ 3. FIX INTERVIEW (interativo)
    │     Apresenta gaps encontrados → confirma/descarta/ajusta
    │     Abre para gaps adicionais do usuário
    │     Produz FIX-CONTEXT.md
    │
    ├─ 4. FIX PLANNING (automático)
    │     Avalia se precisa research/UI-research complementar
    │     Gera planos cirúrgicos (31-04-PLAN.md, 31-05-PLAN.md...)
    │     Roda plan-checker para validar
    │
    └─ 5. FIX EXECUTION
        Estado da fase → "fixing"
        Executa só os fix-plans
        Re-verifica fase inteira → volta para "completed"
```

---

## Etapa 1: Freshness Check

### Propósito
Determinar se os artifacts de contexto da fase ainda são confiáveis ou se o código evoluiu significativamente desde o completion.

### Implementação
Novo subcomando `gsd-tools phase freshness --phase {N}`:

1. Lê os SUMMARYs da fase para extrair arquivos referenciados (artifacts, provides)
2. Consulta `git log --since={completion_date}` para esses arquivos
3. Calcula percentual de arquivos modificados por commits posteriores

### Output
```json
{
  "fresh": false,
  "staleness_pct": 45,
  "changed_files": ["src/views/RevisionalFormView.vue", "..."],
  "completion_date": "2026-03-29",
  "phases_since": [32, 33]
}
```

### Threshold
- **≤30% arquivos modificados** → fresh — pula para Gap Analysis
- **>30% arquivos modificados** → stale — roda mapeamento

### Mapeamento para fases stale
- Roda `gsd-codebase-mapper` focado nos diretórios/arquivos da fase (não o codebase inteiro)
- Produz `FIX-CODEBASE.md` na pasta da fase
- Avisa ao usuário: "Fase {N} tem {X}% dos arquivos modificados desde a conclusão. Mapeamento atualizado gerado."

---

## Etapa 2: Gap Analysis

### Propósito
Identificação automática de gaps entre o que foi prometido/discutido e o que foi realmente entregue.

### Fontes cruzadas

| Fonte | O que busca |
|-------|------------|
| CONTEXT.md | Decisões/features discutidas que não aparecem nos SUMMARYs |
| UI-SPEC.md | Componentes/comportamentos especificados não implementados |
| RESEARCH.md | Padrões pesquisados não aplicados |
| PLANs (must_haves) | Truths que passaram na verificação mas podem ser superficiais |
| VERIFICATION.md | Items `human_needed` ou `blocked` |
| Código atual | Stubs, TODOs, funções vazias nos arquivos da fase |

### Agente
Novo agente `gsd-gap-analyzer`:
- Recebe todos os artifacts da fase como contexto
- Cruza documentos para identificar discrepâncias entre promessas e entregas
- Faz leitura superficial do código (grep por stubs, TODOs, funções vazias) sem análise profunda de lógica

### Output
`FIX-GAPS.md` na pasta da fase:

```markdown
---
phase: 31
analysis_date: 2026-03-31
gaps_found: 6
---

## Gaps Identificados

### GAP-01: [título descritivo do que faltou]
- **Evidência:** [o que era esperado vs o que foi entregue]
- **Severidade:** major | minor

### GAP-02: ...
```

---

## Etapa 3: Fix Interview

### Propósito
Entrevista focada e curta para confirmar gaps automáticos e capturar gaps adicionais do usuário.

### Fluxo
1. **Apresenta gaps encontrados** — descrição simples do que faltou, sem detalhes técnicos de origem
   - Usuário responde: `confirmo` / `descarto` / ajusta com comentário livre
2. **Pergunta aberta** — "Além desses gaps, o que mais você notou que faltou ou ficou errado?"
   - Cada item descrito vira um gap com origem "usuário"

### Sem priorização
Todos os gaps confirmados serão resolvidos. A ordem de execução é decisão do planner (wave ordering por dependência técnica).

### Output
`FIX-CONTEXT.md` na pasta da fase:

```markdown
---
phase: 31
fix_session: 2026-03-31
gaps_confirmed: 4
gaps_descartados: 2
gaps_adicionados_usuario: 1
---

## Gaps Confirmados

### GAP-01: [título] — CONFIRMADO
- Detalhe: "O stepper existe mas não reflete o estado real dos campos"

### GAP-05: [título] — ADICIONADO PELO USUÁRIO
- Descrição: "Faltou toda a lógica de comparativo entre revisional e original"

## Gaps Descartados

### GAP-03: [título] — DESCARTADO
- Motivo: "Isso foi movido para fase 33 intencionalmente"
```

---

## Etapa 4: Fix Planning

### Propósito
Gerar planos cirúrgicos focados exclusivamente nos gaps confirmados.

### Reuso de artifacts
- O planner recebe CONTEXT, RESEARCH, UI-SPEC originais como contexto base
- Se fase stale, também recebe FIX-CODEBASE.md

### Research complementar
O planner avalia autonomamente se precisa de pesquisa adicional:
- Se o gap envolve algo já coberto pelo RESEARCH/UI-SPEC existente → pula
- Se o gap envolve algo novo (feature não pesquisada originalmente) → roda pesquisa focada só naquele gap
- Mesma lógica para UI research

### Numeração
Sequencial a partir do último plano da fase:
- Fase 31 tinha 3 planos → fix-plans começam em 31-04, 31-05, etc.

### Frontmatter dos fix-plans
```yaml
---
phase: 31
plan: 4
title: "Fix — Stepper refletir estado real dos campos"
fix: true
fixes_gaps: [GAP-01]
wave: 1
depends_on: []
must_haves:
  truths:
    - "ProgressStepper muda cor baseado em campos obrigatórios preenchidos"
  artifacts:
    - "ProgressStepper.vue atualizado"
---
```

### Validação
Roda `gsd-plan-checker` normalmente — mesmo ciclo de revisão (max 3 iterações).

### Agente
O `gsd-planner` existente com contexto enriquecido (FIX-CONTEXT.md + artifacts originais). Não precisa de agente novo.

---

## Etapa 5: Fix Execution e Estado

### Transição de estado

```
completed → fixing → completed (fixed)
```

**Ao iniciar fix:**
- STATE.md → `Status: Fixing Phase {N}`
- ROADMAP.md → Phase {N} status atualizado para "Fixing"

**Durante execução:**
- Executa só planos com `fix: true` no frontmatter (equivalente a `--gaps-only`)
- Commits atômicos normais
- Checkpoints se plano não é autônomo

**Ao completar:**
- Roda `gsd-verifier` sobre a fase inteira (planos originais + fix-plans)
- Se gaps restantes → pode iniciar novo ciclo fix
- Se passa → volta para `completed`

### Histórico no ROADMAP

```markdown
### Phase 31: Calculos Migration — Frontend Views
- [x] 31-01-PLAN.md — Complete
- [x] 31-02-PLAN.md — Complete
- [x] 31-03-PLAN.md — Complete
- [x] 31-04-PLAN.md — Fix (GAP-01) — Complete
- [x] 31-05-PLAN.md — Fix (GAP-05) — Complete
Plans: 5/5 complete | Fixed: 2026-03-31
```

### Operação lateral
- **Não mexe** no `Current Phase` do STATE se o usuário já avançou para fases posteriores
- **Não bloqueia** execução de outras fases
- **Não reordena** o roadmap

### Guarda de segurança
Se outra fase está em execução, avisa: "Fase {X} está em execução. Deseja pausar para fixar a fase {N}, ou rodar o fix em paralelo?" (worktree isolation disponível via `/gsd:new-workspace`).

---

## Novos Componentes

### Agente: `gsd-gap-analyzer`
- **Propósito:** Cruzar artifacts de uma fase contra entregas reais para identificar gaps
- **Input:** Todos os artifacts da fase (CONTEXT, RESEARCH, UI-SPEC, PLANs, SUMMARYs, VERIFICATION, código)
- **Output:** FIX-GAPS.md
- **Tools:** Read, Bash, Grep, Glob, Write

### Subcomando: `gsd-tools phase freshness`
- **Propósito:** Avaliar se os artifacts de uma fase ainda são confiáveis
- **Input:** `--phase {N}`
- **Output:** JSON com `fresh`, `staleness_pct`, `changed_files`
- **Implementação:** Em `phase.cjs`

### Estado: `fixing`
- **Novo status** no STATE.md: `Fixing Phase {N}`
- **Transições:** `completed → fixing → completed`
- **Implementação:** Em `state.cjs` (novo handler `cmdStateBeginFix`) e `phase.cjs` (atualizar `cmdPhaseComplete` para reconhecer fix-plans)

### Comando: `/gsd:fix-phase`
- **Arquivo:** `commands/gsd/fix-phase.md`
- **Workflow:** `get-shit-done/workflows/fix-phase.md`
- **Skill:** Registrado em skills como `gsd:fix-phase`

### Artifacts por fase

| Artifact | Quando criado | Propósito |
|----------|--------------|-----------|
| FIX-GAPS.md | Etapa 2 | Gaps candidatos automáticos |
| FIX-CONTEXT.md | Etapa 3 | Gaps confirmados pelo usuário |
| FIX-CODEBASE.md | Etapa 1 (se stale) | Mapeamento atualizado do código |
| {N}-{X}-PLAN.md (fix: true) | Etapa 4 | Planos cirúrgicos |
| {N}-{X}-SUMMARY.md | Etapa 5 | Resumo de execução dos fix-plans |
| VERIFICATION.md (atualizado) | Etapa 5 | Re-verificação completa |

---

## Integração com Comandos Existentes

| Comando existente | Mudança necessária |
|---|---|
| `gsd-tools state` | Novo handler `begin-fix` e `end-fix` |
| `gsd-tools phase complete` | Reconhecer fix-plans, timestamp "Fixed" |
| `gsd-tools phase` | Novo subcomando `freshness` |
| `/gsd:execute-phase` | Nenhuma — já suporta `--gaps-only` |
| `/gsd:verify-work` | Nenhuma — já verifica fase inteira |
| `/gsd:progress` | Mostrar fases em status "fixing" |
| ROADMAP.md format | Suportar marcação "Fixed: {DATE}" |

---

## Fora de Escopo

- Não reverte o `phase complete` original — o histórico é preservado
- Não altera planos originais (31-01, 31-02, 31-03) — são imutáveis
- Não roda automaticamente — sempre iniciado explicitamente pelo usuário
- Não substitui o gap-closure do verify-work para bugs durante verificação
