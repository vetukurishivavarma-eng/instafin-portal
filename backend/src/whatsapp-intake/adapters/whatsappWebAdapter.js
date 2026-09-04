import pkg from 'whatsapp-web.js';
import qrcode from 'qrcode';
import { InboundAdapter } from '../inboundAdapter.js';

const { Client, LocalAuth } = pkg;

/**
 * Free, unofficial WhatsApp channel used for this POC. Runs a real WhatsApp
 * Web session (via Puppeteer) authenticated by scanning a QR code with the
 * business's WhatsApp phone — no Meta Business account, no per-message cost.
 *
 * Session credentials persist to disk (LocalAuth) under
 * backend/.wwebjs_auth/ so the device only needs to be linked once.
 *
 * Known trade-offs, documented in docs/WHATSAPP_INTAKE.md:
 *  - Unofficial: WhatsApp could break this integration at any time. Not for
 *    long-term production use — that's what the Cloud API migration is for.
 *  - Requires a real phone to stay linked (like WhatsApp Web in a browser).
 *  - `message.id._serialized` has been observed missing/undefined for some
 *    message types — always fall back to a synthesized id so dedupe never
 *    throws.
 *  - Photos sent via the "Photo" picker lose their original filename (WhatsApp
 *    recompresses and renames them); customers must send documents via the
 *    paperclip's "Document" option to preserve "<LeadID>_<DocName>.<ext>".
 */
export class WhatsAppWebAdapter extends InboundAdapter {
  #client;
  #status = 'disconnected';

  constructor({ sessionPath = '.wwebjs_auth' } = {}) {
    super();
    this.#client = new Client({
      authStrategy: new LocalAuth({ dataPath: sessionPath }),
      puppeteer: {
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          // Trims Chromium's memory footprint for low-RAM hosts (Render's
          // free tier is 512MB total, shared with Node itself) - this alone
          // does not guarantee it fits; see docs/WHATSAPP_INTAKE.md.
          '--disable-dev-shm-usage', // /dev/shm is tiny on most containers; use disk instead
          '--disable-gpu',
          '--disable-extensions',
          '--disable-background-networking',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-breakpad',
          '--disable-component-update',
          '--disable-default-apps',
          '--disable-sync',
          '--metrics-recording-only',
          '--mute-audio',
          '--no-first-run',
          '--no-zygote',
          '--single-process', // one process instead of Chromium's usual multi-process model - saves RAM, costs some stability
        ],
      },
    });

    this.#client.on('qr', async (qr) => {
      this.#status = 'connecting';
      try {
        const dataUrl = await qrcode.toDataURL(qr);
        this.emit('qr', dataUrl);
      } catch (err) {
        this.emit('error', err);
      }
    });

    this.#client.on('ready', () => {
      this.#status = 'ready';
      this.emit('ready');
    });

    this.#client.on('disconnected', (reason) => {
      this.#status = 'disconnected';
      this.emit('disconnected', reason);
    });

    this.#client.on('auth_failure', (msg) => {
      this.#status = 'disconnected';
      this.emit('error', new Error(`WhatsApp auth failed: ${msg}`));
    });

    this.#client.on('message', (msg) => this.#handleMessage(msg));
  }

  async start() {
    await this.#client.initialize();
  }

  async stop() {
    await this.#client.destroy();
    this.#status = 'disconnected';
  }

  getStatus() {
    return this.#status;
  }

  async #handleMessage(msg) {
    try {
      if (!msg.hasMedia) return;
      // Only "document"-type attachments reliably keep their original filename.
      if (msg.type !== 'document') return;

      const media = await msg.downloadMedia();
      if (!media || !media.data) {
        this.emit('error', new Error(`Failed to download media for message ${msg.id?.id ?? '(unknown)'}`));
        return;
      }

      const providerMessageId = msg.id?._serialized || `${msg.id?.id || 'unknown'}-${msg.timestamp}`;
      const senderNumber = (msg.from || '').replace('@c.us', '');

      /** @type {import('../inboundAdapter.js').NormalizedInboundMessage} */
      const normalized = {
        provider: 'whatsapp-web',
        providerMessageId,
        senderNumber,
        originalFilename: media.filename || 'unnamed',
        mimeType: media.mimetype,
        buffer: Buffer.from(media.data, 'base64'),
        timestamp: new Date((msg.timestamp || Date.now() / 1000) * 1000),
      };

      this.emit('document', normalized);
    } catch (err) {
      this.emit('error', err);
    }
  }
}
