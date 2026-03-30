# Token Optimization & Lean Mode

**Date:** 2026-03-30
**Status:** Approved
**Scope:** Fork-only changes (grgbrasil/get-shit-done-1), not upstream

## Problem

After introducing Function Map, Impact Analysis, OPS system, and Preflight checks to our GSD fork, CLI token consumption increased significantly:

- 4 agents inflated with static instructions (+234 lines / ~10KB per session)
- 10 new OPS commands (16KB total) loaded on demand
- 6 agents classified as SIMPLE run on expensive models unnecessarily
- All agent work consumes CLI tokens regardless of complexity

## Solution Overview

Five integrated optimizations:

1. **Prompt Slimming** — Extract injected instructions from agents to on-demand reference files
2. **LLM Router** — Route SIMPLE agents to cheap external APIs (DeepSeek, Gemini Flash)
3. **Workflow Integration** — `route-agent` command as interception point before agent spawns
4. **Context Collectors** — Pre-collect tool data so SIMPLE agents can run remotely without tools
5. **Execution Modes** — `--full` (CLI-only, upstream-like) vs `--lean` (routing active) vs `auto` (default)

## Execution Modes

Three modes control whether routing and model downgrade are active:

| Mode | Routing | Model Downgrade | When |
|---|---|---|---|
| `full` | OFF — all agents local | OFF — upstream profiles | User wants official behavior |
| `lean` | ON — SIMPLE agents routed to API | ON — SIMPLE agents use Haiku when local | User wants to save CLI tokens |
| `auto` | Lean if `providers.json` exists, else full | Follows routing decision | Default — zero-config |

### Priority

1. CLI flag `--full` or `--lean` (highest)
2. `.planning/config.json` field `execution_mode`
3. Default: `"auto"`

### Config

```json
// .planning/config.json (addition)
{
  "execution_mode": "auto"
}
```

### Invocation

```bash
/gsd:execute-phase          # auto
/gsd:execute-phase --full   # force CLI-only
/gsd:execute-phase --lean   # force routing, error if no API keys
```

## 1. Prompt Slimming

### What Changes

Extract static instruction blocks injected into upstream agents into reference files read on demand.

### Files Created

```
get-shit-done/references/
├── impact-analysis-protocol.md    # 65 lines, from gsd-executor.md
├── plan-checker-guardrails.md     # 120 lines, from gsd-plan-checker.md
├── planner-guardrails.md          # 30 lines, from gsd-planner.md
└── scope-erosion-guard.md         # 19 lines, from gsd-phase-researcher.md
```

### Agent Modifications

Replace each injected block with a conditional 3-line instruction:

```markdown
## Fork Guardrails
If `.planning/function-map.json` exists, read `references/impact-analysis-protocol.md`
before editing any function. Follow its protocol exactly.
```

### Agents Affected

| Agent | Lines Removed | Reference File |
|---|---|---|
| `gsd-executor.md` | 65 | `impact-analysis-protocol.md` |
| `gsd-plan-checker.md` | 120 | `plan-checker-guardrails.md` |
| `gsd-planner.md` | 30 | `planner-guardrails.md` |
| `gsd-phase-researcher.md` | 19 | `scope-erosion-guard.md` |
| **Total** | **234 lines (~10KB)** | |

### Safety Net

The `gsd-impact-guard.js` pre-commit hook still catches violations at commit time regardless of whether the agent read the reference file.

## 2. LLM Router

### New Module

`get-shit-done/bin/lib/llm-router.cjs`

### Providers

```javascript
const PROVIDERS = {
  'deepseek-v3': {
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    cost: { input: 0.27, output: 1.10 },  // USD per 1M tokens
    format: 'openai-compatible'
  },
  'gemini-flash': {
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    model: 'gemini-2.0-flash',
    cost: { input: 0.075, output: 0.30 },
    format: 'google'
  }
};
```

### API Keys

Stored in `~/.config/gsd/providers.json` (outside repo, never committed):

```json
{
  "deepseek-v3": { "api_key": "sk-..." },
  "gemini-flash": { "api_key": "AIza..." }
}
```

### Agent Routing Table

Extension to `model-profiles.cjs`:

```javascript
const AGENT_ROUTING = {
  // SIMPLE → remote when lean mode
  'gsd-cataloger':            { route: 'remote', provider: 'deepseek-v3' },
  'gsd-nyquist-auditor':      { route: 'remote', provider: 'deepseek-v3' },
  'gsd-assumptions-analyzer': { route: 'remote', provider: 'deepseek-v3' },
  'gsd-advisor-researcher':   { route: 'remote', provider: 'deepseek-v3' },
  'gsd-ui-checker':           { route: 'remote', provider: 'deepseek-v3' },
  'gsd-research-synthesizer': { route: 'remote', provider: 'deepseek-v3' },

  // MEDIUM/COMPLEX → always local
  'gsd-planner':              { route: 'local' },
  'gsd-executor':             { route: 'local' },
  'gsd-debugger':             { route: 'local' },
  'gsd-verifier':             { route: 'local' },
  'gsd-plan-checker':         { route: 'local' },
  'gsd-phase-researcher':     { route: 'local' },
  'gsd-roadmapper':           { route: 'local' },
  'gsd-project-researcher':   { route: 'local' },
  'gsd-codebase-mapper':      { route: 'local' },
  'gsd-integration-checker':  { route: 'local' },
  'gsd-ui-researcher':        { route: 'local' },
  'gsd-ui-auditor':           { route: 'local' },
};
// Default for unlisted agents: { route: 'local' }
```

