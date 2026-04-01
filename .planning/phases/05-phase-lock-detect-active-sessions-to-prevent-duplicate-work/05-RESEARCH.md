# Phase 5: Phase Lock -- Detect Active Sessions to Prevent Duplicate Work - Research

**Researched:** 2026-04-01
**Domain:** Node.js file locking, process identity, Claude Code hook architecture
**Confidence:** HIGH

## Summary

This phase implements a session-level lock mechanism that prevents two independent Claude Code sessions from writing planning artifacts to the same phase simultaneously. The mechanism uses `process.ppid` as session identity (all subagents spawned by the same Claude Code instance share the same parent PID), a `.lock` JSON file in the phase directory with `{ flag: 'wx' }` atomic creation, and a dedicated PreToolUse hook (`gsd-phase-lock.js`) that auto-acquires on first write and blocks competing sessions.

All building blocks are well-understood Node.js primitives with no external dependencies. The existing hook infrastructure (`gsd-workflow-guard.js`, `gsd-impact-guard.js`) provides complete templates for stdin parsing, JSON output format, matcher configuration, and installation registration. The `lock.cjs` module follows the exact same CommonJS pattern as other lib modules (`core.cjs`, `phase.cjs`, `config.cjs`).

**Primary recommendation:** Implement in 4 layers: (1) `lock.cjs` module with acquire/release/check/forceUnlock, (2) `gsd-phase-lock.js` hook, (3) gsd-tools dispatcher integration, (4) install.js hook registration + .gitignore + progress integration.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Lock protege operacoes na mesma fase -- tanto comandos iguais (2x execute-phase) quanto diferentes (plan-phase + execute-phase simultaneos). Fases diferentes tocam diretorios diferentes, nao precisam de protecao cruzada.
- **D-02:** Escopo limitado a artifacts de planning (`.planning/phases/XX-*/`). Codigo fonte excluido -- git ja resolve merges.
- **D-03:** Identificacao de sessao via `process.ppid` no hook (= PID do Claude Code que spawnou). Dois terminais = dois PIDs. Subagentes da mesma sessao herdam o mesmo parent PID.
- **D-04:** Reacao ao conflito: **blocking** (impedir segunda sessao). Primeira excecao ao padrao advisory v1.0 -- justificada porque duplicacao de artifacts e irreversivel.
- **D-05:** Lock file em `.planning/phases/XX-name/.lock` com entrada no `.gitignore`
- **D-06:** Conteudo JSON: `{ "pid": number, "acquired": "ISO-timestamp" }`
- **D-07:** `.gitignore` atualizado com pattern `.lock` em `.planning/`
- **D-08:** Aquisicao via hook auto-acquire (lazy) -- primeira escrita em artifacts da fase cria o lock automaticamente. Zero patch nos workflows existentes.
- **D-09:** Release dual: workflow chama `lock.release()` explicitamente no commit step final + PID check automatico (`process.kill(pid, 0)`) como fallback para crashes.
- **D-10:** Nao usar PostToolUse para release -- impossivel saber qual write e o ultimo.
- **D-11:** Novo modulo `lock.cjs` em `get-shit-done/bin/lib/` com API: `acquire(phaseDir, pid)`, `release(phaseDir)`, `check(phaseDir, currentPid)` -> `{ locked, owner_pid, stale }`
- **D-12:** Hook novo dedicado `gsd-phase-lock.js` (PreToolUse) -- separacao de concerns: workflow-guard cuida de "use GSD commands", phase-lock cuida de "alguem ja esta trabalhando aqui"
- **D-13:** Mensagem de erro blocking inclui: qual fase, PID da sessao que tem o lock, timestamp de quando foi adquirido
- **D-14:** Novo comando `/gsd:unlock-phase N` para force-unlock manual em edge cases (crash, PID reutilizado)
- **D-15:** `/gsd:progress` mostra fases com lock ativo -- info util sem custo adicional

