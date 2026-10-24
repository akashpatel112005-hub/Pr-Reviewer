import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

const SECRET = 'test-secret-test-secret-1234567890';

const mocks = vi.hoisted(() => ({
  jobById: vi.fn(),
  jobExists: vi.fn(),
  jobCreate: vi.fn(),
  jobFind: vi.fn(),
  prById: vi.fn(),
}));

vi.mock('../src/config/env.js', () => ({ env: { jwtSecret: 'test-secret-test-secret-1234567890' } }));
vi.mock('../src/models/Job.js', () => ({
  default: {
    findById: () => ({ lean: async () => mocks.jobById() }),
    exists: (...a) => mocks.jobExists(...a),
    create: (...a) => mocks.jobCreate(...a),
    find: (...a) => mocks.jobFind(...a),
    aggregate: async () => [],
  },
}));
vi.mock('../src/models/PullRequest.js', () => ({
  default: { findById: () => ({ lean: async () => mocks.prById() }) },
}));
vi.mock('../src/models/Review.js', () => ({ default: { aggregate: async () => [], countDocuments: async () => 0, find: () => ({}) } }));
vi.mock('../src/models/Finding.js', () => ({ default: { aggregate: async () => [], find: () => ({}) } }));

import apiRouter from '../src/routes/api.js';
import { requireAuth } from '../src/middleware/auth.js';

const app = express();
app.use(express.json());
app.use('/api', requireAuth, apiRouter);

const token = jwt.sign({ role: 'admin' }, SECRET, { expiresIn: '1h', algorithm: 'HS256' });
const auth = (r) => r.set('authorization', `Bearer ${token}`);
const ID = 'a'.repeat(24);
const failedJob = { _id: ID, repoFullName: 'me/repo', prNumber: 4, headSha: 'b'.repeat(40), status: 'failed' };

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
});

describe('protection', () => {
  it('rejects every API route without a token', async () => {
    for (const path of ['/api/stats', '/api/pull-requests', '/api/jobs']) {
      expect((await request(app).get(path)).status).toBe(401);
    }
    expect((await request(app).post(`/api/jobs/${ID}/rerun`)).status).toBe(401);
  });
});

describe('GET /api/stats', () => {
  it('returns zeroed counts on an empty database', async () => {
    const res = await auth(request(app).get('/api/stats'));
    expect(res.status).toBe(200);
    expect(res.body.pullRequests).toBe(0);
    expect(res.body.findings.total).toBe(0);
    expect(res.body.jobs).toEqual({ queued: 0, processing: 0, done: 0, failed: 0 });
  });
});

describe('GET /api/pull-requests/:id', () => {
  it('rejects a malformed id with 400', async () => {
    expect((await auth(request(app).get('/api/pull-requests/not-an-id'))).status).toBe(400);
  });
  it('returns 404 for an unknown pull request', async () => {
    mocks.prById.mockResolvedValue(null);
    expect((await auth(request(app).get(`/api/pull-requests/${ID}`))).status).toBe(404);
  });
});

describe('GET /api/jobs', () => {
  it('rejects an unknown status filter', async () => {
    expect((await auth(request(app).get('/api/jobs?status=banana'))).status).toBe(400);
  });
});

describe('POST /api/jobs/:id/rerun', () => {
  it('creates a fresh queued job for the same commit', async () => {
    mocks.jobById.mockResolvedValue(failedJob);
    mocks.jobExists.mockResolvedValue(null);
    mocks.jobCreate.mockResolvedValue({ _id: 'newjob' });
    const res = await auth(request(app).post(`/api/jobs/${ID}/rerun`));
    expect(res.status).toBe(201);
    expect(res.body.jobId).toBe('newjob');
    const created = mocks.jobCreate.mock.calls[0][0];
    expect(created).toMatchObject({ repoFullName: 'me/repo', prNumber: 4, headSha: 'b'.repeat(40) });
    expect(created.deliveryId).toMatch(/^rerun-/);
  });
  it('refuses to re-run a job that has not failed', async () => {
    mocks.jobById.mockResolvedValue({ ...failedJob, status: 'done' });
    const res = await auth(request(app).post(`/api/jobs/${ID}/rerun`));
    expect(res.status).toBe(409);
    expect(mocks.jobCreate).not.toHaveBeenCalled();
  });
  it('refuses when a job for the same commit is already waiting', async () => {
    mocks.jobById.mockResolvedValue(failedJob);
    mocks.jobExists.mockResolvedValue({ _id: 'x' });
    const res = await auth(request(app).post(`/api/jobs/${ID}/rerun`));
    expect(res.status).toBe(409);
    expect(mocks.jobCreate).not.toHaveBeenCalled();
  });
  it('returns 404 for an unknown job and 400 for a bad id', async () => {
    mocks.jobById.mockResolvedValue(null);
    expect((await auth(request(app).post(`/api/jobs/${ID}/rerun`))).status).toBe(404);
    expect((await auth(request(app).post('/api/jobs/zzz/rerun'))).status).toBe(400);
  });
});