import { describe, it, expect } from 'vitest';
import { ruleParse, slugify } from '../src/services/aiBotParse.js';
import { extractMobile, extractLeadCode, stripIds, pickLeads, titleCase, slotFor, istDate } from '../src/routes/aiBot.js';
import { categorizer } from '../src/services/docCategory.js';

const NOW = Date.parse('2026-10-18T06:00:00Z');

describe('AI Bot rule parser', () => {
  it('saves a named file with a label', () => {
    expect(ruleParse("this is Ravi Kumar's PAN card", 1, NOW)).toEqual({ action: 'save', lead: 'Ravi Kumar', date: '', label: 'PAN' });
  });
  it('lists a customer on a date', () => {
    expect(ruleParse('show Ravi Kumar documents 18/10/2026', 0, NOW)).toMatchObject({ action: 'list', lead: 'Ravi Kumar', date: '2026-10-18' });
  });
  it('understands yesterday', () => {
    expect(ruleParse('Sita Devi yesterday', 0, NOW).date).toBe('2026-10-17');
  });
  it('lists recent leads', () => {
    expect(ruleParse('leads', 0, NOW).action).toBe('leads');
  });
  it('asks for help when no name is given', () => {
    expect(ruleParse('save this', 1, NOW).action).toBe('help');
  });
  it('slugifies names', () => {
    expect(slugify('  Ravi  Kumar. ')).toBe('ravi-kumar');
  });
});

describe('mobile and lead id', () => {
  it('finds an Indian mobile in any common format', () => {
    expect(extractMobile('Ravi Kumar 98765 43210 PAN')).toBe('9876543210');
    expect(extractMobile('+91-9876543210')).toBe('9876543210');
    expect(extractMobile('09876543210')).toBe('9876543210');
    expect(extractMobile('amount 123456789012')).toBeNull();
    expect(extractMobile('pin 500081')).toBeNull();
  });
  it('finds a lead id', () => {
    expect(extractLeadCode('save to l10031 please')).toBe('L10031');
    expect(extractLeadCode('Ravi Kumar')).toBeNull();
  });
  it('strips ids out of the name text', () => {
    expect(stripIds('Ravi Kumar 9876543210 L10031 PAN')).toBe('Ravi Kumar PAN');
  });
});

describe('lead matching', () => {
  const rows = [
    { id: 1, customer_name: 'Ravi Kumar' },
    { id: 2, customer_name: 'Ravi Kumar Reddy' },
    { id: 3, customer_name: 'Ravi Teja' },
  ];
  it('prefers an exact full-name match', () => {
    expect(pickLeads(rows, 'ravi kumar').map((r) => r.id)).toEqual([1]);
  });
  it('returns every lead containing all typed words', () => {
    expect(pickLeads(rows, 'Ravi').map((r) => r.id)).toEqual([1, 2, 3]);
    expect(pickLeads(rows, 'Reddy').map((r) => r.id)).toEqual([2]);
  });
  it('title-cases new lead names', () => {
    expect(titleCase('  ravi   KUMAR ')).toBe('Ravi Kumar');
  });
});

describe('filing into checklist slots and folders', () => {
  const checklist = [
    { id: 'kyc_pan', name: 'PAN Card', category: 'kyc' },
    { id: 'kyc_aadhaar', name: 'Aadhaar Card', category: 'kyc' },
    { id: 'inc_salary_slip', name: 'Salary Slips', category: 'income_proof' },
  ];
  it('uses the typed label, then the file name, else Other Documents', () => {
    expect(slotFor(checklist, 'PAN', 'scan1.pdf').id).toBe('kyc_pan');
    expect(slotFor(checklist, '', 'aadhaar_front.jpg').id).toBe('kyc_aadhaar');
    expect(slotFor(checklist, '', 'IMG_2031.jpg').id).toBe('other_docs');
  });
  it("matches each lead's checklist item names when the standard slot is not in its checklist", () => {
    const business = [
      { id: 'fin_pan_all', name: 'Pan Card (All Director)', category: 'financial_documents' },
      { id: 'fin_aadhaar_all', name: 'Aadhar Card (All Director)', category: 'financial_documents' },
      { id: 'fin_gst_reg', name: 'GST Registration', category: 'financial_documents' },
    ];
    expect(slotFor(business, 'PAN', 'scan1.pdf').id).toBe('fin_pan_all');
    expect(slotFor(business, '', 'aadhaar_front.jpg').id).toBe('fin_aadhaar_all');
    expect(slotFor(business, '', 'card_scan_2.pdf').id).toBe('other_docs');
  });
  it('puts documents in category folders', () => {
    const cat = categorizer({ loan_type: null });
    expect(cat('other_docs')).toEqual({ key: 'others', label: 'Others' });
    expect(cat('sanction_letter_1')).toEqual({ key: 'others', label: 'Others' });
    expect(cat('legal_title_deed').label).toBe('Legal Documents');
  });
  it('dates uploads in India time', () => {
    expect(istDate('2026-10-18T20:00:00Z')).toBe('2026-10-19');
  });
});

describe('one-tap new lead', async () => {
  const { LOAN_TYPES, defaultProfile, leadButton } = await import('../src/routes/aiBot.js');
  const { DECISION_TREE } = await import('../src/whatsapp-intake/leadChecklistData.js');
  it('every loan-type button gives a real checklist, not the general fallback', () => {
    for (const [type] of LOAN_TYPES) {
      const p = defaultProfile(type);
      const key = [p.loan_type, p.loan_status, p.income_source, p.resident_type, p.business_type].filter(Boolean).join('|');
      expect(DECISION_TREE[key], key).toBeTruthy();
    }
  });
  it('labels loans so a customer’s loans can be told apart', () => {
    expect(leadButton({ customer_name: 'Ravi Kumar', loan_type: 'home_loan', status: 'Processing', lead_code: 'L10031' }))
      .toBe('Ravi Kumar · Home Loan · Processing · L10031');
  });
});
