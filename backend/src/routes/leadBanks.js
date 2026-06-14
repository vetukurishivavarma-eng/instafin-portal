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

// POST /api/leads/:leadId/banks — Add a bank to a lead (with branch name)
router.post('/', authorize('admin', 'executive'), async (req, res) => {
  try {
    const { leadId } = req.params;
    const { bankName, branchName } = req.body;

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

    // Insert lead_banks record (with branch name)
    const { data: newBank, error } = await supabase
      .from('lead_banks')
      .insert({
        lead_id: leadId,
        bank_name: bankName,
        branch_name: branchName || null,
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

// PUT /api/leads/:leadId/banks/:bankId/disburse — Disburse from a specific bank (records individual transaction)
router.put('/:bankId/disburse', authorize('admin', 'executive'), async (req, res) => {
  try {
    const { leadId, bankId } = req.params;
    const { amount, notes } = req.body;

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

    // Update the bank record
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

    // Record the individual disbursement transaction
    const { data: disbursementRecord, error: disbursementError } = await supabase
      .from('disbursements')
      .insert({
        lead_id: leadId,
        bank_id: bankId,
        amount,
        disbursed_by: req.user.id,
        notes: notes || null
      })
      .select()
      .single();

    if (disbursementError) {
      console.error('Failed to record disbursement transaction:', disbursementError);
      // Non-fatal — the bank was still disbursed
    }

    // Update lead-level derived status
    const derived = await updateLeadDerivedStatus(leadId);

    res.json({
      message: 'Bank disbursed',
      bank: updatedBank,
      leadStatus: derived.derivedStatus,
      disbursement: disbursementRecord || null
    });
  } catch (error) {
    console.error('Disburse bank error:', error);
    res.status(500).json({ error: 'Failed to disburse from bank' });
  }
});

// GET /api/leads/:leadId/banks/:bankId/disbursements — Fetch disbursement history for a bank
router.get('/:bankId/disbursements', authorize('admin', 'executive'), async (req, res) => {
  try {
    const { leadId, bankId } = req.params;

    const { data: disbursements, error } = await supabase
      .from('disbursements')
      .select('*')
      .eq('bank_id', bankId)
      .eq('lead_id', leadId)
      .order('disbursed_at', { ascending: false });

    if (error) throw error;

    // Fetch disburser names
    const userIds = [...new Set(disbursements.filter(d => d.disbursed_by).map(d => d.disbursed_by))];
    let userNameMap = {};
    if (userIds.length > 0) {
      const { data: users } = await supabase
        .from('users')
        .select('id, name')
        .in('id', userIds);
      if (users) {
        users.forEach(u => userNameMap[u.id] = u.name);
      }
    }

    const enriched = disbursements.map(d => ({
      ...d,
      disbursedByName: userNameMap[d.disbursed_by] || 'Unknown'
    }));

    res.json({ disbursements: enriched });
  } catch (error) {
    console.error('Fetch disbursements error:', error);
    res.status(500).json({ error: 'Failed to fetch disbursements' });
  }
});

// PUT /api/leads/:leadId/banks/:bankId/disbursements/:disbursementId — Edit a disbursement record
router.put('/:bankId/disbursements/:disbursementId', authorize('admin', 'executive'), async (req, res) => {
  try {
    const { leadId, bankId, disbursementId } = req.params;
    const { amount, notes } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Valid amount is required' });
    }

    // Fetch the disbursement record
    const { data: existingDisbursement, error: fetchError } = await supabase
      .from('disbursements')
      .select('*')
      .eq('id', disbursementId)
      .eq('bank_id', bankId)
      .eq('lead_id', leadId)
      .single();

    if (fetchError || !existingDisbursement) {
      return res.status(404).json({ error: 'Disbursement record not found' });
    }

    // Update the disbursement record
    const { data: updatedDisbursement, error: updateError } = await supabase
      .from('disbursements')
      .update({
        amount,
        notes: notes !== undefined ? notes : existingDisbursement.notes,
        updated_at: new Date().toISOString()
      })
      .eq('id', disbursementId)
      .select()
      .single();

    if (updateError) throw updateError;

    // Recalculate bank's total disbursed amount from all disbursement records
    const { data: allDisbursements } = await supabase
      .from('disbursements')
      .select('amount')
      .eq('bank_id', bankId);

    const totalDisbursed = (allDisbursements || []).reduce((sum, d) => sum + Number(d.amount), 0);

    // Fetch the bank record to get sanctioned amount
    const { data: bank } = await supabase
      .from('lead_banks')
      .select('sanctioned_amount')
      .eq('id', bankId)
      .single();

    const sanctioned = Number(bank?.sanctioned_amount) || 0;
    const newStatus = totalDisbursed >= sanctioned ? 'Disbursed' : 'Partially Disbursed';

    // Update the bank record with recalculated total and status
    await supabase
      .from('lead_banks')
      .update({
        disbursed_amount: totalDisbursed,
        status: newStatus,
        updated_at: new Date().toISOString()
      })
      .eq('id', bankId);

    // Update lead-level derived status
    const derived = await updateLeadDerivedStatus(leadId);

    res.json({
      message: 'Disbursement updated',
      disbursement: updatedDisbursement,
      bankStatus: newStatus,
      totalDisbursed,
      leadStatus: derived.derivedStatus
    });
  } catch (error) {
    console.error('Edit disbursement error:', error);
    res.status(500).json({ error: 'Failed to update disbursement' });
  }
});

export default router;
