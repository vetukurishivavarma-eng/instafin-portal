-- Migration 025: user-submitted filled forms
-- lead_filled_forms rows so far were always server-generated fills. A user
-- can now type into a baked fillable PDF and upload it back; the extracted
-- values are kept alongside the flattened file so the data is queryable
-- without re-parsing the PDF.
ALTER TABLE lead_filled_forms ADD COLUMN IF NOT EXISTS submitted_values JSONB;
ALTER TABLE lead_filled_forms ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'generated';
