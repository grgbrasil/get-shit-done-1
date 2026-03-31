# Codebase Concerns

**Analysis Date:** 2026-03-29

## Tech Debt

### Wave Execution Concurrency Without Synchronization

**Issue:** Plans in the same wave execute concurrently via `Promise.allSettled()` in `sdk/src/phase-runner.ts` (lines 654-656), but there's no file locking mechanism for `.planning/` state modifications.

**Files:** `sdk/src/phase-runner.ts` (lines 620-695)

**Impact:** Multiple plans writing to `.planning/STATE.md` or phase artifacts simultaneously may corrupt files or lose state updates. Particularly risky in high-parallelization scenarios with 4+ concurrent plans.

**Fix approach:** Implement a file-locking mechanism (e.g., async lock primitives from `proper-lockfile` or custom semaphore in `GSDTools`) before calling `executeSinglePlan()` for shared state files. Consider wave-level serialization of `.planning/` writes while preserving concurrent code execution.

---

### Broad Exception Handling with Silent Swallowing

**Issue:** Transport error handling in `sdk/src/event-stream.ts` (lines 108-114) silently ignores all transport errors:

```typescript
for (const transport of this.transports) {
  try {
    transport.onEvent(event);
  } catch {
    // Silently ignore transport errors
  }
}
```

**Files:** `sdk/src/event-stream.ts` (lines 108-114)

**Impact:** Transport failures (e.g., WebSocket disconnects, file write errors) go unnoticed. Monitoring systems or event subscribers may silently fail, making debugging difficult. Error logs never record these failures.

**Fix approach:** Log transport errors at WARN level with transport identifier. Track failure counts. If a transport fails N times consecutively, auto-remove it or escalate to ERROR.

---

### Retry Mechanism Without Exponential Backoff

**Issue:** `retryOnce()` in `sdk/src/phase-runner.ts` (lines 295-301) immediately retries on failure with no delay or backoff:

```typescript
private async retryOnce<T extends PhaseStepResult>(label: string, fn: () => Promise<T>): Promise<T> {
  const result = await fn();
  if (result.success) return result;

  this.logger?.warn(`Step "${label}" failed, retrying once...`);
  return fn();  // Immediate retry
}
```

**Files:** `sdk/src/phase-runner.ts` (lines 295-301)

**Impact:** Transient failures in Agent SDK queries (rate limits, temporary network issues) retry immediately without delay, likely failing again. No jitter prevents thundering-herd problems if multiple phases retry simultaneously.

**Fix approach:** Add 2-5 second exponential backoff between retries. Use jitter to prevent synchronized retries across concurrent phases. Consider implementing circuit-breaker pattern for repeated failures.

---

### Untyped Output from gsd-tools Exec

**Issue:** `GSDTools.exec()` in `sdk/src/gsd-tools.ts` (lines 56-90) returns generic `Promise<unknown>`:

```typescript
async exec(command: string, args: string[] = []): Promise<unknown> {
```

**Files:** `sdk/src/gsd-tools.ts` (lines 56-90), lines 136 (parseOutput also returns unknown)

**Impact:** Callers must cast or type-assert results (`as any` appears in test files, e.g., `phase-runner.test.ts:1421`). Type safety lost at critical boundaries. Invalid JSON from gsd-tools crashes without graceful degradation.

**Fix approach:** Define discriminated union types for each gsd-tools command output. Use type guards for validation. Return typed results like `{ success: boolean; data?: T; error?: string }`. Add schema validation before parsing JSON.

---

## Fragile Areas

### Integration Tests Dependent on External CLI

**Issue:** E2E integration tests in `sdk/src/` (e2e.integration.test.ts, init-e2e.integration.test.ts, lifecycle-e2e.integration.test.ts) skip gracefully when Claude Code CLI unavailable, but when available, they execute full workflows with network calls to Anthropic API.

**Files:**
- `sdk/src/e2e.integration.test.ts` (lines 29-37)
- `sdk/src/init-e2e.integration.test.ts` (lines 31-40)
- `sdk/src/lifecycle-e2e.integration.test.ts` (lines 29-41)

**Why fragile:** Tests fail non-deterministically based on:
- API rate limits
- Network timeouts
- Claude API behavior changes
- Budget exhaustion (tests set `maxBudgetPerSession: 1.0` to 3.0, may hit limits mid-test)
- Model context window availability

