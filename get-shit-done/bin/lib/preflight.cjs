/**
 * Preflight — Pre-flight dependency resolver for phase commands
 *
 * Centralizes all prerequisite checks (CONTEXT.md, UI-SPEC.md, dependent phases,
 * plans existence) into a single reusable function that phase commands can call
 * before executing.
 */

const fs = require('fs');
const path = require('path');
const { output, error, findPhaseInternal, getRoadmapPhaseInternal, planningRoot } = require('./core.cjs');

// ─── Config Loading ─────────────────────────────────────────────────────────

/**
 * Load raw config.json preserving nested structure (workflow.*, etc.).
 * loadConfig() from core.cjs flattens the config, losing the workflow section
 * which preflight needs for skip_discuss, ui_safety_gate, ui_phase, discuss_mode.
 */
function loadRawConfig(cwd) {
  const configPath = path.join(cwd, '.planning', 'config.json');
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  } catch {
    return {};
  }
}

// ─── UI Detection ───────────────────────────────────────────────────────────

/**
 * Check if a roadmap section indicates UI-related work.
 * Uses precise word-boundary patterns to avoid false positives
 * (e.g. "interface refactoring" should NOT match).
 */
function hasUiIndicators(section) {
  if (!section) return false;

  const goalMatch = section.match(/\*\*Goal\*\*:?\s*([^\n]+)/i);
  const nameMatch = section.match(/Phase\s+\d+[^:]*:\s*([^\n]+)/i);
  const combined = [
    goalMatch ? goalMatch[1] : '',
    nameMatch ? nameMatch[1] : '',
  ].join(' ').toLowerCase();

  const uiPatterns = [
    /\bfrontend\b/,
    /\bdashboard\b/,
    /\bui\s/,
    /\buser\s+interface\b/,
    /\blayout\b/,
    /\bpage\b/,
    /\bscreen\b/,
    /\bwidget\b/,
    /\bcomponent\s+library\b/,
    /\bform\s+(builder|validation|handling)\b/,
    /\bview\s+(layer|component|template)\b/,
  ];

  return uiPatterns.some(p => p.test(combined));
}

// ─── Individual Checks ──────────────────────────────────────────────────────

function checkContextExists(cwd, phase, phaseInfo, config, blockers) {
  if (config.workflow?.skip_discuss === true) return;
  if (config.workflow?.discuss_mode === 'skip') return;
  if (phaseInfo?.has_context === true) return;

  blockers.push({
    type: 'missing_context',
    message: `No CONTEXT.md found for Phase ${phase}. Design preferences will not be included in plans.`,
    action: 'run_command',
    command: `/gsd:discuss-phase ${phase}`,
    severity: 'warning',
    skippable: true,
  });
}

function checkUiSpec(cwd, phase, phaseInfo, roadmapPhase, config, blockers) {
  if (config.workflow?.ui_phase === false) return;
  if (config.workflow?.ui_safety_gate === false) return;
  if (!roadmapPhase?.section) return;
  if (!hasUiIndicators(roadmapPhase.section)) return;

  // Check for UI-SPEC.md in phase directory
  const phaseDir = phaseInfo?.directory
    ? path.join(cwd, phaseInfo.directory)
    : null;

  if (phaseDir) {
    // Check exact name
    const exactPath = path.join(phaseDir, phase + '-UI-SPEC.md');
    if (fs.existsSync(exactPath)) return;

    // Check for any *UI-SPEC* file in the phase directory
    try {
      const files = fs.readdirSync(phaseDir);
      if (files.some(f => f.includes('UI-SPEC'))) return;
    } catch { /* directory may not exist */ }
  }

  blockers.push({
    type: 'missing_ui_spec',
    message: `Phase ${phase} appears to have UI work but no UI-SPEC.md found.`,
    action: 'run_command',
    command: `/gsd:ui-phase ${phase}`,
    severity: 'warning',
    skippable: true,
  });
}

function checkDependentPhasesComplete(cwd, phase, roadmapPhase, blockers) {
  if (!roadmapPhase?.section) return;

  const depLine = roadmapPhase.section.match(/\*\*Depends\s+on:?\*\*:?\s*([^\n]+)/i);
  if (!depLine) return;

  const depText = depLine[1].trim().toLowerCase();
  if (/^(nothing|none|n\/a)$/i.test(depText)) return;

  // Extract phase numbers
  const depNums = depLine[1].match(/\d+(?:\.\d+)*/g);
  if (!depNums || depNums.length === 0) return;

  const visited = new Set();
  for (const dep of depNums) {
    if (visited.has(dep)) continue;
    visited.add(dep);

    const depInfo = findPhaseInternal(cwd, dep);
    if (!depInfo) {
      // Phase directory doesn't exist at all — treat as incomplete
      blockers.push({
        type: 'incomplete_dependency',
        message: `Phase ${dep} must complete before Phase ${phase}`,
        action: 'run_command',
        command: `/gsd:execute-phase ${dep}`,
        severity: 'blocking',
        skippable: false,
      });
      continue;
    }

    const plansCount = depInfo.plans?.length || 0;
    const summariesCount = depInfo.summaries?.length || 0;
    const isComplete = plansCount > 0 && plansCount === summariesCount;

    if (!isComplete) {
      blockers.push({
        type: 'incomplete_dependency',
        message: `Phase ${dep} must complete before Phase ${phase}`,
        action: 'run_command',
        command: `/gsd:execute-phase ${dep}`,
        severity: 'blocking',
        skippable: false,
      });
    }
  }
}

function checkPlansExist(cwd, phase, phaseInfo, blockers) {
  if ((phaseInfo?.plans?.length || 0) > 0) return;

  blockers.push({
    type: 'no_plans',
    message: `No plans found for Phase ${phase}. Run plan-phase first.`,
    action: 'run_command',
    command: `/gsd:plan-phase ${phase}`,
    severity: 'blocking',
    skippable: false,
  });
}

// ─── Main Command ───────────────────────────────────────────────────────────

function cmdPreflight(cwd, command, phase, raw) {
  const validCommands = ['plan-phase', 'execute-phase', 'ui-phase'];
  if (!validCommands.includes(command)) {
    error(`Invalid preflight command: ${command}. Valid: ${validCommands.join(', ')}`);
  }

  const config = loadRawConfig(cwd);
  const phaseInfo = findPhaseInternal(cwd, phase);
  const roadmapPhase = getRoadmapPhaseInternal(cwd, phase);
  const blockers = [];

  if (command === 'plan-phase') {
    checkContextExists(cwd, phase, phaseInfo, config, blockers);
    checkUiSpec(cwd, phase, phaseInfo, roadmapPhase, config, blockers);
    checkDependentPhasesComplete(cwd, phase, roadmapPhase, blockers);
  } else if (command === 'execute-phase') {
    checkPlansExist(cwd, phase, phaseInfo, blockers);
    checkDependentPhasesComplete(cwd, phase, roadmapPhase, blockers);
  } else if (command === 'ui-phase') {
    checkContextExists(cwd, phase, phaseInfo, config, blockers);
  }

  const firstBlocker = blockers[0] || null;

  output({
    ready: blockers.length === 0,
    blockers,
    next_action: firstBlocker?.action || null,
    next_command: firstBlocker?.command || null,
    phase_number: phase,
    command_checked: command,
  }, raw);
}

module.exports = { cmdPreflight };
