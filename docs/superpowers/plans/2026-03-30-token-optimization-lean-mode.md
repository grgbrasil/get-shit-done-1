# Token Optimization & Lean Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce CLI token consumption by extracting injected agent instructions to on-demand reference files, routing SIMPLE agents to cheap external APIs (DeepSeek, Gemini Flash), and adding a `--full`/`--lean` execution mode toggle.

**Architecture:** New `llm-router.cjs` module handles provider selection, context collection, and API calls. Agent prompts are slimmed by moving fork-specific blocks to `references/` files loaded on demand. Workflows are modified to call `route-agent` before spawning SIMPLE agents. A mode flag (`full`/`lean`/`auto`) controls whether routing is active.

**Tech Stack:** Node.js CommonJS, native `fetch` (Node 18+), OpenAI-compatible API format, existing GSD test patterns (`.test.cjs`)

---

### Task 1: Extract Executor Impact Analysis to Reference File

**Files:**
- Create: `get-shit-done/references/impact-analysis-protocol.md`
- Modify: `agents/gsd-executor.md:288-351`

- [ ] **Step 1: Create the reference file**

Extract the `<impact_analysis>` block content (without the XML tags) from `agents/gsd-executor.md` lines 288-351 into a new file:

```bash
# The content is the full Impact Analysis Protocol section.
# Read agents/gsd-executor.md lines 289-350 (content inside the tags)
# Write to get-shit-done/references/impact-analysis-protocol.md
```

The file should contain everything between `<impact_analysis>` and `</impact_analysis>` (the protocol itself), starting with `## Impact Analysis Protocol`.

- [ ] **Step 2: Replace the block in the executor agent**

In `agents/gsd-executor.md`, replace the entire `<impact_analysis>...</impact_analysis>` block (lines 288-351, 64 lines) with this 4-line conditional:

```markdown
<fork_guardrails>
## Impact Analysis
If `.planning/function-map.json` exists in the project, read the file at
`$HOME/.claude/get-shit-done/references/impact-analysis-protocol.md` using the Read tool
BEFORE editing any function/method/class. Follow its protocol exactly.
</fork_guardrails>
```

- [ ] **Step 3: Verify the executor agent is valid markdown**

```bash
# Quick sanity check — no broken XML tags, no orphaned content
grep -c '<impact_analysis>\|</impact_analysis>' agents/gsd-executor.md
# Expected: 0
grep -c '<fork_guardrails>' agents/gsd-executor.md
# Expected: 1
```

- [ ] **Step 4: Commit**

```bash
git add agents/gsd-executor.md get-shit-done/references/impact-analysis-protocol.md
git commit -m "refactor(executor): extract impact analysis to reference file

Moves 64-line impact analysis protocol from static agent prompt to
on-demand reference file. Agent reads it only when function-map.json exists.
Saves ~3KB per executor session."
```

---

### Task 2: Extract Plan-Checker Guardrails to Reference File

**Files:**
- Create: `get-shit-done/references/plan-checker-guardrails.md`
- Modify: `agents/gsd-plan-checker.md:439-556` (Dimension 11 + 12) and `agents/gsd-plan-checker.md:882-885` (checklist additions)

- [ ] **Step 1: Create the reference file**

Extract two sections from `agents/gsd-plan-checker.md`:
- **Dimension 11: Scope Fidelity** (lines 439-556, ~80 lines) — the scope erosion detection dimension
- **Dimension 12: Research Compliance** (lines 558-556+, ~56 lines) — the research vs locked decisions dimension

Write both to `get-shit-done/references/plan-checker-guardrails.md`, preserving the markdown structure.

- [ ] **Step 2: Replace the dimensions block in the plan-checker**

In `agents/gsd-plan-checker.md`, replace the Dimension 11 + Dimension 12 blocks (from `## Dimension 11: Scope Fidelity` to the line before `</verification_dimensions>`) with:

```markdown
## Dimensions 11-12: Fork Guardrails (Scope Fidelity + Research Compliance)

Read `$HOME/.claude/get-shit-done/references/plan-checker-guardrails.md` using the Read tool.
Apply Dimension 11 (Scope Fidelity) and Dimension 12 (Research Compliance) from that file
as additional verification dimensions with the same severity/issue format as Dimensions 1-10.
```

- [ ] **Step 3: Update the checklist additions**

In the same file, the 4 checklist lines we added (around line 882-885) reference scope fidelity and research compliance. Replace them with:

```markdown
- [ ] Fork guardrails checked (if reference file was read — Dimensions 11-12)
```

- [ ] **Step 4: Verify and commit**

```bash
grep -c 'Scope Fidelity\|Research Compliance' agents/gsd-plan-checker.md
# Expected: 1 (only the reference instruction mentions them, not the full content)
git add agents/gsd-plan-checker.md get-shit-done/references/plan-checker-guardrails.md
git commit -m "refactor(plan-checker): extract Dimensions 11-12 to reference file

Moves scope fidelity and research compliance checks (~120 lines)
from static prompt to on-demand reference file.
Saves ~5KB per plan-checker session."
```

