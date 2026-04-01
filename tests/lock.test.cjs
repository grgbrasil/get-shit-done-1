/**
 * Lock Module Tests
 *
 * Tests for lock.cjs: acquire, release, check, forceUnlock, isProcessAlive
 * Uses temp directories to avoid interfering with real project state.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-lock-'));
}

function cleanTmpDir(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
}

// ─── isProcessAlive ─────────────────────────────────────────────────────────

describe('isProcessAlive', () => {
  test('returns true for own process PID', () => {
    const { isProcessAlive } = require('../get-shit-done/bin/lib/lock.cjs');
    assert.strictEqual(isProcessAlive(process.pid), true);
  });

  test('returns false for non-existent PID (99999)', () => {
    const { isProcessAlive } = require('../get-shit-done/bin/lib/lock.cjs');
    // PID 99999 is very likely non-existent
    assert.strictEqual(isProcessAlive(99999), false);
  });
});

// ─── LOCK_FILENAME ──────────────────────────────────────────────────────────

describe('LOCK_FILENAME', () => {
  test('equals .lock', () => {
    const { LOCK_FILENAME } = require('../get-shit-done/bin/lib/lock.cjs');
    assert.strictEqual(LOCK_FILENAME, '.lock');
  });
});

// ─── acquire ────────────────────────────────────────────────────────────────

describe('acquire', () => {
  test('creates .lock file atomically and returns { acquired: true }', () => {
    const { acquire, LOCK_FILENAME } = require('../get-shit-done/bin/lib/lock.cjs');
    const tmpDir = makeTmpDir();
    try {
      const result = acquire(tmpDir, process.pid);
      assert.strictEqual(result.acquired, true);

      // Verify lock file was created with correct content
      const lockPath = path.join(tmpDir, LOCK_FILENAME);
      assert.strictEqual(fs.existsSync(lockPath), true);
      const data = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
      assert.strictEqual(data.pid, process.pid);
      assert.ok(data.acquired, 'should have acquired timestamp');
    } finally {
      cleanTmpDir(tmpDir);
    }
  });

  test('returns { acquired: false } when lock held by live process', () => {
    const { acquire } = require('../get-shit-done/bin/lib/lock.cjs');
    const tmpDir = makeTmpDir();
    try {
      // First acquire succeeds
      const first = acquire(tmpDir, process.pid);
      assert.strictEqual(first.acquired, true);

      // Second acquire with different PID (use ppid which is alive)
      const otherPid = process.ppid;
      const second = acquire(tmpDir, otherPid);
      assert.strictEqual(second.acquired, false);
      assert.strictEqual(second.owner_pid, process.pid);
      assert.ok(second.acquired_at, 'should include acquired_at');
    } finally {
      cleanTmpDir(tmpDir);
    }
  });

  test('detects stale lock (dead PID) and takes over', () => {
    const { acquire, LOCK_FILENAME } = require('../get-shit-done/bin/lib/lock.cjs');
    const tmpDir = makeTmpDir();
    try {
      // Write a lock with a dead PID (99999)
      const lockPath = path.join(tmpDir, LOCK_FILENAME);
      const staleData = JSON.stringify({ pid: 99999, acquired: '2026-01-01T00:00:00.000Z' });
      fs.writeFileSync(lockPath, staleData);

      // Acquire should detect stale and take over
      const result = acquire(tmpDir, process.pid);
      assert.strictEqual(result.acquired, true);
      assert.strictEqual(result.was_stale, true);

      // Verify new lock content
      const data = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
      assert.strictEqual(data.pid, process.pid);
    } finally {
      cleanTmpDir(tmpDir);
    }
  });

  test('handles corrupt lock file by replacing it', () => {
    const { acquire, LOCK_FILENAME } = require('../get-shit-done/bin/lib/lock.cjs');
    const tmpDir = makeTmpDir();
    try {
      // Write corrupt data to lock file
      const lockPath = path.join(tmpDir, LOCK_FILENAME);
      fs.writeFileSync(lockPath, 'NOT VALID JSON{{{');

      const result = acquire(tmpDir, process.pid);
      assert.strictEqual(result.acquired, true);
      assert.strictEqual(result.was_corrupt, true);

      // Verify new lock content
      const data = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
      assert.strictEqual(data.pid, process.pid);
    } finally {
      cleanTmpDir(tmpDir);
    }
  });

  test('race condition: stale recovery lost returns { acquired: false }', () => {
    const { LOCK_FILENAME } = require('../get-shit-done/bin/lib/lock.cjs');
    const tmpDir = makeTmpDir();
    try {
      // Simulate: another session recreates the lock between unlink and wx retry
      // We do this by pre-creating the lock with a live PID after the first lock
      // is established as stale

      // First, create a lock with dead PID
      const lockPath = path.join(tmpDir, LOCK_FILENAME);
      const staleData = JSON.stringify({ pid: 99999, acquired: '2026-01-01T00:00:00.000Z' });
      fs.writeFileSync(lockPath, staleData);

      // Manually simulate race: unlink stale, then create lock as "other session"
      fs.unlinkSync(lockPath);
      const otherPid = process.ppid; // ppid is alive
      const otherData = JSON.stringify({ pid: otherPid, acquired: new Date().toISOString() });
      fs.writeFileSync(lockPath, otherData, { flag: 'wx' });

      // Now try to acquire -- should see the other session's lock
      const result = require('../get-shit-done/bin/lib/lock.cjs').acquire(tmpDir, process.pid);
      assert.strictEqual(result.acquired, false);
      assert.strictEqual(result.owner_pid, otherPid);
    } finally {
      cleanTmpDir(tmpDir);
    }
  });
});

// ─── release ────────────────────────────────────────────────────────────────

describe('release', () => {
  test('removes .lock and returns { released: true }', () => {
    const { acquire, release, LOCK_FILENAME } = require('../get-shit-done/bin/lib/lock.cjs');
    const tmpDir = makeTmpDir();
    try {
      acquire(tmpDir, process.pid);
      const result = release(tmpDir);
      assert.strictEqual(result.released, true);
      assert.strictEqual(fs.existsSync(path.join(tmpDir, LOCK_FILENAME)), false);
    } finally {
      cleanTmpDir(tmpDir);
    }
  });

  test('returns { released: true, was_absent: true } when no lock exists', () => {
    const { release } = require('../get-shit-done/bin/lib/lock.cjs');
    const tmpDir = makeTmpDir();
    try {
      const result = release(tmpDir);
      assert.strictEqual(result.released, true);
      assert.strictEqual(result.was_absent, true);
    } finally {
      cleanTmpDir(tmpDir);
    }
  });
});

// ─── check ──────────────────────────────────────────────────────────────────

describe('check', () => {
  test('returns { locked: false } when no lock exists', () => {
    const { check } = require('../get-shit-done/bin/lib/lock.cjs');
    const tmpDir = makeTmpDir();
    try {
      const result = check(tmpDir, process.pid);
      assert.strictEqual(result.locked, false);
    } finally {
      cleanTmpDir(tmpDir);
    }
  });

  test('returns lock info with own_session=true when own PID holds lock', () => {
    const { acquire, check } = require('../get-shit-done/bin/lib/lock.cjs');
    const tmpDir = makeTmpDir();
    try {
      acquire(tmpDir, process.pid);
      const result = check(tmpDir, process.pid);
      assert.strictEqual(result.locked, true);
      assert.strictEqual(result.owner_pid, process.pid);
      assert.strictEqual(result.stale, false);
      assert.strictEqual(result.own_session, true);
      assert.ok(result.acquired_at);
    } finally {
      cleanTmpDir(tmpDir);
    }
  });

  test('returns stale=true when lock held by dead PID', () => {
    const { check, LOCK_FILENAME } = require('../get-shit-done/bin/lib/lock.cjs');
    const tmpDir = makeTmpDir();
    try {
      // Write lock with dead PID
      const lockPath = path.join(tmpDir, LOCK_FILENAME);
      fs.writeFileSync(lockPath, JSON.stringify({ pid: 99999, acquired: '2026-01-01T00:00:00.000Z' }));

      const result = check(tmpDir, process.pid);
      assert.strictEqual(result.locked, true);
      assert.strictEqual(result.stale, true);
      assert.strictEqual(result.own_session, false);
      assert.strictEqual(result.owner_pid, 99999);
    } finally {
      cleanTmpDir(tmpDir);
    }
  });

  test('returns { locked: false, corrupt: true } for corrupt lock file', () => {
    const { check, LOCK_FILENAME } = require('../get-shit-done/bin/lib/lock.cjs');
    const tmpDir = makeTmpDir();
    try {
      const lockPath = path.join(tmpDir, LOCK_FILENAME);
      fs.writeFileSync(lockPath, 'CORRUPT DATA!!!');

      const result = check(tmpDir, process.pid);
      assert.strictEqual(result.locked, false);
      assert.strictEqual(result.corrupt, true);
    } finally {
      cleanTmpDir(tmpDir);
    }
  });

  test('returns own_session=false when different live PID holds lock', () => {
    const { acquire, check } = require('../get-shit-done/bin/lib/lock.cjs');
    const tmpDir = makeTmpDir();
    try {
      // Acquire with ppid (alive, different from current)
      acquire(tmpDir, process.ppid);
      const result = check(tmpDir, process.pid);
      assert.strictEqual(result.locked, true);
      assert.strictEqual(result.own_session, false);
      assert.strictEqual(result.stale, false);
    } finally {
      cleanTmpDir(tmpDir);
    }
  });
});

// ─── forceUnlock ────────────────────────────────────────────────────────────

describe('forceUnlock', () => {
  test('removes lock regardless of owner', () => {
    const { acquire, forceUnlock, LOCK_FILENAME } = require('../get-shit-done/bin/lib/lock.cjs');
    const tmpDir = makeTmpDir();
    try {
      acquire(tmpDir, process.ppid); // different PID
      const result = forceUnlock(tmpDir);
      assert.strictEqual(result.released, true);
      assert.strictEqual(fs.existsSync(path.join(tmpDir, LOCK_FILENAME)), false);
    } finally {
      cleanTmpDir(tmpDir);
    }
  });

  test('returns was_absent when no lock exists', () => {
    const { forceUnlock } = require('../get-shit-done/bin/lib/lock.cjs');
    const tmpDir = makeTmpDir();
    try {
      const result = forceUnlock(tmpDir);
      assert.strictEqual(result.released, true);
      assert.strictEqual(result.was_absent, true);
    } finally {
      cleanTmpDir(tmpDir);
    }
  });
});
