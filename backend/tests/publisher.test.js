import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({ paginate: vi.fn(), createReview: vi.fn() }));

vi.mock('octokit', () => ({
  Octokit: class {
    constructor() {
      this.paginate = mocks.paginate;
      this.rest = { pulls: { listReviews: {}, createReview: mocks.createReview } };
    }
  },
}));
vi.mock('../src/config/env.js', () => ({ env: { githubToken: 'test-token' } }));

import {
  publishReview, splitFindings, buildReviewBody, markerFor, formatInlineComment,
} from '../src/services/publisher.js';
import { GitHubError } from '../src/services/github.js';

const files = [{ filename: 'app.js', commentableLines: [1, 2, 3, 6] }];
const finding = (over = {}) => ({
  file: 'app.js', line: 6, severity: 'critical', category: 'security',
  message: 'SQL injection', suggestion: 'Use parameters', ...over,
});
const summary = { summary: 'Adds an endpoint.', changes: ['Adds GET /user'], riskLevel: 'high', riskReason: 'Critical findings.' };
const base = {
  repoFullName: 'me/repo', prNumber: 1, headSha: 'abc1234def',
  summary, findings: [finding()], files,
  skipped: [{ file: 'package-lock.json', reason: 'lockfile' }],
};
const reviewResponse = { data: { id: 7, html_url: 'https://github.com/me/repo/pull/1#pullrequestreview-7' } };

beforeEach(() => {
  mocks.paginate.mockReset();
  mocks.createReview.mockReset();
});

describe('splitFindings', () => {
  it('sends only commentable lines inline', () => {
    const { inline, general } = splitFindings([finding(), finding({ line: 99 }), finding({ file: 'x.js' })], files);
    expect(inline).toHaveLength(1);
    expect(general).toHaveLength(2);
  });
});

describe('buildReviewBody', () => {
  it('includes marker, risk, counts, and skipped files', () => {
    const body = buildReviewBody({ marker: markerFor('abc'), summary, findings: [finding()], general: [], skipped: base.skipped });
    expect(body).toContain(markerFor('abc'));
    expect(body).toContain('Risk: HIGH');
    expect(body).toContain('1 finding (1 critical)');
    expect(body).toContain('package-lock.json');
  });
  it('posts a positive note when there are no findings', () => {
    const body = buildReviewBody({ marker: markerFor('abc'), summary, findings: [], general: [] });
    expect(body).toContain('No issues were found');
  });
  it('handles a missing summary', () => {
    const body = buildReviewBody({ marker: markerFor('abc'), summary: null, findings: [], general: [] });
    expect(body).toContain('could not be generated');
    expect(body).toContain('Risk: not rated');
  });
  it('lists findings that could not be placed inline', () => {
    const body = buildReviewBody({ marker: markerFor('abc'), summary, findings: [finding()], general: [finding()] });
    expect(body).toContain('Findings not attached to a line');
  });
});

describe('formatInlineComment', () => {
  it('shows severity, message, and the suggested fix', () => {
    const text = formatInlineComment(finding());
    expect(text).toContain('Critical');
    expect(text).toContain('SQL injection');
    expect(text).toContain('Suggested fix');
  });
});

describe('publishReview', () => {
  it('posts one review with inline comments on the right lines', async () => {
    mocks.paginate.mockResolvedValue([]);
    mocks.createReview.mockResolvedValue(reviewResponse);
    const result = await publishReview(base);
    expect(mocks.createReview).toHaveBeenCalledTimes(1);
    const args = mocks.createReview.mock.calls[0][0];
    expect(args.event).toBe('COMMENT');
    expect(args.commit_id).toBe('abc1234def');
    expect(args.comments).toEqual([expect.objectContaining({ path: 'app.js', line: 6, side: 'RIGHT' })]);
    expect(result.posted).toBe(true);
    expect(result.inlineCount).toBe(1);
  });

  it('does not post a duplicate for a commit that was already reviewed', async () => {
    mocks.paginate.mockResolvedValue([{ id: 5, body: markerFor('abc1234def') + '\nold review', html_url: 'https://example.com/r' }]);
    const result = await publishReview(base);
    expect(mocks.createReview).not.toHaveBeenCalled();
    expect(result.skipped).toBe(true);
  });

  it('posts again when forced', async () => {
    mocks.paginate.mockResolvedValue([{ id: 5, body: markerFor('abc1234def'), html_url: 'u' }]);
    mocks.createReview.mockResolvedValue(reviewResponse);
    const result = await publishReview({ ...base, force: true });
    expect(mocks.createReview).toHaveBeenCalledTimes(1);
    expect(result.posted).toBe(true);
  });

  it('falls back to a body-only review when GitHub returns 422', async () => {
    mocks.paginate.mockResolvedValue([]);
    mocks.createReview
      .mockRejectedValueOnce(Object.assign(new Error('Unprocessable'), { status: 422 }))
      .mockResolvedValueOnce(reviewResponse);
    const result = await publishReview(base);
    expect(mocks.createReview).toHaveBeenCalledTimes(2);
    const second = mocks.createReview.mock.calls[1][0];
    expect(second.comments).toEqual([]);
    expect(second.body).toContain('SQL injection');
    expect(result.usedFallback).toBe(true);
  });

  it('maps a 403 to a permanent typed error', async () => {
    mocks.paginate.mockResolvedValue([]);
    mocks.createReview.mockRejectedValue(Object.assign(new Error('Resource not accessible'), { status: 403 }));
    const err = await publishReview(base).catch((e) => e);
    expect(err).toBeInstanceOf(GitHubError);
    expect(err.permanent).toBe(true);
  });

  it('treats a 500 as transient', async () => {
    mocks.paginate.mockResolvedValue([]);
    mocks.createReview.mockRejectedValue(Object.assign(new Error('boom'), { status: 502 }));
    const err = await publishReview(base).catch((e) => e);
    expect(err.permanent).toBe(false);
  });

  it('does not call GitHub in dry-run mode', async () => {
    const result = await publishReview({ ...base, dryRun: true });
    expect(result.dryRun).toBe(true);
    expect(result.comments).toHaveLength(1);
    expect(mocks.paginate).not.toHaveBeenCalled();
    expect(mocks.createReview).not.toHaveBeenCalled();
  });
});