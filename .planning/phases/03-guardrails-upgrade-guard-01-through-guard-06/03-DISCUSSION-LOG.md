# Phase 3: guardrails-upgrade (GUARD-01 through GUARD-06) - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-01
**Phase:** 03-guardrails-upgrade-guard-01-through-guard-06
**Areas discussed:** GUARD-01, GUARD-02, GUARD-03, GUARD-04, GUARD-05, GUARD-06

---

## GUARD-01: Anti-false-claims

| Option | Description | Selected |
|--------|-------------|----------|
| Global CLAUDE.md expandido | Substituir a linha genérica por 4 regras específicas no CLAUDE.md global | |
| Project CLAUDE.md do GSD | Manter global genérico, detalhar no project CLAUDE.md | |
| Ambos: global + reforço nos agents | Expandir global com regras específicas E adicionar lembrete nos agent prompts | ✓ |

**User's choice:** Ambos: global + reforço nos agents
**Notes:** Defesa em camadas — regras específicas no global + lembrete nos agents (executor, verifier)

---

## GUARD-02: Tool result preservation

| Option | Description | Selected |
|--------|-------------|----------|
| Global CLAUDE.md | Regra universal: sempre anotar findings críticos na resposta | ✓ |
| Só nos agents GSD | Adicionar instrução nos agent prompts | |
| Global + agents (camadas) | Regra geral no global + instrução específica nos agents | |

**User's choice:** Global CLAUDE.md
**Notes:** Simples e universal — não precisa de reforço por agent

---

## GUARD-03: Anti-scope-creep

| Option | Description | Selected |
|--------|-------------|----------|
| Global CLAUDE.md expandido | Substituir linha genérica por regras específicas do CC | |
| Project CLAUDE.md do GSD | Manter global genérico, detalhar só no GSD | |
| Global + executor reforço | Regras específicas no global + lembrete no executor | |

**User's choice:** DIFERIDO
**Notes:** "Não tenho certeza, então nós vamos deixar de lado por enquanto. Não sei se ela é boa ou ruim nesse momento." Incerteza sobre se regras como "3 linhas > abstração prematura" conflitam com princípios DRY existentes.

---

## GUARD-04: Destructive command detection

| Option | Description | Selected |
|--------|-------------|----------|
| Advisory no hook | Detecta padrões destrutivos em Bash, emite warning mas não bloqueia | ✓ |
| Blocking no hook | Mesma detecção mas BLOQUEIA a execução | |
| Só CLAUDE.md (sem hook) | Instruções no CLAUDE.md proibindo comandos destrutivos | |

**User's choice:** Advisory no hook (Recomendado)
**Notes:** Consistente com padrão v1.0 do gsd-impact-guard (advisory)

---

## GUARD-05: Read-before-edit enforcement

| Option | Description | Selected |
|--------|-------------|----------|
| CLAUDE.md + hook advisory | Regra explícita no CLAUDE.md + gsd-impact-guard rastreia Reads | ✓ |
| Só CLAUDE.md reforçado | Expandir instrução no CLAUDE.md, sem hook | |
| Hook blocking (reject) | Hook BLOQUEIA Edit/Write se arquivo não foi lido | |

**User's choice:** CLAUDE.md + hook advisory (Recomendado)
**Notes:** Usuário perguntou como CC implementa (duas camadas: prompt + runtime FileStateCache). Após explicação, escolheu duas camadas adaptadas: CLAUDE.md (prompt) + hook advisory (runtime). Não blocking porque não temos controle do tool runtime como CC.

---

## GUARD-06: Context compaction instructions

| Option | Description | Selected |
|--------|-------------|----------|
| Críticos + global | Regra geral no CLAUDE.md global + <context_persistence> em planner, researcher, debugger | ✓ |
| Todos os agentes | Botar em todos os agents GSD | |
| Só global CLAUDE.md | Regra geral no global, sem tocar nos agents | |

**User's choice:** Críticos + global (Recomendado)
**Notes:** Usuário inicialmente pensou que o custo seria em tempo de compaction. Após esclarecimento de que o custo é zero (só texto no prompt), escolheu a opção recomendada: global + agents críticos (planner, researcher, debugger). Agents curtos (checker, auditor) ficam sem.

---

## Claude's Discretion

- Texto exato das instruções CLAUDE.md
- Ordem de implementação dos plans
- Se GUARD-04 e GUARD-05 ficam em hooks separados ou consolidados
- Regex patterns para detecção de comandos destrutivos

## Deferred Ideas

- GUARD-03 (Anti-scope-creep) — diferido por incerteza do usuário
- Verification agent adversarial (ADV-01) — fase futura
- Bash security completo (23 categorias) — escopo futuro
- Hook blocking mode — escalar quando houver dados
