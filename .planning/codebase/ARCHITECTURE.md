# Architecture

**Analysis Date:** 2026-03-29

## Pattern Overview

**Overall:** Modular, multi-runtime meta-prompting orchestration system with CLI-driven workflow lifecycle management.

**Key Characteristics:**
- Meta-prompting architecture: drives external AI runtimes (Claude Code, Codex, Gemini, Copilot) via structured prompts and agents
- Two-tier execution: thin CLI orchestrator (`gsd-tools.cjs`) + SDK layer (`@gsd-build/sdk`) for programmatic control
- State machine-driven phases: discuss → research → plan → execute → verify → advance with human gates
- Agent delegation pattern: spawns specialized agents (planner, executor, researcher, debugger, etc.) for each workflow step
- Specification-driven execution: PLAN.md files with YAML frontmatter + XML task bodies define all work

## Layers

**CLI Layer (gsd-tools.cjs):**
- Purpose: Command-line interface to all GSD operations. Centralizes state management, configuration, and tool resolution.
- Location: `get-shit-done/bin/gsd-tools.cjs`
- Contains: Atomic commands for state CRUD, phase lifecycle, roadmap management, verification, templating
- Depends on: CommonJS modules in `get-shit-done/bin/lib/`, file I/O, child processes for git operations
- Used by: All external command definitions, workflows, and agents that need programmatic state access

**Core Utilities (lib modules):**
- Purpose: Shared CommonJS modules providing domain logic (config, phase, state, frontmatter, etc.)
- Location: `get-shit-done/bin/lib/`
- Contains: 17 modules handling specific concerns (core.cjs, config.cjs, phase.cjs, state.cjs, etc.)
- Depends on: Node.js built-ins, file system operations
- Used by: gsd-tools.cjs dispatcher and internal cross-module references

**SDK Layer (TypeScript):**
- Purpose: Programmatic interface for AI runtime integration via Agent SDK (@anthropic-ai/claude-agent-sdk)
- Location: `sdk/src/`
- Contains: Plan parsing, config loading, prompt building, session running, phase/milestone runners, event streaming
- Depends on: @anthropic-ai/claude-agent-sdk, Node.js APIs
- Used by: External callers running GSD plans programmatically (agents, other systems)

**Agent Layer (Markdown prompt definitions):**
- Purpose: Specialized agent definitions that execute specific workflow steps
- Location: `agents/`
- Contains: 18 agents (gsd-executor, gsd-planner, gsd-phase-researcher, gsd-debugger, etc.)
- Depends on: Claude Code/similar AI runtime, tool ecosystem (Read, Write, Edit, Bash, Task, etc.)
- Used by: Main orchestrator spawning them as subagents for parallel/sequential work

**Command Layer (Markdown command definitions):**
- Purpose: CLI entry points that define user-facing commands (execute-phase, plan-phase, init, etc.)
- Location: `commands/gsd/`
- Contains: 40+ command markdown files with usage hints, execution contexts, and process descriptions
- Depends on: gsd-tools.cjs dispatcher, agents, workflows
- Used by: End users via `gsd:command-name` invocation

**Workflow Orchestrators (Markdown templates):**
- Purpose: Reusable workflow sequences that compose commands and agents into larger workflows
- Location: `get-shit-done/workflows/`
- Contains: Complex workflows like execute-phase, plan-phase, init that sequence multiple agents
- Depends on: Commands, agents, gsd-tools operations
- Used by: Command definitions that need multi-step orchestration

## Data Flow

**Plan Execution Flow (Primary):**

1. User invokes: `gsd:execute-phase <phase-number>`
2. Command dispatcher loads `commands/gsd/execute-phase.md`
3. Orchestrator discovers plans in `.planning/phases/<phase>/` via `gsd-tools phase list`
4. Plans are grouped into waves (parallelization groups) via `gsd-tools phase-plan-index`
5. For each wave, subagents spawned with `executePlan()` from SDK
6. SDK: parses PLAN.md → loads config → builds executor prompt → calls `query()` from Agent SDK
7. Agent SDK: runs external AI agent through tool calls, collects results
8. Plan results (cost, duration, status) emitted via GSDEventStream
9. Orchestrator verifies completion → emits PhaseStepResult
10. Phase state updated in `.planning/STATE.md` via `gsd-tools state update`

**Phase Lifecycle Flow:**

1. Discuss: Generate discussion context via `gsd-phase-researcher` agent
2. Research: Analyze findings via research synthesizer
3. Plan: Generate plans via `gsd-planner` agent
4. Plan Check: Validate plans via `gsd-plan-checker` agent
5. Execute: Run all plans via orchestrator + subagents
6. Verify: Verify completion via `gsd-verifier` agent
7. Advance: Mark complete, update STATE.md

