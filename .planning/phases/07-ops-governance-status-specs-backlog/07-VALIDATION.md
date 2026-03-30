---
phase: 7
slug: ops-governance-status-specs-backlog
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-30
---

# Phase 7 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (existing in project) |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run tests/ops-governance.test.cjs` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/ops-governance.test.cjs`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 07-01-01 | 01 | 1 | OPS-10 | unit | `npx vitest run tests/ops-governance.test.cjs -t "status"` | ❌ W0 | ⬜ pending |
| 07-01-02 | 01 | 1 | OPS-11 | unit | `npx vitest run tests/ops-governance.test.cjs -t "spec"` | ❌ W0 | ⬜ pending |
| 07-01-03 | 01 | 1 | OPS-12 | unit | `npx vitest run tests/ops-governance.test.cjs -t "backlog"` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/ops-governance.test.cjs` — stubs for OPS-10, OPS-11, OPS-12
- [ ] Shared fixtures from `tests/helpers.cjs` — already exist

*Existing test infrastructure (helpers.cjs, vitest.config.ts) covers framework needs.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Terminal output formatting | OPS-10 | Visual alignment needs human eye | Run `/ops:status` and verify table renders correctly |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
