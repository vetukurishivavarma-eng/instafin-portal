-- Migration 022: Create daily_hurdles table for the "Daily Hurdle" feature
-- Tracks tasks assigned to executives (by admin/ops head) or created by the executives themselves.
-- Overdue tasks must be justified (reason + expected completion date) or the executive
-- is blocked from using all other screens. Tasks delayed 3+ days trigger a 1% salary
-- penalty notification (email + WhatsApp).
CREATE TABLE IF NOT EXISTS daily_hurdles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed')),
  assignee_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assignee_name TEXT,
  assigned_by UUID REFERENCES users(id) ON DELETE SET NULL,
  assigned_by_name TEXT,
  deadline DATE,
  -- Justification supplied by the executive when a task goes overdue
  reason TEXT,
  expected_completion_date DATE,
  -- Number of times the executive has carried this overdue task forward with a new date
  carry_forward_count INTEGER NOT NULL DEFAULT 0,
  salary_penalty_notified BOOLEAN NOT NULL DEFAULT FALSE,
  penalty_notified_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_daily_hurdles_assignee ON daily_hurdles(assignee_id);
CREATE INDEX IF NOT EXISTS idx_daily_hurdles_status ON daily_hurdles(status);
CREATE INDEX IF NOT EXISTS idx_daily_hurdles_deadline ON daily_hurdles(deadline);
