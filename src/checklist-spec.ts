/**
 * Loan Checklist Page Specification
 * Shared between all 4 agents
 */

export type LoanType = 'home_loan' | 'lap' | 'mudra' | 'msme' | 'business_loan' | 'personal_loan' | 'education_loan';
export type LoanStatus = 'new' | 'topup_equity' | 'takeover';
export type IncomeSource = 'salaried' | 'non_salaried';
export type ResidentType = 'nri' | 'indian_resident';
export type BusinessType = 'proprietor' | 'partnership' | 'pvt_ltd' | 'llp';

export interface Selection {
  loanType: LoanType;
  loanStatus?: LoanStatus;
  incomeSource?: IncomeSource;
  residentType?: ResidentType;
  businessType?: BusinessType;
}

export interface ChecklistItem {
  id: string;
  name: string;
  category: string;
  required: boolean;
}

// Key format: "loanType|loanStatus|incomeSource|residentType|businessType"
export type ChecklistKey = string;

export const DECISION_TREE: Record<ChecklistKey, ChecklistItem[]> = {
  // Add checklist entries here
};

// Selection state context
export interface ChecklistState {
  selection: Selection;
  setSelection: (s: Selection) => void;
}