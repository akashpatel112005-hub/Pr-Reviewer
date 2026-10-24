import { getPullRequest, getPullRequestFiles } from '../src/services/github.js';
import { prepareDiff } from '../src/services/diffFilter.js';
import { reviewChunks } from '../src/services/reviewEngine.js';
import { summarizePR } from '../src/services/summary.js';

const [repo, number] = process.argv.slice(2);

if (!repo || !number) {
  console.log('Usage: npm run summarize-pr -- owner/repo 1');
  process.exit(1);
}

try {
  const pr = await getPullRequest(repo, number);
  const files = await getPullRequestFiles(repo, number);
  const { chunks } = prepareDiff(files);

  console.log(`\nPR #${number}: ${pr.title}`);
  console.log('Running the code review, then the summary...\n');

  const reviewed = await reviewChunks(chunks, { title: pr.title });
  const findings = Array.isArray(reviewed) ? reviewed : reviewed.findings || [];

  const result = await summarizePR({ title: pr.title, body: pr.body, files, findings });

  console.log(`Findings: ${findings.length} (${findings.filter((f) => f.severity === 'critical').length} critical)\n`);

  if (result.summaryError) {
    console.log(`Summary unavailable: ${result.summaryError}`);
  } else {
    console.log(`Summary: ${result.summary}`);
    result.changes.forEach((c) => console.log(`  - ${c}`));
  }

  console.log(`\nModel risk rating: ${result.llmRiskLevel ?? 'n/a'}`);
  console.log(`FINAL RISK: ${result.riskLevel.toUpperCase()}`);
  console.log(`Reason: ${result.riskReason || '(none)'}`);
} catch (err) {
  console.error(`\n${err.name}: ${err.message}`);
  process.exit(1);
}