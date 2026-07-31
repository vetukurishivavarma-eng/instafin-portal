-- Migration 018: Create Operations Head user
-- All features enabled EXCEPT: lead deletion / any delete operation, Revenue page disabled
-- Password: OpsHead@2026 (bcrypt hash)
INSERT INTO users (name, email, password, role, status, created_at)
VALUES (
  'Operations Head',
  'operations@instafin.com',
  '$2b$10$1bxlZamm3T0X8cDZbWcrQOTRDprQ37cVouwlXpD4oi4q55vbnXvIG',
  'operations_head',
  'active',
  NOW()
)
ON CONFLICT (email) DO NOTHING;
