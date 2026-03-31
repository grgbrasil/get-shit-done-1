# Codebase Structure

**Analysis Date:** 2026-03-29

## Directory Layout

```
get-shit-done/
├── bin/                        # Installation entry point
│   └── install.js              # NPM postinstall hook; installs agents to user runtimes
├── get-shit-done/              # Core GSD system (packaged in npm)
│   ├── bin/
│   │   ├── gsd-tools.cjs       # Main CLI dispatcher for all GSD operations
│   │   └── lib/                # 17 CommonJS modules (core, config, phase, state, etc.)
│   ├── commands/               # ~45 command definitions (user-facing CLI entries)
│   ├── references/             # Shared reference docs (brand guidelines, etc.)
│   ├── templates/              # Template files for PLAN.md, SUMMARY.md, etc.
│   └── workflows/              # Workflow orchestrators composing commands/agents
├── agents/                     # 18 specialized agent definitions
├── sdk/                        # TypeScript SDK for programmatic GSD execution
│   ├── src/                    # ~40 TypeScript source files
│   ├── prompts/                # Prompt templates referenced by SDK
│   └── test-fixtures/          # Test data for SDK integration tests
├── commands/                   # Legacy command structure (mirror)
│   └── gsd/                    # Same as get-shit-done/commands/
├── docs/                       # User documentation (markdown, i18n)
├── tests/                      # CommonJS test suite (45+ test files)
├── hooks/                      # Git hooks (pre-commit, post-commit, etc.)
├── scripts/                    # Build scripts (build-hooks.js, run-tests.cjs)
└── .planning/                  # User project planning directory (created on init)
    └── codebase/               # This analysis output directory
```

## Directory Purposes

