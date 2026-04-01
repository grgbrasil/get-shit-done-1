---
phase: 6
slug: ops-workflows-operar-por-area-com-contexto-planejamento
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-30
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node:test + node:assert (project convention for CLI tests) |
| **Config file** | N/A (uses built-in node --test runner) |
| **Quick run command** | `node --test tests/ops-workflows.test.cjs` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `node --test tests/ops-workflows.test.cjs`
- **After every plan wave:** Run `npm test` (full suite)
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 06-01-01 | 01 | 1 | OPS-09 | unit | `node --test tests/ops-workflows.test.cjs` | W0 (this task creates it) | pending |
| 06-02-01 | 02 | 2 | OPS-05, OPS-08, OPS-09 | unit | `node --test tests/ops-workflows.test.cjs` | yes (from 06-01-01) | pending |
| 06-02-02 | 02 | 2 | OPS-05, OPS-08 | file check | `test -f commands/gsd/ops-investigate.md && test -f commands/gsd/ops-debug.md && echo PASS` | N/A (markdown files) | pending |
| 06-03-01 | 03 | 3 | OPS-06, OPS-07, OPS-09 | unit | `node --test tests/ops-workflows.test.cjs` | yes (from 06-01-01) | pending |
| 06-03-02 | 03 | 3 | OPS-06, OPS-07 | integration | `test -f commands/gsd/ops-feature.md && test -f commands/gsd/ops-modify.md && grep -q ops-summary.json get-shit-done/bin/lib/init.cjs && echo PASS` | N/A | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

Plan 01, Task 1 creates `tests/ops-workflows.test.cjs` as part of its TDD execution — this serves as Wave 0 test infrastructure for all subsequent plans.

*Existing infrastructure (tests/helpers.cjs with runGsdTools, createTempProject) covers test utility needs.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| /ops:investigate autonomous agent loop | OPS-05 | Requires interactive agent spawning beyond CLI | Run `/ops:investigate` on a test area with real codebase, verify diagnosis.md output |
| /ops:debug context-pack composability with /gsd:debug | OPS-08 | Requires reading generated markdown quality | Run `/ops:debug` on test area, verify context-pack.md has all 4 sections, then chain to `/gsd:debug` |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (Plan 01 Task 1 creates test file)
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
