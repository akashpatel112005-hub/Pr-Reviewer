import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import crypto from 'node:crypto';

const mocks = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock('../src/models/Job.js', () => ({ default: { create: mocks.create } }));
vi.mock('../src/config/env.js', () => ({ env: { githubWebhookSecret: 'test-secret' } }));

import webhookRouter from '../src/routes/webhook.js';

const app = express();
app.use('/webhook', webhookRouter);

const sha = 'a'.repeat(40);
const payload = (over = {}) => ({
  action: 'opened',
  number: 1,
  pull_request: { number: 1, draft: false, head: { sha } },
  repository: { full_name: 'me/repo' },
  ...over,
});
const sign = (raw, secret = 'test-secret') =>
  'sha256=' + crypto.createHmac('sha256', secret).update(raw).digest('hex');

function send(body, { event = 'pull_request', delivery = 'd-1', signature } = {}) {
  const raw = typeof body === 'string' ? body : JSON.stringify(body);
  return request(app)
    .post('/webhook')
    .set('content-type', 'application/json')
    .set('x-github-event', event)
    .set('x-github-delivery', delivery)
    .set('x-hub-signature-256', signature ?? sign(raw))
    .send(raw);
}

beforeEach(() => {
  mocks.create.mockReset();
  mocks.create.mockResolvedValue({ _id: 'job123' });
});

describe('POST /webhook', () => {
  it('queues exactly one job for a valid signed delivery', async () => {
    const res = await send(payload());
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'queued', jobId: 'job123' });
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.create).toHaveBeenCalledWith({ deliveryId: 'd-1', repoFullName: 'me/repo', prNumber: 1, headSha: sha });
  });

  it('creates no second job when the same delivery is replayed', async () => {
    mocks.create.mockRejectedValueOnce(Object.assign(new Error('E11000 duplicate key'), { code: 11000 }));
    const res = await send(payload());
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('duplicate');
  });

  it('returns 401 and queues nothing for a bad signature', async () => {
    const res = await send(payload(), { signature: 'sha256=' + '0'.repeat(64) });
    expect(res.status).toBe(401);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('returns 401 for a missing or malformed signature', async () => {
    const res = await send(payload(), { signature: 'sha256=bad' });
    expect(res.status).toBe(401);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('returns 401 when the body was changed after signing', async () => {
    const signed = sign(JSON.stringify(payload()));
    const res = await send(payload({ action: 'synchronize' }), { signature: signed });
    expect(res.status).toBe(401);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('answers ping without queueing', async () => {
    const res = await send({ zen: 'hi' }, { event: 'ping' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('pong');
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('ignores closed PRs, draft PRs, and other events', async () => {
    const closed = await send(payload({ action: 'closed' }));
    const draft = await send(payload({ pull_request: { number: 1, draft: true, head: { sha } } }));
    const other = await send({ issue: {} }, { event: 'issues' });
    for (const res of [closed, draft, other]) {
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ignored');
    }
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('returns 400 for a signed but non-JSON body', async () => {
    const res = await send('payload=not-json');
    expect(res.status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('returns 400 when the delivery id header is missing', async () => {
    const res = await send(payload(), { delivery: '' });
    expect(res.status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('returns 500 when the database fails, so GitHub can redeliver', async () => {
    mocks.create.mockRejectedValueOnce(new Error('db down'));
    const res = await send(payload());
    expect(res.status).toBe(500);
  });
});