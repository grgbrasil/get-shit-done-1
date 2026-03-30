# /ops:status

Show health status of an OPS area: spec coverage, pending backlog, and recent operations.

## Usage

`/ops:status [area]`

- No area: summary table of all registered areas with health indicator
- With area: full health detail for that specific area

## What it does

1. Reads tree.json (nodes/edges count), specs.md (spec coverage), backlog.json (pending items), history.json (last operation), and registry.json (last_scanned) for the area
2. Computes health score: green (no issues), yellow (1 issue), red (2+ issues)
3. Health flags: `no_specs` (specs.md missing), `stale` (>30 days since last operation), `backlog_overflow` (>10 pending items)
4. Outputs JSON for programmatic consumption or human-readable summary

## Implementation

### Step 1: Load status data
```bash
# All areas summary
STATUS=$(node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" ops status --raw)

# Single area detail
STATUS=$(node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" ops status <area> --raw)
```

### Step 2: Interpret and present
Parse the JSON and present a human-readable summary. For all-areas: a table with columns area, health, specs, backlog, last_op. For single area: labeled key-value pairs grouped by category.

## Output

All-areas: `{ areas: [{ slug, name, health, health_flags, specs_defined, backlog_items_count, days_since_last_op, ... }] }`

Single area: full object with all fields from D-02 (nodes_count, edges_count, specs_defined, spec_rules_count, backlog_items_count, backlog_by_priority, last_operation, days_since_last_op, tree_last_scanned, health, health_flags)

## Notes

- Health scoring is advisory only -- does not block operations
- Areas registered via `/ops:add` but never mapped will show nodes_count: 0 (not an error)
- Run `/ops:spec <area> edit` to create specs.md and clear the `no_specs` flag
- Run `/ops:backlog <area> done <id>` to reduce pending backlog count
