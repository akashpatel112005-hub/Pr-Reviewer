import { getPullRequest, getPullRequestFiles, GitHubError } from '../src/services/github.js';
import { prepareDiff } from '../src/services/diffFilter.js';

const [repo, number, flag] = process.argv.slice(2);

if (!repo || !number) {
  console.log('Usage: npm run inspect-pr -- owner/repo 1 [--show]');
  process.exit(1);
}

try {
  const pr = await getPullRequest(repo, number);
  console.log(`\nPR #${number}: ${pr.title}`);
  console.log(`Author: ${pr.author} | Head SHA: ${pr.headSha.slice(0, 7)} | ${pr.changedFiles} changed file(s)`);

  const files = await getPullRequestFiles(repo, number);
  const { reviewable, skipped, truncated, chunks } = prepareDiff(files);

  console.log(`\nReviewable files (${reviewable.length}):`);
  for (const f of reviewable) {
    console.log(`  + ${f.filename}  (+${f.additions} -${f.deletions}, commentable lines: ${f.commentableLines.length})`);
  }

  console.log(`\nSkipped files (${skipped.length}):`);
  for (const s of skipped) console.log(`  - ${s.file}  [${s.reason}]`);

  if (truncated.length) console.log(`\nTruncated (too large): ${truncated.join(', ')}`);

  console.log(`\nChunks: ${chunks.length}`);
  chunks.forEach((chunk, i) => {
    const size = chunk.reduce((sum, f) => sum + f.annotated.length, 0);
    console.log(`  chunk ${i + 1}: ${chunk.length} file(s), ${size} chars`);
  });

  if (flag === '--show' && reviewable[0]) {
    console.log(`\n--- ${reviewable[0].filename} (annotated) ---\n${reviewable[0].annotated}`);
  }
} catch (err) {
  if (err instanceof GitHubError) {
    console.error(`\nGitHub error${err.status ? ` (${err.status})` : ''}: ${err.message}`);
    console.error(err.permanent ? 'Type: permanent (would not be retried)' : 'Type: transient (would be retried)');
    process.exit(1);
  }
  throw err;
}