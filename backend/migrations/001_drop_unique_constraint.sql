-- Migration: Drop unique constraint on (lead_id, document_id)
-- This allows multiple files to be uploaded for the same document under a lead.
-- The constraint lead_checklist_status_lead_id_document_id_key was preventing
-- multiple uploads for the same checklist item (e.g., multiple Aadhaar copies).

ALTER TABLE lead_checklist_status DROP CONSTRAINT IF EXISTS lead_checklist_status_lead_id_document_id_key;

-- Also recreate the index as a non-unique index for query performance
CREATE INDEX IF NOT EXISTS idx_lead_checklist_status_lead_doc ON lead_checklist_status (lead_id, document_id);
