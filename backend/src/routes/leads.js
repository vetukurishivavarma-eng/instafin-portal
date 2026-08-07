import express from 'express';
import fs from 'fs';
import path from 'path';
import { supabase } from '../lib/supabase.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import leadBanksRouter from './leadBanks.js';
import { deriveLeadStatus, computeLeadAggregates } from '../utils/statusDerivation.js';
import {
  analyzeLeadDocuments,
  extractDetailsFromSummary,
  getSectionFromDocumentId,
  SECTION_LABELS,
} from '../services/gemini.js';
import { fillPdfForm } from '../services/formFiller.js';
import { loadFormPdf, loadStoredFile } from '../services/formStorage.js';

// Helper to record status change in status_history
async function recordStatusChange(leadId, previousStatus, newStatus, changedBy, notes) {
  try {
    await supabase
      .from('status_history')
      .insert({
        lead_id: leadId,
        previous_status: previousStatus,
        new_status: newStatus,
        changed_by: changedBy || 'system',
        changed_at: new Date().toISOString(),
        notes: notes || null
      });
  } catch (err) {
    // Table may not exist yet - silently fail
    if (!err.message || (!err.message.includes('relation') && !err.message.includes('does not exist'))) {
      console.error('Failed to record status history:', err);
    }
  }
}

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

