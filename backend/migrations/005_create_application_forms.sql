-- Migration 005: Create application_forms table for downloadable bank loan forms
-- Supports configurable form management without code changes

CREATE TABLE IF NOT EXISTS application_forms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_name TEXT NOT NULL,
  loan_type TEXT NOT NULL,
  form_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_type TEXT NOT NULL DEFAULT 'pdf',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for search performance
CREATE INDEX IF NOT EXISTS idx_app_forms_bank ON application_forms (bank_name);
CREATE INDEX IF NOT EXISTS idx_app_forms_loan_type ON application_forms (loan_type);
CREATE INDEX IF NOT EXISTS idx_app_forms_active ON application_forms (is_active);
CREATE INDEX IF NOT EXISTS idx_app_forms_bank_loan ON application_forms (bank_name, loan_type);

-- Seed initial forms for top banks (will be populated by API or admin)
