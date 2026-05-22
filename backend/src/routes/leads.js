import express from 'express';
import fs from 'fs';
import path from 'path';
import { supabase } from '../lib/supabase.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import leadBanksRouter from './leadBanks.js';
import { deriveLeadStatus, computeLeadAggregates } from '../utils/statusDerivation.js';

const router = express.Router();

router.use(authenticate);

// Mount bank-wise routes as sub-router
router.use('/:leadId/banks', leadBanksRouter);

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

      // Override with derived values if lead_banks records exist
      if (banks.length > 0) {
        const bankStatuses = banks.map(b => b.status);
        const derived = deriveLeadStatus(bankStatuses);
        const agg = computeLeadAggregates(banks);
        if (derived) status = derived;
        sanctionedAmount = agg.totalSanctioned || sanctionedAmount;
        disbursedAmount = agg.totalDisbursed;
      }

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
        assignedTo: lead.assigned_to,
        department: lead.department,
        priority: lead.priority,
        followUp: lead.follow_up,
        remarks: lead.remarks,
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
      return res.status(403).json({ error: 'Access denied' });
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

    if (banks && banks.length > 0) {
      const bankStatuses = banks.map(b => b.status);
      const derived = deriveLeadStatus(bankStatuses);
      const agg = computeLeadAggregates(banks);
      if (derived) status = derived;
      sanctionedAmount = agg.totalSanctioned || sanctionedAmount;
      disbursedAmount = agg.totalDisbursed;
    }

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
      remarks: lead.remarks,
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
      loan_status: loanStatus || null,
      income_source: incomeSource || null,
      resident_type: residentType || null,
      business_type: businessType || null,
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
      .select('assigned_to')
      .eq('id', req.params.id)
      .single();

    if (!existingLead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    // Role-based access
    if (req.user.role !== 'admin' &&
        existingLead.assigned_to !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

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
      query = query.eq('assigned_to', req.user.id);
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
      const ext = path.extname(doc.document_name || fileName).toLowerCase();
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
Analyze the attached documents and the metadata of the loan applicant:
- Customer Name: ${lead.customer_name}
- Mobile: ${lead.mobile || 'N/A'}
- Email: ${lead.email || 'N/A'}
- Loan Type: ${lead.loan_type || 'N/A'}
- Expected Amount: ${lead.expected_amount || 'N/A'}
- Income Source: ${lead.income_source || 'N/A'}
- Resident Type: ${lead.resident_type || 'N/A'}
- Business Type: ${lead.business_type || 'N/A'}

Uploaded Documents Context:
${documentDescriptions.join('\n')}

Verify if the documents match the applicant's details. Generate a premium, comprehensive underwriter profile summary in markdown format with clear headings. Keep the style modern, professional, and thorough. Use the following structured outline:

## 👤 Underwriting Executive Summary
Provide a 3-4 sentence paragraph highlighting the overall viability of the applicant for this loan and key findings.

## 📄 Document Verification & Legitimacy
Detail the legitimacy of each document. Specify if the uploaded files (Aadhaar, PAN, Bank Statements, or Business Proof) appear correct, match the name "${lead.customer_name}", and have valid details.

## 💼 Financial & Income Assessment
Estimate their annual or monthly income based on salary slips, GST certificates, balance sheets, or bank statement transactions. Assess their income stability (e.g. check for continuous employment, regular deposits, healthy average balances, and non-bounced transactions).

## ⚠️ Risk Profiling & Discrepancies
Highlight any potential risks, low balances, missing documents, name spelling mismatches, or concerns that need manual intervention. If none, explicitly state "No major discrepancies found."

## 🎯 Credit Recommendation
Provide a clear final recommendation:
- **Status**: [APPROVED / CONDITIONALLY APPROVED / REJECTED]
- **Recommended Loan Amount**: [Estimated Amount based on eligibility]
- **Justification**: Detailed reasoning based on document verification and cash flows.

CRITICAL INSTRUCTION:
At the very end of your response, append a structured JSON block inside a \`\`\`json \`\`\` code block (ensure it is the ONLY JSON code block in your entire output). 
This JSON block MUST contain the following structured fields extracted from the documents:
{
  "extracted_details": {
    "full_name": "Applicant's full name as written on identity proof",
    "dob": "Date of Birth (DD/MM/YYYY) if available",
    "gender": "Male / Female / Other",
    "aadhaar_number": "Aadhaar number if present (format: XXXX XXXX XXXX or masked)",
    "pan_number": "PAN number if present (format: XXXXX1234X)",
    "address": "Full residential address as written on Aadhaar/proof"
  },
  "face_bounding_box": [ymin, xmin, ymax, xmax]
}

Note: Locate the small profile photo of the applicant on the Aadhaar card, PAN card, or standard ID proof. Return the face_bounding_box normalized coordinates from 0 to 1000 as [ymin, xmin, ymax, xmax] (e.g., [200, 150, 450, 400]). If no face/photo is found or it is not an image/PDF, return null for face_bounding_box.
`;

    contentsParts.unshift({ text: promptText });

    // 5. Call Gemini API
    const apiKey = process.env.GEMINI_API_KEY;
    let summaryText = "";

    if (apiKey) {
      console.log('Querying available Gemini models...');
      let modelName = 'gemini-2.5-flash'; // Safe default for 2026

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
            modelName = flashModel.name.replace('models/', '');
            console.log(`Dynamically selected active Flash model: ${modelName}`);
          } else {
            const anyModel = availableModels.find(m => 
              m.supportedGenerationMethods?.includes('generateContent')
            );
            if (anyModel) {
              modelName = anyModel.name.replace('models/', '');
              console.log(`Dynamically selected active model: ${modelName}`);
            }
          }
        } else {
          console.warn(`Could not list models (status ${listResponse.status}), using default model.`);
        }
      } catch (listErr) {
        console.warn('Could not query active Gemini models list, using default:', listErr.message);
      }

      console.log(`Calling Gemini API to summarize lead profile using model ${modelName}...`);
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
      const response = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: contentsParts }]
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Gemini API Error details:', errorText);
        throw new Error(`Gemini API returned status ${response.status}`);
      }

      const resData = await response.json();
      summaryText = resData.candidates?.[0]?.content?.parts?.[0]?.text || "Failed to parse summary from AI candidate.";
    } else {
      console.warn('GEMINI_API_KEY environment variable is not set. Generating mock analysis for testing.');
      summaryText = `
## 👤 Underwriting Executive Summary
This is a **MOCK ANALYSIS** because the \`GEMINI_API_KEY\` environment variable has not been configured. To enable live AI profiling, please set your Gemini API key in the server environment variables.
Based on the metadata, the applicant **${lead.customer_name}** is applying for a **${lead.loan_type || 'Loan'}** of **${lead.expected_amount || 'unspecified amount'}**.

## 📄 Document Verification & Legitimacy
*   **KYC / Identity Proofs**: Mock verification of uploaded documents. Names on files are assumed to correspond to **${lead.customer_name}**.
*   **Income/Business Proofs**: Plausibility check successful.

## 💼 Financial & Income Assessment
*   **Income Stream**: Categorized as **${lead.income_source || 'Unknown'}**.
*   **Monthly Cash Flow**: Indicated stability and strong average balances, satisfying the debt-service ratio requirements.

## ⚠️ Risk Profiling & Discrepancies
*   No significant risks detected in mock inspection.
*   *Note: Please configure \`GEMINI_API_KEY\` on your deployment server to inspect document contents (PDFs/images).*

## 🎯 Credit Recommendation
*   **Status**: **CONDITIONALLY APPROVED** (Pending actual AI integration)
*   **Recommended Loan Amount**: ${lead.expected_amount || 'Requested Amount'}
*   **Justification**: Lead profiles as a low-to-medium credit risk based on standard applicant parameters.

\`\`\`json
{
  "extracted_details": {
    "full_name": "${lead.customer_name}",
    "dob": "15/08/1990",
    "gender": "Male",
    "aadhaar_number": "XXXX XXXX 1234",
    "pan_number": "ABCDE1234F",
    "address": "123, High Street, Sector 5, Bengaluru, Karnataka - 560001"
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