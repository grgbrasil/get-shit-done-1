# /ops:debug

Emit OPS-specific debugging context for an area, composable with /gsd:debug.

## Usage

`/ops:debug <area> <symptom description>`

## What it does

1. Loads area registry entry and full dependency tree
2. Builds structured context-pack.md with area overview, dependency chain, specs, and recent history
3. Writes context-pack.md to `.planning/ops/<area>/context-pack.md`
4. Records operation in area history
5. Optionally chains to /gsd:debug with the context pack as input

## Implementation

### Step 1: Generate context pack
```bash
RESULT=$(node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" ops debug <area> "<symptom>" --raw)
```

### Step 2: Read the generated context pack
The context-pack.md is written to `.planning/ops/<area>/context-pack.md` and contains:
- **Area Overview:** name, source, components count, last scanned
- **Dependency Chain:** nodes grouped by type (route -> view -> component -> endpoint -> service -> model -> table) with edge targets
- **Specs:** area specifications if defined (from specs.md)
- **Recent History:** last 10 operations on this area

### Step 3: Chain to /gsd:debug (optional)
If the user wants deeper debugging, the context-pack.md can be passed to /gsd:debug:
```
Read .planning/ops/<area>/context-pack.md for OPS context, then proceed with /gsd:debug
```

## Output

JSON with `{ success, area, context_pack_path }`.

## Notes

- Does NOT perform debugging itself -- emits structured context per D-09
- Composable with /gsd:debug: this command provides OPS-specific context (dependency chain, specs, history) that /gsd:debug consumes
- Works even without tree.json (provides registry-only context with warning)
- Records operation in area history