**Safe modification:**
1. Mock Agent SDK query() for deterministic tests
2. Create separate `--e2e` test run marked as slow
3. Inject test doubles for expensive operations
4. Track cost metrics and fail early if budget trajectory is unsustainable

**Test coverage:** Gap exists for "verify phase with zero issues" and "execute phase with all plans succeeding" paths — these require mocking to be reliable.

---

### Plan Parser Handles Multiple Frontmatter Blocks

**Issue:** `sdk/src/plan-parser.ts` (lines 32-34) searches for ALL frontmatter blocks and uses the last one:

```typescript
const allBlocks = [...content.matchAll(/(?:^|\n)\s*---\r?\n([\s\S]+?)\r?\n---/g)];
const match = allBlocks.length > 0 ? allBlocks[allBlocks.length - 1] : null;
```

**Files:** `sdk/src/plan-parser.ts` (lines 32-34)

**Impact:** If a plan file is corrupted and contains multiple `---` delimiters (e.g., from failed merges or accidental duplication), the parser silently picks the last block. This masks file corruption. No warning is emitted.

**Safe modification:** When `allBlocks.length > 1`, log a WARNING. Consider failing with error message listing conflicting blocks. Document this edge case in plan file spec.

---

### GSDTools Command Execution Timeout Without Cleanup

**Issue:** `sdk/src/gsd-tools.ts` (lines 66-90) sets `timeout` option on child process but uses SIGTERM, with a fallback SIGKILL safety net (line 118):

```typescript
timeout: this.timeoutMs,
```

**Files:** `sdk/src/gsd-tools.ts` (lines 37-90, 118)

**Impact:** If a gsd-tools command hangs (e.g., gsd-tools waiting for interactive input), it times out and gets killed. Downstream code receives `timeout` error but may not clean up temporary files or release locks. May leave `.planning/` in inconsistent state.

**Fix approach:** Wrap exec() in try/finally to ensure state cleanup. Track in-flight commands and clean up tempfiles on timeout. Consider adding a timeout-aware command protocol to gsd-tools.

---

## Performance Bottlenecks

### Large Test Files Without Splitting

**Issue:** `sdk/src/phase-runner.test.ts` contains 2054 lines; `sdk/src/init-runner.test.ts` contains 783 lines. Both are >1000 lines, impacting:
- Test discovery time
- Memory usage during test runs
- Difficulty isolating failures

**Files:**
- `sdk/src/phase-runner.test.ts` (2054 lines)
- `sdk/src/init-runner.test.ts` (783 lines)

**Cause:** Monolithic test suites covering full lifecycle without splitting into unit + integration tiers.

**Improvement path:**
1. Extract unit test fixtures to separate files
2. Group related lifecycle tests into focused describe blocks
3. Run unit tests by default; gate integration tests with `--integration` flag
4. Consider splitting by phase (discuss, research, plan, execute, verify, advance)

---

### Parallel Research Sessions Without Resource Throttling

**Issue:** `sdk/src/init-runner.ts` (line 360) uses `Promise.allSettled()` to run 4 research sessions in parallel:

```typescript
const results = await Promise.allSettled(promises);
```

**Files:** `sdk/src/init-runner.ts` (lines 346-376)

**Impact:** 4 concurrent Agent SDK queries consume 4x token budget simultaneously. If one session consumes tokens heavily, remaining sessions share reduced budget. No backpressure mechanism prevents budget exhaustion before all 4 finish.

**Improvement path:** Implement a concurrent-request semaphore that limits to 2-3 concurrent queries. Queue remaining research tasks. Track cumulative cost and pause new sessions if approaching budget.

---

## Security Considerations

### Process Environment Variables Exposed to GSD Tools

**Issue:** `sdk/src/gsd-tools.ts` passes `process.env` to gsd-tools child process (implicit via Node execFile). If env contains secrets (API keys, tokens), they're inherited by gsd-tools.

**Files:** `sdk/src/gsd-tools.ts` (lines 65-68)

**Current mitigation:** GSD system assumes `.planning/` and related files are not world-readable. Secret files (`.env`) are in `.gitignore`.

**Recommendations:**
1. Document that SDK must run in clean environment (no secret env vars set)
2. Implement env variable whitelist if gsd-tools needs specific vars
3. Add warning if suspicious env vars detected before exec
4. Consider using env `{}` (empty) + explicit var passing for legitimate inputs

