/**
 * Lock — Phase-level lock acquire/release/check/forceUnlock
 *
 * Prevents concurrent sessions from writing to the same phase directory.
 * Uses atomic file creation via { flag: 'wx' } (POSIX O_CREAT|O_EXCL) and
 * PID liveness detection via process.kill(pid, 0).
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { output, error } = require('./core.cjs');

// ─── Constants ──────────────────────────────────────────────────────────────

const LOCK_FILENAME = '.lock';

// ─── Core Functions ─────────────────────────────────────────────────────────

/**
 * Check if a process is alive via signal 0.
 * Returns true if process exists (even if owned by another user — EPERM).
 * Returns false if process does not exist (ESRCH) or unknown error.
 */
function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    if (e.code === 'ESRCH') return false;
    if (e.code === 'EPERM') return true;
    return false;
  }
}

/**
 * Acquire a phase lock atomically.
 *
 * Creates .lock file with { flag: 'wx' } for atomic exclusive creation.
 * Handles stale locks (dead PID), corrupt locks, and race conditions.
 *
 * @param {string} phaseDir - Absolute path to phase directory
 * @param {number|string} pid - PID of the session acquiring the lock
 * @returns {{ acquired: boolean, owner_pid?: number, acquired_at?: string, was_stale?: boolean, was_corrupt?: boolean }}
 */
function acquire(phaseDir, pid) {
  const lockPath = path.join(phaseDir, LOCK_FILENAME);
  const data = JSON.stringify({ pid: Number(pid), acquired: new Date().toISOString() });

  try {
    fs.writeFileSync(lockPath, data, { flag: 'wx' });
    return { acquired: true };
  } catch (e) {
    if (e.code !== 'EEXIST') throw e;

    // Lock exists — read and inspect
    let existing;
    try {
      existing = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    } catch {
      // Corrupt lock file — remove and retry
      fs.unlinkSync(lockPath);
      try {
        fs.writeFileSync(lockPath, data, { flag: 'wx' });
        return { acquired: true, was_corrupt: true };
      } catch (retryErr) {
        if (retryErr.code === 'EEXIST') {
          const other = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
          return { acquired: false, owner_pid: other.pid, acquired_at: other.acquired };
        }
        throw retryErr;
      }
    }

    // Check if owner process is still alive
    if (!isProcessAlive(existing.pid)) {
      // Stale lock — previous session crashed
      fs.unlinkSync(lockPath);
      try {
        fs.writeFileSync(lockPath, data, { flag: 'wx' });
        return { acquired: true, was_stale: true };
      } catch (retryErr) {
        if (retryErr.code === 'EEXIST') {
          // Race condition: another session grabbed it between unlink and create
          const other = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
          return { acquired: false, owner_pid: other.pid, acquired_at: other.acquired };
        }
        throw retryErr;
      }
    }

    // Owner is alive — lock is held
    return { acquired: false, owner_pid: existing.pid, acquired_at: existing.acquired };
  }
}

/**
 * Release a phase lock.
 *
 * @param {string} phaseDir - Absolute path to phase directory
 * @returns {{ released: boolean, was_absent?: boolean }}
 */
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

/**
 * Check lock status for a phase directory.
 *
 * @param {string} phaseDir - Absolute path to phase directory
 * @param {number|string} currentPid - PID of the current session (for own_session detection)
 * @returns {{ locked: boolean, owner_pid?: number, acquired_at?: string, stale?: boolean, own_session?: boolean, corrupt?: boolean }}
 */
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

/**
 * Force-unlock a phase regardless of owner.
 * Delegates to release().
 *
 * @param {string} phaseDir - Absolute path to phase directory
 * @returns {{ released: boolean, was_absent?: boolean }}
 */
function forceUnlock(phaseDir) {
  return release(phaseDir);
}

// ─── CLI Command Wrappers ───────────────────────────────────────────────────

function cmdLockAcquire(cwd, phaseDir, pid, raw) {
  if (!phaseDir || !pid) {
    error('Usage: lock acquire <phaseDir> <pid>');
    return;
  }
  const fullDir = path.isAbsolute(phaseDir) ? phaseDir : path.join(cwd, phaseDir);
  output(acquire(fullDir, pid), raw);
}

function cmdLockRelease(cwd, phaseDir, raw) {
  if (!phaseDir) {
    error('Usage: lock release <phaseDir>');
    return;
  }
  const fullDir = path.isAbsolute(phaseDir) ? phaseDir : path.join(cwd, phaseDir);
  output(release(fullDir), raw);
}

function cmdLockCheck(cwd, phaseDir, currentPid, raw) {
  if (!phaseDir) {
    error('Usage: lock check <phaseDir> [currentPid]');
    return;
  }
  const fullDir = path.isAbsolute(phaseDir) ? phaseDir : path.join(cwd, phaseDir);
  output(check(fullDir, currentPid || process.ppid), raw);
}

function cmdLockForceUnlock(cwd, phaseDir, raw) {
  if (!phaseDir) {
    error('Usage: lock force-unlock <phaseDir>');
    return;
  }
  const fullDir = path.isAbsolute(phaseDir) ? phaseDir : path.join(cwd, phaseDir);
  output(forceUnlock(fullDir), raw);
}

// ─── Exports ────────────────────────────────────────────────────────────────

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
