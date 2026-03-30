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

// ─── Helpers ────────────────────────────────────────────────────

function safeRead(filePath) {
  try { return fs.readFileSync(filePath, 'utf8'); } catch { return ''; }
}

function safeReadJSON(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch { return null; }
}

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

function resolveModifiedFiles(projectRoot) {
  try {
    const output = execSync('git diff --name-only HEAD 2>/dev/null || true', {
      cwd: projectRoot, encoding: 'utf8',
    });
    return output.split('\n').filter(f => f && /\.(cjs|js|ts|mjs)$/.test(f))
      .map(f => path.join(projectRoot, f));
  } catch { return []; }
}

function findFiles(dir, suffix) {
  try {
    return fs.readdirSync(dir)
      .filter(f => f.endsWith(suffix))
      .map(f => path.join(dir, f));
  } catch { return []; }
}

function extractFileRefs(content) {
  const refs = [];
  const re = /`([^`]+\.\w{1,5})`/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    if (fs.existsSync(m[1])) refs.push(m[1]);
  }
  return [...new Set(refs)];
}

// ─── API Key Loading ────────────────────────────────────────────

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

function shouldRouteRemote(agentName, mode) {
  if (mode === 'full') return false;
  const routing = AGENT_ROUTING[agentName];
  if (!routing || routing.route === 'local') return false;
  return true;
}

// ─── Message Building ───────────────────────────────────────────

const REMOTE_MODE_PREFIX = `CRITICAL INSTRUCTION — YOU HAVE NO TOOLS.
You are running as a REMOTE text-completion API. You have ZERO tool access.
You MUST NOT output XML tags like <Read>, <Write>, <Bash>, <Edit>, <Grep>, <Glob>, <Task>, etc.
Any such tags will be treated as errors and discarded.
All the context you need is provided in the user message. Do NOT ask for more files.
Output ONLY your final result as clean markdown. No preamble, no "let me read the files", no tool invocations.
Start your response directly with the content.`;

function buildMessages(agentPrompt, taskPrompt, collectedContext) {
  const systemContent = `${REMOTE_MODE_PREFIX}\n\n---\n\n${agentPrompt}`;
  const userContent = collectedContext
    ? `${taskPrompt}\n\n---\n\n# Collected Context\n\n${collectedContext}`
    : taskPrompt;
  return [
    { role: 'system', content: systemContent },
    { role: 'user', content: userContent },
  ];
}

// ─── Provider API Calls ─────────────────────────────────────────

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
 * Strip tool-call XML tags that LLMs sometimes emit despite instructions.
 * Removes <Read>, <Write>, <Bash>, <Edit>, etc. and their content.
 */
function sanitizeResponse(text) {
  const toolTags = ['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob', 'Task', 'WebSearch', 'WebFetch'];
  let cleaned = text;
  for (const tag of toolTags) {
    // Remove self-closing and paired tags with content
    cleaned = cleaned.replace(new RegExp(`<${tag}>[\\s\\S]*?</${tag}>`, 'gi'), '');
    cleaned = cleaned.replace(new RegExp(`<${tag}\\s*/?>`, 'gi'), '');
  }
  // Remove lines that are just "I'll read the file" / "Let me read" preamble before actual content
  cleaned = cleaned.replace(/^.*(?:I'll|Let me|I need to)\s+(?:read|check|look at|analyze).*\n*/gim, '');
  return cleaned.trim();
}

async function callProvider(provider, apiKey, messages) {
  let result;
  if (provider.format === 'openai-compatible') {
    result = await callOpenAICompatible(provider, apiKey, messages);
  } else if (provider.format === 'google') {
    result = await callGoogleAPI(provider, apiKey, messages);
  } else {
    throw new Error(`Unknown provider format: ${provider.format}`);
  }
  return sanitizeResponse(result);
}

// ─── Context Collectors ─────────────────────────────────────────

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
    const verFiles = findFiles(contextDir, '-VERIFICATION.md')
      .concat(findFiles(contextDir, 'VERIFICATION.md'));
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
    return { routed: false };
  }

  const collector = COLLECTORS[agentName];
  const collectedContext = collector ? await collector(contextDir, taskPrompt) : '';

  const agentsDir = opts.agentsDir || path.join(__dirname, '..', '..', '..', 'agents');
  const agentPromptPath = path.join(agentsDir, `${agentName}.md`);
  const agentPrompt = safeRead(agentPromptPath);
  if (!agentPrompt) return { routed: false };

  const messages = buildMessages(agentPrompt, taskPrompt, collectedContext);
  const result = await callProvider(provider, apiKey, messages);

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
  sanitizeResponse,
  routeAgent,
  findProjectRoot,
  resolveModifiedFiles,
  safeRead,
  safeReadJSON,
};
