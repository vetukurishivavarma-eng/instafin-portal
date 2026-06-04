import express from 'express';
import { supabase } from '../lib/supabase.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';

const router = express.Router();

router.use(authenticate);

// GET /api/status-history/:leadId — Get status history for a lead
router.get('/:leadId', authorize('admin', 'executive', 'dsa'), async (req, res) => {
  try {
    const { leadId } = req.params;

    const { data: history, error } = await supabase
      .from('status_history')
      .select('*')
      .eq('lead_id', leadId)
      .order('changed_at', { ascending: true });

    if (error) {
      if (error.message && (error.message.includes('relation') || error.message.includes('does not exist'))) {
        return res.json({ data: [] });
      }
      throw error;
    }

    // Calculate durations between status changes
    const historyWithDuration = (history || []).map((entry, index) => {
      let duration = null;
      if (index < history.length - 1) {
        const nextEntry = history[index + 1];
        const diffMs = new Date(nextEntry.changed_at) - new Date(entry.changed_at);
        duration = formatDuration(diffMs);
      } else {
        // Current status - calculate duration from change until now
        const diffMs = Date.now() - new Date(entry.changed_at).getTime();
        duration = formatDuration(diffMs);
      }

      return {
        ...entry,
        duration,
        isCurrent: index === history.length - 1
      };
    });

    res.json({ data: historyWithDuration });
  } catch (error) {
    console.error('Error fetching status history:', error);
    res.status(500).json({ error: 'Failed to fetch status history' });
  }
});

/**
 * Format milliseconds into a human-readable duration string
 */
function formatDuration(ms) {
  if (ms < 0) return '0 days';

  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    const remainingHours = hours % 24;
    if (remainingHours > 0) {
      return `${days}d ${remainingHours}h`;
    }
    return `${days} day${days !== 1 ? 's' : ''}`;
  }

  if (hours > 0) {
    const remainingMinutes = minutes % 60;
    if (remainingMinutes > 0) {
      return `${hours}h ${remainingMinutes}m`;
    }
    return `${hours} hour${hours !== 1 ? 's' : ''}`;
  }

  if (minutes > 0) {
    return `${minutes} min${minutes !== 1 ? 's' : ''}`;
  }

  return `${seconds} sec${seconds !== 1 ? 's' : ''}`;
}

export default router;