---

### Task 3: Extract Planner and Researcher Guardrails to Reference Files

**Files:**
- Create: `get-shit-done/references/planner-guardrails.md`
- Create: `get-shit-done/references/scope-erosion-guard.md`
- Modify: `agents/gsd-planner.md:375-410` (PROHIBITED section)
- Modify: `agents/gsd-phase-researcher.md:57-78` (CRITICAL section)

- [ ] **Step 1: Create planner guardrails reference**

Extract from `agents/gsd-planner.md` the section `## PROHIBITED: Scope Reduction Instead of Splitting` (lines 375-410, 30 lines added by our fork). Write to `get-shit-done/references/planner-guardrails.md`.

- [ ] **Step 2: Replace in planner agent**

Replace the `## PROHIBITED: Scope Reduction Instead of Splitting` section (lines 375-410) with:

```markdown
## Scope Reduction Guard
Read `$HOME/.claude/get-shit-done/references/planner-guardrails.md` using the Read tool.
It contains PROHIBITED patterns for scope-reducing language. Apply before finalizing plans.
```

- [ ] **Step 3: Create researcher guardrails reference**

Extract from `agents/gsd-phase-researcher.md` the `**CRITICAL: Locked Decision Integrity**` section (lines 58-78, 19 lines added by our fork). Write to `get-shit-done/references/scope-erosion-guard.md`.

- [ ] **Step 4: Replace in researcher agent**

Replace the `**CRITICAL: Locked Decision Integrity**` section (lines 58-78) with:

```markdown
**Locked Decision Integrity:** Read `$HOME/.claude/get-shit-done/references/scope-erosion-guard.md`
using the Read tool. Apply its rules when researching locked decisions.
```

- [ ] **Step 5: Commit**

```bash
git add agents/gsd-planner.md agents/gsd-phase-researcher.md \
      get-shit-done/references/planner-guardrails.md \
      get-shit-done/references/scope-erosion-guard.md
git commit -m "refactor(agents): extract planner + researcher guardrails to reference files

Moves 49 lines of fork-specific guardrails from static prompts to
on-demand reference files. Saves ~2KB per session for each agent."
```

---

### Task 4: Add Routing Tables and Mode Config to model-profiles.cjs

**Files:**
- Modify: `get-shit-done/bin/lib/model-profiles.cjs`
- Test: `tests/model-profiles.test.cjs`

- [ ] **Step 1: Write failing tests for routing resolution**

Add tests to `tests/model-profiles.test.cjs`:

```javascript
// Test: AGENT_ROUTING exists and classifies agents correctly
test('AGENT_ROUTING maps simple agents to remote', () => {
  const { AGENT_ROUTING } = require('../get-shit-done/bin/lib/model-profiles.cjs');
  assert.strictEqual(AGENT_ROUTING['gsd-cataloger'].route, 'remote');
  assert.strictEqual(AGENT_ROUTING['gsd-research-synthesizer'].route, 'remote');
  assert.strictEqual(AGENT_ROUTING['gsd-ui-checker'].route, 'remote');
});

test('AGENT_ROUTING maps complex agents to local', () => {
  const { AGENT_ROUTING } = require('../get-shit-done/bin/lib/model-profiles.cjs');
  assert.strictEqual(AGENT_ROUTING['gsd-planner'].route, 'local');
  assert.strictEqual(AGENT_ROUTING['gsd-executor'].route, 'local');
  assert.strictEqual(AGENT_ROUTING['gsd-debugger'].route, 'local');
});

test('AGENT_ROUTING defaults to local for unknown agents', () => {
  const { AGENT_ROUTING } = require('../get-shit-done/bin/lib/model-profiles.cjs');
  assert.strictEqual(AGENT_ROUTING['unknown-agent'], undefined); // caller treats undefined as local
});

test('LEAN_MODEL_OVERRIDES downgrades simple agents to haiku', () => {
  const { LEAN_MODEL_OVERRIDES } = require('../get-shit-done/bin/lib/model-profiles.cjs');
  assert.strictEqual(LEAN_MODEL_OVERRIDES['gsd-nyquist-auditor'], 'haiku');
  assert.strictEqual(LEAN_MODEL_OVERRIDES['gsd-ui-checker'], 'haiku');
  assert.strictEqual(LEAN_MODEL_OVERRIDES['gsd-research-synthesizer'], 'haiku');
});

test('resolveExecutionMode returns full/lean/auto correctly', () => {
  const { resolveExecutionMode } = require('../get-shit-done/bin/lib/model-profiles.cjs');
  // CLI flag takes priority
  assert.strictEqual(resolveExecutionMode({ cliFlag: 'full', configMode: 'lean' }), 'full');
  assert.strictEqual(resolveExecutionMode({ cliFlag: 'lean', configMode: 'full' }), 'lean');
  // Config fallback
  assert.strictEqual(resolveExecutionMode({ cliFlag: null, configMode: 'lean' }), 'lean');
  // Default is auto
  assert.strictEqual(resolveExecutionMode({ cliFlag: null, configMode: null }), 'auto');
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- tests/model-profiles.test.cjs
# Expected: FAIL — AGENT_ROUTING, LEAN_MODEL_OVERRIDES, resolveExecutionMode not exported
```

