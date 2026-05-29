import express from 'express';
import { supabase } from '../lib/supabase.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';

const router = express.Router();

router.use(authenticate);

// POST /api/audit-logs — Create an audit log entry
router.post('/', authorize('admin'), async (req, res) => {
  try {
    const { leadId, action, details } = req.body;

    if (!leadId || !action) {
      return res.status(400).json({ error: 'leadId and action are required' });
    }

    // Get admin name from users table
    const { data: adminUser } = await supabase
      .from('users')
      .select('name')
      .eq('id', req.user.id)
      .single();

    const adminName = adminUser?.name || req.user.email;

    const { data: log, error } = await supabase
      .from('audit_logs')
      .insert({
        lead_id: leadId,
        admin_id: req.user.id,
        admin_name: adminName,
        action,
        details: details || null,
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;

    res.status(201).json(log);
  } catch (error) {
    console.error('Error creating audit log:', error);
    res.status(500).json({ error: 'Failed to create audit log' });
  }
});

// GET /api/audit-logs/:leadId — Get audit logs for a lead
router.get('/:leadId', authorize('admin', 'executive'), async (req, res) => {
  try {
    const { leadId } = req.params;

    const { data: logs, error } = await supabase
      .from('audit_logs')
      .select('*')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json(logs || []);
  } catch (error) {
    console.error('Error fetching audit logs:', error);
    res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
});

// GET /api/audit-logs — Get all audit logs (admin only)
router.get('/', authorize('admin'), async (req, res) => {
  try {
    const { leadId, limit = 50 } = req.query;

    let query = supabase
      .from('audit_logs')
      .select('*, leads:lead_id(customer_name, mobile)')
      .order('created_at', { ascending: false })
      .limit(parseInt(limit));

    if (leadId) {
      query = query.eq('lead_id', leadId);
    }

    const { data: logs, error } = await query;

    if (error) throw error;

    res.json(logs || []);
  } catch (error) {
    console.error('Error fetching audit logs:', error);
    res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
});

export default router;