### Model Downgrade (lean mode, local fallback)

When an agent is routed `remote` but the API call fails or keys are missing (auto mode fallback), the agent runs locally with downgraded model:

```javascript
const LEAN_MODEL_OVERRIDES = {
  'gsd-cataloger':            'haiku',  // already haiku
  'gsd-nyquist-auditor':      'haiku',  // was sonnet
  'gsd-assumptions-analyzer': 'haiku',  // was default (sonnet)
  'gsd-advisor-researcher':   'haiku',  // was default (sonnet)
  'gsd-ui-checker':           'haiku',  // was sonnet
  'gsd-research-synthesizer': 'haiku',  // was sonnet
};
```

### Fallback Behavior

```
Remote call fails → mode=lean?  → error (user chose lean explicitly)
                  → mode=auto?  → fallback to local with LEAN_MODEL_OVERRIDES
                  → mode=full?  → impossible (never calls remote)
```

### Router Core Function

```javascript
async function routeAgent(agentName, taskPrompt, contextDir, mode) {
  if (mode === 'full') return null;

  const routing = AGENT_ROUTING[agentName] || { route: 'local' };
  if (routing.route === 'local') return null;

  const providerConfig = PROVIDERS[routing.provider];
  const apiKey = loadApiKey(routing.provider);

  if (!apiKey) {
    if (mode === 'lean') throw new Error(`Provider ${routing.provider} not configured`);
    return null; // auto: silent fallback to local
  }

  const collector = COLLECTORS[agentName];
  const collectedContext = collector
    ? await collector(contextDir, taskPrompt)
    : '';

  const agentPrompt = fs.readFileSync(resolveAgentPath(agentName), 'utf8');

  const result = await callProvider(providerConfig, agentPrompt, taskPrompt, collectedContext);

  const outputTarget = OUTPUT_TARGETS[agentName];
  if (outputTarget) {
    fs.writeFileSync(outputTarget(contextDir), result, 'utf8');
  }

  return result;
}
```

## 3. Workflow Integration

### New Dispatcher Command

Addition to `gsd-tools.cjs`:

```javascript
case 'route-agent':
  return cmdRouteAgent(args);
// args: <agentName> --prompt <taskPromptFile> --context <contextDir> [--mode full|lean|auto]
```

**Exit codes:**
- `0` + stdout: Agent executed remotely, result in stdout
- `1`: Agent should be executed locally (routing says local, or fallback)
- `2`: Error (lean mode, no API key)

### Workflow Injection Pattern

In modified workflows (execute-phase.md, plan-phase.md, ui-phase.md), before spawning a SIMPLE agent:

```markdown
Before spawning <agent-name>:
1. Run: `node gsd-tools.cjs route-agent <agent-name> --prompt /tmp/task.md --context <phase-dir>`
2. If exit 0: use stdout as agent result, skip Agent tool spawn
3. If exit 1: spawn Agent tool normally
```

### Workflows Modified

| Workflow | Agents intercepted |
|---|---|
| `execute-phase.md` | gsd-executor delegates to nyquist-auditor, integration-checker |
| `plan-phase.md` | gsd-plan-checker, gsd-assumptions-analyzer |
| `new-project.md` | gsd-research-synthesizer, gsd-project-researcher |

## 4. Context Collectors

Pre-collect data that SIMPLE agents need (substituting tool access) so they can run remotely.

### Collector Definitions

