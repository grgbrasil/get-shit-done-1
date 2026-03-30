/**
 * OPS — Registry CRUD, area detection, and CLI command handlers
 *
 * Provides auto-detection of project areas from route files and directory
 * conventions, manual area registration, and per-area persistence in
 * .planning/ops/{area-slug}/.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { output, error, planningRoot, generateSlugInternal } = require('./core.cjs');

// ─── Constants ──────────────────────────────────────────────────────────────

const REGISTRY_FILENAME = 'registry.json';

const FRAMEWORK_PATTERNS = {
  'vue-router': {
    files: ['src/router/**/*.{js,ts}', 'src/routes/**/*.{js,ts}'],
    routeRegex: /path:\s*['"]\/([^'"]*)['"]/g,
    type: 'route'
  },
  'laravel': {
    files: ['routes/web.php', 'routes/api.php'],
    routeRegex: /Route::\w+\(\s*['"]\/([^'"]*)['"]/g,
    type: 'route'
  },
  'express': {
    files: ['**/routes/**/*.{js,ts}', '**/router/**/*.{js,ts}'],
    routeRegex: /router\.\w+\(\s*['"]\/([^'"]*)['"]/g,
    type: 'route'
  },
  'nextjs': {
    directories: ['app/', 'pages/'],
    type: 'directory'
  },
  'directory-convention': {
    directories: ['src/views/', 'src/pages/', 'src/features/', 'src/modules/'],
    type: 'directory'
  }
};

// ─── Internal Helpers ───────────────────────────────────────────────────────

function registryDir(cwd) {
  return path.join(planningRoot(cwd), 'ops');
}

function registryPath(cwd) {
  return path.join(registryDir(cwd), REGISTRY_FILENAME);
}

function readRegistry(cwd) {
  const p = registryPath(cwd);
  if (!fs.existsSync(p)) return { areas: [] };
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch {
    return { areas: [] };
  }
}

function writeRegistry(cwd, registry) {
  const dir = registryDir(cwd);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(registryPath(cwd), JSON.stringify(registry, null, 2), 'utf-8');
}

function areaDir(cwd, slug) {
  return path.join(registryDir(cwd), slug);
}

function ensureAreaDir(cwd, slug) {
  const dir = areaDir(cwd, slug);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function slugify(text) {
  return generateSlugInternal(text);
}

// ─── File Listing ───────────────────────────────────────────────────────────

/**
 * List project files using git ls-files (respects .gitignore).
 * Falls back to recursive fs.readdirSync if git is unavailable.
 */
function listProjectFiles(cwd) {
  try {
    const result = execSync('git ls-files', { cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
    return result.trim().split('\n').filter(Boolean);
  } catch {
    // Fallback: recursive directory scan
    return listFilesRecursive(cwd, cwd);
  }
}

const EXCLUDED_DIRS = new Set(['node_modules', 'dist', 'build', '.planning', '.git']);

function listFilesRecursive(baseDir, currentDir) {
  const results = [];
  let entries;
  try {
    entries = fs.readdirSync(currentDir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    if (EXCLUDED_DIRS.has(entry.name)) continue;
    const fullPath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      results.push(...listFilesRecursive(baseDir, fullPath));
    } else {
      results.push(path.relative(baseDir, fullPath));
    }
  }
  return results;
}

// ─── Detection Functions ────────────────────────────────────────────────────

/**
 * Match a glob-like pattern against a file path.
 * Supports ** (any path segments) and * (any chars in segment) and {a,b} alternation.
 */
function matchGlob(pattern, filePath) {
  // Expand {a,b} alternation into multiple patterns
  const braceMatch = pattern.match(/\{([^}]+)\}/);
  if (braceMatch) {
    const alternatives = braceMatch[1].split(',');
    return alternatives.some(alt => {
      const expanded = pattern.replace(braceMatch[0], alt);
      return matchGlob(expanded, filePath);
    });
  }

  // Convert glob to regex
  // Normalize: replace /**/ with a token, then handle ** at start/end
  let regex = pattern
    .replace(/\./g, '\\.')
    .replace(/\/\*\*\//g, '(?:/.*?/|/)')   // /**/ matches zero or more dirs
    .replace(/^\*\*\//, '(?:.*?/|)')        // **/ at start matches zero or more leading dirs
    .replace(/\/\*\*$/, '(?:/.*)?')         // /** at end matches zero or more trailing segments
    .replace(/\*/g, '[^/]*');               // * matches within one segment

  return new RegExp('^' + regex + '$').test(filePath);
}

/**
 * Detect which framework patterns match the project file list.
 */
function detectFramework(cwd, files) {
  const matches = [];

  for (const [framework, config] of Object.entries(FRAMEWORK_PATTERNS)) {
    if (config.type === 'route' && config.files) {
      const matchedFiles = files.filter(f =>
        config.files.some(pattern => matchGlob(pattern, f))
      );
      if (matchedFiles.length > 0) {
        matches.push({ framework, type: config.type, files: matchedFiles, routeRegex: config.routeRegex });
      }
    } else if (config.type === 'directory' && config.directories) {
      const matchedDirs = config.directories.filter(dir => {
        // Check if any file starts with this directory prefix
        const normalizedDir = dir.endsWith('/') ? dir : dir + '/';
        return files.some(f => f.startsWith(normalizedDir));
      });
      if (matchedDirs.length > 0) {
        matches.push({ framework, type: config.type, directories: matchedDirs });
      }
    }
  }

  return matches;
}

/**
 * Extract top-level path segments from route files as areas.
 */
function detectAreasFromRoutes(cwd, frameworkMatch) {
  const areas = [];
  const seen = new Set();

  for (const routeFile of frameworkMatch.files) {
    let content;
    try {
      content = fs.readFileSync(path.join(cwd, routeFile), 'utf-8');
    } catch {
      continue;
    }

    const regex = new RegExp(frameworkMatch.routeRegex.source, frameworkMatch.routeRegex.flags);
    let match;
    while ((match = regex.exec(content)) !== null) {
      const fullPath = match[1];
      if (!fullPath) continue;
      const topSegment = fullPath.split('/')[0];
      if (!topSegment) continue;

      const slug = slugify(topSegment);
      if (!slug || seen.has(slug)) continue;
      seen.add(slug);

      areas.push({
        name: topSegment,
        slug,
        detected_by: 'route',
        confidence: 'high',
        files: [routeFile]
      });
    }
  }

  return areas;
}

/**
 * Detect areas from directory conventions (immediate subdirs).
 */
function detectAreasFromDirectories(cwd, frameworkMatch) {
  const areas = [];
  const seen = new Set();

  for (const dir of frameworkMatch.directories) {
    const fullDir = path.join(cwd, dir);
    let entries;
    try {
      entries = fs.readdirSync(fullDir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith('.') || entry.name.startsWith('_')) continue;

      const slug = slugify(entry.name);
      if (!slug || seen.has(slug)) continue;
      seen.add(slug);

      areas.push({
        name: entry.name,
        slug,
        detected_by: 'directory',
        confidence: 'medium',
        files: []
      });
    }
  }

  return areas;
}

/**
 * Merge areas detected from routes and directories.
 * Route-detected areas take priority for naming.
 */
function deduplicateAreas(routeAreas, dirAreas) {
  const merged = new Map();

  for (const area of routeAreas) {
    merged.set(area.slug, { ...area, source: 'auto' });
  }

  for (const area of dirAreas) {
    if (merged.has(area.slug)) {
      const existing = merged.get(area.slug);
      // Merge detected_by sources
      const detectedBy = Array.isArray(existing.detected_by)
        ? existing.detected_by
        : [existing.detected_by];
      if (!detectedBy.includes('directory')) {
        detectedBy.push('directory');
      }
      existing.detected_by = detectedBy;
      existing.confidence = 'high'; // Both sources confirm
    } else {
      merged.set(area.slug, { ...area, source: 'auto' });
    }
  }

  return Array.from(merged.values());
}

// ─── Tree / Graph Helpers ──────────────────────────────────────────────────

/**
 * Write tree.json for an area.
 */
function writeTreeJson(cwd, slug, tree) {
  ensureAreaDir(cwd, slug);
  const treePath = path.join(areaDir(cwd, slug), 'tree.json');
  fs.writeFileSync(treePath, JSON.stringify(tree, null, 2), 'utf-8');
}

/**
 * Read tree.json for an area, or null if not exists.
 */
function readTreeJson(cwd, slug) {
  const treePath = path.join(areaDir(cwd, slug), 'tree.json');
  if (!fs.existsSync(treePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(treePath, 'utf-8'));
  } catch {
    return null;
  }
}

/**
 * Build a node ID from type and name.
 */
function buildNodeId(type, name) {
  return type + ':' + name;
}

/**
 * Scan a file for import/require statements and resolve to project files.
 */
function scanImports(filePath, projectFiles, cwd) {
  let content;
  try {
    content = fs.readFileSync(path.join(cwd, filePath), 'utf-8');
  } catch {
    return [];
  }

  const imports = [];
  const fileDir = path.dirname(filePath);

  // ES6 imports
  const es6Regex = /import\s+.*\s+from\s+['"]([^'"]+)['"]/g;
  let match;
  while ((match = es6Regex.exec(content)) !== null) {
    imports.push(match[1]);
  }

  // CommonJS require
  const cjsRegex = /require\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((match = cjsRegex.exec(content)) !== null) {
    imports.push(match[1]);
  }

  // PHP use statements
  const phpRegex = /use\s+([A-Z][A-Za-z\\]+)/g;
  while ((match = phpRegex.exec(content)) !== null) {
    imports.push(match[1]);
  }

  // Resolve relative paths and match to project files
  const resolved = [];
  const projectFileSet = new Set(projectFiles);

  for (const imp of imports) {
    if (imp.startsWith('.')) {
      // Relative import — resolve against file directory
      const base = path.normalize(path.join(fileDir, imp));
      // Try exact match, then with common extensions
      const candidates = [
        base,
        base + '.js', base + '.ts', base + '.jsx', base + '.tsx',
        base + '.vue', base + '.php', base + '.cjs', base + '.mjs',
        path.join(base, 'index.js'), path.join(base, 'index.ts'),
        path.join(base, 'index.vue')
      ];
      for (const candidate of candidates) {
        const normalized = path.normalize(candidate);
        if (projectFileSet.has(normalized)) {
          resolved.push(normalized);
          break;
        }
      }
    }
    // Non-relative imports (packages, PHP namespaces) are skipped — not project files
  }

  return resolved;
}

/**
 * Classify file type based on path heuristics.
 */
function classifyFileType(filePath) {
  const lower = filePath.toLowerCase();
  if (/\/routes?\//.test(lower) || /\/router\//.test(lower)) return 'route';
  if (/\/views?\//.test(lower) || /\/pages\//.test(lower)) return 'view';
  if (/\/components?\//.test(lower)) return 'component';
  if (/\/controllers?\//.test(lower) || /\/endpoints?\//.test(lower) || /\/api\//.test(lower)) return 'endpoint';
  if (/\/services?\//.test(lower)) return 'service';
  if (/\/models?\//.test(lower)) return 'model';
  if (/\/migrations?\//.test(lower) || /\.sql$/.test(lower)) return 'table';
  return 'component';
}

/**
 * Extract a human-readable node name from a file path (filename without extension).
 */
function extractNodeName(filePath) {
  return path.basename(filePath, path.extname(filePath));
}

/**
 * Infer edge type from source and target node types.
 */
function inferEdgeType(sourceType, targetType) {
  if (sourceType === 'route' && targetType === 'view') return 'renders';
  if (sourceType === 'view' && targetType === 'component') return 'renders';
  if (sourceType === 'component' && targetType === 'endpoint') return 'calls';
  if (sourceType === 'endpoint' && targetType === 'service') return 'calls';
  if (sourceType === 'endpoint' && targetType === 'model') return 'uses_table';
  if (sourceType === 'service' && targetType === 'model') return 'uses_table';
  return 'imports';
}

/**
 * Recursively follow imports from a starting set of files, up to maxDepth levels.
 */
function followImports(startFiles, projectFiles, cwd, maxDepth) {
  const visited = new Set(startFiles);
  let frontier = [...startFiles];

  for (let depth = 0; depth < maxDepth && frontier.length > 0; depth++) {
    const nextFrontier = [];
    for (const file of frontier) {
      const imported = scanImports(file, projectFiles, cwd);
      for (const imp of imported) {
        if (!visited.has(imp)) {
          visited.add(imp);
          nextFrontier.push(imp);
        }
      }
    }
    frontier = nextFrontier;
  }

  return Array.from(visited);
}

// ─── Command Functions ──────────────────────────────────────────────────────

/**
 * ops init — Scan codebase and produce registry.json with auto-detected areas.
 */
function cmdOpsInit(cwd, args, raw) {
  const files = listProjectFiles(cwd);
  const frameworkMatches = detectFramework(cwd, files);

  let routeAreas = [];
  let dirAreas = [];

  for (const match of frameworkMatches) {
    if (match.type === 'route') {
      routeAreas.push(...detectAreasFromRoutes(cwd, match));
    } else if (match.type === 'directory') {
      dirAreas.push(...detectAreasFromDirectories(cwd, match));
    }
  }

  const mergedAreas = deduplicateAreas(routeAreas, dirAreas);
  const now = new Date().toISOString();

  const registry = {
    areas: mergedAreas.map(area => ({
      slug: area.slug,
      name: area.name,
      source: area.source || 'auto',
      detected_by: area.detected_by,
      confidence: area.confidence,
      created_at: now,
      last_scanned: now,
      components_count: 0
    })),
    created_at: now,
    last_scanned: now
  };

  writeRegistry(cwd, registry);
  output({ success: true, areas_detected: registry.areas.length, areas: registry.areas }, raw);
}

/**
 * ops add — Register a manual area in registry.json and create per-area directory.
 */
function cmdOpsAdd(cwd, areaName, args, raw) {
  if (!areaName) {
    error('Usage: gsd-tools ops add <area-name>');
    return;
  }

  const slug = slugify(areaName);
  if (!slug) {
    error('Invalid area name: ' + areaName);
    return;
  }

  const registry = readRegistry(cwd);
  const existing = registry.areas.find(a => a.slug === slug);
  if (existing) {
    error('Area already exists: ' + slug);
    return;
  }

  const entry = {
    slug,
    name: areaName,
    source: 'manual',
    detected_by: 'manual',
    confidence: 'high',
    created_at: new Date().toISOString(),
    last_scanned: null,
    components_count: 0
  };

  registry.areas.push(entry);
  writeRegistry(cwd, registry);
  ensureAreaDir(cwd, slug);

  output({ success: true, area: entry }, raw);
}

/**
 * ops list — Return all registered areas.
 */
function cmdOpsList(cwd, raw) {
  const registry = readRegistry(cwd);
  output({ areas: registry.areas || [] }, raw);
}

/**
 * ops get — Return a single area entry by slug.
 */
function cmdOpsGet(cwd, area, raw) {
  if (!area) {
    error('Usage: gsd-tools ops get <area>');
    return;
  }

  const slug = slugify(area);
  const registry = readRegistry(cwd);
  const entry = registry.areas.find(a => a.slug === slug);

  if (!entry) {
    error('Area not found: ' + slug);
    return;
  }

  output({
    ...entry,
    has_tree: fs.existsSync(path.join(areaDir(cwd, slug), 'tree.json'))
  }, raw);
}

/**
 * ops map — Build per-area dependency tree (adjacency list graph) and write tree.json.
 */
function cmdOpsMap(cwd, area, raw) {
  if (!area) {
    error('Usage: gsd-tools ops map <area>');
    return;
  }

  const slug = slugify(area);
  const registry = readRegistry(cwd);
  const entry = registry.areas.find(a => a.slug === slug);

  if (!entry) {
    error('Area not found in registry: ' + slug);
    return;
  }

  const projectFiles = listProjectFiles(cwd);

  // Determine files belonging to this area
  let areaFiles;

  if (entry.detected_by === 'route' || (Array.isArray(entry.detected_by) && entry.detected_by.includes('route'))) {
    // Route-detected: start from route files, follow imports recursively (max 3 levels)
    // Find route files that mention this area
    const routeFiles = projectFiles.filter(f => {
      const lower = f.toLowerCase();
      return /\/routes?\//.test(lower) || /\/router\//.test(lower);
    });
    // Filter route files that reference the area slug or name
    const relevantRouteFiles = routeFiles.filter(f => {
      try {
        const content = fs.readFileSync(path.join(cwd, f), 'utf-8');
        return content.includes('/' + entry.name) || content.includes('/' + slug);
      } catch {
        return false;
      }
    });
    if (relevantRouteFiles.length > 0) {
      areaFiles = followImports(relevantRouteFiles, projectFiles, cwd, 3);
    } else {
      // Fallback to path matching
      areaFiles = projectFiles.filter(f => {
        const lower = f.toLowerCase();
        return lower.includes('/' + slug + '/') || lower.includes('/' + slug + '.') ||
               lower.includes('/' + entry.name.toLowerCase() + '/') || lower.includes('/' + entry.name.toLowerCase() + '.');
      });
    }
  } else if (entry.detected_by === 'directory') {
    // Directory-detected: find files whose path contains the area slug or area name, then follow imports
    const seedFiles = projectFiles.filter(f => {
      const lower = f.toLowerCase();
      return lower.includes('/' + slug + '/') || lower.includes('/' + slug + '.') ||
             lower.includes('/' + entry.name.toLowerCase() + '/') || lower.includes('/' + entry.name.toLowerCase() + '.');
    });
    areaFiles = followImports(seedFiles, projectFiles, cwd, 3);
  } else {
    // Manual areas: find files whose path contains the area slug, then follow imports
    const seedFiles = projectFiles.filter(f => {
      const lower = f.toLowerCase();
      return lower.includes('/' + slug + '/') || lower.includes('/' + slug + '.');
    });
    areaFiles = followImports(seedFiles, projectFiles, cwd, 3);
  }

  // Build nodes
  const nodeMap = new Map(); // file_path -> node
  for (const filePath of areaFiles) {
    const type = classifyFileType(filePath);
    const name = extractNodeName(filePath);
    const id = buildNodeId(type, name);
    nodeMap.set(filePath, { id, type, file_path: filePath, name, metadata: {} });
  }

  const nodes = Array.from(nodeMap.values());

  // Build edges
  const edges = [];
  const nodeByFile = new Map();
  for (const filePath of areaFiles) {
    nodeByFile.set(filePath, nodeMap.get(filePath));
  }

  for (const filePath of areaFiles) {
    const sourceNode = nodeMap.get(filePath);
    const imported = scanImports(filePath, projectFiles, cwd);
    for (const imp of imported) {
      const targetNode = nodeByFile.get(imp);
      if (targetNode && targetNode.id !== sourceNode.id) {
        edges.push({
          from: sourceNode.id,
          to: targetNode.id,
          type: inferEdgeType(sourceNode.type, targetNode.type)
        });
      }
    }
  }

  // Construct tree object
  const tree = {
    area: slug,
    generated_at: new Date().toISOString(),
    nodes,
    edges
  };

  // Write tree.json
  writeTreeJson(cwd, slug, tree);

  // Update registry entry
  const now = new Date().toISOString();
  entry.last_scanned = now;
  entry.components_count = nodes.length;
  writeRegistry(cwd, registry);

  output({
    success: true,
    area: slug,
    nodes: nodes.length,
    edges: edges.length,
    tree_path: path.join('.planning/ops', slug, 'tree.json')
  }, raw);
}

module.exports = { cmdOpsInit, cmdOpsMap, cmdOpsAdd, cmdOpsList, cmdOpsGet };
