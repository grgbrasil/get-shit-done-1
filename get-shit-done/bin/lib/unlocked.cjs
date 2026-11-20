/**
 * Unlocked — Phase classification engine for parallel work discovery
 */

const fs = require('fs');
const path = require('path');
const {
  escapeRegex,
  comparePhaseNum,
  planningDir,
  extractCurrentMilestone,
  getMilestonePhaseFilter,
  output,
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

  // **Depends on**: ...  OR  **Depends on:** ...  OR  **Depends on**:
  const depMatch = section.match(/\*\*Depends on(?::\*\*|\*\*:)\s*([^\n]+)/i);
  const depStr = depMatch ? depMatch[1].trim() : '';

  const dependsOn = [];
  if (depStr && !/^(nothing|none|—|-|n\/a)$/i.test(depStr)) {
    const phaseRefs = depStr.matchAll(/(?:Phase\s+)?(\d+(?:\.\d+)*)/gi);
    for (const ref of phaseRefs) {
      dependsOn.push(ref[1]);
    }
  }

  return { dependsOn };
}

// ─── Phase directory scanning ────────────────────────────────────────────────

/**
 * Build a lookup of phase directories: { phaseNum: { dir, plans[], filesModified, hasVerificationPassed } }
 */
function buildPhaseDirLookup(phasesDir, isDirInMilestone) {
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
    if (!isDirInMilestone(entry.name)) continue;
    const match = entry.name.match(/^(\d+[A-Z]?(?:\.\d+)*)/i);
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
    const verificationFile = files.find(f => f === 'VERIFICATION.md' || f.endsWith('-VERIFICATION.md'));

    let hasVerificationPassed = false;
    if (verificationFile) {
      try {
        const vContent = fs.readFileSync(path.join(dirPath, verificationFile), 'utf-8');
        if (/status:\s*passed/i.test(vContent)) hasVerificationPassed = true;
      } catch { /* ignore */ }
    }

    // Collect files_modified from all plans
    const filesModified = new Set();
    for (const planFile of plans) {
      try {
        const planContent = fs.readFileSync(path.join(dirPath, planFile), 'utf-8');
        const fm = extractFrontmatter(planContent);
        const fmFiles = fm['files_modified'] || fm['files-modified'];
        if (fmFiles) {
          const list = Array.isArray(fmFiles) ? fmFiles : [fmFiles];
          for (const f of list) filesModified.add(f);
        }
      } catch { /* ignore */ }
    }

    lookup[num] = {
      dir: dirPath,
      plans,
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
        phase: phase.num,
        name: phase.name,
        has_plan: true,
        files_modified: dirInfo.filesModified,
      });
      continue;
    }

    // Check dependencies
    const depsSatisfied = phase.dependsOn.length === 0 ||
      phase.dependsOn.every(dep => completedNums.has(dep));

    if (!depsSatisfied) {
      const unsatisfied = phase.dependsOn.filter(dep => !completedNums.has(dep));
      const unsatisfiedNames = unsatisfied.map(dep => {
        const p = phases.find(ph => ph.num === dep);
        return p ? p.name : `Phase ${dep}`;
      });
      blocked.push({
        phase: phase.num,
        name: phase.name,
        blocked_by: unsatisfied,
        blocked_by_names: unsatisfiedNames,
      });
    } else {
      ready.push({
        phase: phase.num,
        name: phase.name,
        has_plan: !!hasPlans,
        files_modified: hasPlans && dirInfo ? dirInfo.filesModified : null,
      });
    }
  }

  return { inProgress, ready, blocked };
}

// ─── Overlap & recommendations ───────────────────────────────────────────────

/**
 * Calculate file overlap and assign recommendations to ready phases.
 */
