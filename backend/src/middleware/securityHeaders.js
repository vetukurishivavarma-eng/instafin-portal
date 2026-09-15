/**
 * Baseline security headers for every API response (no helmet dependency for four headers).
 * No X-Frame-Options/CSP here: this is a JSON + file-download API, and the portal previews
 * documents it serves, so framing rules belong on the frontend host, not here.
 */
export function securityHeaders(req, res, next) {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  });
  // req.secure is trustworthy because server.js sets `trust proxy` for Render's TLS terminator
  if (req.secure) res.set('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  next();
}
