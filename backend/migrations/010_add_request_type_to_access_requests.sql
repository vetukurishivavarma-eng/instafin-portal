-- Add request_type column to distinguish forgot_password from access_request
ALTER TABLE access_requests ADD COLUMN IF NOT EXISTS request_type VARCHAR(50) DEFAULT 'access_request';

-- Add new_password column for admin to set during forgot-password approval
ALTER TABLE access_requests ADD COLUMN IF NOT EXISTS new_password VARCHAR(255);
