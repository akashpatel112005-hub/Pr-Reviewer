import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { getPullRequest } from '../src/services/github.js';
import { runReview } from '../src/services/pipeline.js';

const [repo, number] = process.argv.slice(2);

if (!repo || !number) {
  console.log('Usage: npm run run-review -- owner/repo 1');
  process.exit(1);
}

let code = 0;
try {
  await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 10000 });
  const pr = await getPullRequest(repo, number);
  const job = { _id: new mongoose.Types.ObjectId(), repoFullName: repo, prNumber: Number(number), headSha: pr.headSha };
  const result = await runReview(job);
  console.log('\nResult:', JSON.stringify(result));
} catch (err) {
  console.error(`\n${err.name}: ${err.message}`);
  if (err.permanent !== undefined) console.error(err.permanent ? 'Type: permanent (would not be retried)' : 'Type: transient (would be retried)');
  code = 1;
} finally {
  await mongoose.disconnect().catch(() => {});
}
process.exit(code);