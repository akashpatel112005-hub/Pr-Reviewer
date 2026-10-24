import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import Job from '../src/models/Job.js';
import { getPullRequest } from '../src/services/github.js';

const [repo, number] = process.argv.slice(2);
if (!repo || !number) {
  console.log('Usage: npm run seed-failed-job -- owner/repo 1');
  process.exit(1);
}

let code = 0;
try {
  await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 10000 });
  const pr = await getPullRequest(repo, number);
  const job = await Job.create({
    deliveryId: `test-failed-${Date.now()}`,
    repoFullName: repo,
    prNumber: Number(number),
    headSha: pr.headSha,
    status: 'failed',
    attempts: 3,
    lastError: 'Seeded failure for testing the Re-run button',
  });
  console.log(`Created failed test job ${job._id}`);
} catch (err) {
  console.error(`${err.name}: ${err.message}`);
  code = 1;
} finally {
  await mongoose.disconnect().catch(() => {});
}
process.exit(code);