function assignRecommendations(readyPhases, inProgressPhases) {
  // Build per-file lookup: file → list of in_progress phase numbers
  const fileToPhases = new Map();
  for (const ip of inProgressPhases) {
    if (!ip.files_modified) continue;
    for (const f of ip.files_modified) {
      if (!fileToPhases.has(f)) fileToPhases.set(f, []);
      fileToPhases.get(f).push(ip.phase);
    }
  }

  return readyPhases.map(phase => {
    if (!phase.has_plan) {
      return {
        ...phase,
        overlap: null,
        recommendation: 'plan_first',
        suggested_command: `/gsd-plan-phase ${phase.phase}`,
      };
    }

    const conflictingPhases = new Set();
    const conflictingFiles = [];
    for (const f of (phase.files_modified || [])) {
      const ips = fileToPhases.get(f);
      if (ips) {
        conflictingFiles.push(f);
        for (const p of ips) conflictingPhases.add(p);
      }
    }

    const overlap = {
      score: conflictingFiles.length,
      conflicting_phases: [...conflictingPhases],
      files: conflictingFiles,
    };

    if (overlap.score === 0) {
      return {
        ...phase,
        overlap,
        recommendation: 'safe_parallel',
        suggested_command: `/gsd-execute-phase ${phase.phase}`,
      };
    }

    return {
      ...phase,
      overlap,
      recommendation: 'worktree',
      suggested_command: `/gsd-execute-phase ${phase.phase} (recommend worktree)`,
    };
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
    if (a.recommendation === 'worktree') return (a.overlap?.score || 0) - (b.overlap?.score || 0);
    return comparePhaseNum(a.phase, b.phase);
  });
}

// ─── Table format ────────────────────────────────────────────────────────────

function formatTable(result) {
  let out = '';

  if (result.ready.length > 0) {
    out += '## Unlocked — Ready to Start\n\n';
    for (const r of result.ready) {
      if (r.recommendation === 'safe_parallel') {
        out += ` SAFE     Phase ${r.phase}: ${r.name} — 0 file conflicts\n`;
        out += `          → ${r.suggested_command}\n\n`;
      } else if (r.recommendation === 'worktree') {
        const conflictDesc = r.overlap.score === 1 ? '1 file conflict' : `${r.overlap.score} file conflicts`;
        const withPhases = r.overlap.conflicting_phases.map(p => `Phase ${p}`).join(', ');
        out += ` WORKTREE Phase ${r.phase}: ${r.name} — ${conflictDesc} with ${withPhases}\n`;
        for (const f of r.overlap.files) {
          out += `          ${f}\n`;
        }
        out += `          → ${r.suggested_command}\n\n`;
      } else {
        out += ` PLAN     Phase ${r.phase}: ${r.name} — no plan yet, overlap unknown\n`;
        out += `          → ${r.suggested_command}\n\n`;
      }
    }
  }

  if (result.in_progress.length > 0) {
    out += `## In Progress (${result.in_progress.length})\n`;
    for (const ip of result.in_progress) {
      out += `  Phase ${ip.phase}: ${ip.name}\n`;
    }
    out += '\n';
  }

  if (result.blocked.length > 0) {
    out += `## Blocked (${result.blocked.length})\n`;
    for (const b of result.blocked) {
      out += `  Phase ${b.phase}: ${b.name} — waiting on ${b.blocked_by.map(n => `Phase ${n}`).join(', ')}\n`;
    }
    out += '\n';
  }

  if (result.ready.length === 0 && result.in_progress.length === 0 && result.blocked.length === 0) {
    out += 'All phases complete — nothing to unlock.\n';
  }

  return out.trim();
}

// ─── Main command ────────────────────────────────────────────────────────────

function cmdUnlocked(cwd, format, raw) {
  const pDir = planningDir(cwd);
  const roadmapPath = path.join(pDir, 'ROADMAP.md');
  const isDirInMilestone = getMilestonePhaseFilter(cwd);

  const emptyResult = {
    timestamp: new Date().toISOString(),
    summary: { total_incomplete: 0, in_progress: 0, ready: 0, blocked: 0 },
    in_progress: [],
    ready: [],
    blocked: [],
  };

  if (!fs.existsSync(roadmapPath)) {
    if (format === 'table') {
      output({ rendered: formatTable(emptyResult) }, raw, formatTable(emptyResult));
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
  const dirLookup = buildPhaseDirLookup(phasesDir, isDirInMilestone);

  const { inProgress, ready, blocked } = classifyPhases(phases, dirLookup);

  // Assign recommendations and sort ready phases
  const readyWithRecs = assignRecommendations(ready, inProgress);
  const sortedReady = sortReady(readyWithRecs);

  const result = {
    timestamp: new Date().toISOString(),
    summary: {
      total_incomplete: inProgress.length + sortedReady.length + blocked.length,
      in_progress: inProgress.length,
      ready: sortedReady.length,
      blocked: blocked.length,
    },
    in_progress: inProgress,
    ready: sortedReady,
    blocked,
  };

  if (format === 'table') {
    const rendered = formatTable(result);
    output({ rendered }, raw, rendered);
  } else {
    output(result, raw);
  }
}

module.exports = { cmdUnlocked };
