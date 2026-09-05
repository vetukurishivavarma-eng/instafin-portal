-- Migration 026: WhatsApp raw (sender-matched) document intake
--
-- New flow: customers won't reliably name files "<LeadID>_<DocName>.ext".
-- Instead the lead is resolved from the SENDER'S PHONE NUMBER (matched against
-- leads.mobile), and every file that sender sends to the business WhatsApp
-- number is captured raw against that lead - no filename convention, no
-- per-document type matching at intake time. An executive places each file
-- into the checklist later (bulk or one by one); an AI content classifier can
-- be slotted in on top of these same rows.
--
-- These rows sit in whatsapp_intake_log with status = 'unassigned' until
-- placed. Two new columns hold the stored file so the portal can serve it.
--
-- Plain ASCII only (see migration 025's note).

ALTER TABLE whatsapp_intake_log ADD COLUMN IF NOT EXISTS storage_path TEXT;
ALTER TABLE whatsapp_intake_log ADD COLUMN IF NOT EXISTS download_name TEXT;

-- status is a free-text column (no CHECK constraint) so 'unassigned' needs no
-- schema change; this index just keeps the per-lead "what is waiting" lookup fast.
CREATE INDEX IF NOT EXISTS whatsapp_intake_log_unassigned_idx
  ON whatsapp_intake_log (matched_lead_id)
  WHERE status = 'unassigned';
