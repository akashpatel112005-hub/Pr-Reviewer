import crypto from 'node:crypto';
import { env } from '../src/config/env.js';
import { getPullRequest } from '../src/services/github.js';

const args = process.argv.slice(2);
const value = (name, fallback) => {
  const a = args.find((x) => x.startsWith(`--${name}=`));
  return a ? a.slice(name.length + 3) : fallback;
};
const [repo, number] = args.filter((a) => !a.startsWith('--'));

if (!repo || !number) {
  console.log('Usage: npm run send-webhook -- owner/repo 1 [--delivery=test-1] [--action=opened] [--event=pull_request] [--draft] [--bad-signature] [--url=...]');
  process.exit(1);
}
if (!env.githubWebhookSecret) {
  console.error('GITHUB_WEBHOOK_SECRET is not set in backend/.env');
  process.exit(1);
}

const url = value('url', `http://localhost:${env.port}/webhook`);
const event = value('event', 'pull_request');
const action = value('action', 'opened');
const delivery = value('delivery', `test-${Date.now()}`);

let sha = value('sha', '');
if (!sha) sha = (await getPullRequest(repo, number)).headSha;

const payload =
  event === 'ping'
    ? { zen: 'test ping' }
    : {
        action,
        number: Number(number),
        pull_request: { number: Number(number), draft: args.includes('--draft'), head: { sha } },
        repository: { full_name: repo },
      };

const body = JSON.stringify(payload);
let signature = 'sha256=' + crypto.createHmac('sha256', env.githubWebhookSecret).update(body).digest('hex');
if (args.includes('--bad-signature')) signature = 'sha256=' + '0'.repeat(64);

try {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-github-event': event,
      'x-github-delivery': delivery,
      'x-hub-signature-256': signature,
    },
    body,
    signal: AbortSignal.timeout(15000),
  });
  console.log(`delivery=${delivery} event=${event} action=${action}`);
  console.log(`HTTP ${res.status}`);
  console.log(await res.text());
} catch (err) {
  console.error(`Could not reach ${url}. Is the backend running? (${err.message})`);
  process.exit(1);
}