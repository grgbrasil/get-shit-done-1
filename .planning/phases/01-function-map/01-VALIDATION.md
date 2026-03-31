---
phase: 1
slug: function-map
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-29
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.2 (main) / 3.1.1 (SDK) |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run --reporter=verbose` |
| **Full suite command** | `npx vitest run --reporter=verbose` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --reporter=verbose`
- **After every plan wave:** Run `npx vitest run --reporter=verbose`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 01-01-01 | 01 | 1 | FMAP-01 | unit | `npx vitest run tests/fmap` | ❌ W0 | ⬜ pending |
| 01-01-02 | 01 | 1 | FMAP-02 | unit | `npx vitest run tests/fmap` | ❌ W0 | ⬜ pending |
| 01-02-01 | 02 | 1 | FMAP-03 | unit | `npx vitest run tests/fmap` | ❌ W0 | ⬜ pending |
| 01-02-02 | 02 | 1 | FMAP-04 | unit | `npx vitest run tests/fmap` | ❌ W0 | ⬜ pending |
| 01-02-03 | 02 | 1 | FMAP-05 | integration | `npx vitest run tests/fmap` | ❌ W0 | ⬜ pending |
| 01-03-01 | 03 | 2 | FMAP-06 | unit | `npx vitest run tests/fmap` | ❌ W0 | ⬜ pending |
| 01-03-02 | 03 | 2 | FMAP-07 | integration | `npx vitest run tests/fmap` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/fmap/fmap-schema.test.cjs` — stubs for FMAP-01, FMAP-02 (JSON structure, O(1) lookup)
- [ ] `tests/fmap/fmap-providers.test.cjs` — stubs for FMAP-03 (Serena + grep fallback)
- [ ] `tests/fmap/fmap-integration.test.cjs` — stubs for FMAP-04, FMAP-05 (refresh, incremental update)
- [ ] `tests/fmap/fmap-agent.test.cjs` — stubs for FMAP-06, FMAP-07 (cataloger agent, cheap model)

*Existing vitest infrastructure covers framework needs.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Serena MCP probe response | FMAP-03 | Requires live MCP connection | Run cataloger agent with Serena active, verify it detects and uses Serena |
| Cataloger on cheap model | FMAP-07 | Requires agent runtime | Run cataloger agent, verify model profile in logs |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
