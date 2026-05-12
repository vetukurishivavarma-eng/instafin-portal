import express from 'express';
import { leads, executives } from '../data/store.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';

const router = express.Router();

// Apply authenticate middleware to all routes
router.use(authenticate);

// GET all leads with search, filter and pagination
router.get('/', authorize('admin', 'executive', 'dsa'), (req, res) => {
  try {
    let filteredLeads = [...leads];

    // Role-based filtering - non-admin users only see their assigned leads
    if (req.user.role !== 'admin') {
      filteredLeads = filteredLeads.filter(lead =>
        lead.assignedTo === req.user.id || lead.createdBy === req.user.id
      );
    }

    // Filter by status
    if (req.query.status) {
      filteredLeads = filteredLeads.filter(lead =>
        lead.status.toLowerCase() === req.query.status.toLowerCase()
      );
    }

    // Filter by loan type
    if (req.query.loanType) {
      filteredLeads = filteredLeads.filter(lead =>
        lead.loanType.toLowerCase().includes(req.query.loanType.toLowerCase())
      );
    }

    // Filter by assigned executive name
    if (req.query.assignedTo) {
      filteredLeads = filteredLeads.filter(lead =>
        lead.assignedTo && lead.assignedTo.toLowerCase().includes(req.query.assignedTo.toLowerCase())
      );
    }

    // Search in customerName and mobile
    if (req.query.search) {
      const searchTerm = req.query.search.toLowerCase();
      filteredLeads = filteredLeads.filter(lead =>
        lead.customerName.toLowerCase().includes(searchTerm) ||
        lead.mobile.includes(searchTerm)
      );
    }

    // Pagination
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const startIndex = (page - 1) * limit;
    const endIndex = page * limit;

    const paginatedLeads = filteredLeads.slice(startIndex, endIndex);

    res.json({
      data: paginatedLeads,
      pagination: {
        total: filteredLeads.length,
        page,
        limit,
        totalPages: Math.ceil(filteredLeads.length / limit)
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET single lead by ID
router.get('/:id', authorize('admin', 'executive', 'dsa'), (req, res) => {
  try {
    const lead = leads.find(l => l.id === req.params.id);

    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    // Role-based access - non-admin users can only view their assigned leads
    if (req.user.role !== 'admin' && lead.assignedTo !== req.user.id && lead.createdBy !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json(lead);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET executives list
router.get('/meta/executives', authorize('admin', 'executive', 'dsa'), (req, res) => {
  res.json(executives);
});

// POST create new lead
router.post('/', authorize('admin', 'executive', 'dsa'), (req, res) => {
  try {
    const {
      customerName,
      mobile,
      loanType,
      expectedAmount,
      assignedBanks,
      aadhaar,
      pan,
      annualIncome,
      businessType,
      remarks
    } = req.body;

    // Validation
    if (!customerName || !mobile) {
      return res.status(400).json({ error: 'Customer name and mobile are required' });
    }

    const newLead = {
      id: Date.now().toString(),
      customerName,
      mobile,
      loanType: loanType || '',
      expectedAmount: expectedAmount || '',
      assignedBanks: assignedBanks || [],
      status: 'New',
      assignedTo: null,
      department: null,
      priority: 'Medium',
      followUp: null,
      // Additional fields
      aadhaar: aadhaar || '',
      pan: pan || '',
      annualIncome: annualIncome || '',
      businessType: businessType || '',
      remarks: remarks || '',
      lastUpdated: new Date().toISOString(),
      // Track creation
      createdBy: req.user.id,
      createdAt: new Date().toISOString(),
    };

    leads.push(newLead);
    res.status(201).json(newLead);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT update lead
router.put('/:id', authorize('admin', 'executive', 'dsa'), (req, res) => {
  try {
    const index = leads.findIndex(l => l.id === req.params.id);

    if (index === -1) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    // Non-admin users can only update their assigned leads
    if (req.user.role !== 'admin' &&
        leads[index].assignedTo !== req.user.id &&
        leads[index].createdBy !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Update lead with new data and set lastUpdated
    leads[index] = {
      ...leads[index],
      ...req.body,
      lastUpdated: new Date().toISOString()
    };

    res.json(leads[index]);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT assign lead to executive
router.put('/:id/assign', authorize('admin', 'executive'), (req, res) => {
  try {
    const index = leads.findIndex(l => l.id === req.params.id);

    if (index === -1) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    // Non-admin users can only assign their own leads
    if (req.user.role !== 'admin' &&
        leads[index].assignedTo !== req.user.id &&
        leads[index].createdBy !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { assignedTo, department, priority } = req.body;

    leads[index] = {
      ...leads[index],
      assignedTo,
      department,
      priority,
      status: 'Assigned',
      lastUpdated: new Date().toISOString()
    };

    res.json(leads[index]);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT update lead status
router.put('/:id/status', authorize('admin', 'executive', 'dsa'), (req, res) => {
  try {
    const index = leads.findIndex(l => l.id === req.params.id);

    if (index === -1) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    const { status } = req.body;

    // Validate status
    const validStatuses = ['New', 'Processing', 'Assigned', 'Sanctioned', 'Disbursed'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    leads[index].status = status;
    leads[index].lastUpdated = new Date().toISOString();

    res.json(leads[index]);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT schedule follow-up date
router.put('/:id/follow-up', authorize('admin', 'executive', 'dsa'), (req, res) => {
  try {
    const index = leads.findIndex(l => l.id === req.params.id);

    if (index === -1) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    // Non-admin users can only update their assigned leads
    if (req.user.role !== 'admin' &&
        leads[index].assignedTo !== req.user.id &&
        leads[index].createdBy !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { followUp } = req.body;

    if (!followUp) {
      return res.status(400).json({ error: 'Follow-up date is required' });
    }

    leads[index].followUp = followUp;
    leads[index].lastUpdated = new Date().toISOString();

    res.json(leads[index]);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE lead - admin only
router.delete('/:id', authorize('admin'), (req, res) => {
  try {
    const index = leads.findIndex(l => l.id === req.params.id);

    if (index === -1) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    leads.splice(index, 1);
    res.json({ message: 'Lead deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET dashboard overview stats
router.get('/stats/overview', authorize('admin', 'executive', 'dsa'), (req, res) => {
  try {
    let filteredLeads = [...leads];

    // Non-admin users only see their leads
    if (req.user.role !== 'admin') {
      filteredLeads = filteredLeads.filter(lead =>
        lead.assignedTo === req.user.id || lead.createdBy === req.user.id
      );
    }

    const stats = {
      totalLeads: filteredLeads.length,
      newLeads: filteredLeads.filter(l => l.status === 'New').length,
      processing: filteredLeads.filter(l => l.status === 'Processing').length,
      assigned: filteredLeads.filter(l => l.status === 'Assigned').length,
      sanctioned: filteredLeads.filter(l => l.status === 'Sanctioned').length,
      disbursed: filteredLeads.filter(l => l.status === 'Disbursed').length,
    };

    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET leads count by status
router.get('/stats/by-status', authorize('admin', 'executive', 'dsa'), (req, res) => {
  try {
    let filteredLeads = [...leads];

    // Non-admin users only see their leads
    if (req.user.role !== 'admin') {
      filteredLeads = filteredLeads.filter(lead =>
        lead.assignedTo === req.user.id || lead.createdBy === req.user.id
      );
    }

    const statusCounts = {};
    const statuses = ['New', 'Processing', 'Assigned', 'Sanctioned', 'Disbursed'];

    statuses.forEach(status => {
      statusCounts[status] = filteredLeads.filter(l => l.status === status).length;
    });

    res.json(statusCounts);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET leads count per executive
router.get('/stats/by-executive', authorize('admin'), (req, res) => {
  try {
    const executiveStats = {};

    // Initialize with all executives
    executives.forEach(exec => {
      executiveStats[exec.name] = {
        name: exec.name,
        department: exec.department,
        total: 0,
        new: 0,
        processing: 0,
        sanctioned: 0,
        disbursed: 0
      };
    });

    // Count leads per executive
    leads.forEach(lead => {
      if (lead.assignedTo && executiveStats[lead.assignedTo]) {
        executiveStats[lead.assignedTo].total++;
        if (lead.status === 'New') executiveStats[lead.assignedTo].new++;
        if (lead.status === 'Processing') executiveStats[lead.assignedTo].processing++;
        if (lead.status === 'Sanctioned') executiveStats[lead.assignedTo].sanctioned++;
        if (lead.status === 'Disbursed') executiveStats[lead.assignedTo].disbursed++;
      }
    });

    res.json(Object.values(executiveStats));
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET bank-wise stats (legacy endpoint)
router.get('/stats/bank-wise', authorize('admin', 'executive', 'dsa'), (req, res) => {
  try {
    let filteredLeads = [...leads];

    // Non-admin users only see their leads
    if (req.user.role !== 'admin') {
      filteredLeads = filteredLeads.filter(lead =>
        lead.assignedTo === req.user.id || lead.createdBy === req.user.id
      );
    }

    const bankStats = {};

    filteredLeads.forEach(lead => {
      lead.assignedBanks.forEach(bank => {
        if (!bankStats[bank]) {
          bankStats[bank] = { bank, assigned: 0, processing: 0, sanctioned: 0, disbursed: 0 };
        }
        bankStats[bank].assigned++;
        if (lead.status === 'Processing') bankStats[bank].processing++;
        if (lead.status === 'Sanctioned') bankStats[bank].sanctioned++;
        if (lead.status === 'Disbursed') bankStats[bank].disbursed++;
      });
    });

    res.json(Object.values(bankStats));
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET dashboard stats (legacy endpoint)
router.get('/stats/dashboard', authorize('admin', 'executive', 'dsa'), (req, res) => {
  try {
    let filteredLeads = [...leads];

    // Non-admin users only see their leads
    if (req.user.role !== 'admin') {
      filteredLeads = filteredLeads.filter(lead =>
        lead.assignedTo === req.user.id || lead.createdBy === req.user.id
      );
    }

    const stats = {
      totalLeads: filteredLeads.length,
      freshLeads: filteredLeads.filter(l => l.status === 'New').length,
      processing: filteredLeads.filter(l => l.status === 'Processing').length,
      sanctioned: filteredLeads.filter(l => l.status === 'Sanctioned').length,
      disbursed: filteredLeads.filter(l => l.status === 'Disbursed').length,
    };

    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get status distribution for pie chart
router.get('/stats/status-distribution', authenticate, (req, res) => {
  const distribution = {
    'New': leads.filter(l => l.status === 'New' || l.status === 'fresh').length,
    'Processing': leads.filter(l => l.status === 'Processing' || l.status === 'Assigned').length,
    'Sanctioned': leads.filter(l => l.status === 'Sanctioned').length,
    'Disbursed': leads.filter(l => l.status === 'Disbursed').length
  };
  res.json(distribution);
});

// Get loan type distribution for bar chart
router.get('/stats/loan-type-distribution', authenticate, (req, res) => {
  const loanTypes = {};
  leads.forEach(lead => {
    const type = lead.loanType || 'Unknown';
    loanTypes[type] = (loanTypes[type] || 0) + 1;
  });
  res.json(loanTypes);
});

export default router;