---

### No Validation of Parsed Plan Input

**Issue:** `sdk/src/plan-parser.ts` parses frontmatter and task blocks from user-supplied plan content without schema validation. No maximum field size checks or depth limits on nested YAML.

**Files:** `sdk/src/plan-parser.ts` (lines 29-320)

**Risk:** Maliciously crafted PLAN.md files could:
- Trigger ReDoS via frontmatter regex
- Cause memory exhaustion with deeply nested objects
- Inject arbitrary keys into MustHaves or Artifacts

**Recommendations:**
1. Add maximum size limit to parsed frontmatter (10KB)
2. Validate MustHaves.artifacts array length (max 100)
3. Use schema validation library (e.g., Zod, io-ts) for PlanFrontmatter
4. Reject plans with unknown frontmatter keys

---

### WebSocket Transport Credentials Not Validated

**Issue:** `sdk/src/ws-transport.ts` opens WebSocket connections without verifying peer certificate or validating server certificate during TLS handshake.

**Files:** `sdk/src/ws-transport.ts`

**Current mitigation:** Assumes SDK runs in authenticated environment (Claude Code IDE or similar).

**Recommendations:**
1. Document that SDK should only connect to trusted localhost or verified endpoints
2. Add certificate pinning option for production deployments
3. Validate `wss://` (secure WebSocket) is used in production

---

## Scaling Limits

### Single-Phase Lifecycle Execution Only

**Issue:** `PhaseRunner.run()` in `sdk/src/phase-runner.ts` runs one phase at a time. Multi-phase orchestration (e.g., Phase 1 → Phase 2 → Phase 3) must be externally managed by the caller.

**Files:** `sdk/src/phase-runner.ts` (lines 87-250)

**Current capacity:** ~50 plans per phase with default budget/turns. Verification retry loop can extend this indefinitely.

**Scaling path:** If GSD needs to run 10+ phases autonomously, implement `MilestoneRunner` analogous to `InitRunner` and `PhaseRunner`. Queue phases, track cost across phases, auto-pause if total cost exceeds project budget.

---

### Wave Execution Requires Phase Completion Before Advancing

**Issue:** Execute-phase groups plans by wave and runs concurrently within each wave, but waves execute sequentially (lines 636-694 in phase-runner.ts). If Wave 1 has 20 plans, Wave 2 doesn't start until all Wave 1 plans complete.

**Files:** `sdk/src/phase-runner.ts` (lines 620-695)

**Impact:** Critical path is serialized by wave order. If a Wave 1 plan takes 2 minutes and there are 5 waves, total time is 10+ minutes even if average plan takes 30 seconds.

**Scaling path:** Implement cross-wave dependency graph. If Wave 2 plans don't depend on Wave 1, start them concurrently. Use topological sort on wave dependencies.

---

## Missing Critical Features

### No Autonomous Defect Recovery

**Issue:** If a plan fails during execute-phase, `executeSinglePlan()` returns error and moves on. No automatic recovery mechanism exists. If 3 of 5 plans fail, phase marks as failed.

**Files:** `sdk/src/phase-runner.ts` (lines 722-746, execute step)

**Blocks:** Can't reach 100% autonomous phases without human judgment on "this error is worth retrying vs. this is a logic bug."

**Improvement path:** Implement error classification:
1. Transient (network, timeout) → auto-retry with backoff
2. Logical (bad plan, invalid code) → escalate to human
3. Environmental (missing dependency) → surface and block
4. Rate limit → exponential backoff with token tracking

---

### No Cross-Plan Dependency Tracking

**Issue:** Plans have `depends_on` field in frontmatter, but it's not enforced during execute-phase. If Plan B depends on Plan A and Plan A fails, Plan B still runs.

**Files:** `sdk/src/plan-parser.ts` (line 55), but `depends_on` is never validated during execution

**Impact:** Downstream plans fail with "missing artifact" errors instead of cleanly skipping due to unmet dependencies.

**Fix approach:** Build dependency graph in execute-phase. Skip plans with failed dependencies. Report skipped plans in result summary.

---

## Dependencies at Risk

### Agent SDK Version Pinning

**Issue:** `sdk/package.json` pins `@anthropic-ai/claude-agent-sdk` to `^0.2.84` (allows patch/minor updates). Major API changes between minor versions could break the SDK.

