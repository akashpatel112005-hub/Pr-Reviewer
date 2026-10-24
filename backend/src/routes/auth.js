import crypto from 'node:crypto';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';
import User from '../models/User.js';
import Installation from '../models/Installation.js';
import AuthCode from '../models/AuthCode.js';
import { passwordMatches, signToken, signUserToken } from '../services/authTokens.js';
import { requireAuth } from '../middleware/auth.js';

function getCookie(req, name) {
  const header = req.headers.cookie;
  if (!header) return null;
  const match = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export function createAuthRouter({ limit = 10, windowMs = 15 * 60 * 1000, config = env } = {}) {
  const router = Router();

  const exchangeLimiter = rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    message: { error: 'Too many attempts. Try again in a few minutes.' },
  });

  // Step 1: Redirect user to GitHub for OAuth sign-in
  const initiateLogin = (req, res) => {
    if (!config.githubClientId) {
      return res.status(503).json({ error: 'GitHub OAuth is not configured on the server' });
    }
    const state = crypto.randomBytes(24).toString('hex');
    const isProd = config.nodeEnv === 'production';
    res.setHeader(
      'Set-Cookie',
      `oauth_state=${state}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600${isProd ? '; Secure' : ''}`
    );

    const redirectUri = `${config.backendUrl}/api/auth/github/callback`;
    const authUrl = `https://github.com/login/oauth/authorize?client_id=${config.githubClientId}&redirect_uri=${encodeURIComponent(
      redirectUri
    )}&state=${state}`;

    return res.redirect(authUrl);
  };

  router.get('/github/login', initiateLogin);
  router.get('/login', initiateLogin);

  // Step 2: GitHub OAuth callback
  router.get('/github/callback', async (req, res) => {
    const { code, state, error, error_description } = req.query;

    if (error === 'access_denied' || error) {
      const msg = error_description || error || 'Access denied by GitHub';
      return res.redirect(`${config.frontendUrl}/?error=${encodeURIComponent(msg)}`);
    }

    const cookieState = getCookie(req, 'oauth_state');
    if (!state || !cookieState || state !== cookieState) {
      return res.redirect(
        `${config.frontendUrl}/?error=${encodeURIComponent('Invalid or expired state parameter. Please try signing in again.')}`
      );
    }

    // Clear state cookie
    res.setHeader('Set-Cookie', 'oauth_state=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');

    try {
      // Exchange code for GitHub user access token
      const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({
          client_id: config.githubClientId,
          client_secret: config.githubClientSecret,
          code,
        }),
        signal: AbortSignal.timeout(15000),
      });

      const tokenData = await tokenRes.json();
      if (!tokenData.access_token) {
        throw new Error(tokenData.error_description || tokenData.error || 'Failed to exchange GitHub authorization code');
      }

      const ghToken = tokenData.access_token;

      // Fetch user profile
      const userRes = await fetch('https://api.github.com/user', {
        headers: {
          authorization: `Bearer ${ghToken}`,
          accept: 'application/vnd.github+json',
          'user-agent': 'AI-PR-Reviewer',
        },
        signal: AbortSignal.timeout(15000),
      });

      if (!userRes.ok) {
        throw new Error(`Failed to fetch GitHub user profile (${userRes.status})`);
      }
      const ghUser = await userRes.json();

      // Fetch installations accessible to this user
      let installationIds = [];
      try {
        const instRes = await fetch('https://api.github.com/user/installations?per_page=100', {
          headers: {
            authorization: `Bearer ${ghToken}`,
            accept: 'application/vnd.github+json',
            'user-agent': 'AI-PR-Reviewer',
          },
          signal: AbortSignal.timeout(15000),
        });

        if (instRes.ok) {
          const instData = await instRes.json();
          const installations = instData.installations || [];
          installationIds = installations.map((i) => i.id);

          // Upsert Installation records
          await Promise.all(
            installations.map((inst) =>
              Installation.findOneAndUpdate(
                { installationId: inst.id },
                {
                  $set: {
                    accountLogin: inst.account?.login || '',
                    accountType: inst.account?.type || 'User',
                    repositorySelection: inst.repository_selection || 'all',
                    suspended: Boolean(inst.suspended_at),
                  },
                },
                { upsert: true }
              )
            )
          );
        }
      } catch (err) {
        console.warn('Could not fetch user installations:', err.message);
      }

      // Upsert User
      const userDoc = await User.findOneAndUpdate(
        { githubId: ghUser.id },
        {
          $set: {
            login: ghUser.login,
            name: ghUser.name || ghUser.login,
            avatarUrl: ghUser.avatar_url || '',
            installationIds,
            lastLoginAt: new Date(),
          },
        },
        { upsert: true, returnDocument: 'after' }
      );

      // Create one-time 60-second AuthCode (only SHA-256 hash is stored)
      const rawCode = crypto.randomBytes(32).toString('hex');
      const codeHash = crypto.createHash('sha256').update(rawCode).digest('hex');
      await AuthCode.create({
        codeHash,
        userId: userDoc._id,
        expiresAt: new Date(Date.now() + 60 * 1000),
      });

      // Redirect frontend callback with code
      return res.redirect(`${config.frontendUrl}/auth/callback?code=${rawCode}`);
    } catch (err) {
      console.error('GitHub OAuth error:', err.message);
      return res.redirect(`${config.frontendUrl}/?error=${encodeURIComponent(err.message)}`);
    }
  });

  const recentExchanges = new Map();

  // Step 3: Frontend exchanges one-time AuthCode for application JWT
  router.post('/exchange', exchangeLimiter, async (req, res) => {
    const { code } = req.body || {};
    if (typeof code !== 'string' || !code.trim()) {
      return res.status(400).json({ error: 'Authorization code is required' });
    }

    const codeHash = crypto.createHash('sha256').update(code.trim()).digest('hex');

    // Protect against duplicate requests (e.g. React StrictMode in development)
    if (recentExchanges.has(codeHash)) {
      const cached = recentExchanges.get(codeHash);
      return res.json({ token: cached.token, expiresIn: '8h' });
    }

    const authCode = await AuthCode.findOneAndDelete({
      codeHash,
      expiresAt: { $gt: new Date() },
    });

    if (!authCode) {
      return res.status(401).json({ error: 'Invalid or expired authorization code' });
    }

    const token = signUserToken(authCode.userId, config.jwtSecret);
    recentExchanges.set(codeHash, { token });
    setTimeout(() => recentExchanges.delete(codeHash), 15000);

    return res.json({ token, expiresIn: '8h' });
  });

  // Legacy password login route (for backward compatibility if configured)
  router.post('/login', exchangeLimiter, (req, res) => {
    if (!config.adminPassword || !config.jwtSecret) {
      return res.status(503).json({ error: 'Password login is disabled; please use GitHub sign-in.' });
    }
    const password = req.body?.password;
    if (typeof password !== 'string' || password.length === 0 || password.length > 200) {
      return res.status(400).json({ error: 'A password is required' });
    }
    if (!passwordMatches(password, config.adminPassword)) {
      return res.status(401).json({ error: 'Incorrect password' });
    }
    return res.json({ token: signToken(config.jwtSecret), expiresIn: '8h' });
  });

  // Current user session details
  router.get('/me', requireAuth, (req, res) => {
    return res.json({
      ok: true,
      user: {
        id: req.user._id,
        login: req.user.login,
        name: req.user.name || req.user.login,
        avatarUrl: req.user.avatarUrl || '',
        installationIds: req.user.installationIds || [],
      },
    });
  });

  return router;
}

export default createAuthRouter();
