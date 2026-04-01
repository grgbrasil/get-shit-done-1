# Phase 5: Phase Lock — Detect Active Sessions to Prevent Duplicate Work - Brainstorm

**Explored:** 2026-04-01
**Status:** Pre-context (feeds into discuss-phase)

<domain_boundary>
## Domain Boundary

Detectar sessões ativas do Claude Code que estão operando na mesma fase e impedir trabalho duplicado. Quando uma sessão já está escrevendo artifacts de planning de uma fase, nenhuma outra sessão independente pode escrever na mesma fase. Agentes filhos da mesma sessão (executor, verifier, planner) devem funcionar normalmente — o lock é por sessão, não por processo individual.

Escopo: operações de escrita em `.planning/phases/XX-*/` (artifacts de planning). Código fonte fica fora — git resolve conflitos lá.
</domain_boundary>

<design_decisions>
## Design Decisions

### Escopo do Lock
- **BD-01:** Lock protege operações na **mesma fase** — tanto comandos iguais (2x execute-phase) quanto diferentes (plan-phase + execute-phase simultâneos) -- Confidence: Confident
  - Trade-off: Poderia proteger qualquer sobreposição cross-fase, mas isso seria over-engineering — fases diferentes tocam diretórios diferentes
  - Why this way: O cenário destrutivo real é dois executores escrevendo os mesmos PLAN.md ou VERIFICATION.md simultaneamente

- **BD-02:** Escopo de proteção limitado a **artifacts de planning** (.planning/phases/XX/) — código fonte excluído -- Confidence: Confident
  - Trade-off: Código fonte poderia ser protegido também, mas git já resolve merges e conflitos
  - Why this way: Artifacts de planning não têm merge tooling — sobrescrita silenciosa é o risco real

### Mecanismo de Detecção
- **BD-03:** Identificação de sessão via **PPID do Claude Code** (parent process ID) -- Confidence: Confident
  - Trade-off: Session ID explícito (UUID via env var) seria mais robusto mas requer propagação; PID tree walk (pgrep -P) é mais complexo
  - Why this way: Claude Code é o parent de todos os agentes — PPID identifica a sessão unicamente sem infra adicional

- **BD-04:** Reação ao conflito: **blocking** (impedir segunda sessão) -- Confidence: Confident
  - Trade-off: Advisory seria consistente com padrão v1.0 (gsd-impact-guard), mas risco de trabalho duplicado é destrutivo demais para apenas avisar
  - Why this way: Primeira exceção ao padrão advisory — justificada porque o dano de duplicação é irreversível (artifacts sobrescritos)

### Lock File
- **BD-05:** Lock file em `.planning/phases/XX-name/.lock` com entrada no `.gitignore` -- Confidence: Confident
  - Trade-off: /tmp/ não poluiria o repo mas é invisível e limpa no reboot; diretório central (.planning/locks/) centraliza mas separa lock do que protege
  - Why this way: Visibilidade (vê o lock ao olhar a fase), portabilidade (não depende de OS), cleanup natural (deletar fase remove lock)

- **BD-06:** Conteúdo do lock: **PID + timestamp** -- Confidence: Confident
  - Trade-off: Poderia incluir comando/workflow e user/hostname, mas é complexidade sem benefício claro para cenário single-machine
  - Why this way: Mínimo necessário para verificação (PID) e debug (timestamp)

### Aquisição e Release
- **BD-07:** Aquisição via **hook auto-acquire** (lazy) — primeira escrita em artifacts da fase cria o lock automaticamente -- Confidence: Confident
  - Trade-off: Workflows poderiam adquirir explicitamente no início (mais previsível), mas exigiria patch em discuss-phase, plan-phase, execute-phase
  - Why this way: Zero fricção, zero patch nos workflows, funciona para qualquer operação que toque artifacts — inclusive operações futuras

- **BD-08:** Release dual: **lock.release() explícito** no caminho feliz + **PID check automático** como fallback -- Confidence: Confident
  - Trade-off: Só PID check seria mais simples mas deixa lock até próxima tentativa; só release explícito falharia em crashes
  - Why this way: Belt + suspenders — release limpo quando possível, auto-cleanup quando necessário (kill -0 verifica se PID existe)

