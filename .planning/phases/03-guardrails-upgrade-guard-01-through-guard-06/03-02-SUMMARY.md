---
phase: 03-guardrails-upgrade-guard-01-through-guard-06
plan: 02
subsystem: hooks
tags: [pretooluse, guardrails, destructive-detection, read-before-edit, advisory-hooks]

requires:
  - phase: none
    provides: existing hook architecture (gsd-workflow-guard.js, gsd-impact-guard.js)
provides:
  - GUARD-04 destructive command detection in gsd-workflow-guard.js (14 patterns, Bash PreToolUse)
  - GUARD-05 read-before-edit advisory in gsd-impact-guard.js (combined message)
  - gsd-impact-guard.js added to build-hooks.js HOOKS_TO_COPY
  - gsd-workflow-guard.js registered in installer with Bash matcher
affects: [execute-phase, hook-registration, build-pipeline]

tech-stack:
  added: []
  patterns:
    - "DESTRUCTIVE_PATTERNS array with pattern/warn/alt fields for regex-based command detection"
    - "Combined advisory message (READ-BEFORE-EDIT + IMPACT ANALYSIS) in single hook output"

key-files:
  created:
    - tests/destructive-guard.test.cjs
    - tests/read-before-edit-guard.test.cjs
  modified:
    - hooks/gsd-workflow-guard.js
    - hooks/gsd-impact-guard.js
    - scripts/build-hooks.js
    - bin/install.js

key-decisions:
  - "Kept GUARD-04 in gsd-workflow-guard.js (guard against dangerous operations) with separate Bash matcher registration"
  - "Removed fmapPath existence check from gsd-impact-guard.js -- advisory fires without function map"
  - "Combined READ-BEFORE-EDIT + IMPACT ANALYSIS in single message per plan specification"

patterns-established:
  - "DESTRUCTIVE_PATTERNS: array of {pattern, warn, alt} for regex-based command detection with safe alternatives"
  - "Hook registration with specific tool matcher (Bash vs Write|Edit) for targeted PreToolUse filtering"

requirements-completed: [GUARD-04, GUARD-05]

duration: 3min
completed: 2026-04-01
---

# Phase 03 Plan 02: Runtime Guardrail Hooks Summary

**Destructive command detection (14 patterns) in gsd-workflow-guard.js + read-before-edit advisory in gsd-impact-guard.js, with build pipeline and installer registration fixes**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-01T18:56:09Z
- **Completed:** 2026-04-01T18:59:27Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- gsd-workflow-guard.js detects 14 destructive patterns (git reset --hard, push --force, rm -rf, DROP TABLE, etc.) with advisory warnings and safe alternatives
- gsd-impact-guard.js emits combined READ-BEFORE-EDIT + IMPACT ANALYSIS advisory on all code file edits
- Fixed registration gap: gsd-workflow-guard.js now registered in installer with Bash matcher
- Fixed build gap: gsd-impact-guard.js now in build-hooks.js HOOKS_TO_COPY
- 36 unit tests covering all patterns, edge cases, and bypass conditions

## Task Commits

Each task was committed atomically (TDD RED/GREEN):

1. **Task 1: GUARD-04 destructive command detection** - `3f66946` (test/RED), `4983188` (feat/GREEN)
2. **Task 2: GUARD-05 read-before-edit advisory** - `7a8a2c8` (test/RED), `af225d0` (feat/GREEN)

## Files Created/Modified

- `hooks/gsd-workflow-guard.js` - Added DESTRUCTIVE_PATTERNS array (14 patterns) and Bash handling block before existing Write/Edit guard
- `hooks/gsd-impact-guard.js` - Replaced impact-only message with combined READ-BEFORE-EDIT + IMPACT ANALYSIS advisory, removed fmapPath check
- `scripts/build-hooks.js` - Added gsd-impact-guard.js to HOOKS_TO_COPY array
- `bin/install.js` - Added gsd-workflow-guard.js registration with Bash matcher
- `tests/destructive-guard.test.cjs` - 22 unit tests for GUARD-04 patterns
- `tests/read-before-edit-guard.test.cjs` - 14 unit tests for GUARD-05 advisory

## Decisions Made

- Kept GUARD-04 in gsd-workflow-guard.js with separate Bash matcher registration (not a new hook file)
- Removed fmapPath existence check -- read-before-edit advisory should fire even without function map
- Combined READ-BEFORE-EDIT + IMPACT ANALYSIS in single message as specified in plan

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Both runtime hooks are complete and tested
- Build pipeline copies all hooks including impact-guard
- Installer registers workflow-guard for Bash tool calls
- Ready for Plan 03 (agent prompt reinforcement)

## Phase Handoff Summary

1. **Primary Request:** Implement runtime guardrail hooks for destructive command detection (GUARD-04) and read-before-edit advisory (GUARD-05)
2. **Key Technical Concepts:** PreToolUse hooks (CommonJS), advisory pattern (warn never block), regex-based command matching with DESTRUCTIVE_PATTERNS array, combined hook messages
3. **Files and Code Sections:** `hooks/gsd-workflow-guard.js` (DESTRUCTIVE_PATTERNS + Bash block at top, existing Write/Edit guard preserved below), `hooks/gsd-impact-guard.js` (combined READ-BEFORE-EDIT + IMPACT ANALYSIS message), `scripts/build-hooks.js` (HOOKS_TO_COPY), `bin/install.js` (hook registration ~line 4590)
4. **Errors and Fixes:** None -- all TDD cycles passed on first attempt
5. **Problem Solving:** Kept GUARD-04 in workflow-guard (not new file) since it's the "guard against dangerous operations" hook, just with different matcher registration
6. **User Decisions:** None required
7. **Pending Tasks:** None
8. **Current State:** Both hooks functional, 36 tests passing, build pipeline validated, installer registers both hooks
9. **Next Step:** Plan 03 adds agent prompt reinforcement (GUARD-01 anti-false-claims, GUARD-06 context_persistence in planner/researcher/debugger)

## Self-Check: PASSED

All 6 files verified on disk. All 4 commit hashes found in git log.

---
*Phase: 03-guardrails-upgrade-guard-01-through-guard-06*
*Completed: 2026-04-01*
