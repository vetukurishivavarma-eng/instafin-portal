/**
 * TypeScript types for Loan Checklist functionality
 */

// Loan Type - categories of loans offered
export type LoanType = 'home_loan' | 'lap' | 'mudra' | 'msme' | 'business_loan' | 'personal_loan' | 'education_loan';

// Loan Status - the state/type of the loan application
export type LoanStatus = 'new' | 'topup_equity' | 'takeover';

// Income Source - how the applicant earns income
export type IncomeSource = 'salaried' | 'non_salaried';

// Resident Type - residency status of the applicant
export type ResidentType = 'nri' | 'indian_resident';

// Business Type - legal structure of the business (for non-salaried)
export type BusinessType = 'proprietor' | 'partnership' | 'pvt_ltd' | 'llp';

// Document Category - classification of required documents
export type DocumentCategory =
  | 'kyc'
  | 'income_proof'
  | 'business_documents'
  | 'property_documents'
  | 'financial_documents'
  | 'legal_documents';

// Selection object - user selections in the decision tree
export interface Selection {
  loanType: LoanType;
  loanStatus?: LoanStatus;
  incomeSource?: IncomeSource;
  residentType?: ResidentType;
  businessType?: BusinessType;
}

// Checklist item - a single document requirement
export interface ChecklistItem {
  id: string;
  name: string;
  category: DocumentCategory;
  required: boolean;
}

// Checklist key format: "loanType|loanStatus|incomeSource|residentType|businessType"
// businessType is optional and only included for non_salaried
export type ChecklistKey = string;

// Decision tree - maps keys to checklist arrays
export interface DecisionTree {
  [key: ChecklistKey]: ChecklistItem[];
}

// Memoization cache type
type MemoizationCache = Map<string, ChecklistItem[]>;

// Selection to key converter result
export interface KeyParts {
  loanType: LoanType;
  loanStatus: string;
  incomeSource: string;
  residentType: string;
  businessType?: string;
}