# Claude Code Internal Architecture: Phase Scoping, Context Management, and Work Decomposition

**Source:** `/Volumes/SSD/Desenvolvimento/claude-code-sourcemap-main/restored-src/src/`
**Researched:** 2026-04-01
**Confidence:** HIGH (direct source code analysis)

---

## 1. Agent Tool: Work Decomposition Model

### 1.1 Two Delegation Paths: Subagent vs Fork

Claude Code has **two distinct agent delegation models**, controlled by a feature gate (`FORK_SUBAGENT`):

**Subagent path** (traditional): Spawns a fresh agent with zero context. The caller must provide a complete, self-contained prompt. The agent starts cold.

**Fork path** (newer): Creates a child that inherits the parent's **full conversation context and system prompt**. The prompt is a *directive* -- "what to do", not "what the situation is". Forks share the parent's prompt cache for efficiency.

**Source:** `src/tools/AgentTool/forkSubagent.ts:27-39`

```
Fork subagent feature gate.
When enabled:
- subagent_type becomes optional on the Agent tool schema
- Omitting subagent_type triggers an implicit fork: the child inherits
  the parent's full conversation context and system prompt
- All agent spawns run in the background (async)
- Mutually exclusive with coordinator mode
```

**Key constraint:** Forks cannot recursively fork. The system detects fork children by checking for a `FORK_BOILERPLATE_TAG` in conversation history (`forkSubagent.ts:78-89`).

**GSD implication:** GSD's executor/researcher agents are always subagents (zero context). The fork model shows that inheriting context is viable and preferred when the child needs the parent's understanding. GSD could benefit from a "context-inheriting" mode for phase continuations where the executor already built up knowledge.

### 1.2 Fork Child Rules (the "Worker Discipline" Pattern)

Fork children receive strict behavioral constraints via `buildChildMessage()` (`forkSubagent.ts:171-198`):

1. Do NOT spawn sub-agents -- execute directly
2. Do NOT converse, ask questions, or suggest next steps
3. USE tools directly
4. If you modify files, **commit your changes** before reporting
5. Do NOT emit text between tool calls -- use tools silently, report once at the end
6. **Stay strictly within your directive's scope**
7. Keep report under 500 words
8. Response MUST begin with "Scope:" -- no preamble

**Structured output format enforced:**
```
Scope: <echo back assigned scope>
Result: <key findings>
Key files: <relevant paths>
Files changed: <list with commit hash>
Issues: <list>
```

**GSD implication:** GSD executors lack this discipline structure. They don't have a mandatory "echo back your scope" step, don't enforce commit-before-report, and don't have word limits. Adopting these constraints would reduce scope drift and improve executor reliability.

### 1.3 Worktree Isolation

Agents can run in **isolated git worktrees** (`isolation: "worktree"`), getting a separate working copy of the repo. Changes stay isolated from the parent.

**Source:** `forkSubagent.ts:200-210` -- `buildWorktreeNotice()` tells the child:
- Translate paths from parent's CWD to worktree root
- Re-read files before editing (parent may have modified them)
- Changes won't affect the parent's files

**GSD implication:** GSD could use worktree isolation for parallel plan execution within a phase. Currently parallel wave execution risks file conflicts. Worktrees solve this at the git level.

### 1.4 maxTurns Limits

Agents have explicit turn limits:
- Fork agents: **200 turns** (`forkSubagent.ts:65`)
- Compact model: **1 turn** (`compact.ts:1194`)
- Memory extraction: **5 turns** (`extractMemories.ts:426`)
- Speculation: configurable `MAX_SPECULATION_TURNS`

**Source:** `query.ts:1705` enforces the limit:
```
if (maxTurns && nextTurnCount > maxTurns) {
```

**GSD implication:** GSD plans don't set maxTurns for executors. This means an executor can loop indefinitely on a stuck task. Setting turn limits per plan complexity tier would prevent runaway execution.

---

## 2. Context Decay and Management

### 2.1 Auto-Compact System

Claude Code has a multi-layered context management system:

