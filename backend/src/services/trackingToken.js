/**
 * Signed, expiring tokens for the login-free customer tracking link (/track/:token).
 * Stateless: "<base64url(leadId.exp)>.<HMAC>" — no table or migration, and a leaked link only
 * reveals one lead's progress until it expires. The HMAC key is derived from JWT_SECRET with a
 * "track:" prefix so a tracking token can never be replayed as a login token or vice versa.
 */
import crypto from 'crypto';
import { JWT_SECRET } from '../config/secrets.js';

export const TRACKING_TTL_DAYS = 30;

function sign(payload) {
  return crypto.createHmac('sha256', `track:${JWT_SECRET}`).update(payload).digest('base64url');
}

export function createTrackingToken(leadId, now = Date.now(), ttlDays = TRACKING_TTL_DAYS) {
  const exp = Math.floor(now / 1000) + ttlDays * 86400;
  const payload = Buffer.from(`${leadId}.${exp}`).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

/** { leadId, exp } for a genuine unexpired token, else null. */
export function verifyTrackingToken(token, now = Date.now()) {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const [payload, signature] = parts;

  const given = Buffer.from(signature);
  const expected = Buffer.from(sign(payload));
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;

  const decoded = Buffer.from(payload, 'base64url').toString();
  const dot = decoded.lastIndexOf('.');
  const leadId = decoded.slice(0, dot);
  const exp = Number(decoded.slice(dot + 1));
  if (dot <= 0 || !Number.isFinite(exp) || exp * 1000 < now) return null;
  return { leadId, exp };
}
