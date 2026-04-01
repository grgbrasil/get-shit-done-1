# Phase 1: Function Map - Research

**Researched:** 2026-03-29
**Domain:** JSON symbol registry, Serena MCP, grep-based code analysis, CLI module design (CommonJS)
**Confidence:** HIGH

## Summary

Phase 1 builds a flat JSON registry (`.planning/function-map.json`) of every significant function, method, and class in the project codebase — indexed by `file::Class::method` key for O(1) lookup. The map stores `kind`, `signature`, `purpose`, `callers[]`, `calls[]`, `language`, `exported`, and `last_updated` per entry. It does NOT store return types or param types inline — those are fetched on-demand from the MCP provider.

Population is done by a dedicated `gsd-cataloger` agent running on a cheap model (Haiku for Anthropic profile, or OpenRouter-routed model for budget). The cataloger has two provider paths: Serena MCP (primary) and LLM-assisted grep (fallback). Both paths produce identical JSON output. Updates are incremental by default — only files touched by the current plan are rescanned, using git diff to identify changed files. Full rescan is available as an explicit user command or safety fallback.

The CLI surface is `gsd-tools fmap <subcommand>` (get, update, stats, full-scan). Agents never read `function-map.json` directly — they always go through `gsd-tools fmap get <key>`. This design keeps the map queryable in <1s and prevents context bloat from loading the full JSON.

**Primary recommendation:** Build `fmap.cjs` as a standard lib module following the same pattern as `state.cjs`, register it in `gsd-tools.cjs` under the `fmap` case, and create `gsd-cataloger.md` agent with explicit Serena + grep fallback logic.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-01** Hybrid symbol scope — classes/exports as top-level entries, methods cataloged only when they have external callers (referenced outside their own file).

**D-02** Serena tools: `get_symbols_overview` for top-level classes/exports; `find_referencing_symbols` only for symbols referenced outside their own file.

**D-03** Constants and re-exported types enter as `exports[]` at the file level, not as individual method entries.

**D-04** Incremental update by default — rescan only files changed by the current plan (via git diff or file tracking).

**D-05** Full rescan available as fallback — activated by user or when problems are detected.

**D-06** Dedicated script for Function Map queries (`gsd-tools fmap get`) — AI never reads the JSON directly.

**D-07** Flat JSON file with O(1) lookup by key (FMAP-06).

**D-08** Fields per entry: `kind` (function/method/class/arrow), `signature`, `purpose`, `callers[]` (file:line), `calls[]` (dependencies), `language` (js/ts/vue/php), `exported` (boolean), `last_updated` (ISO timestamp).

**D-09** No `return_type`/`param_types` in map — MCP provider delivers those on-demand when needed.

**D-10** File location: `.planning/function-map.json`.

**D-11** LLM-assisted grep fallback — grep discovers candidate files, cheap model reads chunks and extracts structured data.

**D-12** Zero regex maintenance — the model interprets any language generically.

**D-13** JSON output identical to Serena path — same structure regardless of source.

**D-14** Pluggable provider interface — Serena MCP is the default, but other MCPs can serve as source.

**D-15** Cataloger agent detects which MCP is available and uses the best available, fallback to LLM-assisted grep.

### Claude's Discretion