### Claude's Discretion
- Formato exato do gsd-tools dispatch para lock operations (acquire/release/check/force-unlock)
- Estrutura interna do hook (stdin parsing, exit codes)
- Se o hook compila via esbuild junto com os outros ou roda como JS direto
- Ordem de implementacao dos plans (lock.cjs -> hook -> command -> integration)
- Exato pattern do .gitignore para .lock files

### Deferred Ideas (OUT OF SCOPE)
None -- analysis stayed within phase scope.
</user_constraints>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js fs (built-in) | 20+ | File I/O for lock files | `writeFileSync` with `{ flag: 'wx' }` provides atomic exclusive create (O_CREAT\|O_EXCL) |
| Node.js process (built-in) | 20+ | `process.ppid` for session identity, `process.kill(pid, 0)` for liveness | Standard POSIX primitives, no external deps |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| path (built-in) | - | Cross-platform path handling for lock file location | Always |
| core.cjs (project) | - | `findProjectRoot()`, `output()`, `error()` | Lock module reuses project utilities |

No new npm dependencies needed. Everything is built-in Node.js or existing project modules.

## Architecture Patterns

### Recommended Project Structure
```
get-shit-done/bin/lib/
  lock.cjs           # NEW: Lock acquire/release/check/forceUnlock
hooks/
  gsd-phase-lock.js  # NEW: PreToolUse blocking hook
commands/gsd/
  unlock-phase.md    # NEW: /gsd:unlock-phase command
```

### Pattern 1: Atomic Lock File Creation with `{ flag: 'wx' }`
**What:** Use `fs.writeFileSync(lockPath, data, { flag: 'wx' })` which maps to POSIX `O_CREAT | O_EXCL`. If the file already exists, it throws `EEXIST` immediately. This is race-condition-safe because the check-and-create is a single kernel syscall.
**When to use:** `acquire()` function in lock.cjs.
**Verified:** Tested locally -- first `wx` write succeeds, second fails with `EEXIST`. This is the standard pattern for file-based locks in Node.js.
**Example:**
```javascript
// Source: Node.js fs docs + local verification
function acquire(phaseDir, pid) {
  const lockPath = path.join(phaseDir, '.lock');
  const data = JSON.stringify({ pid, acquired: new Date().toISOString() });
  try {
    fs.writeFileSync(lockPath, data, { flag: 'wx' });
    return { acquired: true };
  } catch (e) {
    if (e.code === 'EEXIST') {
      // Lock exists -- check if owner is still alive
      const existing = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
      if (isProcessAlive(existing.pid)) {
        return { acquired: false, owner_pid: existing.pid, acquired_at: existing.acquired };
      }
      // Stale lock -- previous session crashed
      fs.unlinkSync(lockPath);
      fs.writeFileSync(lockPath, data, { flag: 'wx' });
      return { acquired: true, was_stale: true };
    }
    throw e;
  }
}
```

### Pattern 2: PID Liveness Check via `process.kill(pid, 0)`
**What:** Signal 0 does not kill the process -- it only checks if the process exists and the current user has permission to signal it. Throws `ESRCH` if process does not exist, `EPERM` if it exists but belongs to another user.
**When to use:** `check()` function and stale lock detection.
**Verified:** Tested locally -- `ESRCH` for non-existent PIDs, no error for own PID.
**Example:**
```javascript
// Source: Node.js process.kill docs + local verification
function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    if (e.code === 'ESRCH') return false;  // Process does not exist
    if (e.code === 'EPERM') return true;   // Process exists but different user
    return false;  // Unknown error -- treat as dead
  }
}
```