- [ ] **Step 3: Implement routing tables and mode resolver**

Add to `get-shit-done/bin/lib/model-profiles.cjs` after line 26 (after `MODEL_PROFILES`):

```javascript
const AGENT_ROUTING = {
  // SIMPLE → remote when lean mode active
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

const LEAN_MODEL_OVERRIDES = {
  'gsd-cataloger':            'haiku',
  'gsd-nyquist-auditor':      'haiku',
  'gsd-assumptions-analyzer': 'haiku',
  'gsd-advisor-researcher':   'haiku',
  'gsd-ui-checker':           'haiku',
  'gsd-research-synthesizer': 'haiku',
};

/**
 * Resolves the execution mode from CLI flag and config.
 * Priority: CLI flag > config > default (auto).
 *
 * @param {{ cliFlag: string|null, configMode: string|null }} opts
 * @returns {'full'|'lean'|'auto'}
 */
function resolveExecutionMode({ cliFlag, configMode }) {
  if (cliFlag === 'full' || cliFlag === 'lean') return cliFlag;
  if (configMode === 'full' || configMode === 'lean' || configMode === 'auto') return configMode;
  return 'auto';
}
```

Update `module.exports` to include the new exports:

```javascript
module.exports = {
  MODEL_PROFILES,
  VALID_PROFILES,
  AGENT_ROUTING,
  LEAN_MODEL_OVERRIDES,
  formatAgentToModelMapAsTable,
  getAgentToModelMapForProfile,
  resolveExecutionMode,
};
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- tests/model-profiles.test.cjs
# Expected: PASS
```

- [ ] **Step 5: Commit**

```bash
git add get-shit-done/bin/lib/model-profiles.cjs tests/model-profiles.test.cjs
git commit -m "feat(model-profiles): add agent routing table, lean overrides, and mode resolver

AGENT_ROUTING classifies 18 agents as local/remote.
LEAN_MODEL_OVERRIDES downgrades 6 SIMPLE agents to haiku.
resolveExecutionMode() resolves full/lean/auto from CLI flag + config."
```

---

### Task 5: Create LLM Router Core Module

**Files:**
- Create: `get-shit-done/bin/lib/llm-router.cjs`
- Create: `tests/llm-router.test.cjs`

- [ ] **Step 1: Write failing tests for provider call and routing logic**

Create `tests/llm-router.test.cjs`:

```javascript
const assert = require('node:assert');
const { describe, it, beforeEach } = require('node:test');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

describe('llm-router', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'llm-router-test-'));
  });

  describe('loadApiKey', () => {
    it('returns null when providers.json does not exist', () => {
      const { loadApiKey } = require('../get-shit-done/bin/lib/llm-router.cjs');
      // Point to nonexistent config
      const key = loadApiKey('deepseek-v3', path.join(tmpDir, 'nonexistent.json'));
      assert.strictEqual(key, null);
    });

    it('returns api_key when providers.json has the provider', () => {
      const { loadApiKey } = require('../get-shit-done/bin/lib/llm-router.cjs');
      const configPath = path.join(tmpDir, 'providers.json');
      fs.writeFileSync(configPath, JSON.stringify({
        'deepseek-v3': { api_key: 'sk-test-123' }
      }));
      const key = loadApiKey('deepseek-v3', configPath);
      assert.strictEqual(key, 'sk-test-123');
    });

    it('returns null when provider not in config', () => {
      const { loadApiKey } = require('../get-shit-done/bin/lib/llm-router.cjs');
      const configPath = path.join(tmpDir, 'providers.json');
      fs.writeFileSync(configPath, JSON.stringify({
        'gemini-flash': { api_key: 'AIza-test' }
      }));
      const key = loadApiKey('deepseek-v3', configPath);
      assert.strictEqual(key, null);
    });
  });

  describe('shouldRouteRemote', () => {
    it('returns false in full mode', () => {
      const { shouldRouteRemote } = require('../get-shit-done/bin/lib/llm-router.cjs');
      assert.strictEqual(shouldRouteRemote('gsd-cataloger', 'full'), false);
    });

    it('returns true for remote agent in lean mode', () => {
      const { shouldRouteRemote } = require('../get-shit-done/bin/lib/llm-router.cjs');
      assert.strictEqual(shouldRouteRemote('gsd-cataloger', 'lean'), true);
    });

    it('returns false for local agent in lean mode', () => {
      const { shouldRouteRemote } = require('../get-shit-done/bin/lib/llm-router.cjs');
      assert.strictEqual(shouldRouteRemote('gsd-planner', 'lean'), false);
    });

    it('returns false for unknown agent', () => {
      const { shouldRouteRemote } = require('../get-shit-done/bin/lib/llm-router.cjs');
      assert.strictEqual(shouldRouteRemote('unknown-agent', 'lean'), false);
    });
  });

  describe('buildMessages', () => {
    it('builds system + user messages from agent prompt and task', () => {
      const { buildMessages } = require('../get-shit-done/bin/lib/llm-router.cjs');
      const msgs = buildMessages('You are a helper.', 'Do the thing.', 'context data');
      assert.strictEqual(msgs.length, 2);
      assert.strictEqual(msgs[0].role, 'system');
      assert.ok(msgs[0].content.includes('You are a helper.'));
      assert.strictEqual(msgs[1].role, 'user');
      assert.ok(msgs[1].content.includes('Do the thing.'));
      assert.ok(msgs[1].content.includes('context data'));
    });
  });

  describe('PROVIDERS', () => {
    it('has deepseek-v3 and gemini-flash defined', () => {
      const { PROVIDERS } = require('../get-shit-done/bin/lib/llm-router.cjs');
      assert.ok(PROVIDERS['deepseek-v3']);
      assert.ok(PROVIDERS['gemini-flash']);
      assert.strictEqual(PROVIDERS['deepseek-v3'].format, 'openai-compatible');
      assert.strictEqual(PROVIDERS['gemini-flash'].format, 'google');
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- tests/llm-router.test.cjs
# Expected: FAIL — module not found
```

