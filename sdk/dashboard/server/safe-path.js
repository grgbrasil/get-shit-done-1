import { resolve, relative } from 'node:path';
export function safePath(basePath, requestedPath) {
    const resolved = resolve(basePath, requestedPath);
    const rel = relative(basePath, resolved);
    if (rel.startsWith('..') || resolve(basePath, rel) !== resolved) {
        throw new Error('Path traversal detected');
    }
    return resolved;
}
//# sourceMappingURL=safe-path.js.map