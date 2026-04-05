---
status: resolved
trigger: "BUG-001: preflight dependency check uses ROADMAP checkbox instead of disk artifacts"
created: 2026-04-05T00:00:00Z
updated: 2026-04-05T12:00:00Z
---

## Current Focus

hypothesis: checkDependencies() at line 297-299 uses regex `- [x]` on ROADMAP instead of disk artifact check (plans > 0 && summaries >= plans)
test: Read the code, confirm the regex pattern, replace with disk-based check
expecting: After fix, phase completion detected by disk artifacts with ROADMAP fallback
next_action: Implement fix in checkDependencies()

## Symptoms

expected: preflight should detect phase completion by checking disk artifacts (plan files with corresponding summary files) -- same method as state.cjs
actual: preflight uses regex `- [x]` checkbox pattern on ROADMAP.md, which fails when phases use checkmark or other markers
errors: False blockers -- preflight reports dependency as incomplete when it's actually complete
reproduction: Complete a phase (all plans have summaries), mark with checkmark in title but without `- [x]` checkbox, run preflight on dependent phase -- incorrectly blocked
started: Known bug, documented in get-shit-done/BUGS.md

## Eliminated

(none yet)

## Evidence

- timestamp: 2026-04-05T00:00:00Z
  checked: preflight.cjs lines 268-313 (checkDependencies function)
  found: Line 297 uses `checkboxPattern = new RegExp('-\\s*\\[(x| )\\]\\s*.*Phase\\s+${escaped}[:\\s]', 'i')` to detect completion
  implication: Only matches `- [x]` markdown checkboxes, misses other completion markers

- timestamp: 2026-04-05T00:00:00Z
  checked: state.cjs line 695 (disk-based completion)
  found: Uses `plans > 0 && summaries >= plans` counting PLAN.md and SUMMARY.md files in phase dir
  implication: This is the ground truth method -- preflight should use the same

- timestamp: 2026-04-05T00:00:00Z
  checked: core.cjs getPhaseFileStats() function (already imported in preflight.cjs)
  found: Returns { plans: [], summaries: [], ... } from phase directory
  implication: Can reuse this function directly -- already imported

- timestamp: 2026-04-05T00:00:00Z
  checked: core.cjs findPhaseInternal() (already imported in preflight.cjs)
  found: Resolves phase number to directory path, returns { directory, ... }
  implication: Can use to find dependency phase directories by number

## Resolution

root_cause: checkDependencies() uses ROADMAP checkbox regex (`- [x]`) to determine phase completion instead of disk artifacts (plan/summary file counts). ROADMAP checkboxes are presentation artifacts, not source of truth.
fix: Replace checkbox regex with disk-based check using findPhaseInternal + getPhaseFileStats. Fallback to ROADMAP checkbox only if phase directory doesn't exist.
verification: Functional tests pass -- (1) complete phase on disk without [x] checkbox returns ready:true, (2) incomplete phase on disk correctly blocks, (3) fallback to ROADMAP checkbox works when phase dir missing. Pre-existing test failures (type name mismatches) unrelated to this change.
files_changed: [get-shit-done/bin/lib/preflight.cjs]
