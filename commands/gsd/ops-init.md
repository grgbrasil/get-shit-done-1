# /ops:init

Scan codebase and build the OPS system registry.

## Usage

`/ops:init`

## What it does

1. Scans codebase for route definitions (Vue Router, Laravel, Express) and directory conventions (views/, pages/, features/, modules/)
2. Auto-detects functional areas (features/screens) with confidence scoring
3. Deduplicates areas detected by both route and directory methods
4. Creates `.planning/ops/registry.json` with all detected areas
5. Reports detection results with area count and sources

## Implementation

```bash
node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" ops init
```

## Output

JSON with `{ success, areas_detected, areas: [...] }`. Each area contains slug, name, source, detected_by, confidence.

## Notes

- Re-running overwrites the existing registry (fresh scan)
- Does NOT create per-area directories (lazy creation on first `/ops:map`)
- Use `/ops:add` to register areas not covered by auto-detection
