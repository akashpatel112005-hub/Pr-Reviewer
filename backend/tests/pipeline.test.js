import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  getPullRequest: vi.fn(),
  getPullRequestFiles: vi.fn(),
  reviewChunks: vi.fn(),
  summarizePR: vi.fn(),
  publishReview: vi.fn(),
  prUpsert: vi.fn(),
  reviewUpsert: vi.fn(),
  findingDelete: vi.fn(),
  findingInsert: vi.fn(),
}));

vi.mock('../src/services/github.js', () => ({
  getPullRequest: mocks.getPullRequest,
  getPullRequestFiles: mocks.getPullRequestFiles,
}));
vi.mock('../src/services/reviewEngine.js', () => ({ reviewChunks: mocks.reviewChunks }));
vi.mock('../src/services/summary.js', () => ({ summarizePR: mocks.summarizePR }));
vi.mock('../src/services/publisher.js', () => ({ publishReview: mocks.publishReview }));
vi.mock('../src/models/PullRequest.js', () => ({ default: { findOneAndUpdate: mocks.prUpsert } }));
vi.mock('../src/models/Review.js', () => ({ default: { findOneAndUpdate: mocks.reviewUpsert } }));
vi.mock('../src/models/Finding.js', () => ({ default: { deleteMany: mocks.findingDelete, insertMany: mocks.findingInsert } }));

import { runReview } from '../src/services/pipeline.js';

const SHA = 'a'.repeat(40);
const patch = ['@@ -0,0 +1,3 @@', '+const a = 1;', '+const b = 2;', '+const c = 3;'].join('\n');
const files = [
  { filename: 'app.js', status: 'added', additions: 3, deletions: 0, patch },
  { filename: 'package-lock.json', status: 'modified', additions: 1, deletions: 1, patch },
];
const pr = { title: 'Add app', body: '', author: 'me', headSha: SHA, htmlUrl: 'https://github.com/me/repo/pull/1', state: 'open' };
const job = { _id: 'job1', repoFullName: 'me/repo', prNumber: 1, headSha: SHA };
const finding = (over = {}) => ({
  file: 'app.js', line: 2, severity: 'warning', category: 'security',
  message: 'API key is hard-coded in source', suggestion: 'Use an env var', ...over,
});
const summary = { summary: 'Adds app.', changes: ['Adds app.js'], riskLevel: 'high', riskReason: 'Critical findings.', summaryError: null };
const quiet = { log() {}, warn() {}, error() {} };

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.getPullRequest.mockResolvedValue(pr);
  mocks.getPullRequestFiles.mockResolvedValue(files);
  mocks.reviewChunks.mockResolvedValue({ findings: [finding()], warnings: [] });
  mocks.summarizePR.mockResolvedValue(summary);
  mocks.publishReview.mockResolvedValue({ posted: true, url: 'https://x/review', inlineCount: 1 });
  mocks.prUpsert.mockResolvedValue({ _id: 'pr1' });
  mocks.reviewUpsert.mockResolvedValue({ _id: 'rev1' });
  mocks.findingDelete.mockResolvedValue({});
  mocks.findingInsert.mockResolvedValue([]);
});

describe('runReview', () => {
  it('reviews, publishes, and saves everything', async () => {
    const result = await runReview(job, { log: quiet });
    expect(result.status).toBe('reviewed');
    const args = mocks.publishReview.mock.calls[0][0];
    expect(args.headSha).toBe(SHA);
    expect(args.files.map((x) => x.filename)).toEqual(['app.js']);
    expect(args.skipped).toEqual([{ file: 'package-lock.json', reason: 'lockfile' }]);
    expect(mocks.reviewUpsert).toHaveBeenCalledTimes(1);
    expect(mocks.findingInsert).toHaveBeenCalledTimes(1);
  });

  it('raises a hard-coded secret to critical before summarizing and publishing', async () => {
    await runReview(job, { log: quiet });
    expect(mocks.summarizePR.mock.calls[0][0].findings[0].severity).toBe('critical');
    expect(mocks.publishReview.mock.calls[0][0].findings[0].severity).toBe('critical');
  });

  it('skips a stale commit without calling the LLM or GitHub review API', async () => {
    mocks.getPullRequest.mockResolvedValue({ ...pr, headSha: 'b'.repeat(40) });
    const result = await runReview(job, { log: quiet });
    expect(result.status).toBe('skipped');
    expect(mocks.reviewChunks).not.toHaveBeenCalled();
    expect(mocks.publishReview).not.toHaveBeenCalled();
  });

  it('skips a closed pull request', async () => {
    mocks.getPullRequest.mockResolvedValue({ ...pr, state: 'closed' });
    const result = await runReview(job, { log: quiet });
    expect(result.status).toBe('skipped');
    expect(mocks.publishReview).not.toHaveBeenCalled();
  });

  it('still publishes and saves when the summary fails', async () => {
    mocks.summarizePR.mockResolvedValue({ ...summary, summary: null, changes: [], summaryError: 'boom' });
    const result = await runReview(job, { log: quiet });
    expect(result.status).toBe('reviewed');
    expect(mocks.publishReview).toHaveBeenCalledTimes(1);
    expect(mocks.reviewUpsert.mock.calls[0][1].$set.summaryError).toBe('boom');
  });

  it('does not call the LLM when no file is reviewable, but still posts a review', async () => {
    mocks.getPullRequestFiles.mockResolvedValue([files[1]]);
    await runReview(job, { log: quiet });
    expect(mocks.reviewChunks).not.toHaveBeenCalled();
    expect(mocks.publishReview).toHaveBeenCalledTimes(1);
  });

  it('records a commit that was already reviewed without posting twice', async () => {
    mocks.publishReview.mockResolvedValue({ posted: false, skipped: true, url: 'https://x/old' });
    await runReview(job, { log: quiet });
    const set = mocks.reviewUpsert.mock.calls[0][1].$set;
    expect(set.posted).toBe(false);
    expect(set.githubReviewUrl).toBe('https://x/old');
  });

  it('replaces old findings so a re-run never duplicates them', async () => {
    await runReview(job, { log: quiet });
    expect(mocks.findingDelete).toHaveBeenCalledWith({ review: 'rev1' });
  });

  it('passes a permanent GitHub error up so the worker will not retry', async () => {
    mocks.getPullRequest.mockRejectedValue(Object.assign(new Error('not found'), { permanent: true }));
    const err = await runReview(job, { log: quiet }).catch((e) => e);
    expect(err.permanent).toBe(true);
    expect(mocks.publishReview).not.toHaveBeenCalled();
  });

  it('saves and publishes nothing when the review itself fails', async () => {
    mocks.reviewChunks.mockRejectedValue(new Error('llm down'));
    await expect(runReview(job, { log: quiet })).rejects.toThrow('llm down');
    expect(mocks.publishReview).not.toHaveBeenCalled();
    expect(mocks.reviewUpsert).not.toHaveBeenCalled();
  });
});