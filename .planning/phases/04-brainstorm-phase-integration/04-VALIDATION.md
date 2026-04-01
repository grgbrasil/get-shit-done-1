---
phase: 04
slug: brainstorm-phase-integration
status: active
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-01
---

# Phase 04 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | vitest.config.ts |
| **Quick run command** | `npm test` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 01-T1 | 04-01 | 1 | BRAIN-01, BRAIN-02, BRAIN-04 | file-check | `grep -q "BRAIN-01" .planning/REQUIREMENTS.md && grep -q "gsd:brainstorm-phase" commands/gsd/brainstorm-phase.md && grep -q "design_decisions" get-shit-done/templates/brainstorm.md && echo PASS \|\| echo FAIL` | Yes | pending |
| 01-T2 | 04-01 | 1 | BRAIN-01, BRAIN-04 | file-check | `grep -c 'step name=' get-shit-done/workflows/brainstorm-phase.md \| grep -q "10" && grep -q "explore_domain" get-shit-done/workflows/brainstorm-phase.md && echo PASS \|\| echo FAIL` | Yes | pending |
| 02-T1 | 04-02 | 1 | BRAIN-02 | unit + syntax | `grep -q "hasBrainstorm" get-shit-done/bin/lib/core.cjs && node -e "require('./get-shit-done/bin/lib/core.cjs'); console.log('OK')" && echo PASS \|\| echo FAIL` | Yes | pending |
| 02-T2 | 04-02 | 1 | BRAIN-03 | file-check | `grep -q "BRAINSTORM.md" get-shit-done/workflows/discuss-phase.md && grep -q "BRAINSTORM.md" get-shit-done/workflows/discuss-phase-assumptions.md && grep -q "brainstorm-phase" get-shit-done/workflows/do.md && echo PASS \|\| echo FAIL` | Yes | pending |

*Status: all tasks mapped with automated verify commands*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements — this phase is markdown + minimal JS edits. No new test scaffolds needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `/gsd:brainstorm-phase 3` runs interactive Q&A | BRAIN-01 | Requires interactive session | Run command, verify questions appear one at a time |
| discuss-phase reads BRAINSTORM.md as prior context | BRAIN-03 | Requires cross-command integration test | Run brainstorm then discuss, verify decisions carry over |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 10s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** ready
