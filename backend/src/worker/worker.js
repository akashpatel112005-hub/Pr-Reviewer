import { DEFAULTS, claimNextJob, markDone, markOutcome, decideOutcome, recoverStaleJobs } from './queue.js';

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(Object.assign(new Error(`Job exceeded the ${Math.round(ms / 1000)}s time limit`), { permanent: false })),
      ms
    );
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export async function processJob(job, handler, options = {}) {
  const opts = { ...DEFAULTS, ...options };
  let error = null;

  try {
    await withTimeout(Promise.resolve().then(() => handler(job)), opts.jobTimeoutMs);
  } catch (err) {
    error = err ?? new Error('Unknown error');
  }

  if (!error) {
    await markDone(job);
    return { status: 'done' };
  }

  const outcome = decideOutcome({
    attempts: job.attempts,
    maxAttempts: job.maxAttempts,
    error,
    backoffBaseMs: opts.backoffBaseMs,
    backoffMaxMs: opts.backoffMaxMs,
  });
  await markOutcome(job, outcome);
  return outcome;
}

// handler(job) does the real work. If it throws, the error decides retry vs fail:
// error.permanent === true fails immediately, anything else is retried with backoff.
export function startWorker({ handler, scope = {}, log = console, ...options } = {}) {
  if (typeof handler !== 'function') throw new Error('startWorker needs a handler function');
  const opts = { ...DEFAULTS, ...options };

  let running = true;
  let timer = null;
  let current = Promise.resolve();
  let lastRecovery = 0;

  async function recoverIfDue() {
    if (Date.now() - lastRecovery < Math.min(opts.staleMs, 30000)) return;
    lastRecovery = Date.now();
    const result = await recoverStaleJobs({ staleMs: opts.staleMs, scope });
    if (result.failed || result.requeued) {
      log.warn(`[worker] recovered stale jobs: ${result.requeued} re-queued, ${result.failed} failed`);
    }
  }

  async function tick() {
    let delay = opts.pollMs;
    try {
      await recoverIfDue();
      const job = await claimNextJob({ scope });
      if (job) {
        delay = 0;
        log.log(`[worker] job ${job._id} ${job.repoFullName}#${job.prNumber} attempt ${job.attempts}/${job.maxAttempts}`);
        const outcome = await processJob(job, handler, opts);
        const retry = outcome.status === 'queued' ? ` (retry in ${Math.round(outcome.delayMs / 1000)}s)` : '';
        const why = outcome.lastError ? `: ${outcome.lastError}` : '';
        log.log(`[worker] job ${job._id} -> ${outcome.status}${retry}${why}`);
      }
    } catch (err) {
      log.error('[worker] loop error:', err.message);
    }
    if (running) schedule(delay);
  }

  function schedule(delay) {
    timer = setTimeout(() => {
      current = tick();
    }, delay);
  }

  schedule(0);

  return {
    // Waits for the job in progress to finish, then stops polling.
    async stop() {
      running = false;
      if (timer) clearTimeout(timer);
      await current.catch(() => {});
    },
  };
}