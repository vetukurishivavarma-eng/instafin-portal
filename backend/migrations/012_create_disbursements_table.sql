-- Create disbursements table to track individual disbursement transactions
CREATE TABLE IF NOT EXISTS disbursements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  bank_id UUID NOT NULL REFERENCES lead_banks(id) ON DELETE CASCADE,
  amount NUMERIC(15,2) NOT NULL,
  disbursed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  disbursed_by UUID REFERENCES users(id),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_disbursements_bank_id ON disbursements(bank_id);
CREATE INDEX IF NOT EXISTS idx_disbursements_lead_id ON disbursements(lead_id);
