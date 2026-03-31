# Testing Patterns

**Analysis Date:** 2026-03-29

## Test Framework

**Runner:**
- Vitest 4.1.2 (for SDK/TypeScript)
- Node native `node:test` (for CommonJS/CLI)

**Vitest Config:** `sdk/vitest.config.ts`, `/vitest.config.ts`

**Run Commands:**
```bash
npm test                          # Run all tests
npm run test:coverage             # Run with coverage (c8, threshold 70%)
npm test -- --watch               # Watch mode
npm test -- --reporter=verbose    # Verbose output
```

**Coverage Tool:**
- c8 v11.0.0
- Configured threshold: 70% lines coverage
- Coverage scope: `get-shit-done/bin/lib/*.cjs` (CommonJS library functions)
- Enforced via `test:coverage` script

## Test File Organization

**Location:**
- TypeScript unit tests: `sdk/src/**/*.test.ts` (co-located with source)
- TypeScript integration tests: `sdk/src/**/*.integration.test.ts` (co-located with source)
- CommonJS unit tests: `tests/**/*.test.cjs` (separate test directory)

**Naming Convention:**
- Unit test: `[module].test.ts` or `[module].test.cjs`
- Integration test: `[module].integration.test.ts` (longer timeout: 120 seconds)

**Structure Example:**
```
sdk/src/
├── logger.ts
├── logger.test.ts
├── phase-runner.ts
├── phase-runner.test.ts
├── phase-runner.integration.test.ts
└── ...
```

## Test Structure

**Suite Organization (Vitest - TypeScript):**
```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('ModuleName', () => {
  let resource: Type;

  beforeEach(async () => {
    resource = await setup();
  });

  afterEach(async () => {
    await teardown(resource);
  });

  describe('method name', () => {
    it('should do something specific', () => {
      expect(actual).toBe(expected);
    });
  });
});
```

**Suite Organization (Node test - CommonJS):**
```javascript
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');

describe('core module exports', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('description of expected behavior', () => {
    assert.strictEqual(actual, expected);
  });
});
```

**Patterns:**
- Use `describe()` blocks to group related tests
- Use `it()` or `test()` for individual assertions
- Setup/teardown via `beforeEach()` / `afterEach()`
- Async/await for async operations

## Mocking

**Framework:** Vitest `vi` module (TypeScript tests only)

**Mocking patterns:**
```typescript
import { vi } from 'vitest';

// Mock entire module
vi.mock('./session-runner.js', () => ({
  runPhaseStepSession: vi.fn(),
  runPlanSession: vi.fn(),
}));

// Get mocked version
import { runPhaseStepSession } from './session-runner.js';
const mockRunPhaseStepSession = vi.mocked(runPhaseStepSession);

// Use in tests
mockRunPhaseStepSession.mockResolvedValueOnce({ success: true });
```

**What to mock:**
- External SDK calls (Claude Agent SDK)
- File system operations (replace with in-memory fixtures)
- Subprocess calls (shell execution)
- Network-dependent modules

**What NOT to mock:**
- Core business logic (verify real behavior)
- Internal helper functions
- Error conditions and edge cases that need real implementation

## Fixtures and Factories

**Test Data:**
```typescript
// Factory pattern for test objects
function makePhaseOp(overrides: Partial<PhaseOpInfo> = {}): PhaseOpInfo {
  return {
    phase_found: true,
    phase_dir: '/tmp/project/.planning/phases/01-auth',
    phase_number: '1',
    // ... all required fields with sensible defaults ...
    ...overrides,
  };
}

// Usage
const customPhase = makePhaseOp({ phase_name: 'CustomPhase' });
```

**File fixtures:**
- Located in `sdk/test-fixtures/` directory
- Sample files used across E2E tests (e.g., `sample-plan.md`)
- Temporary directories created per-test using `mkdtemp()` + `tmpdir()`

**Fixture creation pattern:**
```typescript
async function createScript(name: string, code: string): Promise<string> {
  const scriptPath = join(fixtureDir, name);
  await writeFile(scriptPath, code, { mode: 0o755 });
  return scriptPath;
}
```

## Coverage

**Requirements:** 70% line coverage enforced on CommonJS library code (`get-shit-done/bin/lib/*.cjs`)

**View Coverage:**
```bash
npm run test:coverage
```

**Coverage output:** Text reporter to console; does not generate HTML report

**Note:** No coverage requirement on TypeScript SDK code; integration tests verify real behavior

## Test Types

**Unit Tests:**
- Scope: Single function or class in isolation
- Location: `[module].test.ts` (Vitest) or `tests/[module].test.cjs` (Node test)
- Mocking: External dependencies mocked, behavior verified through assertions
- Speed: <1 second per test
- Examples: `sdk/src/logger.test.ts`, `sdk/src/cli.test.ts`

**Integration Tests:**
- Scope: Multiple modules working together (no mocking of real SDK/CLI)
- Location: `[module].integration.test.ts`
- Timeout: 120 seconds (testTimeout: 120_000)
- Prerequisites: Real Claude CLI installed and authenticated (tests skip if unavailable)
- Examples: `sdk/src/e2e.integration.test.ts`, `sdk/src/phase-runner.integration.test.ts`

**E2E Tests:**
- Full pipeline from spec → prompt → query() → result files
- Requires `claude` CLI in PATH
- Uses `describe.skipIf(!cliAvailable)` to gracefully skip when CLI unavailable
- Validates actual file creation and state changes

## Common Patterns

**Async Testing:**
```typescript
// Vitest auto-handles Promise resolution
it('async operation succeeds', async () => {
  const result = await asyncFunction();
  expect(result).toBe(expected);
});

// Or with explicit Promise syntax
it('returns a promise', () => {
  return asyncFunction().then(result => {
    expect(result).toBe(expected);
  });
});
```

**Error Testing:**
```typescript
// Vitest rejects
it('throws on invalid input', async () => {
  await expect(asyncFunc()).rejects.toThrow('error message');
});

// Synchronous errors
it('throws PhaseRunnerError', () => {
  expect(() => {
    throw new PhaseRunnerError('msg', '1', PhaseStepType.Discuss);
  }).toThrow(PhaseRunnerError);
});
```

**Isolation/Cleanup:**
```typescript
// Vitest + Node test pattern
let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'test-'));
  await mkdir(join(tmpDir, '.planning'), { recursive: true });
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});
```

**Factory-based test setup:**
```typescript
// Reusable test data with overrides
function makeDeps(overrides: Partial<PhaseRunnerDeps> = {}): PhaseRunnerDeps {
  return {
    projectDir: '/tmp/project',
    tools: mockTools,
    promptFactory: mockPromptFactory,
    contextEngine: mockContextEngine,
    eventStream: mockEventStream,
    config: mockConfig,
    logger: undefined,
    ...overrides,
  };
}

// Usage
const customDeps = makeDeps({ logger: mockLogger });
const runner = new PhaseRunner(customDeps);
```

**Test isolation via mocks:**
```typescript
// Clear mock state between tests
beforeEach(() => {
  vi.clearAllMocks();
});

// Verify mock was called
expect(mockRunPhaseStepSession).toHaveBeenCalledWith(
  expect.objectContaining({ phaseStep: 'research' })
);
```

---

*Testing analysis: 2026-03-29*
