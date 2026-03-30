# Phase 5: OPS Foundation -- Registry + Mapa do Sistema - Research

**Researched:** 2026-03-30
**Domain:** CLI tooling, codebase scanning, dependency graph modeling
**Confidence:** HIGH

## Summary

Phase 5 builds a new `/ops` domain in gsd-tools that scans a codebase, auto-detects functional areas (route-driven + directory-convention fallback), stores them in a slim `registry.json` index, and generates per-area `tree.json` dependency graphs (flat adjacency list with nodes + edges). All decisions are locked in CONTEXT.md -- the architecture is fully specified.

The implementation follows the exact same lib module pattern as `fmap.cjs`: a new `ops.cjs` module with `cmd*` function exports, `require('./core.cjs')` for path helpers, JSON read/write via `fs.readFileSync/writeFileSync`, and a new `case 'ops':` block in `gsd-tools.cjs`. Three skill command markdown files (`/ops:init`, `/ops:map`, `/ops:add`) delegate to gsd-tools. Tests use `node:test` + `node:assert` with the existing `helpers.cjs` infrastructure.

**Primary recommendation:** Mirror the fmap.cjs module structure exactly. The only novel work is the area detection heuristics (framework-pattern-driven scan) and the adjacency-list graph builder for tree.json. Everything else (CLI dispatch, CRUD, persistence, testing) follows established patterns verbatim.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- D-01: Hybrid registry: `registry.json` as slim index + per-area directories in `.planning/ops/{area}/`
- D-02: Registry entry fields: `{ slug, name, source: "auto"|"manual", created_at, last_scanned, components_count }`
- D-03: Heavy data (tree.json, specs, backlog, history) lives in `.planning/ops/{area}/` -- registry.json only indexes
- D-04: registry.json location: `.planning/ops/registry.json`
- D-05: Slug normalization: lowercase, hyphens, no special characters (same logic as phase_slug via `generateSlugInternal`)
- D-06: Hybrid detection: route-file-driven first (Vue Router, Laravel web.php, Express routers), directory-convention fallback
- D-07: Each detected area gets `detected_by: "route"|"directory"` tag
- D-08: Framework patterns configurable via JSON mapping (extensible without code changes)
- D-09: No Serena as primary detection engine -- simple heuristics (grep/fs scan), aligned with anti-AST-parsing decision
- D-10: Flat adjacency list with `nodes[]` and `edges[]` -- O(1) lookup by node ID
- D-11: Node schema: `{ id, type: "route"|"view"|"component"|"endpoint"|"service"|"model"|"table", file_path, name, metadata: {} }`
- D-12: Edge schema: `{ from, to, type: "imports"|"calls"|"renders"|"serves"|"uses_table", weight?: number }`
- D-13: Cross-area dependencies as normal edges (no node duplication)
- D-14: tree.json location: `.planning/ops/{area}/tree.json`
- D-15: New lib module `ops.cjs` following fmap.cjs pattern
- D-16: New `case 'ops':` domain in gsd-tools.cjs dispatcher
- D-17: CLI subcommands: `gsd-tools ops init`, `ops map <area>`, `ops add <area>`, `ops list`, `ops get <area>`
- D-18: Skill commands as markdown files in commands/ delegating to gsd-tools
- D-19: JSON output for programmatic consumption, human-readable table when called directly
- D-20: Extensible for Phase 6-7 subcommands without structural changes

### Claude's Discretion
- Dedup strategy between route-detected and directory-detected areas
- Confidence scoring heuristics per detected area
- Metadata specifics per node type (view metadata vs service metadata)
- Human-readable table output format
- Per-area directory initialization strategy (eager vs lazy)

