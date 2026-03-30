---
phase: 2
slug: impact-analysis
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-30
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node:test + node:assert (main project) |
| **Config file** | none — uses node built-in test runner |
| **Quick run command** | `node --test tests/fmap.test.cjs tests/impact-analysis.test.cjs` |
| **Full suite command** | `node --test tests/*.test.cjs` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `node --test tests/fmap.test.cjs tests/impact-analysis.test.cjs`
- **After every plan wave:** Run `node --test tests/*.test.cjs`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 02-01-01 | 01 | 0 | IMPACT-01 | unit | `node --test tests/impact-analysis.test.cjs` | ❌ W0 | ⬜ pending |
| 02-01-02 | 01 | 0 | IMPACT-02 | unit | `node --test tests/impact-analysis.test.cjs` | ❌ W0 | ⬜ pending |
| 02-01-03 | 01 | 0 | IMPACT-03 | unit | `node --test tests/impact-analysis.test.cjs` | ❌ W0 | ⬜ pending |
| 02-01-04 | 01 | 0 | IMPACT-05 | unit | `node --test tests/impact-analysis.test.cjs` | ❌ W0 | ⬜ pending |
| 02-02-01 | 02 | 1 | IMPACT-04 | manual | Executor agent prompt review | N/A | ⬜ pending |
| 02-02-02 | 02 | 1 | IMPACT-06 | unit | `node --test tests/fmap.test.cjs` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/impact-analysis.test.cjs` — stubs for IMPACT-01, IMPACT-02, IMPACT-03, IMPACT-05 (fmap impact subcommand, callers array, config thresholds, cascade depth)
- [ ] Test for hook script output format (gsd-impact-guard.js produces valid JSON with hookSpecificOutput)

*Existing `tests/fmap.test.cjs` covers IMPACT-06 (fmap update preserves entries).*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Impact card schema in checkpoint:decision output | IMPACT-04 | Prompt-based executor behavior — requires agent execution | 1. Run executor on a function with behavioral change 2. Verify checkpoint output shows: Function, Callers affected, Old behavior, New behavior, Options |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
