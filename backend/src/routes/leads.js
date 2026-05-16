import express from 'express';
import { supabase } from '../lib/supabase.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';

const router = express.Router();

router.use(authenticate);

// GET all leads with search, filter and pagination
router.get('/', authorize('admin', 'executive', 'dsa'), async (req, res) => {
  try {
    let query = supabase.from('leads').select('*', { count: 'exact' });

    // Role-based filtering
    if (req.user.role !== 'admin') {
      query = query.eq('assigned_to', req.user.id);
    }

    // Filter by status
    if (req.query.status) {
      query = query.eq('status', req.query.status);
    }

    // Filter by loan type
    if (req.query.loanType) {
      query = query.ilike('loan_type', `%${req.query.loanType}%`);
    }

    // Search
    if (req.query.search) {
      query = query.or(`customer_name.ilike.%${req.query.search}%,mobile.ilike.%${req.query.search}%`);
    }

    // Pagination - allow client to specify page and limit
    const page = parseInt(req.query.page) || 1;
    const limit = req.query.limit ? parseInt(req.query.limit) : null; // No default limit - return all if not specified

    // Only apply pagination if limit is explicitly provided
    if (limit) {
      const startIndex = (page - 1) * limit;
      query = query.range(startIndex, startIndex + limit - 1);
    }

    // Order by created_at desc
    query = query.order('created_at', { ascending: false });

    const { data: leads, error, count } = await query;

    if (error) throw error;

    // Map database fields to API response
    const mappedLeads = leads.map(lead => ({
      id: lead.id,
      customerName: lead.customer_name,
      mobile: lead.mobile,
      email: lead.email,
      loanType: lead.loan_type,
      expectedAmount: lead.expected_amount,
      assignedBanks: lead.assigned_banks || [],
      status: lead.status,
      assignedTo: lead.assigned_to,
      department: lead.department,
      priority: lead.priority,
      followUp: lead.follow_up,
      remarks: lead.remarks,
      createdAt: lead.created_at
    }));

    // Build response - include pagination only if limit was specified
    const response = { data: mappedLeads };
    if (limit) {
      response.pagination = {
        total: count,
        page,
        limit,
        totalPages: Math.ceil(count / limit)
      };
    } else {
      response.total = count;
    }
    res.json(response);
  } catch (error) {
    console.error('Error fetching leads:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET single lead by ID
router.get('/:id', authorize('admin', 'executive', 'dsa'), async (req, res) => {
  try {
    const { data: lead, error } = await supabase
      .from('leads')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (error || !lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    // Role-based access
    if (req.user.role !== 'admin' && lead.assigned_to !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json({
      id: lead.id,
      customerName: lead.customer_name,
      mobile: lead.mobile,
      email: lead.email,
      loanType: lead.loan_type,
      expectedAmount: lead.expected_amount,
      assignedBanks: lead.assigned_banks || [],
      status: lead.status,
      assignedTo: lead.assigned_to,
      department: lead.department,
      priority: lead.priority,
      followUp: lead.follow_up,
      remarks: lead.remarks,
      createdAt: lead.created_at
    });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET executives list
router.get('/meta/executives', authorize('admin', 'executive', 'dsa'), async (req, res) => {
  try {
    const { data: executives, error } = await supabase
      .from('executives')
      .select('*')
      .eq('active', true)
      .order('name');

    if (error) throw error;

    res.json(executives.map(ex => ({
      id: ex.id,
      name: ex.name,
      department: ex.department,
      active: ex.active
    })));
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch executives' });
  }
});

// POST create new lead
router.post('/', authorize('admin', 'executive', 'dsa'), async (req, res) => {
  try {
    const {
      customerName,
      mobile,
      email,
      loanType,
      expectedAmount,
      referralCode,
      assignedBanks,
      aadhaar,
      pan,
      annualIncome,
      businessType,
      remarks
    } = req.body;

    if (!customerName || !mobile) {
      return res.status(400).json({ error: 'Customer name and mobile are required' });
    }

    // Build insert object - conditionally include referral_code
    const insertData = {
      customer_name: customerName,
      mobile,
      email: email || null,
      loan_type: loanType || null,
      expected_amount: expectedAmount || null,
      assigned_banks: assignedBanks || [],
      status: 'New',
      assigned_to: req.user.role === 'admin' ? null : req.user.id,
      priority: 'Medium'
    };

    // Only add referral_code if it's provided (to handle missing column gracefully)
    if (referralCode) {
      insertData.referral_code = referralCode;
    }

    const { data: newLead, error } = await supabase
      .from('leads')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      // If referral_code column doesn't exist, retry without it
      if (error.code === 'PGRST204' && error.message.includes('referral_code')) {
        delete insertData.referral_code;
        const { data: retryLead, error: retryError } = await supabase
          .from('leads')
          .insert(insertData)
          .select()
          .single();
        if (retryError) throw retryError;
        return res.status(201).json({
          id: retryLead.id,
          customerName: retryLead.customer_name,
          mobile: retryLead.mobile,
          loanType: retryLead.loan_type,
          status: retryLead.status,
          createdAt: retryLead.created_at
        });
      }
      throw error;
    }

    res.status(201).json({
      id: newLead.id,
      customerName: newLead.customer_name,
      mobile: newLead.mobile,
      loanType: newLead.loan_type,
      expectedAmount: newLead.expected_amount,
      referralCode: newLead.referral_code,
      status: newLead.status,
      createdAt: newLead.created_at
    });
  } catch (error) {
    console.error('Error creating lead:', error);
    res.status(500).json({ error: 'Failed to create lead' });
  }
});

// PUT update lead
router.put('/:id', authorize('admin', 'executive', 'dsa'), async (req, res) => {
  try {
    // Check if lead exists
    const { data: existingLead } = await supabase
      .from('leads')
      .select('assigned_to, created_by')
      .eq('id', req.params.id)
      .single();

    if (!existingLead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    // Role-based access
    if (req.user.role !== 'admin' &&
        existingLead.assigned_to !== req.user.id &&
        existingLead.created_by !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const updateData = {};
    const fieldMappings = {
      customerName: 'customer_name',
      mobile: 'mobile',
      email: 'email',
      loanType: 'loan_type',
      expectedAmount: 'expected_amount',
      assignedBanks: 'assigned_banks',
      status: 'status',
      assignedTo: 'assigned_to',
      department: 'department',
      priority: 'priority',
      followUp: 'follow_up',
      remarks: 'remarks'
    };

    Object.keys(fieldMappings).forEach(apiField => {
      if (req.body[apiField] !== undefined) {
        updateData[fieldMappings[apiField]] = req.body[apiField];
      }
    });

    const { data: updatedLead, error } = await supabase
      .from('leads')
      .update(updateData)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;

    res.json({
      id: updatedLead.id,
      customerName: updatedLead.customer_name,
      status: updatedLead.status
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update lead' });
  }
});

// DELETE lead - admin only
router.delete('/:id', authorize('admin'), async (req, res) => {
  try {
    const { error } = await supabase
      .from('leads')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;

    res.json({ message: 'Lead deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete lead' });
  }
});

// GET dashboard stats
router.get('/stats/overview', authorize('admin', 'executive', 'dsa'), async (req, res) => {
  try {
    let query = supabase.from('leads').select('status');

    if (req.user.role !== 'admin') {
      query = query.eq('assigned_to', req.user.id);
    }

    const { data: leads, error } = await query;

    if (error) throw error;

    const stats = {
      totalLeads: leads.length,
      newLeads: leads.filter(l => l.status === 'New').length,
      processing: leads.filter(l => l.status === 'Processing' || l.status === 'Assigned').length,
      assigned: leads.filter(l => l.status === 'Assigned').length,
      sanctioned: leads.filter(l => l.status === 'Sanctioned').length,
      disbursed: leads.filter(l => l.status === 'Disbursed').length,
    };

    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// Status distribution for charts
router.get('/stats/status-distribution', authenticate, async (req, res) => {
  try {
    let query = supabase.from('leads').select('status');

    if (req.user.role !== 'admin') {
      query = query.eq('assigned_to', req.user.id);
    }

    const { data: leads, error } = await query;

    if (error) throw error;

    const distribution = {
      'New': leads.filter(l => l.status === 'New').length,
      'Processing': leads.filter(l => l.status === 'Processing' || l.status === 'Assigned').length,
      'Sanctioned': leads.filter(l => l.status === 'Sanctioned').length,
      'Disbursed': leads.filter(l => l.status === 'Disbursed').length
    };

    res.json(distribution);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch distribution' });
  }
});

// Loan type distribution for charts
router.get('/stats/loan-type-distribution', authenticate, async (req, res) => {
  try {
    let query = supabase.from('leads').select('loan_type');

    if (req.user.role !== 'admin') {
      query = query.eq('assigned_to', req.user.id);
    }

    const { data: leads, error } = await query;

    if (error) throw error;

    const loanTypes = {};
    leads.forEach(lead => {
      const type = lead.loan_type || 'Unknown';
      loanTypes[type] = (loanTypes[type] || 0) + 1;
    });

    res.json(loanTypes);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch loan types' });
  }
});

// PUT /api/leads/:id/assign - Assign lead to executive
router.put('/:id/assign', authorize('admin', 'executive'), async (req, res) => {
  try {
    const { assignedTo, department, priority } = req.body;
    const leadId = req.params.id;

    console.log('Assign request - leadId:', leadId, 'assignedTo:', assignedTo);

    if (!assignedTo) {
      return res.status(400).json({ error: 'Executive name is required' });
    }

    // First, find the executive by name to get their ID
    const { data: executive } = await supabase
      .from('executives')
      .select('id, name, department')
      .eq('name', assignedTo)
      .single();

    console.log('Executive found:', executive);

    if (!executive) {
      // If executive not found in DB, just store the name directly
      const { data: updatedLead, error } = await supabase
        .from('leads')
        .update({
          assigned_to: assignedTo,
          department: department || null,
          priority: priority || 'Medium',
          status: 'Assigned'
        })
        .eq('id', req.params.id)
        .select()
        .single();

      if (error) throw error;
      return res.json({ message: 'Lead assigned', lead: updatedLead });
    }

    // If executive found, use their ID
    const { data: updatedLead, error } = await supabase
      .from('leads')
      .update({
        assigned_to: executive.name,
        department: department || executive.department,
        priority: priority || 'Medium',
        status: 'Assigned'
      })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;

    res.json({ message: 'Lead assigned', lead: updatedLead });
  } catch (error) {
    console.error('Assign error:', error);
    res.status(500).json({ error: 'Failed to assign lead' });
  }
});

export default router;