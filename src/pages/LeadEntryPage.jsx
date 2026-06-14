import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import StatusBadge from '../components/StatusBadge';
import BulkUploadModal from '../components/BulkUploadModal';
import API_BASE from '../config/api';
import { ALL_BANKS } from '../data/banks';
import * as XLSX from 'xlsx';

export default function LeadEntryPage() {
  const { isImpersonating, impersonating, user, accessToken, effectiveRole } = useAuth();
  
  // Loan types loaded dynamically
  const [loanTypes, setLoanTypes] = useState([
    { name: 'Home Loan', key: 'home_loan' },
    { name: 'LAP (Loan Against Property)', key: 'lap' },
    { name: 'Mudra Loan', key: 'mudra' },
    { name: 'MSME Loan', key: 'msme' },
    { name: 'Business Loan', key: 'business_loan' },
    { name: 'Personal Loan', key: 'personal_loan' },
    { name: 'Education Loan', key: 'education_loan' },
  ]);
  
  // Modal Triggers
  const [showAddModal, setShowAddModal] = useState(false);
  const [showManageModal, setShowManageModal] = useState(false);
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const [selectedLead, setSelectedLead] = useState(null);

  const [formData, setFormData] = useState({
    customerName: '',
    mobile: '',
    loanType: '',
    expectedAmount: '',
    referralCode: '',
    assignedBanks: []
  });
  const [fieldErrors, setFieldErrors] = useState({});
  const [assignData, setAssignData] = useState({
    assignedTo: '',
    department: '',
    priority: 'Medium'
  });
  const [executives, setExecutives] = useState([]);
  const [leads, setLeads] = useState([]);
  const [allLeads, setAllLeads] = useState([]); // Unfiltered leads for impersonation filtering
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [createdLead, setCreatedLead] = useState(null);

  // Leads Pipeline & Search States
  const [searchParams] = useSearchParams();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || '');
  const now = new Date();
  const [monthFilter, setMonthFilter] = useState(String(now.getMonth() + 1).padStart(2, '0'));
  const [yearFilter, setYearFilter] = useState(String(now.getFullYear()));

  useEffect(() => {
    const statusParam = searchParams.get('status');
    if (statusParam !== null) {
      setStatusFilter(statusParam);
    }
  }, [searchParams]);
  const [editingLead, setEditingLead] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [viewLead, setViewLead] = useState(null);
  const [sanctionLetterUrl, setSanctionLetterUrl] = useState(null);
  const [loadingLetter, setLoadingLetter] = useState(false);
  const [statusHistory, setStatusHistory] = useState([]);
  const [showStatusHistory, setShowStatusHistory] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [deleteReason, setDeleteReason] = useState('');
  const [deletingLead, setDeletingLead] = useState(false);

  useEffect(() => {
    if (!accessToken) return;
    fetch(`${API_BASE}/leads/meta/executives`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    })
      .then(r => r.json())
      .then(data => setExecutives(data))
      .catch(() => {});
    
    // Fetch loan types dynamically
    fetch(`${API_BASE}/loan-types`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    })
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          setLoanTypes(data.filter(lt => lt.active !== false).map(lt => ({
            name: lt.name,
            key: lt.key
          })));
        }
      })
      .catch(() => {});
    
    loadLeads();
  }, [accessToken]);

  const loadLeads = () => {
    fetch(`${API_BASE}/leads`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    })
      .then(r => r.json())
      .then(data => {
        const fetchedLeads = data.data || [];
        setAllLeads(fetchedLeads);
        // If impersonating, filter to only show this executive's leads
        if (isImpersonating && impersonating?.name) {
          setLeads(fetchedLeads.filter(l => l.assignedTo === impersonating.name));
        } else {
          setLeads(fetchedLeads);
        }
      })
      .catch(() => {});
  };

  const fetchSanctionLetter = async (leadId) => {
    setLoadingLetter(true);
    setSanctionLetterUrl(null);
    try {
      const res = await fetch(`${API_BASE}/checklist-status/${leadId}`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const data = await res.json();
      if (data && data.sanction_letter && data.sanction_letter.status === 'uploaded') {
        setSanctionLetterUrl(`${API_BASE}/checklist-status/file/${leadId}/sanction_letter`);
      }
    } catch (err) {
      console.error('Failed to fetch sanction letter:', err);
    } finally {
      setLoadingLetter(false);
    }
  };

  const fetchStatusHistory = async (leadId) => {
    try {
      const res = await fetch(`${API_BASE}/status-history/${leadId}`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const data = await res.json();
      setStatusHistory(data.data || []);
    } catch (err) {
      setStatusHistory([]);
    }
  };

  const handleCloseLead = async (leadId) => {
    setShowCloseConfirm(false);
    try {
      const res = await fetch(`${API_BASE}/leads/${leadId}/close`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
      });
      if (res.ok) {
        setSuccess('Lead closed successfully!');
        loadLeads();
      } else {
        const err = await res.json();
        setError(err.error || 'Failed to close lead');
      }
    } catch (err) {
      setError('Failed to close lead');
    }
  };

  const handleDeleteLead = async (leadId, reason) => {
    setDeletingLead(true);
    try {
      const reqRes = await fetch(`${API_BASE}/leads/${leadId}/request-delete`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason || 'Not specified' })
      });
      if (reqRes.ok) {
        setDeleteConfirm(null);
        setDeleteReason('');
        setError('');
        setSuccess('Delete request submitted. Another admin must approve it via the bell icon (🔔) in the top navigation bar.');
        loadLeads();
      } else {
        const errData = await reqRes.json();
        setError(errData.error || 'Failed to submit delete request');
      }
    } catch (err) {
      setError('Failed to submit delete request');
    } finally {
      setDeletingLead(false);
    }
  };

  const handleViewLead = (lead) => {
    setViewLead(lead);
    if (lead.status === 'Sanctioned') {
      fetchSanctionLetter(lead.id);
    }
    fetchStatusHistory(lead.id);
  };

  const handleDownloadSanctionLetter = async (leadId) => {
    try {
      const res = await fetch(`${API_BASE}/checklist-status/file/${leadId}/sanction_letter`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (!res.ok) {
        setError('Failed to download sanction letter');
        return;
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sanction-letter-${leadId}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError('Failed to download sanction letter');
    }
  };

  const getStatusBorder = (status) => {
    const colors = {
      'New': 'border-yellow-400',
      'Processing': 'border-blue-400',
      'Sanctioned': 'border-green-400',
      'Partially Disbursed': 'border-teal-400',
      'Disbursed': 'border-purple-400',
      'Assigned': 'border-orange-400',
      'Rejected': 'border-red-400'
    };
    return colors[status] || 'border-gray-200';
  };

  // Validation functions
  const validateName = (name) => {
    if (!name.trim()) return 'Customer name is required';
    if (/[0-9]/.test(name)) return 'Name cannot contain numbers';
    return '';
  };

  const validateMobile = (mobile) => {
    if (!mobile.trim()) return 'Mobile number is required';
    if (!/^\d+$/.test(mobile)) return 'Mobile must contain only numbers';
    if (mobile.length !== 10) return 'Mobile must be exactly 10 digits';
    return '';
  };

  const validateAmount = (amount) => {
    if (!amount.trim()) return 'Expected amount is required';
    if (!/^\d+$/.test(amount)) return 'Amount must contain only numbers';
    return '';
  };

  const validateLoanType = (loanType) => {
    if (!loanType) return 'Please select a loan type';
    return '';
  };



  const handleNameChange = (e) => {
    const value = e.target.value.replace(/[0-9]/g, '');
    setFormData(prev => ({ ...prev, customerName: value }));
    setFieldErrors(prev => ({ ...prev, customerName: '' }));
  };

  const handleMobileChange = (e) => {
    const value = e.target.value.replace(/\D/g, '').slice(0, 10);
    setFormData(prev => ({ ...prev, mobile: value }));
    setFieldErrors(prev => ({ ...prev, mobile: '' }));
  };

  const handleAmountChange = (e) => {
    const value = e.target.value.replace(/\D/g, '');
    setFormData(prev => ({ ...prev, expectedAmount: value }));
    setFieldErrors(prev => ({ ...prev, expectedAmount: '' }));
  };

  const handleBankToggle = (bank) => {
    setFormData(prev => ({
      ...prev,
      assignedBanks: prev.assignedBanks.includes(bank)
        ? prev.assignedBanks.filter(b => b !== bank)
        : [...prev.assignedBanks, bank]
    }));
  };

  const handleSaveLead = async () => {
    const errors = {
      customerName: validateName(formData.customerName),
      mobile: validateMobile(formData.mobile),
      expectedAmount: validateAmount(formData.expectedAmount),
      loanType: validateLoanType(formData.loanType),
    };

    setFieldErrors(errors);

    if (Object.values(errors).some(e => e)) {
      setError('Please fix the errors above');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const res = await fetch(`${API_BASE}/leads`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          ...formData,
          // When admin is impersonating an executive, auto-assign the lead to that executive
          ...(isImpersonating && impersonating?.name ? { impersonatedExecutive: impersonating.name } : {})
        }),
      });
      const lead = await res.json();
      if (!res.ok) {
        setError(lead.error || 'Failed to create lead');
        return;
      }
      setCreatedLead(lead);
      setSuccess(`Lead created successfully!`);
      loadLeads();
      setFormData({ 
        customerName: '', 
        mobile: '', 
        loanType: '', 
        expectedAmount: '', 
        referralCode: '', 
        assignedBanks: []
      });
      setFieldErrors({});
    } catch (err) {
      setError('Failed to create lead');
    } finally {
      setLoading(false);
    }
  };

  const handleAssignExecutive = async () => {
    if (!createdLead || !assignData.assignedTo) {
      setError('Please create lead first and select an executive');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/leads/${createdLead.id}/assign`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify(assignData),
      });

      if (!res.ok) {
        const errData = await res.json();
        setError(errData.error || 'Failed to assign');
        setLoading(false);
        return;
      }

      setSuccess('Executive assigned!');
      setCreatedLead(null);
      setAssignData({ assignedTo: '', department: '', priority: 'Medium' });
      loadLeads();
    } catch (err) {
      setError('Failed to assign');
    } finally {
      setLoading(false);
    }
  };

  const handleAssignFromList = async (leadId) => {
    if (!assignData.assignedTo) {
      setError('Please select an executive');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/leads/${leadId}/assign`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify(assignData),
      });

      if (!res.ok) {
        const errData = await res.json();
        setError(errData.error || 'Failed to assign');
        setLoading(false);
        return;
      }

      setSuccess('Executive assigned!');
      setSelectedLead(null);
      setAssignData({ assignedTo: '', department: '', priority: 'Medium' });
      loadLeads();
    } catch (err) {
      setError('Failed to assign');
    } finally {
      setLoading(false);
    }
  };

  // ===== Download Leads as XLSX =====
  const handleDownloadXLSX = () => {
    const dataToExport = displayLeads.length > 0 ? displayLeads : allLeads;
    const rows = dataToExport.map((lead, idx) => ({
      'S.No': idx + 1,
      'Customer Name': lead.customerName || '',
      'Mobile': lead.mobile || '',
      'Loan Type': lead.loanType ? lead.loanType.replace(/_/g, ' ') : '',
      'Expected Amount': lead.expectedAmount ? `₹${parseInt(lead.expectedAmount).toLocaleString('en-IN')}` : '',
      'Assigned To': lead.assignedTo || '',
      'Banks': (lead.assignedBanks || []).join(', '),
      'Status': lead.status || '',
      'Is Active': lead.isActive !== false ? 'Yes' : 'No',
      'Priority': lead.priority || 'Medium',
      'Entry Date': lead.entryDate || lead.createdAt ? new Date(lead.entryDate || lead.createdAt).toLocaleDateString('en-IN') : '',
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Leads');

    // Auto-size columns
    const colWidths = Object.keys(rows[0] || {}).map(key => ({
      wch: Math.max(key.length, ...rows.map(r => String(r[key] || '').length)) + 2
    }));
    ws['!cols'] = colWidths;

    XLSX.writeFile(wb, `Leads_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  // Use allLeads for admin management view (shows everything), leads for current user/impersonation view
  const displayLeads = effectiveRole === 'admin' ? allLeads : leads;
  const unassignedLeads = displayLeads.filter(l => !l.assignedTo);
  const assignedLeads = displayLeads.filter(l => l.assignedTo);

  // Get available years from leads data for the year dropdown
  // Also compute lead counts per (year, month) for count badges
  const availableYears = new Set();
  const leadCountByPeriod = {}; // key: "YYYY-MM" -> count
  displayLeads.forEach(lead => {
    const dateStr = lead.entryDate || lead.createdAt;
    if (dateStr) {
      const d = new Date(dateStr);
      if (!isNaN(d.getTime())) {
        const year = String(d.getFullYear());
        const month = String(d.getMonth() + 1).padStart(2, '0');
        availableYears.add(year);
        const key = `${year}-${month}`;
        leadCountByPeriod[key] = (leadCountByPeriod[key] || 0) + 1;
      }
    }
  });
  const currentPeriodKey = `${yearFilter}-${monthFilter}`;
  const currentPeriodCount = leadCountByPeriod[currentPeriodKey] || 0;

  // Month names for display
  const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const filteredLeads = displayLeads.filter(lead => {
    const matchesSearch = !searchTerm ||
      lead.customerName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lead.mobile?.includes(searchTerm);
    const matchesStatus = !statusFilter || lead.status === statusFilter || (statusFilter === 'Inactive' && lead.isActive === false);

    // Month/Year filter
    let matchesMonth = true;
    const dateStr = lead.entryDate || lead.createdAt;
    if (dateStr) {
      const d = new Date(dateStr);
      if (!isNaN(d.getTime())) {
        const leadMonth = String(d.getMonth() + 1).padStart(2, '0');
        const leadYear = String(d.getFullYear());
        matchesMonth = leadMonth === monthFilter && leadYear === yearFilter;
      }
    } else {
      // If no date, don't show unless "All" is somehow selected (but we always have defaults)
      matchesMonth = false;
    }

    return matchesSearch && matchesStatus && matchesMonth;
  });



  return (
    <div className="py-6 sm:py-12 px-3 sm:px-6 min-h-screen bg-gradient-mesh">
      <div className="animate-fade-in-up">
      
      {/* HEADER SECTION */}
      <div className="mb-6 sm:mb-10 flex flex-col sm:flex-row gap-3 sm:gap-0 justify-between items-start sm:items-center max-w-6xl mx-auto">
        <div>
          <h1 className="text-2xl sm:text-4xl font-extrabold text-gray-900 tracking-tight">Leads Portal</h1>
          <p className="text-xs sm:text-base text-gray-500 font-medium mt-1">Unified lead capture and pipeline tracking system.</p>
        </div>
        
        {effectiveRole === 'admin' && (
          <button
            onClick={() => setShowBulkUpload(true)}
            className="px-4 sm:px-5 py-2.5 sm:py-3 rounded-2xl font-bold bg-emerald-600 text-white hover:bg-emerald-700 hover-lift shadow-lg shadow-emerald-500/20 transition-all flex items-center gap-2 text-sm sm:text-base"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            Bulk Upload
          </button>
        )}
        
        {/* Download XLSX - visible to both admin and executives */}
        <button
          onClick={handleDownloadXLSX}
          className="px-4 sm:px-5 py-2.5 sm:py-3 rounded-2xl font-bold bg-green-600 text-white hover:bg-green-700 hover-lift shadow-lg shadow-green-500/20 transition-all flex items-center gap-2 text-sm sm:text-base"
          title="Download all leads as Excel"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          Download XLSX
        </button>
      </div>

      {error && (
        <div className="bg-red-100 border border-red-300 text-red-700 px-4 sm:px-6 py-3 sm:py-4 rounded-2xl sm:rounded-3xl mb-6 sm:mb-8 max-w-6xl mx-auto shadow-sm animate-fade-in-up text-sm">
          {error}
        </div>
      )}
      {success && (
        <div className="bg-green-100 border border-green-300 text-green-700 px-4 sm:px-6 py-3 sm:py-4 rounded-2xl sm:rounded-3xl mb-6 sm:mb-8 max-w-6xl mx-auto shadow-sm animate-fade-in-up text-sm">
          {success}
        </div>
      )}

      {/* CENTRAL ACTION DASHBOARD CARDS */}
      <div className="grid md:grid-cols-2 gap-4 sm:gap-8 max-w-6xl mx-auto">
        
        {/* CARD 1: ADD NEW LEAD — visible to all roles */}
        <div className="glass-card p-8 rounded-3xl border border-white/40 shadow-xl flex flex-col justify-between hover-lift transition-all">
          <div>
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-r from-blue-500 to-indigo-600 flex items-center justify-center text-white mb-6 shadow-md shadow-blue-500/20">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="8.5" cy="7" r="4" />
                <line x1="20" y1="8" x2="20" y2="14" />
                <line x1="23" y1="11" x2="17" y2="11" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Add New Lead</h2>
            <p className="text-gray-500 leading-relaxed mb-6 font-medium">
              Manually capture new customer loan requirements, co-applicant parameters, and banks selection to calculate credit risk.
            </p>
          </div>
          <button
            onClick={() => { setShowAddModal(true); setError(''); setSuccess(''); }}
            className="w-full py-4 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-700 text-white font-bold hover:from-blue-700 hover:to-indigo-800 shadow-md shadow-blue-500/10 hover-lift transition-all"
          >
            Create Lead Form
          </button>
        </div>

        {/* CARD 2: MANAGE & ASSIGN LEADS — visible only to admin */}
        {effectiveRole === 'admin' && (
          <div className="glass-card p-8 rounded-3xl border border-white/40 shadow-xl flex flex-col justify-between hover-lift transition-all">
            <div>
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-r from-indigo-500 to-purple-600 flex items-center justify-center text-white mb-6 shadow-md shadow-indigo-500/20">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Manage Leads</h2>
              <p className="text-gray-500 leading-relaxed mb-6 font-medium">
                Assign pending leads to loan executives, view assigned files, and track real-time loan pipeline status.
              </p>
            </div>
            <button
              onClick={() => { setShowManageModal(true); setError(''); setSuccess(''); }}
              className="w-full py-4 rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-700 text-white font-bold hover:from-indigo-700 hover:to-purple-800 shadow-md shadow-indigo-500/10 hover-lift transition-all"
            >
              Open Management Queue ({unassignedLeads.length} Unassigned)
            </button>
          </div>
        )}

      </div>

      {/* LEADS PIPELINE GRID */}
      <div className="max-w-6xl mx-auto mt-10 sm:mt-14 pt-6 sm:pt-10 border-t border-gray-250/60">
        <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 items-start sm:items-center justify-between border-b pb-4 sm:pb-5 mb-6 sm:mb-8">
          <div>
            <h2 className="text-xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">Leads Pipeline</h2>
            <p className="text-xs sm:text-base text-gray-500 font-medium mt-1">Track and manage individual customer files and loan status cards.</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 w-full sm:w-auto">
            <input 
              type="text" 
              placeholder="Search leads by name or mobile..." 
              className="border border-gray-200 rounded-2xl px-4 sm:px-5 py-2.5 sm:py-3 text-sm bg-white focus:ring-2 focus:ring-blue-200 focus:outline-none transition-all shadow-sm w-full sm:w-72" 
              value={searchTerm} 
              onChange={(e) => setSearchTerm(e.target.value)} 
            />
            {/* Month filter */}
            <div className="relative">
              <select
                value={monthFilter}
                onChange={(e) => setMonthFilter(e.target.value)}
                className="border border-gray-200 rounded-2xl px-3 sm:px-4 py-2.5 sm:py-3 text-sm bg-white focus:ring-2 focus:ring-blue-200 focus:outline-none transition-all shadow-sm font-bold w-full sm:w-auto appearance-none pr-8"
              >
                {MONTH_NAMES.map((name, i) => {
                  const m = String(i + 1).padStart(2, '0');
                  const key = `${yearFilter}-${m}`;
                  const cnt = leadCountByPeriod[key] || 0;
                  return (
                    <option key={m} value={m}>
                      {name} {cnt > 0 ? `(${cnt})` : ''}
                    </option>
                  );
                })}
              </select>
              {/* Selected count badge */}
              {currentPeriodCount > 0 && (
                <div className="absolute -top-2 -right-2 sm:-top-2.5 sm:-right-2.5 bg-indigo-600 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 shadow-sm border-2 border-white pointer-events-none">
                  {currentPeriodCount}
                </div>
              )}
            </div>
            {/* Year filter */}
            <select
              value={yearFilter}
              onChange={(e) => setYearFilter(e.target.value)}
              className="border border-gray-200 rounded-2xl px-3 sm:px-4 py-2.5 sm:py-3 text-sm bg-white focus:ring-2 focus:ring-blue-200 focus:outline-none transition-all shadow-sm font-bold w-full sm:w-auto"
            >
              {[...availableYears].sort().map(year => {
                // Count leads for this year across all months
                const yearTotal = Object.entries(leadCountByPeriod)
                  .filter(([k]) => k.startsWith(year))
                  .reduce((sum, [, c]) => sum + c, 0);
                return (
                  <option key={year} value={year}>
                    {year} ({yearTotal})
                  </option>
                );
              })}
            </select>
            <select 
              className="border border-gray-200 rounded-2xl px-4 sm:px-5 py-2.5 sm:py-3 text-sm bg-white focus:ring-2 focus:ring-blue-200 focus:outline-none transition-all shadow-sm font-bold w-full sm:w-auto" 
              value={statusFilter} 
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">All Statuses</option>
              <option value="New">New</option>
              <option value="Assigned">Assigned</option>
              <option value="Processing">Processing</option>
              <option value="Sanctioned">Sanctioned</option>
              <option value="Partially Disbursed">Part. Disbursed</option>
              <option value="Disbursed">Disbursed</option>
              <option value="Rejected">Rejected</option>
              <option value="Closed">Closed</option>
              <option value="Inactive">Inactive</option>
            </select>
          </div>
        </div>

        {loading && leads.length === 0 ? (
          <div className="text-center py-16 font-bold text-gray-400 text-lg animate-pulse">Loading leads...</div>
        ) : filteredLeads.length === 0 ? (
          <div className="bg-white rounded-3xl border border-gray-150 p-16 text-center text-gray-400 font-bold shadow-sm text-lg">
            No leads found matching current criteria.
          </div>
        ) : (
          <div className="responsive-table border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
            <table className="w-full text-left">
              <thead className="bg-gray-50/70 border-b">
                <tr className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                  <th className="p-3 sm:p-4 text-center w-10">#</th>
                  <th className="p-3 sm:p-4">Customer</th>
                  <th className="p-3 sm:p-4 mobile-hide">Mobile</th>
                  <th className="p-3 sm:p-4 mobile-hide">Loan Type</th>
                  <th className="p-3 sm:p-4">Amount</th>
                  <th className="p-3 sm:p-4 mobile-hide">Banks</th>
                  <th className="p-3 sm:p-4">Status</th>
                  <th className="p-3 sm:p-4 mobile-hide">Entry Date</th>
                  {(effectiveRole === 'admin' || isImpersonating || effectiveRole === 'executive') && <th className="p-3 sm:p-4 text-center mobile-hide">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y text-sm">
                {filteredLeads.map((lead, idx) => (
                  <tr
                    key={lead.id}
                    onClick={() => handleViewLead(lead)}
                    className={`hover:bg-gray-50/40 transition-colors cursor-pointer ${lead.isActive === false ? 'bg-red-50/40 opacity-75' : ''}`}
                  >
                    <td className="p-3 sm:p-4 text-center text-gray-400 font-bold text-xs w-10" data-label="#">{idx + 1}</td>
                    <td className="p-3 sm:p-4" data-label="Customer">
                      <div className="flex flex-col">
                        <span className="text-gray-900 font-bold text-sm">{lead.customerName}</span>
                        <span className="text-xs text-gray-500 sm:hidden">{lead.mobile}</span>
                        {lead.hasCoapplicant && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-full mt-1.5 self-start shadow-sm">
                            👥 Co-applicant
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-3 sm:p-4 mobile-hide font-medium text-gray-600" data-label="Mobile">{lead.mobile}</td>
                    <td className="p-3 sm:p-4 mobile-hide" data-label="Loan Type">
                      <span className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase">
                        {lead.loanType?.replace('_', ' ') || 'N/A'}
                      </span>
                    </td>
                    <td className="p-3 sm:p-4 font-bold text-gray-900" data-label="Amount">₹{parseInt(lead.expectedAmount || 0).toLocaleString('en-IN')}</td>
                    <td className="p-3 sm:p-4 mobile-hide" data-label="Banks">
                      {lead.assignedBanks && lead.assignedBanks.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {lead.assignedBanks.map((bank, i) => {
                            let bankName, branchName;
                            const parts = bank.split(' - ');
                            bankName = parts[0];
                            branchName = parts.length > 1 ? parts.slice(1).join(' - ') : null;
                            return (
                            <span key={i} className="inline-flex items-center gap-1 bg-green-100 text-green-700 px-2 py-0.5 rounded-full text-xs font-medium">
                              {bankName}
                              {branchName && <span className="text-green-500">({branchName})</span>}
                              {(effectiveRole === 'admin' || isImpersonating) && (
                                <button
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    if (!window.confirm(`Remove "${bank}" from this lead?`)) return;
                                    try {
                                      const res = await fetch(`${API_BASE}/leads/${lead.id}/remove-bank`, {
                                        method: 'PUT',
                                        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ bankName: bank })
                                      });
                                      if (res.ok) {
                                        setSuccess(`"${bank}" removed!`);
                                        loadLeads();
                                      } else {
                                        const err = await res.json();
                                        setError(err.error || 'Failed to remove bank');
                                      }
                                    } catch (err) {
                                      setError('Failed to remove bank');
                                    }
                                  }}
                                  className="ml-0.5 text-green-500 hover:text-red-600 transition-colors"
                                  title={`Remove ${bank}`}
                                >
                                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                  </svg>
                                </button>
                              )}
                            </span>
                          );})}
                        </div>
                      ) : (
                        <span className="text-gray-400 text-xs">None</span>
                      )}
                    </td>
                    <td className="p-3 sm:p-4" data-label="Status"><StatusBadge status={lead.status} /></td>
                    <td className="p-3 sm:p-4 mobile-hide text-xs text-gray-500" data-label="Entry Date">
                      {lead.entryDate || lead.createdAt ? new Date(lead.entryDate || lead.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}
                    </td>
                    {(effectiveRole === 'admin' || isImpersonating || effectiveRole === 'executive') && (
                      <td className="p-3 sm:p-4 text-center mobile-hide min-w-[200px]" data-label="Actions">
                        <div className="flex items-center justify-end gap-1 sm:gap-1.5 flex-nowrap whitespace-nowrap">
                          <button
                            onClick={(e) => { e.stopPropagation(); setEditingLead(lead); setEditForm({...lead}); }}
                            className="px-2 sm:px-3 py-1.5 bg-blue-50 border border-blue-100 text-blue-700 rounded-lg text-xs font-bold hover:bg-blue-100 transition-colors"
                          >
                            Edit
                          </button>
                          {(effectiveRole === 'admin' || isImpersonating) && (
                            <>
                              <button
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  try {
                                    const res = await fetch(`${API_BASE}/leads/${lead.id}/toggle-active`, {
                                      method: 'PUT',
                                      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
                                    });
                                    if (res.ok) {
                                      setSuccess(`Lead ${lead.isActive === false ? 'restored' : 'marked inactive'} successfully`);
                                      loadLeads();
                                    } else {
                                      const err = await res.json();
                                      setError(err.error || 'Failed to toggle status');
                                    }
                                  } catch (err) {
                                    setError('Failed to toggle status');
                                  }
                                }}
                                className={`px-2 sm:px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                                  lead.isActive === false
                                    ? 'bg-green-50 border border-green-200 text-green-700 hover:bg-green-100'
                                    : 'bg-red-50 border border-red-200 text-red-700 hover:bg-red-100'
                                }`}
                              >
                                {lead.isActive === false ? 'Restore' : 'Inactive'}
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); setDeleteConfirm(lead); setDeleteReason(''); }}
                                className="px-2 sm:px-3 py-1.5 bg-red-50 border border-red-200 text-red-700 rounded-lg text-xs font-bold hover:bg-red-100 transition-colors"
                                title="Delete Lead"
                              >
                                Delete
                              </button>
                            </>
                          )}
                          {(effectiveRole === 'executive' && !isImpersonating) && (
                            <button
                              onClick={async (e) => {
                                e.stopPropagation();
                                const reason = window.prompt('Please provide a reason for delete request:');
                                if (reason === null) return;
                                try {
                                  const res = await fetch(`${API_BASE}/leads/${lead.id}/request-delete`, {
                                    method: 'POST',
                                    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ reason: reason || 'Not specified' })
                                  });
                                  if (res.ok) {
                                    setSuccess('Delete request submitted to admin for approval');
                                  } else {
                                    const err = await res.json();
                                    setError(err.error || 'Failed to submit delete request');
                                  }
                                } catch (err) {
                                  setError('Failed to submit delete request');
                                }
                              }}
                              className="px-2 sm:px-3 py-1.5 bg-red-50 border border-red-200 text-red-700 rounded-lg text-xs font-bold hover:bg-red-100 transition-colors"
                            >
                              Request Delete
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      </div>

      {/* =======================================================
          MODAL 1: ADD NEW LEAD POPUP FORM
          ======================================================= */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md overflow-y-auto flex justify-center items-start z-50 p-4 animate-fade-in">
          <div 
            className="bg-white rounded-3xl p-8 max-w-2xl w-full relative shadow-2xl animate-slide-up border border-gray-150 my-auto"
            style={{ maxHeight: '90vh', overflowY: 'auto' }}
          >
            {/* Close Button */}
            <button 
              onClick={() => { setShowAddModal(false); setCreatedLead(null); setError(''); setSuccess(''); }} 
              className="absolute top-5 right-5 p-2 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>

            <h2 className="text-2xl font-extrabold text-gray-900 mb-2">Create New Customer Lead</h2>
            <p className="text-gray-500 text-sm mb-6 font-semibold">Enter customer information to establish a new loan application file.</p>

            {/* Inner error alerts inside modal */}
            {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-2xl mb-5 text-sm">{error}</div>}
            {success && <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-2xl mb-5 text-sm">{success}</div>}

            <div className="space-y-5">
              <div className="grid md:grid-cols-2 gap-5">
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1 block">Customer Full Name *</label>
                  <input
                    type="text"
                    placeholder="Enter full name"
                    className={`border rounded-2xl px-4 py-3 w-full bg-gray-50/50 transition-all focus:ring-2 focus:ring-blue-200 ${fieldErrors.customerName ? 'border-red-500' : 'border-gray-200 focus:border-blue-500'}`}
                    value={formData.customerName}
                    onChange={handleNameChange}
                    maxLength={50}
                  />
                  {fieldErrors.customerName && <p className="text-red-500 text-xs mt-1 font-semibold">{fieldErrors.customerName}</p>}
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1 block">Mobile Number *</label>
                  <input
                    type="tel"
                    placeholder="10 digit number"
                    className={`border rounded-2xl px-4 py-3 w-full bg-gray-50/50 transition-all focus:ring-2 focus:ring-blue-200 ${fieldErrors.mobile ? 'border-red-500' : 'border-gray-200 focus:border-blue-500'}`}
                    value={formData.mobile}
                    onChange={handleMobileChange}
                    maxLength={10}
                  />
                  {fieldErrors.mobile && <p className="text-red-500 text-xs mt-1 font-semibold">{fieldErrors.mobile}</p>}
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-5">
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1 block">Loan Type Selection *</label>
                  <select
                    className={`border rounded-2xl px-4 py-3 w-full bg-gray-50/50 transition-all focus:ring-2 focus:ring-blue-200 ${fieldErrors.loanType ? 'border-red-500' : 'border-gray-200 focus:border-blue-500'}`}
                    value={formData.loanType}
                    onChange={(e) => { setFormData(p => ({ ...p, loanType: e.target.value })); setFieldErrors(prev => ({ ...prev, loanType: '' })); }}
                  >
                    <option value="">Select Loan Type</option>
                    {loanTypes.map(lt => (
                      <option key={lt.key} value={lt.key}>{lt.name}</option>
                    ))}
                  </select>
                  {fieldErrors.loanType && <p className="text-red-500 text-xs mt-1 font-semibold">{fieldErrors.loanType}</p>}
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1 block">Expected Amount (INR) *</label>
                  <input
                    type="text"
                    placeholder="Enter expected amount"
                    className={`border rounded-2xl px-4 py-3 w-full bg-gray-50/50 transition-all focus:ring-2 focus:ring-blue-200 ${fieldErrors.expectedAmount ? 'border-red-500' : 'border-gray-200 focus:border-blue-500'}`}
                    value={formData.expectedAmount}
                    onChange={handleAmountChange}
                  />
                  {fieldErrors.expectedAmount && <p className="text-red-500 text-xs mt-1 font-semibold">{fieldErrors.expectedAmount}</p>}
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1 block">Referral Code (Optional)</label>
                  <input
                    type="text"
                    placeholder="DSA referral code"
                    className="border rounded-2xl px-4 py-3 w-full bg-gray-50/50 transition-all focus:ring-2 focus:ring-blue-200 border-gray-200 focus:border-blue-500"
                    value={formData.referralCode || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, referralCode: e.target.value.toUpperCase() }))}
                  />
                </div>
              </div>



              <div className="pt-4 flex gap-4">
                <button 
                  onClick={handleSaveLead} 
                  disabled={loading} 
                  className="flex-1 bg-gradient-to-r from-blue-600 to-indigo-700 hover:from-blue-700 hover:to-indigo-850 text-white py-4 rounded-2xl font-bold disabled:opacity-50 hover-lift transition-all shadow-md shadow-blue-500/10"
                >
                  {loading ? 'Saving...' : 'Save Lead Details'}
                </button>
                <button 
                  onClick={() => { setShowAddModal(false); setCreatedLead(null); setError(''); setSuccess(''); }} 
                  className="px-6 py-4 rounded-2xl border border-gray-200 text-gray-700 font-bold hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
              </div>

              {/* Instant Executive Assignment nested inside Form popup */}
              {effectiveRole === 'admin' && createdLead && (
                <div className="bg-indigo-50/50 border border-indigo-200/50 rounded-2xl p-5 mt-6 animate-fade-in-up">
                  <h3 className="text-lg font-bold text-indigo-800 mb-3">Assign Directly to Executive</h3>
                  <div className="grid md:grid-cols-2 gap-4 mb-4">
                    <select className="border rounded-2xl px-4 py-3 bg-white font-semibold focus:ring-2 focus:ring-blue-100" value={assignData.assignedTo} onChange={(e) => setAssignData(p => ({...p, assignedTo: e.target.value}))}>
                      <option value="">Select Executive</option>
                      {executives.map(exec => <option key={exec.id} value={exec.name}>{exec.name}</option>)}
                    </select>
                    <select className="border rounded-2xl px-4 py-3 bg-white font-semibold focus:ring-2 focus:ring-blue-100" value={assignData.department} onChange={(e) => setAssignData(p => ({...p, department: e.target.value}))}>
                      <option value="">Department</option>
                      <option>Operations Team</option><option>Login Team</option><option>Sales Team</option><option>Credit Coordination</option>
                    </select>
                  </div>
                  <button onClick={handleAssignExecutive} disabled={loading} className="w-full bg-indigo-700 text-white py-3.5 rounded-2xl font-bold disabled:opacity-50 hover:bg-indigo-800 transition-colors">
                    Assign and Close
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* =======================================================
          MODAL 2: MANAGE & ASSIGN LEADS LISTING OVERLAY
          ======================================================= */}
      {showManageModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md overflow-y-auto flex justify-center items-start z-50 p-4 animate-fade-in">
          <div 
            className="bg-white rounded-3xl p-8 max-w-6xl w-full relative shadow-2xl animate-slide-up border border-gray-150 my-auto"
            style={{ maxHeight: '90vh', overflowY: 'auto' }}
          >
            {/* Close Button */}
            <button 
              onClick={() => { setShowManageModal(false); setError(''); setSuccess(''); }} 
              className="absolute top-5 right-5 p-2 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>

            <h2 className="text-2xl font-extrabold text-gray-900 mb-2">Manage Customer Leads</h2>
            <p className="text-gray-500 text-sm mb-6 font-semibold">Assign executives and monitor the active customer pipeline files.</p>

            {/* Inner alerts inside modal */}
            {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-2xl mb-5 text-sm">{error}</div>}
            {success && <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-2xl mb-5 text-sm">{success}</div>}

            <div className="space-y-8">
              
              {/* UNASSIGNED LEADS QUEUE */}
              <div>
                <div className="flex items-center justify-between mb-4 border-b pb-2">
                  <h3 className="text-xl font-bold text-amber-800 flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse"></span>
                    Unassigned Leads ({unassignedLeads.length})
                  </h3>
                </div>

                {unassignedLeads.length > 0 ? (
                  <div className="border border-gray-150 rounded-2xl overflow-hidden shadow-sm">
                    <table className="w-full text-left">
                      <thead className="bg-gray-50/70 border-b">
                        <tr className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                          <th className="p-4">Customer</th><th className="p-4">Mobile</th><th className="p-4">Loan Type</th><th className="p-4">Amount</th><th className="p-4">Status</th>{effectiveRole === 'admin' && <th className="p-4 text-center">Action</th>}
                        </tr>
                      </thead>
                      <tbody className="divide-y text-sm">
                        {unassignedLeads.map(lead => (
                          <tr key={lead.id} className="hover:bg-gray-50/40 transition-colors">
                            <td className="p-4">
                              <div className="flex flex-col">
                                <span className="text-gray-900 font-bold">{lead.customerName}</span>
                                {lead.hasCoapplicant && (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-full mt-1.5 self-start shadow-sm shadow-indigo-500/5">
                                    👥 Co-applicant: {lead.coapplicantName}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="p-4 font-medium text-gray-600">{lead.mobile}</td>
                            <td className="p-4 text-gray-650 capitalize font-medium">{lead.loanType?.replace('_', ' ')}</td>
                            <td className="p-4 font-bold text-gray-900">₹{parseInt(lead.expectedAmount).toLocaleString('en-IN')}</td>
                            <td className="p-4"><StatusBadge status={lead.status} /></td>
                            {effectiveRole === 'admin' && (
                              <td className="p-4 text-center">
                                <button 
                                  onClick={() => setSelectedLead(lead.id)} 
                                  className="px-4 py-2 rounded-xl text-blue-700 font-bold bg-blue-50 border border-blue-100 hover:bg-blue-150 transition-colors shadow-sm"
                                >
                                  Assign
                                </button>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="p-6 border border-dashed rounded-2xl text-center text-gray-400 bg-gray-50/50 font-semibold">
                    No unassigned leads found in the queue.
                  </div>
                )}
              </div>

              {/* ASSIGNED LEADS QUEUE */}
              <div>
                <div className="flex items-center justify-between mb-4 border-b pb-2">
                  <h3 className="text-xl font-bold text-emerald-800 flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                    Assigned Leads ({assignedLeads.length})
                  </h3>
                </div>

                {assignedLeads.length > 0 ? (
                  <div className="border border-gray-150 rounded-2xl overflow-hidden shadow-sm">
                    <table className="w-full text-left">
                      <thead className="bg-gray-50/70 border-b">
                        <tr className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                          <th className="p-4">Customer</th><th className="p-4">Mobile</th><th className="p-4">Loan Type</th><th className="p-4">Amount</th><th className="p-4">Assigned Executive</th><th className="p-4">Department</th><th className="p-4">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y text-sm">
                        {assignedLeads.map(lead => (
                          <tr key={lead.id} className="hover:bg-gray-50/40 transition-colors">
                            <td className="p-4">
                              <div className="flex flex-col">
                                <span className="text-gray-900 font-bold">{lead.customerName}</span>
                                {lead.hasCoapplicant && (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-full mt-1.5 self-start shadow-sm">
                                    👥 Co-applicant: {lead.coapplicantName}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="p-4 font-medium text-gray-600">{lead.mobile}</td>
                            <td className="p-4 text-gray-650 capitalize font-medium">{lead.loanType?.replace('_', ' ')}</td>
                            <td className="p-4 font-bold text-gray-900">₹{parseInt(lead.expectedAmount).toLocaleString('en-IN')}</td>
                            <td className="p-4 font-extrabold text-blue-750">{lead.assignedTo}</td>
                            <td className="p-4 text-gray-600 font-medium">{lead.department}</td>
                            <td className="p-4"><StatusBadge status={lead.status} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="p-6 border border-dashed rounded-2xl text-center text-gray-400 bg-gray-50/50 font-semibold">
                    No assigned leads found.
                  </div>
                )}
              </div>

            </div>

            <div className="mt-8 pt-4 border-t flex justify-end">
              <button 
                onClick={() => { setShowManageModal(false); setError(''); setSuccess(''); }} 
                className="px-6 py-3 rounded-2xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold transition-colors"
              >
                Close Queue
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =======================================================
          NESTED ASSIGNMENT MODAL (Inside leads lists)
          ======================================================= */}
      {selectedLead && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm overflow-y-auto flex justify-center items-start p-4 animate-fade-in" style={{ zIndex: 60 }}>
          <div className="bg-white rounded-3xl p-6 max-w-md w-full relative shadow-2xl animate-slide-up border border-gray-150 my-auto">
            <h3 className="text-xl font-bold text-gray-900 mb-2">Assign Loan File</h3>
            <p className="text-gray-500 text-sm mb-5 font-semibold">Choose an available executive and department to route this file.</p>
            
            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Loan Executive *</label>
                <select className="border rounded-2xl px-4 py-3 w-full bg-gray-50 focus:ring-2 focus:ring-blue-200 focus:border-blue-500 transition-all" value={assignData.assignedTo} onChange={(e) => setAssignData(p => ({...p, assignedTo: e.target.value}))}>
                  <option value="">Select Executive</option>
                  {executives.map(exec => <option key={exec.id} value={exec.name}>{exec.name}</option>)}
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Department Assignment *</label>
                <select className="border rounded-2xl px-4 py-3 w-full bg-gray-50 focus:ring-2 focus:ring-blue-200 focus:border-blue-500 transition-all" value={assignData.department} onChange={(e) => setAssignData(p => ({...p, department: e.target.value}))}>
                  <option value="">Select Department</option>
                  <option>Operations Team</option><option>Login Team</option><option>Sales Team</option><option>Credit Coordination</option>
                </select>
              </div>
            </div>
            
            <div className="flex gap-4 mt-6">
              <button onClick={() => setSelectedLead(null)} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-750 px-6 py-3 rounded-2xl font-bold transition-colors">Cancel</button>
              <button onClick={() => handleAssignFromList(selectedLead)} disabled={loading} className="flex-1 bg-blue-700 text-white px-6 py-3 rounded-2xl font-bold hover:bg-blue-800 disabled:opacity-50 hover-lift transition-all shadow-md shadow-blue-500/10">
                {loading ? 'Assigning...' : 'Assign File'}
              </button>
            </div>
          </div>
        </div>
      )}            {/* VIEW LEAD DETAILS MODAL */}
      {viewLead && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md overflow-y-auto flex justify-center items-start z-50 p-4 animate-fade-in" onClick={() => { setViewLead(null); setSanctionLetterUrl(null); setShowStatusHistory(false); }}>
          <div className="bg-white rounded-3xl p-8 max-w-2xl w-full relative shadow-2xl border border-gray-150 animate-slide-up my-auto" style={{ maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <button onClick={() => { setViewLead(null); setSanctionLetterUrl(null); setShowStatusHistory(false); }} className="absolute top-5 right-5 p-2 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>

            <h2 className="text-2xl font-extrabold text-gray-900 mb-2">Lead Detail Profile</h2>
            <p className="text-gray-500 text-sm mb-6 font-semibold">In-depth loan parameters, verification checklist, and assignment details.</p>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100">
                <p className="text-xs uppercase font-bold text-gray-400">Customer Name</p>
                <p className="font-extrabold text-gray-900 text-lg mt-1">{viewLead.customerName}</p>
              </div>
              <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100">
                <p className="text-xs uppercase font-bold text-gray-400">Mobile Number</p>
                <p className="font-extrabold text-gray-900 text-lg mt-1">{viewLead.mobile}</p>
              </div>
              <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100">
                <p className="text-xs uppercase font-bold text-gray-400">Loan Type</p>
                <p className="font-bold text-gray-800 mt-1 capitalize">{viewLead.loanType?.replace('_', ' ') || 'N/A'}</p>
              </div>
              <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100">
                <p className="text-xs uppercase font-bold text-gray-400">Expected Amount</p>
                <p className="font-bold text-gray-800 mt-1">₹{parseInt(viewLead.expectedAmount || 0).toLocaleString('en-IN')}</p>
              </div>
              <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100">
                <p className="text-xs uppercase font-bold text-gray-400">Executive Assigned</p>
                <p className="font-bold text-gray-800 mt-1">{viewLead.assignedTo || 'Unassigned'}</p>
              </div>
              <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100">
                <p className="text-xs uppercase font-bold text-gray-400">Department</p>
                <p className="font-bold text-gray-800 mt-1">{viewLead.department || 'N/A'}</p>
              </div>
              <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100">
                <p className="text-xs uppercase font-bold text-gray-400">Priority Level</p>
                <p className="font-bold text-gray-800 mt-1">{viewLead.priority || 'Medium'}</p>
              </div>
              <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100">
                <p className="text-xs uppercase font-bold text-gray-400">Lead Status Badge</p>
                <div className="mt-1"><StatusBadge status={viewLead.status} /></div>
              </div>
              <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100">
                <p className="text-xs uppercase font-bold text-gray-400">Date of Entry</p>
                <p className="font-bold text-gray-800 mt-1">{viewLead.entryDate || viewLead.createdAt ? new Date(viewLead.entryDate || viewLead.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'N/A'}</p>
              </div>
            </div>

            {viewLead.hasCoapplicant && (
              <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-5 mt-4">
                <h4 className="font-extrabold text-indigo-900 text-sm mb-2 uppercase tracking-wide">Co-applicant Parameters</h4>
                <div className="grid md:grid-cols-2 gap-4 text-sm text-indigo-950 font-semibold">
                  <div>Name: <span className="font-bold">{viewLead.coapplicantName}</span></div>
                  <div>Income Source: <span className="font-bold capitalize">{viewLead.coapplicantIncomeSource?.replace('_', ' ')}</span></div>
                </div>
              </div>
            )}

            {viewLead.remarks && (
              <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100 mt-4">
                <p className="text-xs uppercase font-bold text-gray-400 mb-1">Remarks & Details</p>
                <p className="font-medium text-gray-700 text-sm">{viewLead.remarks}</p>
              </div>
            )}

            {/* Assigned Banks with Branch Names */}
            {(viewLead.bankDetails && viewLead.bankDetails.length > 0) && (
              <div className="bg-blue-50/50 border border-blue-100 rounded-2xl p-5 mt-4">
                <h4 className="font-extrabold text-blue-900 text-sm mb-2 uppercase tracking-wide flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                  Assigned Banks & Branches
                </h4>
                <div className="flex flex-wrap gap-2 mt-1">
                  {viewLead.bankDetails.map((bank, i) => (
                    <span key={i} className="inline-flex items-center gap-1 bg-white border border-blue-200 rounded-xl px-3 py-2 text-sm">
                      {bank.bankName}
                      {bank.branchName && (
                        <span className="text-blue-500 text-xs font-medium">({bank.branchName})</span>
                      )}
                      {bank.status && (
                        <span className="ml-1"><StatusBadge status={bank.status} /></span>
                      )}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Close Lead Button (only for Disbursed leads) */}
            {viewLead.status === 'Disbursed' && !viewLead.isClosed && (
              <div className="bg-purple-50 border border-purple-200 rounded-2xl p-5 mt-4">
                <h4 className="font-extrabold text-purple-900 text-sm mb-2 uppercase tracking-wide">Close Lead</h4>
                <p className="text-sm text-purple-700 mb-3">This lead has been fully disbursed. You can close it to mark it as completed.</p>
                <div className="flex gap-3">
                  {showCloseConfirm ? (
                    <>
                      <button
                        onClick={() => handleCloseLead(viewLead.id)}
                        className="px-5 py-2.5 bg-purple-700 text-white rounded-xl font-bold text-sm hover:bg-purple-800 transition-all"
                      >
                        Confirm Close
                      </button>
                      <button
                        onClick={() => setShowCloseConfirm(false)}
                        className="px-5 py-2.5 bg-gray-200 text-gray-700 rounded-xl font-bold text-sm hover:bg-gray-300 transition-all"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => setShowCloseConfirm(true)}
                      className="px-5 py-2.5 bg-purple-600 text-white rounded-xl font-bold text-sm hover:bg-purple-700 transition-all flex items-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                        <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Close This Lead
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Status History Timeline */}
            {statusHistory.length > 0 && (
              <div className="bg-gray-50 border border-gray-100 rounded-2xl p-5 mt-4">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="font-extrabold text-gray-900 text-sm uppercase tracking-wide flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="12 6 12 12 16 14" />
                    </svg>
                    Status History
                  </h4>
                  <button
                    onClick={() => setShowStatusHistory(!showStatusHistory)}
                    className="text-xs font-bold text-blue-600 hover:text-blue-800"
                  >
                    {showStatusHistory ? 'Hide' : 'Show All'} ({statusHistory.length})
                  </button>
                </div>
                <div className="space-y-0">
                  {(showStatusHistory ? statusHistory : statusHistory.slice(-3)).map((entry, index) => (
                    <div key={entry.id} className="relative flex items-start gap-4 pb-4 pl-6">
                      {index < (showStatusHistory ? statusHistory : statusHistory.slice(-3)).length - 1 && (
                        <div className="absolute left-[7px] top-3 bottom-0 w-0.5 bg-gray-200" />
                      )}
                      <div className={`absolute left-0 top-1.5 w-3.5 h-3.5 rounded-full border-2 ${
                        entry.isCurrent ? 'bg-blue-500 border-blue-500' : 'bg-white border-gray-300'
                      }`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                            entry.isCurrent ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
                          }`}>
                            {entry.new_status}
                          </span>
                          {entry.duration && (
                            <span className="text-[10px] font-semibold text-gray-400">
                              Duration: {entry.duration}
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-gray-400 mt-0.5">
                          {new Date(entry.changed_at).toLocaleString('en-IN', {
                            day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
                          })}
                          {entry.changed_by && ` by ${entry.changed_by}`}
                        </p>
                        {entry.notes && (
                          <p className="text-xs text-gray-500 mt-0.5">{entry.notes}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {viewLead.status === 'Sanctioned' && (
              <div className="bg-emerald-50 border border-emerald-150 rounded-2xl p-5 mt-4">
                <h4 className="font-extrabold text-emerald-950 text-sm mb-2 uppercase tracking-wide">Approved Sanction Letter</h4>
                {loadingLetter ? (
                  <p className="text-xs font-bold text-gray-400">Retrieving sanction letter URL...</p>
                ) : sanctionLetterUrl ? (
                  <button
                    onClick={() => handleDownloadSanctionLetter(viewLead.id)}
                    className="inline-flex items-center gap-2 text-blue-700 hover:text-blue-900 font-bold text-sm hover-lift transition-all"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Download Sanction Letter PDF
                  </button>
                ) : (
                  <p className="text-xs font-bold text-gray-500">No sanction letter uploaded by executive yet.</p>
                )}
              </div>
            )}

            <button
              onClick={() => { setViewLead(null); setSanctionLetterUrl(null); }}
              className="w-full mt-6 py-4 rounded-2xl bg-gray-100 hover:bg-gray-200 text-gray-750 font-bold transition-all hover-lift shadow-sm"
            >
              Close Profile
            </button>
          </div>
        </div>
      )}

      {/* DELETE LEAD CONFIRMATION MODAL */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-50 p-4" onClick={() => { if (!deletingLead) setDeleteConfirm(null); }}>
          <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                <svg className="w-6 h-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-900">Delete Lead</h3>
                <p className="text-sm text-gray-500">This action cannot be undone</p>
              </div>
            </div>
            <p className="text-gray-600 mb-4">
              Are you sure you want to delete <strong>{deleteConfirm.customerName}</strong>?
              All related documents and records will be permanently removed.
            </p>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Reason for deletion</label>
              <textarea
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                placeholder="Enter reason for deletion..."
                rows={2}
                className="w-full border border-gray-300 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-red-500 outline-none resize-none"
                disabled={deletingLead}
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => { setDeleteConfirm(null); setDeleteReason(''); }}
                disabled={deletingLead}
                className="flex-1 px-4 py-2.5 border border-gray-300 rounded-xl text-gray-700 hover:bg-gray-50 disabled:opacity-50 font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteLead(deleteConfirm.id, deleteReason)}
                disabled={deletingLead}
                className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-xl font-semibold hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {deletingLead ? (
                  <>
                    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Deleting...
                  </>
                ) : (
                  'Yes, Delete Lead'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EDIT LEAD DETAILS MODAL */}
      {editingLead && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md overflow-y-auto flex justify-center items-start z-50 p-4 animate-fade-in" onClick={() => setEditingLead(null)}>
          <div className="bg-white rounded-3xl p-8 max-w-2xl w-full relative shadow-2xl border border-gray-150 animate-slide-up my-auto" onClick={e => e.stopPropagation()} style={{ maxHeight: '90vh', overflowY: 'auto' }}>
            <button onClick={() => setEditingLead(null)} className="absolute top-5 right-5 p-2 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>

            <h2 className="text-xl font-extrabold text-gray-900 mb-2">Edit Customer Lead</h2>
            <p className="text-gray-500 text-sm mb-5 font-semibold">Modify all customer loan details, co-applicant info, and status.</p>

            <div className="space-y-5">
              {/* Admin sees all fields; executive sees only File Status + Bank Assignment */}
              {(effectiveRole === 'admin' && !isImpersonating) && (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div>
                      <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Customer Full Name</label>
                      <input
                        type="text"
                        className="w-full border border-gray-200 rounded-2xl px-4 py-3 bg-gray-50/50 focus:ring-2 focus:ring-blue-200 focus:outline-none transition-all font-semibold"
                        value={editForm.customerName || ''}
                        onChange={e => setEditForm({...editForm, customerName: e.target.value.replace(/[0-9]/g, '')})}
                        maxLength={50}
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Mobile Number</label>
                      <input
                        type="text"
                        className="w-full border border-gray-200 rounded-2xl px-4 py-3 bg-gray-50/50 focus:ring-2 focus:ring-blue-200 focus:outline-none transition-all font-semibold"
                        value={editForm.mobile || ''}
                        onChange={e => setEditForm({...editForm, mobile: e.target.value.replace(/\D/g, '').slice(0, 10)})}
                        maxLength={10}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div>
                      <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Loan Type</label>
                      <select
                        className="w-full border border-gray-200 rounded-2xl px-4 py-3 bg-gray-50/50 focus:ring-2 focus:ring-blue-200 focus:outline-none transition-all font-bold"
                        value={editForm.loanType || ''}
                        onChange={e => setEditForm({...editForm, loanType: e.target.value})}
                      >
                        <option value="">Select Loan Type</option>
                        {loanTypes.map(lt => (
                          <option key={lt.key} value={lt.key}>{lt.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div>
                      <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Expected Amount (INR)</label>
                      <input
                        type="text"
                        className="w-full border border-gray-200 rounded-2xl px-4 py-3 bg-gray-50/50 focus:ring-2 focus:ring-blue-200 focus:outline-none transition-all font-semibold"
                        value={editForm.expectedAmount || ''}
                        onChange={e => setEditForm({...editForm, expectedAmount: e.target.value.replace(/\D/g, '')})}
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Referral Code (Optional)</label>
                      <input
                        type="text"
                        className="w-full border border-gray-200 rounded-2xl px-4 py-3 bg-gray-50/50 focus:ring-2 focus:ring-blue-200 focus:outline-none transition-all font-semibold uppercase"
                        value={editForm.referralCode || ''}
                        onChange={e => setEditForm({...editForm, referralCode: e.target.value.toUpperCase()})}
                        placeholder="DSA referral code"
                      />
                    </div>
                  </div>

                  {/* Co-applicant Section */}
                  <div className="border-t pt-4 mt-2">
                    <label className="flex items-center gap-3 cursor-pointer select-none group mb-4">
                      <input
                        type="checkbox"
                        className="w-5 h-5 rounded-lg border-gray-300 text-blue-700 focus:ring-blue-500 cursor-pointer group-hover:scale-105 transition-all"
                        checked={editForm.hasCoapplicant || false}
                        onChange={(e) => setEditForm({...editForm, hasCoapplicant: e.target.checked, coapplicantName: e.target.checked ? (editForm.coapplicantName || '') : ''})}
                      />
                      <span className="font-bold text-gray-700 text-base group-hover:text-blue-700 transition-colors">
                        Co-applicant for this loan
                      </span>
                    </label>

                    {editForm.hasCoapplicant && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 p-5 bg-gradient-to-r from-blue-50/60 to-indigo-50/40 rounded-2xl border border-blue-100/50 animate-fade-in-up">
                        <div>
                          <label className="text-xs font-bold text-gray-600 uppercase mb-1.5 block">Co-applicant Name</label>
                          <input
                            type="text"
                            className="w-full border border-gray-200 rounded-2xl px-4 py-3 bg-white focus:ring-2 focus:ring-blue-200 focus:outline-none transition-all font-semibold"
                            value={editForm.coapplicantName || ''}
                            onChange={e => setEditForm({...editForm, coapplicantName: e.target.value.replace(/[0-9]/g, '')})}
                            placeholder="Co-applicant Full Name"
                            maxLength={50}
                          />
                        </div>
                        <div>
                          <label className="text-xs font-bold text-gray-600 uppercase mb-1.5 block">Co-applicant Income Source</label>
                          <select
                            className="w-full border border-gray-200 rounded-2xl px-4 py-3 bg-white focus:ring-2 focus:ring-blue-200 focus:outline-none transition-all font-bold"
                            value={editForm.coapplicantIncomeSource || 'salaried'}
                            onChange={e => setEditForm({...editForm, coapplicantIncomeSource: e.target.value})}
                          >
                            <option value="salaried">Salaried</option>
                            <option value="non_salaried">Self employed</option>
                          </select>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">File Status</label>
                <select
                  className="w-full border border-gray-200 rounded-2xl px-4 py-3 bg-gray-50/50 focus:ring-2 focus:ring-blue-200 focus:outline-none transition-all font-extrabold text-blue-900"
                  value={editForm.status || 'New'}
                  onChange={e => setEditForm({...editForm, status: e.target.value})}
                >
                  <option>New</option>
                  <option>Assigned</option>
                  <option>Processing</option>
                  <option>Sanctioned</option>
                  <option>Partially Disbursed</option>
                  <option>Disbursed</option>
                  <option>Rejected</option>
                </select>
              </div>
              {/* Bank Assignment Section with Branch Name */}
              <div className="border-t pt-4 mt-2">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 block">Manage Assigned Banks</label>
                
                {/* Current assigned banks with Remove buttons */}
                {editForm.assignedBanks && editForm.assignedBanks.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-3">
                    {editForm.assignedBanks.map((bank, i) => {
                      let bankName, branchName;
                      // Try bankDetails first, then parse from string
                      if (editForm.bankDetails?.[i]?.branchName) {
                        bankName = editForm.bankDetails[i].bankName || bank;
                        branchName = editForm.bankDetails[i].branchName;
                      } else {
                        const parts = bank.split(' - ');
                        bankName = parts[0];
                        branchName = parts.length > 1 ? parts.slice(1).join(' - ') : null;
                      }
                      return (
                      <span key={i} className="inline-flex items-center gap-1 bg-green-100 text-green-700 px-3 py-1 rounded-full text-xs font-medium">
                        {bankName}
                        {branchName && <span className="text-green-500 ml-1">({branchName})</span>}
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            if (!window.confirm(`Remove "${bank}" from this lead?`)) return;
                            try {
                              const res = await fetch(`${API_BASE}/leads/${editingLead.id}/remove-bank`, {
                                method: 'PUT',
                                headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
                                body: JSON.stringify({ bankName: bank })
                              });
                              if (res.ok) {
                                const data = await res.json();
                                setSuccess(`"${bank}" removed!`);
                                setEditForm(prev => ({ ...prev, assignedBanks: (prev.assignedBanks || []).filter(b => b !== bank), status: data.lead?.status || prev.status }));
                                loadLeads();
                              } else {
                                const err = await res.json();
                                setError(err.error || 'Failed to remove bank');
                              }
                            } catch (err) {
                              setError('Failed to remove bank');
                            }
                          }}
                          className="ml-0.5 text-green-500 hover:text-red-600 transition-colors"
                          title={`Remove ${bank}`}
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </span>
                    );})}
                  </div>
                )}

                {/* Bank assignment dropdown + branch name + button */}
                <div className="flex flex-col gap-2">
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <select
                        className="w-full border border-gray-200 rounded-2xl px-4 py-3 bg-gray-50/50 focus:ring-2 focus:ring-blue-200 focus:outline-none transition-all font-bold text-sm"
                        value={editForm._newBankSelection || ''}
                        onChange={e => setEditForm({...editForm, _newBankSelection: e.target.value, _customBankName: e.target.value === 'Other' ? '' : (editForm._customBankName || '')})}
                      >
                        <option value="">— Select Bank —</option>
                        {ALL_BANKS.map(bank => (
                          <option key={bank} value={bank}>{bank}</option>
                        ))}
                      </select>
                      {editForm._newBankSelection === 'Other' && (
                        <input
                          type="text"
                          placeholder="Type custom bank name..."
                          className="w-full border border-gray-200 rounded-2xl px-4 py-2.5 bg-gray-50/50 focus:ring-2 focus:ring-blue-200 focus:outline-none transition-all font-semibold text-sm mt-2"
                          value={editForm._customBankName || ''}
                          onChange={e => setEditForm({...editForm, _customBankName: e.target.value})}
                        />
                      )}
                    </div>
                    <button
                      onClick={async () => {
                        const selectedBank = editForm._newBankSelection === 'Other'
                          ? (editForm._customBankName || '').trim()
                          : editForm._newBankSelection;
                        if (!selectedBank || !editingLead) {
                          setError('Please select or type a bank name');
                          return;
                        }
                        try {
                          const res = await fetch(`${API_BASE}/leads/${editingLead.id}/assign-bank`, {
                            method: 'PUT',
                            headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              bankName: selectedBank,
                              branchName: editForm._newBranchName || null
                            })
                          });
                          if (res.ok) {
                            const data = await res.json();
                            setSuccess(`Bank "${selectedBank}" assigned!`);
                            setEditForm(prev => ({
                              ...prev,
                              assignedBanks: [...(prev.assignedBanks || []), selectedBank],
                              status: data.lead?.status || prev.status,
                              _newBankSelection: '',
                              _customBankName: '',
                              _newBranchName: ''
                            }));
                            loadLeads();
                          } else {
                            const err = await res.json();
                            setError(err.error || 'Failed to assign bank');
                          }
                        } catch (err) {
                          setError('Failed to assign bank');
                        }
                      }}
                      disabled={!editForm._newBankSelection || (editForm._newBankSelection === 'Other' && !(editForm._customBankName || '').trim())}
                      className={`px-4 py-3 rounded-2xl font-bold transition-all whitespace-nowrap ${
                        editForm._newBankSelection && !(editForm._newBankSelection === 'Other' && !(editForm._customBankName || '').trim())
                          ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-md'
                          : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                      }`}
                    >
                      Assign
                    </button>
                  </div>
                  {/* Branch Name Input - appears when a bank is selected */}
                  {editForm._newBankSelection && (
                    <div className="bg-blue-50 border border-blue-100 rounded-xl p-3">
                      <label className="text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5 block">
                        Branch Name <span className="text-gray-400 font-normal normal-case">(optional)</span>
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Andheri Main Branch, MG Road Branch..."
                        className="w-full border border-gray-200 rounded-xl px-4 py-2.5 bg-white focus:ring-2 focus:ring-blue-200 focus:outline-none transition-all font-semibold text-sm"
                        value={editForm._newBranchName || ''}
                        onChange={e => setEditForm({...editForm, _newBranchName: e.target.value})}
                      />
                      <p className="text-[10px] text-gray-400 mt-1">Branch details will appear in lead details and shared checklists.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex gap-4 mt-6">
              <button onClick={() => setEditingLead(null)} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-750 px-6 py-3 rounded-2xl font-bold transition-all hover-lift">Cancel</button>
              <button
                onClick={async () => {
                  try {
                    const updateBody = { status: editForm.status };
                    if (effectiveRole === 'admin' && !isImpersonating) {
                      updateBody.customerName = editForm.customerName;
                      updateBody.mobile = editForm.mobile;
                      updateBody.loanType = editForm.loanType;
                      updateBody.expectedAmount = editForm.expectedAmount;
                      updateBody.referralCode = editForm.referralCode;
                      updateBody.hasCoapplicant = editForm.hasCoapplicant || false;
                      updateBody.coapplicantName = editForm.coapplicantName || '';
                      updateBody.coapplicantIncomeSource = editForm.coapplicantIncomeSource || 'salaried';
                    }
                    const res = await fetch(`${API_BASE}/leads/${editingLead.id}`, {
                      method: 'PUT',
                      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
                      body: JSON.stringify(updateBody)
                    });
                    if (res.ok) {
                      setLeads(leads.map(l => l.id === editingLead.id ? {...l, ...editForm} : l));
                      setEditingLead(null);
                      setSuccess('Lead updated successfully!');
                      loadLeads();
                    } else {
                      const errData = await res.json();
                      setError(errData.error || 'Failed to update lead');
                    }
                  } catch (err) {
                    setError('Failed to update lead');
                  }
                }}
                className="flex-1 bg-blue-700 text-white px-6 py-3 rounded-2xl font-bold hover:bg-blue-800 hover-lift transition-all shadow-md shadow-blue-500/10"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BULK UPLOAD MODAL COMPONENT */}
      <BulkUploadModal
        isOpen={showBulkUpload}
        onClose={() => setShowBulkUpload(false)}
        onComplete={() => loadLeads()}
      />
    </div>
  );
}