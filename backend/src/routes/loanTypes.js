import express from 'express';
import { supabase } from '../lib/supabase.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';

const router = express.Router();

router.use(authenticate);

// GET /api/loan-types — List all loan types
router.get('/', authorize('admin', 'executive', 'dsa'), async (req, res) => {
  try {
    const { data: loanTypes, error } = await supabase
      .from('loan_types')
      .select('*')
      .order('name', { ascending: true });

    if (error) throw error;

    res.json(loanTypes || []);
  } catch (error) {
    console.error('Error fetching loan types:', error);
    res.status(500).json({ error: 'Failed to fetch loan types' });
  }
});

// POST /api/loan-types — Create a new loan type (admin only)
router.post('/', authorize('admin'), async (req, res) => {
  try {
    const { name, key, description } = req.body;

    if (!name || !key) {
      return res.status(400).json({ error: 'Name and key are required' });
    }

    // Check if key already exists
    const { data: existing } = await supabase
      .from('loan_types')
      .select('id')
      .eq('key', key)
      .maybeSingle();

    if (existing) {
      return res.status(400).json({ error: 'A loan type with this key already exists' });
    }

    const { data: newLoanType, error } = await supabase
      .from('loan_types')
      .insert({ name, key, description: description || '', active: true })
      .select()
      .single();

    if (error) throw error;

    res.status(201).json(newLoanType);
  } catch (error) {
    console.error('Error creating loan type:', error);
    res.status(500).json({ error: 'Failed to create loan type' });
  }
});

// PUT /api/loan-types/:id — Update a loan type (admin only)
router.put('/:id', authorize('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, key, description, active } = req.body;

    if (!name && !key && description === undefined && active === undefined) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (key !== undefined) updateData.key = key;
    if (description !== undefined) updateData.description = description;
    if (active !== undefined) updateData.active = active;

    const { data: updated, error } = await supabase
      .from('loan_types')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    res.json(updated);
  } catch (error) {
    console.error('Error updating loan type:', error);
    res.status(500).json({ error: 'Failed to update loan type' });
  }
});

// DELETE /api/loan-types/:id — Delete a loan type (admin only)
router.delete('/:id', authorize('admin'), async (req, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from('loan_types')
      .delete()
      .eq('id', id);

    if (error) throw error;

    res.json({ message: 'Loan type deleted successfully' });
  } catch (error) {
    console.error('Error deleting loan type:', error);
    res.status(500).json({ error: 'Failed to delete loan type' });
  }
});

export default router;