- Exact key format (recommendation: `file::Class::method` for multi-language robustness, but can adjust if better rationale is found during implementation).
- Changed-file detection strategy (git diff vs file watcher vs other approach).
- Internal design of the cataloger agent prompt.
- Exact format of `callers[]` and `calls[]` (file:line vs file::function vs both).

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FMAP-01 | Function Map stores in flat JSON all functions/methods/classes with signature, purpose, and file | D-07, D-08, D-10 — flat JSON at `.planning/function-map.json`, fields locked |
| FMAP-02 | Each entry includes callers[] array (file:line) and calls[] array (dependencies) | D-08 — both arrays are in the locked schema |
| FMAP-03 | Function Map populated via Serena MCP (get_symbols_overview + find_referencing_symbols) | D-02, D-14, D-15 — Serena as primary provider, detection pattern below |
| FMAP-04 | Function Map has grep fallback for environments without Serena | D-11, D-12, D-13 — LLM-assisted grep, identical output schema |
| FMAP-05 | Function Map refreshed automatically each execution (not just at commit) | D-04 — incremental update hook into execute-phase trigger |
| FMAP-06 | Function Map supports O(1) lookup by `file::function` key | D-06, D-07 — flat JSON, CLI tool enforces access pattern |
| FMAP-07 | Cataloger agent runs on cheap model (Haiku or third-party via OpenRouter) | MODEL_PROFILES pattern — add `gsd-cataloger: { quality: 'haiku', balanced: 'haiku', budget: 'haiku' }` |
</phase_requirements>

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js fs | built-in | Read/write `.planning/function-map.json` | Same as every other lib module |
| Node.js child_process | built-in | `execSync` for git diff, grep commands | Already used in `core.cjs`, `commands.cjs` |
| Serena MCP | runtime | `get_symbols_overview`, `find_referencing_symbols`, `find_symbol` | Already installed in this project; supports 40+ languages via LSP |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| JSON.parse/stringify | built-in | Read/write function-map.json | Always — flat JSON, no heavy parser needed |
| node:path | built-in | Cross-platform key normalization | When normalizing file paths into keys |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Serena MCP symbols | tree-sitter / AST parsers | Out of scope — Serena covers 40+ langs without native deps; tree-sitter needs per-language grammars |
| LLM-assisted grep fallback | Pure regex extraction | Pure regex breaks on edge cases (multiline, generics, decorators); LLM approach is zero-maintenance |
| Flat JSON | SQLite / embedded DB | No query needs beyond O(1) key lookup; JSON is simpler, git-diffable, no extra deps |

**Installation:** No new npm dependencies — all required modules are Node.js built-ins or already present.

---

## Architecture Patterns

### Recommended Project Structure

```
get-shit-done/bin/lib/
└── fmap.cjs                  # New lib module: CRUD for function-map.json

agents/
└── gsd-cataloger.md          # New agent: populates/updates the Function Map

.planning/
└── function-map.json         # New artifact: the map itself
```

### Pattern 1: fmap.cjs — Standard Lib Module

**What:** CommonJS module exporting `cmdFmapGet`, `cmdFmapUpdate`, `cmdFmapStats`, `cmdFmapFullScan`. Registered in `gsd-tools.cjs` dispatcher under `case 'fmap'`.

**When to use:** All Function Map CRUD goes through this module. No other code reads `function-map.json` directly.

**Example — gsd-tools.cjs dispatcher extension:**
```javascript
// Source: existing pattern from gsd-tools.cjs dispatcher
case 'fmap': {
  const fmap = require('./lib/fmap.cjs');
  const subcommand = args[1];
  if (subcommand === 'get') {
    fmap.cmdFmapGet(cwd, args[2], raw);
  } else if (subcommand === 'update') {
    fmap.cmdFmapUpdate(cwd, args.slice(2), raw);
  } else if (subcommand === 'stats') {
    fmap.cmdFmapStats(cwd, raw);
  } else if (subcommand === 'full-scan') {
    fmap.cmdFmapFullScan(cwd, raw);
  } else {
    error(`Unknown fmap subcommand: ${subcommand}`);
  }
  break;
}
```

