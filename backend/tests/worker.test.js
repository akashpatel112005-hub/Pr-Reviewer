import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/worker/queue.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, markDone: vi.fn(), markOutcome: vi.fn() };
});

import { markDone, markOutcome } from '../src/worker/queue.js';
import { processJob } from '../src/worker/worker.js';

const job = (over = {}) => ({ _id: 'j1', attempts: 1, maxAttempts: 3, ...over });

beforeEach(() => {
  markDone.mockReset();
  markOutcome.mockReset();
});

describe('processJob', () => {
  it('marks the job done when the handler succeeds', async () => {
    const result = await processJob(job(), async () => {});
    expect(result.status).toBe('done');
    expect(markDone).toHaveBeenCalledTimes(1);
    expect(markOutcome).not.toHaveBeenCalled();
  });

  it('re-queues a job after a transient error', async () => {
    const result = await processJob(job(), async () => { throw new Error('rate limited'); }, { backoffBaseMs: 1000 });
    expect(result.status).toBe('queued');
    expect(markOutcome).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ status: 'queued' }));
  });

  it('fails immediately on a permanent error', async () => {
    const err = Object.assign(new Error('bad key'), { permanent: true });
    const result = await processJob(job(), async () => { throw err; });
    expect(result.status).toBe('failed');
  });

  it('fails when the last attempt fails', async () => {
    const result = await processJob(job({ attempts: 3 }), async () => { throw new Error('x'); });
    expect(result.status).toBe('failed');
  });

  it('treats a handler that never finishes as a transient timeout', async () => {
    const result = await processJob(job(), () => new Promise(() => {}), { jobTimeoutMs: 20 });
    expect(result.status).toBe('queued');
    expect(result.lastError).toMatch(/time limit/);
  });
});