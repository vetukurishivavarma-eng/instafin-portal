/**
 * Runs the WhatsApp document intake pipeline locally instead of on Render.
 *
 * Why this exists: a real WhatsApp Web session under Puppeteer commonly
 * needs 300-500MB of RAM on its own, and Render's free tier gives the whole
 * backend service 512MB total - it was getting OOM-killed shortly after the
 * QR scan (confirmed twice, 2026-09-04/05). This script runs the exact same
 * intake code (whatsapp-intake/intakeService.js, same adapter, same
 * document-catalog matching) on your own machine, writing to the SAME
 * Supabase database the deployed portal reads from - so an upload that
 * lands here shows up in the live portal immediately, no different from
 * uploads processed on Render. Only the WhatsApp session itself moves; the
 * portal (frontend + API) stays deployed on Render as-is.
 *
 * Usage:
 *   1. Optionally create backend/.env with:
 *        SUPABASE_SERVICE_ROLE_KEY=...   (or leave unset to use the anon-key
 *                                          fallback baked into lib/supabase.js)
 *        SMTP_HOST / SMTP_USER / SMTP_PASS   (optional - for the "notify the
 *                                          assigned executive" email step;
 *                                          skipped gracefully if unset)
 *   2. On Render: set WHATSAPP_INTAKE_ENABLED=false (or leave it unset) so
 *      the deployed backend does NOT also try to run its own WhatsApp
 *      session - only one process should hold the session at a time.
 *   3. From backend/:  npm run whatsapp:local
 *      (equivalent to: node --env-file-if-exists=.env scripts/run-whatsapp-intake-local.js
 *      - the "-if-exists" variant means this also runs fine with no .env file
 *      at all, falling back to lib/supabase.js's built-in anon key and no
 *      email notifications.)
 *   4. Scan the QR code printed in this terminal with the business's
 *      WhatsApp phone (Linked Devices -> Link a Device). One-time; the
 *      session persists to backend/.wwebjs_auth/ (gitignored) same as
 *      before, just on this machine instead of Render's disk.
 *   5. Leave this running (e.g. under PM2, same pattern as your other
 *      always-on local bots) whenever you want WhatsApp intake live.
 */

import qrcode from 'qrcode';
import { supabase } from '../src/lib/supabase.js';
import { WhatsAppWebAdapter } from '../src/whatsapp-intake/adapters/whatsappWebAdapter.js';
import { processInboundDocument } from '../src/whatsapp-intake/intakeService.js';

const adapter = new WhatsAppWebAdapter();

adapter.on('qr', async (rawQr) => {
  console.log('\n[WHATSAPP-INTAKE] Scan this QR with the business WhatsApp phone (Linked Devices -> Link a Device):\n');
  try {
    console.log(await qrcode.toString(rawQr, { type: 'terminal', small: true }));
  } catch (err) {
    console.error('[WHATSAPP-INTAKE] Failed to render QR in terminal:', err.message);
  }
});

adapter.on('ready', () => {
  console.log('[WHATSAPP-INTAKE] Connected and listening for documents. Leave this process running.');
});

adapter.on('disconnected', (reason) => {
  console.warn('[WHATSAPP-INTAKE] Disconnected:', reason);
});

adapter.on('error', (err) => {
  console.error('[WHATSAPP-INTAKE] Adapter error:', err.message);
});

adapter.on('document', async (message) => {
  console.log(`[WHATSAPP-INTAKE] Received "${message.originalFilename}" from ${message.senderNumber}`);
  try {
    const result = await processInboundDocument(message, { supabase });
    console.log(`[WHATSAPP-INTAKE] -> ${result.status}${result.message ? `: ${result.message}` : ''}`);
  } catch (err) {
    console.error('[WHATSAPP-INTAKE] Unhandled error processing inbound document:', err);
  }
});

process.on('SIGINT', async () => {
  console.log('\n[WHATSAPP-INTAKE] Shutting down...');
  await adapter.stop().catch(() => {});
  process.exit(0);
});

console.log('[WHATSAPP-INTAKE] Starting local WhatsApp session...');
adapter.start().catch((err) => {
  console.error('[WHATSAPP-INTAKE] Failed to start:', err);
  process.exit(1);
});