### Implementação
- **BD-09:** Novo módulo `lock.cjs` em `get-shit-done/bin/lib/` com API (acquire/release/check) + hook PreToolUse que consome -- Confidence: Confident
  - Trade-off: Tudo no hook seria mais simples mas menos reutilizável; gsd-tools command + hook adiciona overhead de execSync
  - Why this way: Padrão consistente com core.cjs + hooks existentes — lógica no lib, hook é thin wrapper
</design_decisions>

<tradeoffs_explored>
## Trade-offs Explored

### Reação ao Conflito
| Option | Pros | Cons | Recommendation |
|--------|------|------|----------------|
| Block (impedir) | Previne dano irreversível, mensagem clara | Primeira exceção ao padrão advisory | Recommended |
| Advisory (avisar) | Consistente com v1.0, não bloqueia workflow | Não previne o problema real — duplicação | |
| Advisory + confirmação | Meio termo, usuário decide | Fricção sem necessidade — se é perigoso, bloqueia | |

### Identificação de Sessão
| Option | Pros | Cons | Recommendation |
|--------|------|------|----------------|
| PPID do Claude Code | Simples, zero infra, agentes herdam naturalmente | Depende de PPID ser estável durante sessão | Recommended |
| Session ID (UUID + env) | Mais robusto, independe de OS | Requer propagação via env var, mais complexo | |
| PID tree walk (pgrep) | Preciso, resolve qualquer hierarquia | Dependência de pgrep, lento, platform-specific | |

### Local do Lock File
| Option | Pros | Cons | Recommendation |
|--------|------|------|----------------|
| Diretório da fase | Visível, portável, cleanup natural | Precisa .gitignore | Recommended |
| /tmp do OS | Não polui repo | Invisível, limpa no reboot, path complexo | |
| Diretório central | Lista todos os locks | Separa lock do que protege | |

### Aquisição do Lock
| Option | Pros | Cons | Recommendation |
|--------|------|------|----------------|
| Hook auto-acquire (lazy) | Zero fricção, zero patch em workflows | Lock só existe após primeira escrita | Recommended |
| Workflows adquirem | Previsível, lock desde o início | Requer patch em 3+ workflows | |
| Explícito pelo usuário | Controle total | Fricção máxima, fácil esquecer | |

### Release do Lock
| Option | Pros | Cons | Recommendation |
|--------|------|------|----------------|
| Release explícito + PID check fallback | Limpo quando possível, robusto quando necessário | Dois mecanismos para manter | Recommended |
| Só PID check passivo | Mais simples | Lock fica até alguém tentar operar | |
| Só release explícito | Limpo | Falha em crashes | |
</tradeoffs_explored>

<pre_context>
## Pre-Context for discuss-phase

### Assumptions (Likely confidence)
- Lock file formato JSON com `{ "pid": number, "acquired": ISO-timestamp }`
- Hook novo dedicado (`gsd-phase-lock.js`) ou integrado no `gsd-workflow-guard.js` existente — a decidir no discuss
- `.gitignore` atualizado com `.lock` pattern em `.planning/`
- `lock.cjs` expõe: `acquire(phaseDir, pid)`, `release(phaseDir)`, `check(phaseDir, currentPid)` → returns `{ locked: bool, owner_pid, stale: bool }`
- PID check via `process.kill(pid, 0)` em Node.js (equivalente a `kill -0`)
- Mensagem de erro blocking inclui: qual fase, PID da sessão que tem o lock, timestamp de quando foi adquirido

### Open Questions
- Hook novo dedicado vs integrar no `gsd-workflow-guard.js` existente? (workflow-guard já intercepta Write/Edit)
- Como identificar o PPID correto do Claude Code? `process.ppid` no hook pode não ser o Claude Code raiz se há layers intermediárias
- Precisa de comando `/gsd:unlock-phase N` para force-unlock manual em casos edge?
- O release explícito deve ser chamado por quem — hook `PostToolUse`? Ou um cleanup handler no processo?
- Deve ter integração com `/gsd:progress` para mostrar fases com lock ativo?
</pre_context>

---

*Phase: 05-phase-lock-detect-active-sessions-to-prevent-duplicate-work*
*Brainstorm explored: 2026-04-01*
