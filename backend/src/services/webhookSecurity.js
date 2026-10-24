import crypto from 'node:crypto';

export function computeSignature(rawBody, secret) {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
}

// Constant-time comparison so response timing cannot leak the signature.
export function verifySignature(rawBody, header, secret) {
  if (!secret || typeof header !== 'string' || !Buffer.isBuffer(rawBody)) return false;
  const expected = Buffer.from(computeSignature(rawBody, secret));
  const received = Buffer.from(header);
  if (expected.length !== received.length) return false;
  return crypto.timingSafeEqual(expected, received);
}