/**
 * Daily Hurdle service — shared business logic for the task-tracking feature.
 *
 * Rules implemented:
 *  1. A task is OVERDUE when its deadline has passed and it is not completed.
 *  2. An overdue task BLOCKS the executive until they supply a `reason` and an
 *     `expected_completion_date` that has not yet passed (carry-forward).
 *  3. If a task stays overdue for >= PENALTY_DAYS (default 3, env HURDLE_PENALTY_DAYS),
 *     the executive is notified (email + WhatsApp) that 1% of their monthly salary
 *     will be deducted. Each task is notified at most once.
 */
import { supabase } from '../lib/supabase.js';
import { sendSalaryPenaltyEmail } from './email.service.js';
import { sendSalaryPenaltyWhatsApp } from './whatsapp.service.js';

export const HURDLE_PENALTY_DAYS = parseInt(process.env.HURDLE_PENALTY_DAYS || '3', 10);
export const SALARY_PENALTY_PERCENT = 1;

/** Roles that are subject to screen-blocking when they have blocking hurdles. */
export const BLOCKED_ROLES = ['executive'];

export function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function daysBetween(from, to) {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((to - from) / msPerDay);
}

/**
 * Compute the derived state of a single hurdle row (does not mutate it).
 * Returns a new object with `overdue`, `daysOverdue`, `justified` and `blocksAccess`.
 */
export function deriveHurdle(row) {
  const today = startOfToday();
  let overdue = false;
  let daysOverdue = 0;
  let justified = false;
  let blocksAccess = false;

  if (row.status !== 'completed' && row.deadline) {
    const deadline = new Date(`${row.deadline}T00:00:00`);
    if (deadline < today) {
      overdue = true;
      daysOverdue = daysBetween(deadline, today);
    }
  }

  if (overdue) {
    // A justification counts only if a reason exists AND the expected completion
    // date is today or in the future (task still "carried forward" under review).
    if (row.reason && row.expected_completion_date) {
      const expected = new Date(`${row.expected_completion_date}T00:00:00`);
      if (expected >= today) justified = true;
    }
    blocksAccess = !justified;
  }

  return { ...row, overdue, daysOverdue, justified, blocksAccess };
}

/**
 * Return the list of hurdles that currently block a user (executives only by rule,
 * but the caller decides who is checked).
 */
export async function getBlockingHurdles(userId) {
  if (!userId) return [];
  const { data, error } = await supabase
    .from('daily_hurdles')
    .select('*')
    .eq('assignee_id', userId)
    .neq('status', 'completed');

  if (error) {
    console.error('[HURDLES] Failed to load hurdles for block check:', error.message);
    return [];
  }

  return (data || [])
    .map(deriveHurdle)
    .filter(h => h.blocksAccess);
}

/**
 * True when the user is currently blocked (has at least one unresolved overdue hurdle).
 */
export async function isUserBlocked(userId) {
  const blocking = await getBlockingHurdles(userId);
  return blocking.length > 0;
}

/**
 * Find overdue tasks past the penalty threshold that have not yet triggered a
 * notification, send the 1% salary deduction warning (email + WhatsApp), and mark
 * them as notified. Runs best-effort; failures are logged, never thrown.
 */
export async function processPenaltyNotifications() {
  const thresholdDate = new Date(startOfToday().getTime() - HURDLE_PENALTY_DAYS * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0];

  const { data: rows, error } = await supabase
    .from('daily_hurdles')
    .select('*')
    .eq('salary_penalty_notified', false)
    .neq('status', 'completed')
    .not('deadline', 'is', null)
    .lte('deadline', thresholdDate);

  if (error) {
    console.error('[HURDLES] Failed to load penalty-eligible hurdles:', error.message);
    return { processed: 0 };
  }

  let processed = 0;
  for (const row of rows || []) {
    const hurdle = deriveHurdle(row);
    if (!hurdle.overdue || hurdle.daysOverdue < HURDLE_PENALTY_DAYS) continue;

    try {
      // Atomically claim the notification slot so concurrent requests can't double-send.
      const { data: claimed, error: claimError } = await supabase
        .from('daily_hurdles')
        .update({ salary_penalty_notified: true, penalty_notified_at: new Date().toISOString() })
        .eq('id', row.id)
        .eq('salary_penalty_notified', false)
        .select('id');

      if (claimError) {
        console.error(`[HURDLES] Failed to claim penalty slot for hurdle ${row.id}:`, claimError.message);
        continue;
      }
      if (!claimed || claimed.length === 0) continue; // another request already claimed it

      // Look up the assignee's email + mobile (mobile lives on access_requests).
      const { data: user } = await supabase
        .from('users')
        .select('name, email')
        .eq('id', row.assignee_id)
        .single();

      let mobile = null;
      if (user?.email) {
        const { data: req } = await supabase
          .from('access_requests')
          .select('mobile')
          .eq('email', user.email)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        mobile = req?.mobile || null;
      }

      const name = user?.name || row.assignee_name || 'Executive';
      const email = user?.email || '';

      const [emailResult, whatsappResult] = await Promise.all([
        email
          ? sendSalaryPenaltyEmail({
              name,
              email,
              taskTitle: row.title,
              daysOverdue: hurdle.daysOverdue,
              percent: SALARY_PENALTY_PERCENT,
            })
          : Promise.resolve({ success: false }),
        sendSalaryPenaltyWhatsApp({
          name,
          mobile,
          taskTitle: row.title,
          daysOverdue: hurdle.daysOverdue,
          percent: SALARY_PENALTY_PERCENT,
        }),
      ]);

      if (!emailResult?.success && !whatsappResult?.success) {
        // Nothing was delivered — release the claim so it retries on the next pass.
        await supabase
          .from('daily_hurdles')
          .update({ salary_penalty_notified: false, penalty_notified_at: null })
          .eq('id', row.id);
        console.warn(`[HURDLES] Penalty notice for hurdle ${row.id} could not be delivered (email=${emailResult?.success ? 'ok' : 'fail'}, whatsapp=${whatsappResult?.success ? 'ok' : 'fail'}). Will retry.`);
        continue;
      }

      processed += 1;
    } catch (err) {
      console.error(`[HURDLES] Penalty notification failed for hurdle ${row.id}:`, err.message);
      // Release the claim on unexpected errors so it can be retried.
      await supabase
        .from('daily_hurdles')
        .update({ salary_penalty_notified: false, penalty_notified_at: null })
        .eq('id', row.id)
        .catch(() => {});
    }
  }

  if (processed > 0) {
    console.log(`[HURDLES] Sent ${processed} salary penalty notification(s).`);
  }
  return { processed };
}
