import { getPullRequest, getPullRequestFiles } from '../src/services/github.js';
import { prepareDiff } from '../src/services/diffFilter.js';
import { reviewChunks } from '../src/services/reviewEngine.js';
import { summarizePR } from '../src/services/summary.js';
import { publishReview } from '../src/services/publisher.js';

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const [repo, number] = args.filter((a) => !a.startsWith('--'));

if (!repo || !number) {
  console.log('Usage: npm run post-review -- owner/repo 1 [--dry-run] [--force]');
  process.exit(1);
}

try {
  const pr = await getPullRequest(repo, number);
  const files = await getPullRequestFiles(repo, number);
  const { reviewable, skipped, chunks } = prepareDiff(files);

  console.log(`\nPR #${number}: ${pr.title} (commit ${pr.headSha.slice(0, 7)})`);
  console.log('Reviewing...');

  const reviewed = await reviewChunks(chunks, { title: pr.title });
  const findings = Array.isArray(reviewed) ? reviewed : reviewed.findings || [];
  const warnings = Array.isArray(reviewed) ? [] : reviewed.warnings || [];

  const summary = await summarizePR({ title: pr.title, body: pr.body, files, findings });

  const result = await publishReview({
    repoFullName: repo,
    prNumber: Number(number),
    headSha: pr.headSha,
    summary,
    findings,
    files: reviewable,
    skipped,
    warnings,
    force: flags.has('--force'),
    dryRun: flags.has('--dry-run'),
  });

  if (result.dryRun) {
    console.log('\n--- DRY RUN: nothing was posted ---\n');
    console.log(result.body);
    console.log(`\nInline comments that would be posted: ${result.comments.length}`);
    result.comments.forEach((c) => console.log(`  ${c.path}:${c.line}`));
  } else if (result.skipped) {
    console.log(`\nSkipped: ${result.reason}.`);
    console.log(`Existing review: ${result.url}`);
  } else {
    console.log(`\nPosted review: ${result.url}`);
    console.log(`Inline comments: ${result.inlineCount}, listed in body: ${result.generalCount}${result.usedFallback ? ' (fallback used)' : ''}`);
  }
} catch (err) {
  console.error(`\n${err.name}: ${err.message}`);
  if (err.permanent !== undefined) console.error(err.permanent ? 'Type: permanent (would not be retried)' : 'Type: transient (would be retried)');
  process.exit(1);
}