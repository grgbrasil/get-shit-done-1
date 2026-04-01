#!/usr/bin/env node
// gsd-hook-version: {{GSD_VERSION}}
// GSD Workflow Guard — PreToolUse hook
// Detects when Claude attempts file edits outside a GSD workflow context
// (no active /gsd- skill or Task subagent) and injects an advisory warning.
//
// This is a SOFT guard — it advises, not blocks. The edit still proceeds.
// The warning nudges Claude to use /gsd-quick or /gsd-fast instead of
// making direct edits that bypass state tracking.
//
// Enable via config: hooks.workflow_guard: true (default: false)
// Only triggers on Write/Edit tool calls to non-.planning/ files.

const fs = require('fs');
const path = require('path');

// GUARD-04: Destructive command patterns (source: Claude Code destructiveCommandWarning.ts)
const DESTRUCTIVE_PATTERNS = [
  { pattern: /git\s+reset\s+--hard/,        warn: 'git reset --hard descarta mudancas nao commitadas', alt: 'git stash' },
  { pattern: /git\s+push\s+--force(?!-with)/, warn: 'git push --force pode sobrescrever historico remoto', alt: 'git push --force-with-lease' },
  { pattern: /git\s+push\s+-f\b/,           warn: 'git push -f pode sobrescrever historico remoto', alt: 'git push --force-with-lease' },
  { pattern: /git\s+clean\s+-[a-z]*f/,       warn: 'git clean -f apaga arquivos untracked permanentemente', alt: null },
  { pattern: /git\s+checkout\s+\./,           warn: 'git checkout . descarta todas as mudancas no working tree', alt: 'git stash' },
  { pattern: /git\s+restore\s+\./,            warn: 'git restore . descarta todas as mudancas no working tree', alt: 'git stash' },
  { pattern: /git\s+stash\s+(drop|clear)/,    warn: 'git stash drop/clear remove stashes permanentemente', alt: null },
  { pattern: /git\s+branch\s+-D\b/,           warn: 'git branch -D forca exclusao de branch', alt: 'git branch -d (safe delete)' },
  { pattern: /--no-verify/,                    warn: '--no-verify pula safety hooks', alt: 'Corrigir o hook que esta falhando' },
  { pattern: /git\s+commit\s+.*--amend/,       warn: 'git commit --amend reescreve o ultimo commit', alt: 'Criar novo commit' },
  { pattern: /rm\s+-[a-z]*r[a-z]*f|rm\s+-[a-z]*f[a-z]*r/,  warn: 'rm -rf apaga recursivamente sem confirmacao', alt: null },
  { pattern: /DROP\s+(TABLE|DATABASE)/i,        warn: 'DROP TABLE/DATABASE e irreversivel', alt: null },
  { pattern: /TRUNCATE\s+/i,                    warn: 'TRUNCATE remove todos os dados da tabela', alt: null },
  { pattern: /DELETE\s+FROM\s+\w+\s*(?:;|$)/i,  warn: 'DELETE FROM sem WHERE apaga todos os registros', alt: 'Adicionar clausula WHERE' },
];

let input = '';
const stdinTimeout = setTimeout(() => process.exit(0), 3000);
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => input += chunk);
process.stdin.on('end', () => {
  clearTimeout(stdinTimeout);
  try {
    const data = JSON.parse(input);
    const toolName = data.tool_name;

    // GUARD-04: Destructive command detection for Bash
    if (toolName === 'Bash') {
      const command = data.tool_input?.command || '';
      const matches = DESTRUCTIVE_PATTERNS.filter(p => p.pattern.test(command));
      if (matches.length === 0) {
        process.exit(0);
      }
      const warnings = matches.map(m =>
        m.alt ? `${m.warn}. Alternativa: ${m.alt}` : m.warn
      ).join('; ');
      const output = {
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          additionalContext: `DESTRUCTIVE COMMAND WARNING: ${warnings}. Se o plano autoriza explicitamente este comando, prossiga. Caso contrario, use a alternativa segura ou peca autorizacao ao usuario.`
        }
      };
      process.stdout.write(JSON.stringify(output));
      process.exit(0);
    }

    // Only guard Write and Edit tool calls
    if (toolName !== 'Write' && toolName !== 'Edit') {
      process.exit(0);
    }

    // Check if we're inside a GSD workflow (Task subagent or /gsd- skill)
    // Subagents have a session_id that differs from the parent
    // and typically have a description field set by the orchestrator
    if (data.tool_input?.is_subagent || data.session_type === 'task') {
      process.exit(0);
    }

    // Check the file being edited
    const filePath = data.tool_input?.file_path || data.tool_input?.path || '';

    // Allow edits to .planning/ files (GSD state management)
    if (filePath.includes('.planning/') || filePath.includes('.planning\\')) {
      process.exit(0);
    }

    // Allow edits to common config/docs files that don't need GSD tracking
    const allowedPatterns = [
      /\.gitignore$/,
      /\.env/,
      /CLAUDE\.md$/,
      /AGENTS\.md$/,
      /GEMINI\.md$/,
      /settings\.json$/,
    ];
    if (allowedPatterns.some(p => p.test(filePath))) {
      process.exit(0);
    }

    // Check if workflow guard is enabled
    const cwd = data.cwd || process.cwd();
    const configPath = path.join(cwd, '.planning', 'config.json');
    if (fs.existsSync(configPath)) {
      try {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        if (!config.hooks?.workflow_guard) {
          process.exit(0); // Guard disabled (default)
        }
      } catch (e) {
        process.exit(0);
      }
    } else {
      process.exit(0); // No GSD project — don't guard
    }

    // If we get here: GSD project, guard enabled, file edit outside .planning/,
    // not in a subagent context. Inject advisory warning.
    const output = {
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        additionalContext: `⚠️ WORKFLOW ADVISORY: You're editing ${path.basename(filePath)} directly without a GSD command. ` +
          'This edit will not be tracked in STATE.md or produce a SUMMARY.md. ' +
          'Consider using /gsd-fast for trivial fixes or /gsd-quick for larger changes ' +
          'to maintain project state tracking. ' +
          'If this is intentional (e.g., user explicitly asked for a direct edit), proceed normally.'
      }
    };

    process.stdout.write(JSON.stringify(output));
  } catch (e) {
    // Silent fail — never block tool execution
    process.exit(0);
  }
});
