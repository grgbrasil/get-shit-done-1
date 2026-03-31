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
const BLAST_RADIUS_THRESHOLD = 5;

const SPECS_TEMPLATE = (name) => `# Specs: ${name}\n\n## Regras de Negocio\n\n- (add business rules here)\n\n## Contratos de API\n\n- (add API contracts here)\n\n## Invariantes\n\n- (add system invariants here)\n\n## Notas\n\n- (add general notes here)\n`;

const FRAMEWORK_PATTERNS = {
  'vue-router': {
    files: ['**/router/*.{js,ts,mjs}', '**/router/**/*.{js,ts,mjs}', '**/routes/*.{js,ts,mjs}', '**/routes/**/*.{js,ts,mjs}'],
    routeRegex: /path:\s*['"]\/([^'"]*)['"]/g,
    type: 'route'
  },
  'laravel': {
    files: ['routes/web.php', 'routes/api.php'],
    routeRegex: /Route::\w+\(\s*['"]\/([^'"]*)['"]/g,
    type: 'route'
  },
  'express': {
    files: ['**/routes/*.{js,ts,mjs}', '**/routes/**/*.{js,ts,mjs}', '**/router/*.{js,ts,mjs}', '**/router/**/*.{js,ts,mjs}'],
    routeRegex: /router\.\w+\(\s*['"]\/([^'"]*)['"]/g,
    type: 'route'
  },
  'nextjs': {
    directories: ['app/', 'pages/'],
    type: 'directory'
  },
  'directory-convention': {
    directories: ['src/views/', 'src/pages/', 'src/features/', 'src/modules/', 'views/', 'pages/', 'features/', 'modules/'],
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
    const result = execSync('git ls-files', { cwd, encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] });
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
// Segments that are technical/internal, not functional areas
const IGNORED_ROUTE_SEGMENTS = new Set([
  'api', 'auth', 'sync', 'token', 'validate', 'callback', 'webhook', 'webhooks',
  'health', 'healthcheck', 'status', 'ping', 'metrics', 'debug', 'test',
  'static', 'assets', 'public', 'uploads', 'download', 'downloads',
  'socket', 'ws', 'sse', 'events', 'stream',
  'oauth', 'logout', 'register', 'reset-password', 'verify-email',
  'soon', 'test-drawer', 'error'
]);

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

      // Skip route parameters (:id, :slug, etc.)
      if (topSegment.startsWith(':')) continue;
      // Skip ignored technical segments
      if (IGNORED_ROUTE_SEGMENTS.has(topSegment.toLowerCase())) continue;
      // Skip very short segments (likely params or IDs)
      if (topSegment.length < 2) continue;

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

  // Dynamic imports: import('...') — Vue Router lazy loading, code splitting
  const dynamicRegex = /import\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((match = dynamicRegex.exec(content)) !== null) {
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

// ─── Shared Workflow Helpers ───────────────────────────────────────────────

/**
 * appendHistory — Append an operation entry to an area's history.json (OPS-09).
 */
function appendHistory(cwd, slug, entry) {
  ensureAreaDir(cwd, slug);
  const historyPath = path.join(areaDir(cwd, slug), 'history.json');
  let history = [];
  if (fs.existsSync(historyPath)) {
    try {
      history = JSON.parse(fs.readFileSync(historyPath, 'utf-8'));
    } catch {
      history = [];
    }
  }
  history.push({
    ...entry,
    area: slug,
    timestamp: new Date().toISOString()
  });
  fs.writeFileSync(historyPath, JSON.stringify(history, null, 2), 'utf-8');
}

/**
 * computeBlastRadius — Evaluate cross-area impact of a tree (D-04).
 * Returns { total_nodes, cross_area_edges, affected_nodes, needs_full_plan }.
 */
function computeBlastRadius(tree) {
  const nodeMap = new Map();
  for (const node of tree.nodes) {
    nodeMap.set(node.id, node);
  }

  const crossAreaEdges = (tree.edges || []).filter(edge => {
    const fromNode = nodeMap.get(edge.from);
    const toNode = nodeMap.get(edge.to);
    if (!fromNode || !toNode) return false;
    const fromPrefix = fromNode.file_path.split('/').slice(0, 2).join('/');
    const toPrefix = toNode.file_path.split('/').slice(0, 2).join('/');
    return fromPrefix !== toPrefix;
  });

  return {
    total_nodes: tree.nodes.length,
    cross_area_edges: crossAreaEdges.length,
    affected_nodes: tree.nodes.length,
    needs_full_plan: crossAreaEdges.length > 0 || tree.nodes.length > BLAST_RADIUS_THRESHOLD
  };
}

/**
 * refreshTree — Re-generate tree.json for an area (D-12). Non-fatal on failure.
 */
function refreshTree(cwd, slug) {
  try {
    const registry = readRegistry(cwd);
    const entry = registry.areas.find(a => a.slug === slug);
    if (!entry) {
      error('refreshTree: area not found in registry: ' + slug);
      return;
    }
    // Delegate to cmdOpsMap logic but suppress output
    // Re-use the mapping logic inline
    const projectFiles = listProjectFiles(cwd);
    let areaFiles;

    if (entry.detected_by === 'route' || (Array.isArray(entry.detected_by) && entry.detected_by.includes('route'))) {
      const routeFiles = projectFiles.filter(f => {
        const lower = f.toLowerCase();
        return /\/routes?\//.test(lower) || /\/router\//.test(lower);
      });
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
        areaFiles = projectFiles.filter(f => {
          const lower = f.toLowerCase();
          return lower.includes('/' + slug + '/') || lower.includes('/' + slug + '.') ||
                 lower.includes('/' + entry.name.toLowerCase() + '/') || lower.includes('/' + entry.name.toLowerCase() + '.');
        });
      }
    } else if (entry.detected_by === 'directory') {
      const seedFiles = projectFiles.filter(f => {
        const lower = f.toLowerCase();
        return lower.includes('/' + slug + '/') || lower.includes('/' + slug + '.') ||
               lower.includes('/' + entry.name.toLowerCase() + '/') || lower.includes('/' + entry.name.toLowerCase() + '.');
      });
      areaFiles = followImports(seedFiles, projectFiles, cwd, 3);
    } else {
      const seedFiles = projectFiles.filter(f => {
        const lower = f.toLowerCase();
        return lower.includes('/' + slug + '/') || lower.includes('/' + slug + '.');
      });
      areaFiles = followImports(seedFiles, projectFiles, cwd, 3);
    }

    const nodeMap = new Map();
    for (const filePath of areaFiles) {
      const type = classifyFileType(filePath);
      const name = extractNodeName(filePath);
      const id = buildNodeId(type, name);
      nodeMap.set(filePath, { id, type, file_path: filePath, name, metadata: {} });
    }
    const nodes = Array.from(nodeMap.values());
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

    // ─── Preserve knowledge from existing tree ──────────────────────────
    const existingTree = readTreeJson(cwd, slug);
    if (existingTree && Array.isArray(existingTree.nodes)) {
      const ENRICHED_FIELDS = ['endpoints_called', 'css_classes', 'columns', 'query', 'indexes', 'props', 'emits', 'slots', 'summary'];
      // Build lookup by id and file_path
      const oldById = new Map();
      const oldByFile = new Map();
      for (const oldNode of existingTree.nodes) {
        if (oldNode.id) oldById.set(oldNode.id, oldNode);
        if (oldNode.file_path) oldByFile.set(oldNode.file_path, oldNode);
      }
      for (const newNode of nodes) {
        const existing = oldById.get(newNode.id) || oldByFile.get(newNode.file_path);
        if (!existing) continue;
        // Merge knowledge: existing values spread over new (preserve existing)
        if (existing.knowledge && typeof existing.knowledge === 'object') {
          newNode.knowledge = { ...(newNode.knowledge || {}), ...existing.knowledge };
        }
        // Preserve enriched fields only if missing or empty in new node
        for (const field of ENRICHED_FIELDS) {
          if (existing[field] !== undefined && (newNode[field] === undefined || newNode[field] === null || newNode[field] === '')) {
            newNode[field] = existing[field];
          }
        }
      }
    }
    // ────────────────────────────────────────────────────────────────────

    const tree = { area: slug, generated_at: new Date().toISOString(), nodes, edges };
    writeTreeJson(cwd, slug, tree);

    const now = new Date().toISOString();
    entry.last_scanned = now;
    entry.components_count = nodes.length;
    writeRegistry(cwd, registry);
  } catch (err) {
    error('refreshTree failed (non-fatal): ' + (err.message || err));
  }
}

/**
 * cmdOpsSummary — Output enriched summary of all areas (D-01/D-02).
 */
function cmdOpsSummary(cwd, raw) {
  const registry = readRegistry(cwd);
  if (!registry.areas || registry.areas.length === 0) {
    output({ areas_count: 0, areas: [] }, raw);
    return;
  }

  const enriched = registry.areas.map(area => {
    const tree = readTreeJson(cwd, area.slug);
    if (!tree) {
      return {
        slug: area.slug,
        name: area.name,
        components: area.components_count || 0,
        last_scanned: area.last_scanned,
        nodes_by_type: {},
        edges_count: 0,
        cross_refs: []
      };
    }

    // Compute nodes_by_type
    const nodesByType = {};
    for (const node of tree.nodes || []) {
      nodesByType[node.type] = (nodesByType[node.type] || 0) + 1;
    }

    // Build node map for cross-ref detection
    const nodeMap = new Map();
    for (const node of tree.nodes || []) {
      nodeMap.set(node.id, node);
    }

    // Compute cross_refs: unique dir prefixes from edge targets in different areas
    const crossRefSet = new Set();
    for (const edge of tree.edges || []) {
      const fromNode = nodeMap.get(edge.from);
      const toNode = nodeMap.get(edge.to);
      if (!fromNode || !toNode) continue;
      const fromPrefix = fromNode.file_path.split('/').slice(0, 2).join('/');
      const toPrefix = toNode.file_path.split('/').slice(0, 2).join('/');
      if (fromPrefix !== toPrefix) {
        crossRefSet.add(toPrefix);
      }
    }

    return {
      slug: area.slug,
      name: area.name,
      components: area.components_count || 0,
      last_scanned: area.last_scanned,
      nodes_by_type: nodesByType,
      edges_count: (tree.edges || []).length,
      cross_refs: Array.from(crossRefSet)
    };
  });

  output({ areas_count: enriched.length, areas: enriched }, raw);
}

// ─── Workflow Commands ────────────────────────────────────────────────────

/**
 * cmdOpsInvestigate — Auto-bootstrap + load full tree context for autonomous investigation.
 * Auto-creates registry entry, area dir, and tree.json if missing (v2).
 * Outputs JSON with full tree, findings_path, and CLI tool hints for agent consumption.
 * Records history per OPS-09.
 */
function cmdOpsInvestigate(cwd, area, description, raw) {
  if (!area) { error('Usage: gsd-tools ops investigate <area> <description>'); return; }
  const slug = slugify(area);

  const bootstrapped = { registry: false, area_dir: false, tree: false };

  // 1. Auto-bootstrap registry entry
  const registry = readRegistry(cwd);
  let entry = registry.areas.find(a => a.slug === slug);
  if (!entry) {
    entry = {
      slug,
      name: slug,
      source: 'auto-bootstrap',
      detected_by: 'investigate',
      confidence: 'medium',
      components_count: 0,
      last_scanned: new Date().toISOString()
    };
    registry.areas.push(entry);
    writeRegistry(cwd, registry);
    bootstrapped.registry = true;
  }

  // 2. Auto-bootstrap area dir
  const dir = areaDir(cwd, slug);
  if (!fs.existsSync(dir)) {
    ensureAreaDir(cwd, slug);
    bootstrapped.area_dir = true;
  }

  // 3. Auto-bootstrap tree
  let tree = readTreeJson(cwd, slug);
  if (!tree) {
    tree = {
      area: slug,
      generated_at: new Date().toISOString(),
      nodes: [],
      edges: []
    };
    writeTreeJson(cwd, slug, tree);
    bootstrapped.tree = true;
  }

  // Record history per OPS-09
  appendHistory(cwd, slug, {
    op: 'investigate',
    summary: description || 'Investigation initiated',
    outcome: 'success'
  });

  // Post-op tree refresh per D-12 — only if tree had existing nodes
  if (tree.nodes.length > 0) {
    refreshTree(cwd, slug);
    // Re-read tree after refresh
    tree = readTreeJson(cwd, slug) || tree;
  }

  // Build CLI tool hints
  const base = 'node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs"';

  output({
    success: true,
    area: slug,
    description: description || '',
    bootstrapped,
    tree_path: path.join('.planning/ops', slug, 'tree.json'),
    findings_path: path.join('.planning/ops', slug, 'findings.json'),
    context: {
      nodes: tree.nodes.length,
      edges: tree.edges.length,
      tree: tree
    },
    tools: {
      tree_query: `${base} ops tree-query ${slug} --intent <intent> --node <node-id>`,
      tree_update: `${base} ops tree-update ${slug} <node-id> <field> <json-value>`,
      findings_add: `${base} ops findings ${slug} add --title "..." --severity <low|medium|high|critical> --category <bug|debt|risk|optimization|security> --description "..."`,
      findings_list: `${base} ops findings ${slug} list [--status pending]`
    }
  }, raw);
}

/**
 * cmdOpsDebug — Emit context-pack.md with area context for composable debugging (OPS-08, D-08, D-09).
 * Does NOT duplicate /gsd:debug — only contributes OPS-specific context.
 */
function cmdOpsDebug(cwd, area, symptom, raw) {
  if (!area) { error('Usage: gsd-tools ops debug <area> <symptom>'); return; }
  const slug = slugify(area);
  const registry = readRegistry(cwd);
  const entry = registry.areas.find(a => a.slug === slug);
  if (!entry) { error('Area not found: ' + slug); return; }

  const tree = readTreeJson(cwd, slug);
  // tree may be null — debug can still provide registry context

  // Build context-pack.md per D-08
  const sections = [];

  // ## Area Overview
  sections.push('## Area Overview\n');
  sections.push(`- **Area:** ${entry.name} (${slug})`);
  sections.push(`- **Source:** ${entry.source || 'unknown'}`);
  sections.push(`- **Detected by:** ${entry.detected_by || 'unknown'}`);
  sections.push(`- **Components:** ${entry.components_count || 0}`);
  sections.push(`- **Last scanned:** ${entry.last_scanned || 'never'}`);
  if (symptom) sections.push(`- **Reported symptom:** ${symptom}`);
  sections.push('');

  // ## Dependency Chain (route -> model)
  sections.push('## Dependency Chain\n');
  if (tree) {
    const typeOrder = ['route', 'view', 'component', 'endpoint', 'service', 'model', 'table'];
    for (const type of typeOrder) {
      const nodesOfType = tree.nodes.filter(n => n.type === type);
      if (nodesOfType.length > 0) {
        sections.push(`### ${type} (${nodesOfType.length})`);
        for (const n of nodesOfType) {
          const outEdges = tree.edges.filter(e => e.from === n.id);
          const targets = outEdges.map(e => e.to).join(', ');
          sections.push(`- \`${n.file_path}\` ${targets ? '-> ' + targets : ''}`);
        }
        sections.push('');
      }
    }
    // Any types not in the standard order
    const coveredTypes = new Set(typeOrder);
    const otherNodes = tree.nodes.filter(n => !coveredTypes.has(n.type));
    if (otherNodes.length > 0) {
      sections.push(`### other (${otherNodes.length})`);
      for (const n of otherNodes) {
        sections.push(`- \`${n.file_path}\` (${n.type})`);
      }
      sections.push('');
    }
  } else {
    sections.push('_No tree.json available. Run /ops:map first for full dependency chain._\n');
  }

  // ## Specs
  sections.push('## Specs\n');
  const specsPath = path.join(areaDir(cwd, slug), 'specs.md');
  if (fs.existsSync(specsPath)) {
    sections.push(fs.readFileSync(specsPath, 'utf-8'));
  } else {
    sections.push('_No specs defined for this area. Use /ops:spec to create._\n');
  }

  // ## Recent History
  sections.push('## Recent History\n');
  const historyPath = path.join(areaDir(cwd, slug), 'history.json');
  if (fs.existsSync(historyPath)) {
    try {
      const history = JSON.parse(fs.readFileSync(historyPath, 'utf-8'));
      const recent = history.slice(-10);
      for (const h of recent) {
        sections.push(`- **${h.op}** (${h.timestamp}) — ${h.summary} [${h.outcome}]`);
      }
    } catch { sections.push('_History file corrupted._'); }
  } else {
    sections.push('_No operation history for this area._');
  }
  sections.push('');

  // Write context-pack.md
  const contextPackPath = path.join(areaDir(cwd, slug), 'context-pack.md');
  ensureAreaDir(cwd, slug);
  const content = `# Context Pack: ${entry.name}\n\n**Generated:** ${new Date().toISOString()}\n**Symptom:** ${symptom || 'not specified'}\n\n${sections.join('\n')}`;
  fs.writeFileSync(contextPackPath, content, 'utf-8');

  // Record history per OPS-09
  appendHistory(cwd, slug, {
    op: 'debug',
    summary: symptom || 'Debug context emitted',
    outcome: 'success'
  });

  // Post-op tree refresh per D-12
  refreshTree(cwd, slug);

  output({
    success: true,
    area: slug,
    context_pack_path: path.relative(cwd, contextPackPath)
  }, raw);
}

// ─── Dispatch Hybrid Commands ─────────────────────────────────────────────

/**
 * cmdOpsFeature — Add capability to area with blast-radius dispatch (OPS-06, D-04/D-05).
 * Small scope -> dispatch "quick" for /gsd:quick. Large scope -> dispatch "plan" with plan_dir.
 */
function cmdOpsFeature(cwd, area, description, raw) {
  if (!area) { error('Usage: gsd-tools ops feature <area> <description>'); return; }
  const slug = slugify(area);
  const registry = readRegistry(cwd);
  const entry = registry.areas.find(a => a.slug === slug);
  if (!entry) { error('Area not found: ' + slug); return; }

  const tree = readTreeJson(cwd, slug);
  if (!tree) { error('No tree.json for area: ' + slug + '. Run /ops:map first.'); return; }

  // Per D-04: compute blast radius from tree.json
  const blast = computeBlastRadius(tree);

  const result = {
    success: true,
    area: slug,
    description: description || '',
    blast_radius: blast,
    needs_full_plan: blast.needs_full_plan,
    dispatch: blast.needs_full_plan ? 'plan' : 'quick'
  };

  // Per D-06: OPS full plans live in .planning/ops/{area}/plans/
  if (blast.needs_full_plan) {
    const planDir = path.join(areaDir(cwd, slug), 'plans');
    fs.mkdirSync(planDir, { recursive: true });
    result.plan_dir = path.relative(cwd, planDir);
  }

  // Per D-03: feature uses summary context (not full tree)
  const byType = {};
  for (const n of tree.nodes) { byType[n.type] = (byType[n.type] || 0) + 1; }
  result.context_summary = {
    nodes_by_type: byType,
    edges_count: tree.edges.length,
    total_nodes: tree.nodes.length
  };

  // Record history per OPS-09
  appendHistory(cwd, slug, {
    op: 'feature',
    summary: description || 'Feature initiated',
    outcome: 'success'
  });

  // Post-op tree refresh per D-12
  refreshTree(cwd, slug);

  output(result, raw);
}

/**
 * cmdOpsModify — Modify behavior in area with impact analysis from tree edges (OPS-07, D-03/D-04).
 * Traverses edges to identify affected nodes, then dispatches based on blast radius.
 */
function cmdOpsModify(cwd, area, description, raw) {
  if (!area) { error('Usage: gsd-tools ops modify <area> <description|FINDING-ID|RANGE|--all-pending>'); return; }
  const slug = slugify(area);
  const registry = readRegistry(cwd);
  const entry = registry.areas.find(a => a.slug === slug);
  if (!entry) { error('Area not found: ' + slug); return; }

  const tree = readTreeJson(cwd, slug);
  if (!tree) { error('No tree.json for area: ' + slug + '. Run /ops:map first.'); return; }

  // Per D-04: compute blast radius for dispatch
  const blast = computeBlastRadius(tree);

  // ─── Detection: findings mode vs legacy mode ───────────────────────────
  const desc = (description || '').trim();
  const FINDING_ID_RE = /^[A-Z0-9_]+-\d+$/;
  const FINDING_RANGE_RE = /^[A-Z0-9_]+-\d+\.\.\d+$/;

  const isFindingId = FINDING_ID_RE.test(desc);
  const isFindingRange = FINDING_RANGE_RE.test(desc);
  const isAllPending = desc === '--all-pending';
  const isFindingsMode = isFindingId || isFindingRange || isAllPending;

  if (isFindingsMode) {
    // ─── Findings mode ─────────────────────────────────────────────────
    const findingsData = readFindings(cwd, slug);
    const allFindings = findingsData.findings || [];
    let targetFindings = [];

    if (isAllPending) {
      targetFindings = allFindings.filter(f => f.status === 'pending');
    } else if (isFindingRange) {
      const ids = parseFindingRange(desc);
      if (ids) {
        const idSet = new Set(ids);
        targetFindings = allFindings.filter(f => idSet.has(f.id));
      }
    } else {
      // Single finding ID
      targetFindings = allFindings.filter(f => f.id === desc);
    }

    if (targetFindings.length === 0) {
      error('No matching findings found for: ' + desc);
      return;
    }

    // Collect unique files affected
    const filesAffected = [...new Set(targetFindings.map(f => f.file_path).filter(Boolean))];

    // Group findings by file
    const findingsByFile = {};
    for (const f of targetFindings) {
      if (f.file_path) {
        if (!findingsByFile[f.file_path]) findingsByFile[f.file_path] = [];
        findingsByFile[f.file_path].push(f);
      }
    }

    // Dispatch: quick if <=5 findings, plan if >5
    const dispatch = targetFindings.length > 5 ? 'plan' : 'quick';

    // Build tool hints
    const toolsBase = 'node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" ops findings ' + slug;
    const firstId = targetFindings[0].id;
    const tools = {
      mark_fixed: toolsBase + ' update ' + firstId + ' --status fixed --resolved-by ops:modify',
    };
    if (targetFindings.length > 1) {
      const lastId = targetFindings[targetFindings.length - 1].id;
      tools.mark_range = toolsBase + ' update ' + firstId + '..' + lastId + ' --status fixed';
    }

    const result = {
      success: true,
      area: slug,
      findings_mode: true,
      target_findings: targetFindings,
      files_affected: filesAffected,
      findings_by_file: findingsByFile,
      blast_radius: blast,
      dispatch,
      tools
    };

    // Per D-06: plans dir for plan mode
    if (dispatch === 'plan') {
      const planDir = path.join(areaDir(cwd, slug), 'plans');
      fs.mkdirSync(planDir, { recursive: true });
      result.plan_dir = path.relative(cwd, planDir);
    }

    // Record history per OPS-09
    appendHistory(cwd, slug, {
      op: 'modify',
      summary: 'Findings mode: ' + desc + ' (' + targetFindings.length + ' findings)',
      outcome: 'success'
    });

    // Post-op tree refresh per D-12
    refreshTree(cwd, slug);

    output(result, raw);
    return;
  }

  // ─── Legacy description-based mode ───────────────────────────────────────

  // Impact analysis: identify all nodes that could be affected
  // Traverse edges to find downstream dependents (nodes that import/use other nodes)
  const affectedNodes = [];
  const visited = new Set();

  function traverseDownstream(nodeId, depth) {
    if (depth > 3 || visited.has(nodeId)) return;
    visited.add(nodeId);
    const node = tree.nodes.find(n => n.id === nodeId);
    if (node) affectedNodes.push({ id: node.id, type: node.type, file_path: node.file_path, depth });
    // Find edges where this node is the target (dependents)
    const dependentEdges = tree.edges.filter(e => e.to === nodeId);
    for (const edge of dependentEdges) {
      traverseDownstream(edge.from, depth + 1);
    }
  }

  // Start traversal from all nodes (modify could affect any part)
  for (const node of tree.nodes) {
    if (!visited.has(node.id)) {
      traverseDownstream(node.id, 0);
    }
  }

  const result = {
    success: true,
    area: slug,
    description: desc,
    findings_mode: false,
    blast_radius: blast,
    needs_full_plan: blast.needs_full_plan,
    dispatch: blast.needs_full_plan ? 'plan' : 'quick',
    affected_nodes: affectedNodes,
    affected_count: affectedNodes.length
  };

  // Per D-06: plans dir for full plan mode
  if (blast.needs_full_plan) {
    const planDir = path.join(areaDir(cwd, slug), 'plans');
    fs.mkdirSync(planDir, { recursive: true });
    result.plan_dir = path.relative(cwd, planDir);
  }

  // Per D-03: modify uses summary context
  const byType = {};
  for (const n of tree.nodes) { byType[n.type] = (byType[n.type] || 0) + 1; }
  result.context_summary = {
    nodes_by_type: byType,
    edges_count: tree.edges.length,
    total_nodes: tree.nodes.length
  };

  // Record history per OPS-09
  appendHistory(cwd, slug, {
    op: 'modify',
    summary: desc || 'Modification initiated',
    outcome: 'success'
  });

  // Post-op tree refresh per D-12
  refreshTree(cwd, slug);

  output(result, raw);
}

// ─── OPS Governance: Status + Spec ──────────────────────────────────────────

/**
 * Compute health status for a single OPS area.
 * Returns object with all D-02 fields including health scoring per D-05.
 */
function computeAreaStatus(cwd, entry) {
  const slug = entry.slug;
  const tree = readTreeJson(cwd, slug);
  const specsPath = path.join(areaDir(cwd, slug), 'specs.md');
  const backlogPath = path.join(areaDir(cwd, slug), 'backlog.json');
  const historyPath = path.join(areaDir(cwd, slug), 'history.json');

  // Read specs
  const specsExist = fs.existsSync(specsPath);
  let specRulesCount = 0;
  if (specsExist) {
    const content = fs.readFileSync(specsPath, 'utf-8');
    specRulesCount = (content.match(/^- .+/gm) || []).length;
  }

  // Read backlog
  let backlogItems = [];
  if (fs.existsSync(backlogPath)) {
    try { backlogItems = JSON.parse(fs.readFileSync(backlogPath, 'utf-8')); } catch (_) { /* ignore */ }
  }
  const pending = backlogItems.filter(i => i.status === 'pending');

  // Read history
  let history = [];
  if (fs.existsSync(historyPath)) {
    try { history = JSON.parse(fs.readFileSync(historyPath, 'utf-8')); } catch (_) { /* ignore */ }
  }
  const lastOp = history.length > 0 ? history[history.length - 1] : null;
  const daysSinceLastOp = lastOp
    ? Math.floor((Date.now() - new Date(lastOp.timestamp).getTime()) / 86400000)
    : null;

  // Read findings
  const findingsData = readFindings(cwd, slug);
  const allFindings = findingsData.findings || [];
  const findingsTotal = allFindings.length;
  const findingsPending = allFindings.filter(f => f.status === 'pending').length;
  const findingsFixed = allFindings.filter(f => f.status === 'fixed').length;
  const findingsBySeverity = {};
  for (const f of allFindings) {
    const sev = f.severity || 'unknown';
    findingsBySeverity[sev] = (findingsBySeverity[sev] || 0) + 1;
  }

  // Health scoring per D-05
  const flags = [];
  if (!specsExist) flags.push('no_specs');
  if (daysSinceLastOp !== null && daysSinceLastOp > 30) flags.push('stale');
  if (pending.length > 10) flags.push('backlog_overflow');
  if (allFindings.some(f => f.status === 'pending' && f.severity === 'critical')) flags.push('critical_findings');
  const health = flags.length >= 2 ? 'red' : flags.length === 1 ? 'yellow' : 'green';

  return {
    slug,
    name: entry.name,
    nodes_count: tree ? tree.nodes.length : 0,
    edges_count: tree ? tree.edges.length : 0,
    specs_defined: specsExist,
    spec_rules_count: specRulesCount,
    backlog_items_count: pending.length,
    backlog_by_priority: {
      high: pending.filter(i => i.priority === 'high').length,
      medium: pending.filter(i => i.priority === 'medium').length,
      low: pending.filter(i => i.priority === 'low').length
    },
    last_operation: lastOp,
    days_since_last_op: daysSinceLastOp,
    tree_last_scanned: entry.last_scanned || null,
    findings_total: findingsTotal,
    findings_pending: findingsPending,
    findings_fixed: findingsFixed,
    findings_by_severity: findingsBySeverity,
    health,
    health_flags: flags
  };
}

/**
 * Show health status of OPS areas.
 * Without area: returns summary for all registered areas.
 * With area: returns full detail for that specific area.
 */
function cmdOpsStatus(cwd, area, raw) {
  const registry = readRegistry(cwd);

  if (!area) {
    // All-areas summary per D-04
    const areas = (registry.areas || []).map(a => computeAreaStatus(cwd, a));
    output({ areas }, raw);
    return;
  }

  const slug = slugify(area);
  const entry = (registry.areas || []).find(a => a.slug === slug);
  if (!entry) { error('Area not found: ' + slug); return; }

  const detail = computeAreaStatus(cwd, entry);
  output(detail, raw);
}

/**
 * Manage specs.md for an OPS area.
 * Subcommands: show, edit, add <rule>
 */
function cmdOpsSpec(cwd, area, args, raw) {
  if (!area) { error('Usage: gsd-tools ops spec <area> <show|edit|add> [rule]'); return; }

  const slug = slugify(area);
  const registry = readRegistry(cwd);
  const entry = (registry.areas || []).find(a => a.slug === slug);
  if (!entry) { error('Area not found: ' + slug); return; }

  ensureAreaDir(cwd, slug);
  const specsPath = path.join(areaDir(cwd, slug), 'specs.md');
  const subcommand = args[0];

  if (subcommand === 'show') {
    if (!fs.existsSync(specsPath)) {
      output({ found: false, message: 'No specs.md for area ' + slug + '. Run: gsd-tools ops spec ' + slug + ' edit' }, raw);
      return;
    }
    const content = fs.readFileSync(specsPath, 'utf-8');
    output({ found: true, area: slug, content }, raw);
    return;
  }

  if (subcommand === 'edit') {
    const existed = fs.existsSync(specsPath);
    if (!existed) {
      fs.writeFileSync(specsPath, SPECS_TEMPLATE(entry.name), 'utf-8');
    }
    output({ created: !existed, area: slug, path: path.relative(cwd, specsPath) }, raw);
    return;
  }

  if (subcommand === 'add') {
    const rule = args.slice(1).join(' ').trim();
    if (!rule) { error('Usage: gsd-tools ops spec <area> add <rule text>'); return; }

    // Ensure specs.md exists
    if (!fs.existsSync(specsPath)) {
      fs.writeFileSync(specsPath, SPECS_TEMPLATE(entry.name), 'utf-8');
    }

    let content = fs.readFileSync(specsPath, 'utf-8');
    content = content.trimEnd() + '\n- ' + rule + '\n';
    fs.writeFileSync(specsPath, content, 'utf-8');
    output({ success: true, area: slug, rule_added: rule, path: path.relative(cwd, specsPath) }, raw);
    return;
  }

  error('Unknown spec subcommand: ' + subcommand + '. Available: show, edit, add');
}

// ─── OPS Governance: Backlog ────────────────────────────────────────────────

function readBacklog(cwd, slug) {
  const backlogPath = path.join(areaDir(cwd, slug), 'backlog.json');
  if (!fs.existsSync(backlogPath)) return [];
  try { return JSON.parse(fs.readFileSync(backlogPath, 'utf-8')); } catch (_) { return []; }
}

function writeBacklog(cwd, slug, items) {
  ensureAreaDir(cwd, slug);
  const backlogPath = path.join(areaDir(cwd, slug), 'backlog.json');
  fs.writeFileSync(backlogPath, JSON.stringify(items, null, 2), 'utf-8');
}

/**
 * Manage per-area backlog: list, add, prioritize, promote, done.
 */
function cmdOpsBacklog(cwd, area, args, raw) {
  if (!area) { error('Usage: gsd-tools ops backlog <area> <list|add|prioritize|promote|done> [args]'); return; }

  const slug = slugify(area);
  const registry = readRegistry(cwd);
  const entry = (registry.areas || []).find(a => a.slug === slug);
  if (!entry) { error('Area not found: ' + slug); return; }

  const subcommand = args[0];

  if (subcommand === 'list') {
    const items = readBacklog(cwd, slug);
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    const visible = items
      .filter(i => i.status !== 'done')
      .sort((a, b) => {
        const pd = (priorityOrder[a.priority] || 1) - (priorityOrder[b.priority] || 1);
        if (pd !== 0) return pd;
        return new Date(a.created_at) - new Date(b.created_at);
      });
    output({ area: slug, items: visible }, raw);
    return;
  }

  if (subcommand === 'add') {
    const title = args.slice(1).join(' ').trim();
    if (!title) { error('Usage: gsd-tools ops backlog <area> add <title>'); return; }
    const items = readBacklog(cwd, slug);
    const nextId = Math.max(0, ...items.map(i => i.id)) + 1;
    const newItem = {
      id: nextId,
      title,
      description: null,
      priority: 'medium',
      status: 'pending',
      created_at: new Date().toISOString(),
      promoted_to: null
    };
    items.push(newItem);
    writeBacklog(cwd, slug, items);
    output({ success: true, area: slug, item: newItem }, raw);
    return;
  }

  if (subcommand === 'prioritize') {
    const id = parseInt(args[1], 10);
    const priority = args[2];
    if (isNaN(id) || !priority) { error('Usage: gsd-tools ops backlog <area> prioritize <id> <high|medium|low>'); return; }
    if (!['high', 'medium', 'low'].includes(priority)) { error('Priority must be: high, medium, or low'); return; }
    const items = readBacklog(cwd, slug);
    const item = items.find(i => i.id === id);
    if (!item) { error('Item not found: ' + id); return; }
    item.priority = priority;
    writeBacklog(cwd, slug, items);
    output({ success: true, area: slug, item }, raw);
    return;
  }

  if (subcommand === 'promote') {
    const id = parseInt(args[1], 10);
    if (isNaN(id)) { error('Usage: gsd-tools ops backlog <area> promote <id>'); return; }
    const items = readBacklog(cwd, slug);
    const item = items.find(i => i.id === id);
    if (!item) { error('Item not found: ' + id); return; }
    item.status = 'promoted';
    writeBacklog(cwd, slug, items);
    const tree = readTreeJson(cwd, slug);
    const context = {
      area_name: entry.name,
      item_title: item.title,
      item_description: item.description,
      tree_summary: tree
        ? { nodes_count: tree.nodes.length, edges_count: tree.edges.length }
        : null,
      next_steps: [
        'Use /gsd:quick for small self-contained changes',
        'Use /ops:feature for larger features requiring a full plan',
        'Use /ops:modify to analyse impact before changing existing behavior'
      ]
    };
    output({ success: true, area: slug, item, context }, raw);
    return;
  }

  if (subcommand === 'done') {
    const id = parseInt(args[1], 10);
    if (isNaN(id)) { error('Usage: gsd-tools ops backlog <area> done <id>'); return; }
    const items = readBacklog(cwd, slug);
    const item = items.find(i => i.id === id);
    if (!item) { error('Item not found: ' + id); return; }
    item.status = 'done';
    writeBacklog(cwd, slug, items);
    output({ success: true, area: slug, item }, raw);
    return;
  }

  error('Unknown backlog subcommand: ' + subcommand + '. Available: list, add, prioritize, promote, done');
}

// ─── OPS Governance: Findings ─────────────────────────────────────────────

function readFindings(cwd, slug) {
  const findingsPath = path.join(areaDir(cwd, slug), 'findings.json');
  if (!fs.existsSync(findingsPath)) return { domain: slug, findings: [] };
  try { return JSON.parse(fs.readFileSync(findingsPath, 'utf-8')); } catch (_) { return { domain: slug, findings: [] }; }
}

function writeFindings(cwd, slug, data) {
  ensureAreaDir(cwd, slug);
  const findingsPath = path.join(areaDir(cwd, slug), 'findings.json');
  fs.writeFileSync(findingsPath, JSON.stringify(data, null, 2), 'utf-8');
}

function nextFindingId(slug, findings) {
  const prefix = slug.toUpperCase();
  let max = 0;
  for (const f of findings) {
    const match = f.id && f.id.match(/-(\d+)$/);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > max) max = num;
    }
  }
  const next = max + 1;
  return prefix + '-' + String(next).padStart(3, '0');
}

/**
 * Parse a finding range like "PRAZOS-001..003" into an array of IDs.
 */
function parseFindingRange(rangeStr) {
  const match = rangeStr.match(/^([A-Z0-9_]+-?)(\d+)\.\.(\d+)$/);
  if (!match) return null;
  const prefix = match[1];
  const start = parseInt(match[2], 10);
  const end = parseInt(match[3], 10);
  const padLen = match[2].length;
  const ids = [];
  for (let i = start; i <= end; i++) {
    ids.push(prefix + String(i).padStart(padLen, '0'));
  }
  return ids;
}

/**
 * Parse --key value pairs from args array, converting kebab-case keys to snake_case.
 */
function parseFindingArgs(args) {
  const result = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--') && args[i] !== '--raw' && args[i] !== '--all-pending') {
      const key = args[i].slice(2).replace(/-/g, '_');
      const val = args[i + 1];
      if (val !== undefined && !val.startsWith('--')) {
        result[key] = val;
        i++;
      }
    }
  }
  return result;
}

