<!-- GSD:project-start source:PROJECT.md -->
## Project

**GSD Guardrails & Global Memory**

Sistema de memória global e análise de impacto para o GSD (Get Shit Done). Resolve o problema de amnésia entre planos/fases e de efeitos colaterais silenciosos quando executores modificam funções compartilhadas. Fork local do GSD que contribui PRs upstream.

**Core Value:** Nenhuma execução pode quebrar silenciosamente o que já funciona — mudanças estruturais são auto-resolvidas, mudanças de comportamento exigem decisão humana.

### Constraints

- **Compatibilidade**: Não pode quebrar o workflow GSD existente — extensão, não substituição
- **Performance**: Function Map deve ser consultável em <1s (JSON flat, não queries pesadas)
- **Contexto**: Artifacts de memória devem caber no context window sem inflá-lo demais
- **Upstream**: Componentes devem ser genéricos o suficiente para PR ao repo principal
- **Stack**: Deve funcionar com qualquer linguagem que o GSD suporte, não só JS/Vue/PHP
<!-- GSD:project-end -->

<!-- GSD:stack-start source:codebase/STACK.md -->
## Technology Stack

## Languages
- TypeScript 5.7.0 - SDK and test infrastructure (`sdk/`)
- CommonJS (Node.js) - Core CLI tooling and commands (`get-shit-done/bin/lib/`)
- JavaScript (Node.js) - Installation scripts and build utilities (`bin/install.js`, `scripts/`)
- Bash/Shell - Release monitoring and deployment
- JavaScript/Node for git operations via `execSync` (`get-shit-done/bin/lib/commands.cjs`)
## Runtime
- Node.js >= 20.0.0 (main package)
- Node.js >= 20 (SDK package `@gsd-build/sdk`)
- npm - Primary dependency manager
- Lockfile: Not committed to repository (uses npm default)
## Frameworks
- @anthropic-ai/claude-agent-sdk 0.2.84+ - Agent SDK for plan execution and agentic loops (`sdk/src/session-runner.ts`)
- TypeScript 5.7.0 - Strict type checking and compilation to ES2022
- Vitest 3.1.1 (SDK) / 4.1.2 (main) - Unit and integration test runner
- c8 11.0.0 - Code coverage reporting (target: 70% line coverage)
- esbuild 0.24.0 - Fast JavaScript bundler
- TypeScript Compiler (tsc) - TypeScript compilation via `npm run build`
## Key Dependencies
- @anthropic-ai/claude-agent-sdk 0.2.84+ - Enables agentic plan execution with multi-turn message streaming
- ws 8.20.0 - WebSocket server for event broadcasting (`sdk/src/ws-transport.ts`)
- @types/node 22.0.0+ - Node.js type definitions
- @types/ws 8.18.1+ - WebSocket type definitions
- node:fs/promises, node:path, node:os, node:stream - Built-in Node APIs (filesystem, paths, streams)
- child_process (execSync, execFileSync, spawnSync) - Process spawning for git, file operations
- fs (file system operations) - Configuration, plan file reading
- path (path resolution) - Cross-platform path handling
## Configuration
- Sourced from `.planning/config.json` (`sdk/src/config.ts`)
- Defaults in `CONFIG_DEFAULTS` include:
- `tsconfig.json` (main) - Projects to `sdk/` monorepo workspace
- `sdk/tsconfig.json` - ES2022 target, NodeNext module resolution, strict mode
- `vitest.config.ts` - Unit/integration test project separation, 120s timeout for integration tests
- `esbuild` for hook compilation (`scripts/build-hooks.js`)
- Resolved per-agent via profile mapping in `get-shit-done/bin/lib/model-profiles.cjs`
- Profiles map: `quality` (Opus), `balanced` (Sonnet/Haiku mix), `budget` (Haiku-heavy)
- Can be overridden per-execution in `SessionOptions`
## Platform Requirements
- Node.js 20+ (engines field in package.json enforces this)
- macOS, Linux, Windows (with WSL check to prevent path issues in `bin/install.js`)
- Git installed (for version control operations in commands)
- Deployed as npm package: `get-shit-done-cc` (main CLI) and `@gsd-build/sdk` (SDK)
- Bin entry: `get-shit-done-cc` → `bin/install.js`
- SDK bin: `gsd-sdk` → `sdk/dist/cli.js`
- No external servers or dependencies beyond Anthropic APIs
## Package Exports
- Files: `bin/`, `commands/`, `get-shit-done/`, `agents/`, `hooks/dist/`, `scripts/`
- Entry: `bin/install.js` (detects runtime and sets up configuration)
- Main: `dist/index.js` + types `dist/index.d.ts`
- Exports: GSD class, runners (PhaseRunner, InitRunner), event stream, transport handlers, all types
- Bin: `gsd-sdk` CLI tool (TypeScript compiled to `dist/cli.js`)
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

