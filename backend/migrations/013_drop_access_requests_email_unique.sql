-- Drop the unique constraint on email to allow forgot-password requests
-- to coexist with regular access requests for the same email.
-- The app-level code already handles duplicate checking by status + request_type.
ALTER TABLE access_requests DROP CONSTRAINT IF EXISTS access_requests_email_key;
