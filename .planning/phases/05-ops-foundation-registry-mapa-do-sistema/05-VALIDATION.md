---
phase: 5
slug: ops-foundation-registry-mapa-do-sistema
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-30
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node:test (built-in, Node 20+) |
| **Config file** | none — uses built-in runner |
| **Quick run command** | `node --test tests/ops.test.cjs` |
| **Full suite command** | `node --test tests/*.test.cjs` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `node --test tests/ops.test.cjs`
- **After every plan wave:** Run `node --test tests/*.test.cjs`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 05-01-01 | 01 | 1 | OPS-01 | unit | `node --test tests/ops.test.cjs --test-name-pattern "ops init"` | ❌ W0 | ⬜ pending |
| 05-01-02 | 01 | 1 | OPS-01 | unit | `node --test tests/ops.test.cjs --test-name-pattern "route detection"` | ❌ W0 | ⬜ pending |
| 05-01-03 | 01 | 1 | OPS-01 | unit | `node --test tests/ops.test.cjs --test-name-pattern "directory detection"` | ❌ W0 | ⬜ pending |
| 05-02-01 | 02 | 1 | OPS-02 | unit | `node --test tests/ops.test.cjs --test-name-pattern "ops map"` | ❌ W0 | ⬜ pending |
| 05-02-02 | 02 | 1 | OPS-02 | unit | `node --test tests/ops.test.cjs --test-name-pattern "tree schema"` | ❌ W0 | ⬜ pending |
| 05-03-01 | 03 | 1 | OPS-03 | unit | `node --test tests/ops.test.cjs --test-name-pattern "ops add"` | ❌ W0 | ⬜ pending |
| 05-04-01 | 04 | 1 | OPS-04 | unit | `node --test tests/ops.test.cjs --test-name-pattern "area persistence"` | ❌ W0 | ⬜ pending |
| 05-ALL | ALL | 1 | ALL | unit | `node --test tests/ops.test.cjs --test-name-pattern "dispatcher"` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/ops.test.cjs` — stubs for OPS-01 through OPS-04
- [ ] No framework install needed (node:test is built-in)

*Existing infrastructure covers test runner needs.*

---

## Manual-Only Verifications

*All phase behaviors have automated verification.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
