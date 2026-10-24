import { describe, it, expect } from 'vitest';
import { computeSignature, verifySignature } from '../src/services/webhookSecurity.js';
import { classifyEvent } from '../src/services/webhookEvents.js';

const secret = 'test-secret';
const body = Buffer.from('{"hello":"world"}');

describe('verifySignature', () => {
  it('accepts a correct signature', () => {
    expect(verifySignature(body, computeSignature(body, secret), secret)).toBe(true);
  });
  it('rejects a wrong secret', () => {
    expect(verifySignature(body, computeSignature(body, 'other'), secret)).toBe(false);
  });
  it('rejects a tampered body', () => {
    const sig = computeSignature(body, secret);
    expect(verifySignature(Buffer.from('{"hello":"evil"}'), sig, secret)).toBe(false);
  });
  it('rejects missing, malformed, or wrong-length headers without throwing', () => {
    expect(verifySignature(body, undefined, secret)).toBe(false);
    expect(verifySignature(body, '', secret)).toBe(false);
    expect(verifySignature(body, 'sha256=abc', secret)).toBe(false);
    expect(verifySignature(body, 'md5=whatever', secret)).toBe(false);
  });
  it('rejects when there is no secret or the body is not a Buffer', () => {
    expect(verifySignature(body, computeSignature(body, secret), '')).toBe(false);
    expect(verifySignature('text', computeSignature(body, secret), secret)).toBe(false);
  });
});

const sha = 'a'.repeat(40);
const pr = (over = {}) => {
  const { pull_request, ...rest } = over;
  return {
    action: 'opened',
    pull_request: { number: 3, draft: false, head: { sha }, ...(pull_request || {}) },
    repository: { full_name: 'me/repo' },
    ...rest,
  };
};

describe('classifyEvent', () => {
  it('answers ping', () => {
    expect(classifyEvent('ping', {}).type).toBe('ping');
  });
  it('ignores events other than pull_request', () => {
    expect(classifyEvent('issues', {}).type).toBe('ignore');
    expect(classifyEvent('push', {}).type).toBe('ignore');
  });
  it('ignores actions we do not review', () => {
    expect(classifyEvent('pull_request', pr({ action: 'closed' })).type).toBe('ignore');
    expect(classifyEvent('pull_request', pr({ action: 'labeled' })).type).toBe('ignore');
  });
  it('ignores draft PRs', () => {
    const r = classifyEvent('pull_request', pr({ pull_request: { draft: true } }));
    expect(r.type).toBe('ignore');
    expect(r.reason).toMatch(/draft/);
  });
  it.each(['opened', 'synchronize', 'reopened', 'ready_for_review'])('enqueues on %s', (action) => {
    const r = classifyEvent('pull_request', pr({ action }));
    expect(r.type).toBe('enqueue');
    expect(r.job).toEqual({ repoFullName: 'me/repo', prNumber: 3, headSha: sha });
  });
  it('rejects malformed payloads', () => {
    expect(classifyEvent('pull_request', null).type).toBe('invalid');
    expect(classifyEvent('pull_request', { ...pr(), repository: {} }).type).toBe('invalid');
    expect(classifyEvent('pull_request', { ...pr(), repository: { full_name: 'no-slash' } }).type).toBe('invalid');
    expect(classifyEvent('pull_request', pr({ pull_request: { head: { sha: 'short' } } })).type).toBe('invalid');
    expect(classifyEvent('pull_request', pr({ pull_request: { number: 'x' } })).type).toBe('invalid');
  });
});