**Layer 1: Auto-compact threshold** (`autoCompact.ts:72-91`)
- Calculated as: `effectiveContextWindow - 13,000 buffer tokens`
- When token count exceeds threshold, auto-compaction fires
- Can be overridden via `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` env var
- Circuit breaker: stops retrying after **3 consecutive failures** (`autoCompact.ts:70`)

**Layer 2: Warning thresholds** (`autoCompact.ts:93-145`)
- Warning threshold: threshold - 20,000 tokens
- Error threshold: threshold - 20,000 tokens  
- Blocking limit: effectiveWindow - 3,000 tokens (forces manual compact)

**Layer 3: Session Memory compaction** (`autoCompact.ts:287-310`)
- Tried first before traditional compaction
- Lighter weight, preserves more structure

**Layer 4: Reactive compact** (feature-gated)
- Fires on API's `prompt_too_long` error
- Last resort when proactive auto-compact fails

**Layer 5: Context Collapse** (feature-gated, experimental)
- When enabled, **suppresses auto-compact entirely** (`autoCompact.ts:207-223`)
- Owns the headroom problem with its own 90%/95% commit/blocking flow
- More granular than compaction

**GSD implication:** GSD has no context awareness. Executors don't know how much context remains. The auto-compact pattern shows that monitoring context usage and triggering summarization at thresholds is essential. GSD could inject a "context budget" into executor prompts or use the SDK's token tracking to trigger early plan completion.

### 2.2 Compaction Prompt Structure

The compaction summary (`compact/prompt.ts`) preserves 9 specific sections:

1. **Primary Request and Intent** -- user's explicit requests
2. **Key Technical Concepts** -- technologies, frameworks
3. **Files and Code Sections** -- with full code snippets
4. **Errors and Fixes** -- including user feedback
5. **Problem Solving** -- solved problems, ongoing troubleshooting
6. **All user messages** -- critical for understanding intent changes
7. **Pending Tasks** -- explicitly requested work
8. **Current Work** -- precise description of what was being done
9. **Optional Next Step** -- directly in line with most recent request

**Key detail:** The compaction uses an `<analysis>` scratchpad that gets stripped before the summary reaches context. This drafting-then-formatting pattern improves summary quality.

**Post-compact restoration:** After compaction, the system re-reads up to **5 most recently accessed files** (`POST_COMPACT_MAX_FILES_TO_RESTORE = 5`) with a 50,000 token budget (`POST_COMPACT_TOKEN_BUDGET`). This combats the "stale file" problem.

**GSD implication:** GSD's phase transitions lose context completely -- each phase starts fresh. Adopting a structured summary format (like the 9-section compact template) for phase-to-phase handoffs would preserve critical context. The "re-read top 5 files" pattern is directly applicable to GSD's phase begin step.

### 2.3 Micro-Compact (Function Result Clearing)

Old tool results are automatically cleared from context to free space. The system:
- Keeps the N most recent results (`keepRecent` from config)
- Replaces old results with `[Old tool result content cleared]`
- Only clears specific tool types: Read, Bash, Grep, Glob, WebSearch, WebFetch, Edit, Write

**System prompt tells the model:** "Write down any important information you might need later in your response, as the original tool result may be cleared later."

**Source:** `prompts.ts:841` and `microCompact.ts:41-50`

**GSD implication:** This is the "note-taking" pattern -- the model is told to extract and persist critical information before it gets cleared. GSD should teach executors to write findings to STATE.md or plan notes before context decay erases the raw data.

---

## 3. Coordinator System

### 3.1 Coordinator Mode Architecture

The coordinator is a distinct operational mode (`CLAUDE_CODE_COORDINATOR_MODE=1`) that transforms Claude Code into a task orchestrator.

**Source:** `coordinator/coordinatorMode.ts:111-369`

The coordinator system prompt defines a **4-phase workflow**:

| Phase | Who | Purpose |
|-------|-----|---------|
| Research | Workers (parallel) | Investigate codebase, find files, understand problem |
| Synthesis | **Coordinator** | Read findings, understand problem, craft implementation specs |
| Implementation | Workers | Make targeted changes per spec, commit |
| Verification | Workers | Test changes work |

