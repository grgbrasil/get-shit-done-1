#!/usr/bin/env node
// gsd-hook-version: {{GSD_VERSION}}
// GSD Phase Lock -- PreToolUse hook
// Detects concurrent sessions writing to the same phase and BLOCKS the second session.
// HARD guard -- blocks, not advises. Per D-04 from 05-CONTEXT.md.

const fs = require('fs');
const path = require('path');

let input = '';
const stdinTimeout = setTimeout(() => process.exit(0), 3000);
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => input += chunk);
process.stdin.on('end', () => {
  clearTimeout(stdinTimeout);
  try {
    const data = JSON.parse(input);
    const toolName = data.tool_name;

    // Only intercept Write and Edit tool calls
    if (toolName !== 'Write' && toolName !== 'Edit') {
      process.exit(0);
    }

    // Extract file path from tool input
    const filePath = data.tool_input?.file_path || data.tool_input?.path || '';

    // Match against .planning/phases/XX-name/ pattern (per D-02)
    const phaseMatch = filePath.match(/\.planning[\/\\]phases[\/\\](\d+(?:\.\d+)*-[^\/\\]+)/);
    if (!phaseMatch) {
      process.exit(0); // Not a planning phase file — allow
    }

    const phaseDirName = phaseMatch[1];
    const cwd = data.cwd || process.cwd();
    const phaseDir = path.join(cwd, '.planning', 'phases', phaseDirName);
    const phaseNum = phaseDirName.match(/^(\d+(?:\.\d+)*)/)?.[1] || phaseDirName;
    const sessionPid = process.ppid; // Per D-03: parent PID identifies the session
    const lockPath = path.join(phaseDir, '.lock');

    // Auto-acquire logic (D-08): if no lock exists and phase dir exists, acquire
    if (!fs.existsSync(lockPath) && fs.existsSync(phaseDir)) {
      try {
        fs.writeFileSync(lockPath, JSON.stringify({ pid: sessionPid, acquired: new Date().toISOString() }), { flag: 'wx' });
        // Lock acquired for this session — allow
        process.exit(0);
      } catch (e) {
        if (e.code !== 'EEXIST') {
          // Don't block on internal errors
          process.exit(0);
        }
        // EEXIST: another session grabbed the lock between our check and write — fall through
      }
    }

    // If lock still doesn't exist (phase dir may not exist yet — allow scaffolding)
    if (!fs.existsSync(lockPath)) {
      process.exit(0);
    }

    // Read and parse lock file
    let lockData;
    try {
      lockData = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    } catch (e) {
      // Corrupt JSON — don't block on corruption
      process.exit(0);
    }

    // Same session check (D-03)
    if (lockData.pid === sessionPid) {
      process.exit(0);
    }

    // Stale lock detection (D-09): check if owner process is alive
    let ownerAlive = false;
    try {
      process.kill(lockData.pid, 0);
      ownerAlive = true;
    } catch (e) {
      if (e.code === 'EPERM') {
        // Process exists but we lack permission — treat as alive
        ownerAlive = true;
      }
      // ESRCH = process dead — ownerAlive stays false
    }

    if (!ownerAlive) {
      // Stale lock recovery: remove old lock, acquire new one
      try {
        fs.unlinkSync(lockPath);
      } catch (e) {
        // If unlink fails, don't block
        process.exit(0);
      }

      try {
        fs.writeFileSync(lockPath, JSON.stringify({ pid: sessionPid, acquired: new Date().toISOString() }), { flag: 'wx' });
        // Stale lock recovered, this session now owns it — allow
        process.exit(0);
      } catch (e) {
        if (e.code === 'EEXIST') {
          // Another session grabbed it between unlink and write — re-read
          try {
            lockData = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
          } catch (e2) {
            process.exit(0); // Corrupt — allow
          }
          // If we ended up owning it after all
          if (lockData.pid === sessionPid) {
            process.exit(0);
          }
          // Otherwise fall through to block
        } else {
          process.exit(0); // Don't block on internal errors
        }
      }
    }

    // Block (D-04, D-13): another live session holds the lock
    const output = {
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        decision: "block",
        reason: `PHASE LOCK: Phase ${phaseNum} is locked by session PID ${lockData.pid} since ${lockData.acquired}. Another Claude Code session is actively working on this phase. If the other session has crashed, use /gsd:unlock-phase ${phaseNum} to force-release the lock.`
      }
    };

    process.stdout.write(JSON.stringify(output));
  } catch (e) {
    // Global safety: never block on internal errors
    process.exit(0);
  }
});
