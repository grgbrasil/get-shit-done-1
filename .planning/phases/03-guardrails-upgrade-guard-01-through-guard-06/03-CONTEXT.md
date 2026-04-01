# Phase 3: guardrails-upgrade (GUARD-01 through GUARD-06) - Context

**Gathered:** 2026-04-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Aplicar padrões de guardrails do Claude Code no CLAUDE.md global e hooks do GSD. Cobre: anti-false-claims, tool result preservation, destructive command detection, read-before-edit enforcement, context compaction instructions. GUARD-03 (anti-scope-creep) diferido — incerto se benéfico agora. Não inclui: verification agent adversarial (ADV-01), worker continuation (ADV-02), bash security completo (23 categorias do CC).

</domain>

<decisions>
## Implementation Decisions

### GUARD-01: Anti-false-claims
- **D-01:** Expandir a linha genérica do CLAUDE.md global ("Nunca afirme que fez algo que não fez") com 4 proibições específicas do Claude Code: (1) não afirmar "tests pass" quando output mostra falhas, (2) não suprimir checks que falham, (3) não caracterizar trabalho incompleto como feito, (4) não fazer hedge em resultados confirmados (direção bidirecional)
- **D-02:** Adicionar reforço nos agent prompts (executor, verifier) com lembrete curto apontando pras regras globais
- **D-03:** Placement: Global CLAUDE.md + agents — defesa em camadas

### GUARD-02: Tool result preservation
- **D-04:** Adicionar instrução no CLAUDE.md global: "Write down any important information you might need later in your response, as the original tool result may be cleared later"
- **D-05:** Placement: Global CLAUDE.md apenas — regra universal simples, não precisa de reforço por agent
- **D-06:** Foco em: file paths, error messages, code snippets, decisões tomadas

### GUARD-04: Destructive command detection
- **D-07:** Adicionar detecção de comandos destrutivos no `gsd-workflow-guard.js` (hook PreToolUse para Bash)
- **D-08:** Modo **advisory** (warn, não block) — consistente com padrão v1.0 do gsd-impact-guard
- **D-09:** Padrões a detectar: `git reset --hard`, `git push --force`, `git checkout .`, `rm -rf`, `DROP TABLE`, `--no-verify`, `--amend`, `branch -D`, `git clean -f`
- **D-10:** Emitir warning via stderr com sugestão de alternativa segura quando possível

### GUARD-05: Read-before-edit enforcement
- **D-11:** Regra explícita no CLAUDE.md global: "SEMPRE leia o arquivo antes de editar. Nunca edite baseado em memória ou suposições sobre conteúdo"
- **D-12:** `gsd-impact-guard.js` passa a rastrear chamadas Read e emitir advisory warning quando Edit/Write vem sem Read prévio do mesmo arquivo na sessão
- **D-13:** Placement: CLAUDE.md (prompt layer) + hook advisory (runtime layer) — duas camadas como Claude Code, mas advisory em vez de blocking
- **D-14:** Não rastrear estado de arquivo (diff externo) — apenas verificar se Read precedeu Edit

### GUARD-06: Context compaction instructions
- **D-15:** Regra geral no CLAUDE.md global sobre o que preservar durante compaction: file paths, errors, code snippets, pending tasks, decisions
- **D-16:** Adicionar `<context_persistence>` nos agents críticos que rodam longo: planner, researcher, debugger
- **D-17:** NÃO adicionar nos agents curtos (checker, auditor, cataloger, synthesizer) — terminam em 1-2 turnos, nunca sofrem compaction
- **D-18:** Formato segue o padrão SCOPE-06 já implementado no executor (Phase 1)

### Claude's Discretion
- Texto exato das instruções no CLAUDE.md (seguir tom do CC mas adaptar ao estilo do Gabriel)
- Ordem de implementação dos plans dentro da fase
- Se GUARD-04 e GUARD-05 ficam no mesmo hook ou hooks separados (hoje são hooks separados: workflow-guard vs impact-guard)
- Regex patterns exatos para detecção de comandos destrutivos

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Research base
- `.planning/research/HOOKS-GUARDRAILS.md` — Análise completa do source do Claude Code: verification agent, edit safety, bash security, destructive warnings, compaction
- `.planning/phases/03-guardrails-upgrade-guard-01-through-guard-06/03-GUARDRAILS-MAP.md` — Mapa detalhado de cada GUARD: source CC vs estado GSD atual