**Critical coordinator rules:**
- "Never delegate understanding" -- the coordinator must synthesize research findings itself, never pass raw findings to an implementer
- "based on your findings, fix the bug" is explicitly an anti-pattern
- Implementation specs must include **specific file paths, line numbers, and what to change**

**Concurrency rules:**
- Read-only tasks: run in parallel freely
- Write-heavy tasks: one at a time per set of files
- Verification can run alongside implementation on different file areas

**GSD implication:** This is the exact problem GSD solves but at a different scale. Key differences:
1. Claude Code's coordinator synthesizes between research and implementation in real-time. GSD's phase transitions are rigid -- discuss -> plan -> execute with no synthesis step.
2. The "never delegate understanding" rule is critical. GSD executors often receive plans without the planner's reasoning. Adding a "synthesis" artifact (why this plan, what was considered) would improve execution quality.
3. The concurrency model (read-parallel, write-serial) maps directly to GSD's wave system but is more granular.

### 3.2 Worker Tools and Scratchpad

Workers in coordinator mode get:
- Standard tools (Bash, Read, Edit, Write, Glob, Grep, etc.)
- MCP tools from connected servers
- Project skills via Skill tool

The **scratchpad directory** is a per-session directory for cross-worker knowledge sharing:

**Source:** `coordinatorMode.ts:104-106`:
```
Scratchpad directory: ${scratchpadDir}
Workers can read and write here without permission prompts.
Use this for durable cross-worker knowledge — structure files however fits the work.
```

**GSD implication:** GSD has `.planning/` as its scratchpad equivalent but it's not explicitly positioned as a cross-agent communication channel. The scratchpad pattern shows that agents need a designated space for intermediate artifacts that survives across agent boundaries.

### 3.3 Worker Continuation Pattern

The coordinator can **continue** existing workers via `SendMessage` instead of spawning new ones. Decision criteria:

| Situation | Mechanism | Why |
|-----------|-----------|-----|
| Research explored exactly the files needing editing | Continue | Worker already has files in context |
| Research was broad, implementation is narrow | Spawn fresh | Avoid exploration noise |
| Correcting a failure | Continue | Worker has error context |
| Verifying another worker's code | Spawn fresh | Fresh eyes, no implementation bias |
| First attempt used wrong approach | Spawn fresh | Wrong-approach context pollutes retry |

**GSD implication:** GSD always spawns fresh executors for each plan. There's no mechanism to continue an executor that built up context during a prior task. For multi-plan phases, the ability to continue a "warm" executor would save significant context-building time.

---

## 4. Built-in Agent Specializations

### 4.1 Explore Agent (Read-Only Search Specialist)

**Source:** `built-in/exploreAgent.ts`

- **Strictly read-only** -- file editing tools are disallowed
- Has thoroughness levels: "quick", "medium", "very thorough"
- Uses Haiku model for speed (external users) or inherits parent model (Anthropic employees)
- **Omits CLAUDE.md** from context -- doesn't need project rules for search
- **Omits gitStatus** -- runs `git status` itself if needed for fresh data
- Designed as "fast agent that returns output as quickly as possible"

### 4.2 Plan Agent (Read-Only Architect)

**Source:** `built-in/planAgent.ts`

- Read-only mode -- explores codebase and designs implementation plans
- Must output: step-by-step strategy, dependencies, sequencing, potential challenges
- Required output includes **3-5 critical files** for implementation
- Also omits CLAUDE.md and gitStatus from context

### 4.3 Verification Agent (Adversarial Tester)

**Source:** `built-in/verificationAgent.ts`

This is the most sophisticated built-in agent. Key patterns:

- **Cannot modify project files** (can write ephemeral test scripts to /tmp)
- Explicitly told about its own failure patterns: "verification avoidance" and "being seduced by the first 80%"
- Every check requires: Command run, Output observed, Result
- Must include at least one **adversarial probe** (concurrency, boundary, idempotency)
- Outputs structured verdicts: `VERDICT: PASS`, `VERDICT: FAIL`, `VERDICT: PARTIAL`
- Before issuing FAIL, must check if behavior is intentional or already handled elsewhere

