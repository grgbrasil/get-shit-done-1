/**
 * Mapping of GSD agent to model for each profile.
 *
 * Should be in sync with the profiles table in `get-shit-done/references/model-profiles.md`. But
 * possibly worth making this the single source of truth at some point, and removing the markdown
 * reference table in favor of programmatically determining the model to use for an agent (which
 * would be faster, use fewer tokens, and be less error-prone).
 */
const MODEL_PROFILES = {
  'gsd-planner': { quality: 'opus', balanced: 'opus', budget: 'sonnet' },
  'gsd-roadmapper': { quality: 'opus', balanced: 'sonnet', budget: 'sonnet' },
  'gsd-executor': { quality: 'opus', balanced: 'sonnet', budget: 'sonnet' },
  'gsd-phase-researcher': { quality: 'opus', balanced: 'sonnet', budget: 'haiku' },
  'gsd-project-researcher': { quality: 'opus', balanced: 'sonnet', budget: 'haiku' },
  'gsd-research-synthesizer': { quality: 'sonnet', balanced: 'sonnet', budget: 'haiku' },
  'gsd-debugger': { quality: 'opus', balanced: 'sonnet', budget: 'sonnet' },
  'gsd-codebase-mapper': { quality: 'sonnet', balanced: 'haiku', budget: 'haiku' },
  'gsd-verifier': { quality: 'sonnet', balanced: 'sonnet', budget: 'haiku' },
  'gsd-plan-checker': { quality: 'sonnet', balanced: 'sonnet', budget: 'haiku' },
  'gsd-integration-checker': { quality: 'sonnet', balanced: 'sonnet', budget: 'haiku' },
  'gsd-nyquist-auditor': { quality: 'sonnet', balanced: 'sonnet', budget: 'haiku' },
  'gsd-ui-researcher': { quality: 'opus', balanced: 'sonnet', budget: 'haiku' },
  'gsd-ui-checker': { quality: 'sonnet', balanced: 'sonnet', budget: 'haiku' },
  'gsd-ui-auditor': { quality: 'sonnet', balanced: 'sonnet', budget: 'haiku' },
  'gsd-cataloger': { quality: 'haiku', balanced: 'haiku', budget: 'haiku' },
};
const VALID_PROFILES = Object.keys(MODEL_PROFILES['gsd-planner']);

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

const VALID_EFFORT_LEVELS = ['low', 'medium', 'high', 'max'];

const EFFORT_PROFILES = {
  'gsd-planner':              'max',
  'gsd-executor':             'medium',
  'gsd-phase-researcher':     'high',
  'gsd-project-researcher':   'high',
  'gsd-roadmapper':           'high',
  'gsd-debugger':             'high',
  'gsd-research-synthesizer': 'medium',
  'gsd-verifier':             'low',
  'gsd-plan-checker':         'low',
  'gsd-codebase-mapper':      'low',
  'gsd-integration-checker':  'low',
  'gsd-nyquist-auditor':      'low',
  'gsd-ui-researcher':        'high',
  'gsd-ui-checker':           'low',
  'gsd-ui-auditor':           'low',
  'gsd-cataloger':            'low',
};

/**
 * Resolve the effort level for a given agent type.
 * Returns the configured effort from EFFORT_PROFILES, falling back to 'medium'.
 * Effort is independent of model resolution -- always resolves regardless of resolve_model_ids mode.
 *
 * @param {string} agentType - The agent identifier (e.g., 'gsd-planner')
 * @returns {string} The effort level: 'low' | 'medium' | 'high' | 'max'
 */
function resolveEffort(agentType) {
  const effort = EFFORT_PROFILES[agentType];
  if (!effort) {
    process.stderr.write(`[gsd] effort fallback: agent=${agentType} default=medium\n`);
    return 'medium';
  }
  return effort;
}

/**
 * Formats the agent-to-model mapping as a human-readable table (in string format).
 *
 * @param {Object<string, string>} agentToModelMap - A mapping from agent to model
 * @returns {string} A formatted table string
 */
function formatAgentToModelMapAsTable(agentToModelMap) {
  const agentWidth = Math.max('Agent'.length, ...Object.keys(agentToModelMap).map((a) => a.length));
  const modelWidth = Math.max(
    'Model'.length,
    ...Object.values(agentToModelMap).map((m) => m.length)
  );
  const sep = '─'.repeat(agentWidth + 2) + '┼' + '─'.repeat(modelWidth + 2);
  const header = ' ' + 'Agent'.padEnd(agentWidth) + ' │ ' + 'Model'.padEnd(modelWidth);
  let agentToModelTable = header + '\n' + sep + '\n';
  for (const [agent, model] of Object.entries(agentToModelMap)) {
    agentToModelTable += ' ' + agent.padEnd(agentWidth) + ' │ ' + model.padEnd(modelWidth) + '\n';
  }
  return agentToModelTable;
}

/**
 * Returns a mapping from agent to model for the given model profile.
 *
 * @param {string} normalizedProfile - The normalized (lowercase and trimmed) profile name
 * @returns {Object<string, string>} A mapping from agent to model for the given profile
 */
function getAgentToModelMapForProfile(normalizedProfile) {
  const agentToModelMap = {};
  for (const [agent, profileToModelMap] of Object.entries(MODEL_PROFILES)) {
    agentToModelMap[agent] = profileToModelMap[normalizedProfile];
  }
  return agentToModelMap;
}

/**
 * Resolves the execution mode from CLI flag and config.
 * Priority: CLI flag > config > default (auto).
 *
 * @param {{ cliFlag?: string|null, configMode?: string|null }} opts
 * @returns {'full'|'lean'|'auto'}
 */
function resolveExecutionMode({ cliFlag, configMode } = {}) {
  if (cliFlag === 'full' || cliFlag === 'lean') return cliFlag;
  if (configMode === 'full' || configMode === 'lean' || configMode === 'auto') return configMode;
  return 'auto';
}

module.exports = {
  MODEL_PROFILES,
  VALID_PROFILES,
  AGENT_ROUTING,
  LEAN_MODEL_OVERRIDES,
  EFFORT_PROFILES,
  VALID_EFFORT_LEVELS,
  formatAgentToModelMapAsTable,
  getAgentToModelMapForProfile,
  resolveExecutionMode,
  resolveEffort,
};
