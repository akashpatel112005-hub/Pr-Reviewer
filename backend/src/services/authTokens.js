import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';

const TOKEN_TTL = '8h';

export function signToken(secret) {
  return jwt.sign({ role: 'admin' }, secret, { expiresIn: TOKEN_TTL, algorithm: 'HS256' });
}

export function signUserToken(userId, secret) {
  return jwt.sign({ sub: String(userId) }, secret, { expiresIn: TOKEN_TTL, algorithm: 'HS256' });
}

// Only HS256 is accepted, so "alg: none" tokens are rejected.
export function verifyToken(token, secret) {
  return jwt.verify(token, secret, { algorithms: ['HS256'] });
}

// Hash both sides first so the lengths match and timingSafeEqual never throws or leaks length.
export function passwordMatches(input, expected) {
  if (typeof input !== 'string' || typeof expected !== 'string' || !expected) return false;
  const a = crypto.createHash('sha256').update(input).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}