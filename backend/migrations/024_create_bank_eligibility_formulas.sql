-- Migration 024: Per-bank, per-loan-type eligibility formulas
-- Admin-entered spreadsheet-style formula (optional) plus rate/period/EMI-NMI%
-- defaults, used by the Customer Login Eligibility Calculator.
CREATE TABLE IF NOT EXISTS bank_eligibility_formulas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_name TEXT NOT NULL,
  loan_type TEXT NOT NULL,
  formula TEXT,
  rate NUMERIC(6,3),
  period INTEGER,
  emi_nmi_percent NUMERIC(5,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(bank_name, loan_type)
);
