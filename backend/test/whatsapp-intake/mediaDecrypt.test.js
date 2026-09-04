import { describe, it, expect, vi, afterEach } from 'vitest';
import { decryptMediaDirect } from '../../src/whatsapp-intake/adapters/mediaDecrypt.js';

// Real correctness (does the HKDF/AES/HMAC math match what WhatsApp actually
// sends) can only be verified against a genuine encrypted message from a
// live account — these tests cover the guard clauses and failure paths,
// which is what's checkable without that.

afterEach(() => {
  vi.restoreAllMocks();
});

describe('decryptMediaDirect', () => {
  it('returns null when the message has no directPath/deprecatedMms3Url', async () => {
    const msg = { type: 'document', _data: { mediaKey: 'abc' } };
    expect(await decryptMediaDirect(msg)).toBeNull();
  });

  it('returns null when the message has no mediaKey', async () => {
    const msg = { type: 'document', _data: { directPath: '/v/abc' } };
    expect(await decryptMediaDirect(msg)).toBeNull();
  });

  it('throws a clear error when the CDN fetch fails', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404 });
    const msg = { type: 'document', _data: { directPath: '/v/abc', mediaKey: Buffer.alloc(32).toString('base64') } };
    await expect(decryptMediaDirect(msg)).rejects.toThrow(/HTTP 404/);
  });

  it('rejects a payload whose MAC does not match (corrupted or wrong key)', async () => {
    // 32 bytes of ciphertext + 10 bytes of garbage "MAC" — will never verify.
    const fakeEncrypted = Buffer.concat([Buffer.alloc(32, 1), Buffer.alloc(10, 2)]);
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => fakeEncrypted.buffer.slice(fakeEncrypted.byteOffset, fakeEncrypted.byteOffset + fakeEncrypted.byteLength),
    });
    const msg = { type: 'document', _data: { directPath: '/v/abc', mediaKey: Buffer.alloc(32, 3).toString('base64') } };
    await expect(decryptMediaDirect(msg)).rejects.toThrow(/MAC verification failed/);
  });

  it('prefers deprecatedMms3Url over directPath when both are present', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 404 });
    global.fetch = fetchMock;
    const msg = {
      type: 'document',
      _data: { deprecatedMms3Url: 'https://mms.example/1', directPath: '/v/2', mediaKey: Buffer.alloc(32).toString('base64') },
    };
    await expect(decryptMediaDirect(msg)).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledWith('https://mms.example/1');
  });
});
