import express from 'express';
import { supabase } from '../lib/supabase.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';

const router = express.Router();

router.use(authenticate);

// GET /api/credit-queries — Get credit queries with optional filters
router.get('/', authorize('admin', 'executive', 'dsa'), async (req, res) => {
  try {
    const { lead_id, bank_name, status } = req.query;

    let query = supabase
      .from('credit_queries')
      .select('*')
      .order('created_at', { ascending: false });

    if (lead_id) query = query.eq('lead_id', lead_id);
    if (bank_name) query = query.ilike('bank_name', `%${bank_name}%`);
    if (status) query = query.eq('status', status);

    const { data: queries, error } = await query;

    // If table doesn't exist yet, return empty array
    if (error && error.message && (error.message.includes('relation') || error.message.includes('does not exist'))) {
      return res.json({ data: [] });
    }

    if (error) throw error;

    res.json({ data: queries || [] });
  } catch (error) {
    console.error('Error fetching credit queries:', error);
    res.status(500).json({ error: 'Failed to fetch credit queries' });
  }
});

// GET /api/credit-queries/lead/:leadId — Get credit queries for a specific lead
router.get('/lead/:leadId', authorize('admin', 'executive', 'dsa'), async (req, res) => {
  try {
    const { leadId } = req.params;

    const { data: queries, error } = await supabase
      .from('credit_queries')
      .select('*')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false });

    if (error) {
      if (error.message && (error.message.includes('relation') || error.message.includes('does not exist'))) {
        return res.json({ data: [] });
      }
      throw error;
    }

    // Get the distinct bank names for this lead from the lead_banks table
    const { data: banks } = await supabase
      .from('lead_banks')
      .select('bank_name, branch_name')
      .eq('lead_id', leadId);

    res.json({
      data: queries || [],
      banks: banks || []
    });
  } catch (error) {
    console.error('Error fetching credit queries for lead:', error);
    res.status(500).json({ error: 'Failed to fetch credit queries' });
  }
});

// POST /api/credit-queries — Create a new credit query
router.post('/', authorize('admin', 'executive'), async (req, res) => {
  try {
    const { lead_id, bank_name, query_type, remarks } = req.body;

    if (!lead_id || !bank_name) {
      return res.status(400).json({ error: 'Lead ID and bank name are required' });
    }

    const { data: newQuery, error } = await supabase
      .from('credit_queries')
      .insert({
        lead_id,
        bank_name,
        query_type: query_type || 'initial',
        remarks: remarks || null,
        status: 'pending',
        query_date: new Date().toISOString().split('T')[0]
      })
      .select()
      .single();

    if (error) {
      if (error.message && (error.message.includes('relation') || error.message.includes('does not exist'))) {
        return res.status(400).json({ error: 'Credit queries table not yet set up. Please run database migrations.' });
      }
      throw error;
    }

    res.status(201).json({ data: newQuery });
  } catch (error) {
    console.error('Error creating credit query:', error);
    res.status(500).json({ error: 'Failed to create credit query' });
  }
});

// PUT /api/credit-queries/:id — Update credit query (e.g., add response)
router.put('/:id', authorize('admin', 'executive'), async (req, res) => {
  try {
    const { id } = req.params;
    const { status, remarks, response_remarks, response_date } = req.body;

    const updateData = {
      updated_at: new Date().toISOString()
    };

    if (status) updateData.status = status;
    if (remarks !== undefined) updateData.remarks = remarks;
    if (response_remarks !== undefined) updateData.response_remarks = response_remarks;
    if (response_date) updateData.response_date = response_date;
    if (status === 'completed' || status === 'received') {
      updateData.response_date = response_date || new Date().toISOString().split('T')[0];
    }

    const { data: updated, error } = await supabase
      .from('credit_queries')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    res.json({ data: updated });
  } catch (error) {
    console.error('Error updating credit query:', error);
    res.status(500).json({ error: 'Failed to update credit query' });
  }
});

// DELETE /api/credit-queries/:id — Delete a credit query
router.delete('/:id', authorize('admin'), async (req, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from('credit_queries')
      .delete()
      .eq('id', id);

    if (error) throw error;

    res.json({ message: 'Credit query deleted successfully' });
  } catch (error) {
    console.error('Error deleting credit query:', error);
    res.status(500).json({ error: 'Failed to delete credit query' });
  }
});

export default router;
