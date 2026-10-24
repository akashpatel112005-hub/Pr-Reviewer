import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

vi.mock('../src/config/env.js', () => ({
  env: { adminPassword: 'correct-horse-battery', jwtSecret: 'test-secret-test-secret-123' },
}));

import { createAuthRouter } from '../src/routes/auth.js';
import { requireAuth } from '../src/middleware/auth.js';

const SECRET = 'test-secret-test-secret-123';
const PASSWORD = 'correct-horse-battery';

function makeApp(options) {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', createAuthRouter(options));
  app.get('/api/protected', requireAuth, (req, res) => res.json({ ok: true }));
  return app;
}

const login = (app, password) => request(app).post('/api/auth/login').send({ password });
const validToken = () => jwt.sign({ role: 'admin' }, SECRET, { expiresIn: '1h' });

describe('POST /api/auth/login', () => {
  it('returns a signed 8-hour token for the correct password', async () => {
    const res = await login(makeApp(), PASSWORD);
    expect(res.status).toBe(200);
    const decoded = jwt.verify(res.body.token, SECRET);
    expect(decoded.role).toBe('admin');
    expect(decoded.exp - decoded.iat).toBe(8 * 60 * 60);
  });

  it('rejects a wrong password without issuing a token', async () => {
    const res = await login(makeApp(), 'wrong');
    expect(res.status).toBe(401);
    expect(res.body.token).toBeUndefined();
  });

  it('rejects missing, non-string, empty, and oversized passwords with 400', async () => {
    const app = makeApp({ limit: 100 });
    for (const body of [{}, { password: 123 }, { password: '' }, { password: 'x'.repeat(201) }]) {
      const res = await request(app).post('/api/auth/login').send(body);
      expect(res.status).toBe(400);
    }
  });

  it('returns 503 when no admin password or secret is configured', async () => {
    const app = makeApp({ config: { adminPassword: '', jwtSecret: '' } });
    expect((await login(app, 'anything')).status).toBe(503);
  });

  it('blocks login after too many failed attempts, even with the right password', async () => {
    const app = makeApp({ limit: 3 });
    for (let i = 0; i < 3; i += 1) expect((await login(app, 'wrong')).status).toBe(401);
    expect((await login(app, PASSWORD)).status).toBe(429);
  });

  it('does not count successful logins toward the limit', async () => {
    const app = makeApp({ limit: 2 });
    for (let i = 0; i < 5; i += 1) expect((await login(app, PASSWORD)).status).toBe(200);
  });
});

describe('requireAuth', () => {
  const app = makeApp();
  const get = (token) => {
    const r = request(app).get('/api/protected');
    return token ? r.set('authorization', token) : r;
  };

  it('rejects requests without a token', async () => {
    expect((await get()).status).toBe(401);
  });
  it('rejects schemes other than Bearer', async () => {
    expect((await get('Basic abc')).status).toBe(401);
  });
  it('rejects garbage tokens', async () => {
    const res = await get('Bearer not-a-token');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid token');
  });
  it('rejects tokens signed with a different secret', async () => {
    const forged = jwt.sign({ role: 'admin' }, 'some-other-secret-value-123', { expiresIn: '1h' });
    expect((await get(`Bearer ${forged}`)).status).toBe(401);
  });
  it('rejects expired tokens with a clear message', async () => {
    const expired = jwt.sign({ role: 'admin' }, SECRET, { expiresIn: -10 });
    const res = await get(`Bearer ${expired}`);
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/expired/i);
  });
  it('rejects unsigned (alg none) tokens', async () => {
    const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const none = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ role: 'admin' })}.`;
    expect((await get(`Bearer ${none}`)).status).toBe(401);
  });
  it('accepts a valid token', async () => {
    expect((await get(`Bearer ${validToken()}`)).status).toBe(200);
  });
  it('GET /api/auth/me confirms a valid session and refuses without one', async () => {
    const ok = await request(app).get('/api/auth/me').set('authorization', `Bearer ${validToken()}`);
    expect(ok.status).toBe(200);
    expect((await request(app).get('/api/auth/me')).status).toBe(401);
  });
});