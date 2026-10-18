-- Migration 027: AI Bot login (role ai_bot) - only sees /ai-bot: save / fetch
-- documents by customer name. Files live in Storage lead-documents/ai-bot/.
-- users_role_check only allowed the old roles, so widen it first (this also
-- unblocks operations_head from migration 018, which is missing from users).
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('admin', 'operations_head', 'executive', 'dsa', 'ai_bot'));

INSERT INTO users (name, email, password, role, status, created_at)
VALUES ('AI Bot', 'aibot@instafin.com', '$2b$10$wTcmViY/lbTdATBvsqyKKebnjFpCt4VnacUN9/e0Tj/h2AO6ICLoK', 'ai_bot', 'active', NOW())
ON CONFLICT (email) DO NOTHING;
