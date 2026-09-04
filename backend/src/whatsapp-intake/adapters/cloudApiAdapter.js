import crypto from 'crypto';
import { InboundAdapter } from '../inboundAdapter.js';

/**
 * Official WhatsApp Business Cloud API adapter — the migration target.
 * Not wired up by default (it needs a paid/verified Meta Business setup);
 * included now so the swap described in docs/WHATSAPP_INTAKE.md is a real,
 * working implementation rather than a promise.
 *
 * Unlike WhatsAppWebAdapter, this adapter is push-only: Meta calls
 * `handleWebhookRequest()` (mounted as an Express route) instead of this
 * process maintaining a live session. `start()`/`stop()` are no-ops — the
 * adapter is "ready" as soon as the webhook route is mounted.
 */
export class CloudApiAdapter extends InboundAdapter {
  #appSecret;
  #accessToken;
  #apiVersion;
  #status = 'disconnected';

  constructor({
    appSecret = process.env.WHATSAPP_APP_SECRET,
    accessToken = process.env.WHATSAPP_ACCESS_TOKEN,
    apiVersion = 'v21.0',
  } = {}) {
    super();
    this.#appSecret = appSecret;
    this.#accessToken = accessToken;
    this.#apiVersion = apiVersion;
  }

  async start() {
    this.#status = 'ready';
    this.emit('ready');
  }

  async stop() {
    this.#status = 'disconnected';
  }

  getStatus() {
    return this.#status;
  }

  /** GET /api/webhooks/whatsapp — Meta's subscription verification handshake. */
  handleVerificationRequest(req, res) {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
      res.status(200).send(challenge);
    } else {
      res.sendStatus(403);
    }
  }

  /**
   * POST /api/webhooks/whatsapp — must be mounted with a raw-body parser so
   * `req.rawBody` is available for signature verification (Meta signs the
   * exact bytes it sent; a re-serialized JSON body will not match).
   */
  async handleWebhookRequest(req, res) {
    if (!this.#verifySignature(req)) {
      res.sendStatus(401);
      return;
    }

    // Acknowledge immediately — Meta retries on anything but a fast 200.
    res.sendStatus(200);

    try {
      const entries = req.body?.entry || [];
      for (const entry of entries) {
        for (const change of entry.changes || []) {
          const messages = change.value?.messages || [];
          for (const message of messages) {
            await this.#handleMessage(message);
          }
        }
      }
    } catch (err) {
      this.emit('error', err);
    }
  }

  #verifySignature(req) {
    if (!this.#appSecret) return false;
    const signature = req.headers['x-hub-signature-256'];
    if (!signature || !req.rawBody) return false;

    const expected = 'sha256=' + crypto.createHmac('sha256', this.#appSecret).update(req.rawBody).digest('hex');

    try {
      return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    } catch {
      return false; // length mismatch etc. — treat as invalid, not a crash
    }
  }

  async #handleMessage(message) {
    if (message.type !== 'document') return;

    const doc = message.document;
    const mediaUrl = await this.#resolveMediaUrl(doc.id);
    const buffer = await this.#downloadMedia(mediaUrl);

    /** @type {import('../inboundAdapter.js').NormalizedInboundMessage} */
    const normalized = {
      provider: 'whatsapp-cloud',
      providerMessageId: message.id,
      senderNumber: message.from,
      originalFilename: doc.filename || 'unnamed',
      mimeType: doc.mime_type,
      buffer,
      timestamp: new Date(Number(message.timestamp) * 1000),
    };

    this.emit('document', normalized);
  }

  async #resolveMediaUrl(mediaId) {
    const res = await fetch(`https://graph.facebook.com/${this.#apiVersion}/${mediaId}`, {
      headers: { Authorization: `Bearer ${this.#accessToken}` },
    });
    if (!res.ok) throw new Error(`Failed to resolve media URL for ${mediaId}: ${res.status}`);
    const data = await res.json();
    return data.url;
  }

  async #downloadMedia(url) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${this.#accessToken}` } });
    if (!res.ok) throw new Error(`Failed to download media: ${res.status}`);
    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }
}