### Deferred Ideas (OUT OF SCOPE)
- /ops:investigate, /ops:feature, /ops:modify, /ops:debug -- Phase 6
- /ops:status, /ops:spec, /ops:backlog -- Phase 7
- Serena-based semantic clustering -- discarded (anti-AST-parsing)
- Visual tree rendering in terminal -- possible backlog
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| OPS-01 | `/ops:init` scans codebase and builds system map -- groups code by screen/feature detecting routes, views, endpoints, services, models | ops.cjs `cmdOpsInit()` with framework-pattern JSON config, hybrid detection (D-06 through D-09), registry.json write (D-01 through D-04) |
| OPS-02 | `/ops:map [area]` rebuilds dependency tree for an area (view->component->endpoint->service->model->table) | ops.cjs `cmdOpsMap()` reads registry, scans area files, builds adjacency list (D-10 through D-14), writes tree.json |
| OPS-03 | `/ops:add [area]` registers new area manually when auto-detection does not cover it | ops.cjs `cmdOpsAdd()` creates registry entry with `source: "manual"`, creates `.planning/ops/{area}/` directory |
| OPS-04 | Per-area data persists in `.planning/ops/{area}/` with tree, specs, backlog, and history | Directory structure creation, tree.json persistence, extensible for Phase 6-7 files |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| node:fs | built-in | File system operations (readFileSync, writeFileSync, mkdirSync) | Project convention -- all lib modules use synchronous fs |
| node:path | built-in | Cross-platform path resolution | Project convention |
| node:child_process | built-in | execSync for grep-based scanning | Used by fmap.cjs for git operations |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| node:test | built-in | Test runner | All tests in project use this |
| node:assert | built-in | Test assertions | All tests in project use this |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| grep/fs scan | Serena MCP | Explicitly rejected (D-09) -- simple heuristics only |
| Custom graph lib | graphlib/dagre | Overkill -- flat adjacency list with simple traversal is sufficient |
| AST parsing | tree-sitter | Explicitly out of scope -- project anti-AST-parsing decision |

**Installation:** No new dependencies required. All built-in Node.js modules.

## Architecture Patterns

### Recommended Project Structure
```
get-shit-done/bin/lib/
  ops.cjs                    # New lib module (CRUD + scan + map logic)

get-shit-done/bin/gsd-tools.cjs
  case 'ops':                # New dispatcher block

commands/gsd/
  ops-init.md                # /ops:init skill command
  ops-map.md                 # /ops:map skill command
  ops-add.md                 # /ops:add skill command

.planning/ops/
  registry.json              # Slim index of all areas
  {area-slug}/
    tree.json                # Adjacency list graph
```

### Pattern 1: Lib Module Convention (from fmap.cjs)
**What:** CommonJS module with `cmd*` function exports, require core.cjs, JSON read/write
**When to use:** Every gsd-tools domain follows this pattern
**Example:**
```javascript
// Source: get-shit-done/bin/lib/fmap.cjs (verified)
const fs = require('fs');
const path = require('path');
const { output, error, planningRoot } = require('./core.cjs');

function readRegistry(cwd) {
  const p = path.join(planningRoot(cwd), 'ops', 'registry.json');
  if (!fs.existsSync(p)) return { areas: [] };
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

function writeRegistry(cwd, registry) {
  const dir = path.join(planningRoot(cwd), 'ops');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'registry.json'), JSON.stringify(registry, null, 2), 'utf-8');
}

function cmdOpsInit(cwd, args, raw) { /* ... */ }
function cmdOpsMap(cwd, area, raw) { /* ... */ }
function cmdOpsAdd(cwd, area, args, raw) { /* ... */ }
function cmdOpsList(cwd, raw) { /* ... */ }
function cmdOpsGet(cwd, area, raw) { /* ... */ }

module.exports = { cmdOpsInit, cmdOpsMap, cmdOpsAdd, cmdOpsList, cmdOpsGet };
```

