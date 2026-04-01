# Claude Code Internals: Memory, Skills, Plugins, Context, and State

**Source:** `/Volumes/SSD/Desenvolvimento/claude-code-sourcemap-main/restored-src/src/`
**Researched:** 2026-04-01
**Confidence:** HIGH (direct source code analysis)

---

## 1. Memory System (`src/memdir/`)

### Architecture Overview

Claude Code's memory is a **file-based, directory-scoped, typed system** with no database. Everything is markdown files in `~/.claude/projects/<sanitized-cwd>/memory/`. The key insight: memory is explicitly NOT for code-derivable information -- only for user preferences, feedback, project context, and external references.

### The 4 Memory Types (`memoryTypes.ts`)

```typescript
export const MEMORY_TYPES = ['user', 'feedback', 'project', 'reference'] as const
```

| Type | Scope | What It Stores | Decay Rate |
|------|-------|----------------|------------|
| `user` | Always private | Role, goals, expertise, preferences | Low |
| `feedback` | Default private, can be team | Corrections AND confirmations of approach | Medium |
| `project` | Bias toward team | Ongoing work, deadlines, decisions, initiatives | High |
| `reference` | Usually team | Pointers to external systems (Linear, Grafana, etc.) | Low |

**Key design decision:** Memory explicitly excludes code patterns, architecture, git history, file structure -- these are derivable from the repo. This prevents memory rot where stale code observations contradict reality.

### MEMORY.md Entrypoint Pattern (`memdir.ts`)

The system uses a two-tier index pattern:

1. **`MEMORY.md`** -- An index file (NOT content). Each entry is one line under ~150 chars: `- [Title](file.md) -- one-line hook`
2. **Individual topic files** -- `user_role.md`, `feedback_testing.md`, etc., with frontmatter

**Hard limits:**
```typescript
export const MAX_ENTRYPOINT_LINES = 200
export const MAX_ENTRYPOINT_BYTES = 25_000  // ~125 chars/line at 200 lines
```

The `truncateEntrypointContent()` function enforces both limits, line-truncating first (natural boundary), then byte-truncating at the last newline. A WARNING is appended when truncation occurs.

**GSD Implication:** This two-tier pattern (index + topic files) is directly adoptable for GSD's cross-phase memory. An index stays in context; detail files are read on demand.

### Memory File Format

Each memory file has YAML frontmatter:
```markdown
---
name: {{memory name}}
description: {{one-line description -- used to decide relevance}}
type: {{user, feedback, project, reference}}
---
{{content -- for feedback/project: rule/fact, then **Why:** and **How to apply:**}}
```

The `description` field is critical -- it's what the relevance selector reads to decide whether to surface the memory. The `type` field enables filtering.

### Memory Path Resolution (`paths.ts`)

Resolution order (first defined wins):
1. `CLAUDE_COWORK_MEMORY_PATH_OVERRIDE` env var (full-path override)
2. `autoMemoryDirectory` in settings.json (trusted sources only: policy/local/user -- NOT project settings for security)
3. `<memoryBase>/projects/<sanitized-git-root>/memory/`

**Security:** Project-level settings are excluded from path override because a malicious repo could set `autoMemoryDirectory: "~/.ssh"` to gain write access.

The path is **memoized** on `getProjectRoot()` -- computed once per session to avoid expensive stat calls on every render.

**Git worktree awareness:** Uses `findCanonicalGitRoot()` so all worktrees of the same repo share one memory directory.

### Relevance-Based Recall (`findRelevantMemories.ts`)

This is the most architecturally interesting pattern. Rather than loading all memories, Claude Code does **AI-powered memory selection**:

1. **Scan:** `scanMemoryFiles()` recursively reads `*.md` files (excluding MEMORY.md), parses frontmatter (first 30 lines only), and returns a header list sorted newest-first (capped at 200 files)
2. **Select:** A Sonnet `sideQuery` receives the user's query + memory manifest (filename, type, timestamp, description) and returns up to 5 relevant filenames
3. **Surface:** Selected files are injected into the conversation as `<system-reminder>` attachments

The selector prompt explicitly tells Sonnet:
- Be selective and discerning -- only include clearly useful memories
- If recently-used tools are provided, skip usage reference docs for those tools (Claude is already using them), but DO still include warnings/gotchas
- Return empty list if nothing is relevant

