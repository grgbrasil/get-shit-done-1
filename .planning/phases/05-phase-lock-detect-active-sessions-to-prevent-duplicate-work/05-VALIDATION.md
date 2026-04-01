---
phase: 5
slug: phase-lock-detect-active-sessions-to-prevent-duplicate-work
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-01
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.2 (existing) |
| **Config file** | vitest.config.ts |
| **Quick run command** | `npx vitest run tests/lock.test.cjs --reporter=verbose` |
| **Full suite command** | `npx vitest run tests/ --reporter=verbose` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/lock.test.cjs --reporter=verbose`
- **After every plan wave:** Run `npx vitest run tests/ --reporter=verbose`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 05-01-01 | 01 | 1 | lock.cjs module | unit | `npx vitest run tests/lock.test.cjs` | ❌ W0 | ⬜ pending |
| 05-02-01 | 02 | 1 | gsd-phase-lock.js hook | unit | `npx vitest run tests/phase-lock-hook.test.cjs` | ❌ W0 | ⬜ pending |
| 05-03-01 | 03 | 2 | gsd-tools dispatch | integration | `npx vitest run tests/lock.test.cjs` | ❌ W0 | ⬜ pending |
| 05-04-01 | 04 | 2 | unlock command | integration | `npx vitest run tests/lock.test.cjs` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/lock.test.cjs` — stubs for lock.cjs acquire/release/check/force-unlock
- [ ] `tests/phase-lock-hook.test.cjs` — stubs for hook stdin/stdout behavior

*Existing test infrastructure (vitest.config.ts) covers framework needs.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Two Claude Code sessions blocking | D-04 blocking | Requires two live terminal sessions | Open 2 terminals, run /gsd:plan-phase 5 in both, verify second is blocked |
| PPID consistency across subagents | D-03 session identity | Requires live Claude Code runtime | Run /gsd:execute-phase, verify hook sees same PPID in parent and subagent |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
