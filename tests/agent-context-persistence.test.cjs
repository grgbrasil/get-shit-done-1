const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const AGENTS_DIR = path.join(__dirname, '..', 'agents');

function readAgent(name) {
  return fs.readFileSync(path.join(AGENTS_DIR, name), 'utf8');
}

describe('context_persistence blocks in long-running agents', () => {
  it('gsd-executor.md has context_persistence (pre-existing)', () => {
    const content = readAgent('gsd-executor.md');
    assert.ok(content.includes('<context_persistence>'), 'Missing <context_persistence> tag');
    assert.ok(content.includes('</context_persistence>'), 'Missing </context_persistence> closing tag');
  });

  it('gsd-planner.md has context_persistence with role-specific content', () => {
    const content = readAgent('gsd-planner.md');
    assert.ok(content.includes('<context_persistence>'), 'Missing <context_persistence> tag');
    assert.ok(content.includes('</context_persistence>'), 'Missing </context_persistence> closing tag');
    assert.ok(
      content.includes('architectural decisions') || content.includes('decisoes arquiteturais'),
      'Planner context_persistence must mention architectural decisions'
    );
    assert.ok(
      content.includes('dependency chains'),
      'Planner context_persistence must mention dependency chains'
    );
  });

  it('gsd-phase-researcher.md has context_persistence with role-specific content', () => {
    const content = readAgent('gsd-phase-researcher.md');
    assert.ok(content.includes('<context_persistence>'), 'Missing <context_persistence> tag');
    assert.ok(content.includes('</context_persistence>'), 'Missing </context_persistence> closing tag');
    assert.ok(
      content.includes('source URLs') || content.includes('URLs consultadas'),
      'Researcher context_persistence must mention source URLs'
    );
    assert.ok(
      content.toLowerCase().includes('confidence'),
      'Researcher context_persistence must mention confidence levels'
    );
  });

  it('gsd-debugger.md has context_persistence with role-specific content', () => {
    const content = readAgent('gsd-debugger.md');
    assert.ok(content.includes('<context_persistence>'), 'Missing <context_persistence> tag');
    assert.ok(content.includes('</context_persistence>'), 'Missing </context_persistence> closing tag');
    assert.ok(
      content.includes('root cause') || content.includes('causa raiz'),
      'Debugger context_persistence must mention root cause'
    );
    assert.ok(
      content.includes('reproduction steps'),
      'Debugger context_persistence must mention reproduction steps'
    );
  });

  it('short agents do NOT have context_persistence (per D-17)', () => {
    const checker = readAgent('gsd-plan-checker.md');
    assert.ok(
      !checker.includes('<context_persistence>'),
      'gsd-plan-checker.md should NOT have context_persistence (short agent per D-17)'
    );
  });
});