/**
 * Manage per-area findings: list, add, update.
 */
function cmdOpsFindings(cwd, area, args, raw) {
  if (!area) { error('Usage: gsd-tools ops findings <area> <list|add|update> [args]'); return; }

  const slug = slugify(area);
  const registry = readRegistry(cwd);
  const entry = (registry.areas || []).find(a => a.slug === slug);
  if (!entry) { error('Area not found: ' + slug); return; }

  const subcommand = args[0];

  if (subcommand === 'list') {
    const data = readFindings(cwd, slug);
    const parsedArgs = parseFindingArgs(args.slice(1));
    let items = data.findings;
    if (parsedArgs.status) {
      items = items.filter(f => f.status === parsedArgs.status);
    }
    output({ area: slug, findings: items }, raw);
    return;
  }

  if (subcommand === 'add') {
    const parsedArgs = parseFindingArgs(args.slice(1));
    if (!parsedArgs.title) { error('Usage: gsd-tools ops findings <area> add --title <title> [--severity ...] [--category ...]'); return; }
    const data = readFindings(cwd, slug);
    const id = nextFindingId(slug, data.findings);
    const finding = {
      id,
      status: 'pending',
      severity: parsedArgs.severity || 'minor',
      category: parsedArgs.category || null,
      title: parsedArgs.title,
      description: parsedArgs.description || null,
      node_id: parsedArgs.node_id || null,
      file: parsedArgs.file || null,
      lines: [],
      spec_ref: parsedArgs.spec_ref || null,
      created: new Date().toISOString(),
      created_by: parsedArgs.created_by || 'manual',
      resolved: null,
      resolved_by: null
    };
    data.findings.push(finding);
    writeFindings(cwd, slug, data);
    appendHistory(cwd, slug, { op: 'finding-add', id: finding.id, title: finding.title, ts: finding.created });
    output({ success: true, area: slug, finding }, raw);
    return;
  }

  if (subcommand === 'update') {
    const data = readFindings(cwd, slug);
    const targetArg = args[1];
    let targetIds = [];
    let extraArgsStart = 2;

    if (targetArg === '--all-pending') {
      targetIds = data.findings.filter(f => f.status === 'pending').map(f => f.id);
    } else {
      const range = parseFindingRange(targetArg);
      if (range) {
        targetIds = range;
      } else {
        targetIds = [targetArg];
      }
    }

    const parsedArgs = parseFindingArgs(args.slice(extraArgsStart));

    if (targetIds.length === 0) { error('No findings matched the target'); return; }

    const updated = [];
    const now = new Date().toISOString();
    for (const id of targetIds) {
      const finding = data.findings.find(f => f.id === id);
      if (!finding) continue;
      if (parsedArgs.status) {
        finding.status = parsedArgs.status;
        if (parsedArgs.status === 'resolved') {
          finding.resolved = now;
          finding.resolved_by = parsedArgs.resolved_by || 'manual';
        }
      }
      if (parsedArgs.resolved_by) finding.resolved_by = parsedArgs.resolved_by;
      updated.push(finding);
    }

    writeFindings(cwd, slug, data);
    appendHistory(cwd, slug, { op: 'finding-update', ids: updated.map(f => f.id), status: parsedArgs.status, ts: now });
    output({ success: true, area: slug, updated }, raw);
    return;
  }

  error('Unknown findings subcommand: ' + subcommand + '. Available: list, add, update');
}

