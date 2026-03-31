# /ops:modify

Modify existing behavior in an OPS area with impact analysis from the dependency tree. Supports two modes: findings-based (by ID, range, or all pending) and legacy description-based.

## Usage

```
/ops:modify <area> <FINDING-ID>          # Single finding (e.g., PRAZOS-001)
/ops:modify <area> <ID..ID>              # Range (e.g., PRAZOS-001..003)
/ops:modify <area> --all-pending         # All pending findings in the area
/ops:modify <area> <what to change>      # Legacy: free-text description
```

## Detection Logic

The command auto-detects the mode based on the second argument:

| Pattern | Example | Mode |
|---------|---------|------|
| `SLUG_UPPER-\d+` | `PRAZOS-001` | Findings mode, single ID |
| `SLUG_UPPER-\d+..\d+` | `PRAZOS-001..003` | Findings mode, range |
| `--all-pending` | `--all-pending` | Findings mode, all pending |
| Anything else | `Refactor save logic` | Legacy description-based mode |

## What it does

### Findings Mode

1. Loads area context and findings from `findings.json`
2. Resolves target findings by ID, range, or pending status filter
3. Groups findings by affected file for focused work
4. Computes blast radius for scope-based dispatch (quick if <=5 findings, plan if >5)
5. Returns tool hints for marking findings as fixed after modification
6. Records operation in area history and refreshes dependency tree

### Legacy Mode (Description-Based)

1. Loads area context and analyzes impact via dependency tree edge traversal
2. Identifies all affected nodes (files that depend on or are depended upon)
3. Computes blast radius for scope-based dispatch
4. If large scope: generates full GSD plan with impact context
5. If small scope: dispatches to /gsd:quick with affected nodes context
6. Records operation in area history and refreshes dependency tree

## Implementation

### Step 1: Get impact analysis and dispatch decision
```bash
RESULT=$(node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" ops modify <area> "<finding-id-or-description>" --raw)
```

Parse the JSON result. Check `findings_mode` to determine which fields are available.

### Step 2: Route based on mode

**Findings mode** (`findings_mode: true`):
- `target_findings`: array of finding objects from findings.json
- `files_affected`: unique file paths from the findings
- `findings_by_file`: findings grouped by file path
- `dispatch`: "quick" (<=5 findings) or "plan" (>5 findings)
- `tools.mark_fixed`: command to mark a finding as fixed
- `tools.mark_range`: command to mark a range as fixed (if >1 finding)

**Legacy mode** (`findings_mode: false`):
- `affected_nodes`: array of nodes identified via tree edge traversal
- `affected_count`: total number of affected files
- `dispatch`: "quick" or "plan" (based on blast radius)
- `blast_radius`: { total_nodes, cross_area_edges, needs_full_plan }

### Step 3: Execute based on dispatch
- **quick**: Implement modification inline with `/gsd:quick`, using findings or affected_nodes as scope
- **plan**: Generate plan in `.planning/ops/<area>/plans/` with explicit task per file group

### Step 4: Mark findings as resolved (findings mode only)
After completing the modification, use the tool hints to update finding status:
```bash
node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" ops findings <slug> update <ID> --status fixed --resolved-by ops:modify
```

## Output

### Findings Mode
```json
{
  "success": true,
  "area": "slug",
  "findings_mode": true,
  "target_findings": [...],
  "files_affected": ["file1.vue", "file2.php"],
  "findings_by_file": { "file1.vue": [...], "file2.php": [...] },
  "blast_radius": { ... },
  "dispatch": "quick",
  "tools": {
    "mark_fixed": "node ... ops findings slug update <ID> --status fixed --resolved-by ops:modify",
    "mark_range": "node ... ops findings slug update <ID..ID> --status fixed"
  }
}
```

### Legacy Mode
```json
{
  "success": true,
  "area": "slug",
  "description": "...",
  "findings_mode": false,
  "blast_radius": { ... },
  "affected_nodes": [...],
  "affected_count": 5,
  "dispatch": "quick",
  "context_summary": { "nodes_by_type": {...}, "edges_count": 0, "total_nodes": 5 }
}
```

## Notes

- Findings mode requires a prior `/ops:investigate` to populate `findings.json`
- Impact analysis in legacy mode traverses dependency edges up to 3 levels deep
- Affected nodes include both direct dependents and transitive dependents
- History recorded automatically by the CLI command
- For behavioral changes (not just structural), consider reviewing affected_nodes or findings carefully before proceeding
