import express from 'express';
import fs from 'fs';
import path from 'path';
import { supabase } from '../lib/supabase.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import leadBanksRouter from './leadBanks.js';
import { deriveLeadStatus, computeLeadAggregates } from '../utils/statusDerivation.js';

// Helper to record audit log for admin actions while impersonating
async function recordAuditLog(leadId, adminId, action, details, adminName) {
  try {
    await supabase
      .from('audit_logs')
      .insert({
        lead_id: leadId,
        admin_id: adminId,
        admin_name: adminName,
        action,
        details: details || null,
        created_at: new Date().toISOString()
      });
  } catch (err) {
    console.error('Failed to record audit log:', err);
  }
}

// Helper to check if request is from admin and get admin info
async function getAdminContext(req) {
  if (req.user.role !== 'admin') return null;

  const { data: adminUser } = await supabase
    .from('users')
    .select('name')
    .eq('id', req.user.id)
    .single();

  return {
    adminId: req.user.id,
    adminName: adminUser?.name || req.user.email
  };
}

const router = express.Router();

// Helper to parse remarks containing co-applicant data
const parseRemarksField = (remarksStr) => {
  if (!remarksStr) return { coapplicant: null, remarks: "" };
  try {
    const parsed = JSON.parse(remarksStr);
    if (parsed && typeof parsed === 'object' && ('coapplicant' in parsed || 'hasCoapplicant' in parsed)) {
      const coapplicant = parsed.coapplicant || {
        hasCoapplicant: parsed.hasCoapplicant || false,
        name: parsed.coapplicantName || "",
        incomeSource: parsed.coapplicantIncomeSource || "salaried"
      };
      return {
        coapplicant,
        remarks: parsed.remarks || ""
      };
    }
  } catch (e) {
    // Normal string remarks
  }
  return { coapplicant: null, remarks: remarksStr };
};

// Helper to serialize remarks containing co-applicant data
const serializeRemarksField = (coapplicant, remarks) => {
  if (!coapplicant || !coapplicant.hasCoapplicant) return remarks || "";
  return JSON.stringify({
    coapplicant,
    remarks: remarks || ""
  });
};

router.use(authenticate);


// Mount bank-wise routes as sub-router
router.use('/:leadId/banks', leadBanksRouter);

