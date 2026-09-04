-- Migration 025: WhatsApp document intake
--
-- 1. Adds a short, human-typeable "lead_code" to leads (e.g. L10001) - this is
--    the <LeadID> customers type into WhatsApp filenames. The existing `id`
--    stays the real primary key (UUID); lead_code is a friendly alias.
-- 2. Adds an audit table (whatsapp_intake_log) recording every inbound
--    WhatsApp document message and what happened to it - success, duplicate,
--    or a specific failure reason. This is what the admin monitoring screen
--    and the unit/integration tests read from.
--
-- Plain ASCII only in this file (no em-dashes, no box-drawing characters) -
-- those have been observed getting mangled when pasted into a web SQL editor
-- and breaking statements several lines later.

-- 1. Lead code
CREATE SEQUENCE IF NOT EXISTS lead_code_seq START WITH 10001 INCREMENT BY 1;

ALTER TABLE leads ADD COLUMN IF NOT EXISTS lead_code TEXT;

CREATE OR REPLACE FUNCTION set_lead_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.lead_code IS NULL THEN
    NEW.lead_code := 'L' || nextval('lead_code_seq');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_lead_code ON leads;
CREATE TRIGGER trg_set_lead_code
  BEFORE INSERT ON leads
  FOR EACH ROW
  EXECUTE FUNCTION set_lead_code();

-- Backfill existing rows in creation order so earlier leads get lower codes.
WITH numbered AS (
  SELECT id, 10000 + ROW_NUMBER() OVER (ORDER BY created_at) AS n
  FROM leads
  WHERE lead_code IS NULL
)
UPDATE leads
SET lead_code = 'L' || numbered.n
FROM numbered
WHERE leads.id = numbered.id;

-- Keep the sequence ahead of any backfilled values.
DO $$
DECLARE
  max_num INTEGER;
BEGIN
  SELECT COALESCE(MAX(substring(lead_code from 2)::int), 10000)
    INTO max_num
    FROM leads;

  PERFORM setval('lead_code_seq', GREATEST(10001, max_num + 1));
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS leads_lead_code_key ON leads (lead_code);

-- 2. WhatsApp intake audit log
CREATE TABLE IF NOT EXISTS whatsapp_intake_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  provider TEXT NOT NULL DEFAULT 'whatsapp-web',
  provider_message_id TEXT NOT NULL,
  sender_number TEXT NOT NULL,

  original_filename TEXT NOT NULL,
  mime_type TEXT,
  file_size_bytes INTEGER,
  file_hash TEXT,

  parsed_lead_code TEXT,
  parsed_document_name TEXT,

  matched_lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  matched_document_id TEXT,
  checklist_status_id UUID REFERENCES lead_checklist_status(id) ON DELETE SET NULL,

  status TEXT NOT NULL DEFAULT 'received',
  failure_reason TEXT,
  failure_code TEXT,

  notified_executive BOOLEAN NOT NULL DEFAULT false,

  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,

  UNIQUE (provider, provider_message_id)
);

CREATE INDEX IF NOT EXISTS whatsapp_intake_log_lead_idx ON whatsapp_intake_log (matched_lead_id);
CREATE INDEX IF NOT EXISTS whatsapp_intake_log_status_idx ON whatsapp_intake_log (status);
CREATE INDEX IF NOT EXISTS whatsapp_intake_log_received_idx ON whatsapp_intake_log (received_at DESC);
CREATE INDEX IF NOT EXISTS whatsapp_intake_log_dedupe_idx ON whatsapp_intake_log (matched_lead_id, matched_document_id, file_hash);
