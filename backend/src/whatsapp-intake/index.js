import qrcode from 'qrcode';
import { supabase } from '../lib/supabase.js';
import { WhatsAppWebAdapter } from './adapters/whatsappWebAdapter.js';
import { CloudApiAdapter } from './adapters/cloudApiAdapter.js';
import { processInboundDocument } from './intakeService.js';

/**
 * Single place that decides which WhatsApp channel is live.
 * WHATSAPP_INTAKE_PROVIDER=whatsapp-web (default, free) | whatsapp-cloud
 * Mirrors the existing WHATSAPP_PROVIDER convention used for outbound
 * notifications in services/whatsapp.service.js.
 */
function createAdapter() {
  const provider = process.env.WHATSAPP_INTAKE_PROVIDER || 'whatsapp-web';
  if (provider === 'whatsapp-cloud') return new CloudApiAdapter();
  return new WhatsAppWebAdapter();
}

let adapter = null;
let lastQrDataUrl = null;
let lastError = null;

/** Starts the configured adapter and wires it to the intake pipeline. Safe to call once at server boot. */
export async function startWhatsAppIntake() {
  if (process.env.WHATSAPP_INTAKE_ENABLED !== 'true') {
    console.log('[WHATSAPP-INTAKE] Disabled (set WHATSAPP_INTAKE_ENABLED=true to enable).');
    return;
  }

  adapter = createAdapter();

  adapter.on('qr', async (rawQr) => {
    try {
      lastQrDataUrl = await qrcode.toDataURL(rawQr);
      console.log('[WHATSAPP-INTAKE] Scan the QR code at GET /api/whatsapp-intake/qr to link a device.');
    } catch (err) {
      lastError = err.message;
      console.error('[WHATSAPP-INTAKE] Failed to render QR code:', err.message);
    }
  });

  adapter.on('ready', () => {
    lastQrDataUrl = null;
    lastError = null;
    console.log('[WHATSAPP-INTAKE] Connected and listening for documents.');
  });

  adapter.on('disconnected', (reason) => {
    console.warn('[WHATSAPP-INTAKE] Disconnected:', reason);
  });

  adapter.on('error', (err) => {
    lastError = err.message;
    console.error('[WHATSAPP-INTAKE] Adapter error:', err?.stack || err);
  });

  adapter.on('document', async (message) => {
    try {
      await processInboundDocument(message, { supabase });
    } catch (err) {
      // Belt-and-braces: processInboundDocument catches its own DB errors,
      // this catches anything else (network blips, unexpected exceptions)
      // so one bad message can never take down the listener.
      lastError = err.message;
      console.error('[WHATSAPP-INTAKE] Unhandled error processing inbound document:', err);
    }
  });

  try {
    await adapter.start();
  } catch (err) {
    lastError = err.message;
    console.error('[WHATSAPP-INTAKE] Failed to start adapter:', err);
  }
}

export function getWhatsAppIntakeStatus() {
  return {
    enabled: process.env.WHATSAPP_INTAKE_ENABLED === 'true',
    provider: process.env.WHATSAPP_INTAKE_PROVIDER || 'whatsapp-web',
    connectionStatus: adapter?.getStatus() || 'not_started',
    lastError,
    qrAvailable: !!lastQrDataUrl,
  };
}

export function getWhatsAppIntakeQr() {
  return lastQrDataUrl;
}

/** For the CloudApiAdapter's webhook routes; null when the active adapter isn't the Cloud API one. */
export function getCloudApiAdapter() {
  return adapter instanceof CloudApiAdapter ? adapter : null;
}
