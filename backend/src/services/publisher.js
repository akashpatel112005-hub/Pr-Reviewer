import { Octokit } from 'octokit';
import { env } from '../config/env.js';
import { GitHubError } from './github.js';

const TIMEOUT_MS = 30000;
const MAX_BODY_CHARS = 60000;
const MAX_INLINE_COMMENTS = 40;
const LABELS = { critical: 'Critical', warning: 'Warning', suggestion: 'Suggestion' };

let client = null;

function getClient() {
  if (!env.githubToken) {
    throw new GitHubError('GITHUB_TOKEN is not set in backend/.env', { permanent: true });
  }
  if (!client) client = new Octokit({ auth: env.githubToken });
  return client;
}

function splitRepo(repoFullName) {
  const [owner, repo, ...rest] = String(repoFullName || '').split('/');
  if (!owner || !repo || rest.length > 0) {
    throw new GitHubError(`Invalid repo name "${repoFullName}". Expected owner/repo`, { permanent: true });
  }
  return { owner, repo };
}

function toGitHubError(err) {
  if (err instanceof GitHubError) return err;
  if (err.name === 'TimeoutError' || err.name === 'AbortError') {
    return new GitHubError('GitHub request timed out', { permanent: false });
  }
  const status = err.status;
  if (status === 401) {
    return new GitHubError('GitHub rejected the token (401). It may be wrong or expired.', { status, permanent: true });
  }
  if (status === 403 || status === 429) {
    const retryAfter = err.response?.headers?.['retry-after'];
    if (status === 429 || retryAfter || /rate limit/i.test(err.message || '')) {
      return new GitHubError('GitHub rate limit reached', { status, permanent: false });
    }
    return new GitHubError(
      'GitHub refused to post the review (403). The token needs Pull requests: Read and write on this repo.',
      { status, permanent: true }
    );
  }
  if (status === 404) {
    return new GitHubError('Pull request not found, or the token cannot access this repo.', { status, permanent: true });
  }
  if (status === 422) {
    return new GitHubError(`GitHub rejected the review (422): ${err.message}`, { status, permanent: true });
  }
  if (status >= 500) {
    return new GitHubError(`GitHub server error (${status})`, { status, permanent: false });
  }
  if (!status) {
    return new GitHubError(`Network error talking to GitHub: ${err.message}`, { permanent: false });
  }
  return new GitHubError(`Unexpected GitHub error (${status}): ${err.message}`, { status, permanent: true });
}

// Hidden HTML comment that identifies a review made for one specific commit.
export function markerFor(headSha) {
  return `<!-- ai-pr-reviewer:sha=${headSha} -->`;
}

export function severityLabel(severity) {
  return LABELS[severity] || severity;
}

export function formatInlineComment(finding) {
  const parts = [`**${severityLabel(finding.severity)}** | ${finding.category || 'general'}`, '', finding.message];
  if (finding.suggestion) parts.push('', `**Suggested fix:** ${finding.suggestion}`);
  return parts.join('\n');
}

// Findings on lines GitHub can attach comments to go inline; the rest go into the review body.
export function splitFindings(findings, files) {
  const allowed = new Map(files.map((f) => [f.filename, new Set(f.commentableLines || [])]));
  const inline = [];
  const general = [];
  for (const f of findings) {
    if (allowed.get(f.file)?.has(f.line)) inline.push(f);
    else general.push(f);
  }
  return { inline, general };
}

function countBySeverity(findings) {
  const counts = { critical: 0, warning: 0, suggestion: 0 };
  for (const f of findings) if (counts[f.severity] !== undefined) counts[f.severity] += 1;
  return counts;
}

