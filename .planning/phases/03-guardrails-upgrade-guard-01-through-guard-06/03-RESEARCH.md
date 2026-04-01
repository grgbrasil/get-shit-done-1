# Phase 3: guardrails-upgrade (GUARD-01 through GUARD-06) - Research

**Researched:** 2026-04-01
**Domain:** CLAUDE.md guardrails + Claude Code PreToolUse hooks (CommonJS)
**Confidence:** HIGH

## Summary

This phase applies Claude Code-derived guardrails to the GSD system across two layers: prompt-level (CLAUDE.md global + agent prompts) and runtime-level (PreToolUse hooks). The research base is solid -- direct source code analysis of Claude Code's `prompts.ts`, `destructiveCommandWarning.ts`, `FileEditTool.ts`, and `compact/prompt.ts` already exists in `.planning/research/HOOKS-GUARDRAILS.md`.

The implementation is straightforward: GUARD-01/02/05/06 are primarily text additions to CLAUDE.md and agent prompts. GUARD-04/05 involve hook code changes (JavaScript CommonJS). All hooks follow the established advisory pattern (warn, never block). The main risk is hook registration -- currently `gsd-workflow-guard.js` is NOT registered by the installer and `gsd-impact-guard.js` is NOT in `build-hooks.js`'s copy list, so both need registration/build fixes.

**Primary recommendation:** Organize into 3 plans: (1) CLAUDE.md text guardrails (GUARD-01, 02, 05-text, 06-global), (2) Hook code changes (GUARD-04, GUARD-05-runtime), (3) Agent prompt updates (GUARD-01 reinforcement, GUARD-06 context_persistence). Plans 1 and 3 are independent; plan 2 depends on understanding hook architecture.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Expand CLAUDE.md global anti-false-claims with 4 specific prohibitions from Claude Code (bidirectional: no false positives AND no false negatives)
- **D-02:** Add reinforcement in executor and verifier agent prompts with short reminder pointing to global rules
- **D-03:** Placement: Global CLAUDE.md + agents -- defense in layers
- **D-04:** Add tool result preservation instruction in CLAUDE.md global
- **D-05:** Placement: Global CLAUDE.md only -- universal simple rule
- **D-06:** Focus on: file paths, error messages, code snippets, decisions taken
- **D-07:** Add destructive command detection in `gsd-workflow-guard.js` (PreToolUse hook for Bash)
- **D-08:** Advisory mode (warn, not block) -- consistent with v1.0 pattern
- **D-09:** Patterns: `git reset --hard`, `git push --force`, `git checkout .`, `rm -rf`, `DROP TABLE`, `--no-verify`, `--amend`, `branch -D`, `git clean -f`
- **D-10:** Emit warning via stderr with safe alternative suggestion when possible
- **D-11:** Explicit rule in CLAUDE.md global: "ALWAYS read file before editing"
- **D-12:** `gsd-impact-guard.js` tracks Read calls, emits advisory warning when Edit/Write without prior Read
- **D-13:** Placement: CLAUDE.md (prompt) + hook advisory (runtime) -- two layers, both advisory
- **D-14:** No file state tracking (diff) -- only verify Read preceded Edit
- **D-15:** General rule in CLAUDE.md global about what to preserve during compaction
- **D-16:** Add `<context_persistence>` in planner, researcher, debugger agents
- **D-17:** Do NOT add in short agents (checker, auditor, cataloger, synthesizer)
- **D-18:** Format follows SCOPE-06 pattern already in executor