**GSD Implication:** This pattern of "scan headers + AI select + inject on demand" is powerful for cross-phase memory. GSD could use a simpler heuristic (keyword matching) or the same sideQuery pattern.

### Memory Prefetching (`query.ts` + `attachments.ts`)

Memory search starts as a **non-blocking async prefetch** before the main query loop processes the user message:

```typescript
using pendingMemoryPrefetch = startRelevantMemoryPrefetch(messages, toolUseContext)
```

Uses `using` (TC39 Explicit Resource Management) with `[Symbol.dispose]` to auto-abort on cleanup. The prefetch:
- Extracts the last real user message (skipping system injections)
- Skips single-word prompts (not enough context)
- Tracks already-surfaced memories to avoid re-picking
- Has a `MAX_SESSION_BYTES` cap to prevent memory flooding
- Chains to the turn-level AbortController so user Escape cancels immediately

### Memory Staleness (`memoryAge.ts`)

Memories > 1 day old get a staleness caveat:
```
This memory is 47 days old. Memories are point-in-time observations, not live state --
claims about code behavior or file:line citations may be outdated.
Verify against current code before asserting as fact.
```

The "Before recommending from memory" section in the system prompt adds verification rules:
- If memory names a file path: check it exists
- If memory names a function/flag: grep for it
- "The memory says X exists" is not the same as "X exists now"

**GSD Implication:** Phase-specific memories in GSD should include timestamps and similar staleness checks. Decisions from phase 1 may be invalidated by phase 3 changes.

### Team Memory (`teamMemPaths.ts`, `teamMemPrompts.ts`)

Feature-gated behind `TEAMMEM`. Adds a shared team directory at `<autoMemPath>/team/`. The combined prompt:
- Has two directories (private + team) with separate MEMORY.md indexes
- Types gain `<scope>` tags (always private, default private, bias team, usually team)
- Team memories are synced at session start
- Sensitive data (API keys, credentials) explicitly prohibited in team memories

### Assistant/KAIROS Mode Daily Log

For long-running assistant sessions, the memory paradigm shifts:
- Instead of maintaining MEMORY.md as a live index, appends to date-named log files: `logs/YYYY/MM/YYYY-MM-DD.md`
- A separate nightly `/dream` skill distills logs into topic files + MEMORY.md
- MEMORY.md is still loaded as the distilled index, but new memories go to the log

---

## 2. Skill System (`src/skills/`)

### Skill Types

There are four sources of skills, loaded in a specific order:

| Source | Location | LoadedFrom Value | Priority |
|--------|----------|-----------------|----------|
| Managed (policy) | `/etc/claude-code/.claude/skills/` | `'skills'` | Highest |
| User | `~/.claude/skills/` | `'skills'` | High |
| Project | `.claude/skills/` (cwd upward) | `'skills'` | Medium |
| Bundled | Compiled into CLI binary | `'bundled'` | Lowest |
| Legacy Commands | `~/.claude/commands/`, `.claude/commands/` | `'commands_DEPRECATED'` | Lowest |
| MCP Skills | Remote MCP servers | `'mcp'` | Via MCP |

### Skill File Format (`loadSkillsDir.ts`)

Skills MUST use directory format: `skill-name/SKILL.md`

```markdown
---
description: What this skill does
allowed-tools: ["Read", "Write", "Bash"]
when_to_use: When the user asks about X
argument-hint: <file-path>
arguments: ["file_path", "output_format"]
user-invocable: true
model: claude-sonnet-4-5-20250514
context: fork
agent: my-agent-name
hooks:
  preToolUse:
    - command: "echo pre-hook"
  postToolUse:
    - command: "echo post-hook"
paths: ["src/**", "lib/**"]
effort: high
shell:
  command: bash
---

Skill prompt content here. Supports:
- ${1} positional args
- ${CLAUDE_SKILL_DIR} for referencing bundled scripts
- ${CLAUDE_SESSION_ID} for session tracking
- !`shell command` inline shell execution (NOT for MCP skills -- security)
```

### Skill Loading Flow (`getSkillDirCommands`)

The loading function is **memoized** on CWD. Steps:

1. **Parallel load** from all sources simultaneously (managed, user, project dirs, additional dirs, legacy commands)
2. **Deduplication** by resolved realpath (handles symlinks and overlapping parent directories)
3. **Conditional skill separation** -- skills with `paths` frontmatter are stored separately and only activated when matching files are touched
4. **Dynamic discovery** -- as files are edited during a session, skill directories below CWD are discovered and loaded

