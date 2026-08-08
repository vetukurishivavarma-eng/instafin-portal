/**
 * Daily Hurdle access guard — enforces the "blocked executive" rule on the API.
 *
 * When an executive has at least one overdue hurdle that is not yet justified
 * (reason + expected completion date), every API call outside the whitelist
 * (auth + hurdles endpoints) is rejected with a 403 so the executive cannot use
 * any other screen until they resolve the overdue tasks.
 *
 * Mounted BEFORE feature routers in server.js (only for /api paths).
 */
import jwt from 'jsonwebtoken';
import { isUserBlocked, BLOCKED_ROLES } from '../services/hurdle.service.js';

const JWT_SECRET = process.env.JWT_SECRET || 'instafin-dev-secret-2024';

// Whitelisted path prefixes — these remain reachable while blocked.
const WHITELIST = ['/api/auth', '/api/hurdles'];

// Short-lived in-memory cache so we don't hit the DB on every API call.
// Key: userId -> { blocked, checkedAt }
const cache = new Map();
const CACHE_TTL_MS = 15 * 1000;

function isWhitelisted(path) {
  return WHITELIST.some(prefix => path === prefix || path.startsWith(prefix + '/') || path === '/api/hurdles');
}

export function hurdleGuard(req, res, next) {
  if (req.method === 'OPTIONS') return next();

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return next();

  let decoded;
  try {
    decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
  } catch (error) {
    return next(); // invalid token — per-route auth will respond with 401
  }

  // Only executives are subject to blocking.
  if (!BLOCKED_ROLES.includes(decoded.role)) return next();

  const path = req.path || req.url || '';
  if (isWhitelisted(path)) return next();

  const cached = cache.get(decoded.id);
  if (cached && Date.now() - cached.checkedAt < CACHE_TTL_MS) {
    if (cached.blocked) {
      return res.status(403).json({
        error: 'Access blocked: you have overdue tasks. Provide a reason and completion date in Daily Hurdles.',
        blocked: true,
        redirect: '/executive/hurdles',
      });
    }
    return next();
  }

  isUserBlocked(decoded.id)
    .then(blocked => {
      cache.set(decoded.id, { blocked, checkedAt: Date.now() });
      if (blocked) {
        return res.status(403).json({
          error: 'Access blocked: you have overdue tasks. Provide a reason and completion date in Daily Hurdles.',
          blocked: true,
          redirect: '/executive/hurdles',
        });
      }
      next();
    })
    .catch(err => {
      console.error('[HURDLE-GUARD] Block check failed (allowing request):', err.message);
      next();
    });
}
