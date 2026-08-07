-- Migration 021: Create cibil_reports table to store parsed CIBIL credit report data per lead
CREATE TABLE IF NOT EXISTS cibil_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  file_name TEXT,
  file_path TEXT,
  report_data JSONB,
  cibil_score INTEGER,
  parsed_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);

-- Index for faster lookups by lead_id
CREATE INDEX IF NOT EXISTS idx_cibil_reports_lead_id ON cibil_reports(lead_id);