**Skill lockdown:** `isRestrictedToPluginOnly('skills')` can restrict skills to plugin-only sources, disabling all project and user skills.

**Bare mode:** `--bare` skips all auto-discovery, loading ONLY explicit `--add-dir` paths.

### Bundled Skills (`bundledSkills.ts`)

Bundled skills are registered programmatically via `registerBundledSkill()`:

```typescript
type BundledSkillDefinition = {
  name: string
  description: string
  aliases?: string[]
  whenToUse?: string
  allowedTools?: string[]
  model?: string
  context?: 'inline' | 'fork'
  agent?: string
  files?: Record<string, string>  // Reference files extracted to disk on first invocation
  getPromptForCommand: (args, context) => Promise<ContentBlockParam[]>
}
```

The `files` field is notable: bundled skills can include reference files that are extracted to a temp directory on first invocation, with the base directory prepended to the prompt. This allows skills to have supporting files without bloating the prompt.

**Existing bundled skills:** `batch`, `claudeApi`, `debug`, `keybindings`, `loop`, `remember`, `scheduleRemoteAgents`, `simplify`, `skillify`, `stuck`, `updateConfig`, `verify`, and more.

### MCP Skill Builders (`mcpSkillBuilders.ts`)

A write-once registry pattern that breaks an import cycle:
```typescript
let builders: MCPSkillBuilders | null = null

export function registerMCPSkillBuilders(b: MCPSkillBuilders): void {
  builders = b
}
```

The `loadSkillsDir.ts` module registers at init time (eagerly evaluated at startup). MCP servers call `getMCPSkillBuilders()` to create skill commands from remote MCP servers.

### Conditional Skills (Path-Filtered)

Skills with `paths` frontmatter are stored in a separate map and only activated when the user touches files matching the glob patterns. This is evaluated by `checkAndActivateConditionalSkills()` using the `ignore` library (same as gitignore pattern matching).

**GSD Implication:** Path-conditional loading is directly relevant for GSD phase-specific skills. A skill could be scoped to only activate when working in `.planning/` directories.

### Skill Token Estimation

`estimateSkillFrontmatterTokens()` estimates tokens from name + description + whenToUse only (not full content) since content is lazy-loaded on invocation. Used for prompt-space budgeting.

---

## 3. Plugin Architecture (`src/plugins/`)

### Built-in Plugin Registry (`builtinPlugins.ts`)

Built-in plugins differ from bundled skills:
- They appear in the `/plugin` UI under a "Built-in" section
- Users can enable/disable them (persisted to settings)
- They can provide multiple components (skills, hooks, MCP servers)

Plugin IDs use `{name}@builtin` format to distinguish from marketplace plugins.

```typescript
type BuiltinPluginDefinition = {
  name: string
  description: string
  version: string
  defaultEnabled?: boolean        // Default: true
  isAvailable?: () => boolean     // Feature gate check
  skills?: BundledSkillDefinition[]
  hooks?: HooksSettings
  mcpServers?: Record<string, MCPServerConfig>
}
```

Enabled state resolution: user preference > plugin default > true.

**Current state:** The plugin system is scaffolded but no built-in plugins are registered yet (`initBuiltinPlugins()` is empty). This is the infrastructure for migrating bundled skills that should be user-toggleable.

### Plugin State in AppState

```typescript
plugins: {
  enabled: LoadedPlugin[]
  disabled: LoadedPlugin[]
  commands: Command[]          // Skills from enabled plugins
  errors: PluginError[]        // Loading/init errors
  installationStatus: { ... }  // Background install progress
  needsRefresh: boolean        // True when disk state diverged from memory
}
```

The `needsRefresh` flag is set when plugin state on disk changes (background reconcile, settings edit). Interactive mode requires `/reload-plugins`; headless mode auto-consumes.

---

## 4. Context Building (`src/constants/prompts.ts`, `src/utils/claudemd.ts`)

### System Prompt Composition

The system prompt is built as an array of string sections, filtered for nulls:

