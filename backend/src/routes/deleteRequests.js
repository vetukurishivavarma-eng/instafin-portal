import express from 'express';
import { supabase } from '../lib/supabase.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';

const router = express.Router();

// Apply authentication to all routes
router.use(authenticate);

// GET /api/delete-requests — Admin fetches all pending requests
router.get('/', authorize('admin'), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('delete_requests')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({ data: data || [] });
  } catch (error) {
    console.error('Error fetching delete requests:', error);
    res.status(500).json({ error: 'Failed to fetch delete requests' });
  }
});

// GET /api/delete-requests/all — Admin fetches ALL requests (history)
router.get('/all', authorize('admin'), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('delete_requests')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({ data: data || [] });
  } catch (error) {
    console.error('Error fetching all delete requests:', error);
    res.status(500).json({ error: 'Failed to fetch delete requests' });
  }
});

// GET /api/delete-requests/count — Admin fetches count of pending requests
router.get('/count', authorize('admin'), async (req, res) => {
  try {
    const { count, error } = await supabase
      .from('delete_requests')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending');

    if (error) throw error;

    res.json({ count: count || 0 });
  } catch (error) {
    console.error('Error counting delete requests:', error);
    res.status(500).json({ error: 'Failed to count delete requests' });
  }
});

// POST /api/leads/:leadId/request-delete — Executive requests deletion
// Note: mounted at /api/leads, so path is /:leadId/request-delete
router.post('/:leadId/request-delete', authorize('admin', 'executive'), async (req, res) => {
  try {
    const { leadId } = req.params;
    const { reason } = req.body;

    // Get lead info
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('customer_name, assigned_to')
      .eq('id', leadId)
      .single();

    if (leadError || !lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    // Role-based access: if executive, ensure they're assigned to this lead
    if (req.user.role !== 'admin') {
      const leadAssignedTo = lead.assigned_to;
      if (leadAssignedTo !== req.user.id && leadAssignedTo !== req.user.name) {
        return res.status(403).json({ error: 'You are not assigned to this lead' });
      }
    }

    // Check if a pending request already exists for this lead
    const { data: existing } = await supabase
      .from('delete_requests')
      .select('id')
      .eq('lead_id', leadId)
      .eq('status', 'pending')
      .maybeSingle();

    if (existing) {
      return res.status(400).json({ error: 'A delete request for this lead is already pending approval' });
    }

    // Get requester name
    const { data: userData } = await supabase
      .from('users')
      .select('name')
      .eq('id', req.user.id)
      .maybeSingle();

    const requesterName = userData?.name || req.user.email || 'Unknown';

    const { data: newRequest, error: insertError } = await supabase
      .from('delete_requests')
      .insert({
        lead_id: leadId,
        requested_by: req.user.id,
        requested_by_name: requesterName,
        customer_name: lead.customer_name,
        reason: reason || null
      })
      .select()
      .single();

    if (insertError) throw insertError;

    res.status(201).json({
      message: 'Delete request submitted for admin approval',
      data: newRequest
    });
  } catch (error) {
    console.error('Error requesting lead deletion:', error);
    res.status(500).json({ error: 'Failed to request deletion' });
  }
});

// PUT /api/delete-requests/:id/approve — Admin approves and performs deletion
// Also supports admin self-approval (admin can approve their own request)
router.put('/:id/approve', authorize('admin'), async (req, res) => {
  try {
    const requestId = req.params.id;

    // Get the delete request
    const { data: deleteReq, error: fetchError } = await supabase
      .from('delete_requests')
      .select('*')
      .eq('id', requestId)
      .single();

    if (fetchError || !deleteReq) {
      return res.status(404).json({ error: 'Delete request not found' });
    }

    if (deleteReq.status !== 'pending') {
      return res.status(400).json({ error: `This request has already been ${deleteReq.status}` });
    }

    // Get admin name
    const { data: adminUser } = await supabase
      .from('users')
      .select('name')
      .eq('id', req.user.id)
      .maybeSingle();

    const adminName = adminUser?.name || req.user.email || 'Unknown';

    // Record final 'Deleted' status in status_history BEFORE deleting the lead
    // This must happen before clearing history records so the 'Deleted' entry persists
    // even though the lead will be hard-deleted (FK cascade will remove history too).
    // We record this first to ensure it gets saved before cascade cleanup.
    try {
      const { data: lastHistory } = await supabase
        .from('status_history')
        .select('new_status')
        .eq('lead_id', deleteReq.lead_id)
        .order('changed_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      await supabase
        .from('status_history')
        .insert({
          lead_id: deleteReq.lead_id,
          previous_status: lastHistory?.new_status || null,
          new_status: 'Deleted',
          changed_by: adminName,
          changed_at: new Date().toISOString(),
          notes: `Lead deleted - approved by ${adminName} - Reason: ${deleteReq.reason || 'Not provided'}`
        });
    } catch (historyErr) {
      console.warn('Failed to record deletion in status_history:', historyErr.message);
    }

    // Update the delete request as approved BEFORE deleting the lead,
    // because the lead delete may cascade and remove the delete_request row too.
    const { data: updated, error: updateError } = await supabase
      .from('delete_requests')
      .update({
        status: 'approved',
        reviewed_by: req.user.id,
        reviewed_by_name: adminName,
        reviewed_at: new Date().toISOString()
      })
      .eq('id', requestId)
      .select()
      .maybeSingle();

    if (updateError) throw updateError;

    // Delete related records (lead_banks, lead_checklist_status)
    await supabase.from('lead_banks').delete().eq('lead_id', deleteReq.lead_id);
    await supabase.from('lead_checklist_status').delete().eq('lead_id', deleteReq.lead_id);

    // Hard delete the lead (this will cascade-delete status_history)
    const { error: deleteError } = await supabase
      .from('leads')
      .delete()
      .eq('id', deleteReq.lead_id);

    if (deleteError) throw deleteError;

    // Record audit log
    try {
      await supabase
        .from('audit_logs')
        .insert({
          lead_id: deleteReq.lead_id,
          admin_id: req.user.id,
          admin_name: adminName,
          action: 'deleted',
          details: `Deleted by admin (${adminName}) - approved request by ${deleteReq.requested_by_name} - Customer: ${deleteReq.customer_name} - Reason: ${deleteReq.reason || 'Not provided'}`,
          created_at: new Date().toISOString()
        });
    } catch (auditErr) {
      console.error('Failed to record audit log:', auditErr);
    }

    res.json({
      message: 'Lead deleted successfully',
      data: updated
    });
  } catch (error) {
    console.error('Error approving delete request:', error);
    res.status(500).json({ error: 'Failed to approve delete request' });
  }
});

// PUT /api/delete-requests/:id/reject — Admin rejects the deletion request
router.put('/:id/reject', authorize('admin'), async (req, res) => {
  try {
    const requestId = req.params.id;
    const { reason } = req.body;

    // Get the delete request
    const { data: deleteReq, error: fetchError } = await supabase
      .from('delete_requests')
      .select('*')
      .eq('id', requestId)
      .single();

    if (fetchError || !deleteReq) {
      return res.status(404).json({ error: 'Delete request not found' });
    }

    if (deleteReq.status !== 'pending') {
      return res.status(400).json({ error: `This request has already been ${deleteReq.status}` });
    }

    // Get admin name
    const { data: adminUser } = await supabase
      .from('users')
      .select('name')
      .eq('id', req.user.id)
      .maybeSingle();

    const adminName = adminUser?.name || req.user.email || 'Unknown';

    // Update the delete request as rejected
    const { data: updated, error: updateError } = await supabase
      .from('delete_requests')
      .update({
        status: 'rejected',
        reviewed_by: req.user.id,
        reviewed_by_name: adminName,
        reviewed_at: new Date().toISOString()
      })
      .eq('id', requestId)
      .select()
      .single();

    if (updateError) throw updateError;

    res.json({
      message: 'Delete request rejected',
      data: updated
    });
  } catch (error) {
    console.error('Error rejecting delete request:', error);
    res.status(500).json({ error: 'Failed to reject delete request' });
  }
});

// POST /api/delete-requests/:id/self-approve — Admin requests + approves in one step (self-approval)
router.post('/:id/self-approve', authorize('admin'), async (req, res) => {
  try {
    const requestId = req.params.id;

    // Get the delete request
    const { data: deleteReq, error: fetchError } = await supabase
      .from('delete_requests')
      .select('*')
      .eq('id', requestId)
      .single();

    if (fetchError || !deleteReq) {
      return res.status(404).json({ error: 'Delete request not found' });
    }

    if (deleteReq.status !== 'pending') {
      return res.status(400).json({ error: `This request has already been ${deleteReq.status}` });
    }

    // Get admin name
    const { data: adminUser } = await supabase
      .from('users')
      .select('name')
      .eq('id', req.user.id)
      .maybeSingle();

    const adminName = adminUser?.name || req.user.email || 'Unknown';

    // Record final 'Deleted' status before cleanup
    try {
      const { data: lastHistory } = await supabase
        .from('status_history')
        .select('new_status')
        .eq('lead_id', deleteReq.lead_id)
        .order('changed_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      await supabase
        .from('status_history')
        .insert({
          lead_id: deleteReq.lead_id,
          previous_status: lastHistory?.new_status || null,
          new_status: 'Deleted',
          changed_by: adminName,
          changed_at: new Date().toISOString(),
          notes: `Self-approved deletion by admin (${adminName}) - Reason: ${deleteReq.reason || 'Not provided'}`
        });
    } catch (historyErr) {
      console.warn('Failed to record deletion status:', historyErr.message);
    }

    // Update the delete request as approved BEFORE deleting the lead
    const { data: updated, error: updateError } = await supabase
      .from('delete_requests')
      .update({
        status: 'approved',
        reviewed_by: req.user.id,
        reviewed_by_name: adminName,
        reviewed_at: new Date().toISOString()
      })
      .eq('id', requestId)
      .select()
      .maybeSingle();

    if (updateError) throw updateError;

    // Delete related records
    await supabase.from('lead_banks').delete().eq('lead_id', deleteReq.lead_id);
    await supabase.from('lead_checklist_status').delete().eq('lead_id', deleteReq.lead_id);

    // Hard delete the lead
    const { error: deleteError } = await supabase
      .from('leads')
      .delete()
      .eq('id', deleteReq.lead_id);

    if (deleteError) throw deleteError;

    // Record audit log
    try {
      await supabase
        .from('audit_logs')
        .insert({
          lead_id: deleteReq.lead_id,
          admin_id: req.user.id,
          admin_name: adminName,
          action: 'deleted',
          details: `Self-approved deletion by admin (${adminName}) - Customer: ${deleteReq.customer_name} - Reason: ${deleteReq.reason || 'Not provided'}`,
          created_at: new Date().toISOString()
        });
    } catch (auditErr) {
      console.error('Failed to record audit log:', auditErr);
    }

    res.json({
      message: 'Lead deleted successfully (self-approved)',
      data: updated
    });
  } catch (error) {
    console.error('Error self-approving delete request:', error);
    res.status(500).json({ error: 'Failed to self-approve delete request' });
  }
});

export default router;
