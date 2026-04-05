#!/usr/bin/env node
// gsd-hook-version: {{GSD_VERSION}}
// GSD Preflight Gate — PreToolUse hook for Skill
// Blocks plan-phase/execute-phase/verify-work if preflight reports NO-GO.
// Pure file checks — no LLM needed.
//
// Triggers on: Skill tool calls for workflow skills (plan-phase, execute-phase, etc.)
// Action: Block with remediation commands when preflight fails

const { execSync } = require('child_process');
const path = require('path');

const WORKFLOW_MAP = {
  'gsd:discuss-phase': 'discuss',
  'discuss-phase': 'discuss',
  'gsd:plan-phase': 'plan',
  'plan-phase': 'plan',
  'gsd:execute-phase': 'execute',
  'execute-phase': 'execute',
  'gsd:verify-work': 'verify',
  'verify-work': 'verify',
};

let input = '';
const stdinTimeout = setTimeout(() => process.exit(0), 5000);
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => input += chunk);
process.stdin.on('end', () => {
  clearTimeout(stdinTimeout);
  try {
    const data = JSON.parse(input);

    // Only intercept Skill tool calls
    if (data.tool_name !== 'Skill') {
      process.exit(0);
    }

    const skill = data.tool_input?.skill || '';
    const args = data.tool_input?.args || '';
    const workflow = WORKFLOW_MAP[skill];

    if (!workflow) {
      process.exit(0); // Not a workflow skill
    }

    // Extract phase number from args
    const phaseMatch = args.match(/(\d+(?:\.\d+)?)/);
    if (!phaseMatch) {
      process.exit(0); // No phase number — let the skill handle the error
    }
    const phase = phaseMatch[1];

    // Find gsd-tools.cjs
    const homeDir = process.env.HOME || process.env.USERPROFILE || '';
    const gsdTools = path.join(homeDir, '.claude', 'get-shit-done', 'bin', 'gsd-tools.cjs');

    let result;
    try {
      const stdout = execSync(
        `node "${gsdTools}" preflight "${workflow}" "${phase}" --raw`,
        { encoding: 'utf8', timeout: 10000, stdio: ['pipe', 'pipe', 'pipe'] }
      );
      result = JSON.parse(stdout.trim());
    } catch {
      // Can't run preflight — don't block
      process.exit(0);
    }

    if (result.ready) {
      process.exit(0);
    }

    // Build block message
    const lines = [`PREFLIGHT NO-GO — Phase ${phase} nao esta pronta para ${workflow}.`, ''];

    if (result.blockers && result.blockers.length > 0) {
      lines.push('Blockers:');
      for (const b of result.blockers) {
        lines.push(`  ✗ ${b.message}${b.command ? ` → ${b.command}` : ''}`);
      }
    }

    if (result.warnings && result.warnings.length > 0) {
      lines.push('', 'Warnings:');
      for (const w of result.warnings) {
        lines.push(`  ⚠ ${w.message}${w.command ? ` → ${w.command}` : ''}`);
      }
    }

    if (result.next_command) {
      lines.push('', `Proximo passo: ${result.next_command}`);
    }

    console.log(JSON.stringify({ decision: 'block', reason: lines.join('\n') }));
  } catch {
    // Parse error or unexpected — don't block
    process.exit(0);
  }
});
