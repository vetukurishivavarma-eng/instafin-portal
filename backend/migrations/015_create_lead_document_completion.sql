-- Create lead_document_completion table to persist document completion/pending status
CREATE TABLE IF NOT EXISTS lead_document_completion (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  document_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('complete', 'pending')),
  reason TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(lead_id, document_id)
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_lead_document_completion_lead_id ON lead_document_completion(lead_id);

-- Trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_lead_document_completion_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_lead_document_completion_updated_at ON lead_document_completion;
CREATE TRIGGER trg_lead_document_completion_updated_at
  BEFORE UPDATE ON lead_document_completion
  FOR EACH ROW
  EXECUTE FUNCTION update_lead_document_completion_updated_at();
