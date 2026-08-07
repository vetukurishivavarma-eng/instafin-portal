-- Migration 020: Auto-fill bank application forms
-- 1. application_forms: track source URL (for internet sync) and AI-calibrated field map (for PDF auto-fill)
ALTER TABLE application_forms ADD COLUMN IF NOT EXISTS source_url TEXT;
ALTER TABLE application_forms ADD COLUMN IF NOT EXISTS field_map JSONB;

-- 2. Persist filled forms per lead (so customers/admins can re-download)
CREATE TABLE IF NOT EXISTS lead_filled_forms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  form_id UUID REFERENCES application_forms(id) ON DELETE SET NULL,
  bank_name TEXT,
  loan_type TEXT,
  form_name TEXT,
  file_path TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lead_filled_forms_lead ON lead_filled_forms (lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_filled_forms_created ON lead_filled_forms (created_at DESC);