**State Management Flow:**

1. Config loaded from `.planning/config.json` via `loadConfig()`
2. State queried from `.planning/STATE.md` via `gsd-tools state json`
3. Phase operations indexed via roadmap analysis
4. State mutations persisted back to `.planning/STATE.md` via `gsd-tools state update`

## Key Abstractions

**Plan (PLAN.md file):**
- Purpose: Declarative specification of work unit with tasks, dependencies, and verification criteria
- Examples: `PLAN-01-01-auth-setup.md`, `PLAN-02-03-fix-crud.md`
- Pattern: YAML frontmatter (metadata) + XML task bodies (imperative actions) + markdown sections (context)

**Phase (numbered directory):**
- Purpose: Grouping of related plans with coordinated lifecycle
- Examples: `.planning/phases/01-auth/`, `.planning/phases/02-crud/`
- Pattern: Multiple plans grouped by phase number, executed with full orchestration

**Roadmap (ROADMAP.md):**
- Purpose: Single source of truth for all phases, their descriptions, and completion status
- Pattern: Structured markdown with phase sections, progress tables, and status markers

**State (STATE.md):**
- Purpose: Project-wide state tracking including current phase, completed work, and progress
- Pattern: YAML frontmatter with fields like `current_phase`, `completed_phases`, `last_update`

**Wave (parallelization group):**
- Purpose: Group of plans that can execute in parallel within a phase
- Pattern: Plans grouped by `wave` number in frontmatter, executed together

**Verification (UAT, VERIFICATION.md):**
- Purpose: Test specifications and verification checkpoints for plan completion
- Pattern: Markdown with test scenarios, acceptance criteria, and UAT sign-off

## Entry Points

**CLI (bin/install.js):**
- Location: `bin/install.js`
- Triggers: User runs `npm install -g get-shit-done` or `get-shit-done-cc` installer
- Responsibilities: Install GSD agents to user runtimes (Claude Code, Copilot, Cursor, Windsurf, etc.), configure hooks

**gsd-tools dispatcher (gsd-tools.cjs):**
- Location: `get-shit-done/bin/gsd-tools.cjs`
- Triggers: Invoked by commands/workflows with subcommand (e.g., `gsd-tools state load`)
- Responsibilities: Route to appropriate lib module, execute command, output JSON/text

**SDK Entry (index.ts):**
- Location: `sdk/src/index.ts`
- Triggers: Import `@gsd-build/sdk` and instantiate `new GSD()`
- Responsibilities: Expose `executePlan()`, `runPhase()`, `run()` methods for programmatic use

**Agent CLI (cli.ts):**
- Location: `sdk/src/cli.ts`
- Triggers: `gsd-sdk` binary invocation
- Responsibilities: Parse CLI args, instantiate SDK, execute plan or phase, stream results to stdout

**Phase Runner (phase-runner.ts):**
- Location: `sdk/src/phase-runner.ts`
- Triggers: Invoked by `runPhase()` method
- Responsibilities: Orchestrate full phase lifecycle (discuss → research → plan → execute → verify → advance)

## Error Handling

**Strategy:** Structured error capture at each layer with fallback and retry semantics.

**Patterns:**
- CLI errors: Emit JSON error objects with `error` and `message` fields, exit non-zero
- SDK errors: Throw typed exceptions (PhaseRunnerError, GSDToolsError) with phaseNumber/context
- Agent errors: Captured via query() result stream, surfaced as `PlanResult.error`
- Validation errors: Pre-flight checks (path existence, file permissions) before execution
- Graceful degradation: Missing optional context files don't fail; log warnings instead

## Cross-Cutting Concerns

**Logging:**
- SDK: `GSDLogger` class with structured log levels (debug, info, warn, error)
- CLI: Direct stderr/stdout output via `output()` and `error()` helpers
- Agents: Log via console or task messages within agent execution

**Validation:**
- Frontmatter schema validation via `extractFrontmatter()` in plan-parser.ts
- Path validation via `verify-path-exists` gsd-tools command
- Plan structure validation via `verify plan-structure` command

**Authentication:**
- Agent SDK handles auth implicitly (Claude Code, Copilot, etc. manage their own credentials)
- gsd-tools operations are local-only (no external auth needed)
- Environment variable secrets stored in `.env` (not committed)

**Configuration:**
- Centralized in `.planning/config.json` (loaded once per execution)
- Cascading defaults: per-execution options override config, config overrides hardcoded defaults
- Profile-based: supports `balanced`, `quality`, `speed` model profiles

---

*Architecture analysis: 2026-03-29*
