---
phase: 3
slug: model-routing-integration
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-30
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.2 (main) / vitest 3.1.1 (SDK) |
| **Config file** | `vitest.config.ts` (root) / `sdk/vitest.config.ts` |
| **Quick run command** | `npx vitest run --reporter=verbose` |
| **Full suite command** | `npx vitest run && cd sdk && npx vitest run` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --reporter=verbose`
- **After every plan wave:** Run `npx vitest run && cd sdk && npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 03-01-01 | 01 | 1 | MODEL-01 | unit | `npx vitest run model-profiles` | ✅ | ⬜ pending |
| 03-01-02 | 01 | 1 | MODEL-02 | unit | `npx vitest run model-profiles` | ✅ | ⬜ pending |
| 03-01-03 | 01 | 1 | MODEL-03 | unit | `npx vitest run model-profiles` | ❌ W0 | ⬜ pending |
| 03-01-04 | 01 | 1 | MODEL-04 | unit | `npx vitest run model-profiles` | ❌ W0 | ⬜ pending |
| 03-02-01 | 02 | 2 | INT-01 | integration | `npx vitest run context-engine` | ❌ W0 | ⬜ pending |
| 03-02-02 | 02 | 2 | INT-02 | integration | `npx vitest run execute-phase` | ❌ W0 | ⬜ pending |
| 03-02-03 | 02 | 2 | INT-03 | integration | `npx vitest run execute-phase` | ❌ W0 | ⬜ pending |
| 03-02-04 | 02 | 2 | INT-04 | integration | `npx vitest run execute-phase` | ❌ W0 | ⬜ pending |
| 03-02-05 | 02 | 2 | INT-05 | unit | `npx vitest run new-project` | ❌ W0 | ⬜ pending |
| 03-02-06 | 02 | 2 | FMAP-08 | unit | `npx vitest run fmap-stats` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/model-routing.test.cjs` — stubs for MODEL-01..04 (provider resolution, override merging, defaults)
- [ ] `tests/integration-wiring.test.cjs` — stubs for INT-01..05, FMAP-08 (context injection, impact step, wave locking, opt-in)
- [ ] Existing vitest infrastructure covers framework needs — no new install required

*Existing infrastructure partially covers; stubs needed for new domain areas.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| OpenRouter provider works end-to-end | MODEL-03 | Requires external API key and live API call | Configure OpenRouter key in env, run cataloger agent, verify response |
| GSD workflows unchanged when guardrails off | INT-04 | Full workflow integration too complex for unit test | Run `/gsd:execute-phase` on a test project without guardrails, verify identical behavior |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
