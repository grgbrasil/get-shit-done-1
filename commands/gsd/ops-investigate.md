# /ops:investigate

Investigate a problem in an OPS area using the dependency tree for autonomous diagnosis.

## Usage

`/ops:investigate <area> <problem description>`

## What it does

1. Loads area context via `gsd-tools ops get <area>` and full tree.json
2. Navigates dependency tree to identify relevant code paths
3. Reads source files following edges from likely entry points
4. Forms hypothesis about root cause
5. Verifies hypothesis by reading related code and testing
6. Writes diagnosis.md to `.planning/ops/<area>/diagnosis.md`
7. Records operation in area history

## Implementation

### Step 1: Load area context
```bash
AREA_DATA=$(node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" ops investigate <area> "<description>" --raw)
```

The command returns JSON with full tree in `context.tree` (nodes + edges).

### Step 2: Autonomous investigation loop

Using the tree data:
1. Parse the problem description to identify keywords and likely affected node types
2. Find entry point nodes in tree (routes, endpoints) that match the problem
3. Follow edges depth-first from entry points, reading source files at each node
4. Form a hypothesis about root cause based on code reading
5. Verify hypothesis: check if the suspected code path actually produces the described behavior
6. If hypothesis fails, backtrack and try alternate paths

### Step 3: Write diagnosis

Write `.planning/ops/<area>/diagnosis.md` with:
- **Problem:** Original description
- **Root Cause:** What was found
- **Evidence:** Files read, code paths traced
- **Proposed Fix:** Specific changes recommended
- **Affected Files:** List of files that need modification

## Output

JSON with `{ success, area, tree_path, diagnosis_path, context }`.
The `context.tree` field contains the full dependency tree for deep traversal.

## Notes

- Area must exist in registry and have tree.json (run `/ops:init` then `/ops:map` first)
- Produces diagnosis.md -- does NOT automatically fix. Use `/ops:modify` or `/ops:feature` to act on diagnosis
- Records operation in area history for audit trail
