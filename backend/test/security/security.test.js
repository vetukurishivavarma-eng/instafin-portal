import { describe, it, expect } from 'vitest';
import { createTrackingToken, verifyTrackingToken } from '../../src/services/trackingToken.js';
import { rateLimit } from '../../src/middleware/rateLimit.js';

const LEAD = '6f1c2d34-1111-4a2b-9c3d-abcdef012345';

describe('tracking tokens', () => {
  it('round-trips a lead id until it expires', () => {
    const now = Date.parse('2026-09-16T00:00:00Z');
    const token = createTrackingToken(LEAD, now, 30);
    expect(verifyTrackingToken(token, now)).toMatchObject({ leadId: LEAD });
    expect(verifyTrackingToken(token, now + 29 * 86400000)).not.toBeNull();
    expect(verifyTrackingToken(token, now + 31 * 86400000)).toBeNull();
  });

  it('rejects a token whose lead id or signature was tampered with', () => {
    const token = createTrackingToken(LEAD);
    const [, sig] = token.split('.');
    const forgedPayload = Buffer.from(`another-lead.${Math.floor(Date.now() / 1000) + 3600}`).toString('base64url');
    expect(verifyTrackingToken(`${forgedPayload}.${sig}`)).toBeNull();
    expect(verifyTrackingToken(`${token}x`)).toBeNull();
    expect(verifyTrackingToken('garbage')).toBeNull();
    expect(verifyTrackingToken(undefined)).toBeNull();
  });
});

describe('rateLimit', () => {
  function run(mw, req) {
    let status = 200;
    let nextCalled = false;
    const res = { set() { return res; }, status(code) { status = code; return res; }, json() { return res; } };
    mw(req, res, () => { nextCalled = true; });
    return nextCalled ? 200 : status;
  }

  it('allows max requests per key per window, then answers 429', () => {
    const mw = rateLimit({ windowMs: 60000, max: 2, key: (req) => req.ip });
    expect(run(mw, { ip: '1.1.1.1' })).toBe(200);
    expect(run(mw, { ip: '1.1.1.1' })).toBe(200);
    expect(run(mw, { ip: '1.1.1.1' })).toBe(429);
    expect(run(mw, { ip: '2.2.2.2' })).toBe(200); // other clients unaffected
  });
});
