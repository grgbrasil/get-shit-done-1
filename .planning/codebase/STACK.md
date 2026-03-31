# Technology Stack

**Analysis Date:** 2026-03-29

## Languages

**Primary:**
- TypeScript 5.7.0 - SDK and test infrastructure (`sdk/`)
- CommonJS (Node.js) - Core CLI tooling and commands (`get-shit-done/bin/lib/`)
- JavaScript (Node.js) - Installation scripts and build utilities (`bin/install.js`, `scripts/`)
- Bash/Shell - Release monitoring and deployment

**Version Control:**
- JavaScript/Node for git operations via `execSync` (`get-shit-done/bin/lib/commands.cjs`)

## Runtime

**Environment:**
- Node.js >= 20.0.0 (main package)
- Node.js >= 20 (SDK package `@gsd-build/sdk`)

**Package Manager:**
- npm - Primary dependency manager
- Lockfile: Not committed to repository (uses npm default)

## Frameworks

**Core:**
- @anthropic-ai/claude-agent-sdk 0.2.84+ - Agent SDK for plan execution and agentic loops (`sdk/src/session-runner.ts`)
- TypeScript 5.7.0 - Strict type checking and compilation to ES2022

**Testing:**
- Vitest 3.1.1 (SDK) / 4.1.2 (main) - Unit and integration test runner
- c8 11.0.0 - Code coverage reporting (target: 70% line coverage)

**Build/Dev:**
- esbuild 0.24.0 - Fast JavaScript bundler
- TypeScript Compiler (tsc) - TypeScript compilation via `npm run build`

## Key Dependencies

**Critical:**
- @anthropic-ai/claude-agent-sdk 0.2.84+ - Enables agentic plan execution with multi-turn message streaming
- ws 8.20.0 - WebSocket server for event broadcasting (`sdk/src/ws-transport.ts`)

**Infrastructure (SDK internals):**
- @types/node 22.0.0+ - Node.js type definitions
- @types/ws 8.18.1+ - WebSocket type definitions
- node:fs/promises, node:path, node:os, node:stream - Built-in Node APIs (filesystem, paths, streams)

**CLI Core (CommonJS):**
- child_process (execSync, execFileSync, spawnSync) - Process spawning for git, file operations
- fs (file system operations) - Configuration, plan file reading
- path (path resolution) - Cross-platform path handling

## Configuration

**Environment:**
- Sourced from `.planning/config.json` (`sdk/src/config.ts`)
- Defaults in `CONFIG_DEFAULTS` include:
  - `model_profile`: 'balanced' | 'quality' | 'budget'
  - `brave_search`: boolean
  - `firecrawl`: boolean
  - `exa_search`: boolean
  - Git branching strategy and templates
  - Workflow toggles (research, plan_check, verifier, etc.)

**Build:**
- `tsconfig.json` (main) - Projects to `sdk/` monorepo workspace
- `sdk/tsconfig.json` - ES2022 target, NodeNext module resolution, strict mode
- `vitest.config.ts` - Unit/integration test project separation, 120s timeout for integration tests
- `esbuild` for hook compilation (`scripts/build-hooks.js`)

**Model Selection:**
- Resolved per-agent via profile mapping in `get-shit-done/bin/lib/model-profiles.cjs`
- Profiles map: `quality` (Opus), `balanced` (Sonnet/Haiku mix), `budget` (Haiku-heavy)
- Can be overridden per-execution in `SessionOptions`

## Platform Requirements

**Development:**
- Node.js 20+ (engines field in package.json enforces this)
- macOS, Linux, Windows (with WSL check to prevent path issues in `bin/install.js`)
- Git installed (for version control operations in commands)

**Production (Runtime Distribution):**
- Deployed as npm package: `get-shit-done-cc` (main CLI) and `@gsd-build/sdk` (SDK)
- Bin entry: `get-shit-done-cc` → `bin/install.js`
- SDK bin: `gsd-sdk` → `sdk/dist/cli.js`
- No external servers or dependencies beyond Anthropic APIs

## Package Exports

**Main Package (get-shit-done-cc):**
- Files: `bin/`, `commands/`, `get-shit-done/`, `agents/`, `hooks/dist/`, `scripts/`
- Entry: `bin/install.js` (detects runtime and sets up configuration)

**SDK Package (@gsd-build/sdk):**
- Main: `dist/index.js` + types `dist/index.d.ts`
- Exports: GSD class, runners (PhaseRunner, InitRunner), event stream, transport handlers, all types
- Bin: `gsd-sdk` CLI tool (TypeScript compiled to `dist/cli.js`)

---

*Stack analysis: 2026-03-29*
