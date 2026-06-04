-- Migration 006: New features - status_history, credit_queries, branch_name, close lead
-- Part of the InstaFin Portal feature expansion

-- ============================================================
-- 1. STATUS HISTORY TABLE
-- Tracks every status change with timestamps for duration calculation
-- ============================================================
CREATE TABLE IF NOT EXISTS status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  previous_status TEXT,
  new_status TEXT NOT NULL,
  changed_by TEXT,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_status_history_lead ON status_history (lead_id);
CREATE INDEX IF NOT EXISTS idx_status_history_changed_at ON status_history (changed_at);

-- ============================================================
-- 2. CREDIT QUERIES TABLE
-- Tracks credit inquiries raised by banks for leads
-- ============================================================
CREATE TABLE IF NOT EXISTS credit_queries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  bank_name TEXT NOT NULL,
  query_date DATE NOT NULL DEFAULT CURRENT_DATE,
  query_type TEXT NOT NULL DEFAULT 'initial',
  remarks TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  response_date DATE,
  response_remarks TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_credit_queries_lead ON credit_queries (lead_id);
CREATE INDEX IF NOT EXISTS idx_credit_queries_bank ON credit_queries (bank_name);

-- ============================================================
-- 3. ADD BRANCH NAME TO LEAD_BANKS
-- ============================================================
ALTER TABLE lead_banks
ADD COLUMN IF NOT EXISTS branch_name TEXT;

-- ============================================================
-- 4. ADD CLOSED STATUS SUPPORT TO LEADS
-- ============================================================
ALTER TABLE leads
ADD COLUMN IF NOT EXISTS is_closed BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE leads
ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;

-- ============================================================
-- 5. ADD ENTRY DATE SUPPORT (will be auto-set via backend)
-- entry_date is different from created_at - it's the date the lead was entered into the system
-- For most cases, this is the same as created_at
-- ============================================================
ALTER TABLE leads
ADD COLUMN IF NOT EXISTS entry_date TIMESTAMPTZ NOT NULL DEFAULT now();

-- Index for closed leads
CREATE INDEX IF NOT EXISTS idx_leads_is_closed ON leads (is_closed);
