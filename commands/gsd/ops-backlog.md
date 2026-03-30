# /ops:backlog

Manage pending work items for an OPS area -- add, prioritize, promote to execution, and mark as done.

## Usage

`/ops:backlog <area> list` -- Show pending items sorted by priority
`/ops:backlog <area> add <title>` -- Add a new work item (default: medium priority)
`/ops:backlog <area> prioritize <id> <high|medium|low>` -- Change item priority
`/ops:backlog <area> promote <id>` -- Mark as promoted and get execution context
`/ops:backlog <area> done <id>` -- Mark as completed (item stays in history)

## What it does

Manages `.planning/ops/{area}/backlog.json` -- an array of work items with auto-increment IDs, priority, and status tracking. Items transition: `pending` -> `promoted` -> `done`. Done items remain for audit history.

## Implementation

### List pending items
```bash
node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" ops backlog <area> list --raw
```
Returns `{ area, items: [...] }` with pending and promoted items sorted by priority (high first), then by age (oldest first within same priority).

### Add an item
```bash
node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" ops backlog <area> add "Fix login timeout on slow connections" --raw
```
Returns `{ success, area, item }` with the new item. ID is auto-assigned as max(existing IDs) + 1.

### Change priority
```bash
node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" ops backlog <area> prioritize 3 high --raw
```

### Promote an item to execution
```bash
node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" ops backlog <area> promote 3 --raw
```
Returns `{ success, area, item, context }` where context contains area_name, item details, tree_summary, and next_steps suggesting `/gsd:quick`, `/ops:feature`, or `/ops:modify`. Does NOT execute anything -- user decides the workflow.

### Mark as done
```bash
node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" ops backlog <area> done 3 --raw
```

## Backlog Item Schema

```json
{
  "id": 1,
  "title": "Fix login timeout on slow connections",
  "description": "Optional longer description",
  "priority": "high",
  "status": "pending",
  "created_at": "2026-03-30T10:00:00Z",
  "promoted_to": null
}
```

`status` values: `pending` (active), `promoted` (sent to execution), `done` (completed)
`priority` values: `high`, `medium` (default), `low`

## Notes

- `promote` emits context for human decision -- use `/gsd:quick` for small fixes, `/ops:feature` for features, `/ops:modify` for behaviour changes
- Done items remain in backlog.json for audit history -- never deleted
- Run `/ops:status <area>` to see backlog_items_count and clear `backlog_overflow` flag when items are resolved
