-- Migration 008: Fix leads in Processing status without assigned banks
-- Identified leads: LALITHAA LOGISTICS, sudheer chiranjeevi pubbraju
-- Also: Rejected leads should be treated as inactive

-- 1. Fix leads where status is 'Processing' but assigned_banks is empty or null
--    They should revert to 'Assigned' (if assigned to someone) or 'New' (if not assigned)
UPDATE leads
SET status = CASE
  WHEN assigned_to IS NOT NULL THEN 'Assigned'
  ELSE 'New'
END
WHERE status = 'Processing'
  AND (assigned_banks IS NULL OR assigned_banks = '[]' OR array_length(assigned_banks, 1) IS NULL OR assigned_banks = '{}');

-- 2. Explicitly fix the two named leads
UPDATE leads
SET status = CASE
  WHEN assigned_to IS NOT NULL THEN 'Assigned'
  ELSE 'New'
END
WHERE LOWER(customer_name) IN ('lalithaa logistics', 'sudheer chiranjeevi pubbraju');

-- 3. Mark Rejected leads as inactive so they show in inactive counts
UPDATE leads
SET is_active = false
WHERE status = 'Rejected' AND (is_active IS NULL OR is_active = true);