### Requirements
- `.planning/REQUIREMENTS.md` §Hooks & CLAUDE.md (GUARD) — Requirements GUARD-01 through GUARD-06

### Target files (MUST read before modifying)
- `/Users/gg/.claude/CLAUDE.md` — Global CLAUDE.md, alvo de GUARD-01, 02, 05, 06
- `CLAUDE.md` (project root) — Project CLAUDE.md do GSD
- `hooks/gsd-workflow-guard.js` — Hook PreToolUse existente, alvo de GUARD-04
- `hooks/gsd-impact-guard.js` — Hook PreToolUse existente, alvo de GUARD-05 (read tracking)

### Agent prompts (for GUARD-01 and GUARD-06 reinforcement)
- `agents/gsd-executor.md` — Já tem `<context_persistence>` do SCOPE-06, receberá reforço anti-false-claims
- `agents/gsd-planner.md` — Receberá `<context_persistence>` (GUARD-06)
- `agents/gsd-phase-researcher.md` — Receberá `<context_persistence>` (GUARD-06)
- `agents/gsd-debugger.md` — Receberá `<context_persistence>` (GUARD-06)

### Prior phase context
- `.planning/phases/02-model-routing-fix-model-01-through-model-04/02-CONTEXT.md` — Decisões de Phase 2 (effort routing, sem dependência técnica mas informa padrões)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `hooks/gsd-workflow-guard.js` (94 linhas) — Hook PreToolUse que guarda Write/Edit fora de workflow. Pode ser expandido com detecção Bash (GUARD-04)
- `hooks/gsd-impact-guard.js` (90 linhas) — Hook PreToolUse que advisa sobre impact analysis. Pode ser expandido com Read tracking (GUARD-05)
- `agents/gsd-executor.md` — Já tem `<context_persistence>` do SCOPE-06 como template para expandir a outros agents

### Established Patterns
- Hooks são JavaScript CommonJS (`.js`), não TypeScript
- Padrão advisory: hooks emitem warning via stderr, não bloqueiam (validado em v1.0)
- CLAUDE.md global mistura português e inglês — regras em português, termos técnicos em inglês
- Agent prompts usam seções XML para instruções estruturadas (`<context_persistence>`, `<scope_echo>`)

### Integration Points
- `hooks/` — Compilados via `scripts/build-hooks.js` para `hooks/dist/`
- `.claude/settings.json` — Hooks registrados no Claude Code via `user_tool_approval_settings`
- Agent prompts referenciados por `agents/` directory — agentes spawnam lendo esses arquivos

</code_context>

<specifics>
## Specific Ideas

- GUARD-01 bidirecional: não só proibir falsos positivos ("done" quando não está), mas também falsos negativos (hedge quando resultado foi confirmado)
- GUARD-04 advisory deve sugerir alternativa segura quando possível (ex: "git push --force" → sugerir "git push --force-with-lease")
- GUARD-05 tracking de Reads: manter lista simples em memória do hook, sem persistência entre sessões
- GUARD-06 segue exatamente o formato `<context_persistence>` do executor — copiar e adaptar, não reinventar

</specifics>

<deferred>
## Deferred Ideas

- **GUARD-03 (Anti-scope-creep):** Diferido — Gabriel não tem certeza se é benéfico agora. Regras como "3 linhas > abstração prematura" podem conflitar com princípios DRY do CLAUDE.md global. Revisitar quando houver evidência de scope creep nos executores
- **Verification agent adversarial (ADV-01):** Mencionado na research mas é escopo de fase futura (v2 Requirements)
- **Bash security completo (23 categorias):** CC tem 23 checks de segurança Bash — GUARD-04 cobre só destrutivos, não security. Escopo futuro
- **Hook blocking mode:** Todas as decisões são advisory por agora. Escalar pra blocking quando houver dados de efetividade

</deferred>

---

*Phase: 03-guardrails-upgrade-guard-01-through-guard-06*
*Context gathered: 2026-04-01*
