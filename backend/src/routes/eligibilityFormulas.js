import express from 'express';
import { supabase } from '../lib/supabase.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';

const router = express.Router();

router.use(authenticate);

// GET /api/eligibility-formulas — List all saved bank/loan-type formulas
// (all managing roles need read access — the Customer Login Eligibility
// Calculator looks these up)
router.get('/', authorize('admin', 'operations_head', 'executive', 'dsa'), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('bank_eligibility_formulas')
      .select('*')
      .order('bank_name', { ascending: true });

    if (error) throw error;

    res.json((data || []).map(row => ({
      id: row.id,
      bankName: row.bank_name,
      loanType: row.loan_type,
      formula: row.formula,
      rate: row.rate,
      period: row.period,
      emiNmiPercent: row.emi_nmi_percent,
      updatedAt: row.updated_at,
    })));
  } catch (error) {
    console.error('Error fetching eligibility formulas:', error);
    res.status(500).json({ error: 'Failed to fetch eligibility formulas' });
  }
});

// PUT /api/eligibility-formulas — Upsert the formula/defaults for one bank + loan type
// (admin/operations_head only)
router.put('/', authorize('admin', 'operations_head'), async (req, res) => {
  try {
    const { bankName, loanType, formula, rate, period, emiNmiPercent } = req.body || {};
    if (!bankName || !loanType) {
      return res.status(400).json({ error: 'bankName and loanType are required' });
    }

    const row = {
      bank_name: bankName,
      loan_type: loanType,
      formula: formula || null,
      rate: rate !== undefined && rate !== null && rate !== '' ? Number(rate) : null,
      period: period !== undefined && period !== null && period !== '' ? parseInt(period, 10) : null,
      emi_nmi_percent: emiNmiPercent !== undefined && emiNmiPercent !== null && emiNmiPercent !== '' ? Number(emiNmiPercent) : null,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('bank_eligibility_formulas')
      .upsert(row, { onConflict: 'bank_name,loan_type' })
      .select()
      .single();

    if (error) throw error;

    res.json({
      id: data.id,
      bankName: data.bank_name,
      loanType: data.loan_type,
      formula: data.formula,
      rate: data.rate,
      period: data.period,
      emiNmiPercent: data.emi_nmi_percent,
      updatedAt: data.updated_at,
    });
  } catch (error) {
    console.error('Error saving eligibility formula:', error);
    res.status(500).json({ error: 'Failed to save eligibility formula' });
  }
});

// DELETE /api/eligibility-formulas/:id — Remove a saved formula (admin only)
router.delete('/:id', authorize('admin'), async (req, res) => {
  try {
    const { error } = await supabase
      .from('bank_eligibility_formulas')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;

    res.json({ message: 'Eligibility formula deleted successfully' });
  } catch (error) {
    console.error('Error deleting eligibility formula:', error);
    res.status(500).json({ error: 'Failed to delete eligibility formula' });
  }
});

export default router;