### Pattern 3: PreToolUse Blocking Hook (from existing hooks)
**What:** Hook receives JSON on stdin with `tool_name`, `tool_input`, and `cwd`. For blocking behavior, output JSON with `hookSpecificOutput.decision = "block"` and a `reason` field.
**When to use:** `gsd-phase-lock.js` hook.
**Key difference from existing hooks:** This hook BLOCKS (decision: "block") instead of advising. Existing hooks (`gsd-workflow-guard.js`, `gsd-impact-guard.js`) are advisory only (they output `additionalContext` but let the tool proceed). Phase lock is the first blocking hook per D-04.
**Example:**
```javascript
// Source: gsd-workflow-guard.js pattern + Claude Code hook spec
// Advisory output (existing pattern):
const advisory = {
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    additionalContext: "warning message here"
  }
};

// BLOCKING output (new for phase-lock):
const blocking = {
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    decision: "block",
    reason: `PHASE LOCK: Phase ${phaseNum} is locked by session PID ${ownerPid} since ${acquiredAt}. Use /gsd:unlock-phase ${phaseNum} if the other session has crashed.`
  }
};
```

### Pattern 4: gsd-tools Dispatcher Registration
**What:** New `case 'lock':` in `gsd-tools.cjs` switch statement, following the established subcommand pattern (like `case 'state':` with subcommands).
**Example:**
```javascript
// Source: gsd-tools.cjs existing dispatcher pattern
case 'lock': {
  const lock = require('./lib/lock.cjs');
  const subcommand = args[1];
  if (subcommand === 'acquire') {
    lock.cmdLockAcquire(cwd, args[2], args[3], raw);  // phaseDir, pid
  } else if (subcommand === 'release') {
    lock.cmdLockRelease(cwd, args[2], raw);  // phaseDir
  } else if (subcommand === 'check') {
    lock.cmdLockCheck(cwd, args[2], args[3], raw);  // phaseDir, currentPid
  } else if (subcommand === 'force-unlock') {
    lock.cmdLockForceUnlock(cwd, args[2], raw);  // phaseDir
  } else {
    error('Unknown lock subcommand. Available: acquire, release, check, force-unlock');
  }
  break;
}
```

### Pattern 5: Hook Installation Registration
**What:** Add `gsd-phase-lock.js` to install.js following the exact pattern of `gsd-impact-guard.js`.
**Matcher:** `Write|Edit` (same as impact-guard -- triggers on file write/edit attempts).
**Timeout:** 5 seconds (same as other PreToolUse hooks).
**Build:** Add to `HOOKS_TO_COPY` array in `scripts/build-hooks.js` (hooks are plain JS copied to dist, not esbuild-bundled).

### Anti-Patterns to Avoid
- **Using `fs.existsSync` + `fs.writeFileSync` for lock creation:** TOCTOU race condition. Two processes can both see the file as non-existent and both create it. Use `{ flag: 'wx' }` instead.
- **Relying on PostToolUse for lock release:** Impossible to know which write is the last one (D-10). Use explicit release in workflow commit steps.
- **Using `process.pid` instead of `process.ppid` in the hook:** The hook runs as a child of Claude Code. `process.pid` is the hook's own PID (unique each invocation). `process.ppid` is the Claude Code session PID (stable across all hook invocations from the same session).
- **Blocking reads:** The hook must only block Write/Edit operations. Read operations (Read, Glob, Grep) should pass through -- multiple sessions can read the same phase safely.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Atomic file creation | Check-then-write pattern | `fs.writeFileSync(path, data, { flag: 'wx' })` | TOCTOU race condition; wx is a single kernel syscall |
| Process liveness | Read /proc or spawn `ps` | `process.kill(pid, 0)` | Cross-platform (macOS/Linux/Windows), zero overhead |
| Hook stdin parsing | Custom parser | Copy pattern from `gsd-workflow-guard.js` lines 36-42 | Battle-tested, handles timeouts and encoding |
| Phase directory extraction from file path | Custom regex | Reuse `findProjectRoot()` + path manipulation from `core.cjs` | Handles cross-platform separators |

## Common Pitfalls

### Pitfall 1: Stale Lock Recovery Race Condition
**What goes wrong:** Two sessions detect a stale lock simultaneously, both unlink it, and both create a new one. The second `wx` write fails because the first already recreated it.
**Why it happens:** The unlink-then-create sequence is not atomic.
**How to avoid:** Wrap the stale recovery in a try-catch. If the second `wx` write fails with `EEXIST`, re-read the lock file -- the other session owns it now. This is correct behavior (the other session legitimately acquired it first).
**Warning signs:** `EEXIST` error during stale lock recovery.

