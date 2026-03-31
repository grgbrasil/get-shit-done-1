---
status: awaiting_human_verify
trigger: "gsd-tools phase add generates phase 1000 because backlog items use numbering 999.x"
created: 2026-03-30T00:00:00Z
updated: 2026-03-30T13:24:00Z
---

## Current Focus

hypothesis: CONFIRMED - cmdPhaseAdd regex matches 999.x backlog phases and includes them in maxPhase calculation
test: created test project with phases 1-3 and backlog 999.1/999.2, ran phase add
expecting: phase 4 (not 1000)
next_action: awaiting human verification

## Symptoms

expected: phase add should create the next sequential phase after the highest real phase (e.g., phase 5 if phases 1-4 exist)
actual: It creates phase 1000 because it sees backlog items numbered 999.x and adds 1
errors: No error - it just picks the wrong number
reproduction: Have backlog items with phase 999.x in ROADMAP.md, then run gsd-tools phase add
started: Since backlog convention was introduced

## Eliminated

## Evidence

- timestamp: 2026-03-30T13:22:00Z
  checked: get-shit-done/bin/lib/phase.cjs cmdPhaseAdd function (lines 311-379)
  found: Line 336 regex `/#{2,4}\s*Phase\s+(\d+)[A-Z]?(?:\.\d+)*:/gi` captures the integer part of ALL phase numbers including 999.x. Lines 337-342 compute maxPhase without filtering, so 999 becomes the max and newPhaseId = 1000.
  implication: Single-point root cause confirmed. The fix is a one-line guard: skip nums >= 999.

- timestamp: 2026-03-30T13:23:00Z
  checked: Test with phases 1-3 + backlog 999.1/999.2
  found: After fix, `phase add` returns phase 4 (correct). Second add returns phase 5 (correct).
  implication: Fix works correctly.

- timestamp: 2026-03-30T13:24:00Z
  checked: Full test suite (npm test)
  found: 1527 pass, 1 fail. The single failure is in copilot-install.test.cjs (pre-existing, unrelated).
  implication: No regressions introduced.

## Resolution

root_cause: cmdPhaseAdd in phase.cjs calculates next phase number by finding the max integer from all phase headings in ROADMAP.md. The regex matches 999.x backlog phases, so maxPhase=999 and newPhaseId=1000.
fix: Added `if (num >= 999) continue;` guard inside the while loop that scans phase numbers, so backlog phases are excluded from the max calculation.
verification: Test project with phases 1-3 and backlog 999.1/999.2 correctly produces phase 4 and 5. Full test suite passes (1527/1528, 1 pre-existing unrelated failure).
files_changed: [get-shit-done/bin/lib/phase.cjs]
