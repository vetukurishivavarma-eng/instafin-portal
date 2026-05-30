-- Migration: Remove Srinivasa Raju and Suresh Kumar from the executives table
-- Run these queries in order in your Supabase Dashboard SQL Editor.

-- STEP 1: Check if any leads are assigned to these executives (so you know what will be affected)
SELECT id, customer_name, assigned_to, status
FROM leads
WHERE assigned_to IN ('Srinivasa Raju', 'Suresh Kumar');

-- STEP 2: Remove from the executives table only
DELETE FROM executives
WHERE name IN ('Srinivasa Raju', 'Suresh Kumar');
