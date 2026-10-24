import { runReview } from '../services/pipeline.js';

// The worker calls this for every claimed job. If it throws, the error's .permanent flag
// decides whether the job is retried with backoff or failed immediately.
export async function reviewJobHandler(job) {
  const result = await runReview(job);
  console.log(`[handler] ${job.repoFullName}#${job.prNumber} -> ${result.status}${result.reason ? ' (' + result.reason + ')' : ''}`);
}