```javascript
const COLLECTORS = {
  'gsd-research-synthesizer': async (contextDir) => {
    // Read all research markdown files
    const researchDir = path.join(contextDir, 'research');
    const files = fs.readdirSync(researchDir).filter(f => f.endsWith('.md'));
    return files.map(f => {
      const content = fs.readFileSync(path.join(researchDir, f), 'utf8');
      return `## ${f}\n${content}`;
    }).join('\n\n');
  },

  'gsd-ui-checker': async (contextDir) => {
    // Read UI-SPEC.md and referenced component files
    const specPath = findFile(contextDir, 'UI-SPEC.md');
    const spec = fs.readFileSync(specPath, 'utf8');
    const refs = extractFileRefs(spec);
    const refContents = refs.map(r => `## ${r}\n${safeRead(r)}`).join('\n\n');
    return `# UI-SPEC.md\n${spec}\n\n# Referenced Files\n${refContents}`;
  },

  'gsd-assumptions-analyzer': async (contextDir, taskPrompt) => {
    // Extract grep patterns from task, run them, return results
    const patterns = extractSearchPatterns(taskPrompt);
    const results = patterns.map(p => {
      const output = execSync(`grep -rn "${p}" "${contextDir}" 2>/dev/null || true`);
      return `### Pattern: ${p}\n${output}`;
    });
    return results.join('\n\n');
  },

  'gsd-nyquist-auditor': async (contextDir) => {
    // Run tests and capture output
    const testOutput = execSync('npm test 2>&1 || true', { cwd: projectRoot() });
    const verificationFiles = glob.sync(`${contextDir}/*VERIFICATION*`);
    const verifications = verificationFiles.map(f =>
      `## ${path.basename(f)}\n${fs.readFileSync(f, 'utf8')}`
    ).join('\n\n');
    return `# Test Output\n${testOutput}\n\n# Verification Files\n${verifications}`;
  },

  'gsd-advisor-researcher': async (contextDir, taskPrompt) => {
    // Advisor compares options in a structured table.
    // Input: task prompt (contains the decision question) + any existing research.
    // The LLM does the reasoning; no web search needed for most comparisons.
    const existing = glob.sync(`${contextDir}/research/*.md`);
    const researchContext = existing.map(f => fs.readFileSync(f, 'utf8')).join('\n\n');
    return `# Task\n${taskPrompt}\n\n# Existing Research\n${researchContext}`;
  },

  'gsd-cataloger': async (contextDir) => {
    // Cataloger updates function-map.json with symbol registry.
    // Collector extracts: exported functions/classes/methods with signatures.
    // Output: structured text the LLM parses into function-map JSON entries.
    const projectRoot = findProjectRoot(contextDir);
    const existingMap = safeReadJSON(path.join(projectRoot, '.planning/function-map.json')) || {};
    const targetFiles = resolveModifiedFiles(projectRoot); // git diff --name-only
    const symbols = targetFiles.map(f => {
      const exports = execSync(
        `grep -n "^function\\|^class\\|^const.*=.*=>\\|module\\.exports\\|^export" "${f}" 2>/dev/null || true`
      );
      return `## ${f}\n${exports}`;
    });
    return `# Existing Map (${Object.keys(existingMap).length} entries)\n${JSON.stringify(existingMap, null, 2)}\n\n# Modified Files Symbols\n${symbols.join('\n\n')}`;
  },
};
```

### Output Targets

Agents that produce files (not just stdout):

```javascript
const OUTPUT_TARGETS = {
  'gsd-research-synthesizer': (ctx) => path.join(ctx, 'research', 'SUMMARY.md'),
  'gsd-nyquist-auditor':      (ctx) => path.join(ctx, 'NYQUIST-AUDIT.md'),
  'gsd-cataloger':            ()    => '.planning/function-map.json',
};
```

## File Inventory

### New Files

| File | Purpose | Size Est. |
|---|---|---|
| `get-shit-done/bin/lib/llm-router.cjs` | Router core + collectors + provider calls | ~300 lines |
| `get-shit-done/references/impact-analysis-protocol.md` | Extracted from gsd-executor | 65 lines |
| `get-shit-done/references/plan-checker-guardrails.md` | Extracted from gsd-plan-checker | 120 lines |
| `get-shit-done/references/planner-guardrails.md` | Extracted from gsd-planner | 30 lines |
| `get-shit-done/references/scope-erosion-guard.md` | Extracted from gsd-phase-researcher | 19 lines |

### Modified Files

| File | Change |
|---|---|
| `get-shit-done/bin/gsd-tools.cjs` | Add `route-agent` command dispatch |
| `get-shit-done/bin/lib/model-profiles.cjs` | Add AGENT_ROUTING, LEAN_MODEL_OVERRIDES |
| `agents/gsd-executor.md` | Replace 65-line block with 3-line conditional |
| `agents/gsd-plan-checker.md` | Replace 120-line block with 3-line conditional |
| `agents/gsd-planner.md` | Replace 30-line block with 3-line conditional |
| `agents/gsd-phase-researcher.md` | Replace 19-line block with 3-line conditional |
| `get-shit-done/workflows/execute-phase.md` | Add route-agent interception |
| `get-shit-done/workflows/plan-phase.md` | Add route-agent interception |
| `get-shit-done/workflows/new-project.md` | Add route-agent interception |
| `.planning/config.json` | Add `execution_mode` field |

### Config Files (user-side, not committed)

| File | Purpose |
|---|---|
| `~/.config/gsd/providers.json` | API keys for external providers |

## Testing Strategy

- Unit tests for `llm-router.cjs`: routing logic, mode resolution, fallback behavior
- Unit tests for each collector: mock filesystem, verify output format
- Integration test: `route-agent` command with mock provider
- Manual validation: run a phase in `--lean` mode vs `--full` mode, compare results

## Estimated Token Savings

| Optimization | Savings |
|---|---|
| Prompt slimming (reference files) | ~10KB per session for affected agents |
| Remote routing (6 agents) | 100% CLI token savings for those agents |
| Model downgrade (local fallback) | ~60% cost reduction (Haiku vs Sonnet) |
| **Combined** | **40-60% overall CLI token reduction** |
