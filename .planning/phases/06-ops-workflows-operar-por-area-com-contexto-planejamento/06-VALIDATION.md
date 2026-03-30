---
phase: 6
slug: ops-workflows-operar-por-area-com-contexto-planejamento
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-30
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.2 |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run --reporter=verbose` |
| **Full suite command** | `npx vitest run --reporter=verbose` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --reporter=verbose`
- **After every plan wave:** Run `npx vitest run --reporter=verbose`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 06-01-01 | 01 | 1 | OPS-05 | unit | `npx vitest run` | ❌ W0 | ⬜ pending |
| 06-01-02 | 01 | 1 | OPS-06 | unit | `npx vitest run` | ❌ W0 | ⬜ pending |
| 06-02-01 | 02 | 1 | OPS-07 | unit | `npx vitest run` | ❌ W0 | ⬜ pending |
| 06-02-02 | 02 | 1 | OPS-08 | unit | `npx vitest run` | ❌ W0 | ⬜ pending |
| 06-03-01 | 03 | 2 | OPS-09 | integration | `npx vitest run` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Test stubs for OPS-05 through OPS-09 covering cmd* functions
- [ ] Test fixtures for mock tree.json and registry.json data

*If none: "Existing infrastructure covers all phase requirements."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| /ops:investigate autonomous loop | OPS-05 | Requires interactive agent spawning | Run `/ops:investigate` on test area, verify diagnosis.md output |
| /ops:debug context-pack output | OPS-08 | Requires reading generated markdown | Run `/ops:debug` on test area, verify context-pack.md completeness |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
