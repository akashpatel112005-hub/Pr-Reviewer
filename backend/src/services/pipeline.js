import { getPullRequest, getPullRequestFiles } from './github.js';
import { getInstallationOctokit } from './githubApp.js';
import { prepareDiff } from './diffFilter.js';
import { reviewChunks } from './reviewEngine.js';
import { summarizePR } from './summary.js';
import { publishReview } from './publisher.js';
import { escalateFindings } from './findingRules.js';
import PullRequest from '../models/PullRequest.js';
import Review from '../models/Review.js';
import Finding from '../models/Finding.js';

function normalizeReviewResult(result) {
  if (Array.isArray(result)) return { findings: result, warnings: [] };
  return { findings: result?.findings || [], warnings: result?.warnings || [] };
}

async function persist({ job, pr, headSha, summary, findings, reviewable, skipped, warnings, published }) {
  const pullRequest = await PullRequest.findOneAndUpdate(
    { repoFullName: job.repoFullName, prNumber: job.prNumber },
    { $set: { title: pr.title, author: pr.author, htmlUrl: pr.htmlUrl } },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
  );

  const review = await Review.findOneAndUpdate(
    { pullRequest: pullRequest._id, headSha },
    {
      $set: {
        job: job._id,
        status: 'completed',
        summary: summary.summary || '',
        changes: summary.changes || [],
        summaryError: summary.summaryError || null,
        riskLevel: summary.riskLevel || null,
        riskReason: summary.riskReason || '',
        filesReviewed: reviewable.length,
        filesSkipped: skipped.map((s) => ({ file: s.file, reason: s.reason })),
        warnings,
        findingsCount: findings.length,
        inlineCount: published.inlineCount || 0,
        posted: Boolean(published.posted),
        githubReviewUrl: published.url || '',
      },
    },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
  );

  // Replace, not append, so a retry or re-run never duplicates findings.
  await Finding.deleteMany({ review: review._id });
  if (findings.length > 0) {
    await Finding.insertMany(
      findings.map((f) => ({
        review: review._id,
        filePath: f.file,
        line: f.line,
        severity: f.severity,
        category: f.category || '',
        message: f.message,
        suggestion: f.suggestion || '',
      }))
    );
  }
  return review;
}

// Runs one full review. Errors are thrown with a .permanent flag so the worker knows whether to retry.
export async function runReview(job, { log = console } = {}) {
  const tag = `[pipeline ${job.repoFullName}#${job.prNumber}]`;

  let octokit = null;
  if (job.installationId) {
    octokit = await getInstallationOctokit(job.installationId);
  }

  const pr = await getPullRequest(octokit, job.repoFullName, job.prNumber);

  if (pr.state && pr.state !== 'open') {
    log.log(`${tag} skipped: pull request is ${pr.state}`);
    return { status: 'skipped', reason: `pull request is ${pr.state}` };
  }
  if (job.headSha && pr.headSha !== job.headSha) {
    log.log(`${tag} skipped: a newer commit exists (${String(pr.headSha).slice(0, 7)}), it has its own job`);
    return { status: 'skipped', reason: 'stale commit: a newer commit was pushed' };
  }

  const files = await getPullRequestFiles(octokit, job.repoFullName, job.prNumber);
  const { reviewable, skipped, chunks } = prepareDiff(files);
  log.log(`${tag} ${reviewable.length} file(s) to review, ${skipped.length} skipped, ${chunks.length} chunk(s)`);

  let findings = [];
  let warnings = [];
  if (chunks.length > 0) {
    const reviewed = normalizeReviewResult(await reviewChunks(chunks, { title: pr.title }));
    findings = escalateFindings(reviewed.findings);
    warnings = reviewed.warnings;
  }
  log.log(`${tag} ${findings.length} finding(s), ${findings.filter((f) => f.severity === 'critical').length} critical`);

  // A failed summary is recorded but never blocks the review.
  const summary = await summarizePR({ title: pr.title, body: pr.body, files, findings });
  if (summary.summaryError) log.warn(`${tag} summary unavailable: ${summary.summaryError}`);

  const published = await publishReview({
    octokit,
    repoFullName: job.repoFullName,
    prNumber: job.prNumber,
    headSha: pr.headSha,
    summary,
    findings,
    files: reviewable,
    skipped,
    warnings,
  });
  log.log(`${tag} ${published.posted ? 'review posted' : 'review already existed, not duplicated'}: ${published.url || 'no url'}`);

  const review = await persist({ job, pr, headSha: pr.headSha, summary, findings, reviewable, skipped, warnings, published });
  log.log(`${tag} saved (risk ${summary.riskLevel}, review ${review._id})`);

  return { status: 'reviewed', findings: findings.length, riskLevel: summary.riskLevel, posted: Boolean(published.posted), url: published.url };
}