// GET all leads with search, filter and pagination
router.get('/', authorize('admin', 'executive', 'dsa'), async (req, res) => {
  try {
    let query = supabase.from('leads').select('*', { count: 'exact' });

    // Role-based filtering
    if (req.user.role !== 'admin') {
      // Match by either users table UUID (new) or executive name (legacy)
      // This covers both newly assigned leads (UUID) and previously assigned ones (name)
      const { data: userData } = await supabase
        .from('users')
        .select('name')
        .eq('id', req.user.id)
        .maybeSingle();

      if (userData?.name) {
        // Use OR filter to match both formats
        query = query.or(`assigned_to.eq.${req.user.id},assigned_to.eq.${userData.name}`);
      } else {
        query = query.eq('assigned_to', req.user.id);
      }
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

    // Resolve UUID assigned_to values to display names
    const execIds = [...new Set(leads.filter(l => l.assigned_to && l.assigned_to.length > 20).map(l => l.assigned_to))];
    let nameMap = {};
    if (execIds.length > 0) {
      const { data: users } = await supabase
        .from('users')
        .select('id, name')
        .in('id', execIds);
      if (users) {
        users.forEach(u => nameMap[u.id] = u.name);
      }
    }

    // Fetch lead_banks for all returned leads to compute derived statuses
    const leadIds = leads.map(l => l.id);
    let banksByLeadId = {};
    if (leadIds.length > 0) {
      const { data: allBanks } = await supabase
        .from('lead_banks')
        .select('*')
        .in('lead_id', leadIds);

      if (allBanks) {
        for (const bank of allBanks) {
          if (!banksByLeadId[bank.lead_id]) banksByLeadId[bank.lead_id] = [];
          banksByLeadId[bank.lead_id].push(bank);
        }
      }
    }

    // Map database fields to API response
    const mappedLeads = leads.map(lead => {
      const banks = banksByLeadId[lead.id] || [];
      let status = lead.status;
      let sanctionedAmount = lead.sanctioned_amount;
      let disbursedAmount = lead.disbursed_amount || 0;

      // Override with derived values if lead_banks records exist and executive is assigned
      if (banks.length > 0 && lead.assigned_to) {
        const bankStatuses = banks.map(b => b.status);
        const derived = deriveLeadStatus(bankStatuses);
        const agg = computeLeadAggregates(banks);
        if (derived) status = derived;
        sanctionedAmount = agg.totalSanctioned || sanctionedAmount;
        disbursedAmount = agg.totalDisbursed;
      }

      const { coapplicant, remarks: cleanRemarks } = parseRemarksField(lead.remarks);

      return {
        id: lead.id,
        customerName: lead.customer_name,
        mobile: lead.mobile,
        email: lead.email,
        loanType: lead.loan_type,
        loanStatus: lead.loan_status,
        incomeSource: lead.income_source,
        residentType: lead.resident_type,
        businessType: lead.business_type,
        expectedAmount: lead.expected_amount,
        sanctionedAmount,
        disbursedAmount,
        assignedBanks: lead.assigned_banks || [],
        status,
        assignedTo: nameMap[lead.assigned_to] || lead.assigned_to,
        department: lead.department,
        priority: lead.priority,
        followUp: lead.follow_up,
        remarks: cleanRemarks,
        hasCoapplicant: coapplicant?.hasCoapplicant || false,
        coapplicantName: coapplicant?.name || "",
        coapplicantIncomeSource: coapplicant?.incomeSource || "",
        createdAt: lead.created_at,
        bankDetails: banks.map(b => ({
          id: b.id,
          bankName: b.bank_name,
          status: b.status,
          sanctionedAmount: b.sanctioned_amount,
          disbursedAmount: b.disbursed_amount,
          sanctionLetterPath: b.sanction_letter_path,
          remarks: b.remarks
        }))
      };
    });

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
      // Also check if assigned_to matches the executive's name (legacy format)
      const { data: userData } = await supabase
        .from('users')
        .select('name')
        .eq('id', req.user.id)
        .maybeSingle();

      if (!userData?.name || lead.assigned_to !== userData.name) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    // Fetch bank-wise records for derived status
    const { data: banks } = await supabase
      .from('lead_banks')
      .select('*')
      .eq('lead_id', lead.id)
      .order('created_at', { ascending: true });

    let status = lead.status;
    let sanctionedAmount = lead.sanctioned_amount;
    let disbursedAmount = lead.disbursed_amount || 0;

    if (banks && banks.length > 0 && lead.assigned_to) {
      const bankStatuses = banks.map(b => b.status);
      const derived = deriveLeadStatus(bankStatuses);
      const agg = computeLeadAggregates(banks);
      if (derived) status = derived;
      sanctionedAmount = agg.totalSanctioned || sanctionedAmount;
      disbursedAmount = agg.totalDisbursed;
    }

    const { coapplicant, remarks: cleanRemarks } = parseRemarksField(lead.remarks);

    res.json({
      id: lead.id,
      customerName: lead.customer_name,
      mobile: lead.mobile,
      email: lead.email,
      loanType: lead.loan_type,
      loanStatus: lead.loan_status,
      incomeSource: lead.income_source,
      residentType: lead.resident_type,
      businessType: lead.business_type,
      expectedAmount: lead.expected_amount,
      sanctionedAmount,
      disbursedAmount,
      assignedBanks: lead.assigned_banks || [],
      status,
      assignedTo: lead.assigned_to,
      department: lead.department,
      priority: lead.priority,
      followUp: lead.follow_up,
      remarks: cleanRemarks,
      hasCoapplicant: coapplicant?.hasCoapplicant || false,
      coapplicantName: coapplicant?.name || "",
      coapplicantIncomeSource: coapplicant?.incomeSource || "",
      createdAt: lead.created_at,
      bankDetails: (banks || []).map(b => ({
        id: b.id,
        bankName: b.bank_name,
        status: b.status,
        sanctionedAmount: b.sanctioned_amount,
        disbursedAmount: b.disbursed_amount,
        sanctionLetterPath: b.sanction_letter_path,
        remarks: b.remarks
      }))
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
      loanStatus,
      incomeSource,
      residentType,
      expectedAmount,
      referralCode,
      assignedBanks,
      aadhaar,
      pan,
      annualIncome,
      businessType,
      remarks,
      hasCoapplicant,
      coapplicantName,
      coapplicantIncomeSource
    } = req.body;

    if (!customerName || !mobile) {
      return res.status(400).json({ error: 'Customer name and mobile are required' });
    }

    const coapplicantData = hasCoapplicant ? {
      hasCoapplicant: true,
      name: coapplicantName || "",
      incomeSource: coapplicantIncomeSource || "salaried"
    } : null;

    // Build insert object - conditionally include referral_code
    const insertData = {
      customer_name: customerName,
      mobile,
      email: email || null,
      loan_type: loanType || null,
      loan_status: loanStatus || null,
      income_source: incomeSource || null,
      resident_type: residentType || null,
      business_type: businessType || null,
      expected_amount: expectedAmount || null,
      assigned_banks: assignedBanks || [],
      status: 'New',
      assigned_to: req.user.role === 'admin' ? null : req.user.id,
      priority: 'Medium',
      remarks: serializeRemarksField(coapplicantData, remarks)
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
          loanStatus: retryLead.loan_status,
          incomeSource: retryLead.income_source,
          residentType: retryLead.resident_type,
          businessType: retryLead.business_type,
          status: retryLead.status,
          createdAt: retryLead.created_at
        });
      }
      throw error;
    }

    // Record audit log if admin is impersonating
    const adminCtx = await getAdminContext(req);
    if (adminCtx) {
      await recordAuditLog(
        newLead.id,
        adminCtx.adminId,
        'created',
        `Added by admin (${adminCtx.adminName}) - Customer: ${customerName}, Mobile: ${mobile}`,
        adminCtx.adminName
      );
    }

    res.status(201).json({
      id: newLead.id,
      customerName: newLead.customer_name,
      mobile: newLead.mobile,
      loanType: newLead.loan_type,
      loanStatus: newLead.loan_status,
      incomeSource: newLead.income_source,
      residentType: newLead.resident_type,
      businessType: newLead.business_type,
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
      .select('assigned_to, remarks')
      .eq('id', req.params.id)
      .single();

    if (!existingLead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    // Role-based access
    if (req.user.role !== 'admin' &&
        existingLead.assigned_to !== req.user.id) {
      // Also check if assigned_to matches the executive's name (legacy format)
      const { data: userData } = await supabase
        .from('users')
        .select('name')
        .eq('id', req.user.id)
        .maybeSingle();

      if (!userData?.name || existingLead.assigned_to !== userData.name) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    const { coapplicant, remarks: existingCleanRemarks } = parseRemarksField(existingLead.remarks);

    const hasCoapplicant = req.body.hasCoapplicant !== undefined ? req.body.hasCoapplicant : (coapplicant?.hasCoapplicant || false);
    const coapplicantName = req.body.coapplicantName !== undefined ? req.body.coapplicantName : (coapplicant?.name || "");
    const coapplicantIncomeSource = req.body.coapplicantIncomeSource !== undefined ? req.body.coapplicantIncomeSource : (coapplicant?.incomeSource || "salaried");
    const remarks = req.body.remarks !== undefined ? req.body.remarks : existingCleanRemarks;

    const coapplicantData = hasCoapplicant ? {
      hasCoapplicant: true,
      name: coapplicantName,
      incomeSource: coapplicantIncomeSource
    } : null;

    const updateData = {};
    const fieldMappings = {
      customerName: 'customer_name',
      mobile: 'mobile',
      email: 'email',
      loanType: 'loan_type',
      loanStatus: 'loan_status',
      incomeSource: 'income_source',
      residentType: 'resident_type',
      businessType: 'business_type',
      expectedAmount: 'expected_amount',
      sanctionedAmount: 'sanctioned_amount',
      disbursedAmount: 'disbursed_amount',
      assignedBanks: 'assigned_banks',
      status: 'status',
      assignedTo: 'assigned_to',
      department: 'department',
      priority: 'priority',
      followUp: 'follow_up'
    };

    Object.keys(fieldMappings).forEach(apiField => {
      if (req.body[apiField] !== undefined) {
        updateData[fieldMappings[apiField]] = req.body[apiField];
      }
    });

    updateData.remarks = serializeRemarksField(coapplicantData, remarks);

    const { data: updatedLead, error } = await supabase
      .from('leads')
      .update(updateData)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;

    // Record audit log if admin is impersonating
    const adminCtx = await getAdminContext(req);
    if (adminCtx) {
      const changedFields = Object.keys(updateData).filter(k => updateData[k] !== undefined).join(', ');
      await recordAuditLog(
        req.params.id,
        adminCtx.adminId,
        'modified',
        `Modified by admin (${adminCtx.adminName}) - Fields: ${changedFields}`,
        adminCtx.adminName
      );
    }

    res.json({
      id: updatedLead.id,
      customerName: updatedLead.customer_name,
      loanType: updatedLead.loan_type,
      loanStatus: updatedLead.loan_status,
      incomeSource: updatedLead.income_source,
      residentType: updatedLead.resident_type,
      businessType: updatedLead.business_type,
      expectedAmount: updatedLead.expected_amount,
      sanctionedAmount: updatedLead.sanctioned_amount,
      disbursedAmount: updatedLead.disbursed_amount,
      status: updatedLead.status
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update lead' });
  }
});

// DELETE lead - admin only
router.delete('/:id', authorize('admin'), async (req, res) => {
  try {
    // Fetch lead info BEFORE deleting to capture for audit log
    const adminCtx = await getAdminContext(req);
    let delLead = null;
    if (adminCtx) {
      const { data } = await supabase
        .from('leads')
        .select('customer_name, mobile')
        .eq('id', req.params.id)
        .single();
      delLead = data;
    }

    const { error } = await supabase
      .from('leads')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;

    // Record audit log
    if (adminCtx && delLead) {
      await recordAuditLog(
        req.params.id,
        adminCtx.adminId,
        'deleted',
        `Deleted by admin (${adminCtx.adminName}) - Customer: ${delLead.customer_name}, Mobile: ${delLead.mobile}`,
        adminCtx.adminName
      );
    }

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
      const { data: userData } = await supabase
        .from('users')
        .select('name')
        .eq('id', req.user.id)
        .maybeSingle();

      if (userData?.name) {
        query = query.or(`assigned_to.eq.${req.user.id},assigned_to.eq.${userData.name}`);
      } else {
        query = query.eq('assigned_to', req.user.id);
      }
    }

    const { data: leads, error } = await query;

    if (error) throw error;

    const stats = {
      totalLeads: leads.length,
      newLeads: leads.filter(l => l.status === 'New').length,
      assigned: leads.filter(l => l.status === 'Assigned').length,
      processing: leads.filter(l => l.status === 'Processing').length,
      sanctioned: leads.filter(l => l.status === 'Sanctioned').length,
      partiallyDisbursed: leads.filter(l => l.status === 'Partially Disbursed').length,
      disbursed: leads.filter(l => l.status === 'Disbursed').length,
      rejected: leads.filter(l => l.status === 'Rejected').length,
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
      const { data: userData } = await supabase
        .from('users')
        .select('name')
        .eq('id', req.user.id)
        .maybeSingle();

      if (userData?.name) {
        query = query.or(`assigned_to.eq.${req.user.id},assigned_to.eq.${userData.name}`);
      } else {
        query = query.eq('assigned_to', req.user.id);
      }
    }

    const { data: leads, error } = await query;

    if (error) throw error;

    const distribution = {
      'New': leads.filter(l => l.status === 'New').length,
      'Assigned': leads.filter(l => l.status === 'Assigned').length,
      'Processing': leads.filter(l => l.status === 'Processing').length,
      'Sanctioned': leads.filter(l => l.status === 'Sanctioned').length,
      'Partially Disbursed': leads.filter(l => l.status === 'Partially Disbursed').length,
      'Disbursed': leads.filter(l => l.status === 'Disbursed').length,
      'Rejected': leads.filter(l => l.status === 'Rejected').length
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
      const { data: userData } = await supabase
        .from('users')
        .select('name')
        .eq('id', req.user.id)
        .maybeSingle();

      if (userData?.name) {
        query = query.or(`assigned_to.eq.${req.user.id},assigned_to.eq.${userData.name}`);
      } else {
        query = query.eq('assigned_to', req.user.id);
      }
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

    // Look up the user's UUID from users table (NOT the executives table)
    // The assigned_to field stores users table UUID so executives can filter their leads by req.user.id
    const { data: userRecord } = await supabase
      .from('users')
      .select('id, name')
      .eq('name', assignedTo)
      .eq('role', 'executive')
      .maybeSingle();

    console.log('User record found:', userRecord);

    // Also get department from executives table if available
    let dept = department || null;
    if (!dept) {
      const { data: execRecord } = await supabase
        .from('executives')
        .select('department')
        .eq('name', assignedTo)
        .maybeSingle();
      if (execRecord) dept = execRecord.department;
    }

    // Use the user's UUID if found, otherwise fall back to the name (legacy fallback)
    const assignToValue = userRecord?.id || assignedTo;

    const { data: updatedLead, error } = await supabase
      .from('leads')
      .update({
        assigned_to: assignToValue,
        department: dept,
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

// PUT /api/leads/:id/assign-bank - Assign bank to lead
router.put('/:id/assign-bank', authorize('admin', 'executive'), async (req, res) => {
  try {
    const { bankName } = req.body;
    const leadId = req.params.id;

    if (!bankName) {
      return res.status(400).json({ error: 'Bank name is required' });
    }

    // Fetch current lead to get existing assigned_banks
    const { data: lead, error: fetchError } = await supabase
      .from('leads')
      .select('assigned_banks, status')
      .eq('id', leadId)
      .single();

    if (fetchError || !lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    // Append bank to existing array (avoid duplicates)
    const existingBanks = lead.assigned_banks || [];
    if (existingBanks.includes(bankName)) {
      return res.status(400).json({ error: 'Bank already assigned to this lead' });
    }
    const updatedBanks = [...existingBanks, bankName];

    // Update status to 'Processing' if currently 'New' or 'Assigned'
    const newStatus = (lead.status === 'New' || lead.status === 'Assigned') ? 'Processing' : lead.status;

    const { data: updatedLead, error: updateError } = await supabase
      .from('leads')
      .update({
        assigned_banks: updatedBanks,
        status: newStatus
      })
      .eq('id', leadId)
      .select()
      .single();

    if (updateError) throw updateError;

    // Also create a lead_banks record for bank-wise tracking
    const { error: bankRowError } = await supabase
      .from('lead_banks')
      .insert({
        lead_id: leadId,
        bank_name: bankName,
        status: 'Processing'
      });

    // Ignore duplicate errors (bank may already have a lead_banks row)
    if (bankRowError && bankRowError.code !== '23505') {
      console.error('Failed to create lead_banks row:', bankRowError);
    }

    res.json({
      message: 'Bank assigned successfully',
      lead: {
        id: updatedLead.id,
        assignedBanks: updatedLead.assigned_banks,
        status: updatedLead.status
      }
    });
  } catch (error) {
    console.error('Assign bank error:', error);
    res.status(500).json({ error: 'Failed to assign bank' });
  }
});

// PUT /api/leads/:id/remove-bank - Remove/delete an assigned bank from a lead
router.put('/:id/remove-bank', authorize('admin', 'executive'), async (req, res) => {
  try {
    const { bankName } = req.body;
    const leadId = req.params.id;

    if (!bankName) {
      return res.status(400).json({ error: 'Bank name is required' });
    }

    // Fetch current lead to get existing assigned_banks
    const { data: lead, error: fetchError } = await supabase
      .from('leads')
      .select('assigned_banks, status')
      .eq('id', leadId)
      .single();

    if (fetchError || !lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    // Remove bank from array
    const existingBanks = lead.assigned_banks || [];
    if (!existingBanks.includes(bankName)) {
      return res.status(400).json({ error: 'Bank not assigned to this lead' });
    }
    const updatedBanks = existingBanks.filter(b => b !== bankName);

    // Recalculate status: if no banks left, go back to 'Assigned' if previously processing
    let newStatus = lead.status;
    if (updatedBanks.length === 0 && (lead.status === 'Processing' || lead.status === 'Sanctioned' || lead.status === 'Partially Disbursed')) {
      newStatus = 'Assigned';
    }

    const { data: updatedLead, error: updateError } = await supabase
      .from('leads')
      .update({
        assigned_banks: updatedBanks,
        status: newStatus
      })
      .eq('id', leadId)
      .select()
      .single();

    if (updateError) throw updateError;

    // Also delete the lead_banks record for tracking
    const { error: bankRowError } = await supabase
      .from('lead_banks')
      .delete()
      .eq('lead_id', leadId)
      .eq('bank_name', bankName);

    if (bankRowError) {
      console.error('Failed to delete lead_banks row:', bankRowError);
    }

    res.json({
      message: 'Bank removed successfully',
      lead: {
        id: updatedLead.id,
        assignedBanks: updatedLead.assigned_banks,
        status: updatedLead.status
      }
    });
  } catch (error) {
    console.error('Remove bank error:', error);
    res.status(500).json({ error: 'Failed to remove bank' });
  }
});

// PUT /api/leads/:id/disburse - Disburse amount (partial or full)
router.put('/:id/disburse', authorize('admin', 'executive'), async (req, res) => {
  try {
    const { amount } = req.body;
    const leadId = req.params.id;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Valid disbursement amount is required' });
    }

    // Fetch current lead
    const { data: lead, error: fetchError } = await supabase
      .from('leads')
      .select('id, sanctioned_amount, disbursed_amount, status, customer_name')
      .eq('id', leadId)
      .single();

    if (fetchError || !lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    if (!lead.sanctioned_amount) {
      return res.status(400).json({ error: 'Lead has no sanctioned amount' });
    }

    const currentDisbursed = lead.disbursed_amount || 0;
    const sanctioned = lead.sanctioned_amount;
    const newTotalDisbursed = currentDisbursed + amount;

    // Cannot exceed sanctioned amount
    if (newTotalDisbursed > sanctioned) {
      return res.status(400).json({
        error: `Cannot disburse ₹${amount.toLocaleString()}. Remaining amount: ₹${(sanctioned - currentDisbursed).toLocaleString()}`
      });
    }

    // Determine new status
    const newStatus = newTotalDisbursed >= sanctioned ? 'Disbursed' : 'Partially Disbursed';

    const { data: updatedLead, error: updateError } = await supabase
      .from('leads')
      .update({
        disbursed_amount: newTotalDisbursed,
        status: newStatus
      })
      .eq('id', leadId)
      .select()
      .single();

    if (updateError) throw updateError;

    res.json({
      message: `₹${amount.toLocaleString()} disbursed successfully`,
      lead: {
        id: updatedLead.id,
        customerName: updatedLead.customer_name,
        sanctionedAmount: updatedLead.sanctioned_amount,
        disbursedAmount: updatedLead.disbursed_amount,
        status: updatedLead.status
      }
    });
  } catch (error) {
    console.error('Disburse error:', error);
    res.status(500).json({ error: 'Failed to process disbursement' });
  }
});

// Local uploads directory (same as in checklistStatus.js)
const uploadsDir = path.join(process.cwd(), 'uploads');
const summariesDir = path.join(uploadsDir, 'summaries');
if (!fs.existsSync(summariesDir)) {
  fs.mkdirSync(summariesDir, { recursive: true });
}

// GET /api/leads/:id/summary - Retrieve existing profile summary
router.get('/:id/summary', authorize('admin', 'executive', 'dsa'), async (req, res) => {
  try {
    const leadId = req.params.id;
    const fileName = `summaries/${leadId}-summary.txt`;

    if (process.env.NODE_ENV === 'production') {
      // Production: check in Supabase Storage
      try {
        const { data, error } = await supabase.storage
          .from('lead-documents')
          .download(fileName);

        if (error) {
          // If file not found or storage error, check local as fallback
          const localPath = path.join(summariesDir, `${leadId}-summary.txt`);
          if (fs.existsSync(localPath)) {
            const summary = fs.readFileSync(localPath, 'utf8');
            return res.json({ hasSummary: true, summary });
          }
          return res.json({ hasSummary: false });
        }

        if (data) {
          let summary;
          if (typeof data.text === 'function') {
            summary = await data.text();
          } else {
            summary = data.toString('utf8');
          }
          return res.json({ hasSummary: true, summary });
        }
      } catch (err) {
        console.warn('Failed to retrieve summary from Supabase storage:', err.message);
      }
    }

    // Development or fallback: read from local file
    const localPath = path.join(summariesDir, `${leadId}-summary.txt`);
    if (fs.existsSync(localPath)) {
      const summary = fs.readFileSync(localPath, 'utf8');
      return res.json({ hasSummary: true, summary });
    }

    res.json({ hasSummary: false });
  } catch (error) {
    console.error('Error fetching summary:', error);
    res.status(500).json({ error: 'Failed to fetch lead summary' });
  }
});

// POST /api/leads/:id/summarize - Generate profile summary via Gemini API
router.post('/:id/summarize', authorize('admin', 'executive', 'dsa'), async (req, res) => {
  try {
    const leadId = req.params.id;

    // 1. Fetch lead details for context
    const { data: lead, error: leadErr } = await supabase
      .from('leads')
      .select('*')
      .eq('id', leadId)
      .single();

    if (leadErr || !lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    // 2. Fetch all uploaded files for this lead
    const { data: uploads, error: uploadsErr } = await supabase
      .from('lead_checklist_status')
      .select('*')
      .eq('lead_id', leadId)
      .eq('status', 'uploaded');

    if (uploadsErr) throw uploadsErr;

    if (!uploads || uploads.length === 0) {
      return res.status(400).json({ error: 'No documents uploaded yet. Please upload at least one document first.' });
    }

    // 3. Prepare parts for Gemini Multimodal API
    const contentsParts = [];
    const documentDescriptions = [];

    for (const doc of uploads) {
      const fileName = doc.file_path;
      if (!fileName) continue;

      let fileBuffer;
      let mimeType = 'application/pdf';

      // Detect Mime Type
      const ext = path.extname(fileName).toLowerCase();
      if (ext === '.pdf') mimeType = 'application/pdf';
      else if (ext === '.png') mimeType = 'image/png';
      else if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg';
      else {
        // Skip base64 parsing for unsupported file types (like Word)
        documentDescriptions.push(`Document: "${doc.document_name}" (unsupported file type for visual rendering, listed for reference)`);
        continue;
      }

      try {
        const localPath = path.join(uploadsDir, fileName);
        if (fs.existsSync(localPath)) {
          fileBuffer = fs.readFileSync(localPath);
        } else {
          // Production: Download from Supabase Storage
          const { data, error } = await supabase.storage
            .from('lead-documents')
            .download(fileName);

          if (error) {
            console.warn(`Could not download ${fileName} from Supabase:`, error.message);
            continue;
          }

          if (data) {
            if (typeof data.arrayBuffer === 'function') {
              const arrayBuffer = await data.arrayBuffer();
              fileBuffer = Buffer.from(arrayBuffer);
            } else {
              fileBuffer = Buffer.from(data);
            }
          }
        }

        if (fileBuffer) {
          contentsParts.push({
            inlineData: {
              mimeType,
              data: fileBuffer.toString('base64')
            }
          });
          documentDescriptions.push(`Document: "${doc.document_name}" (uploaded, format: ${mimeType})`);
        }
      } catch (err) {
        console.error(`Error reading file ${fileName}:`, err);
      }
    }

    // 4. Generate user context prompt
    const promptText = `
You are an expert financial analyst, credit assessor, and underwriting agent at InstaFin Portal.
Your task is to analyze the attached documents and extract the exact details and facts from them:
- Customer Name: ${lead.customer_name}
- Mobile: ${lead.mobile || 'N/A'}
- Email: ${lead.email || 'N/A'}
- Loan Type: ${lead.loan_type || 'N/A'}
- Expected Amount: ${lead.expected_amount || 'N/A'}

Uploaded Documents Context:
${documentDescriptions.join('\n')}

INSTRUCTIONS:
1. DO NOT write any conversational fluff, long narratives, or essay-style paragraphs.
2. DO NOT write any overall underwriter summary, executive underwriting summary, credit risk score/risk profiling, or credit recommendation. The user strictly wants ONLY the raw data extracted from the documents, nothing else.
3. For each uploaded document in the list, create a distinct header starting with "## " followed by an emoji and the document title (e.g., "## 🪪 Aadhaar Card (KYC)" or "## 💳 PAN Card (KYC)" or "## 🏦 Bank Statement (Financials)" or "## 💼 Income & Business Proof").
4. Under each document header, extract and list the exact key-value facts from that document in a clean, highly structured bullet-point format using "- **Key**: Value" pairs.
5. If the document is missing or not uploaded, DO NOT include its section.

Outline of document sections to generate:

## 🪪 Aadhaar Card (KYC)
*(Include only if Aadhaar is present. Extract these exact keys as bullet points)*
- **Document Type**: Aadhaar Card
- **Full Name**: [Extracted Full Name]
- **DOB**: [Extracted Date of Birth]
- **Gender**: [Extracted Gender]
- **Aadhaar Number**: [Extracted Aadhaar Number (format: XXXX XXXX XXXX or masked)]
- **Address**: [Extracted Address]
- **Legitimacy Status**: [Matched / Spelling Mismatch / Suspicious / Valid]
- **Verification Note**: [1 sentence concise check against applicant name "${lead.customer_name}"]

## 💳 PAN Card (KYC)
*(Include only if PAN is present. Extract these exact keys as bullet points)*
- **Document Type**: PAN Card
- **Full Name**: [Extracted Full Name]
- **PAN Number**: [Extracted PAN Number (format: XXXXX1234X)]
- **DOB**: [Extracted Date of Birth]
- **Legitimacy Status**: [Matched / Valid]
- **Verification Note**: [1 sentence concise check against applicant name "${lead.customer_name}"]

## 🏦 Bank Statement (Financials)
*(Include only if Bank Statement/Passbook is present. Extract these exact keys as bullet points)*
- **Document Type**: Bank Statement
- **Bank Name**: [Extracted Bank Name]
- **Account Holder**: [Extracted Account Holder Name]
- **Statement Period**: [Extracted Date Range]
- **Average Balance**: [Extracted Average Balance Amount]
- **Total Credits**: [Extracted total credits / income deposits]
- **Total Debits**: [Extracted total debits]
- **Bounces / Penalties**: [Extracted count of bounces or "None"]
- **Legitimacy Status**: [Matched / Valid / High Consistency]
- **Verification Note**: [1 sentence concise assessment of cash flow stability]

## 💼 Income & Business Proof
*(Include only if GST, ITR, or Salary Slips are present. Extract these exact keys as bullet points)*
- **Document Type**: [e.g., GST Registration / ITR / Salary Slip]
- **Business/Company Name**: [Extracted Employer or Registered Business Name]
- **GSTIN / Registration Number**: [Extracted Registration Number if applicable]
- **Gross Monthly Income**: [Extracted Gross Income or Turnover]
- **Net Monthly Income**: [Extracted Net Income]
- **Legitimacy Status**: [Matched / Valid]
- **Verification Note**: [1 sentence summary of business activity/salaried employment proof]

CRITICAL TECHNICAL INSTRUCTION:
At the very end of your response, append a structured JSON block inside a \`\`\`json \`\`\` code block (ensure it is the ONLY JSON code block in your entire output). 
This JSON block MUST contain the following structured fields extracted from the documents:
{
  "extracted_details": {
    "full_name": "Applicant's full name as written on identity proof",
    "dob": "Date of Birth (DD/MM/YYYY) if available",
    "gender": "Male / Female / Other",
    "aadhaar_number": "Aadhaar number if present (format: XXXX XXXX XXXX or masked)",
    "pan_number": "PAN number if present (format: XXXXX1234X)",
    "address": "Full residential address as written on Aadhaar/proof",
    "gross_income": "Gross monthly income as a numeric value (e.g., 50000). Extract from Gross Monthly Income or similar fields. 0 if not found.",
    "monthly_income": "Net monthly income as a numeric value (e.g., 45000). Extract from Net Monthly Income or similar fields. 0 if not found.",
    "pf": "Provident Fund deduction amount as a numeric value (e.g., 2500). Extract from salary slip if visible. 0 if not found.",
    "income_tax": "Income Tax / TDS deduction as a numeric value (e.g., 1500). Extract from salary slip if visible. 0 if not found.",
    "profession_tax": "Profession Tax deduction as a numeric value (e.g., 200). Extract from salary slip if visible. 0 if not found.",
    "rental_income": "Proposed or existing rental income as a numeric value (e.g., 10000). Extract from bank statement or income proofs. 0 if not found."
  },
  "face_bounding_box": [ymin, xmin, ymax, xmax]
}

Note: Locate the small profile photo of the applicant on the Aadhaar card, PAN card, or standard ID proof. Return the face_bounding_box normalized coordinates from 0 to 1000 as [ymin, xmin, ymax, xmax] (e.g., [200, 150, 450, 400]). If no face/photo is found or it is not an image/PDF, return null for face_bounding_box.
`;

    contentsParts.unshift({ text: promptText });

    // 5. Call Gemini API
    // 5. Call Gemini API with retries and model fallbacks
    const apiKey = process.env.GEMINI_API_KEY;
    let summaryText = "";

    if (apiKey) {
      console.log('Querying available Gemini models...');
      let discoveredModel = null;

      try {
        const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
        const listResponse = await fetch(listUrl);
        if (listResponse.ok) {
          const listData = await listResponse.json();
          const availableModels = listData.models || [];
          
          // Try to find a model that supports generateContent and contains 'flash'
          const flashModel = availableModels.find(m => 
            m.supportedGenerationMethods?.includes('generateContent') && 
            m.name?.toLowerCase().includes('flash')
          );
          
          if (flashModel) {
            discoveredModel = flashModel.name.replace('models/', '');
            console.log(`Dynamically selected active Flash model: ${discoveredModel}`);
          } else {
            const anyModel = availableModels.find(m => 
              m.supportedGenerationMethods?.includes('generateContent')
            );
            if (anyModel) {
              discoveredModel = anyModel.name.replace('models/', '');
              console.log(`Dynamically selected active model: ${discoveredModel}`);
            }
          }
        }
      } catch (listErr) {
        console.warn('Could not query active Gemini models list:', listErr.message);
      }

      // List of candidate models to try in sequence if one experiences demand spikes/errors
      const candidateModels = [];
      if (discoveredModel) candidateModels.push(discoveredModel);
      candidateModels.push('gemini-2.5-flash', 'gemini-1.5-flash', 'gemini-1.5-pro');

      // Unique candidate list
      const uniqueModels = [...new Set(candidateModels)];

      let success = false;
      let lastErrorText = "";

      for (const model of uniqueModels) {
        if (success) break;
        console.log(`Attempting document analysis with Gemini model: ${model}`);

        // Try up to 3 times with exponential backoff for transient errors (503/429)
        const maxRetries = 3;
        for (let retry = 0; retry < maxRetries; retry++) {
          try {
            const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
            const response = await fetch(geminiUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{ parts: contentsParts }]
              })
            });

            if (response.ok) {
              const resData = await response.json();
              summaryText = resData.candidates?.[0]?.content?.parts?.[0]?.text;
              if (summaryText) {
                console.log(`Successfully completed document analysis using model: ${model}`);
                success = true;
                break;
              } else {
                throw new Error("Empty candidates response from Gemini API.");
              }
            }

            const errorText = await response.text();
            lastErrorText = `Model ${model} returned status ${response.status}: ${errorText}`;
            console.warn(`Attempt with ${model} failed (status ${response.status}). Details: ${errorText}`);

            // If it's a 503 (Service Unavailable) or 429 (Rate Limit), wait and retry
            if (response.status === 503 || response.status === 429) {
              const delay = Math.pow(2, retry) * 1500; // 1.5s, 3s, 6s
              console.log(`Spike in demand detected (status ${response.status}). Retrying in ${delay}ms...`);
              await new Promise(resolve => setTimeout(resolve, delay));
            } else {
              // Non-retryable error (e.g. 400 Bad Request, 403 Invalid API Key), try next model
              break;
            }
          } catch (err) {
            lastErrorText = err.message;
            console.error(`Error on model ${model} (attempt ${retry + 1}):`, err.message);
            const delay = Math.pow(2, retry) * 1500;
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      }

      if (!success) {
        console.error('All Gemini candidate models and retries failed. Throwing descriptive error.');
        throw new Error(`Gemini API is currently overloaded or experiencing high demand. Please try again in a few seconds. (Details: ${lastErrorText})`);
      }
    } else {
      console.warn('GEMINI_API_KEY environment variable is not set. Generating mock analysis for testing.');
      summaryText = `
## 🪪 Aadhaar Card (KYC)
- **Document Type**: Aadhaar Card
- **Full Name**: ${lead.customer_name}
- **DOB**: 15/08/1990
- **Gender**: Male
- **Aadhaar Number**: XXXX XXXX 1234
- **Address**: 123, High Street, Sector 5, Bengaluru, Karnataka - 560001
- **Legitimacy Status**: Matched
- **Verification Note**: Mock verified. Name matches the loan application perfectly.

## 💳 PAN Card (KYC)
- **Document Type**: PAN Card
- **Full Name**: ${lead.customer_name}
- **PAN Number**: ABCDE1234F
- **DOB**: 15/08/1990
- **Legitimacy Status**: Matched
- **Verification Note**: Mock verified. Legitimate PAN record assumed.

## 🏦 Bank Statement (Financials)
- **Document Type**: Bank Statement
- **Bank Name**: State Bank of India
- **Account Holder**: ${lead.customer_name}
- **Statement Period**: 01/10/2025 to 31/03/2026
- **Average Balance**: ₹45,000
- **Total Credits**: ₹3,00,000
- **Total Debits**: ₹2,80,000
- **Bounces / Penalties**: None
- **Legitimacy Status**: High Consistency
- **Verification Note**: Regular cash inflows matching standard income profile.

## 💼 Income & Business Proof
- **Document Type**: Salary Slip / Income Proof
- **Business/Company Name**: InstaFin Partners Ltd
- **GSTIN / Registration Number**: N/A (Salaried Employee)
- **Gross Monthly Income**: ₹50,000
- **Net Monthly Income**: ₹45,000
- **Legitimacy Status**: Matched
- **Verification Note**: Income source verified as ${lead.income_source || 'salaried'}.

\`\`\`json
{
  "extracted_details": {
    "full_name": "${lead.customer_name}",
    "dob": "15/08/1990",
    "gender": "Male",
    "aadhaar_number": "XXXX XXXX 1234",
    "pan_number": "ABCDE1234F",
    "address": "123, High Street, Sector 5, Bengaluru, Karnataka - 560001",
    "gross_income": 50000,
    "monthly_income": 45000,
    "pf": 2500,
    "income_tax": 1500,
    "profession_tax": 200,
    "rental_income": 0
  },
  "face_bounding_box": [220, 150, 520, 420]
}
\`\`\`
`;
    }

    // 6. Save the summary persistently
    const fileName = `summaries/${leadId}-summary.txt`;

    if (process.env.NODE_ENV === 'production') {
      try {
        const fileBuffer = Buffer.from(summaryText, 'utf8');
        const { error: uploadError } = await supabase.storage
          .from('lead-documents')
          .upload(fileName, fileBuffer, {
            contentType: 'text/plain',
            upsert: true
          });

        if (uploadError) throw uploadError;
      } catch (storageErr) {
        console.warn('Failed to upload summary to Supabase storage, saving locally:', storageErr.message);
        const localPath = path.join(summariesDir, `${leadId}-summary.txt`);
        fs.writeFileSync(localPath, summaryText, 'utf8');
      }
    } else {
      const localPath = path.join(summariesDir, `${leadId}-summary.txt`);
      fs.writeFileSync(localPath, summaryText, 'utf8');
    }

    // 7. Update lead status to 'Processing' if currently 'New' or 'Assigned'
    if (lead.status === 'New' || lead.status === 'Assigned') {
      await supabase
        .from('leads')
        .update({ status: 'Processing' })
        .eq('id', leadId);
    }

    res.json({ success: true, summary: summaryText });
  } catch (error) {
    console.error('Error generating summary:', error);
    res.status(500).json({ error: error.message || 'Failed to analyze documents' });
  }
});

export default router;