```
[STATIC SECTIONS -- cacheable across orgs]
  1. Intro (role definition, cyber risk)
  2. System (tool execution, tags, hooks)
  3. Doing Tasks (code style, verification)
  4. Actions (reversibility, blast radius)
  5. Using Your Tools (dedicated tool preference)
  6. Tone and Style
  7. Output Efficiency

=== SYSTEM_PROMPT_DYNAMIC_BOUNDARY === (cache marker)

[DYNAMIC SECTIONS -- per-user/session, registry-managed]
  8. Session Guidance (skills listing)
  9. Memory (auto memory prompt)
  10. Ant Model Override
  11. Environment Info (CWD, platform, git, model)
  12. Language preference
  13. Output Style
  14. MCP Instructions (DANGEROUS -- recomputes every turn)
  15. Scratchpad
  16. Function Result Clearing
  17. Summarize Tool Results
  18. Token Budget (if active)
  19. Brief mode (KAIROS)
```

### Cache Boundary Strategy

The `SYSTEM_PROMPT_DYNAMIC_BOUNDARY` marker splits the system prompt into:
- **Before marker:** Static, cross-org cacheable content (scope: `global`)
- **After marker:** Dynamic, user/session-specific content (NOT cached)

This is a **major optimization** -- the static sections are shared across all users, reducing prompt cache misses.

### System Prompt Section Caching (`systemPromptSections.ts`)

```typescript
function systemPromptSection(name, compute): SystemPromptSection
function DANGEROUS_uncachedSystemPromptSection(name, compute, reason): SystemPromptSection
```

- Regular sections: computed once, cached until `/clear` or `/compact`
- DANGEROUS sections: recompute every turn, BREAK prompt cache when value changes
- Only MCP instructions currently uses DANGEROUS (servers connect/disconnect between turns)

### CLAUDE.md / Memory File Loading Order (`claudemd.ts`)

Files are loaded in this strict order (later = higher priority, model pays more attention):

1. **Managed** (`/etc/claude-code/CLAUDE.md`) -- Global policy for all users
2. **User** (`~/.claude/CLAUDE.md`, `~/.claude/rules/*.md`) -- Private global instructions
3. **Project** (from root down to CWD):
   - `CLAUDE.md` in each directory
   - `.claude/CLAUDE.md` in each directory
   - `.claude/rules/*.md` in each directory
4. **Local** (`CLAUDE.local.md` in project roots) -- Private project-specific, gitignored

**Key features:**
- `@include` directive: `@path`, `@./relative`, `@~/home`, `@/absolute` to include other files
- Conditional rules: files in `.claude/rules/*.md` can have `paths:` frontmatter to only apply when matching files are in context
- HTML comment stripping: block-level `<!-- -->` comments are removed
- 40KB max per memory file (`MAX_MEMORY_CHARACTER_COUNT`)
- Auto-memory MEMORY.md content is injected into this pipeline

### User Context vs System Prompt

CLAUDE.md content goes into a **user context message** (not the system prompt), prefixed with:
```
Codebase and user instructions are shown below. Be sure to adhere to these instructions.
IMPORTANT: These instructions OVERRIDE any default behavior and you MUST follow them exactly as written.
```

This is important: instructions are user-context, not system-prompt. The model treats user messages as higher priority than system instructions for instruction-following.

---

## 5. State Management (`src/state/`)

### Store Pattern (`store.ts`)

A minimal, custom reactive store (NOT Redux/MobX):

```typescript
type Store<T> = {
  getState: () => T
  setState: (updater: (prev: T) => T) => void
  subscribe: (listener: Listener) => () => void
}
```

- Immutable update pattern: `setState(prev => ({ ...prev, field: newValue }))`
- `Object.is` equality check to skip no-op updates
- Optional `onChange` callback for side effects (used by `onChangeAppState.ts`)
- Listeners are a `Set<Listener>` -- deduped, unsubscribe returns cleanup function

### AppState Shape (`AppStateStore.ts`)

The `AppState` type is massive (~450 lines). Key sections:

| Domain | Fields | Notes |
|--------|--------|-------|
| Settings | `settings`, `verbose`, `effortValue`, `fastMode` | Session-level overrides |
| Model | `mainLoopModel`, `mainLoopModelForSession`, `advisorModel` | Per-session model selection |
| Tasks | `tasks: { [taskId]: TaskState }` | Agent, shell, dream, workflow tasks |
| MCP | `mcp.clients`, `mcp.tools`, `mcp.commands`, `mcp.resources` | MCP server connections |
| Plugins | `plugins.enabled`, `plugins.disabled`, `plugins.commands` | Plugin state |
| Memory | `fileHistory`, `attribution`, `todos` | File tracking, commit attribution |
| Teams | `teamContext`, `agentNameRegistry`, `inbox` | Multi-agent coordination |
| Bridge | `replBridge*` fields | Remote control state |
| Speculation | `speculation`, `speculationSessionTimeSavedMs` | Speculative execution |

