# Coding Conventions

**Analysis Date:** 2026-03-29

## Naming Patterns

**Files:**
- TypeScript modules: `camelCase.ts` (e.g., `logger.ts`, `phase-runner.ts`, `cli-transport.ts`)
- CommonJS modules: `camelCase.cjs` (e.g., `core.cjs`, `state.cjs`, `phase.cjs`)
- Test files: `[module].test.ts` or `[module].test.cjs` for unit tests; `[module].integration.test.ts` for integration tests
- Configuration: lowercase with hyphens or dots (e.g., `tsconfig.json`, `vitest.config.ts`)

**Functions:**
- camelCase for functions: `parseCliArgs()`, `resolveModel()`, `loadConfig()`
- Factory/builder functions use `make*` prefix: `makePhaseOp()`, `makeUsage()`, `makePlanResult()`
- Helper functions in tests use `make*` or descriptive names: `createTempProject()`, `createScript()`
- Private methods prefixed with underscore: `_write()`, `_encoding()`

**Variables:**
- Local variables and parameters: camelCase (e.g., `tmpDir`, `scriptPath`, `fileRef`, `durationMs`)
- Constants in Record/enum mappings: UPPER_CASE (e.g., `LOG_LEVEL_PRIORITY`, `MODEL_PROFILES`)
- Private class fields: camelCase with leading underscore or private keyword (e.g., `private minLevel: number`)

**Types:**
- Interfaces: PascalCase with capital I (e.g., `ParsedCliArgs`, `LogEntry`, `PhaseRunnerDeps`)
- Type aliases: PascalCase (e.g., `LogLevel`, `VerificationOutcome`)
- Enums: PascalCase (e.g., `PhaseType`, `PhaseStepType`, `GSDEventType`)

## Code Style

**Formatting:**
- No dedicated formatter (eslint/prettier config not present)
- Consistent indentation: 2 spaces throughout (TypeScript and CommonJS)
- Line length: generally kept reasonable, no strict enforcement detected

**Linting:**
- No eslint/prettier configuration found in root
- Relies on TypeScript `strict: true` mode for type safety
- Type checking: `forceConsistentCasingInFileNames: true` in tsconfig

**Comments:**
- Section markers use Unicode box-drawing: `// ─── Section Name ───────────────────`
- Documentation blocks: Use standard block comments: `/** Description */`
- Inline comments: Single-line `//` for explanations
- JSDoc/TSDoc minimal usage; comments focus on implementation clarification

## Import Organization

**Order (enforced by example across codebase):**
1. Node built-in imports (node:fs, node:path, etc.)
2. External dependencies (@anthropic-ai/*, library packages)
3. Type imports (explicit `import type`)
4. Relative local imports (./*.js, ./*.cjs)

**Example from `sdk/src/session-runner.ts`:**
```typescript
import { query } from '@anthropic-ai/claude-agent-sdk';
import type { SDKMessage, SDKResultMessage } from '@anthropic-ai/claude-agent-sdk';
import type { ParsedPlan, PlanResult } from './types.js';
import { GSDEventType } from './types.js';
```

**Path Aliases:**
- None configured; uses relative imports with `.js` extensions (ES modules)
- CommonJS uses `require()` with relative paths

**Extension Usage:**
- TypeScript/ES modules: Always use `.js` extension in imports (e.g., `import { foo } from './foo.js'`)
- CommonJS: `require()` without extensions (Node resolution handles `.cjs`)

## Error Handling

**Patterns:**
- Custom error classes extend Error: `class PhaseRunnerError extends Error`
- Constructor captures context: phase number, step, cause error
- Error name explicitly set: `this.name = 'PhaseRunnerError'`
- Wrapped errors preserve causality: `new PhaseRunnerError(message, phaseNumber, step, cause)`

**Example from `sdk/src/phase-runner.ts`:**
```typescript
export class PhaseRunnerError extends Error {
  constructor(
    message: string,
    public readonly phaseNumber: string,
    public readonly step: PhaseStepType,
    public readonly cause?: Error,
  ) {
    super(message);
    this.name = 'PhaseRunnerError';
  }
}
```

**Try-catch usage:**
- Used at phase boundaries and subprocess calls
- Errors re-thrown with context information
- No silent catches (catch blocks always either re-throw, log, or handle explicitly)

## Logging

**Framework:** Custom `GSDLogger` class in `sdk/src/logger.ts`

**Patterns:**
- Structured JSON logging to stderr (or configurable Writable stream)
- Log levels: debug, info, warn, error with priority filtering
- All log entries include: timestamp (ISO), level, message
- Optional context: phase, plan, sessionId, data object

**Usage:**
```typescript
logger.info('message text');
logger.error('error occurred', { errorCode: 'E001', retries: 3 });
```

**Context setting:**
- Runtime context updates via setters: `setPhase()`, `setPlan()`, `setSessionId()`
- Context persists across log calls until explicitly cleared

## Module Design

**Exports:**
- Explicit exports: `export class ClassName {}`, `export function name() {}`
- Type exports: `export type NamedType = ...`, `export interface IName {}`
- Default exports: Not used; codebase favors named exports
- Re-exports used minimally; most files export one primary symbol

**Class-based modules:**
- Constructor takes dependencies object (e.g., `PhaseRunnerDeps`)
- Dependencies include tools, config, event emitters, loggers
- Instance methods private by default using `private` keyword

**File structure:**
- One primary export per file (matching filename)
- Related helper functions declared in same file
- Type definitions at top of file after imports
- Implementation follows types

**Example from `sdk/src/logger.ts`:**
- Exports: `GSDLogger` class, `LogLevel` type, `LogEntry` interface, `GSDLoggerOptions` interface
- Private implementation details (log priority map, private methods)
- Clear separation between public API (log methods) and internals

## Comments and Documentation

**When to comment:**
- Complex algorithm logic
- Non-obvious parameter transformations
- Browser/Node compatibility notes
- Cross-cutting security or performance concerns

**JSDoc usage:**
- Used selectively on public methods
- Documents: purpose, parameters, return type, example usage
- CommonJS comments use simple JSDoc-style blocks

**Example from `sdk/src/logger.ts`:**
```typescript
/** Set phase context for subsequent log entries. */
setPhase(phase: PhaseType | undefined): void {
  this.phase = phase;
}
```

## Function Design

**Size:** Prefer functions under 50 lines; larger functions broken into helpers

**Parameters:**
- Interfaces for multiple related parameters (e.g., `PhaseRunnerDeps`, `GSDLoggerOptions`)
- Optional parameters always placed last
- Defaults used via object destructuring: `{ level: LogLevel = 'info' }`

**Return values:**
- Explicit return types in TypeScript
- Async functions return Promises with typed resolutions
- Error cases thrown as exceptions (not null/undefined returns)

**Example pattern from tests:**
```typescript
function makePhaseOp(overrides: Partial<PhaseOpInfo> = {}): PhaseOpInfo {
  return {
    phase_found: true,
    // ... defaults ...
    ...overrides,
  };
}
```

---

*Convention analysis: 2026-03-29*
