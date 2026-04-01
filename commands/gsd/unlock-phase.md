# /gsd:unlock-phase

Force-release a phase lock when the owning session has crashed or the PID has been reused.

## Usage

`/gsd:unlock-phase <phase-number>`

## Process

1. Resolve phase directory from phase number
2. Check if lock exists and show current lock info (PID, timestamp)
3. Force-remove the .lock file
4. Confirm unlock to user

## Implementation

```bash
PHASE_DIR=$(node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" find-phase "$PHASE_NUMBER" 2>/dev/null)
# Check current lock status
node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" lock check "$PHASE_DIR"
# Force unlock
node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" lock force-unlock "$PHASE_DIR"
```

## Notes

- This is an escape hatch for edge cases (crashed sessions, PID reuse)
- Normal operation: locks are auto-acquired by the hook and auto-released when sessions end
- Use when you see "PHASE LOCK" blocking messages but know the other session is no longer active