**Invocation criteria:** Non-trivial = 3+ file edits, backend/API changes, or infrastructure changes.

**GSD implication:** GSD's verify phase could adopt the verification agent's structured approach -- mandatory command execution evidence, adversarial probes, and the "check if intentional before failing" pattern.

---

## 5. TodoWrite Task Tracking

### 5.1 When Tasks Are Created

**Source:** `tools/TodoWriteTool/prompt.ts`

TodoWrite is triggered for:
- Complex multi-step tasks (3+ distinct steps)
- Non-trivial tasks requiring planning
- User provides multiple tasks
- After receiving new instructions

NOT triggered for:
- Single straightforward tasks
- Trivial tasks (< 3 steps)
- Purely conversational requests

### 5.2 Task State Machine

States: `pending` -> `in_progress` -> `completed`

**Critical rule:** Exactly ONE task must be `in_progress` at any time.

Each task has two description forms:
- `content`: imperative ("Run tests")
- `activeForm`: present continuous ("Running tests")

**GSD implication:** GSD plans have tasks but don't enforce single-active-task discipline. The TodoWrite pattern of exactly-one-active and immediate-completion-marking prevents the common GSD problem where executors work on multiple tasks simultaneously and lose track.

---

## 6. File/Scope Limits

### 6.1 Post-Compact File Restoration

- `POST_COMPACT_MAX_FILES_TO_RESTORE = 5` (max files re-read after compact)
- `POST_COMPACT_TOKEN_BUDGET = 50_000` (total token budget for restoration)
- `POST_COMPACT_MAX_TOKENS_PER_FILE = 5_000` (per-file limit)
- `POST_COMPACT_MAX_TOKENS_PER_SKILL = 5_000` (per-skill limit)
- `POST_COMPACT_SKILLS_TOKEN_BUDGET = 25_000` (total skills budget)

**Source:** `compact.ts:122-130`

### 6.2 Context Window Management

- `AUTOCOMPACT_BUFFER_TOKENS = 13,000` -- headroom before auto-compact
- `WARNING_THRESHOLD_BUFFER_TOKENS = 20,000` -- warning zone
- `MANUAL_COMPACT_BUFFER_TOKENS = 3,000` -- blocking limit buffer
- `MAX_OUTPUT_TOKENS_FOR_SUMMARY = 20,000` -- reserved for compact output
- `MAX_CONSECUTIVE_AUTOCOMPACT_FAILURES = 3` -- circuit breaker

### 6.3 Numeric Length Anchors (Ant-only)

**Source:** `prompts.ts:531-534`:
```
Length limits: keep text between tool calls to <=25 words.
Keep final responses to <=100 words unless the task requires more detail.
```

**GSD implication:** GSD executors produce verbose output. Adding explicit word limits for inter-tool-call text and final reports would reduce context consumption.

---

## 7. System Prompt Architecture

### 7.1 Cache-Aware Prompt Splitting

The system prompt is split by `SYSTEM_PROMPT_DYNAMIC_BOUNDARY`:
- **Before boundary:** Static content, cross-org cacheable (`scope: 'global'`)
- **After boundary:** Session-specific content (model, tools, MCP, scratchpad)

**Source:** `prompts.ts:106-115`

This is why features like coordinator mode, fork subagent, and verification agent are checked **after** the boundary -- they vary per session and would bust the global cache if included in the static prefix.

### 7.2 Subagent Context Trimming

The system is aggressive about reducing subagent context:
- Explore/Plan agents: CLAUDE.md omitted, gitStatus omitted
- One-shot agents (Explore, Plan): Skip agentId/SendMessage/usage trailer to save ~135 chars
- Read-only agents don't get commit/PR/lint rules

**Source:** `runAgent.ts:387-410`

### 7.3 Key System Prompt Rules

From `prompts.ts`:
- "Read a file before modifying it" -- always read existing code first
- "Do not create files unless absolutely necessary"
- "If an approach fails, diagnose why before switching tactics"
- "Don't add features beyond what was asked"
- "Don't create helpers or abstractions for one-time operations"
- "Report outcomes faithfully" -- never claim "all tests pass" when they don't

