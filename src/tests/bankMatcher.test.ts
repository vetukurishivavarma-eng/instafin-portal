import { describe, it, expect } from 'vitest';
import { rankBanks, emiPerLac, normalizeLoanType } from '../utils/bankMatcher';

const income = { netIncome: 100000, totalExistingEmis: 10000, grossSalary: 110000 };
const defaults = { rate: 8.5, period: 240, emiNmiPercent: 50 };

describe('bankMatcher', () => {
  it('computes the standard EMI per lakh', () => {
    expect(emiPerLac(8.5, 240)).toBeCloseTo(867.8, 0);
    expect(emiPerLac(0, 240)).toBe(0);
  });

  it('treats snake_case and label loan types as the same', () => {
    expect(normalizeLoanType('home_loan')).toBe(normalizeLoanType(' Home  Loan '));
  });

  it('ranks banks for the lead loan type, preferring a bank formula and flagging assigned banks', () => {
    const formulas = [
      { bankName: 'HDFC', loanType: 'Home Loan', rate: 8.5, period: 240, emiNmiPercent: 50 },
      { bankName: 'SBI', loanType: 'home_loan', formula: '(netIncome - totalExistingEmis) * 60' },
      { bankName: 'ICICI', loanType: 'Home Loan', formula: 'netIncome +' },
      { bankName: 'Axis', loanType: 'LAP', rate: 9, period: 180, emiNmiPercent: 60 },
    ];

    const ranked = rankBanks(formulas, 'home_loan', income, defaults, ['hdfc ']);

    expect(ranked.map((m) => m.bankName)).toEqual(['SBI', 'HDFC', 'ICICI']);
    expect(ranked[0]).toMatchObject({ source: 'formula', eligibleAmount: 5400000, assigned: false });
    // (100000 × 50% − 10000) / EMI-per-lakh × 1,00,000
    expect(ranked[1].eligibleAmount).toBeCloseTo((40000 / emiPerLac(8.5, 240)) * 100000, 0);
    expect(ranked[1]).toMatchObject({ source: 'standard', assigned: true });
    expect(ranked[2].source).toBe('standard');
    expect(ranked[2].formulaError).toBeTruthy();
  });

  it('returns nothing without a loan type', () => {
    expect(rankBanks([{ bankName: 'HDFC', loanType: 'Home Loan' }], '', income, defaults)).toEqual([]);
  });
});
