import { describe, it, expect } from 'vitest';
import { computeBackoff, decideOutcome } from '../src/worker/queue.js';

describe('computeBackoff', () => {
  it('doubles with each attempt', () => {
    expect(computeBackoff(1, 1000)).toBe(1000);
    expect(computeBackoff(2, 1000)).toBe(2000);
    expect(computeBackoff(3, 1000)).toBe(4000);
  });
  it('never exceeds the cap', () => {
    expect(computeBackoff(20, 1000, 5000)).toBe(5000);
  });
});

describe('decideOutcome', () => {
  const now = new Date('2026-10-24T10:00:00Z');

  it('re-queues a transient failure with a future runAt', () => {
    const o = decideOutcome({ attempts: 1, maxAttempts: 3, error: new Error('timeout'), now, backoffBaseMs: 1000 });
    expect(o.status).toBe('queued');
    expect(o.runAt.getTime()).toBe(now.getTime() + 1000);
    expect(o.lastError).toBe('timeout');
  });
  it('increases the delay on later attempts', () => {
    const o = decideOutcome({ attempts: 2, maxAttempts: 3, error: new Error('x'), now, backoffBaseMs: 1000 });
    expect(o.delayMs).toBe(2000);
  });
  it('fails permanent errors immediately', () => {
    const err = Object.assign(new Error('bad token'), { permanent: true });
    const o = decideOutcome({ attempts: 1, maxAttempts: 3, error: err, now });
    expect(o.status).toBe('failed');
    expect(o.runAt).toBeUndefined();
  });
  it('fails once attempts are used up', () => {
    const o = decideOutcome({ attempts: 3, maxAttempts: 3, error: new Error('x'), now });
    expect(o.status).toBe('failed');
    expect(o.reason).toBe('attempts exhausted');
  });
  it('handles odd error values and trims long messages', () => {
    expect(decideOutcome({ attempts: 1, maxAttempts: 3, error: 'plain text', now }).lastError).toBe('plain text');
    expect(decideOutcome({ attempts: 1, maxAttempts: 3, error: null, now }).lastError).toBe('Unknown error');
    expect(decideOutcome({ attempts: 1, maxAttempts: 3, error: new Error('x'.repeat(900)), now }).lastError).toHaveLength(500);
  });
});