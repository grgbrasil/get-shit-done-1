# Phase 5: Phase Lock — Detect Active Sessions to Prevent Duplicate Work - Context

**Gathered:** 2026-04-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Detectar sessões ativas do Claude Code operando na mesma fase e impedir trabalho duplicado. Quando uma sessão já está escrevendo artifacts de planning de uma fase, nenhuma outra sessão independente pode escrever na mesma fase. Agentes filhos da mesma sessão (executor, verifier, planner) funcionam normalmente — o lock é por sessão, não por processo individual. Escopo: operações de escrita em `.planning/phases/XX-*/` (artifacts de planning). Código fonte fica fora — git resolve conflitos lá.

</domain>

<decisions>
## Implementation Decisions

### Escopo do Lock
- **D-01:** Lock protege operações na mesma fase — tanto comandos iguais (2x execute-phase) quanto diferentes (plan-phase + execute-phase simultâneos). Fases diferentes tocam diretórios diferentes, não precisam de proteção cruzada.
- **D-02:** Escopo limitado a artifacts de planning (`.planning/phases/XX-*/`). Código fonte excluído — git já resolve merges.

### Mecanismo de Detecção
- **D-03:** Identificação de sessão via `process.ppid` no hook (= PID do Claude Code que spawnou). Dois terminais = dois PIDs. Subagentes da mesma sessão herdam o mesmo parent PID.
- **D-04:** Reação ao conflito: **blocking** (impedir segunda sessão). Primeira exceção ao padrão advisory v1.0 — justificada porque duplicação de artifacts é irreversível.

### Lock File
- **D-05:** Lock file em `.planning/phases/XX-name/.lock` com entrada no `.gitignore`
- **D-06:** Conteúdo JSON: `{ "pid": number, "acquired": "ISO-timestamp" }`
- **D-07:** `.gitignore` atualizado com pattern `.lock` em `.planning/`

### Aquisição e Release
- **D-08:** Aquisição via hook auto-acquire (lazy) — primeira escrita em artifacts da fase cria o lock automaticamente. Zero patch nos workflows existentes.
- **D-09:** Release dual: workflow chama `lock.release()` explicitamente no commit step final + PID check automático (`process.kill(pid, 0)`) como fallback para crashes.
- **D-10:** Não usar PostToolUse para release — impossível saber qual write é o último.

### Implementação
- **D-11:** Novo módulo `lock.cjs` em `get-shit-done/bin/lib/` com API: `acquire(phaseDir, pid)`, `release(phaseDir)`, `check(phaseDir, currentPid)` → `{ locked, owner_pid, stale }`
- **D-12:** Hook novo dedicado `gsd-phase-lock.js` (PreToolUse) — separação de concerns: workflow-guard cuida de "use GSD commands", phase-lock cuida de "alguém já está trabalhando aqui"
- **D-13:** Mensagem de erro blocking inclui: qual fase, PID da sessão que tem o lock, timestamp de quando foi adquirido

### Comandos e Integrações
- **D-14:** Novo comando `/gsd:unlock-phase N` para force-unlock manual em edge cases (crash, PID reutilizado)
- **D-15:** `/gsd:progress` mostra fases com lock ativo — info útil sem custo adicional

### Claude's Discretion
- Formato exato do gsd-tools dispatch para lock operations (acquire/release/check/force-unlock)
- Estrutura interna do hook (stdin parsing, exit codes)
- Se o hook compila via esbuild junto com os outros ou roda como JS direto
- Ordem de implementação dos plans (lock.cjs → hook → command → integration)
- Exato pattern do .gitignore para .lock files

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Hook patterns (existing)
- `hooks/gsd-workflow-guard.js` — PreToolUse hook pattern, stdin JSON parsing, exit codes, advisory vs blocking output format
- `hooks/gsd-impact-guard.js` — PreToolUse hook for Write/Edit interception, .planning/ allowlist pattern

### Core lib modules (existing)
- `get-shit-done/bin/lib/core.cjs` — Path helpers, output formatters, project root detection
- `get-shit-done/bin/lib/config.cjs` — Config file parsing (for enable/disable flag)

### CLI dispatcher
- `get-shit-done/bin/gsd-tools.cjs` — Main dispatcher for all CLI operations (new lock commands register here)

### Phase infrastructure
- `get-shit-done/bin/lib/phase.cjs` — Phase CRUD, directory resolution
- `get-shit-done/bin/lib/init.cjs` — Phase init stats (add has_lock detection)

### Brainstorm
- `.planning/phases/05-phase-lock-detect-active-sessions-to-prevent-duplicate-work/05-BRAINSTORM.md` — Full trade-off analysis for all design decisions

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `hooks/gsd-workflow-guard.js`: Padrão completo de PreToolUse hook — stdin parsing, JSON output, advisory format, destructive pattern matching. Phase-lock hook segue estrutura idêntica.
- `hooks/gsd-impact-guard.js`: Padrão de interception Write/Edit com allowlist de `.planning/` files. Phase-lock inverte a lógica — intercepta especificamente `.planning/phases/` writes.
- `get-shit-done/bin/lib/core.cjs`: `findProjectRoot()`, `output()`, `error()` — reutilizáveis no lock.cjs.

### Established Patterns
- Hooks: stdin → JSON parse → tool_name/tool_input check → exit(0) allow ou JSON output block/advise
- Lib modules: CommonJS, exports objeto com funções, `require('./core.cjs')` para utils
- Config: `config.cjs` com `loadConfig()` para flags enable/disable
- gsd-tools.cjs: switch/case dispatcher com `makeUsage()` para help

### Integration Points
- `.gitignore`: Adicionar `.lock` pattern para `.planning/` — atualmente `.planning/` é tracked (linha 24)
- `init.cjs` / `getPhaseFileStats()`: Adicionar `has_lock` detection (mesmo padrão de `has_brainstorm`)
- `gsd-tools.cjs`: Registrar novos subcomandos `lock acquire|release|check|force-unlock`
- `install.js`: Registrar novo hook `gsd-phase-lock.js` na instalação
- Workflow commit steps: Adicionar `lock.release()` call após commit bem-sucedido

</code_context>

<specifics>
## Specific Ideas

No specific requirements — decisions fully captured from brainstorm analysis and resolution of open questions.

</specifics>

<deferred>
## Deferred Ideas

None — analysis stayed within phase scope.

</deferred>

---

*Phase: 05-phase-lock-detect-active-sessions-to-prevent-duplicate-work*
*Context gathered: 2026-04-01*