// ─── Tree Query — Filtered by Intent ───────────────────────────────────────

const CARD_FIELDS = ['id', 'type', 'file_path', 'name', 'summary', 'uses', 'used_by'];

const INTENT_FILTERS = {
  visual: {
    fields: ['css_classes', 'props', 'emits', 'slots', 'knowledge', 'specs_applicable'],
    follow_types: ['component', 'style', 'view']
  },
  data: {
    fields: ['endpoints_called', 'query', 'indexes', 'columns', 'props', 'knowledge'],
    follow_types: ['endpoint', 'service', 'model', 'table', 'component']
  },
  performance: {
    fields: ['endpoints_called', 'query', 'indexes', 'knowledge'],
    follow_types: ['endpoint', 'service', 'model', 'table']
  },
  security: {
    fields: ['endpoints_called', 'knowledge'],
    follow_types: ['route', 'endpoint', 'service']
  },
  behavior: {
    fields: ['props', 'emits', 'slots', 'endpoints_called', 'knowledge'],
    follow_types: ['component', 'composable', 'service']
  }
};

/**
 * Filter a node to only include card fields + intent-specific fields.
 * No intent or 'card' → card fields only.
 */
function filterNodeByIntent(node, intent) {
  const result = {};
  for (const key of CARD_FIELDS) {
    if (node[key] !== undefined) result[key] = node[key];
  }
  if (intent && intent !== 'card' && INTENT_FILTERS[intent]) {
    for (const key of INTENT_FILTERS[intent].fields) {
      if (node[key] !== undefined) result[key] = node[key];
    }
  }
  return result;
}

