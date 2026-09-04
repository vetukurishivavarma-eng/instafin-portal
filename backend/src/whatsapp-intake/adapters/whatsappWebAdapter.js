import pkg from 'whatsapp-web.js';
import { InboundAdapter } from '../inboundAdapter.js';
import { decryptMediaDirect } from './mediaDecrypt.js';

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
 *  - `Message.downloadMedia()` reaches into WhatsApp Web's internal JS via
 *    page.evaluate() and has broken repeatedly here against the live
 *    WhatsApp Web build (a bare "r" thrown from inside WhatsApp's own
 *    minified code, 2026-09-04/05, group and individual chats both). See
 *    `#downloadMedia()` below: it tries the library's method first, then
 *    falls back to `mediaDecrypt.js`, which fetches and decrypts the media
 *    directly from WhatsApp's CDN using the message's own keys — the same
 *    fix already proven in this account's whatsapp-expense-cloud project.
 */
export class WhatsAppWebAdapter extends InboundAdapter {
  #client;
  #status = 'disconnected';

  /**
   * @param {Object} [opts]
   * @param {string} [opts.sessionPath]
   * @param {boolean} [opts.lowMemory] - trims Chromium's footprint for
   *   low-RAM hosts (Render's free tier is 512MB total, shared with Node
   *   itself). Includes `--single-process`/`--no-zygote`, which save real
   *   memory but trade away some of Chromium's normal process isolation and
   *   have been observed producing terse, unhelpful crashes (a bare "r" as
   *   the error message) more readily than a standard launch. Default true
   *   to preserve the hosted behavior; the local runner
   *   (scripts/run-whatsapp-intake-local.js) passes `false` since a spare
   *   machine doesn't need to fight for every MB, trading a bit of memory
   *   for a more stable session.
   */
  constructor({ sessionPath = '.wwebjs_auth', lowMemory = true } = {}) {
    super();
    const baseArgs = ['--no-sandbox', '--disable-setuid-sandbox'];
    const lowMemoryArgs = [
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
    ];

    this.#client = new Client({
      authStrategy: new LocalAuth({ dataPath: sessionPath }),
      puppeteer: {
        headless: true,
        args: lowMemory ? [...baseArgs, ...lowMemoryArgs] : baseArgs,
      },
      // Tried pinning webVersionCache to a remote community version mirror
      // here (wppconnect-team/wa-version) to fix a downloadMedia() crash —
      // reverted 2026-09-05 because it broke QR generation itself, which is
      // strictly worse (QR/connect was confirmed working before this).
      // Fetching a WA Web version at startup adds a new failure mode
      // (network reachability, stale/404'd version files) that the default
      // LocalWebCache doesn't have. If the downloadMedia crash recurs,
      // investigate more surgically (e.g. retry-on-failure around
      // msg.downloadMedia(), or a library version bump) rather than
      // reaching for this again without a way to verify it end-to-end.
    });

    this.#client.on('qr', (qr) => {
      this.#status = 'connecting';
      // Emit the raw QR payload, not a rendered image - the web admin page
      // renders it as a data URL, a terminal runner renders it as ASCII;
      // rendering is a presentation concern, not the adapter's.
      this.emit('qr', qr);
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
      // No attachment at all - ordinary chat noise, nothing to log.
      if (!msg.hasMedia) return;

      const providerMessageId = msg.id?._serialized || `${msg.id?.id || 'unknown'}-${msg.timestamp}`;
      const senderNumber = (msg.from || '').replace('@c.us', '');

      const media = await this.#downloadMedia(msg);
      if (!media) {
        this.emit('error', new Error(`Failed to download media for message ${msg.id?.id ?? '(unknown)'}`));
        return;
      }

      if (!media.filename) {
        // WhatsApp only preserves an original filename for attachments sent
        // via the paperclip's "Document" option; a "Photo" attachment (even
        // one WhatsApp classifies as msg.type === 'document') arrives with
        // no usable filename here, so there's no "<LeadID>_<DocName>" to
        // parse. Surface it instead of dropping it silently.
        this.emit('ignored', { providerMessageId, senderNumber, messageType: msg.type, mimeType: media.mimetype });
        return;
      }

      /** @type {import('../inboundAdapter.js').NormalizedInboundMessage} */
      const normalized = {
        provider: 'whatsapp-web',
        providerMessageId,
        senderNumber,
        originalFilename: media.filename,
        mimeType: media.mimetype,
        buffer: media.buffer,
        timestamp: new Date((msg.timestamp || Date.now() / 1000) * 1000),
      };

      this.emit('document', normalized);
    } catch (err) {
      this.emit('error', err);
    }
  }

  /**
   * Tries whatsapp-web.js's own downloadMedia() first; on failure (its
   * in-browser call into WhatsApp Web's internals has repeatedly broken
   * here — see mediaDecrypt.js), falls back to fetching and decrypting the
   * media directly from WhatsApp's CDN using the message's own keys, which
   * doesn't depend on WhatsApp Web's internal module layout at all.
   * @returns {Promise<{ buffer: Buffer, mimetype: string, filename: string|null }|null>}
   */
  async #downloadMedia(msg) {
    try {
      const media = await msg.downloadMedia();
      if (media?.data) {
        return { buffer: Buffer.from(media.data, 'base64'), mimetype: media.mimetype, filename: media.filename || null };
      }
    } catch (err) {
      console.warn(`[WHATSAPP-INTAKE] downloadMedia() failed (${err.message}), falling back to direct decryption`);
    }

    const direct = await decryptMediaDirect(msg);
    if (!direct) return null;
    return { buffer: direct.data, mimetype: direct.mimetype, filename: direct.filename };
  }
}
