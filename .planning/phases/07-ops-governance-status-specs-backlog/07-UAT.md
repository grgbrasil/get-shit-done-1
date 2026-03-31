---
status: testing
phase: 07-ops-governance-status-specs-backlog
source: [07-01-SUMMARY.md, 07-02-SUMMARY.md]
started: 2026-03-30T18:10:00Z
updated: 2026-03-30T18:10:00Z
---

## Current Test

number: 1
name: OPS Status — Health Scoring
expected: |
  Run `gsd-tools ops status <area>` on an area with no specs.md.
  Output shows area name, D-02 fields (owner, last_touch, open_items, etc.),
  and health = "yellow" or "red" with a `no_specs` flag.
  On a healthy area (has specs, recent activity, no backlog overflow): health = "green".
awaiting: user response

## Tests

### 1. OPS Status — Health Scoring
expected: Run `gsd-tools ops status <area>` on an area. Output includes D-02 fields and health color (green/yellow/red) based on flag count (0=green, 1=yellow, 2+=red). An area missing specs.md shows `no_specs` flag.
result: [pending]

### 2. OPS Spec Show
expected: Run `gsd-tools ops spec show <area>`. If specs.md exists, displays its content. If not, reports that no specs exist for the area.
result: [pending]

### 3. OPS Spec Add/Edit
expected: Run `gsd-tools ops spec add <area>` on an area without specs. Creates specs.md with the 4-section template (Regras de Negocio, Contratos de API, Invariantes, Notas). Output confirms `created: true`.
result: [pending]

### 4. OPS Backlog Add
expected: Run `gsd-tools ops backlog add <area> --title "Fix X" --priority high`. Creates a backlog entry with auto-incremented ID, title, priority=high, status=pending, and created_at timestamp.
result: [pending]

### 5. OPS Backlog List
expected: Run `gsd-tools ops backlog list <area>`. Shows pending and promoted items sorted by priority (high first, then medium, then low), with created_at as tiebreak. Done items are filtered out.
result: [pending]

### 6. OPS Backlog Prioritize
expected: Run `gsd-tools ops backlog prioritize <area> --id <N> --priority low`. Changes the item's priority. Subsequent list reflects the new sort order.
result: [pending]

### 7. OPS Backlog Promote
expected: Run `gsd-tools ops backlog promote <area> --id <N>`. Item status changes to "promoted". Output includes area context (tree summary) and next_steps workflow suggestions (gsd:quick, ops:feature, ops:modify).
result: [pending]

### 8. OPS Backlog Done
expected: Run `gsd-tools ops backlog done <area> --id <N>`. Item status changes to "done". Item no longer appears in `backlog list` output.
result: [pending]

## Summary

total: 8
passed: 0
issues: 0
pending: 8
skipped: 0
blocked: 0

## Gaps

[none yet]
