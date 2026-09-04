import { createDecipheriv, createHmac, hkdfSync, timingSafeEqual } from 'crypto';

// Ported from the same working fix already used in this account's other
// whatsapp-web.js project (whatsapp-expense-cloud/worker/src/media.js).
const MEDIA_KEY_INFO = {
  image: 'WhatsApp Image Keys',
  video: 'WhatsApp Video Keys',
  audio: 'WhatsApp Audio Keys',
  document: 'WhatsApp Document Keys',
  sticker: 'WhatsApp Image Keys', // stickers use the same key-derivation scheme as images
};

/**
 * Fetches and decrypts a WhatsApp message's media directly from WhatsApp's
 * CDN, bypassing whatsapp-web.js's in-browser Message.downloadMedia().
 *
 * Why this exists: downloadMedia() reaches into WhatsApp Web's internal,
 * frequently-reshuffled JS modules via a page.evaluate() call, and breaks
 * whenever WhatsApp ships an incompatible internal change - observed
 * repeatedly here (2026-09-04/05, the same failure across whatsapp-web.js
 * 1.34.7 and a webVersionCache pin attempt). Fetching and decrypting the
 * media directly only depends on WhatsApp's documented, stable wire-level
 * media encryption scheme (HKDF-derived AES-256-CBC + HMAC-SHA256 over the
 * message's own mediaKey), not on any particular WhatsApp Web build's
 * internal module layout - so it doesn't share that failure mode at all.
 *
 * @param {import('whatsapp-web.js').Message} msg
 * @returns {Promise<{ data: Buffer, mimetype: string, filename: string|null } | null>}
 *   null when the message doesn't carry the fields needed to fetch it this way
 *   (caller should treat that as "media unavailable", not retry).
 */
export async function decryptMediaDirect(msg) {
  const data = msg._data ?? {};
  const url = data.deprecatedMms3Url || (data.directPath ? `https://mmg.whatsapp.net${data.directPath}` : null);
  if (!url || !data.mediaKey) return null;

  const response = await fetch(url);
  if (!response.ok) throw new Error(`Media fetch failed: HTTP ${response.status}`);
  const encrypted = Buffer.from(await response.arrayBuffer());

  const info = MEDIA_KEY_INFO[msg.type] || MEDIA_KEY_INFO.document;
  const expanded = Buffer.from(
    hkdfSync('sha256', Buffer.from(data.mediaKey, 'base64'), Buffer.alloc(32), info, 112)
  );
  const iv = expanded.subarray(0, 16);
  const cipherKey = expanded.subarray(16, 48);
  const macKey = expanded.subarray(48, 80);

  // Last 10 bytes are a truncated HMAC-SHA256 over (iv || ciphertext) - verify
  // before decrypting so a corrupted or mismatched-key fetch fails loudly
  // instead of silently returning garbage bytes.
  const payload = encrypted.subarray(0, -10);
  const mac = encrypted.subarray(-10);
  const expectedMac = createHmac('sha256', macKey).update(iv).update(payload).digest().subarray(0, 10);
  if (!timingSafeEqual(mac, expectedMac)) {
    throw new Error('Media MAC verification failed (corrupted download or key mismatch)');
  }

  const decipher = createDecipheriv('aes-256-cbc', cipherKey, iv);
  const decrypted = Buffer.concat([decipher.update(payload), decipher.final()]);

  return {
    data: decrypted,
    mimetype: data.mimetype || 'application/octet-stream',
    filename: data.filename || null,
  };
}