// Helper: verify the requesting user may access this lead (mirrors PUT /:id ownership checks)
async function assertLeadAccess(lead, req) {
  if (isFullAccessRole(req.user.role)) return true;
  if (lead.assigned_to === req.user.id) return true;
  // Legacy format: assigned_to may store the executive's name
  const { data: userData } = await supabase
    .from('users')
    .select('name')
    .eq('id', req.user.id)
    .maybeSingle();
  return !!userData?.name && lead.assigned_to === userData.name;
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

// Helper: roles that have full lead visibility/management (but NOT deletion)
const isFullAccessRole = (role) => role === 'admin' || role === 'operations_head';

// Helper to parse remarks containing co-applicant data (supports both single and array)
const parseRemarksField = (remarksStr) => {
  if (!remarksStr) return { coapplicants: [], remarks: "" };
  try {
    const parsed = JSON.parse(remarksStr);
    if (parsed && typeof parsed === 'object') {
      // New format: coapplicants array
      if (parsed.coapplicants && Array.isArray(parsed.coapplicants)) {
        return {
          coapplicants: parsed.coapplicants,
          remarks: parsed.remarks || ""
        };
      }
      // Legacy format: single coapplicant
      if ('coapplicant' in parsed || 'hasCoapplicant' in parsed) {
        const oldCo = parsed.coapplicant || {};
        const coapplicants = [{
          name: oldCo.name || parsed.coapplicantName || "",
          incomeSource: oldCo.incomeSource || parsed.coapplicantIncomeSource || "salaried"
        }];
        return {
          coapplicants,
          remarks: parsed.remarks || ""
        };
      }
    }
  } catch (e) {
    // Normal string remarks
  }
  return { coapplicants: [], remarks: remarksStr };
};

// Helper to serialize remarks containing co-applicant data
const serializeRemarksField = (coapplicants, remarks) => {
  if (!coapplicants || !Array.isArray(coapplicants) || coapplicants.length === 0) return remarks || "";
  return JSON.stringify({
    coapplicants,
    remarks: remarks || ""
  });
};

router.use(authenticate);


// Mount bank-wise routes as sub-router
router.use('/:leadId/banks', leadBanksRouter);

// GET all leads with search, filter and pagination
router.get('/', authorize('admin', 'operations_head', 'executive', 'dsa'), async (req, res) => {
  try {
    let query = supabase.from('leads').select('*', { count: 'exact' });

    // Role-based filtering
    if (!isFullAccessRole(req.user.role)) {
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

    // Build filter state for retry logic
    const filters = {
      status: req.query.status,
      loanType: req.query.loanType,
      search: req.query.search,
      page: parseInt(req.query.page) || 1,
      limit: req.query.limit ? parseInt(req.query.limit) : null,
      showInactive: req.query.show_inactive === 'true'
    };

    // Async function to build and execute a query with (or without) the is_active filter
    const executeLeadsQuery = async (skipActiveFilter) => {
      let q = supabase.from('leads').select('*', { count: 'exact' });

      // Role-based filtering
      if (!isFullAccessRole(req.user.role)) {
        const { data: userData } = await supabase
          .from('users')
          .select('name')
          .eq('id', req.user.id)
          .maybeSingle();

        if (userData?.name) {
          q = q.or(`assigned_to.eq.${req.user.id},assigned_to.eq.${userData.name}`);
        } else {
          q = q.eq('assigned_to', req.user.id);
        }
      }

      // No active filter — ALL leads (active + inactive) are returned.
      // Inactive leads are shown with an 'Inactive' badge on the frontend.
      // The toggle-active endpoint just flips is_active, it doesn't hide them.

      // Filter by status
      if (filters.status) {
        q = q.eq('status', filters.status);
      }

      // Filter by loan type
      if (filters.loanType) {
        q = q.ilike('loan_type', `%${filters.loanType}%`);
      }

      // Search
      if (filters.search) {
        q = q.or(`customer_name.ilike.%${filters.search}%,mobile.ilike.%${filters.search}%`);
      }

      // Pagination
      if (filters.limit) {
        const startIndex = (filters.page - 1) * filters.limit;
        q = q.range(startIndex, startIndex + filters.limit - 1);
      }

      // Order by created_at desc
      q = q.order('created_at', { ascending: false });

      return await q;
    };

    // Execute query — retry without is_active filter if column doesn't exist
    // Supabase returns errors in the response (not as thrown exceptions), so we must check both paths
    let queryResult;
    let queryError;
    try {
      queryResult = await executeLeadsQuery(false);
      queryError = queryResult.error;
    } catch (filterErr) {
      queryError = filterErr;
    }

    // If error is about missing is_active column, retry without referencing it
    if (queryError && queryError.message &&
        (queryError.message.includes('is_active') || queryError.message.includes('column') || queryError.message.includes('does not exist'))) {
      console.warn('is_active column not found, retrying query without filter:', queryError.message);
      try {
        queryResult = await executeLeadsQuery(true);
        queryError = queryResult.error;
      } catch (retryErr) {
        queryError = retryErr;
      }
    }

    if (queryError) throw queryError;
    const { data: leads, error, count } = queryResult;

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

      const { coapplicants, remarks: cleanRemarks } = parseRemarksField(lead.remarks);

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
        coapplicants,
        hasCoapplicant: coapplicants.length > 0,
        coapplicantName: coapplicants[0]?.name || "",
        coapplicantIncomeSource: coapplicants[0]?.incomeSource || "",
        createdAt: lead.created_at,
        // Rejected is its own separate status — not part of active OR inactive
        isActive: lead.is_active !== false,
        bankDetails: banks.map(b => ({
          id: b.id,
          bankName: b.bank_name,
          branchName: b.branch_name,
          status: b.status,
          sanctionedAmount: b.sanctioned_amount,
          disbursedAmount: b.disbursed_amount,
          sanctionLetterPath: b.sanction_letter_path,
          remarks: b.remarks
        })),
        entryDate: lead.entry_date,
        isClosed: lead.is_closed === true,
        closedAt: lead.closed_at,
        revenue: lead.revenue,
        applicationForm: lead.application_form
      };
    });

    // Build response - include pagination only if limit was specified
    const response = { data: mappedLeads };
    if (filters.limit) {
      response.pagination = {
        total: count,
        page: filters.page,
        limit: filters.limit,
        totalPages: Math.ceil(count / filters.limit)
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
router.get('/:id', authorize('admin', 'operations_head', 'executive', 'dsa'), async (req, res) => {
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
    if (!isFullAccessRole(req.user.role) && lead.assigned_to !== req.user.id) {
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

    const { coapplicants, remarks: cleanRemarks } = parseRemarksField(lead.remarks);

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
      coapplicants,
      hasCoapplicant: coapplicants.length > 0,
      coapplicantName: coapplicants[0]?.name || "",
      coapplicantIncomeSource: coapplicants[0]?.incomeSource || "",
      createdAt: lead.created_at,
      entryDate: lead.entry_date,
      isClosed: lead.is_closed === true,
      closedAt: lead.closed_at,
      revenue: lead.revenue,
      applicationForm: lead.application_form,
      bankDetails: (banks || []).map(b => ({
        id: b.id,
        bankName: b.bank_name,
        branchName: b.branch_name,
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
router.get('/meta/executives', authorize('admin', 'operations_head', 'executive', 'dsa'), async (req, res) => {
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
router.post('/', authorize('admin', 'operations_head', 'executive', 'dsa'), async (req, res) => {
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
      coapplicantIncomeSource,
      coapplicants,
      impersonatedExecutive
    } = req.body;

    if (!customerName || !mobile) {
      return res.status(400).json({ error: 'Customer name and mobile are required' });
    }

    let finalCoapplicants = coapplicants;
    if (!finalCoapplicants && hasCoapplicant) {
      finalCoapplicants = [{
        name: coapplicantName || "",
        incomeSource: coapplicantIncomeSource || "salaried"
      }];
    } else if (!finalCoapplicants) {
      finalCoapplicants = [];
    }

    // When admin is impersonating an executive, look up the executive's user ID
    let assignedTo = null;
    if (req.user.role === 'admin' && impersonatedExecutive) {
      const { data: execUser } = await supabase
        .from('users')
        .select('id')
        .eq('name', impersonatedExecutive)
        .eq('role', 'executive')
        .maybeSingle();
      if (execUser) {
        assignedTo = execUser.id;
      }
    } else if (!isFullAccessRole(req.user.role)) {
      assignedTo = req.user.id;
    }

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
      status: assignedTo ? 'Assigned' : 'New',
      assigned_to: assignedTo,
      priority: 'Medium',
      remarks: serializeRemarksField(finalCoapplicants, remarks)
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

    // Record initial status in status_history
    await recordStatusChange(
      newLead.id,
      null,
      newLead.status,
      req.user?.name || req.user?.email || 'system',
      'Lead created'
    );

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
router.put('/:id', authorize('admin', 'operations_head', 'executive', 'dsa'), async (req, res) => {
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
    if (!isFullAccessRole(req.user.role) &&
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

    const { coapplicants: existingCoapplicants, remarks: existingCleanRemarks } = parseRemarksField(existingLead.remarks);

    // Handle coapplicants array from request body, or fall back to legacy single coapplicant fields
    let coapplicants = null;
    if (req.body.coapplicants !== undefined) {
      coapplicants = req.body.coapplicants;
    } else if (req.body.hasCoapplicant !== undefined) {
      const hasCoapplicant = req.body.hasCoapplicant;
      const coapplicantName = req.body.coapplicantName !== undefined ? req.body.coapplicantName : (existingCoapplicants[0]?.name || "");
      const coapplicantIncomeSource = req.body.coapplicantIncomeSource !== undefined ? req.body.coapplicantIncomeSource : (existingCoapplicants[0]?.incomeSource || "salaried");
      coapplicants = hasCoapplicant ? [{ name: coapplicantName, incomeSource: coapplicantIncomeSource }] : [];
    } else {
      coapplicants = existingCoapplicants;
    }

    const remarks = req.body.remarks !== undefined ? req.body.remarks : existingCleanRemarks;

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
      followUp: 'follow_up',
      referralCode: 'referral_code'
    };

    Object.keys(fieldMappings).forEach(apiField => {
      if (req.body[apiField] !== undefined) {
        updateData[fieldMappings[apiField]] = req.body[apiField];
      }
    });

    updateData.remarks = serializeRemarksField(coapplicants, remarks);

    const { data: updatedLead, error } = await supabase
      .from('leads')
      .update(updateData)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;

    // Record status change in status_history if status changed
    if (updateData.status && existingLead.status !== updateData.status) {
      await recordStatusChange(
        req.params.id,
        existingLead.status,
        updateData.status,
        req.user?.name || req.user?.email || 'system',
        `Status changed via lead update`
      );
    }

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

// PUT /api/leads/:id/revenue - Set manual revenue for a lead (admin only)
router.put('/:id/revenue', authorize('admin'), async (req, res) => {
  try {
    const { revenue } = req.body;
    if (revenue === undefined || revenue === null || isNaN(Number(revenue))) {
      return res.status(400).json({ error: 'Valid revenue amount is required' });
    }

    const { data: existingLead } = await supabase
      .from('leads')
      .select('id, customer_name')
      .eq('id', req.params.id)
      .single();

    if (!existingLead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    const { data: updatedLead, error } = await supabase
      .from('leads')
      .update({ revenue: Number(revenue) })
      .eq('id', req.params.id)
      .select('id, revenue')
      .single();

    if (error) throw error;

    // Audit log
    const adminCtx = await getAdminContext(req);
    if (adminCtx) {
      await recordAuditLog(
        req.params.id,
        adminCtx.adminId,
        'revenue_updated',
        `Revenue set to ${revenue} by ${adminCtx.adminName}`,
        adminCtx.adminName
      );
    }

    res.json({ success: true, id: updatedLead.id, revenue: updatedLead.revenue });
  } catch (error) {
    console.error('Error updating revenue:', error);
    res.status(500).json({ error: 'Failed to update revenue' });
  }
});

// PUT /api/leads/:id/application-form - Save the LLM-filled application form (all managing roles)
router.put('/:id/application-form', authorize('admin', 'operations_head', 'executive', 'dsa'), async (req, res) => {
  try {
    const { applicationForm } = req.body;
    if (!applicationForm || typeof applicationForm !== 'object') {
      return res.status(400).json({ error: 'applicationForm object is required' });
    }

    const { data: existingLead } = await supabase
      .from('leads')
      .select('id')
      .eq('id', req.params.id)
      .single();

    if (!existingLead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    const { data: updatedLead, error } = await supabase
      .from('leads')
      .update({ application_form: applicationForm })
      .eq('id', req.params.id)
      .select('id, application_form')
      .single();

    if (error) throw error;

    res.json({ success: true, id: updatedLead.id, applicationForm: updatedLead.application_form });
  } catch (error) {
    console.error('Error saving application form:', error);
    res.status(500).json({ error: 'Failed to save application form' });
  }
});

// DELETE lead - admin only (hard delete)
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

// PUT /api/leads/:id/close - Close a lead (only for Disbursed leads)
router.put('/:id/close', authorize('admin', 'operations_head', 'executive'), async (req, res) => {
  try {
    const leadId = req.params.id;

    // Get current lead
    const { data: lead, error: fetchError } = await supabase
      .from('leads')
      .select('status, customer_name, is_closed')
      .eq('id', leadId)
      .single();

    if (fetchError || !lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    if (lead.is_closed) {
      return res.status(400).json({ error: 'Lead is already closed' });
    }

    if (lead.status !== 'Disbursed') {
      return res.status(400).json({ error: 'Only leads with Disbursed status can be closed' });
    }

    const closedAt = new Date().toISOString();

    const { data: updatedLead, error: updateError } = await supabase
      .from('leads')
      .update({
        is_closed: true,
        closed_at: closedAt,
        status: 'Closed'
      })
      .eq('id', leadId)
      .select()
      .single();

    if (updateError) throw updateError;

    // Record status history
    await recordStatusChange(leadId, lead.status, 'Closed', req.user?.name || req.user?.email, 'Lead closed after disbursement');

    res.json({
      message: 'Lead closed successfully',
      lead: {
        id: updatedLead.id,
        customerName: updatedLead.customer_name,
        isClosed: updatedLead.is_closed,
        closedAt: updatedLead.closed_at,
        status: updatedLead.status
      }
    });
  } catch (error) {
    console.error('Close lead error:', error);
    res.status(500).json({ error: 'Failed to close lead' });
  }
});

// PUT /api/leads/:id/toggle-active - Toggle lead active/inactive status (soft-delete/restore)
router.put('/:id/toggle-active', authorize('admin'), async (req, res) => {
  try {
    const leadId = req.params.id;

    // Get current lead — also fetch assigned_to and assigned_banks for status derivation on restore
    const { data: lead, error: fetchError } = await supabase
      .from('leads')
      .select('is_active, customer_name, assigned_to')
      .eq('id', leadId)
      .single();

    if (fetchError) {
      // If the is_active column doesn't exist, log and return helpful error
      if (fetchError.message && (fetchError.message.includes('is_active') || fetchError.message.includes('column') || fetchError.message.includes('does not exist'))) {
        console.error('Toggle active error - is_active column may not exist. Run migration 004_add_is_active_column.sql');
        return res.status(500).json({ error: 'Database setup incomplete: is_active column missing. Please run database migrations.' });
      }
      throw fetchError;
    }

    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    const newActive = lead.is_active === false ? true : false;

    // Determine new status based on is_active toggle
    let newStatus;
    if (newActive) {
      // Restoring — derive status from assigned banks, or fallback to Assigned/New
      const { data: banks, error: banksError } = await supabase
        .from('lead_banks')
        .select('status')
        .eq('lead_id', leadId);

      if (banksError) {
        console.warn('Could not fetch lead_banks for status derivation:', banksError.message);
      }

      if (banks && banks.length > 0) {
        const bankStatuses = banks.map(b => b.status);
        const derived = deriveLeadStatus(bankStatuses);
        newStatus = derived || (lead.assigned_to ? 'Assigned' : 'New');
      } else {
        newStatus = lead.assigned_to ? 'Assigned' : 'New';
      }
    } else {
      // Marking inactive — set status to Inactive
      newStatus = 'Inactive';
    }

    const { data: updatedLead, error: updateError } = await supabase
      .from('leads')
      .update({ is_active: newActive, status: newStatus })
      .eq('id', leadId)
      .select()
      .single();

    if (updateError) {
      // If the error is about a CHECK constraint on status, inform the user
      if (updateError.message && (updateError.message.includes('check') || updateError.message.includes('constraint') || updateError.message.includes('violates'))) {
        console.error('Status constraint violation - status value may not be allowed:', updateError.message);
        return res.status(500).json({ error: `Lead status '${newStatus}' is not allowed by database constraint. Please run migration 007_add_status_constraint.sql.` });
      }
      throw updateError;
    }

    // Record audit log
    const adminCtx = await getAdminContext(req);
    if (adminCtx) {
      await recordAuditLog(
        leadId,
        adminCtx.adminId,
        newActive ? 'restored' : 'marked_inactive',
        `${newActive ? 'Restored' : 'Marked inactive'} by admin (${adminCtx.adminName}) - Customer: ${lead.customer_name}`,
        adminCtx.adminName
      );
    }

    res.json({
      message: newActive ? 'Lead restored successfully' : 'Lead marked as inactive',
      lead: {
        id: updatedLead.id,
        customerName: updatedLead.customer_name,
        isActive: updatedLead.is_active,
        status: updatedLead.status
      }
    });
  } catch (error) {
    console.error('Toggle active error:', error);
    res.status(500).json({ error: error.message || 'Failed to toggle lead status' });
  }
});

// GET dashboard stats — derives statuses from lead_banks for accurate counts
router.get('/stats/overview', authorize('admin', 'operations_head', 'executive', 'dsa'), async (req, res) => {
  try {
    let query = supabase.from('leads').select('id, status, is_active, assigned_to, is_closed');

    if (!isFullAccessRole(req.user.role)) {
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

    // Retry without is_active if column doesn't exist yet
    if (error && error.message &&
        (error.message.includes('is_active') || error.message.includes('column') || error.message.includes('does not exist'))) {
      console.warn('is_active column not found in stats, falling back:', error.message);
      query = supabase.from('leads').select('id, status, assigned_to, is_closed');
      if (!isFullAccessRole(req.user.role)) {
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
      const { data: retryData } = await query;
      const fallbackLeads = retryData || [];
      return res.json({
        totalLeads: fallbackLeads.length,
        activeLeads: fallbackLeads.length,
        inactiveLeads: 0,
        newLeads: fallbackLeads.filter(l => l.status === 'New').length,
        assigned: fallbackLeads.filter(l => l.status === 'Assigned').length,
        processing: fallbackLeads.filter(l => l.status === 'Processing').length,
        sanctioned: fallbackLeads.filter(l => l.status === 'Sanctioned').length,
        partiallyDisbursed: fallbackLeads.filter(l => l.status === 'Partially Disbursed').length,
        disbursed: fallbackLeads.filter(l => l.status === 'Disbursed').length,
        rejected: fallbackLeads.filter(l => l.status === 'Rejected').length,
      });
    }

    if (error) throw error;

    const allLeads = leads || [];

    // Fetch lead_banks for ALL leads to derive statuses accurately
    const allLeadIds = allLeads.map(l => l.id);
    let banksByLeadId = {};
    if (allLeadIds.length > 0) {
      const { data: allBanks } = await supabase
        .from('lead_banks')
        .select('lead_id, status')
        .in('lead_id', allLeadIds);

      if (allBanks) {
        for (const bank of allBanks) {
          if (!banksByLeadId[bank.lead_id]) banksByLeadId[bank.lead_id] = [];
          banksByLeadId[bank.lead_id].push(bank);
        }
      }
    }

    // Compute derived status for each lead, then categorize into mutually exclusive buckets
    let closedCount = 0;
    let rejectedCount = 0;
    let inactiveCount = 0;
    const activeLeads = [];

    for (const lead of allLeads) {
      const banks = banksByLeadId[lead.id] || [];
      let derivedStatus = lead.status;

      if (banks.length > 0 && lead.assigned_to) {
        const bankStatuses = banks.map(b => b.status);
        const derived = deriveLeadStatus(bankStatuses);
        if (derived) derivedStatus = derived;
      }

      // Priority order: Closed > Rejected > Inactive > Active
      const isClosed = lead.is_closed === true || derivedStatus === 'Closed';
      const isRejected = !isClosed && derivedStatus === 'Rejected' && lead.is_active !== false;
      const isInactive = !isClosed && !isRejected && lead.is_active === false;

      if (isClosed) {
        closedCount++;
      } else if (isRejected) {
        rejectedCount++;
      } else if (isInactive) {
        inactiveCount++;
      } else {
        // Active — will count sub-statuses below
        activeLeads.push({ ...lead, _derived: derivedStatus });
      }
    }

    // Count sub-statuses from active leads by derived status
    let stats = {
      totalLeads: allLeads.length,
      activeLeads: activeLeads.length,
      inactiveLeads: inactiveCount,
      rejectedLeads: rejectedCount,
      closed: closedCount,
      newLeads: 0,
      assigned: 0,
      processing: 0,
      sanctioned: 0,
      partiallyDisbursed: 0,
      disbursed: 0,
      rejected: 0,
    };

    for (const lead of activeLeads) {
      const derivedStatus = lead._derived;

      if (derivedStatus === 'New') {
        stats.newLeads++;
      } else if (derivedStatus === 'Assigned') {
        stats.assigned++;
      } else if (derivedStatus === 'Processing') {
        stats.processing++;
      } else if (derivedStatus === 'Sanctioned') {
        stats.sanctioned++;
      } else if (derivedStatus === 'Partially Disbursed') {
        stats.partiallyDisbursed++;
      } else if (derivedStatus === 'Disbursed') {
        stats.disbursed++;
      } else if (derivedStatus === 'Rejected') {
        stats.rejected++;
      }
      // Active lead with unmatched derivedStatus falls through —
      // still contributes to activeLeads count but won't show on any card.
    }

    res.json(stats);
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// Status distribution for charts — uses derived statuses from lead_banks
router.get('/stats/status-distribution', authenticate, async (req, res) => {
  try {
    let query = supabase.from('leads').select('id, status, assigned_to');

    if (!isFullAccessRole(req.user.role)) {
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

    // Fetch lead_banks to derive accurate statuses
    const leadIds = (leads || []).map(l => l.id);
    let banksByLeadId = {};
    if (leadIds.length > 0) {
      const { data: allBanks } = await supabase
        .from('lead_banks')
        .select('lead_id, status')
        .in('lead_id', leadIds);

      if (allBanks) {
        for (const bank of allBanks) {
          if (!banksByLeadId[bank.lead_id]) banksByLeadId[bank.lead_id] = [];
          banksByLeadId[bank.lead_id].push(bank);
        }
      }
    }

    // Count by derived status
    const distribution = {
      'New': 0,
      'Assigned': 0,
      'Processing': 0,
      'Sanctioned': 0,
      'Partially Disbursed': 0,
      'Disbursed': 0,
      'Rejected': 0
    };

    for (const lead of leads || []) {
      const banks = banksByLeadId[lead.id] || [];
      let status = lead.status;

      if (banks.length > 0 && lead.assigned_to) {
        const bankStatuses = banks.map(b => b.status);
        const derived = deriveLeadStatus(bankStatuses);
        if (derived) status = derived;
      }

      if (distribution[status] !== undefined) {
        distribution[status]++;
      }
    }

    res.json(distribution);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch distribution' });
  }
});

// GET /api/leads/stats/monthly-trend — leads created per month with amounts
router.get('/stats/monthly-trend', authenticate, async (req, res) => {
  try {
    let query = supabase.from('leads').select('created_at, expected_amount, sanctioned_amount, disbursed_amount');

    if (!isFullAccessRole(req.user.role)) {
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

    // Group leads by year-month with aggregated amounts
    const monthMap = {};
    (leads || []).forEach(lead => {
      if (!lead.created_at) return;
      const d = new Date(lead.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!monthMap[key]) {
        monthMap[key] = { count: 0, totalExpected: 0, totalSanctioned: 0, totalDisbursed: 0 };
      }
      monthMap[key].count++;
      monthMap[key].totalExpected += Number(lead.expected_amount) || 0;
      monthMap[key].totalSanctioned += Number(lead.sanctioned_amount) || 0;
      monthMap[key].totalDisbursed += Number(lead.disbursed_amount) || 0;
    });

    // Sort by month ascending and return as array
    const sortedMonths = Object.keys(monthMap).sort();
    const trend = sortedMonths.map(month => ({
      month,
      ...monthMap[month]
    }));

    res.json(trend);
  } catch (error) {
    console.error('Error fetching monthly trend:', error);
    res.status(500).json({ error: 'Failed to fetch monthly trend' });
  }
});

// Semantic loan type normalization — groups known variants (e.g. MSME Loan vs Msme Loan vs msmse)
const LOAN_TYPE_CANONICAL = {
  'msme loan': 'MSME Loan',
  'msme': 'MSME Loan',
  'msmse': 'MSME Loan',
  'sme loan': 'MSME Loan',
  'sme': 'MSME Loan',
  'home loan': 'Home Loan',
  'home': 'Home Loan',
  'house loan': 'Home Loan',
  'business loan': 'Business Loan',
  'business': 'Business Loan',
  'personal loan': 'Personal Loan',
  'personal': 'Personal Loan',
  'lap': 'LAP',
  'loan against property': 'LAP',
  'mudra loan': 'Mudra Loan',
  'mudra': 'Mudra Loan',
  'education loan': 'Education Loan',
  'education': 'Education Loan',
  'agri loan': 'Agri Loan',
  'agriculture loan': 'Agri Loan',
  'agriculture': 'Agri Loan',
  'agri': 'Agri Loan',
};

function normalizeLoanType(raw) {
  // Step 1: basic cleanup — lowercase, underscores → spaces, collapse whitespace
  let cleaned = (raw || 'Unknown')
    .trim()
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ');

  // Step 2: semantic canonical mapping
  if (LOAN_TYPE_CANONICAL[cleaned]) {
    return LOAN_TYPE_CANONICAL[cleaned];
  }

  // Step 3: fallback — title-case for display
  return cleaned.replace(/\b\w/g, c => c.toUpperCase());
}

// Loan type distribution for dashboard — returns count + aggregated amounts per canonical type
router.get('/stats/loan-type-distribution', authenticate, async (req, res) => {
  try {
    let query = supabase.from('leads').select('loan_type, sanctioned_amount, disbursed_amount');

    if (!isFullAccessRole(req.user.role)) {
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

    const loanTypeMap = {};
    (leads || []).forEach(lead => {
      const type = normalizeLoanType(lead.loan_type);
      if (!loanTypeMap[type]) {
        loanTypeMap[type] = { count: 0, totalSanctioned: 0, totalDisbursed: 0 };
      }
      loanTypeMap[type].count++;
      loanTypeMap[type].totalSanctioned += Number(lead.sanctioned_amount) || 0;
      loanTypeMap[type].totalDisbursed += Number(lead.disbursed_amount) || 0;
    });

    res.json(loanTypeMap);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch loan types' });
  }
});

// PUT /api/leads/:id/assign - Assign lead to executive
router.put('/:id/assign', authorize('admin', 'operations_head'), async (req, res) => {
  try {
    const { assignedTo, department, priority } = req.body;
    const leadId = req.params.id;

    console.log('Assign request - leadId:', leadId, 'assignedTo:', assignedTo);

    if (!assignedTo) {
      return res.status(400).json({ error: 'Executive name is required' });
    }

    // Fetch current lead to get existing status for history tracking
    const { data: currentLead } = await supabase
      .from('leads')
      .select('status')
      .eq('id', leadId)
      .single();

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

    // Record status history
    const previousStatus = currentLead?.status || 'New';
    await recordStatusChange(
      leadId,
      previousStatus,
      'Assigned',
      req.user?.name || req.user?.email || 'system',
      `Assigned to ${assignedTo}`
    );

    res.json({ message: 'Lead assigned', lead: updatedLead });
  } catch (error) {
    console.error('Assign error:', error);
    res.status(500).json({ error: 'Failed to assign lead' });
  }
});

// PUT /api/leads/:id/assign-bank - Assign bank to lead (with branch name support)
router.put('/:id/assign-bank', authorize('admin', 'operations_head', 'executive'), async (req, res) => {
  try {
    const { bankName, branchName } = req.body;
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

    // Also create a lead_banks record for bank-wise tracking (with branch name)
    const { error: bankRowError } = await supabase
      .from('lead_banks')
      .insert({
        lead_id: leadId,
        bank_name: bankName,
        branch_name: branchName || null,
        status: 'Processing'
      });

    // Ignore duplicate errors (bank may already have a lead_banks row)
    if (bankRowError && bankRowError.code !== '23505') {
      console.error('Failed to create lead_banks row:', bankRowError);
    }

    // Record status history
    if (newStatus !== lead.status) {
      await recordStatusChange(leadId, lead.status, newStatus, req.user?.name || req.user?.email, `Bank ${bankName} assigned`);
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

    // Fetch current lead to get existing assigned_banks and assigned_to
    const { data: lead, error: fetchError } = await supabase
      .from('leads')
      .select('assigned_banks, status, assigned_to')
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

    // Recalculate status based on remaining banks and assignment
    let newStatus = lead.status;
    if (updatedBanks.length === 0) {
      // No banks left — go back to pre-bank status: Assigned if assigned to someone, else New
      newStatus = lead.assigned_to ? 'Assigned' : 'New';
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

    // Record status change in history if status changed
    if (newStatus !== lead.status) {
      await recordStatusChange(leadId, lead.status, newStatus, req.user?.name || req.user?.email || 'system', `Bank ${bankName} removed`);
    }

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
router.put('/:id/disburse', authorize('admin', 'operations_head', 'executive'), async (req, res) => {
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
router.get('/:id/summary', authorize('admin', 'operations_head', 'executive', 'dsa'), async (req, res) => {
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

// Section mapping helpers now live in services/gemini.js (getSectionFromDocumentId, SECTION_LABELS)

// POST /api/leads/:id/summarize - Generate profile summary via Gemini API
// Optional body: { section: 'kyc' | 'income_proof' | ... } to analyze only that section's documents
// POST /api/leads/:id/summarize - Generate profile summary via Gemini API
// Optional body: { section: 'kyc' | 'income_proof' | ... } to analyze only that section's documents
router.post('/:id/summarize', authorize('admin', 'operations_head', 'executive', 'dsa'), async (req, res) => {
  try {
    const leadId = req.params.id;
    const section = req.body?.section || null;

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

    // 2b. If a section is requested, filter to only documents in that category
    let analyzedUploads = uploads;
    if (section) {
      if (!SECTION_LABELS[section]) {
        return res.status(400).json({ error: 'Invalid section. Valid sections: ' + Object.keys(SECTION_LABELS).join(', ') });
      }
      analyzedUploads = uploads.filter(doc => getSectionFromDocumentId(doc.document_id) === section);
      if (analyzedUploads.length === 0) {
        return res.status(400).json({ error: `No uploaded documents found in the ${SECTION_LABELS[section]} section for this lead.` });
      }
    }

    // 3-5. Run the shared Gemini analysis
    const summaryText = await analyzeLeadDocuments({ lead, uploads: analyzedUploads, section });

    // 6. Save the summary persistently (section analyses saved to their own file so they don't overwrite the full summary)
    const summarySuffix = section ? `-${section}` : '';
    const fileName = `summaries/${leadId}${summarySuffix}-summary.txt`;

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
        const localPath = path.join(summariesDir, `${leadId}${summarySuffix}-summary.txt`);
        fs.writeFileSync(localPath, summaryText, 'utf8');
      }
    } else {
      const localPath = path.join(summariesDir, `${leadId}${summarySuffix}-summary.txt`);
      fs.writeFileSync(localPath, summaryText, 'utf8');
    }

    // 7. Update lead status to 'Processing' if currently 'New' or 'Assigned'
    if (lead.status === 'New' || lead.status === 'Assigned') {
      await supabase
        .from('leads')
        .update({ status: 'Processing' })
        .eq('id', leadId);
    }

    res.json({ success: true, summary: summaryText, section: section || null });
  } catch (error) {
    console.error('Error generating summary:', error);
    res.status(500).json({ error: error.message || 'Failed to analyze documents' });
  }
});

// ─────────────────────────────────────────────────────────────
// AUTO-FILL BANK APPLICATION FORMS FROM UPLOADED DOCUMENTS
// ─────────────────────────────────────────────────────────────

// Local directory where filled form PDFs are written (dev mode)
const filledFormsDir = path.join(uploadsDir, 'filled-forms');

// Build the flat values object passed to the PDF filler.
// Source: LLM-extracted details + lead-level fields.
function buildFormValues(lead, details) {
  const d = details || {};
  const { coapplicants } = parseRemarksField(lead.remarks);
  const fmt = (v) => (v === undefined || v === null || v === '') ? '' : v;
  const fmtMoney = (v) => {
    const n = Number(v);
    return (v === undefined || v === null || v === '' || !Number.isFinite(n)) ? '' : `₹${n.toLocaleString('en-IN')}`;
  };
  return {
    full_name: fmt(d.full_name) || fmt(lead.customer_name),
    dob: fmt(d.dob),
    gender: fmt(d.gender),
    aadhaar_number: fmt(d.aadhaar_number),
    pan_number: fmt(d.pan_number),
    address: fmt(d.address),
    mobile: fmt(lead.mobile),
    email: fmt(lead.email),
    loan_amount: fmtMoney(lead.expected_amount || d.loan_amount),
    loan_type: fmt(lead.loan_type),
    gross_income: fmtMoney(d.gross_income),
    monthly_income: fmtMoney(d.monthly_income),
    rental_income: fmtMoney(d.rental_income),
    co_applicant_name: coapplicants[0]?.name || '',
    co_applicant_dob: '',
    employer_name: fmt(d.employer_name) || fmt(lead.business_type),
    application_date: new Date().toLocaleDateString('en-IN'),
  };
}

// POST /api/leads/:id/fill-form — Fill a bank application form PDF from the lead's uploaded documents
router.post('/:id/fill-form', authorize('admin', 'operations_head', 'executive', 'dsa'), async (req, res) => {
  try {
    const leadId = req.params.id;
    const { formId } = req.body || {};
    if (!formId) {
      return res.status(400).json({ error: 'formId is required. Pass the id of the application form to fill.' });
    }

    // 1. Fetch lead + form
    const { data: lead, error: leadErr } = await supabase
      .from('leads')
      .select('*')
      .eq('id', leadId)
      .single();
    if (leadErr || !lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    // Role-based access (same as PUT /:id)
    if (!(await assertLeadAccess(lead, req))) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { data: form, error: formErr } = await supabase
      .from('application_forms')
      .select('*')
      .eq('id', formId)
      .maybeSingle();
    if (formErr || !form) {
      return res.status(404).json({ error: 'Application form not found' });
    }
    if (!form.is_active) {
      return res.status(410).json({ error: 'The requested form is currently unavailable.' });
    }

    // 2. Get extracted details — use the saved application_form if present, otherwise analyze documents
    let details = (lead.application_form && typeof lead.application_form === 'object') ? lead.application_form : null;
    if (!details || Object.keys(details).length === 0) {
      const { data: uploads } = await supabase
        .from('lead_checklist_status')
        .select('*')
        .eq('lead_id', leadId)
        .eq('status', 'uploaded');

      if (!uploads || uploads.length === 0) {
        return res.status(400).json({ error: 'No documents uploaded for this lead. Please upload documents first.' });
      }

      const summaryText = await analyzeLeadDocuments({ lead, uploads });
      details = extractDetailsFromSummary(summaryText) || {};
    }

    // 3. Load the blank form PDF
    let fileBuffer;
    try {
      fileBuffer = await loadFormPdf(form);
    } catch (err) {
      return res.status(404).json({ error: 'The requested form file is currently unavailable. Please contact administrator.' });
    }

    // 4. Fill the PDF (AcroForm fields first, then AI-calibrated overlay)
    const values = buildFormValues(lead, details);
    const { buffer: filledBuffer, filledAcroCount, overlayCount } = await fillPdfForm({
      fileBuffer,
      fieldMap: form.field_map?.fields || {},
      values,
    });

    // 5. Persist the filled PDF
    const stamp = Date.now();
    const storagePath = `filled-forms/${leadId}_${form.id}_${stamp}.pdf`;

    if (process.env.NODE_ENV === 'production') {
      const { error: upErr } = await supabase.storage
        .from('lead-documents')
        .upload(storagePath, filledBuffer, { contentType: 'application/pdf', upsert: true });
      if (upErr) throw upErr;
    } else {
      if (!fs.existsSync(filledFormsDir)) {
        fs.mkdirSync(filledFormsDir, { recursive: true });
      }
      fs.writeFileSync(path.join(filledFormsDir, `${leadId}_${form.id}_${stamp}.pdf`), filledBuffer);
    }

    const { data: record, error: insertErr } = await supabase
      .from('lead_filled_forms')
      .insert({
        lead_id: leadId,
        form_id: form.id,
        bank_name: form.bank_name,
        loan_type: form.loan_type,
        form_name: form.form_name,
        file_path: storagePath,
      })
      .select()
      .single();
    if (insertErr) {
      if (insertErr.message && (insertErr.message.includes('relation') || insertErr.message.includes('does not exist'))) {
        return res.status(500).json({ error: 'Database setup incomplete: lead_filled_forms table missing. Please run migration 020_add_form_filling.sql.' });
      }
      throw insertErr;
    }

    // Also refresh the saved application_form JSON with the latest extracted details
    if (details && Object.keys(details).length > 0) {
      await supabase
        .from('leads')
        .update({ application_form: details, status: lead.status === 'New' || lead.status === 'Assigned' ? 'Processing' : lead.status })
        .eq('id', leadId);
    }

    res.status(201).json({
      success: true,
      id: record.id,
      formName: form.form_name,
      bankName: form.bank_name,
      loanType: form.loan_type,
      filledAcroCount,
      overlayCount,
      message: overlayCount > 0 || filledAcroCount > 0
        ? `${form.form_name} filled successfully (${overlayCount + filledAcroCount} fields placed).`
        : 'Form downloaded but no fillable fields were found on this form. Run "Calibrate Fields" on the form as an admin to enable auto-fill.',
    });
  } catch (error) {
    console.error('Error filling form:', error);
    res.status(500).json({ error: error.message || 'Failed to fill application form' });
  }
});

// GET /api/leads/:id/filled-forms — List saved filled forms for a lead
router.get('/:id/filled-forms', authorize('admin', 'operations_head', 'executive', 'dsa'), async (req, res) => {
  try {
    // Role-based access
    const { data: lead, error: leadErr } = await supabase
      .from('leads')
      .select('id, assigned_to')
      .eq('id', req.params.id)
      .single();
    if (leadErr || !lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }
    if (!(await assertLeadAccess(lead, req))) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { data, error } = await supabase
      .from('lead_filled_forms')
      .select('*')
      .eq('lead_id', req.params.id)
      .order('created_at', { ascending: false });

    if (error) {
      // Table may not exist yet (migration 020 not run)
      if (error.message && (error.message.includes('relation') || error.message.includes('does not exist'))) {
        return res.json({ data: [] });
      }
      throw error;
    }

    res.json({ data: data || [] });
  } catch (error) {
    console.error('Error listing filled forms:', error);
    res.status(500).json({ error: 'Failed to fetch filled forms' });
  }
});

// GET /api/leads/:id/filled-forms/:filledId/download — Download a saved filled form PDF
router.get('/:id/filled-forms/:filledId/download', authorize('admin', 'operations_head', 'executive', 'dsa'), async (req, res) => {
  try {
    const { id: leadId, filledId } = req.params;

    // Role-based access
    const { data: lead, error: leadErr } = await supabase
      .from('leads')
      .select('id, assigned_to')
      .eq('id', leadId)
      .single();
    if (leadErr || !lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }
    if (!(await assertLeadAccess(lead, req))) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { data: rec, error } = await supabase
      .from('lead_filled_forms')
      .select('*')
      .eq('id', filledId)
      .eq('lead_id', leadId)
      .single();

    if (error) {
      if (error.message && (error.message.includes('relation') || error.message.includes('does not exist'))) {
        return res.status(500).json({ error: 'Database setup incomplete: lead_filled_forms table missing. Please run migration 020_add_form_filling.sql.' });
      }
      return res.status(404).json({ error: 'Filled form not found' });
    }
    if (!rec) {
      return res.status(404).json({ error: 'Filled form not found' });
    }

    let fileBuffer;
    try {
      fileBuffer = await loadStoredFile(rec.file_path);
    } catch (err) {
      return res.status(404).json({ error: 'Filled form file is currently unavailable.' });
    }

    const safeName = (rec.form_name || 'filled-form').replace(/[^a-zA-Z0-9._-]/g, '_');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}.pdf"`);
    res.setHeader('Content-Length', fileBuffer.length);
    res.send(fileBuffer);
  } catch (error) {
    console.error('Error downloading filled form:', error);
    res.status(500).json({ error: 'Failed to download filled form' });
  }
});

export default router;