### Pitfall 2: PID Reuse After Long Runs
**What goes wrong:** Claude Code crashes, PID gets recycled by the OS for an unrelated process. `process.kill(pid, 0)` returns true even though the original session is gone.
**Why it happens:** OS PID space is finite and recycles. Reuse is rare on modern systems (65536+ PID space) but possible for long-running locks.
**How to avoid:** The `/gsd:unlock-phase` command exists as the escape hatch (D-14). Additionally, the `acquired` timestamp in the lock file provides context -- a lock from 24+ hours ago is likely stale regardless of PID status.
**Warning signs:** Lock file with a very old timestamp but PID check says alive.

### Pitfall 3: Hook Extracting Phase Directory from File Path
**What goes wrong:** The hook needs to determine which phase directory the Write/Edit targets. A file path like `/project/.planning/phases/05-name/PLAN-05-01.md` must map to phase dir `.planning/phases/05-name/`.
**Why it happens:** The hook receives the full `file_path` from stdin, not a structured phase reference.
**How to avoid:** Use a regex to extract the `.planning/phases/XX-name/` segment from the path. Pattern: `/\.planning[\/\\]phases[\/\\](\d+(?:\.\d+)*-[^\/\\]+)/`. If the path doesn't match this pattern, the file is outside planning scope -- `exit(0)` (allow).
**Warning signs:** Lock being acquired for non-phase files, or phase not being detected from path.

### Pitfall 4: Hook Must Not Block Its Own Session
**What goes wrong:** The hook blocks the session that already holds the lock, preventing it from writing further planning artifacts.
**Why it happens:** Every Write/Edit triggers the hook, including from the session that holds the lock.
**How to avoid:** In the hook, compare `process.ppid` (current session) against the lock's `pid` field. If they match, `exit(0)` (allow). Only block when they differ.
**Warning signs:** Session gets blocked by its own lock.

### Pitfall 5: Lock File Left Behind When .planning Directory Doesn't Exist
**What goes wrong:** `acquire()` fails because the phase directory doesn't exist yet.
**Why it happens:** Phase directory creation happens during scaffolding, but the hook fires on any Write to the path.
**How to avoid:** In `acquire()`, check that the phase directory exists before attempting lock creation. If it doesn't exist, the write that triggered the hook is likely creating the directory itself -- allow it.
**Warning signs:** `ENOENT` errors from `writeFileSync`.

## Code Examples

