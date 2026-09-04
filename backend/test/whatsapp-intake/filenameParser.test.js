import { describe, it, expect } from 'vitest';
import { parseInboundFilename } from '../../src/whatsapp-intake/filenameParser.js';

describe('parseInboundFilename', () => {
  it('parses a simple filename', () => {
    const result = parseInboundFilename('L10001_Aadhaar.pdf');
    expect(result).toEqual({ valid: true, leadCode: 'L10001', documentName: 'Aadhaar', extension: 'pdf' });
  });

  it('parses a multi-word document name split only on the first underscore', () => {
    const result = parseInboundFilename('L10001_Address_Proof.pdf');
    expect(result.valid).toBe(true);
    expect(result.leadCode).toBe('L10001');
    expect(result.documentName).toBe('Address_Proof');
  });

  it('uppercases the lead code', () => {
    const result = parseInboundFilename('l10001_pan.jpg');
    expect(result.leadCode).toBe('L10001');
  });

  it('rejects a filename with no underscore', () => {
    const result = parseInboundFilename('Aadhaar.pdf');
    expect(result.valid).toBe(false);
    expect(result.errorCode).toBe('INVALID_FILENAME');
  });

  it('rejects a filename with no extension', () => {
    const result = parseInboundFilename('L10001_Aadhaar');
    expect(result.valid).toBe(false);
    expect(result.errorCode).toBe('INVALID_FILENAME');
  });

  it('rejects a lead code that is not L-prefixed digits', () => {
    const result = parseInboundFilename('LEAD1_Aadhaar.pdf');
    expect(result.valid).toBe(false);
    expect(result.errorCode).toBe('INVALID_LEAD_CODE');
  });

  it('rejects an empty document name', () => {
    const result = parseInboundFilename('L10001_.pdf');
    expect(result.valid).toBe(false);
  });

  it('rejects null/empty input', () => {
    expect(parseInboundFilename('').valid).toBe(false);
    expect(parseInboundFilename(undefined).valid).toBe(false);
  });
});