**Files:** `sdk/package.json` (line 43)

**Risk:** If Agent SDK releases 0.3.0 with breaking changes (e.g., new required SDKMessage fields), SDK breaks at runtime.

**Migration plan:**
1. Monitor Agent SDK changelog
2. Test SDK against new Agent SDK versions before release
3. Consider pinning to exact version (`0.2.84`) if stability is critical
4. Implement adapter pattern for Agent SDK abstractions

---

### TypeScript Version Flexibility

**Issue:** `sdk/package.json` specifies `typescript: ^5.7.0`, which allows 5.8, 5.9, etc. Type definitions may change between versions.

**Files:** `sdk/package.json` (line 49)

**Risk:** Low, but `Unknown` type casts throughout codebase (gsd-tools output) could have different behavior in newer TS versions.

**Recommendation:** Pin to exact version for builds: `"typescript": "5.7.0"`, or document minimum TypeScript version for consumers.

---

## Test Coverage Gaps

### No Mocking of Agent SDK Query

**Issue:** Integration tests execute real Agent SDK queries with actual Anthropic API calls. This makes tests slow, expensive, and non-deterministic.

**Files:**
- `sdk/src/e2e.integration.test.ts`
- `sdk/src/init-e2e.integration.test.ts`
- `sdk/src/lifecycle-e2e.integration.test.ts`

**What's not tested reliably:**
- Error handling when API returns 5xx errors
- Behavior when budget is exhausted mid-query
- Token usage tracking accuracy
- Rate limit backoff strategies
- All permutations of session options (model, maxTurns, maxBudgetUsd)

**Risk:** High. Phase execution in production could fail in ways never encountered during testing.

**Priority:** High. Create mock Agent SDK implementation for deterministic tests. Run real integration tests separately on schedule.

---

### Gap Closure Loop Under-tested

**Issue:** Verification step's gap closure retry loop (lines 868-915 in phase-runner.ts) handles complex state: re-query, re-plan, re-execute, re-verify. Only basic success path tested.

**Files:** `sdk/src/phase-runner.ts` (lines 868-915)

**Scenarios not tested:**
- Gap closure retries exceed `maxGapRetries` (default 3)
- Plan step succeeds but execute fails during gap closure
- Re-query fails and proceeding with stale state causes cascading failures

**Risk:** Medium. Gap closure failures could loop indefinitely or fail silently.

**Priority:** Medium. Add unit tests for gap closure state machine with mocked tools/eventStream.

---

### No Negative Tests for Config Loading

**Issue:** `config.ts` handles malformed JSON gracefully but doesn't test edge cases like:
- Config file with wrong type at top level (array instead of object)
- Missing nested objects (workflow, git, hooks)
- Invalid enum values in workflow config

**Files:** `sdk/src/config.ts` (lines 99-148), `sdk/src/config.test.ts` (if exists)

**Scenarios missing:** Configs with unexpected types, deeply nested invalid values, unbounded custom fields in agent_skills.

**Priority:** Low. Current defaults handle these, but defensive validation would improve robustness.

---

## Error Propagation Issues

### Catch Blocks Without Re-throwing

**Issue:** `init-runner.ts` line 147-149 silently swallows re-query failures:

```typescript
try {
  phaseOp = await this.tools.initPhaseOp(phaseNumber);
} catch {
  // If re-query fails, proceed with original state
}
```

**Files:** `sdk/src/phase-runner.ts` (lines 145-149)

**Impact:** State becomes stale. Subsequent operations may read wrong phase metadata. Error is not logged.

**Fix approach:** Log error at WARN level. If re-query fails, emit event and document in step result that state may be stale.

---

### Promise.allSettled() Hides Task-Level Errors

**Issue:** Wave execution uses `Promise.allSettled()` (line 654) to execute plans. If a plan throws synchronously (e.g., bad input to `executeSinglePlan`), it's caught but aggregated into a generic "error_during_execution" result.

**Files:** `sdk/src/phase-runner.ts` (lines 654-681)

**Impact:** Root cause of individual plan failures is lost. Debugging requires logs, not structured result.

**Fix approach:** Wrap `executeSinglePlan()` to catch and log errors before returning, or enhance error result to include stack trace.

---

*Concerns audit: 2026-03-29*
