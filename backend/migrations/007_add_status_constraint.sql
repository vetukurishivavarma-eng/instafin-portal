-- Migration 007: Add 'Inactive' and 'Closed' to leads status constraint
-- This allows the toggle-active endpoint to set status to 'Inactive'
-- and the close lead endpoint to set status to 'Closed'

-- First, find and drop the existing CHECK constraint on the status column
-- The constraint is typically named 'leads_status_check'
-- If it doesn't exist, the statement simply does nothing
DO $$
BEGIN
  -- Drop the existing constraint if it exists
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'leads_status_check' 
    AND conrelid = 'leads'::regclass
  ) THEN
    ALTER TABLE leads DROP CONSTRAINT leads_status_check;
  END IF;
  
  -- Also try alternative naming convention
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'leads_status' 
    AND conrelid = 'leads'::regclass
  ) THEN
    ALTER TABLE leads DROP CONSTRAINT leads_status;
  END IF;
END $$;

-- Add the updated constraint with all valid statuses
ALTER TABLE leads
ADD CONSTRAINT leads_status_check 
CHECK (status IN ('New', 'Assigned', 'Processing', 'Sanctioned', 'Partially Disbursed', 'Disbursed', 'Rejected', 'Inactive', 'Closed'));

-- Also update the lead_banks status constraint if it exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'lead_banks_status_check' 
    AND conrelid = 'lead_banks'::regclass
  ) THEN
    ALTER TABLE lead_banks DROP CONSTRAINT lead_banks_status_check;
  END IF;
END $$;

-- Re-add lead_banks constraint if the table and constraint exist
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'lead_banks'
  ) THEN
    ALTER TABLE lead_banks
    ADD CONSTRAINT lead_banks_status_check
    CHECK (status IN ('Processing', 'Sanctioned', 'Partially Disbursed', 'Disbursed', 'Rejected'));
  END IF;
END $$;