### Pattern 2: gsd-tools.cjs Dispatcher Block (from fmap case)
**What:** Case block in main dispatcher routing subcommands to lib module functions
**When to use:** Adding new domain to gsd-tools
**Example:**
```javascript
// Source: get-shit-done/bin/gsd-tools.cjs:918-936 (verified)
case 'ops': {
  const subcommand = args[1];
  if (subcommand === 'init') {
    ops.cmdOpsInit(cwd, args.slice(2), raw);
  } else if (subcommand === 'map') {
    ops.cmdOpsMap(cwd, args[2], raw);
  } else if (subcommand === 'add') {
    ops.cmdOpsAdd(cwd, args[2], args.slice(3), raw);
  } else if (subcommand === 'list') {
    ops.cmdOpsList(cwd, raw);
  } else if (subcommand === 'get') {
    ops.cmdOpsGet(cwd, args[2], raw);
  } else {
    error(`Unknown ops subcommand: ${subcommand}`);
  }
  break;
}
```

### Pattern 3: Slug Normalization (from core.cjs)
**What:** Reuse `generateSlugInternal` from core.cjs for area slug creation
**When to use:** Converting user-provided area name to filesystem-safe slug
**Example:**
```javascript
// Source: get-shit-done/bin/lib/core.cjs:1062-1065 (verified)
function generateSlugInternal(text) {
  if (!text) return null;
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
```