**Example — fmap.cjs module skeleton:**
```javascript
// Source: modeled on get-shit-done/bin/lib/state.cjs and config.cjs patterns
const fs = require('fs');
const path = require('path');
const { output, error, planningRoot } = require('./core.cjs');

const FMAP_PATH_RELATIVE = path.join('.planning', 'function-map.json');

function fmapPath(cwd) {
  return path.join(planningRoot(cwd), 'function-map.json');
}

function readMap(cwd) {
  const p = fmapPath(cwd);
  if (!fs.existsSync(p)) return {};
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

function writeMap(cwd, map) {
  const p = fmapPath(cwd);
  fs.writeFileSync(p, JSON.stringify(map, null, 2), 'utf-8');
}

// O(1) lookup by key — agents always use this, never read the JSON directly
function cmdFmapGet(cwd, key, raw) {
  const map = readMap(cwd);
  if (!key) {
    output(map, raw);
    return;
  }
  const entry = map[key];
  if (!entry) {
    error(`Function Map: key not found: ${key}`);
    return;
  }
  output(entry, raw);
}

// Merge one or more entries into the map (incremental update)
function cmdFmapUpdate(cwd, args, raw) {
  // args[0] = path to JSON patch file, or --data '{json}'
  const dataIdx = args.indexOf('--data');
  let patch;
  if (dataIdx !== -1) {
    patch = JSON.parse(args[dataIdx + 1]);
  } else if (args[0]) {
    patch = JSON.parse(fs.readFileSync(args[0], 'utf-8'));
  } else {
    error('fmap update: requires --data <json> or a JSON file path');
    return;
  }
  const map = readMap(cwd);
  Object.assign(map, patch);
  writeMap(cwd, map);
  output({ updated: Object.keys(patch).length, total: Object.keys(map).length }, raw);
}

function cmdFmapStats(cwd, raw) {
  const map = readMap(cwd);
  const entries = Object.values(map);
  const byKind = entries.reduce((acc, e) => {
    acc[e.kind] = (acc[e.kind] || 0) + 1;
    return acc;
  }, {});
  output({ total: entries.length, by_kind: byKind, path: fmapPath(cwd) }, raw);
}

// Full rescan — delegates to gsd-cataloger agent; this command just signals intent
function cmdFmapFullScan(cwd, raw) {
  output({ action: 'full-scan', message: 'Trigger gsd-cataloger agent for full rescan' }, raw);
}

module.exports = { cmdFmapGet, cmdFmapUpdate, cmdFmapStats, cmdFmapFullScan };
```

### Pattern 2: gsd-cataloger Agent Definition

**What:** Agent markdown file in `agents/` with role, tool permissions (including Serena MCP), and provider detection logic. Runs on Haiku model.

**When to use:** Spawned by execute-phase at the start of each execution to perform incremental update, or by user for full rescan.

**Example — agents/gsd-cataloger.md frontmatter:**
```yaml
---
name: gsd-cataloger
description: Populates and updates the Function Map JSON registry using Serena MCP or grep fallback.
tools: Read, Bash, Grep, Glob, mcp__serena__get_symbols_overview, mcp__serena__find_referencing_symbols, mcp__serena__find_symbol
permissionMode: acceptEdits
color: cyan
---
```

**Key cataloger behaviors:**
1. Detect Serena availability: attempt `mcp__serena__get_symbols_overview` on a known file; if it fails, fall back to grep path.
2. Serena path: iterate target files, call `get_symbols_overview` for top-level symbols, then call `find_referencing_symbols` for each symbol to check external callers. If callers exist outside the file, catalog the method.
3. Grep path: run `grep -rn "function\|class\|const.*=.*=>" --include="*.ts" --include="*.js"` to find candidates, then pass chunks to itself (the cheap model) to extract structured data.
4. Output: call `gsd-tools fmap update --data '<json>'` to merge results into the map.

### Pattern 3: Key Format

**What:** `"relative/path/to/file.ts::ClassName::methodName"` — three parts joined by `::`. Top-level functions use `"relative/path/to/file.ts::functionName"`.

**Why `::` separator:** Forward slashes are already used in file paths; `::` is unambiguous across JS/TS/PHP/Vue. Consistent with Serena's `name_path` convention (uses `.` for nested, but `::` is safer across languages where `.` can appear in names).

**Examples:**
```
"sdk/src/phase-runner.ts::PhaseRunner::runPhase"
"get-shit-done/bin/lib/fmap.cjs::cmdFmapGet"
"src/services/User.vue::fetchUser"
```

### Pattern 4: Incremental Update Trigger

**What:** Execute-phase workflow already has a pre-execution initialization step (`init execute-phase`). The incremental fmap update runs here, passing the list of changed files.

**Changed-file detection — recommended approach (git diff):**
```bash
# Get files changed by the current plan's tasks (known at plan-start)
git diff --name-only HEAD~1 HEAD 2>/dev/null || git diff --name-only --cached
```
This is simpler than a file watcher, has no runtime overhead, and integrates naturally with the existing commit-per-task pattern.

