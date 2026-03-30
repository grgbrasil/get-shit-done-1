const assert = require('node:assert');
const { describe, it, beforeEach } = require('node:test');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

describe('llm-router', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'llm-router-test-'));
  });

  describe('loadApiKey', () => {
    it('returns null when providers.json does not exist', () => {
      const { loadApiKey } = require('../get-shit-done/bin/lib/llm-router.cjs');
      const key = loadApiKey('deepseek-v3', path.join(tmpDir, 'nonexistent.json'));
      assert.strictEqual(key, null);
    });

    it('returns api_key when providers.json has the provider', () => {
      const { loadApiKey } = require('../get-shit-done/bin/lib/llm-router.cjs');
      const configPath = path.join(tmpDir, 'providers.json');
      fs.writeFileSync(configPath, JSON.stringify({
        'deepseek-v3': { api_key: 'sk-test-123' }
      }));
      const key = loadApiKey('deepseek-v3', configPath);
      assert.strictEqual(key, 'sk-test-123');
    });

    it('returns null when provider not in config', () => {
      const { loadApiKey } = require('../get-shit-done/bin/lib/llm-router.cjs');
      const configPath = path.join(tmpDir, 'providers.json');
      fs.writeFileSync(configPath, JSON.stringify({
        'gemini-flash': { api_key: 'AIza-test' }
      }));
      const key = loadApiKey('deepseek-v3', configPath);
      assert.strictEqual(key, null);
    });
  });

  describe('shouldRouteRemote', () => {
    it('returns false in full mode', () => {
      const { shouldRouteRemote } = require('../get-shit-done/bin/lib/llm-router.cjs');
      assert.strictEqual(shouldRouteRemote('gsd-cataloger', 'full'), false);
    });

    it('returns true for remote agent in lean mode', () => {
      const { shouldRouteRemote } = require('../get-shit-done/bin/lib/llm-router.cjs');
      assert.strictEqual(shouldRouteRemote('gsd-cataloger', 'lean'), true);
    });

    it('returns true for remote agent in auto mode', () => {
      const { shouldRouteRemote } = require('../get-shit-done/bin/lib/llm-router.cjs');
      assert.strictEqual(shouldRouteRemote('gsd-cataloger', 'auto'), true);
    });

    it('returns false for local agent in lean mode', () => {
      const { shouldRouteRemote } = require('../get-shit-done/bin/lib/llm-router.cjs');
      assert.strictEqual(shouldRouteRemote('gsd-planner', 'lean'), false);
    });

    it('returns false for unknown agent', () => {
      const { shouldRouteRemote } = require('../get-shit-done/bin/lib/llm-router.cjs');
      assert.strictEqual(shouldRouteRemote('unknown-agent', 'lean'), false);
    });
  });

  describe('buildMessages', () => {
    it('builds system + user messages with REMOTE_MODE_PREFIX', () => {
      const { buildMessages } = require('../get-shit-done/bin/lib/llm-router.cjs');
      const msgs = buildMessages('You are a helper.', 'Do the thing.', 'context data');
      assert.strictEqual(msgs.length, 2);
      assert.strictEqual(msgs[0].role, 'system');
      assert.ok(msgs[0].content.includes('REMOTE'));
      assert.ok(msgs[0].content.includes('You are a helper.'));
      assert.strictEqual(msgs[1].role, 'user');
      assert.ok(msgs[1].content.includes('Do the thing.'));
      assert.ok(msgs[1].content.includes('context data'));
    });

    it('builds messages without collected context', () => {
      const { buildMessages } = require('../get-shit-done/bin/lib/llm-router.cjs');
      const msgs = buildMessages('System prompt', 'Task prompt', '');
      assert.strictEqual(msgs[1].content, 'Task prompt');
    });

    it('system message instructs not to use tools', () => {
      const { buildMessages } = require('../get-shit-done/bin/lib/llm-router.cjs');
      const msgs = buildMessages('Agent prompt', 'Task', '');
      assert.ok(msgs[0].content.includes('ZERO tool access'));
      assert.ok(msgs[0].content.includes('MUST NOT output XML'));
    });
  });

  describe('sanitizeResponse', () => {
    it('strips Read/Write tool tags and their content', () => {
      const { sanitizeResponse } = require('../get-shit-done/bin/lib/llm-router.cjs');
      const input = '<Read>\n<path>foo.md</path>\n</Read>\n\n# Real Content\nHello';
      const result = sanitizeResponse(input);
      assert.ok(!result.includes('<Read>'));
      assert.ok(result.includes('# Real Content'));
      assert.ok(result.includes('Hello'));
    });

    it('strips preamble lines like "I\'ll read the file"', () => {
      const { sanitizeResponse } = require('../get-shit-done/bin/lib/llm-router.cjs');
      const input = "I'll read the files to analyze them.\n\n# Summary\nDone";
      const result = sanitizeResponse(input);
      assert.ok(!result.includes("I'll read"));
      assert.ok(result.includes('# Summary'));
    });

    it('preserves clean content unchanged', () => {
      const { sanitizeResponse } = require('../get-shit-done/bin/lib/llm-router.cjs');
      const input = '# Summary\n\nKey findings:\n- Item 1\n- Item 2';
      assert.strictEqual(sanitizeResponse(input), input);
    });
  });

  describe('PROVIDERS', () => {
    it('has deepseek-v3 and gemini-flash defined', () => {
      const { PROVIDERS } = require('../get-shit-done/bin/lib/llm-router.cjs');
      assert.ok(PROVIDERS['deepseek-v3']);
      assert.ok(PROVIDERS['gemini-flash']);
      assert.strictEqual(PROVIDERS['deepseek-v3'].format, 'openai-compatible');
      assert.strictEqual(PROVIDERS['gemini-flash'].format, 'google');
    });
  });

  describe('collectors', () => {
    it('research-synthesizer collects .md files from research dir', async () => {
      const { COLLECTORS } = require('../get-shit-done/bin/lib/llm-router.cjs');
      const researchDir = path.join(tmpDir, 'research');
      fs.mkdirSync(researchDir, { recursive: true });
      fs.writeFileSync(path.join(researchDir, 'STACK.md'), '# Stack\nNode.js');
      fs.writeFileSync(path.join(researchDir, 'ARCH.md'), '# Architecture\nMVC');
      const result = await COLLECTORS['gsd-research-synthesizer'](tmpDir);
      assert.ok(result.includes('STACK.md'));
      assert.ok(result.includes('Node.js'));
      assert.ok(result.includes('ARCH.md'));
      assert.ok(result.includes('MVC'));
    });

    it('advisor-researcher includes task prompt and existing research', async () => {
      const { COLLECTORS } = require('../get-shit-done/bin/lib/llm-router.cjs');
      const researchDir = path.join(tmpDir, 'research');
      fs.mkdirSync(researchDir, { recursive: true });
      fs.writeFileSync(path.join(researchDir, 'SUMMARY.md'), '# Summary\nDone');
      const result = await COLLECTORS['gsd-advisor-researcher'](tmpDir, 'Compare React vs Vue');
      assert.ok(result.includes('Compare React vs Vue'));
      assert.ok(result.includes('Done'));
    });
  });

  describe('routeAgent', () => {
    it('returns routed:false for local agents', async () => {
      const { routeAgent } = require('../get-shit-done/bin/lib/llm-router.cjs');
      const result = await routeAgent('gsd-planner', 'Plan something', tmpDir, 'lean');
      assert.strictEqual(result.routed, false);
    });

    it('returns routed:false in full mode', async () => {
      const { routeAgent } = require('../get-shit-done/bin/lib/llm-router.cjs');
      const result = await routeAgent('gsd-cataloger', 'Catalog', tmpDir, 'full');
      assert.strictEqual(result.routed, false);
    });

    it('returns routed:false in auto mode without api key', async () => {
      const { routeAgent } = require('../get-shit-done/bin/lib/llm-router.cjs');
      const result = await routeAgent('gsd-cataloger', 'Catalog', tmpDir, 'auto', {
        providersPath: path.join(tmpDir, 'nonexistent.json')
      });
      assert.strictEqual(result.routed, false);
    });

    it('throws in lean mode without api key', async () => {
      const { routeAgent } = require('../get-shit-done/bin/lib/llm-router.cjs');
      await assert.rejects(
        () => routeAgent('gsd-cataloger', 'Catalog', tmpDir, 'lean', {
          providersPath: path.join(tmpDir, 'nonexistent.json')
        }),
        /not configured/
      );
    });
  });
});
