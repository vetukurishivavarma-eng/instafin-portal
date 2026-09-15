import { evaluateFormula, type FormulaVars } from './formulaEval';

export type BankFormula = {
  bankName: string;
  loanType: string;
  formula?: string | null;
  rate?: number | string | null;
  period?: number | string | null;
  emiNmiPercent?: number | string | null;
};

export type BankMatch = {
  bankName: string;
  rate: number;
  period: number;
  emiNmiPercent: number;
  eligibleAmount: number;
  source: 'formula' | 'standard';
  formulaError: string | null;
  assigned: boolean;
};

type Defaults = { rate: number; period: number; emiNmiPercent: number };

/** "home_loan", "Home Loan" and "home  loan" compare equal (same idea as the form lookup's label). */
export function normalizeLoanType(value?: string | null): string {
  return String(value || '').replace(/_/g, ' ').trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Monthly EMI for ₹1,00,000 at `rate`% a year over `period` months (0 when either is missing). */
export function emiPerLac(rate: number, period: number): number {
  const monthly = rate / 100 / 12;
  if (monthly <= 0 || period <= 0) return 0;
  const growth = Math.pow(1 + monthly, period);
  return (100000 * monthly * growth) / (growth - 1);
}

function toNumber(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : parseFloat(String(value ?? ''));
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Rank the admin's saved bank formulas for this lead's loan type against the income on screen.
 * A bank with its own formula uses it — the formula computes the eligible amount directly, as the
 * formula editor describes; an invalid formula falls back to the standard EMI/NMI calculation with
 * that bank's rate, tenure and EMI/NMI %. Banks already on the lead are flagged. Highest amount first.
 */
export function rankBanks(
  formulas: BankFormula[],
  loanType: string | null | undefined,
  income: FormulaVars,
  defaults: Defaults,
  assignedBanks: string[] = []
): BankMatch[] {
  const wanted = normalizeLoanType(loanType);
  if (!wanted) return [];
  const assigned = new Set(assignedBanks.map((b) => String(b).trim().toLowerCase()));

  return formulas
    .filter((f) => normalizeLoanType(f.loanType) === wanted)
    .map((f) => {
      const rate = toNumber(f.rate, defaults.rate);
      const period = toNumber(f.period, defaults.period);
      const emiNmiPercent = toNumber(f.emiNmiPercent, defaults.emiNmiPercent);
      const emiAvailable = ((income.netIncome ?? 0) * emiNmiPercent) / 100 - (income.totalExistingEmis ?? 0);
      const perLac = emiPerLac(rate, period);

      let eligibleAmount = perLac > 0 ? (Math.max(0, emiAvailable) / perLac) * 100000 : 0;
      let source: BankMatch['source'] = 'standard';
      let formulaError: string | null = null;

      if (f.formula && f.formula.trim()) {
        const result = evaluateFormula(f.formula, { ...income, rate, period, emiNmiPercent, emiAvailable, emiPerLac: perLac });
        if (result.error) formulaError = result.error;
        else {
          eligibleAmount = Math.max(0, result.value ?? 0);
          source = 'formula';
        }
      }

      return {
        bankName: f.bankName,
        rate,
        period,
        emiNmiPercent,
        eligibleAmount,
        source,
        formulaError,
        assigned: assigned.has(String(f.bankName).trim().toLowerCase()),
      };
    })
    .sort((a, b) => b.eligibleAmount - a.eligibleAmount);
}
