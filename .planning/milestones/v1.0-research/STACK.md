# Technology Stack

**Project:** GSD Guardrails & Global Memory
**Researched:** 2026-03-29

## Design Constraints (from PROJECT.md)

Before recommending stack: GSD is an npm package (`get-shit-done-cc`) with **zero runtime dependencies** (only devDependencies: vitest, esbuild, c8). All code is CommonJS (.cjs). The system runs as meta-prompts consumed by Claude Code / Gemini / Codex -- it orchestrates LLM agents, not traditional software. Any new tooling must:

1. Add zero npm dependencies (or be invoked via CLI/MCP, not bundled)
2. Work with the existing .cjs module system
3. Be language-agnostic (support JS/TS/Vue/PHP/Python/Go at minimum)
4. Fit within LLM context windows (artifacts must be compact)

## Recommended Stack

### 1. Architecture Decision Records (ADR)

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| MADR 4.0 format (template only) | 4.0.0 | ADR template structure | Industry standard. YAML front matter + structured markdown. LLM-readable. No library needed -- just a template. | HIGH |
| Plain markdown files in `.planning/decisions/` | N/A | Storage | Git-versioned, human-readable, LLM-parseable. Zero dependencies. Follows GSD pattern of `.planning/` directory. | HIGH |

**What NOT to use:**
- `adr-tools` (npm/homebrew CLI) -- Adds a runtime dependency for what is essentially `touch NNNN-title.md`. GSD agents can create files directly.
- `log4brains` -- Heavy tooling (React app, Docker) for browsing ADRs. Overkill. GSD agents read markdown directly.
- Database-backed ADR systems -- Violates the "flat file, git-versioned" constraint.

**Implementation approach:**
ADRs are markdown files following MADR 4.0 template, stored in `.planning/decisions/NNNN-short-title.md`. The GSD system provides a template and the orchestrator/planner reads them as context. No library, no CLI tool, no dependency.

MADR 4.0 minimal template structure:
```markdown
---
status: accepted | deprecated | superseded
date: YYYY-MM-DD
decision-makers: [list]
---
# ADR-NNNN: Short Title

## Context and Problem Statement
[What is the issue?]

## Decision Drivers
- [driver 1]

## Considered Options
1. [option 1]
2. [option 2]

## Decision Outcome
Chosen: [option], because [justification].

### Consequences
- Good: [positive]
- Bad: [negative]
```

