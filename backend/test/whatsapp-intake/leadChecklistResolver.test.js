import { describe, it, expect } from 'vitest';
import { getRequiredDocumentIdsForLead, getChecklistWithFallback } from '../../src/whatsapp-intake/leadChecklistResolver.js';

describe('getRequiredDocumentIdsForLead', () => {
  it('resolves the exact decision-tree entry for a fully-specified lead', () => {
    const ids = getRequiredDocumentIdsForLead({
      loan_type: 'home_loan',
      loan_status: 'new',
      income_source: 'salaried',
      resident_type: 'indian_resident',
    });
    expect(ids.has('kyc_aadhaar')).toBe(true);
    expect(ids.has('kyc_pan')).toBe(true);
    // A document real for a different loan type/profile should not be included.
    expect(ids.has('biz_gst')).toBe(false);
  });

  it('always includes the CIBIL report item regardless of profile', () => {
    const ids = getRequiredDocumentIdsForLead({ loan_type: 'home_loan', loan_status: 'new', income_source: 'salaried', resident_type: 'indian_resident' });
    expect(ids.has('cibil_report_upload')).toBe(true);
  });

  it('falls back to the loan type\'s first profile when income_source/resident_type are missing', () => {
    const ids = getRequiredDocumentIdsForLead({ loan_type: 'home_loan', loan_status: 'new' });
    expect(ids.size).toBeGreaterThan(1);
  });

  it('falls back to the common checklist for an unknown loan type', () => {
    const ids = getRequiredDocumentIdsForLead({ loan_type: 'not_a_real_loan_type', loan_status: 'new' });
    expect(ids.has('cibil_report_upload')).toBe(true);
    expect(ids.size).toBeGreaterThan(1);
  });

  it('MSME leads use the simplified loanType|loanStatus|businessType key', () => {
    const checklist = getChecklistWithFallback({ loanType: 'msme', loanStatus: 'new' });
    expect(checklist.length).toBeGreaterThan(0);
  });
});
