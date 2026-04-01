const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('child_process');
const path = require('path');

const HOOK_PATH = path.join(__dirname, '..', 'hooks', 'gsd-workflow-guard.js');

/**
 * Helper: run the hook with simulated PreToolUse JSON via stdin.
 * Returns { exitCode, stdout, stderr }.
 */
function runHook(input) {
  try {
    const stdout = execFileSync('node', [HOOK_PATH], {
      input: JSON.stringify(input),
      encoding: 'utf8',
      timeout: 5000,
    });
    return { exitCode: 0, stdout, stderr: '' };
  } catch (e) {
    return {
      exitCode: e.status ?? 1,
      stdout: e.stdout ?? '',
      stderr: e.stderr ?? '',
    };
  }
}

function makeBashInput(command) {
  return {
    tool_name: 'Bash',
    tool_input: { command },
    cwd: '/tmp/test-project',
  };
}

// ─── GUARD-04: Destructive Command Detection ─────────────────────

describe('GUARD-04: Destructive command detection', () => {
  it('git reset --hard triggers warning containing "descarta"', () => {
    const r = runHook(makeBashInput('git reset --hard HEAD'));
    assert.ok(r.stdout.includes('DESTRUCTIVE COMMAND WARNING'), 'should emit warning');
    assert.ok(r.stdout.includes('descarta'), 'should contain "descarta"');
  });

  it('git push --force triggers warning with alt force-with-lease', () => {
    const r = runHook(makeBashInput('git push --force origin main'));
    assert.ok(r.stdout.includes('DESTRUCTIVE COMMAND WARNING'));
    assert.ok(r.stdout.includes('sobrescrever'), 'should mention overwriting history');
    assert.ok(r.stdout.includes('force-with-lease'), 'should suggest safe alternative');
  });

  it('git push --force-with-lease does NOT trigger warning', () => {
    const r = runHook(makeBashInput('git push --force-with-lease origin main'));
    assert.equal(r.stdout, '', 'should produce no output for safe variant');
  });

  it('git push -f triggers warning (short flag)', () => {
    const r = runHook(makeBashInput('git push -f origin main'));
    assert.ok(r.stdout.includes('DESTRUCTIVE COMMAND WARNING'));
    assert.ok(r.stdout.includes('sobrescrever'));
  });

  it('rm -rf triggers warning containing "apaga recursivamente"', () => {
    const r = runHook(makeBashInput('rm -rf /tmp/test'));
    assert.ok(r.stdout.includes('DESTRUCTIVE COMMAND WARNING'));
    assert.ok(r.stdout.includes('apaga recursivamente'));
  });

  it('git checkout . triggers warning containing "descarta"', () => {
    const r = runHook(makeBashInput('git checkout .'));
    assert.ok(r.stdout.includes('DESTRUCTIVE COMMAND WARNING'));
    assert.ok(r.stdout.includes('descarta'));
  });

  it('git branch -D feature triggers warning containing "forca exclusao"', () => {
    const r = runHook(makeBashInput('git branch -D feature'));
    assert.ok(r.stdout.includes('DESTRUCTIVE COMMAND WARNING'));
    assert.ok(r.stdout.includes('forca exclusao'));
  });

  it('--no-verify triggers warning containing "pula safety hooks"', () => {
    const r = runHook(makeBashInput('git commit --no-verify -m "test"'));
    assert.ok(r.stdout.includes('DESTRUCTIVE COMMAND WARNING'));
    assert.ok(r.stdout.includes('pula safety hooks'));
  });

  it('git commit --amend triggers warning containing "reescreve"', () => {
    const r = runHook(makeBashInput('git commit --amend'));
    assert.ok(r.stdout.includes('DESTRUCTIVE COMMAND WARNING'));
    assert.ok(r.stdout.includes('reescreve'));
  });

  it('DROP TABLE triggers warning containing "irreversivel"', () => {
    const r = runHook(makeBashInput('DROP TABLE users'));
    assert.ok(r.stdout.includes('DESTRUCTIVE COMMAND WARNING'));
    assert.ok(r.stdout.includes('irreversivel'));
  });

  it('DELETE FROM without WHERE triggers warning containing "sem WHERE"', () => {
    const r = runHook(makeBashInput('DELETE FROM users;'));
    assert.ok(r.stdout.includes('DESTRUCTIVE COMMAND WARNING'));
    assert.ok(r.stdout.includes('sem WHERE'));
  });

  it('DELETE FROM with WHERE does NOT trigger warning', () => {
    const r = runHook(makeBashInput('DELETE FROM users WHERE id = 1'));
    assert.equal(r.stdout, '', 'should not warn for DELETE with WHERE clause');
  });

  it('git clean -fd triggers warning', () => {
    const r = runHook(makeBashInput('git clean -fd'));
    assert.ok(r.stdout.includes('DESTRUCTIVE COMMAND WARNING'));
  });

  it('git restore . triggers warning', () => {
    const r = runHook(makeBashInput('git restore .'));
    assert.ok(r.stdout.includes('DESTRUCTIVE COMMAND WARNING'));
  });

  it('git stash drop triggers warning', () => {
    const r = runHook(makeBashInput('git stash drop'));
    assert.ok(r.stdout.includes('DESTRUCTIVE COMMAND WARNING'));
  });

  it('git stash clear triggers warning', () => {
    const r = runHook(makeBashInput('git stash clear'));
    assert.ok(r.stdout.includes('DESTRUCTIVE COMMAND WARNING'));
  });

  it('TRUNCATE TABLE triggers warning', () => {
    const r = runHook(makeBashInput('TRUNCATE TABLE users'));
    assert.ok(r.stdout.includes('DESTRUCTIVE COMMAND WARNING'));
  });

  // ─── Safe commands: no warning ─────────────────────

  it('git status does NOT trigger warning', () => {
    const r = runHook(makeBashInput('git status'));
    assert.equal(r.stdout, '');
  });

  it('npm test does NOT trigger warning', () => {
    const r = runHook(makeBashInput('npm test'));
    assert.equal(r.stdout, '');
  });

  it('ls does NOT trigger warning', () => {
    const r = runHook(makeBashInput('ls -la'));
    assert.equal(r.stdout, '');
  });

  // ─── Non-Bash tool: no warning ─────────────────────

  it('exits 0 for non-Bash tool_name (Write)', () => {
    const r = runHook({
      tool_name: 'Write',
      tool_input: { file_path: '/tmp/test.js', content: 'hello' },
      cwd: '/tmp/test-project',
    });
    // Write tool should go through existing workflow guard logic, not destructive detection
    assert.equal(r.exitCode, 0);
  });

  // ─── Malformed input ─────────────────────

  it('exits 0 on malformed JSON input', () => {
    try {
      const stdout = execFileSync('node', [HOOK_PATH], {
        input: 'not json at all',
        encoding: 'utf8',
        timeout: 5000,
      });
      assert.equal(stdout, '');
    } catch (e) {
      assert.equal(e.status, 0);
    }
  });
});
