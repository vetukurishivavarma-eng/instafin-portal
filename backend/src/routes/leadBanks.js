import express from 'express';
import { supabase } from '../lib/supabase.js';
import { authorize } from '../middleware/authorize.js';
import { deriveLeadStatus, computeLeadAggregates } from '../utils/statusDerivation.js';

const router = express.Router({ mergeParams: true });

/**
 * Helper: Update lead-level derived status from bank records.
 * Computes aggregate status and amounts, writes back to leads table.
 */
async function updateLeadDerivedStatus(leadId) {
  const { data: banks, error } = await supabase
    .from('lead_banks')
    .select('*')
    .eq('lead_id', leadId);

  if (error) throw error;

  const bankStatuses = banks.map(b => b.status);
  const derivedStatus = deriveLeadStatus(bankStatuses);
  const { totalSanctioned, totalDisbursed } = computeLeadAggregates(banks);

  const updateData = {};
  if (derivedStatus) updateData.status = derivedStatus;
  updateData.sanctioned_amount = totalSanctioned || null;
  updateData.disbursed_amount = totalDisbursed || 0;

  const { error: updateError } = await supabase
    .from('leads')
    .update(updateData)
    .eq('id', leadId);

  if (updateError) throw updateError;

  return { derivedStatus, totalSanctioned, totalDisbursed };
}

// GET /api/leads/:leadId/banks — List all bank records for a lead
router.get('/', authorize('admin', 'executive', 'dsa'), async (req, res) => {
  try {
    const { leadId } = req.params;

    const { data: banks, error } = await supabase
      .from('lead_banks')
      .select('*')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: true });

    if (error) throw error;

    const bankStatuses = banks.map(b => b.status);
    const derivedStatus = deriveLeadStatus(bankStatuses);
    const { totalSanctioned, totalDisbursed } = computeLeadAggregates(banks);

    res.json({
      banks,
      derivedStatus,
      totalSanctioned,
      totalDisbursed
    });
  } catch (error) {
    console.error('Get lead banks error:', error);
    res.status(500).json({ error: 'Failed to fetch bank records' });
  }
});

// POST /api/leads/:leadId/banks — Add a bank to a lead
router.post('/', authorize('admin', 'executive'), async (req, res) => {
  try {
    const { leadId } = req.params;
    const { bankName } = req.body;

    if (!bankName) {
      return res.status(400).json({ error: 'Bank name is required' });
    }

    // Check if bank already exists for this lead
    const { data: existing } = await supabase
      .from('lead_banks')
      .select('id')
      .eq('lead_id', leadId)
      .eq('bank_name', bankName)
      .single();

    if (existing) {
      return res.status(400).json({ error: 'Bank already assigned to this lead' });
    }

    // Insert lead_banks record
    const { data: newBank, error } = await supabase
      .from('lead_banks')
      .insert({
        lead_id: leadId,
        bank_name: bankName,
        status: 'Processing'
      })
      .select()
      .single();

    if (error) throw error;

    // Also sync the legacy assigned_banks array on leads table
    const { data: lead } = await supabase
      .from('leads')
      .select('assigned_banks, status, assigned_to')
      .eq('id', leadId)
      .single();

    if (lead) {
      const existingBanks = lead.assigned_banks || [];
      if (!existingBanks.includes(bankName)) {
        const updatedBanks = [...existingBanks, bankName];
        const newStatus = (lead.status === 'New' || lead.status === 'Assigned') 
          ? (lead.assigned_to ? 'Processing' : 'New') 
          : lead.status;
        await supabase
          .from('leads')
          .update({ assigned_banks: updatedBanks, status: newStatus })
          .eq('id', leadId);
      }
    }

    res.json({ message: 'Bank added', bank: newBank });
  } catch (error) {
    console.error('Add bank error:', error);
    res.status(500).json({ error: 'Failed to add bank' });
  }
});

