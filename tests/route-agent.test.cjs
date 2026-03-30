const assert = require('node:assert');
const { describe, it, beforeEach } = require('node:test');
const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const GSD_TOOLS = path.resolve(__dirname, '../get-shit-done/bin/gsd-tools.cjs');

describe('route-agent command', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'route-agent-test-'));
    fs.mkdirSync(path.join(tmpDir, '.planning'), { recursive: true });
  });

  it('exits 1 for local agent (gsd-planner)', () => {
    const promptFile = path.join(tmpDir, 'task.md');
    fs.writeFileSync(promptFile, 'Plan something');
    try {
      execSync(`node "${GSD_TOOLS}" route-agent gsd-planner --prompt "${promptFile}" --context "${tmpDir}" --mode lean`, {
        encoding: 'utf8',
      });
      assert.fail('Should have exited with code 1');
    } catch (e) {
      assert.strictEqual(e.status, 1);
    }
  });

  it('exits 1 in full mode even for remote agent', () => {
    const promptFile = path.join(tmpDir, 'task.md');
    fs.writeFileSync(promptFile, 'Catalog something');
    try {
      execSync(`node "${GSD_TOOLS}" route-agent gsd-cataloger --prompt "${promptFile}" --context "${tmpDir}" --mode full`, {
        encoding: 'utf8',
      });
      assert.fail('Should have exited with code 1');
    } catch (e) {
      assert.strictEqual(e.status, 1);
    }
  });

  it('exits 1 in auto mode when no providers.json', () => {
    const promptFile = path.join(tmpDir, 'task.md');
    fs.writeFileSync(promptFile, 'Catalog something');
    try {
      execSync(`node "${GSD_TOOLS}" route-agent gsd-cataloger --prompt "${promptFile}" --context "${tmpDir}" --mode auto --providers-path "${path.join(tmpDir, 'nonexistent.json')}"`, {
        encoding: 'utf8',
      });
      assert.fail('Should have exited with code 1');
    } catch (e) {
      assert.strictEqual(e.status, 1);
    }
  });

  it('exits 2 in lean mode when no providers.json', () => {
    const promptFile = path.join(tmpDir, 'task.md');
    fs.writeFileSync(promptFile, 'Catalog something');
    try {
      execSync(`node "${GSD_TOOLS}" route-agent gsd-cataloger --prompt "${promptFile}" --context "${tmpDir}" --mode lean --providers-path "${path.join(tmpDir, 'nonexistent.json')}"`, {
        encoding: 'utf8',
      });
      assert.fail('Should have exited with code 2');
    } catch (e) {
      assert.strictEqual(e.status, 2);
    }
  });
});
