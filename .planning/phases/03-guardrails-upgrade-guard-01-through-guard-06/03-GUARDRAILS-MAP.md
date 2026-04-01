# Phase 3: Guardrails Map — Analise Individual

**Criado:** 2026-04-01
**Objetivo:** Analisar cada guardrail individualmente antes de decidir aplicacao e placement.
**Workflow:** Ir GUARD por GUARD, decidir se aplica, depois decidir onde (global vs project vs hook).

---

## Tabela de Guardrails

| # | Nome | O que e | O que Claude Code faz (source) | O que GSD tem hoje | Status |
|---|------|---------|-------------------------------|-------------------|--------|
| **GUARD-01** | Anti-false-claims | Proibir afirmar "done" quando testes falham, suprimir falhas, ou caracterizar trabalho incompleto como feito | `prompts.ts:~240`: "Never claim 'all tests pass' when output shows failures. Never suppress failing checks. Never characterize incomplete work as done." Bidirecional: tambem proibe hedge em resultados confirmados | CLAUDE.md global tem "Nunca afirme que fez algo que nao fez" (1 linha generica) | Pendente |
| **GUARD-02** | Tool result preservation | Anotar findings importantes na resposta porque tool results podem ser limpos do contexto | `prompts.ts:~841`: "Write down any important information you might need later in your response, as the original tool result may be cleared later" | Nada. Nenhuma instrucao sobre isso | Pendente |
| **GUARD-03** | Anti-scope-creep | Nao adicionar features, refatorar, ou "melhorar" alem do pedido. 3 linhas repetidas > abstracao prematura | `prompts.ts:~200`: "Don't add features beyond what was asked. Don't add error handling for scenarios that can't happen. Don't create helpers for one-time ops. Three similar lines > premature abstraction" | CLAUDE.md global tem "mantenha o escopo original" (1 linha). Project CLAUDE.md tem "Follow GSD workflow" (indireto) | Pendente |
| **GUARD-04** | Destructive command detection | Hook que detecta e warn/block em comandos git destrutivos e rm perigosos durante execucao | `destructiveCommandWarning.ts`: UI warning (nao block) para `git reset --hard`, `push --force`, `rm -rf`, `DROP TABLE`, `--no-verify`, `--amend`, `branch -D`, etc. | `gsd-workflow-guard.js` existe mas so guarda Write/Edit fora de workflow — **zero deteccao de comandos destrutivos em Bash** | Pendente |
| **GUARD-05** | Read-before-edit enforcement | Reforcar que arquivo deve ser lido antes de editar/escrever | `FileEditTool/prompt.ts`: "You MUST read first". `FileEditTool.ts:~460`: runtime `FileStateCache` que recusa edit se nao leu ou se arquivo mudou externamente. **Duas camadas: prompt + runtime** | CLAUDE.md global tem "Nunca destrua o que funciona" e "Nunca recrie sem conhecer" (indireto). `gsd-impact-guard.js` advisa sobre impact analysis mas **nao rastreia reads** | Pendente |
| **GUARD-06** | Context compaction instructions | Instruir o que preservar quando contexto e compactado mid-session | `compact/prompt.ts`: 9 secoes obrigatorias (request/intent, technical concepts, files/snippets, errors/fixes, problem solving, pending tasks, etc.). **Prompt fixo do sistema — nao le CLAUDE.md** | Phase 1 ja implementou: SCOPE-05 (handoff 9 secoes para transicao de fase) + SCOPE-06 (`<context_persistence>` no executor). **Mas so cobre o executor, nao planner/researcher/debugger** | Pendente |

---

## Referencia: Source do Claude Code

- Research completa: `.planning/research/HOOKS-GUARDRAILS.md`
- Source (read-only): `/Volumes/SSD/Desenvolvimento/claude-code-sourcemap-main/restored-src/src/`
- Prompts: `constants/prompts.ts` (anti-false-claims, anti-scope-creep, tool result preservation)
- Edit safety: `tools/FileEditTool/FileEditTool.ts` (FileStateCache), `tools/FileEditTool/prompt.ts`
- Destructive warnings: `utils/destructiveCommandWarning.ts`
- Compaction: `services/compact/prompt.ts`

## Referencia: Arquivos GSD Alvo

- Global CLAUDE.md: `/Users/gg/.claude/CLAUDE.md`
- Project CLAUDE.md: `./CLAUDE.md`
- Hooks: `hooks/gsd-workflow-guard.js`, `hooks/gsd-impact-guard.js`
- Executor agent: `agents/gsd-executor.md` (ja tem `<context_persistence>` do SCOPE-06)

## Decisoes (preencher GUARD por GUARD)

| # | Aplica? | Onde? | Notas |
|---|---------|-------|-------|
| GUARD-01 | | | |
| GUARD-02 | | | |
| GUARD-03 | | | |
| GUARD-04 | | | |
| GUARD-05 | | | |
| GUARD-06 | | | |

---

*Fase: 03-guardrails-upgrade*
*Mapa criado: 2026-04-01*