**Alternative (file tracking):** Track which files each plan task writes. More precise but requires executor cooperation. Deferred to discretion of implementer.

### Pattern 5: Model Registration for gsd-cataloger

**What:** Add `gsd-cataloger` to `MODEL_PROFILES` in `model-profiles.cjs`.

**Example:**
```javascript
// Source: get-shit-done/bin/lib/model-profiles.cjs
const MODEL_PROFILES = {
  // ... existing entries ...
  'gsd-cataloger': { quality: 'haiku', balanced: 'haiku', budget: 'haiku' },
};
```

This ensures `gsd-tools resolve-model gsd-cataloger` always returns Haiku regardless of the project's model profile, satisfying FMAP-07.

### Anti-Patterns to Avoid

- **Reading function-map.json directly in agent prompts:** Inflates context. Always use `gsd-tools fmap get <key>`.
- **Storing return_type/param_types in the map:** Decided against (D-09). The map stays lean; type info comes from Serena on-demand.
- **Blocking execution on fmap update:** The incremental update should be non-blocking or very fast. If Serena is slow, run the update after the first task completes, not before.
- **Using complex regexes for grep fallback:** Fragile. The LLM interprets the raw grep output — no regex needed beyond file discovery.
- **Writing the full map on every update:** Use `Object.assign(existing, patch)` — only merge changed entries, preserve untouched entries.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Symbol discovery | Custom AST parser | Serena `get_symbols_overview` | Serena covers 40+ languages via LSP; custom parser needs per-language grammar |
| Cross-reference lookup | Manual grep + parse pipeline | Serena `find_referencing_symbols` | Serena handles imports, dynamic requires, indirect calls; grep misses many |
| JSON persistence | Custom format / SQLite | Plain `fs.readFileSync` / `fs.writeFileSync` | No query complexity; git tracks history; <1s read time for any realistic codebase size |
| Model routing | Inline model name strings | `MODEL_PROFILES` + `resolve-model` | Existing infrastructure; changing model config is one-line change |

**Key insight:** The Serena MCP is already installed and configured in this project. It does the hardest part (symbol extraction with cross-references) without any additional dependencies or native binaries.

---

## Common Pitfalls

### Pitfall 1: Serena MCP Availability is Not Guaranteed

**What goes wrong:** Cataloger agent assumes Serena is always available, fails silently when not, produces empty or stale map.

**Why it happens:** Serena is an MCP server — it may not be running, or the user's Claude Code session may not have it configured.

**How to avoid:** Cataloger agent MUST probe Serena before committing to the Serena path. Use a lightweight probe call (`get_symbols_overview` on a single small file). If it throws or returns empty, switch to grep path immediately.

**Warning signs:** `function-map.json` has zero entries, or entries stop updating after the first run.

### Pitfall 2: Key Collisions in Flat Map

**What goes wrong:** Two files have a function with the same name (e.g., both `utils/format.ts` and `helpers/format.ts` export `formatDate`). One entry overwrites the other.

**Why it happens:** Key format `file::function` uses relative file path as first component — should be unique. But if relative path normalization differs between runs (e.g., leading `./` on some runs), the same symbol gets two entries.

**How to avoid:** Normalize all file paths to POSIX format without leading `./` at write time. Use `path.relative(projectRoot, absPath).split(path.sep).join('/')` consistently.

**Warning signs:** `fmap stats` shows fewer entries than expected; two functions with same name in different files.

### Pitfall 3: Incremental Update Missing New Files

**What goes wrong:** A plan creates a new file. The incremental update only scans `git diff HEAD~1 HEAD` — but the new file was just committed, so it appears in the diff correctly. However, if the executor hasn't committed yet (mid-execution), `git diff --cached` is needed.

**Why it happens:** The timing of the fmap update relative to git commits matters. If update runs before the first task commit, no diff is available.

**How to avoid:** For the update trigger inside execute-phase, use `git diff --name-only HEAD` plus `git diff --name-only --cached` (both staged and unstaged). Or track files from PLAN.md's explicit file list (the `creates` / `modifies` frontmatter fields if they exist).

