# Design: `/gsd:unlocked` — Show Actionable Phases

## Problem

GSD has commands to see stats (`/gsd:stats`), progress (`/gsd:progress`), and validate a single phase (`/gsd:preflight N`), but no command answers: **"which phases can I start right now?"**

Users with multi-phase roadmaps need to quickly see what's available, what's blocked, and — when running parallel work — which phases will compete for the same files.

## Command

`/gsd:unlocked` — scans all incomplete phases, classifies by status, detects file overlap with in-progress phases, and recommends execution order.

## Architecture

Two layers, following the `stats` pattern:

1. **`gsd-tools.cjs unlocked json`** — engine that returns structured JSON
2. **`commands/gsd/unlocked.md`** — skill that formats and presents in terminal

## Phase Classification

| Status | Criteria |
|--------|----------|
| **in_progress** | Incomplete + has PLAN.md or partial artifacts + no approved VERIFICATION.md |
| **ready** | Incomplete + all `Depends on` phases are `[x]` + not in progress |
| **blocked** | Incomplete + at least one `Depends on` phase is `[ ]` |

## Overlap Detection

For phases classified as **ready** that have a PLAN.md with `files_modified`:

- Compare against `files_modified` from all **in_progress** phases
- Calculate overlap score (number of conflicting files)
- Identify which in-progress phases conflict

For phases without PLAN.md: overlap is `null` (no data — plan first).

## Recommendations

| Value | Condition | Meaning |
|-------|-----------|---------|
| `safe_parallel` | Has plan, 0 overlap with in-progress phases | Can execute directly |
| `worktree` | Has plan, overlap > 0 with in-progress phases | Execute in worktree to avoid conflicts |
| `plan_first` | No PLAN.md | Needs planning before execution (no overlap data) |

## Ordering of Ready Phases

1. `safe_parallel` first (no competition)
2. `worktree` next, sorted by overlap score ascending (least conflict first)
3. `plan_first` last

## JSON Output

```json
{
  "timestamp": "2026-04-05T17:38:00Z",
  "summary": {
    "total_incomplete": 8,
    "in_progress": 2,
    "ready": 3,
    "blocked": 3
  },
  "in_progress": [
    {
      "phase": 5,
      "name": "Auth System",
      "has_plan": true,
      "files_modified": ["src/auth.js", "src/middleware.js"]
    }
  ],
  "ready": [
    {
      "phase": 7,
      "name": "Notifications",
      "has_plan": true,
      "files_modified": ["src/notify.js"],
      "overlap": {
        "score": 0,
        "conflicting_phases": [],
        "files": []
      },
      "recommendation": "safe_parallel",
      "suggested_command": "/gsd:execute-phase 7"
    },
    {
      "phase": 8,
      "name": "Dashboard",
      "has_plan": true,
      "files_modified": ["src/middleware.js", "src/routes.js"],
      "overlap": {
        "score": 1,
        "conflicting_phases": [5],
        "files": ["src/middleware.js"]
      },
      "recommendation": "worktree",
      "suggested_command": "/gsd:execute-phase 8 (recommend worktree)"
    },
    {
      "phase": 9,
      "name": "Reports",
      "has_plan": false,
      "files_modified": null,
      "overlap": null,
      "recommendation": "plan_first",
      "suggested_command": "/gsd:plan-phase 9"
    }
  ],
  "blocked": [
    {
      "phase": 10,
      "name": "Billing",
      "blocked_by": [7, 8],
      "blocked_by_names": ["Notifications", "Dashboard"]
    }
  ]
}
```

## Terminal Output

```
## Unlocked — Ready to Start

 SAFE     Phase 7: Notifications — 0 file conflicts
          → /gsd:execute-phase 7

 WORKTREE Phase 8: Dashboard — 1 file conflict with Phase 5
          src/middleware.js
          → /gsd:execute-phase 8 (recommend worktree)

 PLAN     Phase 9: Reports — no plan yet, overlap unknown
          → /gsd:plan-phase 9

## In Progress (2)
  Phase 5: Auth System
  Phase 6: API Gateway

## Blocked (3)
  Phase 10: Billing — waiting on Phase 7, 8
  Phase 11: Analytics — waiting on Phase 10
  Phase 12: Mobile API — waiting on Phase 5
```

## Implementation Files

| File | Purpose |
|------|---------|
| `bin/lib/unlocked.cjs` | Engine: reads roadmap, runs dependency checks, calculates overlap, generates JSON |
| `commands/gsd/unlocked.md` | Skill: runs `gsd-tools.cjs unlocked json`, formats terminal output |

## Reuses Existing Logic

- `preflight.cjs` lines 267-312 — dependency checking (`checkDependencies`)
- `parallel-dependent-plans.test.cjs` — `files_modified` overlap logic
- `roadmap.cjs` — phase parser, `depends_on` extraction

## Cleanup

- Remove phantom `/gsd:unlock-phase` skill entry from registry (no implementation exists)

## Out of Scope (YAGNI)

- Heuristic overlap for phases without PLAN.md (decision: show "plan first" instead)
- Visual dependency graph
- Auto-execution of ready phases
- Integration with `/gsd:manager` (natural future extension, not now)