**Task types:**
```typescript
type TaskState = 
  | LocalShellTaskState      // Shell commands
  | LocalAgentTaskState      // Agent tool subagents
  | RemoteAgentTaskState     // CCR remote agents
  | InProcessTeammateTaskState  // Swarm teammates
  | LocalWorkflowTaskState   // Workflow tasks
  | MonitorMcpTaskState      // MCP monitoring
  | DreamTaskState           // Memory distillation
```

### State Change Side Effects (`onChangeAppState.ts`)

An `onChange` callback pattern where state transitions trigger side effects (e.g., bridge reconnection, plugin reload, teammate notification). This is the equivalent of Redux middleware but with direct mutation callbacks.

---

## 6. Configuration Cascade (`src/utils/settings/`)

### Setting Sources (Priority Order)

```typescript
const SETTING_SOURCES = [
  'userSettings',      // ~/.claude/settings.json -- global user prefs
  'projectSettings',   // .claude/settings.json -- shared per-directory
  'localSettings',     // .claude/settings.local.json -- gitignored
  'flagSettings',      // --settings CLI flag
  'policySettings',    // /etc/claude-code/managed-settings.json or API
] as const
```

**Later sources override earlier ones.** Policy settings win over everything.

### Setting Source Controls

Each source can be individually enabled/disabled:
- `isSettingSourceEnabled('projectSettings')` -- false when project settings are locked
- `isRestrictedToPluginOnly('skills')` -- restricts skills to plugin sources only
- Managed path is determined by `getManagedFilePath()` (OS-specific)

### Security: What Can't Be Set Per-Project

Project-level settings (`projectSettings`) are untrusted -- they're checked into repos. Several settings are explicitly restricted:
- `autoMemoryDirectory` -- only from policy/local/user (a malicious repo could redirect writes to `~/.ssh`)
- `skipDangerousModePermissionPrompt` -- only from trusted sources
- Skills lockdown -- plugins can restrict to plugin-only

---

## 7. Patterns for GSD Adoption

### Memory System Patterns

1. **Two-tier index pattern:** A lightweight `MEMORY.md` index stays in context; detail files are read on demand. GSD should adopt this for cross-phase memory -- a `PHASE-MEMORY.md` index + topic files.

2. **Typed memory taxonomy:** The 4-type system (user, feedback, project, reference) prevents memory bloat by excluding derivable information. GSD needs a similar taxonomy: `decision`, `dependency`, `constraint`, `lesson`.

3. **Frontmatter-described memories:** Using `description` field for relevance matching means memories can be selected without reading full content. GSD phase memories should include one-line descriptions.

4. **Staleness tracking:** Memory age calculation + freshness caveats. GSD should tag phase memories with the phase they were created in and flag when decisions from earlier phases may be outdated.

5. **AI-powered recall:** The Sonnet sideQuery for memory selection is elegant but expensive. GSD could use a simpler heuristic (phase number + keyword matching) for initial implementation, upgrading to AI selection later.

### Skill System Patterns

1. **Directory-based skills:** `skill-name/SKILL.md` format with frontmatter metadata. GSD skills already use a similar pattern.

2. **Conditional activation:** Path-filtered skills that only activate when matching files are touched. GSD should adopt this for phase-specific skills.

3. **Loading order with deduplication:** Managed > User > Project > Bundled, with realpath-based dedup. GSD has a similar but less formalized cascade.

4. **Lazy content loading:** Only frontmatter is used for listing; full content loads on invocation. Good for prompt budget management.

5. **Shell execution in prompts:** `!`shell command`` inline execution lets skills dynamically compute context. GSD could use this for dynamic state injection.

### Plugin Architecture Patterns

1. **Component composition:** Plugins provide skills + hooks + MCP servers as a bundle. GSD's skill system could benefit from this bundling.

2. **Toggle state in settings:** User enable/disable persisted to settings.json with default-enabled fallback.

