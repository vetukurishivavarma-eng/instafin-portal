-- Migration 004: Add is_active column for soft-delete / lead inactive status
-- All existing leads are active by default.

ALTER TABLE leads
ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- Add index for filtering active/inactive leads
CREATE INDEX IF NOT EXISTS idx_leads_is_active ON leads (is_active);
