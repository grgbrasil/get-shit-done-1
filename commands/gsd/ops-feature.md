# /ops:feature

Add a new capability to an OPS area with automatic scope-based dispatch.

## Usage

`/ops:feature <area> <feature description>`

## What it does

1. Loads area context and computes blast radius from dependency tree
2. If blast radius exceeds threshold (cross-area edges or >5 affected nodes): generates full GSD plan in `.planning/ops/<area>/plans/` and executes via plan-phase + execute-phase
3. If blast radius is small: dispatches to /gsd:quick with area context injected for immediate execution
4. Records operation in area history and refreshes dependency tree

## Implementation

### Step 1: Get dispatch decision
```bash
RESULT=$(node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" ops feature <area> "<description>" --raw)
```

Parse the JSON result. Check `dispatch` field: "quick" or "plan".

### Step 2a: Quick dispatch (dispatch == "quick")
Execute the feature inline using /gsd:quick with area context:
- Use `context_summary` from the result (nodes_by_type, edges_count)
- The feature is small enough to implement without formal planning

### Step 2b: Full plan dispatch (dispatch == "plan")
The `plan_dir` field points to `.planning/ops/<area>/plans/`.
Generate a PLAN.md in that directory following GSD plan format, then execute it.
- Use `blast_radius` data to scope the plan appropriately
- Plans in .planning/ops/{area}/plans/ do NOT pollute .planning/phases/ (per D-06)

## Output

JSON with `{ success, area, blast_radius, needs_full_plan, dispatch, context_summary }`.
When dispatch is "plan", also includes `plan_dir`.

## Notes

- Area must exist in registry and have tree.json
- Blast radius threshold is tunable (default: 5 nodes or any cross-area edges)
- History recorded automatically by the CLI command
