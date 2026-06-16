import express from 'express';
import { supabase } from '../lib/supabase.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';

const router = express.Router();

router.use(authenticate);

// GET /api/follow-ups/lead/:leadId — Get follow-ups for a specific lead
router.get('/lead/:leadId', authorize('admin', 'executive', 'dsa'), async (req, res) => {
  try {
    const { leadId } = req.params;
    const { date } = req.query;

    let query = supabase
      .from('follow_ups')
      .select('*')
      .eq('lead_id', leadId)
      .order('follow_up_date', { ascending: false });

    if (date) {
      query = query.eq('follow_up_date', date);
    }

    const { data: followUps, error } = await query;

    if (error) {
      if (error.message && (error.message.includes('relation') || error.message.includes('does not exist'))) {
        return res.json({ data: [] });
      }
      throw error;
    }

    res.json({ data: followUps || [] });
  } catch (error) {
    console.error('Error fetching follow-ups:', error);
    res.status(500).json({ error: 'Failed to fetch follow-ups' });
  }
});

// POST /api/follow-ups — Create a new follow-up entry
router.post('/', authorize('admin', 'executive'), async (req, res) => {
  try {
    const { lead_id, follow_up_date, result, notes } = req.body;

    if (!lead_id) {
      return res.status(400).json({ error: 'Lead ID is required' });
    }

    const today = new Date().toISOString().split('T')[0];
    const fuDate = follow_up_date || today;

    const { data: newFollowUp, error } = await supabase
      .from('follow_ups')
      .insert({
        lead_id,
        follow_up_date: fuDate,
        result: result || null,
        notes: notes || null,
        created_by: req.user?.name || req.user?.email || 'system',
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      if (error.message && (error.message.includes('relation') || error.message.includes('does not exist'))) {
        return res.status(400).json({ error: 'Follow-ups table not yet set up. Please run database migrations.' });
      }
      throw error;
    }

    res.status(201).json({ data: newFollowUp });
  } catch (error) {
    console.error('Error creating follow-up:', error);
    res.status(500).json({ error: 'Failed to create follow-up' });
  }
});

// PUT /api/follow-ups/:id — Update a follow-up entry
router.put('/:id', authorize('admin', 'executive'), async (req, res) => {
  try {
    const { id } = req.params;
    const { result, notes } = req.body;

    const updateData = {
      updated_at: new Date().toISOString()
    };

    if (result !== undefined) updateData.result = result;
    if (notes !== undefined) updateData.notes = notes;

    const { data: updated, error } = await supabase
      .from('follow_ups')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    res.json({ data: updated });
  } catch (error) {
    console.error('Error updating follow-up:', error);
    res.status(500).json({ error: 'Failed to update follow-up' });
  }
});

// DELETE /api/follow-ups/:id — Delete a follow-up entry
router.delete('/:id', authorize('admin'), async (req, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from('follow_ups')
      .delete()
      .eq('id', id);

    if (error) throw error;

    res.json({ message: 'Follow-up deleted successfully' });
  } catch (error) {
    console.error('Error deleting follow-up:', error);
    res.status(500).json({ error: 'Failed to delete follow-up' });
  }
});

export default router;
