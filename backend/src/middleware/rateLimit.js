/**
 * Fixed-window rate limiter kept in process memory.
 * ponytail: per-process state — right for the single free Render instance; move the counters to
 * Redis/Supabase if the API ever runs more than one instance.
 */
export function rateLimit({ windowMs, max, key = (req) => req.ip, message = 'Too many requests, please try again later.' }) {
  const hits = new Map();

  return function rateLimitMiddleware(req, res, next) {
    const now = Date.now();
    const k = key(req);
    let entry = hits.get(k);
    if (!entry || now - entry.start >= windowMs) {
      entry = { start: now, count: 0 };
      hits.set(k, entry);
    }
    entry.count += 1;

    // keep memory bounded under a flood of distinct keys
    if (hits.size > 10000) {
      for (const [staleKey, e] of hits) if (now - e.start >= windowMs) hits.delete(staleKey);
    }

    if (entry.count > max) {
      res.set('Retry-After', String(Math.ceil((entry.start + windowMs - now) / 1000)));
      return res.status(429).json({ error: message });
    }
    next();
  };
}
