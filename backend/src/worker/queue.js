import Job from '../models/Job.js';

export const DEFAULTS = {
  pollMs: 3000,
  jobTimeoutMs: 5 * 60 * 1000,
  staleMs: 10 * 60 * 1000,
  backoffBaseMs: 30 * 1000,
  backoffMaxMs: 15 * 60 * 1000,
};

export function computeBackoff(attempts, baseMs = DEFAULTS.backoffBaseMs, maxMs = DEFAULTS.backoffMaxMs) {
  const n = Math.max(1, attempts);
  return Math.min(baseMs * 2 ** (n - 1), maxMs);
}

// Pure decision: what happens to a job after a failed attempt. No I/O, easy to test.
export function decideOutcome({
  attempts,
  maxAttempts,
  error,
  now = new Date(),
  backoffBaseMs = DEFAULTS.backoffBaseMs,
  backoffMaxMs = DEFAULTS.backoffMaxMs,
}) {
  const lastError = String(error?.message || error || 'Unknown error').slice(0, 500);

  if (error?.permanent === true) {
    return { status: 'failed', lastError, reason: 'permanent error' };
  }
  if (attempts >= maxAttempts) {
    return { status: 'failed', lastError, reason: 'attempts exhausted' };
  }
  const delayMs = computeBackoff(attempts, backoffBaseMs, backoffMaxMs);
  return { status: 'queued', lastError, delayMs, runAt: new Date(now.getTime() + delayMs), reason: 'will retry' };
}

// Atomic claim: only one worker can flip a given job from queued to processing.
export async function claimNextJob({ scope = {}, now = new Date() } = {}) {
  const doc = await Job.findOneAndUpdate(
    { ...scope, status: 'queued', runAt: { $lte: now } },
    { $set: { status: 'processing', lockedAt: now }, $inc: { attempts: 1 } },
    { sort: { runAt: 1 }, returnDocument: 'after' }
  );
  return doc ? doc.toObject() : null;
}

export async function markDone(job) {
  await Job.updateOne(
    { _id: job._id, status: 'processing' },
    { $set: { status: 'done', lockedAt: null, lastError: null } }
  );
}

export async function markOutcome(job, outcome) {
  const set = { status: outcome.status, lockedAt: null, lastError: outcome.lastError };
  if (outcome.runAt) set.runAt = outcome.runAt;
  await Job.updateOne({ _id: job._id, status: 'processing' }, { $set: set });
}

// Jobs stuck in processing (a crashed worker) go back to the queue, or fail if out of attempts.
export async function recoverStaleJobs({ staleMs = DEFAULTS.staleMs, scope = {}, now = new Date() } = {}) {
  const cutoff = new Date(now.getTime() - staleMs);
  const stuck = { ...scope, status: 'processing', lockedAt: { $lt: cutoff } };

  const failed = await Job.updateMany(
    { ...stuck, $expr: { $gte: ['$attempts', '$maxAttempts'] } },
    { $set: { status: 'failed', lockedAt: null, lastError: 'Worker stopped while processing this job (stale lock)' } }
  );
  const requeued = await Job.updateMany(stuck, {
    $set: { status: 'queued', lockedAt: null, runAt: now, lastError: 'Worker stopped while processing this job; retrying' },
  });
  return { failed: failed.modifiedCount, requeued: requeued.modifiedCount };
}