### lock.cjs Module Structure
```javascript
// Source: Follows pattern of core.cjs, phase.cjs, config.cjs
'use strict';

const fs = require('fs');
const path = require('path');
const { findProjectRoot, output, error } = require('./core.cjs');

const LOCK_FILENAME = '.lock';

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code !== 'ESRCH';
  }
}

function acquire(phaseDir, pid) {
  const lockPath = path.join(phaseDir, LOCK_FILENAME);
  const data = JSON.stringify({ pid: Number(pid), acquired: new Date().toISOString() });
  try {
    fs.writeFileSync(lockPath, data, { flag: 'wx' });
    return { acquired: true };
  } catch (e) {
    if (e.code === 'EEXIST') {
      let existing;
      try {
        existing = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
      } catch {
        // Corrupt lock file -- remove and retry
        fs.unlinkSync(lockPath);
        fs.writeFileSync(lockPath, data, { flag: 'wx' });
        return { acquired: true, was_corrupt: true };
      }
      if (!isProcessAlive(existing.pid)) {
        // Stale lock
        fs.unlinkSync(lockPath);
        try {
          fs.writeFileSync(lockPath, data, { flag: 'wx' });
          return { acquired: true, was_stale: true };
        } catch (retryErr) {
          if (retryErr.code === 'EEXIST') {
            // Another session grabbed it between unlink and create
            const other = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
            return { acquired: false, owner_pid: other.pid, acquired_at: other.acquired };
          }
          throw retryErr;
        }
      }
      return { acquired: false, owner_pid: existing.pid, acquired_at: existing.acquired };
    }
    throw e;
  }
}

function release(phaseDir) {
  const lockPath = path.join(phaseDir, LOCK_FILENAME);
  try {
    fs.unlinkSync(lockPath);
    return { released: true };
  } catch (e) {
    if (e.code === 'ENOENT') return { released: true, was_absent: true };
    throw e;
  }
}

function check(phaseDir, currentPid) {
  const lockPath = path.join(phaseDir, LOCK_FILENAME);
  if (!fs.existsSync(lockPath)) {
    return { locked: false };
  }
  let data;
  try {
    data = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  } catch {
    return { locked: false, corrupt: true };
  }
  const alive = isProcessAlive(data.pid);
  const ownSession = Number(currentPid) === data.pid;
  return {
    locked: true,
    owner_pid: data.pid,
    acquired_at: data.acquired,
    stale: !alive,
    own_session: ownSession,
  };
}

function forceUnlock(phaseDir) {
  return release(phaseDir);
}

// CLI command wrappers
function cmdLockAcquire(cwd, phaseDir, pid, raw) {
  if (!phaseDir || !pid) { error('Usage: lock acquire <phaseDir> <pid>'); return; }
  const fullDir = path.isAbsolute(phaseDir) ? phaseDir : path.join(cwd, phaseDir);
  output(acquire(fullDir, pid), raw);
}

function cmdLockRelease(cwd, phaseDir, raw) {
  if (!phaseDir) { error('Usage: lock release <phaseDir>'); return; }
  const fullDir = path.isAbsolute(phaseDir) ? phaseDir : path.join(cwd, phaseDir);
  output(release(fullDir), raw);
}

function cmdLockCheck(cwd, phaseDir, currentPid, raw) {
  if (!phaseDir) { error('Usage: lock check <phaseDir> [currentPid]'); return; }
  const fullDir = path.isAbsolute(phaseDir) ? phaseDir : path.join(cwd, phaseDir);
  output(check(fullDir, currentPid || process.ppid), raw);
}

function cmdLockForceUnlock(cwd, phaseDir, raw) {
  if (!phaseDir) { error('Usage: lock force-unlock <phaseDir>'); return; }
  const fullDir = path.isAbsolute(phaseDir) ? phaseDir : path.join(cwd, phaseDir);
  output(forceUnlock(fullDir), raw);
}

module.exports = {
  acquire,
  release,
  check,
  forceUnlock,
  isProcessAlive,
  LOCK_FILENAME,
  cmdLockAcquire,
  cmdLockRelease,
  cmdLockCheck,
  cmdLockForceUnlock,
};
```

