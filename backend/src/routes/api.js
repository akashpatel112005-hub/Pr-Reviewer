import { Router } from 'express';
import Job from '../models/Job.js';
import PullRequest from '../models/PullRequest.js';
import Review from '../models/Review.js';
import Finding from '../models/Finding.js';
import Repo from '../models/Repo.js';
import { env } from '../config/env.js';
import { getInstallationOctokit, listInstallationRepos, syncUserInstallations } from '../services/githubApp.js';
import { parseRepo } from '../services/github.js';

const router = Router();
const OBJECT_ID = /^[a-f0-9]{24}$/i;
const JOB_STATUSES = ['queued', 'processing', 'done', 'failed'];

// Helper to strictly parse any GitHub repository URL format
export function parseRepoUrl(input) {
  if (typeof input !== 'string') return null;
  let s = input.trim();
  s = s.replace(/^https?:\/\//i, '');
  s = s.replace(/^(www\.)?github\.com\//i, '');
  s = s.replace(/\/+$/, '');
  s = s.replace(/\.git$/i, '');
  s = s.replace(/\/+$/, '');
  s = s.replace(/^\/+/, '');
  if (/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(s)) {
    return s;
  }
  return null;
}

// Forwards async errors to the Express error handler instead of crashing the request.
const handle = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);

function countsFrom(rows, keys) {
  const out = Object.fromEntries(keys.map((k) => [k, 0]));
  for (const row of rows) if (Object.prototype.hasOwnProperty.call(out, row._id)) out[row._id] = row.n;
  return out;
}

// Returns repository full names the signed-in user is authorized to access
export async function getUserRepoNames(user) {
  // Support legacy admin user without installations
  if (user?.role === 'admin' && (!user.installationIds || user.installationIds.length === 0)) {
    const repos = await Repo.find({}).distinct('repoFullName');
    if (repos.length > 0) return repos;
    return PullRequest.find({}).distinct('repoFullName');
  }

  let ids = user?.installationIds || [];
  if (ids.length === 0 && user?.login) {
    ids = await syncUserInstallations(user);
  }
  if (ids.length === 0) return [];

  let repos = await Repo.find({ installationId: { $in: ids } }).select('repoFullName').lean();

  // If repo documents don't exist yet in DB, sync them via GitHub App
  if (repos.length === 0 && env.githubAppId && env.githubAppPrivateKey) {
    try {
      for (const instId of ids) {
        const ghRepos = await listInstallationRepos(instId);
        if (ghRepos && ghRepos.length > 0) {
          const ops = ghRepos.map((r) => ({
            updateOne: {
              filter: { installationId: instId, repoFullName: r.full_name },
              update: { $set: { githubRepoId: r.id, isPrivate: Boolean(r.private), enabled: true } },
              upsert: true,
            },
          }));
          await Repo.bulkWrite(ops);
        }
      }
      repos = await Repo.find({ installationId: { $in: ids } }).select('repoFullName').lean();
    } catch (err) {
      console.warn('Could not auto-sync repos in getUserRepoNames:', err.message);
    }
  }

  return repos.map((r) => r.repoFullName);
}

// Newest review of every pull request, joined with its PR document and scoped by repo
async function latestReviewPerPR(allowedRepos = null) {
  const matchPr = allowedRepos ? { 'pr.repoFullName': { $in: allowedRepos } } : {};
  return Review.aggregate([
    { $sort: { createdAt: -1 } },
    { $group: { _id: '$pullRequest', review: { $first: '$$ROOT' }, reviewCount: { $sum: 1 } } },
    { $lookup: { from: 'pullrequests', localField: '_id', foreignField: '_id', as: 'pr' } },
    { $unwind: '$pr' },
    { $match: matchPr },
    { $sort: { 'review.createdAt': -1 } },
    { $limit: 200 },
  ]);
}

router.get('/stats', handle(async (req, res) => {
  const allowedRepos = await getUserRepoNames(req.user);
  if (allowedRepos.length === 0) {
    return res.json({
      pullRequests: 0,
      reviews: 0,
      findings: { critical: 0, warning: 0, suggestion: 0, total: 0 },
      jobs: { queued: 0, processing: 0, done: 0, failed: 0 },
      risk: { low: 0, medium: 0, high: 0, unrated: 0 },
    });
  }

  const latest = await latestReviewPerPR(allowedRepos);
  const reviewIds = latest.map((x) => x.review._id);

  const [totalReviews, severityRows, jobRows] = await Promise.all([
    reviewIds.length,
    reviewIds.length
      ? Finding.aggregate([
          { $match: { review: { $in: reviewIds } } },
          { $group: { _id: '$severity', n: { $sum: 1 } } },
        ])
      : [],
    Job.aggregate([
      { $match: { repoFullName: { $in: allowedRepos } } },
      { $group: { _id: '$status', n: { $sum: 1 } } },
    ]),
  ]);

  const risk = { low: 0, medium: 0, high: 0, unrated: 0 };
  for (const x of latest) {
    const level = x.review.riskLevel;
    if (level && Object.prototype.hasOwnProperty.call(risk, level)) risk[level] += 1;
    else risk.unrated += 1;
  }

  const findings = countsFrom(severityRows, ['critical', 'warning', 'suggestion']);
  findings.total = findings.critical + findings.warning + findings.suggestion;

  res.json({
    pullRequests: latest.length,
    reviews: totalReviews,
    findings,
    jobs: countsFrom(jobRows, JOB_STATUSES),
    risk,
  });
}));

router.get('/pull-requests', handle(async (req, res) => {
  const allowedRepos = await getUserRepoNames(req.user);
  if (allowedRepos.length === 0) return res.json({ items: [] });

  const rows = await latestReviewPerPR(allowedRepos);
  res.json({
    items: rows.map(({ pr, review, reviewCount }) => ({
      id: String(pr._id),
      repo: pr.repoFullName,
      number: pr.prNumber,
      title: pr.title,
      author: pr.author,
      url: pr.htmlUrl,
      reviewCount,
      latest: {
        id: String(review._id),
        headSha: review.headSha,
        riskLevel: review.riskLevel,
        findingsCount: review.findingsCount,
        posted: review.posted,
        githubReviewUrl: review.githubReviewUrl,
        createdAt: review.updatedAt || review.createdAt,
      },
    })),
  });
}));

router.get('/pull-requests/:id', handle(async (req, res) => {
  if (!OBJECT_ID.test(req.params.id)) return res.status(400).json({ error: 'Invalid pull request id' });

  const allowedRepos = await getUserRepoNames(req.user);
  const pr = await PullRequest.findById(req.params.id).lean();
  if (!pr || !allowedRepos.includes(pr.repoFullName)) {
    return res.status(404).json({ error: 'Pull request not found' });
  }

  const reviews = await Review.find({ pullRequest: pr._id }).sort({ createdAt: -1 }).limit(20).lean();
  const findings = reviews.length
    ? await Finding.find({ review: { $in: reviews.map((r) => r._id) } }).sort({ filePath: 1, line: 1 }).lean()
    : [];

  const byReview = new Map();
  for (const f of findings) {
    const key = String(f.review);
    if (!byReview.has(key)) byReview.set(key, []);
    byReview.get(key).push({
      id: String(f._id),
      filePath: f.filePath,
      line: f.line,
      severity: f.severity,
      category: f.category,
      message: f.message,
      suggestion: f.suggestion,
    });
  }

  res.json({
    pullRequest: { id: String(pr._id), repo: pr.repoFullName, number: pr.prNumber, title: pr.title, author: pr.author, url: pr.htmlUrl },
    reviews: reviews.map((r) => ({
      id: String(r._id),
      headSha: r.headSha,
      riskLevel: r.riskLevel,
      riskReason: r.riskReason,
      summary: r.summary,
      changes: r.changes || [],
      summaryError: r.summaryError,
      filesReviewed: r.filesReviewed,
      filesSkipped: r.filesSkipped || [],
      warnings: r.warnings || [],
      findingsCount: r.findingsCount,
      inlineCount: r.inlineCount,
      posted: r.posted,
      githubReviewUrl: r.githubReviewUrl,
      createdAt: r.createdAt,
      findings: byReview.get(String(r._id)) || [],
    })),
  });
}));

router.get('/jobs', handle(async (req, res) => {
  const allowedRepos = await getUserRepoNames(req.user);
  if (allowedRepos.length === 0) return res.json({ items: [] });

  const { status } = req.query;
  const filter = { repoFullName: { $in: allowedRepos } };
  if (status !== undefined && status !== '') {
    if (typeof status !== 'string' || !JOB_STATUSES.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${JOB_STATUSES.join(', ')}` });
    }
    filter.status = status;
  }

  const jobs = await Job.find(filter).sort({ createdAt: -1 }).limit(100).lean();
  res.json({
    items: jobs.map((j) => ({
      id: String(j._id),
      repo: j.repoFullName,
      prNumber: j.prNumber,
      headSha: j.headSha,
      status: j.status,
      attempts: j.attempts,
      maxAttempts: j.maxAttempts,
      lastError: j.lastError,
      runAt: j.runAt,
      createdAt: j.createdAt,
      updatedAt: j.updatedAt,
      canRerun: j.status === 'failed',
    })),
  });
}));

router.post('/jobs/:id/rerun', handle(async (req, res) => {
  if (!OBJECT_ID.test(req.params.id)) return res.status(400).json({ error: 'Invalid job id' });

  const allowedRepos = await getUserRepoNames(req.user);
  const job = await Job.findById(req.params.id).lean();
  if (!job || !allowedRepos.includes(job.repoFullName)) {
    return res.status(404).json({ error: 'Job not found' });
  }
  if (job.status !== 'failed') return res.status(409).json({ error: 'Only failed jobs can be re-run' });

  const active = await Job.exists({
    repoFullName: job.repoFullName,
    prNumber: job.prNumber,
    headSha: job.headSha,
    status: { $in: ['queued', 'processing'] },
  });
  if (active) return res.status(409).json({ error: 'A job for this commit is already waiting or running' });

  const created = await Job.create({
    deliveryId: `rerun-${job._id}-${Date.now()}`,
    repoFullName: job.repoFullName,
    prNumber: job.prNumber,
    headSha: job.headSha,
    installationId: job.installationId,
  });
  res.status(201).json({ jobId: String(created._id) });
}));

// ==========================================
// Task 13.5: Connect-repository API
// ==========================================

// GET /api/repos: List repositories the user can access with reviews count
router.get('/repos', handle(async (req, res) => {
  let ids = req.user?.installationIds || [];
  if (ids.length === 0 && req.user?.login) {
    ids = await syncUserInstallations(req.user);
  }
  if (ids.length === 0) return res.json({ items: [] });

  let repos = await Repo.find({ installationId: { $in: ids } }).sort({ repoFullName: 1 }).lean();

  // If repo documents don't exist yet for this installation, attempt syncing via GitHub App
  if (repos.length === 0 && env.githubAppId && env.githubAppPrivateKey) {
    try {
      for (const instId of ids) {
        const ghRepos = await listInstallationRepos(instId);
        if (ghRepos && ghRepos.length > 0) {
          const ops = ghRepos.map((r) => ({
            updateOne: {
              filter: { installationId: instId, repoFullName: r.full_name },
              update: { $set: { githubRepoId: r.id, isPrivate: Boolean(r.private), enabled: true } },
              upsert: true,
            },
          }));
          await Repo.bulkWrite(ops);
        }
      }
      repos = await Repo.find({ installationId: { $in: ids } }).sort({ repoFullName: 1 }).lean();
    } catch (err) {
      console.warn('Could not auto-sync repos from GitHub App:', err.message);
    }
  }

  // Get review counts and latest review for each repo
  const repoNames = repos.map((r) => r.repoFullName);
  const prs = await PullRequest.find({ repoFullName: { $in: repoNames } }).select('_id repoFullName').lean();
  const prIdToRepo = new Map(prs.map((p) => [String(p._id), p.repoFullName]));

  const reviews = prs.length
    ? await Review.find({ pullRequest: { $in: prs.map((p) => p._id) } })
        .sort({ createdAt: -1 })
        .select('pullRequest summary riskLevel createdAt')
        .lean()
    : [];

  const counts = new Map();
  const latestByRepo = new Map();

  for (const rev of reviews) {
    const repoName = prIdToRepo.get(String(rev.pullRequest));
    if (!repoName) continue;
    counts.set(repoName, (counts.get(repoName) || 0) + 1);
    if (!latestByRepo.has(repoName)) {
      latestByRepo.set(repoName, {
        summary: rev.summary,
        riskLevel: rev.riskLevel,
        createdAt: rev.createdAt,
      });
    }
  }

  res.json({
    items: repos.map((r) => ({
      id: String(r._id),
      repoFullName: r.repoFullName,
      isPrivate: Boolean(r.isPrivate),
      enabled: Boolean(r.enabled),
      installationId: r.installationId,
      reviewCount: counts.get(r.repoFullName) || 0,
      latestReview: latestByRepo.get(r.repoFullName) || null,
    })),
  });
}));

// POST /api/repos/lookup: Parse URL and check if connected
router.post('/repos/lookup', handle(async (req, res) => {
  const { url } = req.body || {};
  const repoFullName = parseRepoUrl(url);

  if (!repoFullName) {
    return res.status(400).json({
      error: 'Invalid repository format. Please enter "owner/repo" or "https://github.com/owner/repo".',
    });
  }

  let ids = req.user?.installationIds || [];
  let repo = await Repo.findOne({
    repoFullName,
    installationId: { $in: ids },
  }).lean();

  if (!repo && req.user?.login) {
    ids = await syncUserInstallations(req.user);
    repo = await Repo.findOne({
      repoFullName,
      installationId: { $in: ids },
    }).lean();
  }

  if (repo) {
    return res.json({
      status: 'connected',
      repo: {
        id: String(repo._id),
        repoFullName: repo.repoFullName,
        enabled: repo.enabled,
        isPrivate: repo.isPrivate,
      },
    });
  }

  // Never reveal whether a private repo exists: just send the install link
  const slug = env.githubAppSlug || 'ai-pr-reviewer';
  const installUrl = `https://github.com/apps/${slug}/installations/new`;

  return res.json({
    status: 'needs_install',
    repoFullName,
    installUrl,
  });
}));

// PATCH /api/repos/:id: Toggle enabled/disabled
router.patch('/repos/:id', handle(async (req, res) => {
  if (!OBJECT_ID.test(req.params.id)) return res.status(400).json({ error: 'Invalid repository id' });

  let ids = req.user?.installationIds || [];
  if (ids.length === 0 && req.user?.login) {
    ids = await syncUserInstallations(req.user);
  }
  const repo = await Repo.findOne({
    _id: req.params.id,
    installationId: { $in: ids },
  });

  if (!repo) {
    return res.status(404).json({ error: 'Repository not found' });
  }

  const enabled = Boolean(req.body.enabled);
  repo.enabled = enabled;
  await repo.save();

  res.json({
    id: String(repo._id),
    repoFullName: repo.repoFullName,
    enabled: repo.enabled,
    message: enabled
      ? 'Reviews enabled.'
      : 'Reviews paused. To completely remove the bot, uninstall it in your GitHub settings.',
  });
}));

// POST /api/repos/:id/review-open-prs: Trigger review for existing open PRs
router.post('/repos/:id/review-open-prs', handle(async (req, res) => {
  if (!OBJECT_ID.test(req.params.id)) return res.status(400).json({ error: 'Invalid repository id' });

  let ids = req.user?.installationIds || [];
  if (ids.length === 0 && req.user?.login) {
    ids = await syncUserInstallations(req.user);
  }
  const repo = await Repo.findOne({
    _id: req.params.id,
    installationId: { $in: ids },
  });

  if (!repo) {
    return res.status(404).json({ error: 'Repository not found' });
  }

  const { owner, repo: repoShortName } = parseRepo(repo.repoFullName);
  const octokit = await getInstallationOctokit(repo.installationId);

  const { data: openPRs } = await octokit.rest.pulls.list({
    owner,
    repo: repoShortName,
    state: 'open',
    per_page: 5,
  });

  const queued = [];
  for (const pr of openPRs) {
    const headSha = pr.head.sha.toLowerCase();
    const active = await Job.exists({
      repoFullName: repo.repoFullName,
      prNumber: pr.number,
      headSha,
      status: { $in: ['queued', 'processing'] },
    });

    if (active) continue;

    const job = await Job.create({
      deliveryId: `manual-open-pr-${pr.id}-${Date.now()}`,
      repoFullName: repo.repoFullName,
      prNumber: pr.number,
      headSha,
      installationId: repo.installationId,
    });

    queued.push({ prNumber: pr.number, title: pr.title, jobId: String(job._id) });
  }

  res.json({
    queuedCount: queued.length,
    queued,
    message: queued.length > 0
      ? `Queued reviews for ${queued.length} open pull request(s).`
      : 'No new reviews needed (all open PRs already have active or recent reviews).',
  });
}));

export default router;
