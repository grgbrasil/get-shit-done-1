# Architecture Patterns

**Domain:** AI-assisted development guardrails and global memory
**Researched:** 2026-03-29

## Recommended Architecture

The system extends GSD's existing orchestrator/agent architecture with three new data layers and one new behavioral constraint injected into existing workflows. No new services, no new runtimes, no new dependencies.

```
.planning/
  decisions/           <-- NEW: ADR storage (MADR 4.0 markdown)
    0001-use-serena-for-symbols.md
    0002-json-flat-function-map.md
  memory/              <-- NEW: Cross-plan knowledge
    discoveries.md
    constraints.md
  function-map.json    <-- NEW: Symbol registry
  codebase/            <-- EXISTING: map-codebase output
  STATE.md             <-- EXISTING: project state
  ROADMAP.md           <-- EXISTING: phase plan
```

### Component Boundaries

| Component | Responsibility | Communicates With | Implementation |
|-----------|---------------|-------------------|----------------|
| ADR System | Store and retrieve architectural decisions | plan-phase, discuss-phase, execute-phase | MADR 4.0 templates + file conventions |
| Function Map | Store symbol registry (functions, classes, callers, exports) | execute-phase (read), map-update hook (write) | Single JSON file at .planning/function-map.json |
| Impact Analyzer | Classify changes as structural vs behavioral, find affected callers | execute-phase (inline), Function Map (data source), Serena MCP (live verification) | Prompt instructions in execute-phase agent |
| Map Updater | Refresh Function Map entries for modified files after execution | execute-phase (trigger), Serena MCP (extraction), Function Map (write) | Post-execution step in execute-phase workflow |
| Memory System | Persist discoveries and constraints across plans | plan-phase (read), execute-phase (write), milestone-summary (write) | Markdown files in .planning/memory/ |

### Data Flow

**Flow 1: Function Map Population (initial)**
```
/gsd:map-codebase (or new /gsd:map-functions command)
  |
  v
For each source file:
  Serena get_symbols_overview -> list of symbols
  Serena find_referencing_symbols (per export) -> callers
  |
  v
Write .planning/function-map.json
```

**Flow 2: Impact Analysis (mid-execution)**
```
Execute-phase agent receives task: "modify function X"
  |
  v
1. Read function-map.json, find X entry
2. Note: signature, callers, calls
3. Agent proposes change
  |
  v
4. CLASSIFY:
   - Signature changed? -> STRUCTURAL -> auto-update callers
   - Logic changed? -> BEHAVIORAL -> escalate to human
  |
  v
5. If structural: modify all callers listed in function-map.json
6. Update function-map.json entry for X
```

**Flow 3: ADR Lifecycle**
```
discuss-phase or plan-phase identifies architectural decision
  |
  v
Agent creates .planning/decisions/NNNN-title.md (MADR 4.0)
  |
  v
All subsequent plan-phase and execute-phase agents read decisions/ dir
  -> Informed by prior decisions
  -> Cannot contradict without creating superseding ADR
```

**Flow 4: Cross-Plan Memory**
```
execute-phase discovers constraint or insight
  |
  v
Appends to .planning/memory/discoveries.md
  |
  v
Next plan-phase reads .planning/memory/ before planning
  -> Informed by discoveries from prior phases
```

## Patterns to Follow

### Pattern 1: Prompt-as-Code (Behavioral Injection)
**What:** Instead of building a separate "impact analysis tool," inject impact analysis instructions directly into the execute-phase agent prompt. The LLM is the analysis engine.
**When:** Whenever the "logic" is classification, judgment, or decision-making -- tasks LLMs excel at.
**Why:** Zero runtime cost, zero dependencies, version-controlled with the system, language-agnostic.
**Example:**
```markdown
## Before Modifying Any Function

1. Read `.planning/function-map.json`
2. Find the function you're about to modify
3. If the function has callers:
   a. Check if your change modifies the signature (params, return type)
   b. If YES: update all callers to match new signature
   c. If your change modifies behavior/logic but NOT signature:
      STOP and ask the user: "Function X has N callers. My change
      alters its behavior. Proceed?"
4. After modification: update the function-map.json entry
```

### Pattern 2: Single Source of Truth (SSoT) File
**What:** Each data type has exactly one canonical location. No copies, no caches, no derived state.
**When:** Always. Especially for Function Map and ADRs.
**Why:** Prevents staleness, simplifies updates, avoids sync bugs.
**Locations:**
- Function Map: `.planning/function-map.json` (one file, not per-directory)
- ADRs: `.planning/decisions/` (one directory, sequential numbering)
- Memory: `.planning/memory/` (one directory, topic-based files)

