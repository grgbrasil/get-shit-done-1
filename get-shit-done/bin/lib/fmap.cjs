/**
 * Function Map — CRUD operations for .planning/function-map.json
 *
 * Provides O(1) lookup by file::Class::method key, merge updates,
 * file-level replace, stats aggregation, and full-scan trigger.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { output, error, planningRoot, toPosixPath } = require('./core.cjs');

const FMAP_FILENAME = 'function-map.json';

function fmapPath(cwd) {
  return path.join(planningRoot(cwd), FMAP_FILENAME);
}

/**
 * Normalize a function map key: strip leading ./ and use POSIX slashes.
 */
function normalizeKey(key) {
  let k = key.replace(/\\/g, '/');
  if (k.startsWith('./')) k = k.slice(2);
  return k;
}

/**
 * Read the function map from disk. Returns {} if file does not exist.
 */
function readMap(cwd) {
  const p = fmapPath(cwd);
  if (!fs.existsSync(p)) return {};
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

/**
 * Write the function map to disk (pretty-printed).
 */
function writeMap(cwd, map) {
  const p = fmapPath(cwd);
  fs.writeFileSync(p, JSON.stringify(map, null, 2), 'utf-8');
}

/**
 * Get one entry or the full map.
 * - No key: output entire map
 * - With key: output entry or error if not found
 */
function cmdFmapGet(cwd, key, raw) {
  const map = readMap(cwd);
  if (!key) {
    output(map, raw);
    return;
  }
  const normalized = normalizeKey(key);
  if (normalized in map) {
    output(map[normalized], raw);
  } else {
    error(`Function Map: key not found: ${normalized}`);
  }
}

/**
 * Merge a JSON patch into the map.
 * Flags:
 *   --data <json>           JSON object with entries to merge
 *   --replace-file <path>   Remove all existing keys for that file before merging
 */
function cmdFmapUpdate(cwd, args, raw) {
  const dataIdx = args.indexOf('--data');
  if (dataIdx === -1 || !args[dataIdx + 1]) {
    error('fmap update requires --data <json>');
    return;
  }
  let patch;
  try {
    patch = JSON.parse(args[dataIdx + 1]);
  } catch (e) {
    error(`fmap update: invalid JSON in --data: ${e.message}`);
    return;
  }

  const map = readMap(cwd);

  // Handle --replace-file: remove all keys starting with normalizeKey(filepath) + '::'
  const replaceIdx = args.indexOf('--replace-file');
  if (replaceIdx !== -1 && args[replaceIdx + 1]) {
    const filePrefix = normalizeKey(args[replaceIdx + 1]) + '::';
    for (const key of Object.keys(map)) {
      if (key.startsWith(filePrefix)) {
        delete map[key];
      }
    }
  }

  // Normalize patch keys and merge
  const normalizedPatch = {};
  for (const [key, value] of Object.entries(patch)) {
    normalizedPatch[normalizeKey(key)] = value;
  }
  Object.assign(map, normalizedPatch);

  writeMap(cwd, map);
  output({ updated: Object.keys(normalizedPatch).length, total: Object.keys(map).length }, raw);
}

/**
 * Return stats about the function map: total entries, breakdown by kind, file path.
 */
function cmdFmapStats(cwd, raw) {
  const map = readMap(cwd);
  const entries = Object.values(map);
  const byKind = {};
  for (const entry of entries) {
    const kind = entry.kind || 'unknown';
    byKind[kind] = (byKind[kind] || 0) + 1;
  }
  output({
    total: entries.length,
    by_kind: byKind,
    path: fmapPath(cwd),
  }, raw);
}

/**
 * Signal intent for a full rescan by the cataloger agent.
 */
function cmdFmapFullScan(cwd, raw) {
  output({
    action: 'full-scan',
    message: 'Trigger gsd-cataloger agent for full rescan',
  }, raw);
}

/**
 * Detect files changed since last commit (both staged and unstaged).
 * Used by gsd-cataloger for incremental updates (FMAP-05, D-04).
 * Returns JSON array of changed file paths (POSIX-normalized, relative to project root).
 */
function cmdFmapChangedFiles(cwd, args, raw) {
  const codeExtensions = ['.ts', '.js', '.cjs', '.mjs', '.tsx', '.jsx', '.vue', '.php', '.py', '.rb', '.go', '.rs', '.java'];

  let files = new Set();

  try {
    // Unstaged + staged changes vs HEAD
    const diffHead = execSync('git diff --name-only HEAD 2>/dev/null || true', { cwd, encoding: 'utf-8' }).trim();
    if (diffHead) diffHead.split('\n').forEach(f => files.add(f));
  } catch { /* no git or no HEAD */ }

  try {
    // Staged changes (for files added but not yet committed)
    const diffCached = execSync('git diff --name-only --cached 2>/dev/null || true', { cwd, encoding: 'utf-8' }).trim();
    if (diffCached) diffCached.split('\n').forEach(f => files.add(f));
  } catch { /* no git */ }

  try {
    // Untracked new files
    const untracked = execSync('git ls-files --others --exclude-standard 2>/dev/null || true', { cwd, encoding: 'utf-8' }).trim();
    if (untracked) untracked.split('\n').forEach(f => files.add(f));
  } catch { /* no git */ }

  // If --since-commit <hash> is passed, use diff from that commit to HEAD instead
  const sinceIdx = args ? args.indexOf('--since-commit') : -1;
  if (sinceIdx !== -1 && args[sinceIdx + 1]) {
    files = new Set();
    try {
      const diffSince = execSync(`git diff --name-only ${args[sinceIdx + 1]} HEAD 2>/dev/null || true`, { cwd, encoding: 'utf-8' }).trim();
      if (diffSince) diffSince.split('\n').forEach(f => files.add(f));
    } catch { /* bad commit ref */ }
  }

  // Filter to code files only
  const codeFiles = [...files]
    .filter(f => codeExtensions.some(ext => f.endsWith(ext)))
    .map(f => toPosixPath(f))
    .sort();

  output({ files: codeFiles, count: codeFiles.length }, raw);
}

/**
 * Normalize a function signature for reliable structural comparison.
 * Collapses whitespace (including newlines), removes trailing semicolons,
 * and normalizes spacing around parentheses and return type colon.
 */
function normalizeSignature(sig) {
  let s = sig;
  // Replace newlines and carriage returns with spaces
  s = s.replace(/[\n\r]/g, ' ');
  // Collapse multiple spaces to single space
  s = s.replace(/\s+/g, ' ');
  // Remove spaces after ( and before )
  s = s.replace(/\(\s+/g, '(');
  s = s.replace(/\s+\)/g, ')');
  // Remove spaces before : in return type position (after ))
  s = s.replace(/\)\s+:/g, '):');
  // Remove trailing semicolons
  s = s.replace(/\s*;$/, '');
  // Trim
  return s.trim();
}

/**
 * Return a pre-edit impact snapshot for a function map entry.
 * Returns callers, signature, purpose, caller_count, and calls.
 */
function cmdFmapImpact(cwd, key, raw) {
  if (!key) {
    error('fmap impact requires a key argument');
    return;
  }
  const map = readMap(cwd);
  const normalized = normalizeKey(key);
  if (!(normalized in map)) {
    output({ key: normalized, found: false, callers: [], caller_count: 0 }, raw);
    return;
  }
  const entry = map[normalized];
  output({
    key: normalized,
    found: true,
    signature: entry.signature,
    purpose: entry.purpose,
    callers: entry.callers || [],
    caller_count: (entry.callers || []).length,
    calls: entry.calls || [],
  }, raw);
}

module.exports = { cmdFmapGet, cmdFmapUpdate, cmdFmapStats, cmdFmapFullScan, cmdFmapChangedFiles, cmdFmapImpact, normalizeSignature };
