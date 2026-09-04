import pkg from 'whatsapp-web.js';
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
      // whatsapp-web.js 1.34.7's bundled/local WhatsApp Web version can drift
      // out of sync with what WhatsApp's servers currently serve - when it
      // does, the library's injected in-page script for downloading media
      // breaks against the live client JS (observed: msg.downloadMedia()
      // throwing a bare "r" from inside page.evaluate, 2026-09-05, while
      // messaging and QR-linking kept working fine). Pinning to a
      // community-maintained, actively-updated known-good version sidesteps
      // this - see wppconnect-team/wa-version, an open-source mirror built
      // specifically because WhatsApp Web updates regularly break automation
      // tools like this one. strict:false means it still falls back to the
      // library's own default behavior if this particular version can't be
      // fetched, rather than hard-failing.
      webVersionCache: {
        type: 'remote',
        remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/{version}.html',
        strict: false,
      },
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

      const media = await msg.downloadMedia();
      if (!media || !media.data) {
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
        buffer: Buffer.from(media.data, 'base64'),
        timestamp: new Date((msg.timestamp || Date.now() / 1000) * 1000),
      };

      this.emit('document', normalized);
    } catch (err) {
      this.emit('error', err);
    }
  }
}
