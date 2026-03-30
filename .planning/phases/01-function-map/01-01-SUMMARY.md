---
phase: 01-function-map
plan: 01
subsystem: cli
tags: [function-map, json, crud, model-profiles, gsd-tools]

# Dependency graph
requires: []
provides:
  - "fmap.cjs CRUD module for .planning/function-map.json"
  - "gsd-tools fmap get/update/stats/full-scan CLI commands"
  - "gsd-cataloger model profile (haiku on all profiles)"
affects: [01-02, cataloger-agent, impact-analysis]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "fmap.cjs follows same lib module pattern as state.cjs (require core.cjs, export cmd* functions)"
    - "Key normalization: strip ./ prefix, use POSIX slashes"
    - "--replace-file flag for file-level atomic updates"

key-files:
  created:
    - get-shit-done/bin/lib/fmap.cjs
    - tests/fmap.test.cjs
  modified:
    - get-shit-done/bin/gsd-tools.cjs
    - get-shit-done/bin/lib/model-profiles.cjs
    - tests/model-profiles.test.cjs

key-decisions:
  - "Used node:test + node:assert for tests (matching project convention, not vitest)"
  - "Key normalization happens on both read (get) and write (update) paths for consistency"

patterns-established:
  - "fmap CLI pattern: gsd-tools fmap <subcommand> routes to fmap.cjs cmd* functions"
  - "Function Map keys: file::Class::method with POSIX slashes, no ./ prefix"

requirements-completed: [FMAP-01, FMAP-02, FMAP-06, FMAP-07]

# Metrics
duration: 5min
completed: 2026-03-30
---

# Phase 01 Plan 01: Function Map CRUD Summary

**Flat JSON function map with O(1) key lookup, merge/replace-file update, stats aggregation, and gsd-cataloger haiku profile**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-30T02:24:00Z
- **Completed:** 2026-03-30T02:29:17Z
- **Tasks:** 1 (TDD: RED + GREEN)
- **Files modified:** 5

## Accomplishments
- Created fmap.cjs module with full CRUD: get (single key or full map), update (merge + replace-file), stats (total/by_kind/path), full-scan (trigger signal)
- Registered fmap case in gsd-tools.cjs dispatcher with 4 subcommands
- Added gsd-cataloger to MODEL_PROFILES with haiku on all profiles (quality/balanced/budget)
- 24 tests passing (10 fmap + 14 model-profiles)

## Task Commits

Each task was committed atomically:

1. **Task 1 RED: Failing tests** - `0d8e105` (test)
2. **Task 1 GREEN: Implementation** - `ffe08d7` (feat)

_TDD task: RED (failing tests) then GREEN (implementation)_

## Files Created/Modified
- `get-shit-done/bin/lib/fmap.cjs` - Function Map CRUD module (cmdFmapGet, cmdFmapUpdate, cmdFmapStats, cmdFmapFullScan)
- `get-shit-done/bin/gsd-tools.cjs` - Added fmap case to dispatcher + require
- `get-shit-done/bin/lib/model-profiles.cjs` - Added gsd-cataloger entry
- `tests/fmap.test.cjs` - 10 tests covering get/update/stats/full-scan/key-normalization
- `tests/model-profiles.test.cjs` - Extended with gsd-cataloger assertion + exemption in haiku quality check

## Decisions Made
- Used node:test + node:assert instead of vitest (matching project convention -- run-tests.cjs uses node --test)
- Key normalization applied on both read and write paths for consistency
- --replace-file uses prefix matching (file + '::') to remove all entries for a file before merging

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Adapted test framework from vitest to node:test**
- **Found during:** Task 1 RED (test writing)
- **Issue:** Plan specified vitest imports but project uses node:test + node:assert (run-tests.cjs runs node --test)
- **Fix:** Rewrote all tests using node:test describe/test and node:assert
- **Files modified:** tests/fmap.test.cjs
- **Verification:** node --test tests/fmap.test.cjs passes
- **Committed in:** 0d8e105

**2. [Rule 1 - Bug] Fixed conflicting "quality never uses haiku" assertion in model-profiles.test.cjs**
- **Found during:** Task 1 GREEN (adding gsd-cataloger)
- **Issue:** Parallel agent created model-profiles.test.cjs with assertion that quality profile never uses haiku -- but gsd-cataloger is haiku on all profiles per FMAP-07
- **Fix:** Added exemptions list for gsd-cataloger in the quality check assertion
- **Files modified:** tests/model-profiles.test.cjs
- **Verification:** All 14 model-profiles tests pass
- **Committed in:** 0d8e105

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug)
**Impact on plan:** Both auto-fixes necessary for correctness. No scope creep.

## Issues Encountered
None -- implementation followed plan specification closely.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- fmap CRUD layer is complete and ready for Plan 02 (cataloger agent)
- function-map.json schema is established (D-08 fields)
- gsd-cataloger model profile is registered

## Known Stubs
None -- all functionality is fully wired.

## Self-Check: PASSED

- All 4 key files exist on disk
- Both commit hashes (0d8e105, ffe08d7) found in git log
- fmap.cjs exports correct functions
- gsd-tools.cjs contains fmap case
- model-profiles.cjs contains gsd-cataloger

---
*Phase: 01-function-map*
*Completed: 2026-03-30*
