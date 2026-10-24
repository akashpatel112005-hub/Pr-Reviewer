import { describe, it, expect } from 'vitest';
import { getSkipReason, parsePatch, getCommentableLines, prepareDiff } from '../src/services/diffFilter.js';

const patch = [
  '@@ -1,4 +1,5 @@',
  ' const a = 1;',
  '-const b = 2;',
  '+const b = 3;',
  '+const c = 4;',
  ' console.log(a);',
].join('\n');

describe('getSkipReason', () => {
  it('skips lockfiles', () => {
    expect(getSkipReason({ filename: 'package-lock.json', status: 'modified', patch: 'x' })).toBe('lockfile');
    expect(getSkipReason({ filename: 'web/yarn.lock', status: 'modified', patch: 'x' })).toBe('lockfile');
  });
  it('skips images and binaries', () => {
    expect(getSkipReason({ filename: 'logo.png', status: 'added', patch: null })).toBeTruthy();
  });
  it('skips generated folders and minified files', () => {
    expect(getSkipReason({ filename: 'dist/app.js', status: 'modified', patch: 'x' })).toBeTruthy();
    expect(getSkipReason({ filename: 'public/app.min.js', status: 'modified', patch: 'x' })).toBe('minified file');
  });
  it('skips deleted files and files without a patch', () => {
    expect(getSkipReason({ filename: 'a.js', status: 'removed', patch: 'x' })).toBe('deleted file');
    expect(getSkipReason({ filename: 'a.js', status: 'modified', patch: null })).toBeTruthy();
  });
  it('keeps normal source files', () => {
    expect(getSkipReason({ filename: 'src/app.js', status: 'modified', patch })).toBeNull();
  });
});

describe('parsePatch', () => {
  it('tracks real line numbers in the new file', () => {
    const added = parsePatch(patch).filter((l) => l.type === 'add').map((l) => l.line);
    expect(added).toEqual([2, 3]);
  });
  it('starts numbering from the hunk header', () => {
    const p = ['@@ -10,2 +11,3 @@', ' keep', '+new', ' end'].join('\n');
    const added = parsePatch(p).filter((l) => l.type === 'add').map((l) => l.line);
    expect(added).toEqual([12]);
  });
  it('does not count deleted lines', () => {
    const lines = getCommentableLines(patch);
    expect([...lines]).toEqual([1, 2, 3, 4]);
  });
});

describe('prepareDiff', () => {
  const files = [
    { filename: 'src/app.js', status: 'modified', additions: 2, deletions: 1, patch },
    { filename: 'package-lock.json', status: 'modified', additions: 1, deletions: 1, patch },
  ];
  it('separates reviewable and skipped files', () => {
    const result = prepareDiff(files);
    expect(result.reviewable.map((f) => f.filename)).toEqual(['src/app.js']);
    expect(result.skipped).toEqual([{ file: 'package-lock.json', reason: 'lockfile' }]);
    expect(result.chunks.length).toBe(1);
  });
  it('splits files into several chunks when over budget', () => {
    const many = [1, 2, 3].map((n) => ({ filename: `f${n}.js`, status: 'modified', additions: 1, deletions: 0, patch }));
    const result = prepareDiff(many, { maxChars: 100 });
    expect(result.chunks.length).toBeGreaterThan(1);
  });
  it('truncates one oversized file instead of dropping it', () => {
    const result = prepareDiff([files[0]], { maxChars: 20 });
    expect(result.reviewable.length).toBe(1);
    expect(result.truncated).toEqual(['src/app.js']);
  });
});