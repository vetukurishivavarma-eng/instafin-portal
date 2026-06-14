-- Make password column nullable for forgot-password requests
ALTER TABLE access_requests ALTER COLUMN password DROP NOT NULL;