---

## 8. Actionable Recommendations for GSD

### 8.1 Immediate Wins

1. **Add scope echo to executor prompts**: Require executors to state their scope at the start, like fork children's "Scope:" prefix. This catches scope misunderstanding before execution begins.

2. **Enforce commit-before-report**: Fork children must commit before reporting. GSD executors should do the same -- no "I made changes" without a commit hash.

3. **Set maxTurns per plan complexity**: Simple plans: 30 turns. Medium: 100. Complex: 200. Prevents runaway execution.

4. **Add context budget awareness**: Inject estimated token budget into executor prompts. When approaching limits, prioritize completing current task over starting new ones.

### 8.2 Architecture Improvements

5. **Structured phase handoff summaries**: Adopt the 9-section compact template for phase transitions. Current phase-to-phase handoffs lose critical context.

6. **Synthesis step between research and execution**: The coordinator's "never delegate understanding" rule reveals a gap in GSD. Add a synthesis artifact between discuss/research and plan phases.

7. **Worker continuation for multi-plan phases**: Allow executors to persist context across plans within a phase, rather than always starting cold.

8. **Verification agent pattern for verify phase**: Adopt structured verification with mandatory command evidence, adversarial probes, and VERDICT format.

### 8.3 Longer-Term Ideas

9. **Scratchpad directory for cross-agent communication**: Formalize `.planning/scratch/` as an ephemeral cross-agent communication channel within a phase.

10. **Worktree isolation for parallel wave execution**: Use git worktrees to allow truly parallel plan execution without file conflicts.

11. **Micro-compact for long-running executors**: Teach executors to write critical findings to plan notes before context decay erases raw tool output.

12. **Single-active-task discipline**: Enforce exactly-one-in-progress-task tracking in executor prompts, matching TodoWrite's discipline pattern.

---

## Source Index

| Finding | Source File | Lines |
|---------|------------|-------|
| Fork subagent feature gate | `tools/AgentTool/forkSubagent.ts` | 19-39 |
| Fork child rules | `tools/AgentTool/forkSubagent.ts` | 171-198 |
| Worktree notice | `tools/AgentTool/forkSubagent.ts` | 200-210 |
| Fork maxTurns (200) | `tools/AgentTool/forkSubagent.ts` | 65 |
| Coordinator system prompt | `coordinator/coordinatorMode.ts` | 111-369 |
| Coordinator scratchpad | `coordinator/coordinatorMode.ts` | 104-106 |
| Auto-compact thresholds | `services/compact/autoCompact.ts` | 63-91 |
| Circuit breaker (3 failures) | `services/compact/autoCompact.ts` | 68-70 |
| Compact prompt (9 sections) | `services/compact/prompt.ts` | 61-143 |
| Post-compact file restore | `services/compact/compact.ts` | 122-130 |
| Micro-compact tool list | `services/compact/microCompact.ts` | 41-50 |
| Agent memory system | `tools/AgentTool/agentMemory.ts` | 12-177 |
| Memory snapshot sync | `tools/AgentTool/agentMemorySnapshot.ts` | 98-144 |
| Explore agent (read-only) | `tools/AgentTool/built-in/exploreAgent.ts` | 13-83 |
| Plan agent (read-only) | `tools/AgentTool/built-in/planAgent.ts` | 14-92 |
| Verification agent | `tools/AgentTool/built-in/verificationAgent.ts` | 10-152 |
| TodoWrite task states | `tools/TodoWriteTool/prompt.ts` | 1-181 |
| Default agent prompt | `constants/prompts.ts` | 758 |
| Subagent context trimming | `tools/AgentTool/runAgent.ts` | 387-410 |
| System prompt boundary | `constants/prompts.ts` | 106-115 |
| Numeric length anchors | `constants/prompts.ts` | 531-534 |
| Tool result clearing prompt | `constants/prompts.ts` | 841 |
| Agent prompt (fork examples) | `tools/AgentTool/prompt.ts` | 78-287 |
| General purpose agent | `tools/AgentTool/built-in/generalPurposeAgent.ts` | 1-34 |
