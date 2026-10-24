import { env } from '../config/env.js';
import { verifyToken } from '../services/authTokens.js';
import User from '../models/User.js';

export async function requireAuth(req, res, next) {
  if (!env.jwtSecret) return res.status(503).json({ error: 'Authentication is not configured' });

  const header = req.get('authorization') || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  let payload;
  try {
    payload = verifyToken(token, env.jwtSecret);
  } catch (err) {
    const expired = err?.name === 'TokenExpiredError';
    return res.status(401).json({ error: expired ? 'Session expired, please sign in again' : 'Invalid token' });
  }

  if (payload.sub) {
    try {
      const user = await User.findById(payload.sub).lean();
      if (!user) {
        return res.status(401).json({ error: 'User not found' });
      }
      req.user = user;
      return next();
    } catch (err) {
      return res.status(500).json({ error: 'Failed to authenticate user session' });
    }
  }

  // Fallback for legacy admin token
  req.user = { _id: null, login: 'admin', role: payload.role || 'admin', installationIds: [] };
  return next();
}
