// Manual test for Task 2: fetch a real PR, run the review engine, print findings.
// Usage: npm run review-pr -- owner/repo 1
import { getPullRequest, getPullRequestFiles, GitHubError } from '../src/services/github.js';
import { prepareDiff } from '../src/services/diffFilter.js';
import { reviewChunks, ReviewEngineError } from '../src/services/reviewEngine.js';
import { LLMError } from '../src/services/llm.js';

const [repo, number] = process.argv.slice(2);
if (!repo || !number) {
  console.log('Usage: npm run review-pr -- owner/repo 1');
  process.exit(1);
}

try {
  const pr = await getPullRequest(repo, number);
  console.log(`PR #${number}: ${pr.title}`);
  const files = await getPullRequestFiles(repo, number);
  const { reviewable, skipped, chunks } = prepareDiff(files);
  console.log(`${reviewable.length} reviewable, ${skipped.length} skipped, ${chunks.length} chunk(s). Calling the LLM...`);

  const { findings, droppedCount } = await reviewChunks(chunks);
  console.log(`\n${findings.length} finding(s) (${droppedCount} discarded for pointing at lines not in the diff)\n`);
  for (const f of findings) {
    console.log(`[${f.severity.toUpperCase()}] ${f.file}:${f.line} (${f.category})`);
    console.log(`  ${f.message}`);
    if (f.suggestion) console.log(`  Fix: ${f.suggestion}`);
  }
} catch (err) {
  if (err instanceof GitHubError || err instanceof LLMError || err instanceof ReviewEngineError) {
    console.error(`\n${err.name}: ${err.message}`);
    process.exit(1);
  }
  throw err;
}
