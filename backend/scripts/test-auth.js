import { env } from '../src/config/env.js';

const base = `http://localhost:${env.port}`;
const lockout = process.argv.includes('--lockout');
let passed = 0;
let failed = 0;

function check(name, ok, detail = '') {
  if (ok) passed += 1;
  else failed += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`);
}

async function call(path, { method = 'GET', body, token } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(base + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

try {
  check('GET /api/auth/me without a token is refused', (await call('/api/auth/me')).status === 401);
  check('a garbage token is refused', (await call('/api/auth/me', { token: 'garbage' })).status === 401);
  check('a wrong password is refused', (await call('/api/auth/login', { method: 'POST', body: { password: 'definitely-wrong' } })).status === 401);

  const ok = await call('/api/auth/login', { method: 'POST', body: { password: env.adminPassword } });
  check('the correct password returns a token', ok.status === 200 && typeof ok.data.token === 'string');
  check('the token opens GET /api/auth/me', (await call('/api/auth/me', { token: ok.data.token })).status === 200);

  check('/health stays public', (await call('/health')).status === 200);
  const hook = await call('/webhook', { method: 'POST', body: {} });
  check('/webhook is not behind the login (it answers with its own signature check)', hook.status === 401 && hook.data.error === 'Invalid signature', `${hook.status} ${hook.data.error}`);

  if (lockout) {
    let blockedAt = 0;
    for (let i = 1; i <= 8; i += 1) {
      const r = await call('/api/auth/login', { method: 'POST', body: { password: 'wrong-' + i } });
      if (r.status === 429) { blockedAt = i; break; }
    }
    check('repeated wrong passwords get rate limited (429)', blockedAt > 0, blockedAt ? `blocked at attempt ${blockedAt}` : 'never blocked');
    console.log('\nNote: your IP is now locked out of login. Restart the backend (Ctrl+C, npm run dev) to reset it.');
  }
} catch (err) {
  failed += 1;
  console.error(`Could not reach ${base}. Is the backend running? (${err.message})`);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);