import { Octokit } from 'octokit';
import { env } from '../config/env.js';

const TIMEOUT_MS = 20000;

// permanent = retrying will not help (bad token, missing repo). Used by the worker in Task 6.
export class GitHubError extends Error {
  constructor(message, { status = null, permanent = true } = {}) {
    super(message);
    this.name = 'GitHubError';
    this.status = status;
    this.permanent = permanent;
  }
}

let client = null;

function getClient() {
  if (!env.githubToken) {
    throw new GitHubError('GITHUB_TOKEN is not set in backend/.env', { permanent: true });
  }
  if (!client) client = new Octokit({ auth: env.githubToken });
  return client;
}

function toGitHubError(err) {
  if (err instanceof GitHubError) return err;
  if (err.name === 'TimeoutError' || err.name === 'AbortError') {
    return new GitHubError('GitHub request timed out', { permanent: false });
  }
  const status = err.status;
  if (status === 404) {
    return new GitHubError(
      'Repository or pull request not found. Check the repo name, the PR number, and that the token can access this repo.',
      { status, permanent: true }
    );
  }
  if (status === 401) {
    return new GitHubError('GitHub rejected the token (401). It may be wrong or expired.', { status, permanent: true });
  }
  if (status === 403 || status === 429) {
    const remaining = err.response?.headers?.['x-ratelimit-remaining'];
    if (status === 429 || remaining === '0') {
      return new GitHubError('GitHub rate limit reached', { status, permanent: false });
    }
    return new GitHubError('GitHub refused the request (403). The token is missing a permission.', { status, permanent: true });
  }
  if (status >= 500) {
    return new GitHubError(`GitHub server error (${status})`, { status, permanent: false });
  }
  if (!status) {
    return new GitHubError(`Network error talking to GitHub: ${err.message}`, { permanent: false });
  }
  return new GitHubError(`Unexpected GitHub error (${status}): ${err.message}`, { status, permanent: true });
}

export function parseRepo(repoFullName) {
  const parts = String(repoFullName || '').split('/');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new GitHubError(`Invalid repo name "${repoFullName}". Expected owner/repo`, { permanent: true });
  }
  return { owner: parts[0], repo: parts[1] };
}

export async function getPullRequest(arg1, arg2, arg3) {
  let octokit;
  let repoFullName;
  let prNumber;
  if (typeof arg1 === 'object' && arg1 !== null && (arg1.rest || arg1.request)) {
    octokit = arg1;
    repoFullName = arg2;
    prNumber = arg3;
  } else {
    repoFullName = arg1;
    prNumber = arg2;
    octokit = arg3 || getClient();
  }
  const { owner, repo } = parseRepo(repoFullName);
  try {
    const { data } = await octokit.rest.pulls.get({
      owner,
      repo,
      pull_number: Number(prNumber),
      request: { signal: AbortSignal.timeout(TIMEOUT_MS) },
    });
    return {
      title: data.title,
      body: data.body || '',
      author: data.user?.login || '',
      headSha: data.head.sha,
      baseRef: data.base.ref,
      htmlUrl: data.html_url,
      state: data.state,
      draft: Boolean(data.draft),
      changedFiles: data.changed_files,
    };
  } catch (err) {
    throw toGitHubError(err);
  }
}

// Follows pagination, so PRs with more than 100 files are fully read.
export async function getPullRequestFiles(arg1, arg2, arg3) {
  let octokit;
  let repoFullName;
  let prNumber;
  if (typeof arg1 === 'object' && arg1 !== null && (arg1.rest || arg1.paginate)) {
    octokit = arg1;
    repoFullName = arg2;
    prNumber = arg3;
  } else {
    repoFullName = arg1;
    prNumber = arg2;
    octokit = arg3 || getClient();
  }
  const { owner, repo } = parseRepo(repoFullName);
  try {
    const files = await octokit.paginate(octokit.rest.pulls.listFiles, {
      owner,
      repo,
      pull_number: Number(prNumber),
      per_page: 100,
      request: { signal: AbortSignal.timeout(TIMEOUT_MS) },
    });
    return files.map((f) => ({
      filename: f.filename,
      status: f.status,
      additions: f.additions,
      deletions: f.deletions,
      changes: f.changes,
      patch: f.patch || null,
    }));
  } catch (err) {
    throw toGitHubError(err);
  }
}