/**
 * Walk outgoing edges from startNodeId, following only nodes whose type
 * is in the intent's follow_types. Returns collected node IDs and edges.
 * Max depth default 3.
 */
function followEdgesForIntent(tree, startNodeId, intent, maxDepth) {
  if (maxDepth === undefined) maxDepth = 3;
  const filter = INTENT_FILTERS[intent];
  if (!filter) return { nodeIds: [startNodeId], edgesFollowed: [] };

  const followTypes = new Set(filter.follow_types);
  const visited = new Set([startNodeId]);
  const queue = [{ id: startNodeId, depth: 0 }];
  const edgesFollowed = [];

  while (queue.length > 0) {
    const { id, depth } = queue.shift();
    if (depth >= maxDepth) continue;

    for (const edge of tree.edges) {
      if (edge.from !== id) continue;
      if (visited.has(edge.to)) continue;

      const targetNode = tree.nodes.find(n => n.id === edge.to);
      if (!targetNode) continue;
      if (!followTypes.has(targetNode.type)) continue;

      visited.add(edge.to);
      edgesFollowed.push(edge);
      queue.push({ id: edge.to, depth: depth + 1 });
    }
  }

  return { nodeIds: Array.from(visited), edgesFollowed };
}

/**
 * Intent-filtered tree query with fast bail.
 */
