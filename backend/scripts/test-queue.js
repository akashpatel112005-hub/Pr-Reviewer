import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import Job from '../src/models/Job.js';
import { startWorker } from '../src/worker/worker.js';
import { recoverStaleJobs } from '../src/worker/queue.js';

const PREFIX = 'test-q-';
const scope = { deliveryId: new RegExp('^' + PREFIX) };
const quiet = { log() {}, warn() {}, error() {} };
const fast = { pollMs: 100, backoffBaseMs: 300, backoffMaxMs: 5000, jobTimeoutMs: 5000, staleMs: 60000, log: quiet, scope };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let passed = 0;
let failed = 0;
function check(name, ok, detail = '') {
  if (ok) passed += 1;
  else failed += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`);
}

function makeJob(tag, extra = {}) {
  return Job.create({
    deliveryId: `${PREFIX}${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    repoFullName: 'me/repo',
    prNumber: 1,
    headSha: 'a'.repeat(40),
    ...extra,
  });
}

async function waitFor(id, statuses, timeoutMs = 15000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const j = await Job.findById(id).lean();
    if (j && statuses.includes(j.status)) return j;
    await sleep(100);
  }
  return Job.findById(id).lean();
}

try {
  await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 10000 });
  await Job.deleteMany(scope);

  // 1. Success
  {
    const job = await makeJob('ok');
    const w = startWorker({ ...fast, handler: async () => {} });
    const res = await waitFor(job._id, ['done']);
    await w.stop();
    check('successful job ends as done after 1 attempt', res.status === 'done' && res.attempts === 1);
  }

  // 2. Transient errors retry with growing delay, then fail
  {
    const job = await makeJob('retry', { maxAttempts: 3 });
    const times = [];
    const w = startWorker({ ...fast, handler: async () => { times.push(Date.now()); throw new Error('temporary outage'); } });
    const res = await waitFor(job._id, ['failed'], 20000);
    await w.stop();
    check('transient error is retried up to maxAttempts, then failed',
      res.status === 'failed' && res.attempts === 3 && times.length === 3, `status=${res.status} attempts=${res.attempts}`);
    const gap1 = times[1] - times[0];
    const gap2 = times[2] - times[1];
    check('retry delay grows (exponential backoff)', gap1 >= 250 && gap2 > gap1, `gaps ${gap1}ms then ${gap2}ms`);
    check('last error is stored on the job', res.lastError === 'temporary outage');
  }

  // 3. Permanent errors fail immediately
  {
    const job = await makeJob('perm', { maxAttempts: 3 });
    let calls = 0;
    const w = startWorker({ ...fast, handler: async () => { calls += 1; throw Object.assign(new Error('bad token'), { permanent: true }); } });
    const res = await waitFor(job._id, ['failed']);
    await sleep(500);
    await w.stop();
    check('permanent error fails immediately without retries', res.status === 'failed' && res.attempts === 1 && calls === 1, `attempts=${res.attempts} calls=${calls}`);
  }

  // 4. A job that never finishes hits the time limit
  {
    const job = await makeJob('hang', { maxAttempts: 1 });
    const w = startWorker({ ...fast, jobTimeoutMs: 200, handler: () => new Promise(() => {}) });
    const res = await waitFor(job._id, ['failed']);
    await w.stop();
    check('job that never finishes is stopped by the time limit', res.status === 'failed' && /time limit/.test(res.lastError || ''));
  }
  await Job.deleteMany(scope);

  // 5. Stale recovery
  {
    const old = new Date(Date.now() - 60 * 60 * 1000);
    const a = await makeJob('stale-a', { status: 'processing', lockedAt: old, attempts: 1 });
    const b = await makeJob('stale-b', { status: 'processing', lockedAt: old, attempts: 3, maxAttempts: 3 });
    const c = await makeJob('stale-c', { status: 'processing', lockedAt: new Date(), attempts: 1 });
    await recoverStaleJobs({ staleMs: 10 * 60 * 1000, scope });
    const [ra, rb, rc] = await Promise.all([a, b, c].map((j) => Job.findById(j._id).lean()));
    check('stale job with attempts left is re-queued', ra.status === 'queued');
    check('stale job with no attempts left is failed', rb.status === 'failed');
    check('recently locked job is left alone', rc.status === 'processing');
  }
  await Job.deleteMany(scope);

  // 6. Two competing workers never process the same job twice
  {
    const jobs = await Promise.all([0, 1, 2, 3, 4, 5].map((i) => makeJob('multi' + i)));
    const seen = new Map();
    const handler = async (job) => {
      const id = String(job._id);
      seen.set(id, (seen.get(id) || 0) + 1);
      await sleep(80);
    };
    const w1 = startWorker({ ...fast, handler });
    const w2 = startWorker({ ...fast, handler });
    await Promise.all(jobs.map((j) => waitFor(j._id, ['done'])));
    await w1.stop();
    await w2.stop();
    const once = jobs.every((j) => seen.get(String(j._id)) === 1) && seen.size === jobs.length;
    check('two competing workers process every job exactly once', once, `${seen.size} of ${jobs.length} jobs seen`);
  }
} catch (err) {
  failed += 1;
  console.error('Script error:', err.message);
} finally {
  await Job.deleteMany(scope).catch(() => {});
  await mongoose.disconnect().catch(() => {});
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}