3. **needsRefresh pattern:** Disk changes set a dirty flag; interactive mode requires explicit reload. Prevents mid-session inconsistency.

### Context/Prompt Patterns

1. **Cache boundary marker:** Static content before boundary, dynamic after. Massive token savings. GSD should consider how its prompt sections interact with caching.

2. **Section caching with explicit cache-break:** Most sections compute once; only volatile sections (MCP) recompute per turn. This prevents unnecessary prompt cache invalidation.

3. **User context vs system prompt:** CLAUDE.md instructions go in user context (higher instruction-following priority) rather than system prompt. GSD's injected context should follow this pattern.

### State Management Patterns

1. **Minimal custom store:** No framework dependency. Simple `getState/setState/subscribe` with `Object.is` equality check. GSD's state management is already similar (JSON files), but could benefit from reactive subscriptions.

2. **Immutable updates with onChange callbacks:** Side effects on state transitions without middleware complexity.

---

## 8. Critical Pitfalls from Claude Code's Implementation

1. **Memory index size explosion:** The 200-line/25KB limit on MEMORY.md exists because users were creating massive indexes. GSD's state files need similar guards.

2. **Stale memory assertions:** Memories about code state become dangerous when asserted as fact. The "Before recommending from memory" section is a mitigation. GSD should add similar guards for cross-phase references.

3. **Import cycles:** The `mcpSkillBuilders.ts` write-once registry exists specifically to break a dependency cycle. GSD's modular design should plan for this.

4. **Path security:** Memory path override from project settings was blocked to prevent malicious repos from writing to sensitive directories. Any GSD feature that expands write access should audit the trust chain.

5. **Prompt cache invalidation:** DANGEROUS_uncachedSystemPromptSection exists because MCP instructions change between turns. GSD should minimize volatile prompt sections.

---

## Source File Reference

| File | Key Exports / Patterns |
|------|----------------------|
| `memdir/memdir.ts` | `loadMemoryPrompt()`, `buildMemoryLines()`, `truncateEntrypointContent()`, 200-line/25KB limits |
| `memdir/memoryTypes.ts` | 4-type taxonomy, `TYPES_SECTION_*`, `WHAT_NOT_TO_SAVE_SECTION`, `TRUSTING_RECALL_SECTION` |
| `memdir/paths.ts` | `getAutoMemPath()` (memoized), `isAutoMemoryEnabled()`, path resolution chain |
| `memdir/findRelevantMemories.ts` | `findRelevantMemories()` -- Sonnet sideQuery for memory selection |
| `memdir/memoryScan.ts` | `scanMemoryFiles()` -- recursive scan with frontmatter-only reads, 200-file cap |
| `memdir/memoryAge.ts` | `memoryAgeDays()`, `memoryFreshnessText()` -- staleness tracking |
| `memdir/teamMemPaths.ts` | Team memory directory, path traversal security |
| `memdir/teamMemPrompts.ts` | Combined private+team memory prompt with scope guidance |
| `skills/loadSkillsDir.ts` | `getSkillDirCommands()` (memoized), loading order, deduplication, conditional skills |
| `skills/bundledSkills.ts` | `registerBundledSkill()`, `BundledSkillDefinition` type, file extraction |
| `skills/mcpSkillBuilders.ts` | Write-once registry to break import cycle |
| `plugins/builtinPlugins.ts` | `registerBuiltinPlugin()`, enable/disable with settings persistence |
| `plugins/bundled/index.ts` | `initBuiltinPlugins()` -- scaffolding, no plugins registered yet |
| `constants/prompts.ts` | `getSystemPrompt()`, cache boundary marker, section composition |
| `constants/systemPromptSections.ts` | `systemPromptSection()`, `DANGEROUS_uncachedSystemPromptSection()`, memoized section cache |
| `utils/claudemd.ts` | `getMemoryFiles()`, `getClaudeMds()`, 4-tier loading order, @include directives |
| `utils/settings/constants.ts` | `SETTING_SOURCES` priority order, source names |
| `state/store.ts` | Minimal reactive store: `createStore()` with `getState/setState/subscribe` |
| `state/AppStateStore.ts` | Full `AppState` type definition, `getDefaultAppState()` |
| `utils/attachments.ts` | `startRelevantMemoryPrefetch()` -- async prefetch with Disposable pattern |