**Warning signs:** New files created during execution are not in the map after phase completes.

### Pitfall 4: Concurrent Writes During Parallel Waves

**What goes wrong:** Two parallel wave tasks both call `gsd-tools fmap update` simultaneously. The second write overwrites the first, losing entries.

**Why it happens:** Plain `readMap + merge + writeMap` is not atomic. Two Node.js processes doing this concurrently have a race condition.

**How to avoid:** Defer all fmap updates until wave completion (after parallel tasks finish), not inside each parallel task. The update step should be a post-wave sequential step, not per-task. This is noted as a known concern in STATE.md.

**Warning signs:** After multi-wave phase, map has fewer entries than expected; flaky updates.

### Pitfall 5: Map Grows Without Bound for Deleted Functions

**What goes wrong:** Functions are deleted or renamed but their old entries remain in the map.

**Why it happens:** Incremental update only adds/updates entries for changed files. It doesn't detect that an entry was removed.

**How to avoid:** For changed files, first delete ALL existing entries whose key starts with `changedFile::`, then re-add from fresh Serena/grep scan of that file. This is a "file-level replace" strategy, not pure merge.

**Warning signs:** `fmap stats` shows growing entry count even when codebase is shrinking; stale entries reference deleted files.

---

## Code Examples

### Full JSON Entry Shape

```json
{
  "sdk/src/phase-runner.ts::PhaseRunner::runPhase": {
    "kind": "method",
    "signature": "async runPhase(phaseNumber: string, options?: RunOptions): Promise<PhaseResult>",
    "purpose": "Orchestrates full phase lifecycle from discuss through verify steps",
    "callers": [
      "sdk/src/index.ts:142",
      "sdk/src/cli.ts:87"
    ],
    "calls": [
      "sdk/src/context-engine.ts::ContextEngine::resolveContextFiles",
      "sdk/src/session-runner.ts::SessionRunner::query"
    ],
    "language": "ts",
    "exported": true,
    "last_updated": "2026-03-29T14:00:00.000Z"
  }
}
```

### gsd-tools fmap get Usage Pattern

```bash
# O(1) lookup — agents use this, never read JSON directly
node gsd-tools.cjs fmap get "sdk/src/phase-runner.ts::PhaseRunner::runPhase"

# Get all entries (for full map dump — use sparingly)
node gsd-tools.cjs fmap get

# Stats (safe for frequent use)
node gsd-tools.cjs fmap stats
```

### Serena Provider Path (inside gsd-cataloger agent)

```
1. Call mcp__serena__get_symbols_overview({ relative_path: "sdk/src/phase-runner.ts" })
   → Returns: list of top-level symbols (classes, exported functions)

2. For each class: call mcp__serena__find_referencing_symbols({ symbol_name: "PhaseRunner", relative_path: "sdk/src/phase-runner.ts" })
   → Returns: list of files that import/reference PhaseRunner

3. For each method of the class: call mcp__serena__find_referencing_symbols for the method
   → If any caller is outside sdk/src/phase-runner.ts → include method in map
   → If all callers are internal → skip per D-01

4. Build JSON patch object, call: gsd-tools fmap update --data '<json>'
```

### Grep Fallback Path (inside gsd-cataloger agent)

```bash
# Step 1: Discover candidate lines
grep -rn --include="*.ts" --include="*.js" --include="*.cjs" \
  -E "(export (async )?function|export class|export const .+= (async )?\(|^\s+(async )?[a-zA-Z]+\()" \
  sdk/src/ get-shit-done/bin/

# Step 2: Pass output to cheap model (this agent IS the cheap model)
# Model reads the grep output and extracts:
#   - function/class name
#   - signature (best-effort from the line and next few lines)
#   - kind (function/method/class/arrow)
#   - exported (true if line starts with "export")
#   - language (from file extension)

# Step 3: For callers, run cross-reference grep:
grep -rn "functionName" --include="*.ts" --include="*.js" src/ | grep -v "functionName\s*(" | head -20
# Model interprets results to build callers[] array

# Step 4: Merge into map
node gsd-tools.cjs fmap update --data '<json_patch>'
```

### File-Level Replace Strategy (handles deletions)