// PUT /api/leads/:leadId/banks/:bankId/sanction — Sanction a specific bank
router.put('/:bankId/sanction', authorize('admin', 'executive'), async (req, res) => {
  try {
    const { leadId, bankId } = req.params;
    const { sanctionedAmount, sanctionLetterPath } = req.body;

    if (!sanctionedAmount || sanctionedAmount <= 0) {
      return res.status(400).json({ error: 'Valid sanctioned amount is required' });
    }

    // Fetch the bank record
    const { data: bank, error: fetchError } = await supabase
      .from('lead_banks')
      .select('*')
      .eq('id', bankId)
      .eq('lead_id', leadId)
      .single();

    if (fetchError || !bank) {
      return res.status(404).json({ error: 'Bank record not found' });
    }

    if (bank.status !== 'Processing') {
      return res.status(400).json({ error: `Cannot sanction bank in '${bank.status}' status` });
    }

    // Update bank record
    const updateData = {
      status: 'Sanctioned',
      sanctioned_amount: sanctionedAmount,
      updated_at: new Date().toISOString()
    };
    if (sanctionLetterPath) updateData.sanction_letter_path = sanctionLetterPath;

    const { data: updatedBank, error: updateError } = await supabase
      .from('lead_banks')
      .update(updateData)
      .eq('id', bankId)
      .select()
      .single();

    if (updateError) throw updateError;

    // Update lead-level derived status
    const derived = await updateLeadDerivedStatus(leadId);

    res.json({
      message: 'Bank sanctioned',
      bank: updatedBank,
      leadStatus: derived.derivedStatus
    });
  } catch (error) {
    console.error('Sanction bank error:', error);
    res.status(500).json({ error: 'Failed to sanction bank' });
  }
});

// PUT /api/leads/:leadId/banks/:bankId/reject — Reject a specific bank
router.put('/:bankId/reject', authorize('admin', 'executive'), async (req, res) => {
  try {
    const { leadId, bankId } = req.params;
    const { remarks } = req.body;

    // Fetch the bank record
    const { data: bank, error: fetchError } = await supabase
      .from('lead_banks')
      .select('*')
      .eq('id', bankId)
      .eq('lead_id', leadId)
      .single();

    if (fetchError || !bank) {
      return res.status(404).json({ error: 'Bank record not found' });
    }

    if (bank.status !== 'Processing') {
      return res.status(400).json({ error: `Cannot reject bank in '${bank.status}' status` });
    }

    // Update bank record
    const updateData = {
      status: 'Rejected',
      updated_at: new Date().toISOString()
    };
    if (remarks) updateData.remarks = remarks;

    const { data: updatedBank, error: updateError } = await supabase
      .from('lead_banks')
      .update(updateData)
      .eq('id', bankId)
      .select()
      .single();

    if (updateError) throw updateError;

    // Update lead-level derived status
    const derived = await updateLeadDerivedStatus(leadId);

    res.json({
      message: 'Bank rejected',
      bank: updatedBank,
      leadStatus: derived.derivedStatus
    });
  } catch (error) {
    console.error('Reject bank error:', error);
    res.status(500).json({ error: 'Failed to reject bank' });
  }
});

// PUT /api/leads/:leadId/banks/:bankId/disburse — Disburse from a specific bank
router.put('/:bankId/disburse', authorize('admin', 'executive'), async (req, res) => {
  try {
    const { leadId, bankId } = req.params;
    const { amount } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Valid disbursement amount is required' });
    }

    // Fetch the bank record
    const { data: bank, error: fetchError } = await supabase
      .from('lead_banks')
      .select('*')
      .eq('id', bankId)
      .eq('lead_id', leadId)
      .single();

    if (fetchError || !bank) {
      return res.status(404).json({ error: 'Bank record not found' });
    }

    if (!['Sanctioned', 'Partially Disbursed'].includes(bank.status)) {
      return res.status(400).json({ error: `Cannot disburse from bank in '${bank.status}' status` });
    }

    const currentDisbursed = Number(bank.disbursed_amount) || 0;
    const sanctioned = Number(bank.sanctioned_amount) || 0;
    const remaining = sanctioned - currentDisbursed;

    if (amount > remaining) {
      return res.status(400).json({
        error: `Cannot disburse ₹${amount.toLocaleString()}. Remaining: ₹${remaining.toLocaleString()}`
      });
    }

    const newTotalDisbursed = currentDisbursed + amount;
    const newStatus = newTotalDisbursed >= sanctioned ? 'Disbursed' : 'Partially Disbursed';

    const { data: updatedBank, error: updateError } = await supabase
      .from('lead_banks')
      .update({
        disbursed_amount: newTotalDisbursed,
        status: newStatus,
        updated_at: new Date().toISOString()
      })
      .eq('id', bankId)
      .select()
      .single();

    if (updateError) throw updateError;

    // Update lead-level derived status
    const derived = await updateLeadDerivedStatus(leadId);

    res.json({
      message: 'Bank disbursed',
      bank: updatedBank,
      leadStatus: derived.derivedStatus
    });
  } catch (error) {
    console.error('Disburse bank error:', error);
    res.status(500).json({ error: 'Failed to disburse from bank' });
  }
});

export default router;
