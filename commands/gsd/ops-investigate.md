# /ops:investigate

Investigate a problem in an OPS area with auto-bootstrap and full tree context for autonomous diagnosis.

## Usage

`/ops:investigate <area> <problem description>`

## What it does (v2 — auto-bootstrap)

1. **Auto-bootstraps** registry entry, area directory, and tree.json if any are missing
2. Loads full tree context via `gsd-tools ops investigate <area> <description> --raw`
3. Returns JSON with tree, findings_path, and CLI tool hints for agent consumption
4. Records operation in area history

### Auto-Bootstrap Behavior

If the area does not exist in the registry, investigate creates it silently with:
- `source: 'auto-bootstrap'`
- `detected_by: 'investigate'`
- `confidence: 'medium'`

If the area directory or tree.json is missing, they are created as empty structures.
The `bootstrapped` field in the output indicates what was auto-created.

## Implementation

### Step 1: Load area context with auto-bootstrap

```bash
AREA_DATA=$(node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" ops investigate <area> "<description>" --raw)
```

The command returns JSON with:
- `bootstrapped` — what was auto-created (`registry`, `area_dir`, `tree`)
- `context.tree` — full tree (nodes + edges)
- `findings_path` — path to findings.json for this area
- `tools` — exact CLI commands for tree-query, tree-update, findings-add, findings-list

### Step 2: Classify intent and query tree

Use the `tools.tree_query` command to filter the tree by investigation intent:

```bash
node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" ops tree-query <area> --intent debug --node <suspect-node>
```

Intents: `debug` (callers/callees), `impact` (dependents), `trace` (full chain), `context` (siblings).

### Step 3: Autonomous investigation loop

Using the tree data:
1. Parse the problem description to identify keywords and likely affected node types
2. Find entry point nodes in tree (routes, endpoints) that match the problem
3. Follow edges depth-first from entry points, reading source files at each node
4. Form a hypothesis about root cause based on code reading
5. Verify hypothesis: check if the suspected code path actually produces the described behavior
6. If hypothesis fails, backtrack and try alternate paths

### Step 4: Plant knowledge in tree

As you discover facts during investigation, plant them using tree-update:

```bash
node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" ops tree-update <area> <node-id> notes '"Handles retry logic for failed payments"'
node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" ops tree-update <area> <node-id> status '"needs-refactor"'
```

### Step 5: Record findings

Create findings for issues discovered during investigation:

```bash
node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" ops findings <area> add \
  --title "Race condition in payment retry" \
  --severity high \
  --category bug \
  --description "PaymentRetry.process() does not lock..." \
  --affected-nodes "service:PaymentRetry,service:PaymentGateway"
```

List existing findings:
```bash
node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" ops findings <area> list --status pending
```

## Output Format

```json
{
  "success": true,
  "area": "slug",
  "description": "...",
  "bootstrapped": { "registry": false, "area_dir": false, "tree": false },
  "tree_path": ".planning/ops/slug/tree.json",
  "findings_path": ".planning/ops/slug/findings.json",
  "context": { "nodes": 0, "edges": 0, "tree": {...} },
  "tools": {
    "tree_query": "node \"$HOME/.claude/get-shit-done/bin/gsd-tools.cjs\" ops tree-query slug ...",
    "tree_update": "node \"$HOME/.claude/get-shit-done/bin/gsd-tools.cjs\" ops tree-update slug ...",
    "findings_add": "node \"$HOME/.claude/get-shit-done/bin/gsd-tools.cjs\" ops findings slug add ...",
    "findings_list": "node \"$HOME/.claude/get-shit-done/bin/gsd-tools.cjs\" ops findings slug list ..."
  }
}
```

## Notes

- No prerequisites required — investigate auto-bootstraps everything it needs
- Only refreshes tree if it had existing nodes (avoids refreshing an empty tree)
- Produces findings and knowledge — does NOT automatically fix. Use `/ops:modify` or `/ops:feature` to act on findings
- Records operation in area history for audit trail