## Naming Patterns
- TypeScript modules: `camelCase.ts` (e.g., `logger.ts`, `phase-runner.ts`, `cli-transport.ts`)
- CommonJS modules: `camelCase.cjs` (e.g., `core.cjs`, `state.cjs`, `phase.cjs`)
- Test files: `[module].test.ts` or `[module].test.cjs` for unit tests; `[module].integration.test.ts` for integration tests
- Configuration: lowercase with hyphens or dots (e.g., `tsconfig.json`, `vitest.config.ts`)
- camelCase for functions: `parseCliArgs()`, `resolveModel()`, `loadConfig()`
- Factory/builder functions use `make*` prefix: `makePhaseOp()`, `makeUsage()`, `makePlanResult()`
- Helper functions in tests use `make*` or descriptive names: `createTempProject()`, `createScript()`
- Private methods prefixed with underscore: `_write()`, `_encoding()`
- Local variables and parameters: camelCase (e.g., `tmpDir`, `scriptPath`, `fileRef`, `durationMs`)
- Constants in Record/enum mappings: UPPER_CASE (e.g., `LOG_LEVEL_PRIORITY`, `MODEL_PROFILES`)
- Private class fields: camelCase with leading underscore or private keyword (e.g., `private minLevel: number`)
- Interfaces: PascalCase with capital I (e.g., `ParsedCliArgs`, `LogEntry`, `PhaseRunnerDeps`)
- Type aliases: PascalCase (e.g., `LogLevel`, `VerificationOutcome`)
- Enums: PascalCase (e.g., `PhaseType`, `PhaseStepType`, `GSDEventType`)
## Code Style
- No dedicated formatter (eslint/prettier config not present)
- Consistent indentation: 2 spaces throughout (TypeScript and CommonJS)
- Line length: generally kept reasonable, no strict enforcement detected
- No eslint/prettier configuration found in root
- Relies on TypeScript `strict: true` mode for type safety
- Type checking: `forceConsistentCasingInFileNames: true` in tsconfig
- Section markers use Unicode box-drawing: `// ─── Section Name ───────────────────`
- Documentation blocks: Use standard block comments: `/** Description */`
- Inline comments: Single-line `//` for explanations
- JSDoc/TSDoc minimal usage; comments focus on implementation clarification
## Import Organization
- None configured; uses relative imports with `.js` extensions (ES modules)
- CommonJS uses `require()` with relative paths
- TypeScript/ES modules: Always use `.js` extension in imports (e.g., `import { foo } from './foo.js'`)
- CommonJS: `require()` without extensions (Node resolution handles `.cjs`)
## Error Handling
- Custom error classes extend Error: `class PhaseRunnerError extends Error`
- Constructor captures context: phase number, step, cause error
- Error name explicitly set: `this.name = 'PhaseRunnerError'`
- Wrapped errors preserve causality: `new PhaseRunnerError(message, phaseNumber, step, cause)`
- Used at phase boundaries and subprocess calls
- Errors re-thrown with context information
- No silent catches (catch blocks always either re-throw, log, or handle explicitly)
## Logging
- Structured JSON logging to stderr (or configurable Writable stream)
- Log levels: debug, info, warn, error with priority filtering
- All log entries include: timestamp (ISO), level, message
- Optional context: phase, plan, sessionId, data object
- Runtime context updates via setters: `setPhase()`, `setPlan()`, `setSessionId()`
- Context persists across log calls until explicitly cleared
## Module Design
- Explicit exports: `export class ClassName {}`, `export function name() {}`
- Type exports: `export type NamedType = ...`, `export interface IName {}`
- Default exports: Not used; codebase favors named exports
- Re-exports used minimally; most files export one primary symbol
- Constructor takes dependencies object (e.g., `PhaseRunnerDeps`)
- Dependencies include tools, config, event emitters, loggers
- Instance methods private by default using `private` keyword
- One primary export per file (matching filename)
- Related helper functions declared in same file
- Type definitions at top of file after imports
- Implementation follows types
- Exports: `GSDLogger` class, `LogLevel` type, `LogEntry` interface, `GSDLoggerOptions` interface
- Private implementation details (log priority map, private methods)
- Clear separation between public API (log methods) and internals
## Comments and Documentation
- Complex algorithm logic
- Non-obvious parameter transformations
- Browser/Node compatibility notes
- Cross-cutting security or performance concerns
- Used selectively on public methods
- Documents: purpose, parameters, return type, example usage
- CommonJS comments use simple JSDoc-style blocks
## Function Design
- Interfaces for multiple related parameters (e.g., `PhaseRunnerDeps`, `GSDLoggerOptions`)
- Optional parameters always placed last
- Defaults used via object destructuring: `{ level: LogLevel = 'info' }`
- Explicit return types in TypeScript
- Async functions return Promises with typed resolutions
- Error cases thrown as exceptions (not null/undefined returns)
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

