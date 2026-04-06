import { describe, it, expect } from 'vitest';
import { safePath } from './safe-path.js';

describe('safePath', () => {
  it('allows paths within base', () => {
    const result = safePath('/project/.planning', 'phases/01/PLAN.md');
    expect(result).toBe('/project/.planning/phases/01/PLAN.md');
  });

  it('rejects path traversal with ../', () => {
    expect(() => safePath('/project/.planning', '../../../etc/passwd')).toThrow('Path traversal');
  });

  it('rejects absolute paths outside base', () => {
    expect(() => safePath('/project/.planning', '/etc/passwd')).toThrow('Path traversal');
  });

  it('allows nested paths', () => {
    const result = safePath('/project/.planning', 'phases/02-features/02-01-PLAN.md');
    expect(result).toBe('/project/.planning/phases/02-features/02-01-PLAN.md');
  });
});