**Sources:**
- [MADR 4.0.0 Official](https://adr.github.io/madr/) -- HIGH confidence
- [ADR GitHub community](https://adr.github.io/) -- HIGH confidence

---

### 2. Function/Symbol Mapping Registry (JSON)

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Serena MCP (`find_symbol`, `find_referencing_symbols`, `get_symbols_overview`) | latest | Symbol extraction engine | Already available in GSD's MCP stack. Uses LSP under the hood. Supports 40+ languages. Zero new dependencies. | HIGH |
| Custom JSON schema (hand-rolled) | N/A | Function Map storage format | Flat JSON for instant reads (<1s). No query engine needed. Schema defined by GSD, populated by agents using Serena. | HIGH |
| `grep` + regex fallback | N/A | Extraction when Serena unavailable | PROJECT.md explicitly states "grep/serena is sufficient for v1". Regex covers basic function/class extraction for any language. | HIGH |

**What NOT to use:**
- `tree-sitter` / `node-tree-sitter` (npm v0.25.1) -- Native binary dependency (C/Rust compilation). Breaks zero-dependency constraint. GSD is an npm package that must `npm install` cleanly on any machine without build tools. Serena already provides tree-sitter-quality analysis via MCP without bundling anything.
- `@ast-grep/napi` (npm v0.42.0) -- Same problem: native Rust bindings via napi.rs. Powerful but wrong context. Adds ~50MB native binary to what should be a lightweight meta-prompting system.
- `RepoMapper` MCP server -- Python-based, requires Python runtime. Adds infra complexity. Serena already covers this use case.
- Sourcegraph/Cody -- External service, not embeddable. Different use case.

**Function Map JSON Schema (recommended):**
```json
{
  "version": "1.0",
  "generated": "2026-03-29T12:00:00Z",
  "generator": "serena+grep",
  "files": {
    "src/lib/core.cjs": {
      "functions": {
        "parseConfig": {
          "line": 42,
          "signature": "function parseConfig(rawConfig, defaults)",
          "returns": "object",
          "exported": true,
          "callers": ["src/lib/init.cjs:initProject", "src/lib/commands.cjs:runCommand"],
          "calls": ["src/lib/config.cjs:validateSchema"]
        }
      },
      "classes": {},
      "exports": ["parseConfig", "mergeConfig"]
    }
  },
  "index": {
    "parseConfig": "src/lib/core.cjs",
    "mergeConfig": "src/lib/core.cjs"
  }
}
```

Key design decisions:
- **Flat `index` map** for O(1) symbol lookup by name
- **`callers` array** enables instant impact analysis ("who calls this?")
- **`calls` array** enables dependency tracing ("what does this use?")
- **`signature` as string** -- LLM-readable, no AST needed to understand it
- **Per-file grouping** -- matches how LLMs think about code (file-centric)

**Population strategy (two-tier):**
1. **Primary: Serena MCP** -- `get_symbols_overview` per file for exports/functions, `find_referencing_symbols` per exported symbol for callers. Accurate, semantic, language-aware.
2. **Fallback: grep + regex** -- For environments without Serena. Pattern: `function\s+(\w+)`, `exports\.\w+`, `module\.exports`, `class\s+(\w+)`, `def\s+(\w+)`. Less accurate but sufficient for v1.

**Sources:**
- [Serena MCP GitHub](https://github.com/oraios/serena) -- HIGH confidence (tool verified available)
- [Aider RepoMap architecture](https://aider.chat/2023/10/22/repomap.html) -- HIGH confidence (design inspiration for JSON schema)
- PROJECT.md constraint: "grep/serena is sufficient for v1" -- HIGH confidence

---

### 3. Impact Analysis (Breaking Change Detection)

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Function Map JSON (diff-based) | N/A | Detect signature changes | Compare pre-change vs post-change Function Map. Pure JSON diff. Zero dependencies. | HIGH |
| Serena MCP `find_referencing_symbols` | latest | Find affected callers | Given a changed function, Serena finds all call sites. Already available. | HIGH |
| Custom classification logic (in agent prompt) | N/A | Structural vs behavioral change detection | LLM classifies: signature change = auto-resolve; logic change = escalate. No library needed -- this is prompt engineering. | MEDIUM |

**What NOT to use:**
- `semver-diff` / API comparison tools -- Designed for package versioning, not function-level changes within a codebase.
- `api-extractor` (Microsoft) -- TypeScript-only, generates .d.ts rollups. Wrong granularity.
- Full static analysis (ESLint custom rules, SonarQube) -- Heavy, language-specific, requires infrastructure. GSD needs lightweight, LLM-driven analysis.
- Pre-commit hooks -- PROJECT.md explicitly states "mid-execution, not pre-commit" because the goal is to prevent the change, not detect it after.

**Impact Analysis Algorithm (recommended):**
```
1. BEFORE modifying function F:
   a. Read F's entry from Function Map JSON
   b. Note: signature, callers, return type

2. Agent proposes change to F

3. CLASSIFY the change:
   - Structural: signature changed (params added/removed/reordered, return type changed)
     -> AUTO-RESOLVE: update all callers automatically
   - Behavioral: logic/semantics changed but signature unchanged
     -> ESCALATE: ask human "function X behavior changed, Y callers affected"

4. AFTER modification:
   a. Update Function Map entry for F
   b. If structural: agent updates each caller
   c. If behavioral: human decides
```

This is implemented as **agent instructions in the execute-phase prompt**, not as a separate tool. The Function Map JSON is the data layer; the LLM is the analysis engine.

**Sources:**
- PROJECT.md: "Auto-resolve estrutural vs escalacao comportamental" -- HIGH confidence
- [Augment Code: 7 Tools for Breaking Change Detection](https://www.augmentcode.com/guides/7-tools-for-cross-service-breaking-change-detection) -- MEDIUM confidence (pattern reference)

---

### 4. Cross-Plan Memory

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| `.planning/memory/` directory (markdown + JSON) | N/A | Persistent cross-plan knowledge | Same pattern as `.planning/codebase/`. Git-versioned. LLM-readable. Zero dependencies. | HIGH |
| ADR files (subset of memory) | N/A | Decision persistence | Decisions from Phase 1 readable by Phase 5. Already covered by ADR system above. | HIGH |

**What NOT to use:**
- Vector databases (Pinecone, ChromaDB) -- Massive overkill. GSD agents read flat files. Context window is the "query engine."
- SQLite -- Adds dependency, agents cannot read it directly, needs tooling.
- Redis/external state -- GSD runs locally, no server dependencies.

---

## Full Stack Summary

| Component | Implementation | Dependencies Added | Confidence |
|-----------|---------------|-------------------|------------|
| ADR System | MADR 4.0 template + markdown files | **Zero** | HIGH |
| Function Map | JSON file + Serena MCP + grep fallback | **Zero** | HIGH |
| Impact Analysis | JSON diff + Serena callers + LLM classification | **Zero** | HIGH |
| Cross-Plan Memory | Markdown/JSON files in `.planning/memory/` | **Zero** | HIGH |
| Map Update Trigger | Hook in execute-phase prompt (instruction-based) | **Zero** | HIGH |

**Total new npm dependencies: 0**

This is deliberate. GSD is a meta-prompting system. Its "stack" is prompt templates, JSON schemas, and MCP tool orchestration. Adding npm dependencies would be solving the wrong problem -- the intelligence lives in the LLM agents, not in library code.

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Symbol extraction | Serena MCP | tree-sitter (npm v0.25.1) | Native binary dep. Serena already available via MCP. |
| Symbol extraction | Serena MCP | @ast-grep/napi (npm v0.42.0) | Native binary dep (Rust/napi.rs). ~50MB. |
| Symbol extraction | Serena MCP | RepoMapper MCP | Python dependency. Serena covers same use case. |
| ADR format | MADR 4.0 template | adr-tools CLI | Unnecessary dependency for file creation. |
| ADR format | MADR 4.0 template | Custom format | MADR is industry standard, no reason to diverge. |
| Impact analysis | JSON diff + LLM | Qodo/Greptile | External services, not embeddable. |
| Impact analysis | JSON diff + LLM | ESLint custom rules | Language-specific, heavy, wrong timing (build-time vs mid-execution). |
| Storage | Flat files (.planning/) | SQLite | Agents cannot read SQLite. Flat files = zero tooling. |
| Storage | Flat files (.planning/) | Vector DB | Overkill. Context window IS the query engine. |

---

## Installation

```bash
# No installation needed. Zero new dependencies.
# All components are:
# 1. Prompt templates (markdown files in get-shit-done/)
# 2. JSON schemas (documented in this file)
# 3. MCP tools (Serena -- already configured)
# 4. Flat files (.planning/ directory)
```

For Serena MCP (if not already configured):
```json
{
  "mcpServers": {
    "serena": {
      "command": "uvx",
      "args": ["serena"]
    }
  }
}
```

---

## Version Compatibility

| Component | Min Version | Notes |
|-----------|-------------|-------|
| Node.js | 20.0.0 | Already required by GSD |
| Serena MCP | latest | Rolling release, LSP-based |
| MADR template | 4.0.0 | Template only, no runtime |
| GSD | 1.30.0+ | Current version, extend not replace |

---

## Sources

- [MADR 4.0.0 Official Documentation](https://adr.github.io/madr/) -- Template format specification
- [ADR GitHub Community](https://adr.github.io/) -- ADR ecosystem overview
- [Serena MCP GitHub](https://github.com/oraios/serena) -- Symbol extraction tool
- [Aider Repository Map](https://aider.chat/2023/10/22/repomap.html) -- RepoMap architecture (design inspiration)
- [RepoMapper MCP](https://github.com/pdavis68/RepoMapper) -- Alternative considered
- [ast-grep](https://ast-grep.github.io/) -- Alternative considered
- [tree-sitter Node.js bindings](https://github.com/tree-sitter/node-tree-sitter) -- Alternative considered
- [Augment Code: Breaking Change Detection](https://www.augmentcode.com/guides/7-tools-for-cross-service-breaking-change-detection) -- Impact analysis patterns
