-- Migration 017: Add Agri Loan to the loan_types table
-- Ensures the loan type is available in the database for all users

INSERT INTO loan_types (name, key, description, active)
VALUES ('Agri Loan', 'agri_loan', 'Agriculture and farming loans for crop cultivation, equipment purchase, and land development', true)
ON CONFLICT (key) DO NOTHING;
