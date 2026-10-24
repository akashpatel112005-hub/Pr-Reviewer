import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { AppError, notFound, errorHandler } from '../src/middleware/errorHandler.js';

function makeApp() {
  const app = express();
  app.use(express.json({ limit: '50b' }));
  app.post('/echo', (req, res) => res.json(req.body));
  app.get('/conflict', (req, res, next) => next(new AppError('Already exists', 409)));
  app.get('/hidden', (req, res, next) => next(new AppError('internal detail', 502, { expose: false })));
  app.get('/boom', (req, res, next) => next(new Error('database password is hunter2')));
  app.get('/cast', (req, res, next) => next(Object.assign(new Error('Cast to ObjectId failed'), { name: 'CastError' })));
  app.get('/db', (req, res, next) => next(Object.assign(new Error('server selection timed out'), { name: 'MongooseServerSelectionError' })));
  app.use(notFound);
  app.use(errorHandler);
  return app;
}

const app = makeApp();

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('errorHandler', () => {
  it('turns malformed JSON into a 400 without echoing the payload', async () => {
    const res = await request(app).post('/echo').set('content-type', 'application/json').send('{bad');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Request body is not valid JSON');
  });
  it('turns an oversized body into a 413', async () => {
    const res = await request(app).post('/echo').set('content-type', 'application/json').send(JSON.stringify({ x: 'a'.repeat(200) }));
    expect(res.status).toBe(413);
  });
  it('returns the status and message of an AppError', async () => {
    const res = await request(app).get('/conflict');
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('Already exists');
  });
  it('hides the message of an AppError marked expose: false', async () => {
    const res = await request(app).get('/hidden');
    expect(res.status).toBe(502);
    expect(JSON.stringify(res.body)).not.toContain('internal detail');
  });
  it('never leaks the message or stack of an unexpected error', async () => {
    const res = await request(app).get('/boom');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Internal server error' });
    expect(JSON.stringify(res.body)).not.toContain('hunter2');
  });
  it('maps bad ids to 400 and a down database to 503', async () => {
    expect((await request(app).get('/cast')).status).toBe(400);
    const db = await request(app).get('/db');
    expect(db.status).toBe(503);
    expect(db.body.error).toMatch(/database/i);
  });
  it('answers unknown routes with a JSON 404', async () => {
    const res = await request(app).get('/nope');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Not found');
  });
});