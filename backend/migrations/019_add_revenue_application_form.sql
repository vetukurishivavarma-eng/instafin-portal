-- Migration 019: Add revenue (manual input, admin-only) and application_form (LLM-filled) columns to leads
ALTER TABLE leads ADD COLUMN IF NOT EXISTS revenue NUMERIC(15,2);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS application_form JSONB;
