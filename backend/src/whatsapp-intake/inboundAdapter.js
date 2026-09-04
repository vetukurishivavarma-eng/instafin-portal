import { EventEmitter } from 'events';

/**
 * Provider-agnostic contract for anything that can hand InstaFin a normalized
 * inbound WhatsApp document. Today only WhatsAppWebAdapter (free, unofficial)
 * implements this. Migrating to the official WhatsApp Business Cloud API
 * later means writing a second adapter that emits the same events — nothing
 * in documentIntakeService.js changes. See docs/WHATSAPP_INTAKE.md.
 *
 * Events:
 *   'ready'                          — adapter connected and listening
 *   'qr' (rawPayload)                 — (whatsapp-web only) the raw QR string to link a
 *                                        device; render it (data URL for the web page,
 *                                        ASCII for a terminal) at the point of use
 *   'disconnected' (reason)
 *   'document' (NormalizedInboundMessage)
 *   'error' (Error)
 */
export class InboundAdapter extends EventEmitter {
  /** @returns {Promise<void>} */
  async start() {
    throw new Error('start() not implemented');
  }

  /** @returns {Promise<void>} */
  async stop() {
    throw new Error('stop() not implemented');
  }

  /** @returns {'connecting'|'ready'|'disconnected'} */
  getStatus() {
    throw new Error('getStatus() not implemented');
  }
}

/**
 * @typedef {Object} NormalizedInboundMessage
 * @property {'whatsapp-web'|'whatsapp-cloud'} provider
 * @property {string} providerMessageId  unique per provider — used for dedupe
 * @property {string} senderNumber       E.164-ish, digits only
 * @property {string} originalFilename
 * @property {string} mimeType
 * @property {Buffer} buffer
 * @property {Date} timestamp
 */
