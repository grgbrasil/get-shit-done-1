---
phase: 4
slug: pre-flight-dependency-resolver-for-phase-commands
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-30
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node:test + node:assert (project convention) |
| **Config file** | none -- node:test is built-in |
| **Quick run command** | `node --test get-shit-done/bin/lib/preflight.test.cjs` |
| **Full suite command** | `node --test get-shit-done/bin/lib/*.test.cjs` |
| **Estimated runtime** | ~2 seconds |

---

## Sampling Rate

- **After every task commit:** Run `node --test get-shit-done/bin/lib/preflight.test.cjs`
- **After every plan wave:** Run `node --test get-shit-done/bin/lib/*.test.cjs`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 2 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 04-01-01 | 01 | 0 | PF-01..PF-07 | unit | `node --test get-shit-done/bin/lib/preflight.test.cjs` | ❌ W0 | ⬜ pending |
| 04-01-02 | 01 | 1 | PF-01 | unit | same | ❌ W0 | ⬜ pending |
| 04-01-03 | 01 | 1 | PF-02, PF-06 | unit | same | ❌ W0 | ⬜ pending |
| 04-01-04 | 01 | 1 | PF-03, PF-07 | unit | same | ❌ W0 | ⬜ pending |
| 04-01-05 | 01 | 1 | PF-04, PF-05 | unit | same | ❌ W0 | ⬜ pending |
| 04-02-01 | 02 | 2 | PF-01..PF-07 | integration | `node --test get-shit-done/bin/lib/preflight.test.cjs` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `get-shit-done/bin/lib/preflight.test.cjs` -- stubs for PF-01 through PF-07
- [ ] Test helpers for creating temp planning directories with specific artifact combinations

*Existing infrastructure (node:test, node:assert) covers framework needs.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Redirect output formatting | PF-05 | Visual display quality | Run `gsd-tools preflight plan-phase 4` with missing CONTEXT.md, verify human-readable output |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 2s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
