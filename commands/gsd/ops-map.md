# /ops:map

Build dependency tree for a specific area.

## Usage

`/ops:map <area>`

## What it does

1. Looks up area in registry by slug
2. Finds all files belonging to the area (route files, views, components, endpoints, services, models)
3. Scans imports/requires to discover dependency connections
4. Builds adjacency list graph with typed nodes and edges
5. Writes tree.json to `.planning/ops/{area}/tree.json`
6. Updates registry with components_count and last_scanned timestamp

## Implementation

```bash
node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" ops map <area-slug>
```

## Output

JSON with `{ success, area, nodes, edges, tree_path }`.

## Node Types

route, view, component, endpoint, service, model, table

## Edge Types

imports, calls, renders, serves, uses_table

## Notes

- Area must exist in registry (run `/ops:init` or `/ops:add` first)
- Creates per-area directory if it does not exist
- Re-running regenerates tree.json (fresh scan of area dependencies)