**bin/**
- Purpose: Installation and setup automation
- Contains: `install.js` — the executable that runs `npm postinstall`
- Key files: `install.js` (~5k lines) handles Claude Code, Copilot, Codex, Windsurf, Cursor, Gemini installation
- Generated: Yes (outputs to user's `.claude/` or IDE config directories)

**get-shit-done/bin/**
- Purpose: Core GSD command-line tools and shared utilities
- Contains: Main dispatcher (gsd-tools.cjs) and 17 utility modules
- Key files:
  - `gsd-tools.cjs` (36k): Primary entry point for all CLI operations
  - `core.cjs` (1.2k lines): Path helpers, output formatters, project root detection
  - `config.cjs` (442 lines): Config file parsing and cascading defaults
  - `phase.cjs` (888 lines): Phase CRUD, listing, decimal numbering
  - `state.cjs` (1k lines): STATE.md field access and updates
  - `init.cjs` (1.4k lines): Project initialization workflow
  - `verify.cjs` (888 lines): Verification and health checks

**get-shit-done/commands/**
- Purpose: User-facing command definitions that route to agents/workflows
- Contains: ~45 markdown files (one per command)
- Key files:
  - `execute-phase.md`: Wave-based parallel plan execution
  - `plan-phase.md`: Generate all plans for a phase
  - `discuss-phase.md`: Generate phase discussion context
  - `complete-milestone.md`: Archive phases and mark milestone done
  - `init.md`: Initialize new GSD project
  - `add-phase.md`, `add-backlog.md`, `add-tests.md`: Phase management
  - `debug.md`: Forensic debugging tools for plan failures
- Pattern: YAML frontmatter + markdown prose defining behavior, context, and execution flow

**get-shit-done/workflows/**
- Purpose: Reusable orchestration sequences for complex operations
- Contains: Complex workflows that compose multiple agents
- Key files: Specific workflows referenced by commands (e.g., execute-phase.md workflow)
- Pattern: Markdown with agent spawning directives and gate logic

**agents/**
- Purpose: Specialized AI agents for workflow steps and specialized tasks
- Contains: 18 markdown agent definitions
- Key files:
  - `gsd-executor.md`: Executes individual plans
  - `gsd-planner.md`: Generates phase plans from requirements
  - `gsd-phase-researcher.md`: Analyzes phase context and dependencies
  - `gsd-project-researcher.md`: Initial project analysis
  - `gsd-verifier.md`: Verification and UAT orchestration
  - `gsd-debugger.md`: Failure diagnosis and remediation
  - `gsd-codebase-mapper.md`: Architecture and structure documentation
  - `gsd-ui-checker.md`, `gsd-ui-researcher.md`: UI-focused agents
  - `gsd-integration-checker.md`: External API validation
- Pattern: Markdown with role definition, tool permissions, and task-specific prompts

**sdk/**
- Purpose: TypeScript SDK for programmatic GSD execution
- Location: Published as `@gsd-build/sdk` npm package
- Contains: 40+ TypeScript files for plan parsing, config loading, execution orchestration
- Key files:
  - `index.ts` (11.5k lines): Main GSD class, public API
  - `phase-runner.ts` (36k lines): Full phase lifecycle state machine
  - `session-runner.ts` (9.6k lines): Agent SDK query() integration
  - `plan-parser.ts` (14.5k lines): YAML frontmatter and XML task parsing
  - `types.ts`: Core type definitions (ParsedPlan, PhaseRunner*, GSD*)
  - `config.ts` (4.2k lines): Project config loading and validation
  - `event-stream.ts` (13.8k lines): Event emission and transport handling
  - `prompt-builder.ts` (6.3k lines): Executor prompt construction
  - `context-engine.ts` (4.2k lines): Context file discovery and assembly
  - `gsd-tools.ts` (9.7k lines): TypeScript wrapper for gsd-tools.cjs
  - `cli-transport.ts`: CLI event streaming
  - `ws-transport.ts`: WebSocket event streaming
  - `logger.ts` (3.7k lines): Structured logging
  - `init-runner.ts` (25.9k lines): Project initialization orchestration
- Dependencies: @anthropic-ai/claude-agent-sdk, ws (WebSocket), TypeScript, Vitest

**tests/**
- Purpose: Comprehensive test suite for CLI and SDK functionality
- Contains: 45+ CommonJS test files using Vitest runner
- Key patterns:
  - Integration tests for full workflows (execute-phase.test.cjs, phase.test.cjs)
  - Unit tests for individual modules (core.test.cjs, config.test.cjs)
  - SDK test suites (phase-runner.test.ts, plan-parser.test.ts)
  - End-to-end tests (e2e.integration.test.ts, lifecycle-e2e.integration.test.ts)
- Command: `npm test` runs all tests; `npm test:coverage` runs with coverage checking (70% minimum)

**docs/**
- Purpose: User-facing documentation
- Contains: Markdown guides in multiple languages (en, ja-JP, ko-KR, pt-BR, zh-CN)
- Pattern: README, feature guides, troubleshooting, API documentation

**hooks/**
- Purpose: Git hooks for automated checks and updates
- Contains: Post-commit hooks, pre-commit checks, branch validation
- Built: Compiled from `hooks/src` to `hooks/dist` via `npm run build:hooks`

**scripts/**
- Purpose: Build and test automation
- Key files:
  - `build-hooks.js`: Compile TypeScript hooks to CommonJS
  - `run-tests.cjs`: Test runner orchestrator (runs Vitest, c8 coverage)

## Key File Locations

**Entry Points:**
- `bin/install.js`: Package installation entrypoint (~5.1k lines)
- `get-shit-done/bin/gsd-tools.cjs`: CLI dispatcher for all state/phase operations (36.4k lines)
- `sdk/src/index.ts`: Programmatic API for plan/phase/milestone execution (11.6k lines)
- `sdk/src/cli.ts`: CLI wrapper around SDK for standalone execution (14.1k lines)
- `commands/gsd/`: All user-facing command definitions (45 files)

**Configuration:**
- `.planning/config.json`: Project configuration (user-created)
- `package.json`: NPM package metadata and scripts
- `sdk/package.json`: SDK package metadata
- `tsconfig.json`: TypeScript compiler settings (in sdk/)
- `vitest.config.ts`: Vitest test runner configuration (in sdk/)

**Core Logic:**
- `get-shit-done/bin/lib/core.cjs`: Shared utilities (path resolution, output formatting, git detection)
- `get-shit-done/bin/lib/state.cjs`: STATE.md CRUD operations
- `get-shit-done/bin/lib/phase.cjs`: Phase management (list, create, delete, numbering)
- `get-shit-done/bin/lib/config.cjs`: Configuration parsing
- `get-shit-done/bin/lib/roadmap.cjs`: Roadmap analysis and updates
- `get-shit-done/bin/lib/init.cjs`: Project initialization

**SDK Core:**
- `sdk/src/plan-parser.ts`: PLAN.md parsing (frontmatter + tasks)
- `sdk/src/phase-runner.ts`: Phase lifecycle orchestration (the state machine)
- `sdk/src/session-runner.ts`: Agent SDK query() integration
- `sdk/src/config.ts`: Project config loading
- `sdk/src/gsd-tools.ts`: Wrapper around gsd-tools.cjs for SDK

**Testing:**
- `tests/core.test.cjs`: Core utility tests
- `tests/phase.test.cjs`: Phase management tests
- `tests/execute-phase.test.cjs`: Execute phase workflow tests
- `sdk/src/**/*.test.ts`: SDK unit and integration tests
- `sdk/src/**/*.integration.test.ts`: Full end-to-end workflow tests

## Naming Conventions

**Files:**
- Command definitions: `{command-name}.md` (e.g., `execute-phase.md`, `plan-phase.md`)
- Agents: `gsd-{agent-name}.md` (e.g., `gsd-executor.md`, `gsd-planner.md`)
- Tests: `{module}.test.cjs` or `{module}.test.ts` (e.g., `core.test.cjs`, `phase-runner.test.ts`)
- Workflows: `{workflow-name}.md` in `get-shit-done/workflows/`
- Plans: `PLAN.md` or `{ordinal}-{name}-PLAN.md` in `.planning/phases/{phase}/`
- Summaries: `SUMMARY.md` or `{ordinal}-{name}-SUMMARY.md` in phase directories

**Directories:**
- Phase directories: `{number}-{name}` or `{number}.{decimal}-{name}` (e.g., `01-auth`, `02-crud`, `02.1-bugfix`)
- Phases parent: `.planning/phases/`
- Milestones: `.planning/milestones/` or `.planning/milestones/v{version}-phases/`
- Library modules: `{domain}.cjs` (e.g., `core.cjs`, `phase.cjs`, `state.cjs`)
- TypeScript modules: `{module}.ts` or `{module-name}.ts` (camelCase for multi-word)

**Functions/Exports:**
- CLI commands: `cmd{CapitalCase}` (e.g., `cmdPhasesList`, `cmdStateUpdate`)
- Internal helpers: `lowercase_with_underscores` (CJS) or `camelCase` (TS)
- Type names: `PascalCase` with suffix (e.g., `ParsedPlan`, `PhaseRunner`, `GSDResult`)
- Constants: `SCREAMING_SNAKE_CASE` (e.g., `DEFAULT_ALLOWED_TOOLS`, `PHASE_AGENT_MAP`)

## Where to Add New Code

**New Feature:**
- Primary code: `sdk/src/{feature}.ts` for logic, `sdk/src/{feature}.test.ts` for tests
- Or: `get-shit-done/bin/lib/{feature}.cjs` for CLI tools
- Command definition: `commands/gsd/{feature-name}.md`
- Agent if needed: `agents/gsd-{agent-name}.md`

**New CLI Command:**
- Definition: `commands/gsd/{command-name}.md` with YAML frontmatter and markdown process
- Routes through: `gsd-tools.cjs` dispatcher
- Typically invokes: gsd-tools subcommands or spawns agents

**New Agent:**
- Definition: `agents/gsd-{agent-name}.md` with role definition and tool permissions
- Tool permissions: Specify allowed tools in `allowed-tools:` field
- Invoked by: Commands or workflows via Task tool with `Task("gsd:{agent-name}", ...)`

**New Utility Module (CJS):**
- File: `get-shit-done/bin/lib/{module}.cjs`
- Export: Comma-separated `module.exports = { cmdXxx, cmdYyy, internalHelpers };`
- Register: Add to `gsd-tools.cjs` dispatcher if user-facing

**New TypeScript Module (SDK):**
- File: `sdk/src/{module}.ts`
- Tests: `sdk/src/{module}.test.ts` alongside source
- Export: Public API in `sdk/src/index.ts` if needed
- Build: Run `npm run build` in sdk/ to generate dist/

**Tests:**
- Unit tests: Colocated with source (`.test.ts` or `.test.cjs`)
- Integration tests: Suffix with `.integration.test.ts`
- Run: `npm test` or `npm run test:integration`

## Special Directories

**`.planning/` (User-created on init):**
- Purpose: Project state, phase plans, summaries, and configuration
- Generated: Yes, by `gsd:init` command
- Committed: Yes, files tracked in git
- Key subdirectories:
  - `.planning/phases/`: Phase directories with PLAN.md and SUMMARY.md
  - `.planning/config.json`: Project configuration
  - `.planning/STATE.md`: Current execution state
  - `.planning/ROADMAP.md`: Master roadmap
  - `.planning/PROJECT.md`: Project metadata (created during init)
  - `.planning/codebase/`: Codebase analysis documents (ARCHITECTURE.md, etc.)

**`node_modules/` (Generated):**
- Generated: Yes, by npm install
- Committed: No
- Contains: All dependencies including @anthropic-ai/claude-agent-sdk, TypeScript, Vitest

**`sdk/dist/` (Generated):**
- Generated: Yes, by `tsc` during `npm run build` in sdk/
- Committed: No in source, but included in published npm package
- Contains: Compiled JavaScript and .d.ts type definitions

**`hooks/dist/` (Generated):**
- Generated: Yes, by `npm run build:hooks` from TypeScript sources
- Committed: No, built on publish
- Contains: Compiled hook executables

**`.git/` (Git repository):**
- Generated: Yes, by git initialization
- Committed: N/A (git metadata)
- Contains: All version control data

---

*Structure analysis: 2026-03-29*
