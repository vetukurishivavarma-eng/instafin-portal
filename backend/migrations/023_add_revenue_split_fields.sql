-- Migration 023: Split manual revenue into percent / received / pending / received-date
-- so admins can set the revenue percentage per lead (was hardcoded at 1%), track how much
-- of the revenue has actually come in vs is still pending, and attribute received revenue
-- to the month it was actually received in (rather than the lead's entry/disbursed month).
ALTER TABLE leads ADD COLUMN IF NOT EXISTS revenue_percent NUMERIC(5,2) DEFAULT 1;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS revenue_received NUMERIC(15,2);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS revenue_pending NUMERIC(15,2);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS revenue_received_date DATE;