export function buildReviewBody({ marker, summary = null, findings = [], general = [], skipped = [], warnings = [], note = '' }) {
  const counts = countBySeverity(findings);
  const lines = [marker, '## AI Code Review', ''];

  const risk = summary?.riskLevel ? `**Risk: ${summary.riskLevel.toUpperCase()}**` : '**Risk: not rated**';
  let found = 'no issues found';
  if (findings.length > 0) {
    const parts = ['critical', 'warning', 'suggestion'].filter((s) => counts[s] > 0).map((s) => `${counts[s]} ${s}`);
    found = `${findings.length} finding${findings.length === 1 ? '' : 's'} (${parts.join(', ')})`;
  }
  lines.push(`${risk} | ${found}`, '');

  lines.push('### Summary');
  if (summary?.summary) {
    lines.push(summary.summary);
    if (summary.changes?.length) lines.push('', ...summary.changes.map((c) => `- ${c}`));
  } else {
    lines.push('_A summary could not be generated for this PR._');
  }
  if (summary?.riskReason) lines.push('', `Risk assessment: ${summary.riskReason}`);
  if (findings.length === 0) lines.push('', 'No issues were found in the reviewed changes.');
  if (note) lines.push('', `> ${note}`);

  if (general.length > 0) {
    lines.push('', '### Findings not attached to a line');
    for (const f of general) {
      const fix = f.suggestion ? ` Fix: ${f.suggestion}` : '';
      lines.push(`- **${severityLabel(f.severity)}** \`${f.file}:${f.line}\` - ${f.message}${fix}`);
    }
  }

  if (skipped.length > 0) {
    lines.push('', `<details><summary>Files not reviewed (${skipped.length})</summary>`, '');
    for (const s of skipped) lines.push(`- \`${s.file}\`: ${s.reason}`);
    lines.push('', '</details>');
  }

  if (warnings.length > 0) lines.push('', '### Notes', ...warnings.map((w) => `- ${w}`));

  lines.push('', '---', '_Automated first-pass review. A human should still review before merging._');

  const body = lines.join('\n');
  return body.length > MAX_BODY_CHARS ? body.slice(0, MAX_BODY_CHARS - 30) + '\n\n... [truncated]' : body;
}

export async function findExistingReview(octokit, { owner, repo, prNumber, marker }) {
  const reviews = await octokit.paginate(octokit.rest.pulls.listReviews, {
    owner,
    repo,
    pull_number: prNumber,
    per_page: 100,
    request: { signal: AbortSignal.timeout(TIMEOUT_MS) },
  });
  return reviews.find((r) => typeof r.body === 'string' && r.body.includes(marker)) || null;
}

async function submitReview(octokit, { owner, repo, prNumber, headSha, body, comments }) {
  const { data } = await octokit.rest.pulls.createReview({
    owner,
    repo,
    pull_number: prNumber,
    commit_id: headSha,
    event: 'COMMENT',
    body,
    comments,
    request: { signal: AbortSignal.timeout(TIMEOUT_MS) },
  });
  return data;
}

export async function publishReview({
  octokit: customOctokit = null,
  repoFullName,
  prNumber,
  headSha,
  summary = null,
  findings = [],
  files = [],
  skipped = [],
  warnings = [],
  force = false,
  dryRun = false,
}) {
  const { owner, repo } = splitRepo(repoFullName);
  const number = Number(prNumber);
  const marker = markerFor(headSha);

  const split = splitFindings(findings, files);
  const inline = split.inline.slice(0, MAX_INLINE_COMMENTS);
  const general = [...split.general, ...split.inline.slice(MAX_INLINE_COMMENTS)];

  const comments = inline.map((f) => ({
    path: f.file,
    line: f.line,
    side: 'RIGHT',
    body: formatInlineComment(f),
  }));

  const body = buildReviewBody({ marker, summary, findings, general, skipped, warnings });

  if (dryRun) return { dryRun: true, body, comments };

  const octokit = customOctokit || getClient();
  const params = { owner, repo, prNumber: number, headSha };

  try {
    if (!force) {
      const existing = await findExistingReview(octokit, { ...params, marker });
      if (existing) {
        return {
          posted: false,
          skipped: true,
          reason: 'this commit was already reviewed',
          reviewId: existing.id,
          url: existing.html_url,
        };
      }
    }

    let data;
    let usedFallback = false;
    try {
      data = await submitReview(octokit, { ...params, body, comments });
    } catch (err) {
      // GitHub returns 422 when an inline position is invalid. Retry with everything in the body.
      if (err.status === 422 && comments.length > 0) {
        const fallbackBody = buildReviewBody({
          marker,
          summary,
          findings,
          general: findings,
          skipped,
          warnings,
          note: 'GitHub could not attach inline comments to this diff, so all findings are listed below.',
        });
        data = await submitReview(octokit, { ...params, body: fallbackBody, comments: [] });
        usedFallback = true;
      } else {
        throw err;
      }
    }

    return {
      posted: true,
      skipped: false,
      reviewId: data.id,
      url: data.html_url,
      inlineCount: usedFallback ? 0 : comments.length,
      generalCount: usedFallback ? findings.length : general.length,
      usedFallback,
    };
  } catch (err) {
    throw toGitHubError(err);
  }
}