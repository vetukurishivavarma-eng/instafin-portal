import { describe, it, expect } from 'vitest';
import { validateInboundFile, MAX_FILE_SIZE_BYTES } from '../../src/whatsapp-intake/fileValidation.js';

const PDF_HEADER = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]); // "%PDF-1.4"
const JPEG_HEADER = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);

describe('validateInboundFile', () => {
  it('accepts a well-formed PDF', () => {
    const result = validateInboundFile({ buffer: PDF_HEADER, extension: 'pdf' });
    expect(result.valid).toBe(true);
  });

  it('accepts a well-formed JPEG', () => {
    const result = validateInboundFile({ buffer: JPEG_HEADER, extension: 'jpg' });
    expect(result.valid).toBe(true);
  });

  it('rejects an unsupported extension', () => {
    const result = validateInboundFile({ buffer: PDF_HEADER, extension: 'exe' });
    expect(result.valid).toBe(false);
    expect(result.errorCode).toBe('UNSUPPORTED_FILE_TYPE');
  });

  it('rejects an empty buffer as corrupted', () => {
    const result = validateInboundFile({ buffer: Buffer.alloc(0), extension: 'pdf' });
    expect(result.valid).toBe(false);
    expect(result.errorCode).toBe('CORRUPTED_FILE');
  });

  it('rejects content whose bytes do not match the claimed extension', () => {
    const result = validateInboundFile({ buffer: JPEG_HEADER, extension: 'pdf' });
    expect(result.valid).toBe(false);
    expect(result.errorCode).toBe('CORRUPTED_FILE');
  });

  it('rejects a file over the size limit', () => {
    const oversized = Buffer.concat([PDF_HEADER, Buffer.alloc(MAX_FILE_SIZE_BYTES)]);
    const result = validateInboundFile({ buffer: oversized, extension: 'pdf' });
    expect(result.valid).toBe(false);
    expect(result.errorCode).toBe('FILE_TOO_LARGE');
  });
});
