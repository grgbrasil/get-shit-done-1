# /ops:add

Register a new area manually in the OPS registry.

## Usage

`/ops:add <area-name>`

## What it does

1. Normalizes area name to slug (lowercase, hyphens)
2. Checks registry for duplicate slug
3. Creates registry entry with `source: "manual"`
4. Creates per-area directory at `.planning/ops/{slug}/`
5. Reports created area details

## Implementation

```bash
node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" ops add "<area-name>"
```

## Output

JSON with `{ success, area: { slug, name, source, ... } }`.

## Notes

- Use quotes for multi-word area names: `/ops:add "User Management"`
- Duplicate slugs are rejected with an error
- Manual areas can be mapped with `/ops:map` after adding
