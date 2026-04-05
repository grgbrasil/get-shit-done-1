---
name: gsd:unlocked
description: Show which phases can be started now — with file overlap analysis and execution recommendations
allowed-tools:
  - Read
  - Bash
---
<objective>
Show all actionable phases: what's in progress, what's ready to start (with overlap analysis), and what's blocked by dependencies. Recommends execution order and worktree usage.
</objective>

<process>

## Step 1: Run the unlocked engine

```bash
node ~/.claude/get-shit-done/bin/gsd-tools.cjs unlocked table --raw
```

## Step 2: Present the output

Display the rendered table output directly to the user. The table includes:

- **Unlocked — Ready to Start**: Phases with all dependencies satisfied, sorted by recommendation:
  - `SAFE` — no file conflicts, can execute directly
  - `WORKTREE` — file conflicts with in-progress phases, recommend worktree isolation
  - `PLAN` — needs planning first (no PLAN.md yet)
- **In Progress**: Phases currently being worked on
- **Blocked**: Phases waiting on incomplete dependencies

## Step 3: Offer next action

If there are `SAFE` phases, suggest starting with the first one.
If there are only `WORKTREE` phases, explain the worktree recommendation.
If there are only `PLAN` phases, suggest planning the first one.
If everything is blocked, explain what needs to complete first.

</process>