```javascript
// In fmap.cjs cmdFmapUpdate, when called with --replace-file flag:
function replaceFileEntries(cwd, filePath, newEntries) {
  const map = readMap(cwd);
  const prefix = filePath + '::';
  // Remove all existing entries for this file
  for (const key of Object.keys(map)) {
    if (key.startsWith(prefix)) delete map[key];
  }
  // Add new entries
  Object.assign(map, newEntries);
  writeMap(cwd, map);
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Static code analysis (tree-sitter, ctags) | MCP-assisted symbol extraction (Serena LSP) | 2024+ | Language-agnostic, no native binaries, real-time |
| Regex-based function extraction | LLM-assisted grep interpretation | 2024+ | Works on any language/syntax, zero maintenance |
| Full-file context loading for impact | O(1) map lookup + targeted MCP calls | Phase 1 goal | Context window stays small; agents query what they need |

**Deprecated/outdated:**
- ctags/etags: Language coverage gaps, doesn't understand TypeScript generics, decorators, Vue SFCs.
- Pure grep pipelines: High false-positive rate on multiline signatures, type annotations.

---

## Open Questions

1. **Serena `find_referencing_symbols` output format**
   - What we know: Tool exists and is used in this project's CLAUDE.md guardrails
   - What's unclear: Exact JSON shape of the response — does it include line numbers? Does it return `file:line` pairs or just file names?
   - Recommendation: Cataloger agent must probe this on first run and adapt. Document discovered format in `callers[]` field comments in fmap.cjs.

2. **Callers[] format: `file:line` vs `file::function`**
   - What we know: CONTEXT.md leaves this to Claude's discretion
   - What's unclear: Whether line numbers will remain stable across edits (they won't for large files), making `file::function` more durable
   - Recommendation: Store BOTH — `"callers": [{ "file": "sdk/src/index.ts", "line": 142, "symbol": "GSD::runPhase" }]`. This future-proofs without breaking O(1) lookup on the primary key.

3. **execute-phase trigger point for incremental update**
   - What we know: phase-runner.ts has a phase lifecycle state machine; execute-phase workflow initializes via `init execute-phase`
   - What's unclear: Whether the update should run before task execution starts (warm cache) or after (accurate to latest commits)
   - Recommendation: Run AFTER first task commit (post-commit hook or explicit step in execute-phase workflow), so the map reflects actual state rather than pre-execution guess.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | fmap.cjs module | Yes | per package.json (>=20) | — |
| Serena MCP | gsd-cataloger primary path | Yes (configured in project) | runtime | LLM-assisted grep |
| git CLI | Changed-file detection | Yes (git repo) | system git | Scan all files (full rescan) |
| Haiku model | gsd-cataloger cheap model | Yes (via Anthropic API profile) | claude-haiku-* | sonnet if haiku unavailable |

**Missing dependencies with no fallback:** None — all critical paths have working alternatives.

**Missing dependencies with fallback:**
- Serena MCP: if unavailable at runtime, cataloger falls back to LLM-assisted grep (D-11 through D-13).

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Node.js built-in test runner via Vitest (tests/ dir uses Vitest via `npm test`) |
| Config file | `vitest.config.ts` (root) |
| Quick run command | `npm test -- tests/fmap.test.cjs` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FMAP-01 | `function-map.json` created with correct schema fields | unit | `npm test -- tests/fmap.test.cjs` | Wave 0 |
| FMAP-02 | Each entry has `callers[]` and `calls[]` arrays | unit | `npm test -- tests/fmap.test.cjs` | Wave 0 |
| FMAP-03 | Serena provider populates map correctly | integration | `npm test -- tests/fmap.test.cjs` | Wave 0 |
| FMAP-04 | Grep fallback produces same schema as Serena path | unit | `npm test -- tests/fmap.test.cjs` | Wave 0 |
| FMAP-05 | Incremental update only rescans changed files | unit | `npm test -- tests/fmap.test.cjs` | Wave 0 |
| FMAP-06 | `gsd-tools fmap get <key>` returns entry in <1s | unit | `npm test -- tests/fmap.test.cjs` | Wave 0 |
| FMAP-07 | `gsd-tools resolve-model gsd-cataloger` returns haiku on all profiles | unit | `npm test -- tests/model-profiles.test.cjs` | Exists (extend) |

### Sampling Rate

- **Per task commit:** `npm test -- tests/fmap.test.cjs --run`
- **Per wave merge:** `npm test -- tests/fmap.test.cjs tests/model-profiles.test.cjs --run`
- **Phase gate:** Full suite green (`npm test`) before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `tests/fmap.test.cjs` — covers FMAP-01 through FMAP-06 with temp project fixtures
- [ ] Update `tests/model-profiles.test.cjs` — add assertion for `gsd-cataloger` model resolution

*(Existing test infrastructure covers the surrounding code; only `fmap.cjs` is new and needs its test file.)*

---

## Project Constraints (from CLAUDE.md)

**Directives that constrain this phase's implementation:**

- **Zero new npm dependencies:** The project explicitly uses Node.js built-ins + Serena MCP + prompt engineering. No `npm install` for any new library.
- **CommonJS for lib modules:** New `fmap.cjs` must be CommonJS (`require`, `module.exports`), not ESM. All files in `get-shit-done/bin/lib/` use CJS.
- **One primary export per file:** `fmap.cjs` exports named functions only — `module.exports = { cmdFmapGet, cmdFmapUpdate, cmdFmapStats, cmdFmapFullScan }`.
- **Dispatcher pattern:** `gsd-tools.cjs` routes to `fmap.cjs` via `case 'fmap':` in the main switch. No standalone entry point.
- **No business logic in models:** `fmap.cjs` is a CRUD layer only. Provider detection (Serena vs grep) lives in the cataloger agent, not in fmap.cjs.
- **Agents use `gsd-{name}.md` naming:** New agent file must be `agents/gsd-cataloger.md`.
- **SOLID/DRY:** Provider abstraction (D-14) means the `fmap update` command accepts JSON regardless of source — Serena and grep paths are different agent behaviors, not different CLI commands.
- **No workarounds without authorization:** If Serena's exact API differs from assumptions, document and ask — don't write adapter shims silently.
- **TypeScript modules use `.js` imports:** If any SDK-side integration is added to `context-engine.ts`, imports must use `.js` extension.

---

## Sources

### Primary (HIGH confidence)

- Serena MCP (active in this session) — `get_symbols_overview`, `find_referencing_symbols` tools verified as available
- `get-shit-done/bin/gsd-tools.cjs` (read directly) — dispatcher pattern, command routing, existing subcommands
- `get-shit-done/bin/lib/` (read directly) — all 17 modules, CJS patterns, `model-profiles.cjs` structure
- `sdk/src/context-engine.ts` (read directly) — PHASE_FILE_MANIFEST pattern for injecting new files into agent context
- `agents/` (read directly) — agent frontmatter format, tool permissions pattern
- `.planning/config.json` (read directly) — `nyquist_validation: true` confirmed, commit_docs confirmed
- `tests/helpers.cjs` (read directly) — `createTempProject`, `runGsdTools` test utilities available for fmap tests

### Secondary (MEDIUM confidence)

- `.planning/codebase/STRUCTURE.md` (read directly) — confirms where to add new code, naming conventions
- `get-shit-done/workflows/map-codebase.md` (read directly) — Serena probe pattern, agent spawn model
- `.planning/phases/01-function-map/01-CONTEXT.md` (read directly) — all locked decisions D-01 through D-15

### Tertiary (LOW confidence)

- Serena `find_referencing_symbols` exact JSON response shape — not probed; assumed to return file+line pairs based on tool description. Cataloger agent must validate on first execution.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all components are Node.js built-ins or already present in codebase
- Architecture: HIGH — patterns directly modeled on existing lib modules and agent definitions
- Pitfalls: HIGH — concurrent wave writes and key normalization are real risks; Serena availability is a known concern from STATE.md
- Test approach: HIGH — existing test infrastructure is clear; only one new test file needed

**Research date:** 2026-03-29
**Valid until:** 2026-04-28 (stable domain — Node.js built-ins, Serena MCP; 30-day window reasonable)
