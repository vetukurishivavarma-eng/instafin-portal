import { supabase } from '../lib/supabase.js';

// Every lead-level status change goes through here, so status_history stays a
// complete event log (stuck-lead radar, bank TAT, customer stage alerts all read it).
export async function recordStatusChange(leadId, previousStatus, newStatus, changedBy, notes) {
  if (!newStatus || previousStatus === newStatus) return;
  try {
    await supabase
      .from('status_history')
      .insert({
        lead_id: leadId,
        previous_status: previousStatus ?? null,
        new_status: newStatus,
        changed_by: changedBy || 'system',
        changed_at: new Date().toISOString(),
        notes: notes || null
      });
  } catch (err) {
    console.error('Failed to record status history:', err);
  }
}
