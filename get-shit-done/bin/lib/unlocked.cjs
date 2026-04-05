/**
 * Unlocked — Phase classification engine for parallel work discovery
 */

const fs = require('fs');
const path = require('path');
const {
  escapeRegex,
  comparePhaseNum,
  planningDir,
  planningPaths,
  extractCurrentMilestone,
  getMilestonePhaseFilter,
  getRoadmapPhaseInternal,
  output,
  error,
} = require('./core.cjs');
const { extractFrontmatter } = require('./frontmatter.cjs');

// ─── Roadmap parsing ─────────────────────────────────────────────────────────

/**
 * Parse all phases from the roadmap checklist.
 * Returns array of { num, name, complete, dependsOn: string[] }
 */
function parseRoadmapPhases(content) {
  const phases = [];

  // Match checklist items: - [x] **Phase 1: Name** - description
  const checklistRe = /^-\s+\[([ xX])\]\s+\*\*Phase\s+([\w.]+):\s*([^*]+)\*\*/gm;
  let m;
  while ((m = checklistRe.exec(content)) !== null) {
    const complete = m[1].toLowerCase() === 'x';
    const num = m[2];
    const name = m[3].trim();
    phases.push({ num, name, complete, dependsOn: [] });
  }

  // Now parse detail sections for Depends on
  for (const phase of phases) {
    const info = parsePhaseSection(content, phase.num);
    if (info) {
      phase.dependsOn = info.dependsOn;
    }
  }

  return phases;
}

/**
 * Extract the detail section for a phase and parse its Depends on field.
 */
