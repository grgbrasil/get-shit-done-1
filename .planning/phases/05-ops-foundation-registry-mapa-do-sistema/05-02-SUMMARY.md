---
phase: 05-ops-foundation-registry-mapa-do-sistema
plan: 02
subsystem: ops
tags: [ops, dependency-graph, adjacency-list, tree-json, skill-commands]

requires:
  - phase: 05-ops-foundation-registry-mapa-do-sistema
    provides: ops.cjs lib module with registry CRUD, area detection, gsd-tools ops dispatcher
provides:
  - cmdOpsMap implementation with full adjacency list graph builder
  - tree.json output per D-10 through D-14 schema (nodes + edges)
  - Skill command files for /ops:init, /ops:map, /ops:add
affects: [06-ops-workflows, 07-ops-governance]

tech-stack:
  added: []
  patterns: [import scanning (ES6/CJS/PHP) for dependency discovery, path-based file type classification, recursive import following with depth limit]

key-files:
  created:
    - commands/gsd/ops-init.md
    - commands/gsd/ops-map.md
    - commands/gsd/ops-add.md
  modified:
    - get-shit-done/bin/lib/ops.cjs
    - tests/ops.test.cjs

key-decisions:
  - "followImports used for directory and manual areas to discover cross-directory dependencies (not just path matching)"
  - "Import scanning covers ES6, CommonJS, and PHP use statements for multi-stack support"
  - "Max depth 3 for recursive import following to prevent explosion on large codebases"

patterns-established:
  - "Tree.json schema: flat adjacency list with typed nodes and typed edges per D-10/D-14"
  - "Import scanning: regex-based extraction + relative path resolution against project file set"

requirements-completed: [OPS-02]

duration: 3min
completed: 2026-03-30
---

# Phase 5 Plan 2: OPS Map and Skill Commands Summary

**cmdOpsMap builds per-area dependency graphs (typed nodes + edges adjacency list in tree.json) with multi-language import scanning and three /ops:* skill commands**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-30T15:24:53Z
- **Completed:** 2026-03-30T15:27:48Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Replaced cmdOpsMap stub with full implementation that builds adjacency list graph from area files
- Added 8 internal helpers: writeTreeJson, readTreeJson, buildNodeId, scanImports, classifyFileType, extractNodeName, inferEdgeType, followImports
- Import scanning supports ES6 imports, CommonJS require, and PHP use statements
- Created three skill command markdown files (/ops:init, /ops:map, /ops:add) delegating to gsd-tools
- 6 new tests for ops map, all 23 tests pass

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement cmdOpsMap with adjacency list graph builder** - `26950a3` (feat)
2. **Task 2: Create skill command markdown files** - `d33a246` (feat)

## Files Created/Modified
- `get-shit-done/bin/lib/ops.cjs` - Added 8 graph-building helpers and full cmdOpsMap implementation replacing stub
- `tests/ops.test.cjs` - 6 new test cases for ops map (tree output, schema validation, dir creation, registry update, error cases)
- `commands/gsd/ops-init.md` - Skill command for /ops:init delegating to gsd-tools ops init
- `commands/gsd/ops-map.md` - Skill command for /ops:map delegating to gsd-tools ops map
- `commands/gsd/ops-add.md` - Skill command for /ops:add delegating to gsd-tools ops add

## Decisions Made
- Used followImports (recursive import traversal, max 3 levels) for directory and manual areas to discover cross-directory dependencies like API files imported from view files -- pure path matching would miss these
- Import scanning uses regex (not AST), consistent with project anti-AST-parsing decision (D-09)
- File type classification uses path heuristics (e.g. /views/ = view, /api/ = endpoint) -- simple, fast, language-agnostic

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Manual and directory areas use followImports instead of path-only matching**
- **Found during:** Task 1 (test execution)
- **Issue:** Plan specified path-matching only for directory/manual areas, but test expects files discovered via imports (e.g., `src/api/userApi.js` imported from `src/views/users/UserTable.js`) to be included in tree
- **Fix:** Changed directory and manual area file discovery to seed from path-matching files, then followImports recursively (max 3 levels) to include imported dependencies
- **Files modified:** get-shit-done/bin/lib/ops.cjs
- **Verification:** All 23 tests pass, tree.json includes cross-directory imported files
- **Committed in:** 26950a3 (part of Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Essential fix for correct dependency graph construction. Without import following, tree.json would miss API/service/model files not co-located with view files. No scope creep.

## Issues Encountered
None beyond the import following fix documented above.

## Known Stubs
None -- cmdOpsMap is fully implemented, all skill commands delegate to working gsd-tools subcommands.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- OPS foundation complete (registry + tree mapping + skill commands)
- Ready for Phase 6 (ops workflows: investigate, feature, modify, debug)
- tree.json provides the dependency graph Phase 6 commands will traverse

---
*Phase: 05-ops-foundation-registry-mapa-do-sistema*
*Completed: 2026-03-30*