### Pattern 3: Incremental Updates Over Full Rebuilds
**What:** When a file changes, update only that file's entries in function-map.json. Don't rebuild the entire map.
**When:** During execute-phase, after modifying source files.
**Why:** Full rebuild is expensive (Serena call per file). Incremental is O(files_changed), not O(all_files).
**Implementation:**
```
1. Track which files the executor modified
2. For each modified file:
   a. Re-extract symbols via Serena
   b. Update that file's entry in function-map.json
   c. Update callers/calls cross-references
```

### Pattern 4: Graceful Degradation
**What:** Every feature must work (at reduced quality) without Serena MCP.
**When:** Serena not configured, or LSP not available for a language.
**Why:** GSD must be usable by anyone, including users without Serena.
**Implementation:**
- Function Map population: Falls back to grep-based extraction
- Impact analysis: Falls back to "warn user, don't auto-resolve"
- Symbol lookup: Falls back to Grep tool

## Anti-Patterns to Avoid

### Anti-Pattern 1: Building a Separate Runtime
**What:** Creating a Node.js service/daemon that maintains the Function Map in memory.
**Why bad:** GSD is meta-prompting (markdown files consumed by LLMs). Adding a runtime creates deployment complexity, process management, crash recovery -- none of which exist in current GSD.
**Instead:** Flat files. Read/write via agent tools. The "runtime" is the LLM agent.

### Anti-Pattern 2: Over-Indexing the Function Map
**What:** Trying to map every variable, every import, every type alias.
**Why bad:** Context window inflation. A 500KB function-map.json is useless -- agents can't read it. Focus on exported functions and their callers.
**Instead:** Map only: exported functions, public class methods, module.exports. Skip: internal helpers, variables, type definitions.

### Anti-Pattern 3: Synchronous Map Updates
**What:** Blocking execution until the Function Map is fully updated after every file change.
**Why bad:** Slows down execution. Agent writes 5 files, waits for 5 Serena round-trips before proceeding.
**Instead:** Batch updates. Agent tracks modified files, updates map at end of execution step (not after each file).

### Anti-Pattern 4: ADR Approval Workflows
**What:** Requiring human approval before an ADR is "accepted."
**Why bad:** GSD agents need to record decisions in real-time during planning. Approval workflows add friction and latency.
**Instead:** Agents create ADRs with status "accepted" during planning. Humans can later supersede with a new ADR if they disagree. The audit trail exists either way.

## Scalability Considerations

| Concern | At 10 files | At 100 files | At 1000+ files |
|---------|-------------|--------------|----------------|
| Function Map size | <10KB, trivial | ~50-100KB, fits in context | 500KB+, needs selective loading |
| Map population time | <30s | 2-5 min | 10+ min, needs parallel agents |
| Impact analysis lookup | Instant (full map in context) | Instant (full map in context) | Need index-based lookup, partial load |
| ADR count | 1-5, all fit in context | 10-20, all fit in context | 50+, need summary/index file |
| Cross-reference accuracy | Very high | High | Medium (more indirect dependencies) |

**Scaling strategy for 1000+ file projects:**
1. Function Map split by directory (e.g., `function-map-src-lib.json`)
2. Master index file maps symbol -> sub-map file
3. Agents load only relevant sub-maps based on files being modified
4. Not needed for v1 -- optimize when real projects hit the limit

## Integration Points with Existing GSD

| GSD Component | How It Changes | What It Reads |
|---------------|---------------|---------------|
| `plan-phase.md` | Add step: "Read .planning/decisions/ before planning" | ADRs, memory |
| `execute-phase.md` | Add pre-modification impact check + post-execution map update | Function Map, ADRs |
| `discuss-phase.md` | Add step: "Create ADR for architectural decisions" | ADRs |
| `map-codebase.md` | Extend to also populate function-map.json | Source files (via Serena) |
| `complete-milestone.md` | Add step: "Write memory summary" | Function Map, ADRs |
| `gsd-tools.cjs` | No change needed for v1 | N/A |

## Sources

- [Aider RepoMap Architecture](https://aider.chat/2023/10/22/repomap.html) -- Repository mapping patterns
- [Serena MCP](https://github.com/oraios/serena) -- Symbol extraction via LSP
- [MADR 4.0](https://adr.github.io/madr/) -- ADR format specification
- GSD existing workflows -- map-codebase.md, execute-phase patterns