function parsePhaseSection(content, phaseNum) {
  const escaped = escapeRegex(phaseNum);
  const headerRe = new RegExp(`#{2,4}\\s*Phase\\s+${escaped}:\\s*([^\\n]+)`, 'i');
  const headerMatch = content.match(headerRe);
  if (!headerMatch) return null;

  const headerIndex = headerMatch.index;
  const rest = content.slice(headerIndex);
  const nextHeader = rest.match(/\n#{2,4}\s+Phase\s+[\w]/i);
  const section = nextHeader ? rest.slice(0, nextHeader.index) : rest;

  // **Depends on**: Phase 1, Phase 3  OR  **Depends on:** Phase 1
  const depMatch = section.match(/\*\*Depends\s+on\*?\*?:\s*([^\n]+)/i);
  const depStr = depMatch ? depMatch[1].trim() : '';

  const dependsOn = [];
  if (depStr && !/^nothing$/i.test(depStr) && !/^none$/i.test(depStr) && depStr !== '-') {
    // Extract phase numbers from "Phase 1, Phase 3" or "Phase 1 and Phase 3"
    const phaseRefs = depStr.matchAll(/Phase\s+([\w.]+)/gi);
    for (const ref of phaseRefs) {
      dependsOn.push(ref[1]);
    }
  }

  return { dependsOn };
}

// ─── Phase directory scanning ────────────────────────────────────────────────

/**
 * Build a lookup of phase directories: { phaseNum: { dir, plans[], hasVerificationPassed } }
 */
function buildPhaseDirLookup(phasesDir) {
  const lookup = {};
  if (!fs.existsSync(phasesDir)) return lookup;

  let entries;
  try {
    entries = fs.readdirSync(phasesDir, { withFileTypes: true });
  } catch {
    return lookup;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const match = entry.name.match(/^([\w.]+)-/);
    if (!match) continue;

    const num = match[1];
    const dirPath = path.join(phasesDir, entry.name);

    let files;
    try {
      files = fs.readdirSync(dirPath);
    } catch {
      continue;
    }

    const plans = files.filter(f => f.endsWith('-PLAN.md') || f === 'PLAN.md');
    const summaries = files.filter(f => f.endsWith('-SUMMARY.md') || f === 'SUMMARY.md');
    const verificationFile = files.find(f => f === 'VERIFICATION.md' || f.endsWith('-VERIFICATION.md'));

    let hasVerificationPassed = false;
    if (verificationFile) {
      try {
        const vContent = fs.readFileSync(path.join(dirPath, verificationFile), 'utf-8');
        const fm = extractFrontmatter(vContent);
        hasVerificationPassed = fm.status === 'passed';
      } catch { /* ignore */ }
    }

    // Collect files_modified from all plans
    const filesModified = new Set();
    for (const planFile of plans) {
      try {
        const planContent = fs.readFileSync(path.join(dirPath, planFile), 'utf-8');
        const fm = extractFrontmatter(planContent);
        if (Array.isArray(fm.files_modified)) {
          fm.files_modified.forEach(f => filesModified.add(f));
        }
      } catch { /* ignore */ }
    }

    lookup[num] = {
      dir: dirPath,
      plans,
      summaries,
      filesModified: [...filesModified],
      hasVerificationPassed,
    };
  }

  return lookup;
}

// ─── Classification ──────────────────────────────────────────────────────────

/**
 * Classify all incomplete phases into in_progress, ready, or blocked.
 */
function classifyPhases(phases, dirLookup) {
  const completedNums = new Set(phases.filter(p => p.complete).map(p => p.num));
  const incomplete = phases.filter(p => !p.complete);

  const inProgress = [];
  const ready = [];
  const blocked = [];

  for (const phase of incomplete) {
    const dirInfo = dirLookup[phase.num];
    const hasPlans = dirInfo && dirInfo.plans.length > 0;
    const hasPassed = dirInfo && dirInfo.hasVerificationPassed;

    // If it has a plan and no passed verification → in_progress
    if (hasPlans && !hasPassed) {
      inProgress.push({
        phase_number: phase.num,
        phase_name: phase.name,
        filesModified: dirInfo ? dirInfo.filesModified : [],
      });
      continue;
    }

    // Check dependencies
    const depsSatisfied = phase.dependsOn.length === 0 ||
      phase.dependsOn.every(dep => completedNums.has(dep));

    if (!depsSatisfied) {
      const unsatisfied = phase.dependsOn.filter(dep => !completedNums.has(dep));
      blocked.push({
        phase_number: phase.num,
        phase_name: phase.name,
        blocked_by: unsatisfied.map(n => `Phase ${n}`),
      });
    } else {
      ready.push({
        phase_number: phase.num,
        phase_name: phase.name,
        has_plan: hasPlans,
        filesModified: dirInfo ? dirInfo.filesModified : [],
      });
    }
  }

  return { inProgress, ready, blocked };
}

// ─── Overlap & recommendations ───────────────────────────────────────────────

/**
 * Calculate file overlap between ready phases and in_progress phases.
 * Assigns recommendation: safe_parallel, worktree, or plan_first.
 */
function assignRecommendations(readyPhases, inProgressPhases) {
  // Collect all files touched by in_progress phases
  const ipFiles = new Set();
  for (const ip of inProgressPhases) {
    for (const f of ip.filesModified) {
      ipFiles.add(f);
    }
  }

  return readyPhases.map(phase => {
    if (!phase.has_plan) {
      return { ...phase, recommendation: 'plan_first', overlap_score: 0, overlapping_files: [] };
    }

    const overlapping = phase.filesModified.filter(f => ipFiles.has(f));
    const overlapScore = overlapping.length;

    if (overlapScore === 0) {
      return { ...phase, recommendation: 'safe_parallel', overlap_score: 0, overlapping_files: [] };
    }

    return { ...phase, recommendation: 'worktree', overlap_score: overlapScore, overlapping_files: overlapping };
  });
}

/**
 * Sort ready phases: safe_parallel first, then worktree by overlap ascending, then plan_first.
 */
function sortReady(readyPhases) {
  const order = { safe_parallel: 0, worktree: 1, plan_first: 2 };
  return readyPhases.sort((a, b) => {
    const oa = order[a.recommendation] ?? 9;
    const ob = order[b.recommendation] ?? 9;
    if (oa !== ob) return oa - ob;
    if (a.recommendation === 'worktree') return a.overlap_score - b.overlap_score;
    return comparePhaseNum(a.phase_number, b.phase_number);
  });
}

// ─── Table format ────────────────────────────────────────────────────────────

function formatTable(result) {
  const lines = [];

  if (result.in_progress.length > 0) {
    lines.push('IN PROGRESS:');
    for (const p of result.in_progress) {
      lines.push(`  Phase ${p.phase_number}: ${p.phase_name}`);
    }
    lines.push('');
  }

  if (result.ready.length > 0) {
    lines.push('READY TO START:');
    for (const p of result.ready) {
      const rec = p.recommendation ? ` [${p.recommendation}]` : '';
      const overlap = p.overlap_score > 0 ? ` (${p.overlap_score} file overlap)` : '';
      lines.push(`  Phase ${p.phase_number}: ${p.phase_name}${rec}${overlap}`);
    }
    lines.push('');
  }

  if (result.blocked.length > 0) {
    lines.push('BLOCKED:');
    for (const p of result.blocked) {
      const by = p.blocked_by.join(', ');
      lines.push(`  Phase ${p.phase_number}: ${p.phase_name} — waiting on ${by}`);
    }
    lines.push('');
  }

  if (result.in_progress.length === 0 && result.ready.length === 0 && result.blocked.length === 0) {
    lines.push('All phases are complete or no phases found.');
  }

  return lines.join('\n').trim();
}

// ─── Main command ────────────────────────────────────────────────────────────

function cmdUnlocked(cwd, format, raw) {
  const pDir = planningDir(cwd);
  const roadmapPath = path.join(pDir, 'ROADMAP.md');

  // Empty result for missing planning
  const emptyResult = { in_progress: [], ready: [], blocked: [] };

  if (!fs.existsSync(roadmapPath)) {
    if (format === 'table') {
      output(emptyResult, raw, formatTable(emptyResult));
    } else {
      output(emptyResult, raw);
    }
    return;
  }

  let roadmapContent;
  try {
    roadmapContent = extractCurrentMilestone(fs.readFileSync(roadmapPath, 'utf-8'), cwd);
  } catch {
    output(emptyResult, raw);
    return;
  }

  const phases = parseRoadmapPhases(roadmapContent);
  const phasesDir = path.join(pDir, 'phases');
  const dirLookup = buildPhaseDirLookup(phasesDir);

  const { inProgress, ready, blocked } = classifyPhases(phases, dirLookup);

  // Assign recommendations and sort ready phases
  const readyWithRecs = assignRecommendations(ready, inProgress);
  const sortedReady = sortReady(readyWithRecs);

  // Clean up internal fields before output
  const cleanIP = inProgress.map(({ filesModified, ...rest }) => rest);
  const cleanReady = sortedReady.map(({ filesModified, has_plan, ...rest }) => rest);

  const result = {
    in_progress: cleanIP,
    ready: cleanReady,
    blocked,
  };

  if (format === 'table') {
    output(result, raw, formatTable(result));
  } else {
    output(result, raw);
  }
}

module.exports = { cmdUnlocked };
