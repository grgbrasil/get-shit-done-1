# /ops:modify

Modify existing behavior in an OPS area with impact analysis from the dependency tree.

## Usage

`/ops:modify <area> <what to change>`

## What it does

1. Loads area context and analyzes impact via dependency tree edge traversal
2. Identifies all affected nodes (files that depend on or are depended upon)
3. Computes blast radius for scope-based dispatch
4. If large scope: generates full GSD plan with impact context
5. If small scope: dispatches to /gsd:quick with affected nodes context
6. Records operation in area history and refreshes dependency tree

## Implementation

### Step 1: Get impact analysis and dispatch decision
```bash
RESULT=$(node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" ops modify <area> "<description>" --raw)
```

Parse the JSON result. Key fields:
- `affected_nodes`: array of nodes identified via tree edge traversal
- `affected_count`: total number of affected files
- `dispatch`: "quick" or "plan"
- `blast_radius`: { total_nodes, cross_area_edges, needs_full_plan }

### Step 2: Review affected nodes before proceeding
The affected_nodes list shows every file that could be impacted by the modification.
Present this to the user context for informed decision-making.

### Step 3: Execute based on dispatch
- **quick**: Implement modification inline with `/gsd:quick`, using affected_nodes as scope
- **plan**: Generate plan in `.planning/ops/<area>/plans/` with explicit task per affected node group

## Output

JSON with `{ success, area, affected_nodes, affected_count, blast_radius, dispatch, context_summary }`.

## Notes

- Impact analysis traverses dependency edges up to 3 levels deep
- Affected nodes include both direct dependents and transitive dependents
- History recorded automatically by the CLI command
- For behavioral changes (not just structural), consider reviewing affected_nodes carefully before proceeding
