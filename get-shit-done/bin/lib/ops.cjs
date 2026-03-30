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
 * cmdOpsInvestigate — Load full tree context for autonomous investigation (OPS-05, D-03, D-07).
 * Outputs JSON with full tree for agent consumption. Records history per OPS-09.
 */
function cmdOpsInvestigate(cwd, area, description, raw) {
  if (!area) { error('Usage: gsd-tools ops investigate <area> <description>'); return; }
  const slug = slugify(area);
  const registry = readRegistry(cwd);
  const entry = registry.areas.find(a => a.slug === slug);
  if (!entry) { error('Area not found: ' + slug); return; }

  const tree = readTreeJson(cwd, slug);
  if (!tree) { error('No tree.json for area: ' + slug + '. Run /ops:map first.'); return; }

  // Per D-03/D-07: investigate loads full tree for deep traversal
  const diagnosisPath = path.join(areaDir(cwd, slug), 'diagnosis.md');

  // Record history per OPS-09
  appendHistory(cwd, slug, {
    op: 'investigate',
    summary: description || 'Investigation initiated',
    outcome: 'success'
  });

  // Post-op tree refresh per D-12
  refreshTree(cwd, slug);

  output({
    success: true,
    area: slug,
    description: description || '',
    tree_path: path.join('.planning/ops', slug, 'tree.json'),
    diagnosis_path: path.relative(cwd, diagnosisPath),
    context: {
      nodes: tree.nodes.length,
      edges: tree.edges.length,
      tree: tree  // Full tree for agent consumption per D-03
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
  if (!area) { error('Usage: gsd-tools ops modify <area> <description>'); return; }
  const slug = slugify(area);
  const registry = readRegistry(cwd);
  const entry = registry.areas.find(a => a.slug === slug);
  if (!entry) { error('Area not found: ' + slug); return; }

  const tree = readTreeJson(cwd, slug);
  if (!tree) { error('No tree.json for area: ' + slug + '. Run /ops:map first.'); return; }

  // Per D-04: compute blast radius for dispatch
  const blast = computeBlastRadius(tree);

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
    description: description || '',
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
    summary: description || 'Modification initiated',
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

  // Health scoring per D-05
  const flags = [];
  if (!specsExist) flags.push('no_specs');
  if (daysSinceLastOp !== null && daysSinceLastOp > 30) flags.push('stale');
  if (pending.length > 10) flags.push('backlog_overflow');
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

module.exports = {
  cmdOpsInit, cmdOpsMap, cmdOpsAdd, cmdOpsList, cmdOpsGet,
  cmdOpsInvestigate, cmdOpsFeature, cmdOpsModify, cmdOpsDebug, cmdOpsSummary,
  cmdOpsStatus, cmdOpsSpec,
  computeAreaStatus,
  appendHistory, computeBlastRadius, refreshTree
};
