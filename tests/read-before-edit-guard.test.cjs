const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('child_process');
const path = require('path');

const HOOK_PATH = path.join(__dirname, '..', 'hooks', 'gsd-impact-guard.js');

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

function makeWriteInput(filePath) {
  return {
    tool_name: 'Write',
    tool_input: { file_path: filePath, content: 'test content' },
    cwd: '/tmp/test-project',
  };
}

function makeEditInput(filePath) {
  return {
    tool_name: 'Edit',
    tool_input: { file_path: filePath, old_string: 'old', new_string: 'new' },
    cwd: '/tmp/test-project',
  };
}

// ─── GUARD-05: Read-Before-Edit Advisory ─────────────────────

describe('GUARD-05: Read-before-edit advisory', () => {

  // Code files SHOULD trigger advisory
  it('Write to src/app.ts triggers advisory containing READ-BEFORE-EDIT', () => {
    const r = runHook(makeWriteInput('/tmp/test-project/src/app.ts'));
    assert.ok(r.stdout.includes('READ-BEFORE-EDIT'), 'should contain READ-BEFORE-EDIT');
  });

  it('Edit to hooks/guard.js triggers advisory containing READ-BEFORE-EDIT', () => {
    const r = runHook(makeEditInput('/tmp/test-project/hooks/guard.js'));
    assert.ok(r.stdout.includes('READ-BEFORE-EDIT'));
  });

  it('Edit to src/types.ts triggers advisory', () => {
    const r = runHook(makeEditInput('/tmp/test-project/src/types.ts'));
    assert.ok(r.stdout.includes('READ-BEFORE-EDIT'));
  });

  it('Advisory also contains IMPACT ANALYSIS', () => {
    const r = runHook(makeWriteInput('/tmp/test-project/src/app.ts'));
    assert.ok(r.stdout.includes('IMPACT ANALYSIS'), 'should contain IMPACT ANALYSIS reminder');
  });

  // Non-code files should NOT trigger advisory
  it('Write to README.md does NOT trigger advisory', () => {
    const r = runHook(makeWriteInput('/tmp/test-project/README.md'));
    assert.equal(r.stdout, '', 'markdown files should be excluded');
  });

  it('Write to .planning/state.md does NOT trigger advisory', () => {
    const r = runHook(makeWriteInput('/tmp/test-project/.planning/state.md'));
    assert.equal(r.stdout, '', '.planning/ files should be bypassed');
  });

  it('Write to config.json does NOT trigger advisory', () => {
    const r = runHook(makeWriteInput('/tmp/test-project/config.json'));
    assert.equal(r.stdout, '', 'config files should be excluded');
  });

  it('Write to styles.yaml does NOT trigger advisory', () => {
    const r = runHook(makeWriteInput('/tmp/test-project/styles.yaml'));
    assert.equal(r.stdout, '', 'YAML files should be excluded');
  });

  // Non-Write/Edit tools should NOT trigger
  it('Bash tool_name does NOT trigger advisory', () => {
    const r = runHook({
      tool_name: 'Bash',
      tool_input: { command: 'echo hello' },
      cwd: '/tmp/test-project',
    });
    assert.equal(r.stdout, '');
  });

  it('Read tool_name does NOT trigger advisory', () => {
    const r = runHook({
      tool_name: 'Read',
      tool_input: { file_path: '/tmp/test-project/src/app.ts' },
      cwd: '/tmp/test-project',
    });
    assert.equal(r.stdout, '');
  });

  // Malformed input
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

  // Additional code extensions
  it('Write to component.vue triggers advisory', () => {
    const r = runHook(makeWriteInput('/tmp/test-project/src/component.vue'));
    assert.ok(r.stdout.includes('READ-BEFORE-EDIT'));
  });

  it('Write to handler.py triggers advisory', () => {
    const r = runHook(makeWriteInput('/tmp/test-project/handler.py'));
    assert.ok(r.stdout.includes('READ-BEFORE-EDIT'));
  });

  it('Write to main.go triggers advisory', () => {
    const r = runHook(makeWriteInput('/tmp/test-project/main.go'));
    assert.ok(r.stdout.includes('READ-BEFORE-EDIT'));
  });
});