### gsd-phase-lock.js Hook Structure
```javascript
// Source: Pattern from gsd-workflow-guard.js + gsd-impact-guard.js
#!/usr/bin/env node
// gsd-hook-version: {{GSD_VERSION}}
// GSD Phase Lock — PreToolUse hook
// Detects concurrent sessions writing to the same phase and BLOCKS the second session.
// HARD guard — blocks, not advises. Per D-04 from 05-CONTEXT.md.

const fs = require('fs');
const path = require('path');

// Regex to extract phase directory from a file path
const PHASE_DIR_REGEX = /\.planning[\/\\]phases[\/\\](\d+(?:\.\d+)*-[^\/\\]+)/;

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

    // Only guard .planning/phases/ writes
    const match = filePath.match(PHASE_DIR_REGEX);
    if (!match) {
      process.exit(0);
    }

    const cwd = data.cwd || process.cwd();
    const phaseDirName = match[1];
    const phaseDir = path.join(cwd, '.planning', 'phases', phaseDirName);

    // Check for existing lock
    const lockPath = path.join(phaseDir, '.lock');
    const sessionPid = process.ppid;

    if (!fs.existsSync(lockPath)) {
      // No lock — auto-acquire (D-08)
      if (fs.existsSync(phaseDir)) {
        try {
          const lockData = JSON.stringify({ pid: sessionPid, acquired: new Date().toISOString() });
          fs.writeFileSync(lockPath, lockData, { flag: 'wx' });
        } catch (e) {
          // If EEXIST, another session just acquired — fall through to check
          if (e.code !== 'EEXIST') {
            process.exit(0); // Non-lock errors — don't block
          }
        }
      }
      // Re-check if lock now exists (might have been created by another session)
      if (!fs.existsSync(lockPath)) {
        process.exit(0); // No lock, no phase dir — allow
      }
    }

    // Read lock and compare
    let lockData;
    try {
      lockData = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    } catch {
      process.exit(0); // Corrupt lock — allow (don't block on corruption)
    }

    // Same session — allow (D-03)
    if (lockData.pid === sessionPid) {
      process.exit(0);
    }

    // Different session — check if owner is alive (D-09 fallback)
    try {
      process.kill(lockData.pid, 0);
    } catch (e) {
      if (e.code === 'ESRCH') {
        // Owner dead — stale lock, take over
        try {
          fs.unlinkSync(lockPath);
          const newData = JSON.stringify({ pid: sessionPid, acquired: new Date().toISOString() });
          fs.writeFileSync(lockPath, newData, { flag: 'wx' });
          process.exit(0); // Acquired after stale cleanup
        } catch {
          // Race lost — re-read and block if needed
        }
      }
    }

    // Re-read lock (may have changed during stale recovery)
    try {
      lockData = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    } catch {
      process.exit(0);
    }

    if (lockData.pid === sessionPid) {
      process.exit(0); // Acquired via stale recovery
    }

    // BLOCK — another live session owns this phase (D-04, D-13)
    const phaseNum = phaseDirName.match(/^(\d+(?:\.\d+)*)/)?.[1] || phaseDirName;
    const output = {
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        decision: "block",
        reason: `PHASE LOCK: Phase ${phaseNum} is locked by session PID ${lockData.pid} since ${lockData.acquired}. ` +
          `Another Claude Code session is actively working on this phase. ` +
          `If the other session has crashed, use /gsd:unlock-phase ${phaseNum} to force-release the lock.`
      }
    };

    process.stdout.write(JSON.stringify(output));
  } catch (e) {
    // Silent fail — never block on internal errors
    process.exit(0);
  }
});
```

### .gitignore Addition
```
# Phase lock files (session-local, never committed)
.planning/phases/**/.lock
```

### Progress Integration
```javascript
// Source: cmdProgressRender() in commands.cjs, line 520-537
// Add lock detection to each phase in the progress loop:
const lockPath = path.join(phasesDir, dir, '.lock');
let lockInfo = null;
if (fs.existsSync(lockPath)) {
  try {
    const lockData = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    const alive = isProcessAlive(lockData.pid);
    lockInfo = { pid: lockData.pid, acquired: lockData.acquired, stale: !alive };
  } catch { /* ignore corrupt */ }
}
phases.push({ number: phaseNum, name: phaseName, plans, summaries, status, lock: lockInfo });
```