- [ ] **Step 3: Implement llm-router.cjs**

Create `get-shit-done/bin/lib/llm-router.cjs`:

```javascript
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');
const { AGENT_ROUTING } = require('./model-profiles.cjs');

// ─── Provider Definitions ───────────────────────────────────────

const PROVIDERS = {
  'deepseek-v3': {
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    cost: { input: 0.27, output: 1.10 },
    format: 'openai-compatible',
  },
  'gemini-flash': {
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    model: 'gemini-2.0-flash',
    cost: { input: 0.075, output: 0.30 },
    format: 'google',
  },
};

const DEFAULT_PROVIDERS_PATH = path.join(
  process.env.HOME || process.env.USERPROFILE || '',
  '.config', 'gsd', 'providers.json'
);

// ─── API Key Loading ────────────────────────────────────────────

/**
 * Load API key for a provider from providers.json.
 * @param {string} providerName
 * @param {string} [configPath] - Override path for testing
 * @returns {string|null}
 */
function loadApiKey(providerName, configPath) {
  const filePath = configPath || DEFAULT_PROVIDERS_PATH;
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return data[providerName]?.api_key || null;
  } catch {
    return null;
  }
}

// ─── Routing Logic ──────────────────────────────────────────────

/**
 * Determine if an agent should be routed remotely.
 * @param {string} agentName
 * @param {'full'|'lean'|'auto'} mode
 * @returns {boolean}
 */
function shouldRouteRemote(agentName, mode) {
  if (mode === 'full') return false;
  const routing = AGENT_ROUTING[agentName];
  if (!routing || routing.route === 'local') return false;
  return true;
}

// ─── Message Building ───────────────────────────────────────────

/**
 * Build messages array for LLM API call.
 * @param {string} agentPrompt - The agent's system prompt
 * @param {string} taskPrompt - The task description
 * @param {string} [collectedContext] - Pre-collected context data
 * @returns {Array<{role: string, content: string}>}
 */
function buildMessages(agentPrompt, taskPrompt, collectedContext) {
  const userContent = collectedContext
    ? `${taskPrompt}\n\n---\n\n# Collected Context\n\n${collectedContext}`
    : taskPrompt;
  return [
    { role: 'system', content: agentPrompt },
    { role: 'user', content: userContent },
  ];
}

// ─── Provider API Calls ─────────────────────────────────────────

/**
 * Call an OpenAI-compatible API.
 * @param {object} provider
 * @param {string} apiKey
 * @param {Array} messages
 * @returns {Promise<string>}
 */
async function callOpenAICompatible(provider, apiKey, messages) {
  const response = await fetch(`${provider.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: provider.model,
      messages,
      max_tokens: 8192,
    }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Provider API error ${response.status}: ${body}`);
  }
  const data = await response.json();
  return data.choices[0].message.content;
}

/**
 * Call Google Gemini API.
 * @param {object} provider
 * @param {string} apiKey
 * @param {Array} messages
 * @returns {Promise<string>}
 */
async function callGoogleAPI(provider, apiKey, messages) {
  const systemInstruction = messages.find(m => m.role === 'system')?.content || '';
  const userContent = messages.find(m => m.role === 'user')?.content || '';
  const url = `${provider.baseUrl}/models/${provider.model}:generateContent?key=${apiKey}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemInstruction }] },
      contents: [{ parts: [{ text: userContent }] }],
      generationConfig: { maxOutputTokens: 8192 },
    }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Gemini API error ${response.status}: ${body}`);
  }
  const data = await response.json();
  return data.candidates[0].content.parts[0].text;
}

/**
 * Call the appropriate provider API.
 * @param {object} provider
 * @param {string} apiKey
 * @param {Array} messages
 * @returns {Promise<string>}
 */