## Pattern Overview
- Meta-prompting architecture: drives external AI runtimes (Claude Code, Codex, Gemini, Copilot) via structured prompts and agents
- Two-tier execution: thin CLI orchestrator (`gsd-tools.cjs`) + SDK layer (`@gsd-build/sdk`) for programmatic control
- State machine-driven phases: discuss → research → plan → execute → verify → advance with human gates
- Agent delegation pattern: spawns specialized agents (planner, executor, researcher, debugger, etc.) for each workflow step
- Specification-driven execution: PLAN.md files with YAML frontmatter + XML task bodies define all work
## Layers
- Purpose: Command-line interface to all GSD operations. Centralizes state management, configuration, and tool resolution.
- Location: `get-shit-done/bin/gsd-tools.cjs`
- Contains: Atomic commands for state CRUD, phase lifecycle, roadmap management, verification, templating
- Depends on: CommonJS modules in `get-shit-done/bin/lib/`, file I/O, child processes for git operations
- Used by: All external command definitions, workflows, and agents that need programmatic state access
- Purpose: Shared CommonJS modules providing domain logic (config, phase, state, frontmatter, etc.)
- Location: `get-shit-done/bin/lib/`
- Contains: 17 modules handling specific concerns (core.cjs, config.cjs, phase.cjs, state.cjs, etc.)
- Depends on: Node.js built-ins, file system operations
- Used by: gsd-tools.cjs dispatcher and internal cross-module references
- Purpose: Programmatic interface for AI runtime integration via Agent SDK (@anthropic-ai/claude-agent-sdk)
- Location: `sdk/src/`
- Contains: Plan parsing, config loading, prompt building, session running, phase/milestone runners, event streaming
- Depends on: @anthropic-ai/claude-agent-sdk, Node.js APIs
- Used by: External callers running GSD plans programmatically (agents, other systems)
- Purpose: Specialized agent definitions that execute specific workflow steps
- Location: `agents/`
- Contains: 18 agents (gsd-executor, gsd-planner, gsd-phase-researcher, gsd-debugger, etc.)
- Depends on: Claude Code/similar AI runtime, tool ecosystem (Read, Write, Edit, Bash, Task, etc.)
- Used by: Main orchestrator spawning them as subagents for parallel/sequential work
- Purpose: CLI entry points that define user-facing commands (execute-phase, plan-phase, init, etc.)
- Location: `commands/gsd/`
- Contains: 40+ command markdown files with usage hints, execution contexts, and process descriptions
- Depends on: gsd-tools.cjs dispatcher, agents, workflows
- Used by: End users via `gsd:command-name` invocation
- Purpose: Reusable workflow sequences that compose commands and agents into larger workflows
- Location: `get-shit-done/workflows/`
- Contains: Complex workflows like execute-phase, plan-phase, init that sequence multiple agents
- Depends on: Commands, agents, gsd-tools operations
- Used by: Command definitions that need multi-step orchestration
## Data Flow
## Key Abstractions
- Purpose: Declarative specification of work unit with tasks, dependencies, and verification criteria
- Examples: `PLAN-01-01-auth-setup.md`, `PLAN-02-03-fix-crud.md`
- Pattern: YAML frontmatter (metadata) + XML task bodies (imperative actions) + markdown sections (context)
- Purpose: Grouping of related plans with coordinated lifecycle
- Examples: `.planning/phases/01-auth/`, `.planning/phases/02-crud/`
- Pattern: Multiple plans grouped by phase number, executed with full orchestration
- Purpose: Single source of truth for all phases, their descriptions, and completion status
- Pattern: Structured markdown with phase sections, progress tables, and status markers
- Purpose: Project-wide state tracking including current phase, completed work, and progress
- Pattern: YAML frontmatter with fields like `current_phase`, `completed_phases`, `last_update`
- Purpose: Group of plans that can execute in parallel within a phase
- Pattern: Plans grouped by `wave` number in frontmatter, executed together
- Purpose: Test specifications and verification checkpoints for plan completion
- Pattern: Markdown with test scenarios, acceptance criteria, and UAT sign-off
## Entry Points
- Location: `bin/install.js`
- Triggers: User runs `npm install -g get-shit-done` or `get-shit-done-cc` installer
- Responsibilities: Install GSD agents to user runtimes (Claude Code, Copilot, Cursor, Windsurf, etc.), configure hooks
- Location: `get-shit-done/bin/gsd-tools.cjs`
- Triggers: Invoked by commands/workflows with subcommand (e.g., `gsd-tools state load`)
- Responsibilities: Route to appropriate lib module, execute command, output JSON/text
- Location: `sdk/src/index.ts`
- Triggers: Import `@gsd-build/sdk` and instantiate `new GSD()`
- Responsibilities: Expose `executePlan()`, `runPhase()`, `run()` methods for programmatic use
- Location: `sdk/src/cli.ts`
- Triggers: `gsd-sdk` binary invocation
- Responsibilities: Parse CLI args, instantiate SDK, execute plan or phase, stream results to stdout
- Location: `sdk/src/phase-runner.ts`
- Triggers: Invoked by `runPhase()` method
- Responsibilities: Orchestrate full phase lifecycle (discuss → research → plan → execute → verify → advance)
## Error Handling
- CLI errors: Emit JSON error objects with `error` and `message` fields, exit non-zero
- SDK errors: Throw typed exceptions (PhaseRunnerError, GSDToolsError) with phaseNumber/context
- Agent errors: Captured via query() result stream, surfaced as `PlanResult.error`
- Validation errors: Pre-flight checks (path existence, file permissions) before execution
- Graceful degradation: Missing optional context files don't fail; log warnings instead
## Cross-Cutting Concerns
- SDK: `GSDLogger` class with structured log levels (debug, info, warn, error)
- CLI: Direct stderr/stdout output via `output()` and `error()` helpers
- Agents: Log via console or task messages within agent execution
- Frontmatter schema validation via `extractFrontmatter()` in plan-parser.ts
- Path validation via `verify-path-exists` gsd-tools command
- Plan structure validation via `verify plan-structure` command
- Agent SDK handles auth implicitly (Claude Code, Copilot, etc. manage their own credentials)
- gsd-tools operations are local-only (no external auth needed)
- Environment variable secrets stored in `.env` (not committed)
- Centralized in `.planning/config.json` (loaded once per execution)
- Cascading defaults: per-execution options override config, config overrides hardcoded defaults
- Profile-based: supports `balanced`, `quality`, `speed` model profiles
<!-- GSD:architecture-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd:quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd:debug` for investigation and bug fixing
- `/gsd:execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd:profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