### init.cjs Integration
```javascript
// Source: Pattern from has_brainstorm detection in init.cjs
// Add has_lock detection alongside existing artifact checks:
has_lock: phaseInfo?.has_lock || false,
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Advisory-only hooks | First blocking hook (phase-lock) | This phase | New `decision: "block"` output format in hook JSON |
| No session awareness | process.ppid as session identity | This phase | Enables multi-session coordination |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Node.js built-in test runner (`node:test`) |
| Config file | `scripts/run-tests.cjs` (test runner script) |
| Quick run command | `node --test tests/lock.test.cjs` |
| Full suite command | `npm test` |

### Phase Requirements --> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| D-01 | Lock blocks same-phase concurrent access | unit | `node --test tests/lock.test.cjs` | No -- Wave 0 |
| D-03 | process.ppid identifies session; same-session allowed | unit | `node --test tests/lock.test.cjs` | No -- Wave 0 |
| D-04 | Blocking output format with decision: "block" | unit | `node --test tests/lock.test.cjs` | No -- Wave 0 |
| D-06 | Lock file JSON format { pid, acquired } | unit | `node --test tests/lock.test.cjs` | No -- Wave 0 |
| D-08 | Auto-acquire on first write | unit | `node --test tests/lock.test.cjs` | No -- Wave 0 |
| D-09 | Stale lock detection via process.kill(pid, 0) | unit | `node --test tests/lock.test.cjs` | No -- Wave 0 |
| D-11 | lock.cjs API: acquire/release/check | unit | `node --test tests/lock.test.cjs` | No -- Wave 0 |
| D-12 | Hook fires on Write/Edit to .planning/phases/ | unit | `node --test tests/lock.test.cjs` | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `node --test tests/lock.test.cjs`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/lock.test.cjs` -- covers all lock.cjs functions (acquire, release, check, forceUnlock, isProcessAlive, stale detection, race condition handling)
- [ ] Hook syntax validation in existing `scripts/build-hooks.js` HOOKS_TO_COPY array

## Open Questions

1. **Claude Code hook `decision: "block"` format**
   - What we know: Advisory hooks use `additionalContext` field. The Claude Code hook spec supports a `decision` field with value `"block"` to prevent tool execution.
   - What's unclear: Exact schema for blocking response. Need to verify if `decision: "block"` with `reason` field is the correct format, or if it uses a different structure.
   - Recommendation: Test with a minimal blocking hook during implementation. If the format is wrong, Claude Code will either ignore it or error -- both are detectable. Check Claude Code documentation or source for the exact blocking hook response schema.

2. **process.ppid stability across Task() subagent spawns**
   - What we know: Standard POSIX behavior is that `process.ppid` equals the parent's PID. Claude Code spawns hooks as child processes, so `process.ppid` = Claude Code PID. Task() subagents are also spawned by Claude Code.
   - What's unclear: Whether Task() subagents are spawned directly by the Claude Code process or by an intermediate process (which would give them a different ppid).
   - Recommendation: Test during implementation by logging `process.ppid` from within a Task() subagent context. If Task() uses an intermediate process, the hook would need to walk up the process tree -- but this is unlikely given Claude Code's architecture.

## Sources

### Primary (HIGH confidence)
- `hooks/gsd-workflow-guard.js` -- Complete PreToolUse hook pattern, stdin JSON parsing, exit codes, advisory output format
- `hooks/gsd-impact-guard.js` -- PreToolUse hook for Write/Edit interception, .planning/ path detection
- `get-shit-done/bin/gsd-tools.cjs` -- Dispatcher pattern, switch/case registration, subcommand structure
- `bin/install.js` lines 4568-4589 -- Hook registration pattern (matcher, type, command, timeout)
- `scripts/build-hooks.js` -- HOOKS_TO_COPY array (plain JS copy, no esbuild bundling)
- `get-shit-done/bin/lib/init.cjs` -- `has_brainstorm`/`has_context` detection pattern for adding `has_lock`
- `get-shit-done/bin/lib/commands.cjs` lines 507-573 -- `cmdProgressRender()` for lock info integration

### Secondary (MEDIUM confidence)
- Node.js `fs.writeFileSync` with `{ flag: 'wx' }` -- verified locally, maps to POSIX O_CREAT|O_EXCL
- Node.js `process.kill(pid, 0)` -- verified locally, returns ESRCH for dead processes
- Node.js `process.ppid` -- verified locally, standard POSIX behavior

### Tertiary (LOW confidence)
- Claude Code hook blocking format (`decision: "block"`) -- based on hook specification inference, not verified against Claude Code source

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all Node.js built-ins, verified locally
- Architecture: HIGH -- follows established project patterns exactly
- Pitfalls: HIGH -- race conditions and PID liveness are well-understood computer science
- Hook blocking format: LOW -- `decision: "block"` schema needs runtime verification

**Research date:** 2026-04-01
**Valid until:** 2026-05-01 (stable primitives, unlikely to change)
