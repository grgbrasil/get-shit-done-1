---
phase: 3
slug: guardrails-upgrade-guard-01-through-guard-06
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-01
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node:test (CJS) / Vitest 4.1.2 (SDK) |
| **Config file** | direct `node --test` for CJS hooks |
| **Quick run command** | `node --test tests/destructive-guard.test.cjs tests/read-before-edit-guard.test.cjs` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `node --test tests/destructive-guard.test.cjs tests/read-before-edit-guard.test.cjs`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 03-01-01 | 01 | 1 | GUARD-01 | manual | N/A (text in CLAUDE.md) | N/A | ⬜ pending |
| 03-01-02 | 01 | 1 | GUARD-02 | manual | N/A (text in CLAUDE.md) | N/A | ⬜ pending |
| 03-01-03 | 01 | 1 | GUARD-05 | manual | N/A (text in CLAUDE.md) | N/A | ⬜ pending |
| 03-01-04 | 01 | 1 | GUARD-06 | manual | N/A (text in CLAUDE.md) | N/A | ⬜ pending |
| 03-02-01 | 02 | 1 | GUARD-04 | unit | `node --test tests/destructive-guard.test.cjs` | ❌ W0 | ⬜ pending |
| 03-02-02 | 02 | 1 | GUARD-05 | unit | `node --test tests/read-before-edit-guard.test.cjs` | ❌ W0 | ⬜ pending |
| 03-03-01 | 03 | 1 | GUARD-01 | unit (grep) | `node --test tests/agent-context-persistence.test.cjs` | ❌ W0 | ⬜ pending |
| 03-03-02 | 03 | 1 | GUARD-06 | unit (grep) | `node --test tests/agent-context-persistence.test.cjs` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/destructive-guard.test.cjs` — unit tests for GUARD-04 regex patterns against known destructive commands
- [ ] `tests/read-before-edit-guard.test.cjs` — unit tests for GUARD-05 hook advisory trigger conditions
- [ ] `tests/agent-context-persistence.test.cjs` — verify planner/researcher/debugger agents contain `<context_persistence>` blocks

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Anti-false-claims text in CLAUDE.md | GUARD-01 | Text content in markdown file | grep for "Nunca diga.*todos os testes passam" in CLAUDE.md |
| Tool result preservation text | GUARD-02 | Text content in markdown file | grep for "tool result\|resultado de ferramentas" in CLAUDE.md |
| Read-before-edit rule text | GUARD-05 | Text content in markdown file | grep for "read.*before.*edit\|leia.*antes.*editar" in CLAUDE.md |
| Compaction instructions text | GUARD-06 | Text content in markdown file | grep for "compaction\|context_persistence" in CLAUDE.md |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