function cmdOpsTreeQuery(cwd, area, args, raw) {
  if (!area) { error('Usage: gsd-tools ops tree-query <area> --node <id> [--intent <category>] [--require-field <field>]'); return; }

  const slug = slugify(area);
  const registry = readRegistry(cwd);
  const entry = (registry.areas || []).find(a => a.slug === slug);
  if (!entry) { error('Area not found: ' + slug); return; }

  const tree = readTreeJson(cwd, slug);
  if (!tree) { error('No tree.json for area: ' + slug); return; }

  // Parse args reusing parseFindingArgs (--key value parser)
  const parsed = parseFindingArgs(args);
  const nodeId = parsed.node;
  const intent = parsed.intent;
  const requireField = parsed.require_field;

  if (!nodeId) { error('Missing --node argument'); return; }

  // Fast bail: node not found
  const startNode = tree.nodes.find(n => n.id === nodeId);
  if (!startNode) {
    output({ success: true, bail: true, missing: 'node', node_id: nodeId, action: 'Run ops map to refresh the tree, or check the node ID' }, raw);
    return;
  }

  // Fast bail: required field undefined (but empty array is OK)
  if (requireField && startNode[requireField] === undefined) {
    output({ success: true, bail: true, missing: 'field', node_id: nodeId, field: requireField, action: 'Add ' + requireField + ' to the node via ops modify or tree update' }, raw);
    return;
  }

  // Collect nodes
  let collectedNodeIds;
  let edgesFollowed = [];

  if (intent && INTENT_FILTERS[intent]) {
    const result = followEdgesForIntent(tree, nodeId, intent);
    collectedNodeIds = result.nodeIds;
    edgesFollowed = result.edgesFollowed;
  } else {
    collectedNodeIds = [nodeId];
  }

  // Filter each node by intent
  const nodes = collectedNodeIds
    .map(id => tree.nodes.find(n => n.id === id))
    .filter(Boolean)
    .map(n => filterNodeByIntent(n, intent));

  output({ success: true, area: slug, intent: intent || null, nodes, edges_followed: edgesFollowed.length }, raw);
}

