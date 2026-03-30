/**
 * Function Map — CRUD operations for .planning/function-map.json
 *
 * Provides O(1) lookup by file::Class::method key, merge updates,
 * file-level replace, stats aggregation, and full-scan trigger.
 */

const fs = require('fs');
const path = require('path');
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

module.exports = { cmdFmapGet, cmdFmapUpdate, cmdFmapStats, cmdFmapFullScan };
