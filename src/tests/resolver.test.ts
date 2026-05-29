import { describe, it, expect } from 'vitest';
import { getCoapplicantChecklist } from '../utils/resolver';
import type { ChecklistItem } from '../data/types';

describe('getCoapplicantChecklist', () => {
  const mockItems: ChecklistItem[] = [
    { id: 'kyc_aadhaar', name: 'Aadhaar Card', category: 'kyc', required: true },
    { id: 'kyc_pan', name: 'PAN Card', category: 'kyc', required: true },
    { id: 'inc_payslips_6', name: 'Pay Slips (Last 6 Months)', category: 'income_proof', required: true },
    { id: 'inc_it_returns', name: 'IT Returns (Last 2 Years)', category: 'income_proof', required: true },
    { id: 'biz_gst_returns', name: 'GST Returns', category: 'business_documents', required: true },
    { id: 'biz_audited_bs', name: 'Audited Balance Sheet (3 Years)', category: 'business_documents', required: true },
    { id: 'prop_link_docs', name: 'Link Documents', category: 'property_documents', required: false },
    { id: 'fin_bank_stmt_12', name: 'Bank Statement (12 Months)', category: 'financial_documents', required: true },
    { id: 'legal_roc_search', name: 'ROC Search Report', category: 'legal_documents', required: true },
    { id: 'others_any', name: 'Any Other Documents', category: 'others', required: false },
  ];

  it('correctly duplicates all checklist items for co-applicant', () => {
    const result = getCoapplicantChecklist(mockItems, 'Jane Doe');

    // Should have same number of items as original
    expect(result).toHaveLength(mockItems.length);
  });

  it('prefixes all IDs with coapplicant_', () => {
    const result = getCoapplicantChecklist(mockItems, 'Jane Doe');

    result.forEach((item, index) => {
      expect(item.id).toBe(`coapplicant_${mockItems[index].id}`);
    });

    // Specific checks
    expect(result[0].id).toBe('coapplicant_kyc_aadhaar');
    expect(result[1].id).toBe('coapplicant_kyc_pan');
    expect(result[5].id).toBe('coapplicant_biz_audited_bs');
  });

  it('formats names as "Co-applicant [Original Name] ([Co-applicant Name])"', () => {
    const result = getCoapplicantChecklist(mockItems, 'Jane Doe');

    expect(result[0].name).toBe('Co-applicant Aadhaar Card (Jane Doe)');
    expect(result[2].name).toBe('Co-applicant Pay Slips (Last 6 Months) (Jane Doe)');
    expect(result[9].name).toBe('Co-applicant Any Other Documents (Jane Doe)');
  });

  it('handles different co-applicant names correctly', () => {
    const result = getCoapplicantChecklist(mockItems.slice(0, 1), 'Ravi Sharma');
    expect(result[0].name).toBe('Co-applicant Aadhaar Card (Ravi Sharma)');
  });

  it('falls back to default "Co-applicant" name when not provided', () => {
    const result = getCoapplicantChecklist(mockItems.slice(0, 1));
    expect(result[0].name).toBe('Co-applicant Aadhaar Card (Co-applicant)');
  });

  it('sets KYC documents as required (required: true)', () => {
    const result = getCoapplicantChecklist(mockItems, 'Jane Doe');

    const kycItems = result.filter(item => item.category === 'kyc');
    expect(kycItems.length).toBeGreaterThan(0);
    kycItems.forEach(item => {
      expect(item.required).toBe(true);
    });

    // Specific checks
    const kycAadhaar = result.find(item => item.id === 'coapplicant_kyc_aadhaar');
    expect(kycAadhaar?.required).toBe(true);

    const kycPan = result.find(item => item.id === 'coapplicant_kyc_pan');
    expect(kycPan?.required).toBe(true);
  });

  it('sets non-KYC documents as optional (required: false)', () => {
    const result = getCoapplicantChecklist(mockItems, 'Jane Doe');

    const nonKycCategories = ['income_proof', 'business_documents', 'property_documents', 'financial_documents', 'legal_documents', 'others'];

    nonKycCategories.forEach(category => {
      const items = result.filter(item => item.category === category);
      items.forEach(item => {
        expect(item.required).toBe(false);
      });
    });

    // Specific checks for each non-KYC category
    expect(result.find(item => item.id === 'coapplicant_inc_payslips_6')?.required).toBe(false);
    expect(result.find(item => item.id === 'coapplicant_biz_gst_returns')?.required).toBe(false);
    expect(result.find(item => item.id === 'coapplicant_prop_link_docs')?.required).toBe(false);
    expect(result.find(item => item.id === 'coapplicant_fin_bank_stmt_12')?.required).toBe(false);
    expect(result.find(item => item.id === 'coapplicant_legal_roc_search')?.required).toBe(false);
    expect(result.find(item => item.id === 'coapplicant_others_any')?.required).toBe(false);
  });

  it('preserves the original category for each duplicated item', () => {
    const result = getCoapplicantChecklist(mockItems, 'Jane Doe');

    result.forEach((item, index) => {
      expect(item.category).toBe(mockItems[index].category);
    });
  });

  it('returns an empty array when given an empty array', () => {
    const result = getCoapplicantChecklist([], 'Jane Doe');
    expect(result).toEqual([]);
  });

  it('does not mutate the original items array', () => {
    const originalItems = [...mockItems];
    const originalIds = mockItems.map(item => item.id);

    getCoapplicantChecklist(mockItems, 'Jane Doe');

    // Original items should be unchanged
    expect(mockItems).toEqual(originalItems);
    expect(mockItems.map(item => item.id)).toEqual(originalIds);
  });
});