async function callProvider(provider, apiKey, messages) {
  if (provider.format === 'openai-compatible') {
    return callOpenAICompatible(provider, apiKey, messages);
  }
  if (provider.format === 'google') {
    return callGoogleAPI(provider, apiKey, messages);
  }
  throw new Error(`Unknown provider format: ${provider.format}`);
}

// ─── Context Collectors ─────────────────────────────────────────

/** @param {string} filePath */
function safeRead(filePath) {
  try { return fs.readFileSync(filePath, 'utf8'); } catch { return ''; }
}

/** @param {string} filePath */
function safeReadJSON(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch { return null; }
}

/**
 * Find project root by looking for .planning/ or .git/.
 * @param {string} startDir
 * @returns {string}
 */
function findProjectRoot(startDir) {
  let dir = path.resolve(startDir);
  for (let i = 0; i < 10; i++) {
    if (fs.existsSync(path.join(dir, '.planning')) || fs.existsSync(path.join(dir, '.git'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return startDir;
}

/**
 * Get list of modified files from git.
 * @param {string} projectRoot
 * @returns {string[]}
 */
function resolveModifiedFiles(projectRoot) {
  try {
    const output = execSync('git diff --name-only HEAD 2>/dev/null || true', {
      cwd: projectRoot, encoding: 'utf8',
    });
    return output.split('\n').filter(f => f && /\.(cjs|js|ts|mjs)$/.test(f))
      .map(f => path.join(projectRoot, f));
  } catch { return []; }
}

/**
 * Glob-like file finder using fs.
 * @param {string} dir
 * @param {string} pattern - Simple suffix match (e.g. '.md')
 * @returns {string[]}
 */
function findFiles(dir, pattern) {
  try {
    return fs.readdirSync(dir)
      .filter(f => f.endsWith(pattern))
      .map(f => path.join(dir, f));
  } catch { return []; }
}

/**
 * Extract file references from markdown content (paths in backticks or quotes).
 * @param {string} content
 * @returns {string[]}
 */
function extractFileRefs(content) {
  const refs = [];
  const patterns = [/`([^`]+\.\w{1,5})`/g, /"([^"]+\.\w{1,5})"/g];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(content)) !== null) {
      if (fs.existsSync(m[1])) refs.push(m[1]);
    }
  }
  return [...new Set(refs)];
}

const COLLECTORS = {
  'gsd-research-synthesizer': async (contextDir) => {
    const researchDir = path.join(contextDir, 'research');
    const files = findFiles(researchDir, '.md');
    return files.map(f => `## ${path.basename(f)}\n${fs.readFileSync(f, 'utf8')}`).join('\n\n');
  },

  'gsd-ui-checker': async (contextDir) => {
    const specFiles = findFiles(contextDir, 'UI-SPEC.md');
    if (!specFiles.length) return '';
    const spec = fs.readFileSync(specFiles[0], 'utf8');
    const refs = extractFileRefs(spec);
    const refContents = refs.map(r => `## ${r}\n${safeRead(r)}`).join('\n\n');
    return `# UI-SPEC.md\n${spec}\n\n# Referenced Files\n${refContents}`;
  },

  'gsd-assumptions-analyzer': async (contextDir, taskPrompt) => {
    // Extract quoted terms from task prompt as search patterns
    const quoted = [...taskPrompt.matchAll(/"([^"]+)"|'([^']+)'/g)].map(m => m[1] || m[2]);
    const patterns = quoted.length ? quoted : ['TODO', 'FIXME', 'HACK'];
    const results = patterns.map(p => {
      try {
        const output = execSync(
          `grep -rn "${p.replace(/"/g, '\\"')}" "${contextDir}" 2>/dev/null || true`,
          { encoding: 'utf8', maxBuffer: 1024 * 1024 }
        );
        return `### Pattern: ${p}\n\`\`\`\n${output.slice(0, 5000)}\n\`\`\``;
      } catch { return `### Pattern: ${p}\n(no results)`; }
    });
    return results.join('\n\n');
  },

  'gsd-nyquist-auditor': async (contextDir) => {
    const projectRoot = findProjectRoot(contextDir);
    let testOutput = '';
    try {
      testOutput = execSync('npm test 2>&1 || true', {
        cwd: projectRoot, encoding: 'utf8', maxBuffer: 1024 * 1024, timeout: 60000,
      });
    } catch (e) { testOutput = e.stdout || e.message; }
    const verFiles = findFiles(contextDir, 'VERIFICATION.md')
      .concat(findFiles(contextDir, '-VERIFICATION.md'));
    const verifications = verFiles.map(f =>
      `## ${path.basename(f)}\n${fs.readFileSync(f, 'utf8')}`
    ).join('\n\n');
    return `# Test Output\n\`\`\`\n${testOutput.slice(0, 10000)}\n\`\`\`\n\n# Verification Files\n${verifications}`;
  },

  'gsd-advisor-researcher': async (contextDir, taskPrompt) => {
    const existing = findFiles(path.join(contextDir, 'research'), '.md');
    const researchContext = existing.map(f => fs.readFileSync(f, 'utf8')).join('\n\n');
    return `# Task\n${taskPrompt}\n\n# Existing Research\n${researchContext}`;
  },

  'gsd-cataloger': async (contextDir) => {
    const projectRoot = findProjectRoot(contextDir);
    const existingMap = safeReadJSON(path.join(projectRoot, '.planning/function-map.json')) || {};
    const targetFiles = resolveModifiedFiles(projectRoot);
    const symbols = targetFiles.map(f => {
      try {
        const exports = execSync(
          `grep -n "^function\\|^class\\|^const.*=.*=>\\|module\\.exports\\|^export" "${f}" 2>/dev/null || true`,
          { encoding: 'utf8' }
        );
        return `## ${path.relative(projectRoot, f)}\n\`\`\`\n${exports}\n\`\`\``;
      } catch { return ''; }
    }).filter(Boolean);
    return `# Existing Map (${Object.keys(existingMap).length} entries)\n\`\`\`json\n${JSON.stringify(existingMap, null, 2).slice(0, 5000)}\n\`\`\`\n\n# Modified Files Symbols\n${symbols.join('\n\n')}`;
  },
};

// ─── Output Targets ─────────────────────────────────────────────

const OUTPUT_TARGETS = {
  'gsd-research-synthesizer': (ctx) => path.join(ctx, 'research', 'SUMMARY.md'),
  'gsd-nyquist-auditor':      (ctx) => path.join(ctx, 'NYQUIST-AUDIT.md'),
  'gsd-cataloger':            (ctx) => path.join(findProjectRoot(ctx), '.planning', 'function-map.json'),
};

// ─── Main Router Function ───────────────────────────────────────

/**
 * Route an agent to remote API or signal local execution.
 *
 * @param {string} agentName - Agent identifier (e.g. 'gsd-cataloger')
 * @param {string} taskPrompt - The task for the agent
 * @param {string} contextDir - Directory with context files
 * @param {'full'|'lean'|'auto'} mode - Execution mode
 * @param {object} [opts] - Options
 * @param {string} [opts.providersPath] - Override providers.json path (for testing)
 * @param {string} [opts.agentsDir] - Override agents directory (for testing)
 * @returns {Promise<{routed: boolean, result?: string, outputFile?: string}>}
 */
async function routeAgent(agentName, taskPrompt, contextDir, mode, opts = {}) {
  if (!shouldRouteRemote(agentName, mode)) {
    return { routed: false };
  }

  const routing = AGENT_ROUTING[agentName];
  const provider = PROVIDERS[routing.provider];
  if (!provider) return { routed: false };

  const apiKey = loadApiKey(routing.provider, opts.providersPath);
  if (!apiKey) {
    if (mode === 'lean') {
      throw new Error(`Provider ${routing.provider} not configured in providers.json. Run with --full or configure API key.`);
    }
    return { routed: false }; // auto: silent fallback
  }

  // Collect context
  const collector = COLLECTORS[agentName];
  const collectedContext = collector ? await collector(contextDir, taskPrompt) : '';

  // Read agent prompt
  const agentsDir = opts.agentsDir || path.join(__dirname, '..', '..', '..', 'agents');
  const agentPromptPath = path.join(agentsDir, `${agentName}.md`);
  const agentPrompt = safeRead(agentPromptPath);
  if (!agentPrompt) {
    return { routed: false }; // agent file not found, fallback to local
  }

  // Build and send
  const messages = buildMessages(agentPrompt, taskPrompt, collectedContext);
  const result = await callProvider(provider, apiKey, messages);

  // Write output if target defined
  const targetFn = OUTPUT_TARGETS[agentName];
  let outputFile = null;
  if (targetFn) {
    outputFile = targetFn(contextDir);
    const outputDir = path.dirname(outputFile);
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(outputFile, result, 'utf8');
  }

  return { routed: true, result, outputFile };
}

module.exports = {
  PROVIDERS,
  COLLECTORS,
  OUTPUT_TARGETS,
  loadApiKey,
  shouldRouteRemote,
  buildMessages,
  callProvider,
  callOpenAICompatible,
  callGoogleAPI,
  routeAgent,
  findProjectRoot,
  resolveModifiedFiles,
  safeRead,
  safeReadJSON,
};
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- tests/llm-router.test.cjs
# Expected: PASS
```

- [ ] **Step 5: Commit**

```bash
git add get-shit-done/bin/lib/llm-router.cjs tests/llm-router.test.cjs
git commit -m "feat(llm-router): create LLM router with providers, collectors, and routing

New module handles:
- Provider definitions (DeepSeek V3, Gemini Flash)
- API key loading from ~/.config/gsd/providers.json
- Route decision (shouldRouteRemote) based on agent + mode
- Context collectors for 6 SIMPLE agents
- OpenAI-compatible and Google API callers
- Output file writing for agents that produce artifacts"
```

---

### Task 6: Wire route-agent Command into Dispatcher

**Files:**
- Modify: `get-shit-done/bin/gsd-tools.cjs`
- Create: `tests/route-agent.test.cjs`

- [ ] **Step 1: Write failing test for route-agent command**

Create `tests/route-agent.test.cjs`:

```javascript
const assert = require('node:assert');
const { describe, it, beforeEach, afterEach } = require('node:test');
const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const GSD_TOOLS = path.resolve(__dirname, '../get-shit-done/bin/gsd-tools.cjs');

describe('route-agent command', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'route-agent-test-'));
    fs.mkdirSync(path.join(tmpDir, '.planning'), { recursive: true });
  });

  it('exits 1 for local agent (gsd-planner)', () => {
    const promptFile = path.join(tmpDir, 'task.md');
    fs.writeFileSync(promptFile, 'Plan something');
    try {
      execSync(`node "${GSD_TOOLS}" route-agent gsd-planner --prompt "${promptFile}" --context "${tmpDir}" --mode lean`, {
        encoding: 'utf8',
      });
      assert.fail('Should have exited with code 1');
    } catch (e) {
      assert.strictEqual(e.status, 1);
    }
  });

  it('exits 1 in full mode even for remote agent', () => {
    const promptFile = path.join(tmpDir, 'task.md');
    fs.writeFileSync(promptFile, 'Catalog something');
    try {
      execSync(`node "${GSD_TOOLS}" route-agent gsd-cataloger --prompt "${promptFile}" --context "${tmpDir}" --mode full`, {
        encoding: 'utf8',
      });
      assert.fail('Should have exited with code 1');
    } catch (e) {
      assert.strictEqual(e.status, 1);
    }
  });

  it('exits 1 in auto mode when no providers.json', () => {
    const promptFile = path.join(tmpDir, 'task.md');
    fs.writeFileSync(promptFile, 'Catalog something');
    try {
      execSync(`node "${GSD_TOOLS}" route-agent gsd-cataloger --prompt "${promptFile}" --context "${tmpDir}" --mode auto --providers-path "${path.join(tmpDir, 'nonexistent.json')}"`, {
        encoding: 'utf8',
      });
      assert.fail('Should have exited with code 1');
    } catch (e) {
      assert.strictEqual(e.status, 1);
    }
  });

  it('exits 2 in lean mode when no providers.json', () => {
    const promptFile = path.join(tmpDir, 'task.md');
    fs.writeFileSync(promptFile, 'Catalog something');
    try {
      execSync(`node "${GSD_TOOLS}" route-agent gsd-cataloger --prompt "${promptFile}" --context "${tmpDir}" --mode lean --providers-path "${path.join(tmpDir, 'nonexistent.json')}"`, {
        encoding: 'utf8',
      });
      assert.fail('Should have exited with code 2');
    } catch (e) {
      assert.strictEqual(e.status, 2);
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- tests/route-agent.test.cjs
# Expected: FAIL — Unknown command: route-agent
```

- [ ] **Step 3: Add route-agent case to dispatcher**

In `get-shit-done/bin/gsd-tools.cjs`, add a new case before the default error (around line 947):

```javascript
    case 'route-agent': {
      // route-agent <agentName> --prompt <file> --context <dir> --mode <mode> [--providers-path <path>]
      const agentName = args[1];
      const promptIdx = args.indexOf('--prompt');
      const contextIdx = args.indexOf('--context');
      const modeIdx = args.indexOf('--mode');
      const providersIdx = args.indexOf('--providers-path');

      if (!agentName || promptIdx === -1 || contextIdx === -1) {
        error('Usage: route-agent <agentName> --prompt <file> --context <dir> --mode <mode>');
        process.exit(2);
      }

      const taskPrompt = fs.readFileSync(args[promptIdx + 1], 'utf8');
      const contextDir = args[contextIdx + 1];
      const mode = modeIdx !== -1 ? args[modeIdx + 1] : 'auto';
      const opts = {};
      if (providersIdx !== -1) opts.providersPath = args[providersIdx + 1];

      const { routeAgent } = require('./lib/llm-router.cjs');
      routeAgent(agentName, taskPrompt, contextDir, mode, opts)
        .then(({ routed, result, outputFile }) => {
          if (routed) {
            if (outputFile) output(JSON.stringify({ routed: true, outputFile }));
            else output(result);
            process.exit(0);
          } else {
            process.exit(1); // signal: use local Agent tool
          }
        })
        .catch((err) => {
          error(err.message);
          process.exit(2);
        });
      break;
    }
```

Add `const fs = require('node:fs');` at the top if not already imported (check first — it's likely already there via the `require('fs')` pattern used elsewhere).

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- tests/route-agent.test.cjs
# Expected: PASS
```

- [ ] **Step 5: Commit**

```bash
git add get-shit-done/bin/gsd-tools.cjs tests/route-agent.test.cjs
git commit -m "feat(dispatcher): add route-agent command for LLM routing

Exit 0 = agent executed remotely (result in stdout)
Exit 1 = agent should run locally (routing says local, or fallback)
Exit 2 = error (lean mode, no API key)"
```

---

### Task 7: Add execution_mode to Config

**Files:**
- Modify: `.planning/config.json`

- [ ] **Step 1: Add execution_mode field**

In `.planning/config.json`, add the `execution_mode` field at the top level (after `"granularity"`):

```json
  "execution_mode": "auto"
```

- [ ] **Step 2: Commit**

```bash
git add .planning/config.json
git commit -m "config: add execution_mode field (default: auto)"
```

---

### Task 8: Inject Route-Agent Interception into Workflows

**Files:**
- Modify: `get-shit-done/workflows/execute-phase.md`
- Modify: `get-shit-done/workflows/plan-phase.md`
- Modify: `get-shit-done/workflows/new-project.md`

- [ ] **Step 1: Add interception to execute-phase.md**

Before the `gsd-cataloger` Task() spawn (around line 359), add:

```markdown
**Lean Mode Routing:** Before spawning gsd-cataloger, attempt remote routing:
```bash
node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" route-agent gsd-cataloger \
  --prompt /tmp/gsd-cataloger-task.md --context "{phase_dir}" --mode "{execution_mode}"
```
Write the cataloger task description to `/tmp/gsd-cataloger-task.md` first. If exit code 0, the cataloger ran remotely — skip the Agent tool spawn. If exit code 1, spawn gsd-cataloger Agent as normal.
```

- [ ] **Step 2: Add interception to plan-phase.md**

Before the `gsd-plan-checker` Task() spawn (around line 641) and `gsd-assumptions-analyzer` if present, add the same route-agent pattern:

```markdown
**Lean Mode Routing:** Before spawning gsd-plan-checker, attempt remote routing:
```bash
node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" route-agent gsd-plan-checker \
  --prompt /tmp/gsd-checker-task.md --context "{phase_dir}" --mode "{execution_mode}"
```
Write the checker task to `/tmp/gsd-checker-task.md` first. If exit 0: use stdout as checker result. If exit 1: spawn gsd-plan-checker Agent as normal.
```

- [ ] **Step 3: Add interception to new-project.md**

Before the `gsd-research-synthesizer` Task() spawn (around line 807), add:

```markdown
**Lean Mode Routing:** Before spawning gsd-research-synthesizer, attempt remote routing:
```bash
node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" route-agent gsd-research-synthesizer \
  --prompt /tmp/gsd-synth-task.md --context "{planning_dir}" --mode "{execution_mode}"
```
Write the synthesis task to `/tmp/gsd-synth-task.md` first. If exit 0: synthesizer ran remotely, SUMMARY.md already written. If exit 1: spawn gsd-research-synthesizer Agent as normal.
```

- [ ] **Step 4: Add --full/--lean flag parsing to workflows**

Each workflow needs to read the execution mode. At the top of each modified workflow's variable resolution section, add:

```markdown
### Execution Mode Resolution
Resolve execution mode using priority: CLI flag > config > auto.
```bash
EXEC_MODE=$(node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" config get execution_mode 2>/dev/null || echo "auto")
```
If the user passed `--full` or `--lean` to this command, override EXEC_MODE with that flag value.
```

- [ ] **Step 5: Commit**

```bash
git add get-shit-done/workflows/execute-phase.md \
      get-shit-done/workflows/plan-phase.md \
      get-shit-done/workflows/new-project.md
git commit -m "feat(workflows): inject route-agent interception for lean mode

execute-phase: routes gsd-cataloger
plan-phase: routes gsd-plan-checker
new-project: routes gsd-research-synthesizer
All workflows resolve execution_mode from CLI flag or config."
```

---

### Task 9: End-to-End Validation

- [ ] **Step 1: Run full test suite**

```bash
npm test
# Expected: ALL PASS — no regressions from prompt slimming or new modules
```

- [ ] **Step 2: Validate reference files exist**

```bash
ls -la get-shit-done/references/
# Expected: 4 files (impact-analysis-protocol.md, plan-checker-guardrails.md,
#           planner-guardrails.md, scope-erosion-guard.md)
```

- [ ] **Step 3: Validate agents are slimmed**

```bash
# Executor should NOT contain <impact_analysis> anymore
grep -c '<impact_analysis>' agents/gsd-executor.md
# Expected: 0

# Plan-checker should reference the guardrails file, not contain full dimensions
grep -c 'Scope Fidelity' agents/gsd-plan-checker.md
# Expected: 1 (just the reference line)
```

- [ ] **Step 4: Test route-agent in full mode**

```bash
echo "Test task" > /tmp/test-task.md
node get-shit-done/bin/gsd-tools.cjs route-agent gsd-cataloger \
  --prompt /tmp/test-task.md --context .planning --mode full
echo "Exit code: $?"
# Expected: Exit code: 1 (full mode = always local)
```

- [ ] **Step 5: Test route-agent in auto mode without providers.json**

```bash
node get-shit-done/bin/gsd-tools.cjs route-agent gsd-cataloger \
  --prompt /tmp/test-task.md --context .planning --mode auto
echo "Exit code: $?"
# Expected: Exit code: 1 (no providers.json = fallback to local)
```

- [ ] **Step 6: Commit any fixes from validation**

```bash
# Only if fixes were needed
git add -A && git commit -m "fix: address issues found during e2e validation"
```
