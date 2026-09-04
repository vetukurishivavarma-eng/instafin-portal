import { describe, it, expect } from 'vitest';
import { matchDocumentName } from '../../src/whatsapp-intake/documentCatalog.js';

describe('matchDocumentName', () => {
  it('matches a clean keyword', () => {
    expect(matchDocumentName('Aadhaar')?.documentId).toBe('kyc_aadhaar');
  });

  it('matches a multi-word underscore-joined name', () => {
    expect(matchDocumentName('Address_Proof')?.documentId).toBe('kyc_addr_proof');
  });

  it('is case-insensitive', () => {
    expect(matchDocumentName('pan')?.documentId).toBe('kyc_pan');
    expect(matchDocumentName('PAN')?.documentId).toBe('kyc_pan');
  });

  it('returns null for gibberish', () => {
    expect(matchDocumentName('xyzzyqwerty')).toBeNull();
  });

  it('returns null for an empty name', () => {
    expect(matchDocumentName('')).toBeNull();
    expect(matchDocumentName('   ')).toBeNull();
  });

  it('matches a plain bank statement to the general document type', () => {
    expect(matchDocumentName('Bank Statement')?.documentId).toBe('inc_bank_stmt');
  });

  it('matches an unambiguous 12-month phrasing to the 12-month document type', () => {
    expect(matchDocumentName('12 Month Bank')?.documentId).toBe('inc_bank_stmt_12');
  });

  it('returns null when two document types are near-equally likely (ambiguous)', () => {
    // "bank statement 12" contains both the generic "bank statement" keyword
    // and the specific "bank statement 12" keyword at equal confidence —
    // the matcher should refuse to guess rather than silently pick one.
    expect(matchDocumentName('Bank Statement 12')).toBeNull();
  });
});