### Claude's Discretion
- Exact text of CLAUDE.md instructions (follow CC tone, adapt to Gabriel's style)
- Order of implementation plans within the phase
- Whether GUARD-04 and GUARD-05 stay in separate hooks (they are currently separate: workflow-guard vs impact-guard)
- Exact regex patterns for destructive command detection

### Deferred Ideas (OUT OF SCOPE)
- **GUARD-03 (Anti-scope-creep):** Deferred -- may conflict with DRY principles in CLAUDE.md global
- **Verification agent adversarial (ADV-01):** Future phase
- **Bash security complete (23 categories):** GUARD-04 covers only destructive, not security
- **Hook blocking mode:** All decisions are advisory for now
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| GUARD-01 | Anti-false-claims in CLAUDE.md | D-01/D-02/D-03: Text from CC prompts.ts:~240. Bidirectional pattern. Target: global CLAUDE.md + executor/verifier agents |
| GUARD-02 | Tool result preservation | D-04/D-05/D-06: Text from CC prompts.ts:~841. Target: global CLAUDE.md only |
| GUARD-04 | Destructive command detection hook | D-07/D-08/D-09/D-10: Patterns from CC destructiveCommandWarning.ts. Target: gsd-workflow-guard.js expanded for Bash |
| GUARD-05 | Read-before-edit enforcement | D-11/D-12/D-13/D-14: Two-layer (CLAUDE.md text + gsd-impact-guard.js Read tracking). Advisory only |
| GUARD-06 | Context compaction instructions | D-15/D-16/D-17/D-18: CLAUDE.md global + `<context_persistence>` in 3 agents (planner, researcher, debugger) |
</phase_requirements>

## Architecture Patterns

### Current Hook Architecture

```
hooks/
  gsd-check-update.js      # SessionStart - checks for GSD updates
  gsd-context-monitor.js   # PostToolUse - context monitoring
  gsd-impact-guard.js      # PreToolUse (Write|Edit) - impact analysis advisory
  gsd-prompt-guard.js      # PreToolUse (Write|Edit) - prompt injection scan
  gsd-statusline.js        # StatusLine - session status display
  gsd-workflow-guard.js    # PreToolUse (Write|Edit) - workflow bypass advisory (NOT registered in installer)

scripts/build-hooks.js     # Copies hooks to hooks/dist/ for distribution
bin/install.js             # Registers hooks in ~/.claude/settings.json
```

### Hook Input Schema (PreToolUse)

All PreToolUse hooks receive JSON via stdin with this structure:

```javascript
{
  tool_name: "Write" | "Edit" | "Bash" | ...,
  tool_input: {
    file_path: "...",   // Write/Edit
    content: "...",     // Write
    command: "...",     // Bash
    new_string: "...",  // Edit
    ...
  },
  cwd: "/path/to/project",
  session_type: "task" | undefined
}
```

### Hook Output Schema (Advisory)

```javascript
{
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    additionalContext: "Warning message injected into conversation"
  }
}
```

### Pattern: Advisory Warning (established in v1.0)

Every hook follows this pattern:
1. Parse stdin JSON
2. Check if tool_name matches guard scope
3. Check bypass conditions (exit 0 to pass through)
4. Emit advisory via `process.stdout.write(JSON.stringify(output))`
5. On any error: `process.exit(0)` -- never block

### CRITICAL: Registration Gaps Found

| Hook | In build-hooks.js? | In installer? | In settings.json? |
|------|--------------------|--------------|--------------------|
| gsd-workflow-guard.js | YES (in HOOKS_TO_COPY) | NO | NO |
| gsd-impact-guard.js | NO | YES (lines 4568-4589) | YES (PreToolUse Write\|Edit) |
| gsd-prompt-guard.js | YES | YES | YES |

**Impact on GUARD-04:** `gsd-workflow-guard.js` is copied to dist but never registered. To add Bash destructive detection, it needs to be registered in the installer with matcher `Bash` (separate from the existing Write|Edit matchers).

**Impact on GUARD-05:** `gsd-impact-guard.js` is registered by installer but NOT in `build-hooks.js` HOOKS_TO_COPY. It needs to be added.

### Pattern: `<context_persistence>` (from SCOPE-06)

Existing template in `agents/gsd-executor.md` (lines 209-221):

```xml
<context_persistence>
**Write down critical findings before they decay.**

Tool results (Read, Bash, Grep, Glob outputs) may be cleared from context as execution progresses. Before moving to the next task:

1. **Extract key values** -- config paths, function signatures, API responses, error messages
2. **Write to plan notes** -- append to `.planning/phases/{phase-dir}/execution-notes.md` if findings are needed by later tasks
3. **Update STATE.md** -- use `state add-decision` for architectural discoveries that affect future phases

**Rule:** If you read a file and found critical information (a type signature, a config value, an API contract), write it into your current task's commit message or execution notes IMMEDIATELY. Do not assume you can re-read the file later -- context pressure may prevent it.

**Trigger:** After any Bash/Read call that returns data you will need 3+ tasks later, persist it now.
</context_persistence>
```

For GUARD-06, adapt this template for planner/researcher/debugger agents. Each needs context-specific variations (planner persists architectural decisions, researcher persists findings, debugger persists root cause analysis).

### CLAUDE.md Global Structure

Current sections in `/Users/gg/.claude/CLAUDE.md`:
1. Quem e Gabriel (profile)
2. Regras de Operacao SIJUR (subsections: Etica, Causa Raiz, Workaround, Diagnostico, Integridade, BD, Arquitetura, Permissoes, Proibicoes, Tools, Duvidas)
3. Architecture & Cross-Phase
4. GSD Workflow
5. Debugging & Verification

**Insertion points:**
- GUARD-01 (anti-false-claims): Expand "Etica" section -- it already has the 1-liner
- GUARD-02 (tool result preservation): New subsection after "Etica" or at end of "Regras de Operacao"
- GUARD-05 (read-before-edit): Expand "Integridade do Sistema" -- it already has related rules
- GUARD-06 (compaction): New section at end, or inside "Debugging & Verification"

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Destructive command detection regex | Custom parser | Simple regex array matching `data.tool_input.command` | CC uses simple string matching too, not AST parsing |
| Read tracking state | External persistence (file/DB) | In-memory Map in hook process | D-14 explicitly says no file state -- just check Read preceded Edit within the hook's stdin data |
| Hook registration | Manual settings.json editing | `bin/install.js` registration pattern | Installer already handles idempotent hook registration |

**Key insight on Read tracking (GUARD-05):** Each hook invocation is a fresh process -- there is NO persistent state between calls. The hook receives a single tool call via stdin and must decide based on that alone. To track "was this file read before being edited," the hook would need either: (a) an external state file, or (b) rely on the PostToolUse hook to log reads. Given D-14 ("no file state tracking"), the practical implementation is: emit the advisory on EVERY Write/Edit to code files, reminding to read first. The prompt-layer rule in CLAUDE.md does the actual behavioral enforcement.

**Alternative approach for GUARD-05 runtime:** Use a lightweight temp file (e.g., `/tmp/gsd-reads-${pid}.json`) to track Read calls across hook invocations within a session. A PostToolUse hook on Read would log the file path; the PreToolUse hook on Write/Edit would check it. This adds complexity but gives real enforcement. Decision is at Claude's discretion per CONTEXT.md.

## Common Pitfalls

### Pitfall 1: Hook Matcher Scope for GUARD-04
**What goes wrong:** Adding Bash detection to gsd-workflow-guard.js but leaving the PreToolUse matcher as `Write|Edit` -- the hook never fires for Bash calls.
**Why it happens:** The hook file handles the tool_name check internally, but the settings.json matcher determines which tools trigger the hook at all.
**How to avoid:** Register a SEPARATE PreToolUse entry with matcher `Bash` pointing to gsd-workflow-guard.js, or create a new hook specifically for Bash.
**Warning signs:** Hook code looks correct but never fires during Bash commands.

### Pitfall 2: gsd-impact-guard.js Missing from build-hooks.js
**What goes wrong:** Changes to gsd-impact-guard.js work locally but never ship to users because `scripts/build-hooks.js` doesn't copy it to dist.
**Why it happens:** The hook was registered in the installer but never added to HOOKS_TO_COPY.
**How to avoid:** Add `'gsd-impact-guard.js'` to the HOOKS_TO_COPY array in `scripts/build-hooks.js`.

### Pitfall 3: CLAUDE.md Bilingual Style
**What goes wrong:** Adding guardrail rules in English when the existing CLAUDE.md is primarily in Portuguese.
**Why it happens:** The Claude Code source material is in English.
**How to avoid:** Write rules in Portuguese (Gabriel's style), keeping only technical terms in English. Match the existing tone: direct, imperative, no fluff.

### Pitfall 4: Hook stdin Timeout
**What goes wrong:** Hook hangs waiting for stdin if the input is large or delayed.
**Why it happens:** All existing hooks have a `setTimeout(() => process.exit(0), 3000)` guard.
**How to avoid:** Keep the 3-second timeout pattern. For GUARD-04 (Bash command parsing), the regex matching is fast enough.

### Pitfall 5: Context Persistence Template Variance
**What goes wrong:** Copy-pasting the executor's `<context_persistence>` verbatim into planner/researcher/debugger without adapting the specific actions.
**Why it happens:** D-18 says "follow SCOPE-06 format" but each agent has different outputs to persist.
**How to avoid:** Keep the structure (XML tag, bolded trigger, numbered actions) but customize the actions:
- **Planner:** Persist architectural decisions, dependency chains, constraint discoveries
- **Researcher:** Persist source URLs, verified findings, confidence levels
- **Debugger:** Persist root cause hypotheses, reproduction steps, fix attempts

## Code Examples

### GUARD-04: Destructive Command Detection Pattern

```javascript
// Source: Claude Code destructiveCommandWarning.ts (adapted for GSD advisory pattern)
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

// In the hook's main logic, after parsing stdin:
if (toolName !== 'Bash') {
  process.exit(0);
}

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
    additionalContext: `DESTRUCTIVE COMMAND WARNING: ${warnings}. ` +
      'Se o plano autoriza explicitamente este comando, prossiga. ' +
      'Caso contrario, use a alternativa segura ou peca autorizacao ao usuario.'
  }
};
```

### GUARD-05: Read Tracking Advisory Pattern

```javascript
// Simple approach (D-14 compliant): advisory on every code file edit
// The prompt-layer rule in CLAUDE.md does the behavioral enforcement
if (toolName !== 'Write' && toolName !== 'Edit') {
  process.exit(0);
}

const filePath = data.tool_input?.file_path || '';
const ext = path.extname(filePath).toLowerCase();

// Only for code files (not config/docs)
if (!CODE_EXTENSIONS.includes(ext)) {
  process.exit(0);
}

// Check .planning/ bypass
if (filePath.includes('.planning/')) {
  process.exit(0);
}

const output = {
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    additionalContext:
      `READ-BEFORE-EDIT: Voce leu ${path.basename(filePath)} nesta sessao antes de editar? ` +
      'Se nao, use Read primeiro. Nunca edite baseado em memoria ou suposicoes sobre o conteudo atual.'
  }
};
```

### GUARD-01: Anti-False-Claims Text for CLAUDE.md

```markdown
## Etica
- Nunca afirme que fez algo que nao fez. Nunca afirme que resolveu se nao resolveu.
- Nunca diga "todos os testes passam" quando o output mostra falhas.
- Nunca suprima ou simplifique checks que falham para fabricar resultado verde.
- Nunca caracterize trabalho incompleto ou quebrado como concluido.
- Na direcao oposta: quando um check passou, diga claramente — nao faca hedge em resultados confirmados com disclaimers desnecessarios.
- Antes de reportar conclusao: rode o teste, execute o script, verifique o output. Se nao puder verificar, diga explicitamente em vez de assumir sucesso.
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single-line ethics in CLAUDE.md | Multi-line specific prohibitions (CC pattern) | This phase | Closes false-positive/negative gaps |
| No tool result preservation | Explicit instruction to write down findings | This phase | Prevents context decay data loss |
| No destructive cmd detection | Advisory hook on Bash PreToolUse | This phase | Runtime safety net for executors |
| CLAUDE.md only for read-before-edit | CLAUDE.md + hook advisory (two-layer) | This phase | Defense in depth per CC pattern |
| context_persistence in executor only | In 4 long-running agents | This phase | All long sessions preserve critical data |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.2 (main) / node:test (CJS tests) |
| Config file | `vitest.config.ts` (SDK) / direct `node --test` for CJS |
| Quick run command | `node --test tests/hook-validation.test.cjs` |
| Full suite command | `npm test` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| GUARD-01 | CLAUDE.md contains anti-false-claims text | manual inspection | N/A (text in CLAUDE.md) | N/A |
| GUARD-02 | CLAUDE.md contains tool result preservation | manual inspection | N/A (text in CLAUDE.md) | N/A |
| GUARD-04 | Destructive command patterns detected by hook | unit | `node --test tests/destructive-guard.test.cjs` | Wave 0 |
| GUARD-05 | Read-before-edit advisory fires on code file edits | unit | `node --test tests/read-before-edit-guard.test.cjs` | Wave 0 |
| GUARD-05 | CLAUDE.md contains read-before-edit rule | manual inspection | N/A | N/A |
| GUARD-06 | Agent prompts contain context_persistence blocks | unit (grep check) | `node --test tests/agent-context-persistence.test.cjs` | Wave 0 |
| GUARD-06 | CLAUDE.md contains compaction instructions | manual inspection | N/A | N/A |

### Sampling Rate
- **Per task commit:** `node --test tests/destructive-guard.test.cjs tests/read-before-edit-guard.test.cjs`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/destructive-guard.test.cjs` -- unit tests for GUARD-04 regex patterns against known destructive commands
- [ ] `tests/read-before-edit-guard.test.cjs` -- unit tests for GUARD-05 hook advisory trigger conditions
- [ ] `tests/agent-context-persistence.test.cjs` -- verify planner/researcher/debugger agents contain `<context_persistence>` blocks

## Open Questions

1. **GUARD-05 Read Tracking: Advisory-only vs Temp-file State**
   - What we know: Each hook invocation is a fresh process with no shared state. D-14 says "no file state tracking (diff)" but doesn't explicitly ban session-level Read tracking.
   - What's unclear: Whether "no file state tracking" means no state at all, or just no content-diffing. A temp-file approach would give real enforcement but adds complexity.
   - Recommendation: Start with advisory-only (always remind on code file edits). The CLAUDE.md prompt rule provides behavioral enforcement. Can upgrade to stateful tracking later if needed.

2. **gsd-workflow-guard.js Registration**
   - What we know: The hook file exists and is copied to dist, but the installer never registers it in settings.json.
   - What's unclear: Whether this was intentional (feature not ready) or an oversight.
   - Recommendation: Since GUARD-04 needs it registered, add registration in install.js during this phase. Use matcher `Bash` for the destructive command detection entry.

3. **Hook Deduplication: GUARD-04 in workflow-guard vs New Hook**
   - What we know: `gsd-workflow-guard.js` currently handles Write|Edit outside workflow. GUARD-04 adds Bash destructive detection -- different scope entirely.
   - Recommendation: Keep GUARD-04 in `gsd-workflow-guard.js` (it's the "guard against dangerous operations" hook) but register it with two matchers: existing Write|Edit + new Bash. Or create separate PreToolUse entries for each matcher.

## Project Constraints (from CLAUDE.md)

- **Ethics rule exists:** "Nunca afirme que fez algo que nao fez" -- GUARD-01 expands this
- **Integrity rule exists:** "Nunca destrua o que funciona... Nunca recrie sem conhecer" -- GUARD-05 reinforces this
- **Scope rule exists:** "mantenha o escopo original" -- related to GUARD-03 (deferred)
- **Hooks are CommonJS (.js):** Not TypeScript -- all hook code must be plain JS
- **Advisory pattern:** Hooks warn, never block (per D-08 and established v1.0 pattern)
- **Build pipeline:** `scripts/build-hooks.js` copies to `hooks/dist/` -- new/modified hooks must be in HOOKS_TO_COPY
- **Installer registration:** `bin/install.js` registers hooks in `~/.claude/settings.json`
- **No npm install:** Never run `npm install` directly -- ask the user
- **Commit docs:** `commit_docs: true` in config -- commit research artifacts

## Sources

### Primary (HIGH confidence)
- `.planning/research/HOOKS-GUARDRAILS.md` -- Direct Claude Code source analysis (prompts.ts, destructiveCommandWarning.ts, FileEditTool.ts, compact/prompt.ts)
- `hooks/gsd-workflow-guard.js` -- Current hook code (94 lines), line-by-line review
- `hooks/gsd-impact-guard.js` -- Current hook code (90 lines), line-by-line review
- `hooks/gsd-prompt-guard.js` -- Current hook code (96 lines), establishes patterns
- `scripts/build-hooks.js` -- Build pipeline, HOOKS_TO_COPY array verified
- `bin/install.js` -- Hook registration logic (lines 4540-4589), verified impact-guard registered, workflow-guard NOT registered
- `agents/gsd-executor.md` -- `<context_persistence>` template (lines 209-221)
- `/Users/gg/.claude/settings.json` -- Active hook registrations verified

### Secondary (MEDIUM confidence)
- `.planning/phases/03-guardrails-upgrade-guard-01-through-guard-06/03-GUARDRAILS-MAP.md` -- Per-GUARD analysis mapping CC source to GSD state

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new libraries, all changes are to existing JS hooks and markdown files
- Architecture: HIGH -- established hook patterns with direct code review of all target files
- Pitfalls: HIGH -- registration gaps discovered through direct source analysis, not guesswork

**Research date:** 2026-04-01
**Valid until:** 2026-05-01 (stable -- hooks API and CLAUDE.md format unlikely to change)
