-- Migration: Add 'revoked' status to access_requests.status constraint
-- This allows the revoke-access endpoint to successfully update the status to 'revoked'.
-- Run this in your Supabase Dashboard SQL Editor.

-- Safely update the status CHECK constraint to include 'revoked'
ALTER TABLE access_requests 
DROP CONSTRAINT IF EXISTS access_requests_status_check;

ALTER TABLE access_requests
ADD CONSTRAINT access_requests_status_check
CHECK (status IN ('pending', 'approved', 'rejected', 'revoked'));