### Pattern 4: Framework Detection Patterns Config
**What:** JSON mapping of framework-specific file patterns for area detection
**When to use:** OPS-01 auto-detection needs configurable framework patterns
**Recommendation (Claude's discretion):**
```javascript
// Embeddable in ops.cjs as a constant (no external file needed for v1)
const FRAMEWORK_PATTERNS = {
  'vue-router': {
    files: ['**/router/**/*.{js,ts}', '**/routes/**/*.{js,ts}'],
    routeRegex: /path:\s*['"]\/([^'"]+)['"]/g,
    type: 'route'
  },
  'laravel': {
    files: ['routes/web.php', 'routes/api.php'],
    routeRegex: /Route::\w+\(['"]\/([^'"]+)['"]/g,
    type: 'route'
  },
  'express': {
    files: ['**/routes/**/*.{js,ts}', '**/router/**/*.{js,ts}'],
    routeRegex: /router\.\w+\(['"]\/([^'"]+)['"]/g,
    type: 'route'
  },
  'nextjs': {
    directories: ['app/', 'pages/'],
    type: 'directory'
  },
  'directory-convention': {
    directories: ['src/views/', 'src/pages/', 'src/features/', 'src/modules/'],
    type: 'directory'
  }
};
```

### Pattern 5: Adjacency List Graph (D-10 through D-12)
**What:** Flat graph with nodes[] and edges[] arrays
**When to use:** tree.json construction in /ops:map
**Example:**
```javascript
// tree.json schema per D-10, D-11, D-12
{
  "area": "usuarios",
  "generated_at": "2026-03-30T10:00:00.000Z",
  "nodes": [
    { "id": "route:/usuarios", "type": "route", "file_path": "src/router/index.ts", "name": "/usuarios", "metadata": {} },
    { "id": "view:UsuariosView", "type": "view", "file_path": "src/views/UsuariosView.vue", "name": "UsuariosView", "metadata": {} },
    { "id": "component:UserTable", "type": "component", "file_path": "src/views/usuarios/UserTable.vue", "name": "UserTable", "metadata": {} },
    { "id": "endpoint:GET /api/users", "type": "endpoint", "file_path": "app/Http/Controllers/UserController.php", "name": "GET /api/users", "metadata": {} },
    { "id": "model:User", "type": "model", "file_path": "app/Models/User.php", "name": "User", "metadata": {} }
  ],
  "edges": [
    { "from": "route:/usuarios", "to": "view:UsuariosView", "type": "renders" },
    { "from": "view:UsuariosView", "to": "component:UserTable", "type": "renders" },
    { "from": "component:UserTable", "to": "endpoint:GET /api/users", "type": "calls" },
    { "from": "endpoint:GET /api/users", "to": "model:User", "type": "uses_table" }
  ]
}
```

### Anti-Patterns to Avoid
- **Over-engineering detection:** Do NOT try to parse AST or use complex analysis. Simple grep + fs.readdirSync is the mandated approach (D-09).
- **Registry bloat:** registry.json must stay slim (D-03). Only index fields, never tree data.
- **Hardcoded framework patterns:** Patterns must be configurable/extensible (D-08), not buried in if/else chains.
- **Eager directory creation for all areas:** Per-area directories should be created on demand (when tree.json is first written), not during init. This avoids empty directory clutter.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Slug normalization | Custom regex | `generateSlugInternal` from core.cjs | Already tested, same convention as phase slugs |
| JSON pretty-print | Custom formatter | `JSON.stringify(obj, null, 2)` | Project convention across all lib modules |
| Path resolution | Manual joins | `planningRoot(cwd)` from core.cjs | Handles workstream-aware paths |
| CLI output | Custom formatting | `output(result, raw)` / `error(msg)` from core.cjs | Handles JSON vs raw, large payload tmpfile, stderr |
| Graph traversal | Custom BFS/DFS | Simple filter on edges array | Adjacency list is flat -- filter `edges.filter(e => e.from === nodeId)` is O(n) but n is small per area |

**Key insight:** This phase is 80% established pattern replication (lib module, dispatcher, tests, commands) and 20% novel domain logic (detection heuristics, graph construction). Do not invent new patterns.

## Common Pitfalls

### Pitfall 1: Glob Patterns in Detection
**What goes wrong:** Using `fs.readdirSync` with glob-like patterns fails because Node's built-in fs doesn't support globs.
**Why it happens:** D-06 mentions scanning route files which may be nested in subdirectories.
**How to avoid:** Use recursive `readdirSync` with manual path matching, or use `execSync('find ...')` / `execSync('ls ...')` for simple pattern matching. Keep it consistent with how fmap.cjs uses `execSync` for git operations.
**Warning signs:** Test failures on projects with nested router structures.

### Pitfall 2: Circular Cross-Area Edges
**What goes wrong:** When building tree.json for area A, importing from area B which imports from area A creates cycles.
**Why it happens:** D-13 allows cross-area edges as normal edges.
**How to avoid:** Mark cross-area edges explicitly but do not follow them during graph construction for a single area. Build the graph for the requested area only, noting cross-area references as leaf edges.
**Warning signs:** Infinite loops or exponentially growing tree.json files.

### Pitfall 3: Route Detection False Positives
**What goes wrong:** Detecting test files, config files, or comments as route definitions.
**Why it happens:** Regex-based route detection (D-06) can match patterns in non-route files.
**How to avoid:** Only scan files matching known router file patterns (D-08 framework config). Skip `node_modules/`, `dist/`, `build/`, `.planning/`, test directories.
**Warning signs:** Registry contains dozens of spurious areas.

### Pitfall 4: Missing Area Slug Collision
**What goes wrong:** Two detected areas produce the same slug (e.g., "User Settings" and "user-settings" directory).
**Why it happens:** Route-detected and directory-detected areas may refer to the same functional area.
**How to avoid:** Dedup by slug after detection -- if same slug from both sources, merge (prefer route-detected source tag, combine file references). This is explicitly Claude's discretion per CONTEXT.md.
**Warning signs:** Duplicate entries in registry.json.

### Pitfall 5: Large Codebase Performance
**What goes wrong:** `ops init` scanning entire codebase takes too long (>10 seconds).
**Why it happens:** Recursive directory walk + grep on every file.
**How to avoid:** Respect `.gitignore` patterns by using `git ls-files` to get the file list (like fmap.cjs does). Only scan files matching framework pattern globs. Short-circuit on large directories.
**Warning signs:** Timeout on real-world projects.

## Code Examples

### Registry CRUD Operations
```javascript
// Source: Derived from fmap.cjs pattern (verified)
const REGISTRY_FILENAME = 'registry.json';

function registryDir(cwd) {
  return path.join(planningRoot(cwd), 'ops');
}

function registryPath(cwd) {
  return path.join(registryDir(cwd), REGISTRY_FILENAME);
}

function readRegistry(cwd) {
  const p = registryPath(cwd);
  if (!fs.existsSync(p)) return { areas: [] };
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

function writeRegistry(cwd, registry) {
  const dir = registryDir(cwd);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, REGISTRY_FILENAME), JSON.stringify(registry, null, 2), 'utf-8');
}

function areaDir(cwd, slug) {
  return path.join(registryDir(cwd), slug);
}

function ensureAreaDir(cwd, slug) {
  const dir = areaDir(cwd, slug);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}
```

### Test Pattern
```javascript
// Source: tests/fmap.test.cjs pattern (verified)
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const { runGsdTools, createTempProject, cleanup } = require('./helpers.cjs');
const fs = require('fs');
const path = require('path');

describe('ops init', () => {
  let tmpDir;
  beforeEach(() => { tmpDir = createTempProject('ops-init-'); });
  afterEach(() => { cleanup(tmpDir); });

  test('creates registry.json with auto-detected areas', () => {
    // Seed a mock router file
    fs.mkdirSync(path.join(tmpDir, 'src', 'router'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'src', 'router', 'index.js'),
      `router.get('/users', handler);\nrouter.get('/products', handler);`);

    const result = runGsdTools('ops init', tmpDir);
    assert.strictEqual(result.success, true);

    const registry = JSON.parse(fs.readFileSync(
      path.join(tmpDir, '.planning', 'ops', 'registry.json'), 'utf-8'));
    assert.ok(registry.areas.length > 0);
  });
});
```

### Skill Command Markdown
```markdown
<!-- Source: Pattern from commands/gsd/ existing files -->
# /ops:init

Scan codebase and build the OPS system registry.

## Usage
\`/ops:init\`

## What it does
1. Scans codebase for route definitions and directory conventions
2. Auto-detects functional areas (features/screens)
3. Creates `.planning/ops/registry.json` with detected areas
4. Reports detected areas with confidence scores

## Implementation
Delegates to: `node gsd-tools.cjs ops init`
```

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | node:test (built-in, Node 20+) |
| Config file | none -- uses built-in runner |
| Quick run command | `node --test tests/ops.test.cjs` |
| Full suite command | `node --test tests/*.test.cjs` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| OPS-01 | ops init scans and produces registry.json | unit | `node --test tests/ops.test.cjs --test-name-pattern "ops init"` | Wave 0 |
| OPS-01 | route-driven detection finds areas from router files | unit | `node --test tests/ops.test.cjs --test-name-pattern "route detection"` | Wave 0 |
| OPS-01 | directory-convention fallback detects areas | unit | `node --test tests/ops.test.cjs --test-name-pattern "directory detection"` | Wave 0 |
| OPS-02 | ops map produces tree.json with nodes and edges | unit | `node --test tests/ops.test.cjs --test-name-pattern "ops map"` | Wave 0 |
| OPS-02 | tree.json follows adjacency list schema (D-10 through D-12) | unit | `node --test tests/ops.test.cjs --test-name-pattern "tree schema"` | Wave 0 |
| OPS-03 | ops add creates manual entry in registry | unit | `node --test tests/ops.test.cjs --test-name-pattern "ops add"` | Wave 0 |
| OPS-04 | per-area data persists in .planning/ops/{area}/ | unit | `node --test tests/ops.test.cjs --test-name-pattern "area persistence"` | Wave 0 |
| ALL | CLI subcommands route correctly | unit | `node --test tests/ops.test.cjs --test-name-pattern "dispatcher"` | Wave 0 |

### Sampling Rate
- **Per task commit:** `node --test tests/ops.test.cjs`
- **Per wave merge:** `node --test tests/*.test.cjs`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/ops.test.cjs` -- covers OPS-01 through OPS-04
- [ ] No framework install needed (node:test is built-in)

## Discretion Recommendations

Areas where CONTEXT.md grants Claude's discretion -- here are recommendations:

### Dedup Strategy (route vs directory detected)
**Recommendation:** Merge by slug. If route-detection and directory-detection produce the same slug, keep one entry with `source: "auto"` and `detected_by: ["route", "directory"]` (array instead of string for merged entries). Route-detected data takes priority for name.

### Confidence Scoring
**Recommendation:** Simple 3-tier: HIGH (route file explicitly defines this area), MEDIUM (directory convention matches known pattern), LOW (directory exists but no known pattern match). Store as `confidence: "high"|"medium"|"low"` in registry entry. This is informational only -- all areas are included regardless of confidence.

### Per-Area Directory Initialization
**Recommendation:** Lazy creation. Create `.planning/ops/{area}/` only when `ops map` first writes `tree.json`. During `ops init`, only create `registry.json`. Avoids empty directory clutter. The `ops add` command should also create the directory immediately since the user explicitly wants that area.

### Node Metadata per Type
**Recommendation:** Keep metadata minimal for v1:
- route: `{ path: "/users", method: "GET" }`
- view/component: `{ framework: "vue" }` (if detectable)
- endpoint: `{ method: "GET", url: "/api/users" }`
- service/model: `{}` (empty -- extend in Phase 6-7)
- table: `{ table_name: "users" }` (if detectable)

### Human-Readable Table Output
**Recommendation:** Simple aligned columns via string padding:
```
Area              Source    Components  Last Scanned
usuarios          auto      12         2026-03-30
produtos          auto       8         2026-03-30
config            manual     3         2026-03-30
```

## Open Questions

1. **File list strategy for scanning**
   - What we know: fmap.cjs uses `git ls-files` for changed files; `ops init` needs full file list
   - What's unclear: Should `ops init` use `git ls-files` (respects .gitignore) or raw `fs.readdirSync` (works without git)?
   - Recommendation: Use `git ls-files` with fallback to recursive readdirSync (matching fmap.cjs pattern of git-first)

2. **Framework auto-detection**
   - What we know: D-08 says configurable JSON mapping for framework patterns
   - What's unclear: Should this config live in `.planning/config.json` under an `ops` key, or be hardcoded in ops.cjs as a constant?
   - Recommendation: Start as constant in ops.cjs (like `MODEL_PROFILES` in model-profiles.cjs). Move to config.json only if users request customization. Keeps v1 simple.

3. **Import/dependency scanning depth for tree.json**
   - What we know: D-10 through D-12 define the graph schema
   - What's unclear: How deep should `ops map` scan for dependencies? Full recursive import analysis is complex.
   - Recommendation: One-level scan per node type. Routes -> find component in route file. Component -> grep for imports. Imports -> check if imported file is in known area. Keep it shallow for v1, deepen in Phase 6-7.

## Sources

### Primary (HIGH confidence)
- `get-shit-done/bin/lib/fmap.cjs` -- Verified lib module pattern (readMap/writeMap, cmd* exports)
- `get-shit-done/bin/lib/core.cjs` -- Verified path helpers (planningRoot, generateSlugInternal, output, error)
- `get-shit-done/bin/gsd-tools.cjs` -- Verified dispatcher pattern (case routing, require at top)
- `tests/fmap.test.cjs` -- Verified test pattern (node:test, helpers.cjs, createTempProject)
- `tests/helpers.cjs` -- Verified test helpers (runGsdTools, createTempProject, cleanup)

### Secondary (MEDIUM confidence)
- Phase 5 CONTEXT.md -- All 20 locked decisions verified and cross-referenced

### Tertiary (LOW confidence)
- Framework detection regex patterns -- based on general knowledge of Vue Router, Laravel, Express conventions. Should be validated against real project files during implementation.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- zero new dependencies, all built-in Node.js modules
- Architecture: HIGH -- follows established fmap.cjs pattern exactly, all decisions locked in CONTEXT.md
- Pitfalls: MEDIUM -- detection heuristics are novel, real-world edge cases may surface
- Graph schema: HIGH -- fully specified in D-10 through D-14

**Research date:** 2026-03-30
**Valid until:** 2026-04-30 (stable domain -- no external dependencies to go stale)
