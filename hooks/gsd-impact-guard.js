#!/usr/bin/env node
// gsd-hook-version: {{GSD_VERSION}}
// GSD Impact Analysis Guard — PreToolUse hook
// Advisory safety net: reminds executor to consult Function Map before editing code files.
// SOFT guard — advises, never blocks. Per D-01 from 02-CONTEXT.md.

const fs = require('fs');
const path = require('path');

const CODE_EXTENSIONS = [
  '.ts', '.js', '.cjs', '.mjs', '.tsx', '.jsx',
  '.vue', '.php', '.py', '.rb', '.go', '.rs', '.java'
];

const CONFIG_PATTERNS = [/\.md$/, /\.json$/, /\.yaml$/, /\.yml$/, /\.toml$/];

let input = '';
const stdinTimeout = setTimeout(() => process.exit(0), 3000);
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => input += chunk);
process.stdin.on('end', () => {
  clearTimeout(stdinTimeout);
  try {
    const data = JSON.parse(input);
    const toolName = data.tool_name;

    // Only guard Write and Edit tool calls
    if (toolName !== 'Write' && toolName !== 'Edit') {
      process.exit(0);
    }

    const filePath = data.tool_input?.file_path || data.tool_input?.path || '';

    // Allow edits to .planning/ files (GSD state management)
    if (filePath.includes('.planning/') || filePath.includes('.planning\\')) {
      process.exit(0);
    }

    // Allow edits to markdown/config files
    if (CONFIG_PATTERNS.some(p => p.test(filePath))) {
      process.exit(0);
    }

    // Only trigger for code file extensions
    const ext = path.extname(filePath).toLowerCase();
    if (!CODE_EXTENSIONS.includes(ext)) {
      process.exit(0);
    }

    // Check if impact analysis is explicitly disabled in config
    const cwd = data.cwd || process.cwd();
    const configPath = path.join(cwd, '.planning', 'config.json');
    if (fs.existsSync(configPath)) {
      try {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        if (config.impact_analysis?.enabled === false) {
          process.exit(0);
        }
      } catch (e) {
        // Config parse error — proceed with advisory
      }
    }

    // Check if Function Map exists — no map means no impact analysis possible
    const fmapPath = path.join(cwd, '.planning', 'function-map.json');
    if (!fs.existsSync(fmapPath)) {
      process.exit(0);
    }

    // If we get here: code file edit, function map exists, impact analysis not disabled.
    // Inject advisory reminder.
    const output = {
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        additionalContext:
          `IMPACT ANALYSIS REMINDER: You are about to edit ${path.basename(filePath)}. ` +
          'Before modifying any function, consult the Function Map: ' +
          '`node gsd-tools.cjs fmap impact "<file>::<Class>::<method>"` ' +
          'to identify callers and capture a pre-edit snapshot. ' +
          'If you already ran fmap impact for this function, proceed. ' +
          'If this file has no functions in the map, proceed normally.'
      }
    };

    process.stdout.write(JSON.stringify(output));
  } catch (e) {
    // Silent fail — never block tool execution
    process.exit(0);
  }
});
