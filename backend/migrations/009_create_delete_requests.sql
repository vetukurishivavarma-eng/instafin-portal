-- Migration 009: Create delete_requests table for executive delete requests with admin approval
-- This enables a workflow where executives can request lead deletion
-- and admins approve/reject those requests.

CREATE TABLE IF NOT EXISTS delete_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    requested_by UUID NOT NULL REFERENCES users(id),
    requested_by_name TEXT NOT NULL,
    customer_name TEXT NOT NULL,
    reason TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    reviewed_by UUID REFERENCES users(id),
    reviewed_by_name TEXT,
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for quick pending lookups
CREATE INDEX IF NOT EXISTS idx_delete_requests_status ON delete_requests (status);
CREATE INDEX IF NOT EXISTS idx_delete_requests_lead_id ON delete_requests (lead_id);

-- Trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_delete_requests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_delete_requests_updated_at ON delete_requests;
CREATE TRIGGER trg_delete_requests_updated_at
    BEFORE UPDATE ON delete_requests
    FOR EACH ROW
    EXECUTE FUNCTION update_delete_requests_updated_at();