// ─── Tree Update — Plant Knowledge ─────────────────────────────────────────

/**
 * ops tree-update — Plant a value on a tree node field.
 *
 * Supports dotted field paths (e.g. knowledge.framework).
 * Auto-updates knowledge.last_investigated and knowledge.investigation_count.
 */
function cmdOpsTreeUpdate(cwd, area, nodeId, fieldPath, valueStr, raw) {
  if (!area) { error('Usage: ops tree-update <area> <nodeId> <fieldPath> <value>'); return; }
  if (!nodeId) { error('Missing nodeId'); return; }
  if (!fieldPath) { error('Missing fieldPath'); return; }
  if (valueStr === undefined || valueStr === null) { error('Missing value'); return; }

  const slug = slugify(area);
  const registry = readRegistry(cwd);
  const areaEntry = registry.areas.find(a => a.slug === slug);
  if (!areaEntry) { error('Area not found: ' + area); return; }

  const tree = readTreeJson(cwd, slug);
  if (!tree) { error('No tree.json for area: ' + slug + '. Run /ops:map first.'); return; }

  const node = tree.nodes.find(n => n.id === nodeId);
  if (!node) { error('Node not found in tree: ' + nodeId); return; }

  // Parse value: try JSON, fall back to plain string
  let value;
  try {
    value = JSON.parse(valueStr);
  } catch {
    value = valueStr;
  }

  // Set value at field path (supports dotted paths)
  const parts = fieldPath.split('.');
  if (parts.length === 1) {
    node[fieldPath] = value;
  } else {
    let target = node;
    for (let i = 0; i < parts.length - 1; i++) {
      if (target[parts[i]] === undefined || target[parts[i]] === null || typeof target[parts[i]] !== 'object') {
        target[parts[i]] = {};
      }
      target = target[parts[i]];
    }
    target[parts[parts.length - 1]] = value;
  }

  // Auto-update investigation metadata
  if (!node.knowledge || typeof node.knowledge !== 'object') {
    node.knowledge = {};
  }
  node.knowledge.last_investigated = new Date().toISOString().slice(0, 10);
  node.knowledge.investigation_count = (node.knowledge.investigation_count || 0) + 1;

  // Write updated tree
  writeTreeJson(cwd, slug, tree);

  // Append history
  appendHistory(cwd, slug, { op: 'tree-update', summary: 'Planted ' + fieldPath + ' on ' + nodeId });

  output({ success: true, node_id: nodeId, field: fieldPath, node }, raw);
}

module.exports = {
  cmdOpsInit, cmdOpsMap, cmdOpsAdd, cmdOpsList, cmdOpsGet,
  cmdOpsInvestigate, cmdOpsFeature, cmdOpsModify, cmdOpsDebug, cmdOpsSummary,
  cmdOpsStatus, cmdOpsSpec, cmdOpsBacklog, cmdOpsFindings,
  cmdOpsTreeQuery, INTENT_FILTERS, CARD_FIELDS, filterNodeByIntent,
  cmdOpsTreeUpdate,
  readFindings, writeFindings, nextFindingId, parseFindingRange,
  computeAreaStatus,
  appendHistory, computeBlastRadius, refreshTree
};
