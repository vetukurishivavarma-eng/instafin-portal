// One place for the JWT signing secret. The hard-coded fallback only exists so local dev works
// without a .env — in production it would let anyone who reads this repo forge an admin token.
const FALLBACK_SECRET = 'instafin-dev-secret-2024';

export const JWT_SECRET = process.env.JWT_SECRET || FALLBACK_SECRET;
export const usingFallbackSecret = !process.env.JWT_SECRET;

if (usingFallbackSecret && (process.env.NODE_ENV === 'production' || process.env.RENDER)) {
  console.error('[SECURITY] JWT_SECRET is not set — tokens are signed with the public fallback secret. Set JWT_SECRET on this service.');
}
