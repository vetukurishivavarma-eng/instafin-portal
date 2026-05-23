import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import StatusBadge from '../components/StatusBadge';
import BulkUploadModal from '../components/BulkUploadModal';
import API_BASE from '../config/api';

export default function LeadEntryPage() {
  const { isAdmin, accessToken } = useAuth();
  
  // Modal Triggers
  const [showAddModal, setShowAddModal] = useState(false);
  const [showManageModal, setShowManageModal] = useState(false);
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const [selectedLead, setSelectedLead] = useState(null);

  const [formData, setFormData] = useState({
    customerName: '',
    mobile: '',
    loanType: '',
    loanStatus: '',
    incomeSource: '',
    residentType: '',
    businessType: '',
    expectedAmount: '',
    referralCode: '',
    assignedBanks: [],
    hasCoapplicant: false,
    coapplicantName: '',
    coapplicantIncomeSource: 'salaried'
  });
  const [fieldErrors, setFieldErrors] = useState({});
  const [assignData, setAssignData] = useState({
    assignedTo: '',
    department: '',
    priority: 'Medium'
  });
  const [executives, setExecutives] = useState([]);
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [createdLead, setCreatedLead] = useState(null);

  useEffect(() => {
    if (!accessToken) return;
    fetch(`${API_BASE}/leads/meta/executives`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    })
      .then(r => r.json())
      .then(data => setExecutives(data))
      .catch(() => {});
    loadLeads();
  }, [accessToken]);

  const loadLeads = () => {
    fetch(`${API_BASE}/leads`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    })
      .then(r => r.json())
      .then(data => setLeads(data.data || []))
      .catch(() => {});
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

  const validateLoanStatus = (loanStatus) => {
    if (!loanStatus) return 'Please select a loan status';
    return '';
  };

  const validateIncomeSource = (incomeSource) => {
    if (!incomeSource) return 'Please select an income source';
    return '';
  };

  const validateResidentType = (residentType) => {
    if (!residentType) return 'Please select a resident type';
    return '';
  };

  const validateBusinessType = (businessType, incomeSource) => {
    if (incomeSource === 'non_salaried' && !businessType) return 'Please select a business type';
    return '';
  };

  const validateCoapplicantName = (name, hasCo) => {
    if (!hasCo) return '';
    if (!name || !name.trim()) return 'Co-applicant name is required';
    if (/[0-9]/.test(name)) return 'Name cannot contain numbers';
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
      loanStatus: validateLoanStatus(formData.loanStatus),
      incomeSource: validateIncomeSource(formData.incomeSource),
      residentType: validateResidentType(formData.residentType),
      businessType: validateBusinessType(formData.businessType, formData.incomeSource),
      coapplicantName: validateCoapplicantName(formData.coapplicantName, formData.hasCoapplicant)
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
        body: JSON.stringify(formData),
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
        loanStatus: '', 
        incomeSource: '', 
        residentType: '', 
        businessType: '', 
        expectedAmount: '', 
        referralCode: '', 
        assignedBanks: [],
        hasCoapplicant: false,
        coapplicantName: '',
        coapplicantIncomeSource: 'salaried'
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

  const unassignedLeads = leads.filter(l => !l.assignedTo);
  const assignedLeads = leads.filter(l => l.assignedTo);

  if (!isAdmin) {
    return (
      <div className="py-12 px-6">
        <div className="bg-red-50 border border-red-200 rounded-3xl p-8 text-center max-w-lg mx-auto shadow-xl">
          <h2 className="text-2xl font-bold text-red-700 mb-2">Access Denied</h2>
          <p className="text-gray-650 font-medium">Only Admin users can access the Staff Lead Entry Portal.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="py-12 px-6 min-h-screen bg-gradient-mesh animate-fade-in-up">
      
      {/* HEADER SECTION */}
      <div className="mb-10 flex justify-between items-center max-w-6xl mx-auto">
        <div>
          <h1 className="text-4xl font-extrabold text-gray-900 tracking-tight">Staff Lead Entry Portal</h1>
          <p className="text-gray-500 font-medium mt-1">Internal lead capture and executive assignment queue for staff and appoint DSAs.</p>
        </div>
        
        {isAdmin && (
          <button
            onClick={() => setShowBulkUpload(true)}
            className="px-5 py-3 rounded-2xl font-bold bg-emerald-600 text-white hover:bg-emerald-700 hover-lift shadow-lg shadow-emerald-500/20 transition-all flex items-center gap-2"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            Excel Bulk Upload
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-100 border border-red-300 text-red-700 px-6 py-4 rounded-3xl mb-8 max-w-6xl mx-auto shadow-sm animate-fade-in-up">
          {error}
        </div>
      )}
      {success && (
        <div className="bg-green-100 border border-green-300 text-green-700 px-6 py-4 rounded-3xl mb-8 max-w-6xl mx-auto shadow-sm animate-fade-in-up">
          {success}
        </div>
      )}

      {/* CENTRAL ACTION DASHBOARD CARDS */}
      <div className="grid md:grid-cols-2 gap-8 max-w-6xl mx-auto">
        
        {/* CARD 1: ADD NEW LEAD */}
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

        {/* CARD 2: MANAGE & ASSIGN LEADS */}
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

      </div>

      {/* =======================================================
          MODAL 1: ADD NEW LEAD POPUP FORM
          ======================================================= */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-fade-in">
          <div 
            className="bg-white rounded-3xl p-8 max-w-2xl w-full relative shadow-2xl animate-slide-up border border-gray-150"
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
                    <option value="home_loan">Home Loan</option>
                    <option value="lap">LAP (Loan Against Property)</option>
                    <option value="mudra">Mudra Loan</option>
                    <option value="msme">MSME Loan</option>
                    <option value="business_loan">Business Loan</option>
                    <option value="personal_loan">Personal Loan</option>
                    <option value="education_loan">Education Loan</option>
                  </select>
                  {fieldErrors.loanType && <p className="text-red-500 text-xs mt-1 font-semibold">{fieldErrors.loanType}</p>}
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1 block">Loan Status Category *</label>
                  <select
                    className={`border rounded-2xl px-4 py-3 w-full bg-gray-50/50 transition-all focus:ring-2 focus:ring-blue-200 ${fieldErrors.loanStatus ? 'border-red-500' : 'border-gray-200 focus:border-blue-500'}`}
                    value={formData.loanStatus}
                    onChange={(e) => { setFormData(p => ({ ...p, loanStatus: e.target.value })); setFieldErrors(prev => ({ ...prev, loanStatus: '' })); }}
                  >
                    <option value="">Select Loan Status</option>
                    <option value="new">New Loan</option>
                    <option value="takeover">Takeover</option>
                    <option value="construction">Construction</option>
                    <option value="topup_equity">Top-up/Equity</option>
                  </select>
                  {fieldErrors.loanStatus && <p className="text-red-500 text-xs mt-1 font-semibold">{fieldErrors.loanStatus}</p>}
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-5">
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1 block">Primary Income Source *</label>
                  <select
                    className={`border rounded-2xl px-4 py-3 w-full bg-gray-50/50 transition-all focus:ring-2 focus:ring-blue-200 ${fieldErrors.incomeSource ? 'border-red-500' : 'border-gray-200 focus:border-blue-500'}`}
                    value={formData.incomeSource}
                    onChange={(e) => { setFormData(p => ({ ...p, incomeSource: e.target.value, businessType: e.target.value === 'salaried' ? '' : p.businessType })); setFieldErrors(prev => ({ ...prev, incomeSource: '' })); }}
                  >
                    <option value="">Select Income Source</option>
                    <option value="salaried">Salaried</option>
                    <option value="non_salaried">Non-Salaried</option>
                  </select>
                  {fieldErrors.incomeSource && <p className="text-red-500 text-xs mt-1 font-semibold">{fieldErrors.incomeSource}</p>}
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1 block">Resident Type *</label>
                  <select
                    className={`border rounded-2xl px-4 py-3 w-full bg-gray-50/50 transition-all focus:ring-2 focus:ring-blue-200 ${fieldErrors.residentType ? 'border-red-500' : 'border-gray-200 focus:border-blue-500'}`}
                    value={formData.residentType}
                    onChange={(e) => { setFormData(p => ({ ...p, residentType: e.target.value })); setFieldErrors(prev => ({ ...prev, residentType: '' })); }}
                  >
                    <option value="">Select Resident Type</option>
                    <option value="indian_resident">Indian Resident</option>
                    <option value="nri">NRI</option>
                    <option value="merchant_navy">Merchant Navy</option>
                  </select>
                  {fieldErrors.residentType && <p className="text-red-500 text-xs mt-1 font-semibold">{fieldErrors.residentType}</p>}
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-5">
                {formData.incomeSource !== 'salaried' && (
                  <div>
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1 block">Business Structure Type *</label>
                    <select
                      className={`border rounded-2xl px-4 py-3 w-full bg-gray-50/50 transition-all focus:ring-2 focus:ring-blue-200 ${fieldErrors.businessType ? 'border-red-500' : 'border-gray-200 focus:border-blue-500'}`}
                      value={formData.businessType}
                      onChange={(e) => { setFormData(p => ({ ...p, businessType: e.target.value })); setFieldErrors(prev => ({ ...prev, businessType: '' })); }}
                    >
                      <option value="">Select Business Type</option>
                      <option value="proprietor">Proprietor</option>
                      <option value="partnership">Partnership</option>
                      <option value="pvt_ltd">Pvt Ltd</option>
                      <option value="llp">LLP</option>
                    </select>
                    {fieldErrors.businessType && <p className="text-red-500 text-xs mt-1 font-semibold">{fieldErrors.businessType}</p>}
                  </div>
                )}
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

              {/* Coapplicant Toggle Box */}
              <div className="py-2">
                <label className="flex items-center gap-3 cursor-pointer select-none group">
                  <input
                    type="checkbox"
                    className="w-5 h-5 rounded-lg border-gray-300 text-blue-700 focus:ring-blue-500 cursor-pointer group-hover:scale-105 transition-all"
                    checked={formData.hasCoapplicant}
                    onChange={(e) => setFormData(p => ({ 
                      ...p, 
                      hasCoapplicant: e.target.checked,
                      coapplicantName: e.target.checked ? p.coapplicantName : '',
                      coapplicantIncomeSource: e.target.checked ? p.coapplicantIncomeSource || 'salaried' : ''
                    }))}
                  />
                  <span className="font-bold text-gray-700 text-base group-hover:text-blue-700 transition-colors">Add a Co-applicant for this loan</span>
                </label>
              </div>

              {/* Co-applicant Details Panel */}
              {formData.hasCoapplicant && (
                <div className="grid md:grid-cols-2 gap-5 p-5 bg-gradient-to-r from-blue-50/60 to-indigo-50/40 rounded-2xl border border-blue-100/50 mb-4 animate-fade-in-up">
                  <div>
                    <label className="text-xs font-bold text-gray-600 uppercase mb-1.5 block">Co-applicant Name *</label>
                    <input
                      type="text"
                      placeholder="Co-applicant Full Name"
                      className={`border rounded-2xl px-4 py-3 w-full bg-white transition-all focus:ring-2 focus:ring-blue-200 ${fieldErrors.coapplicantName ? 'border-red-500' : 'border-gray-200 focus:border-blue-500'}`}
                      value={formData.coapplicantName}
                      onChange={(e) => {
                        const val = e.target.value.replace(/[0-9]/g, '');
                        setFormData(p => ({ ...p, coapplicantName: val }));
                        setFieldErrors(p => ({ ...p, coapplicantName: '' }));
                      }}
                      maxLength={50}
                    />
                    {fieldErrors.coapplicantName && <p className="text-red-500 text-xs mt-1 font-semibold">{fieldErrors.coapplicantName}</p>}
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-600 uppercase mb-1.5 block">Co-applicant Income Source *</label>
                    <select
                      className="border rounded-2xl px-4 py-3 w-full bg-white border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
                      value={formData.coapplicantIncomeSource}
                      onChange={(e) => setFormData(p => ({ ...p, coapplicantIncomeSource: e.target.value }))}
                    >
                      <option value="salaried">Salaried</option>
                      <option value="non_salaried">Self employed</option>
                    </select>
                  </div>
                </div>
              )}

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
              {createdLead && (
                <div className="bg-indigo-50/50 border border-indigo-200/50 rounded-2xl p-5 mt-6 animate-fade-in-up">
                  <h3 className="text-lg font-bold text-indigo-800 mb-3">Assign Directly to Executive</h3>
                  <div className="grid md:grid-cols-3 gap-4 mb-4">
                    <select className="border rounded-2xl px-4 py-3 bg-white" value={assignData.assignedTo} onChange={(e) => setAssignData(p => ({...p, assignedTo: e.target.value}))}>
                      <option value="">Select Executive</option>
                      {executives.map(exec => <option key={exec.id} value={exec.name}>{exec.name}</option>)}
                    </select>
                    <select className="border rounded-2xl px-4 py-3 bg-white" value={assignData.department} onChange={(e) => setAssignData(p => ({...p, department: e.target.value}))}>
                      <option value="">Department</option>
                      <option>Operations Team</option><option>Login Team</option><option>Sales Team</option><option>Credit Coordination</option>
                    </select>
                    <select className="border rounded-2xl px-4 py-3 bg-white" value={assignData.priority} onChange={(e) => setAssignData(p => ({...p, priority: e.target.value}))}>
                      <option value="Low">Low Priority</option><option value="Medium">Medium Priority</option><option value="High">High Priority</option>
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
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-fade-in">
          <div 
            className="bg-white rounded-3xl p-8 max-w-6xl w-full relative shadow-2xl animate-slide-up border border-gray-150"
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
                          <th className="p-4">Customer</th><th className="p-4">Mobile</th><th className="p-4">Loan Type</th><th className="p-4">Amount</th><th className="p-4">Status</th><th className="p-4 text-center">Action</th>
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
                            <td className="p-4 text-center">
                              <button 
                                onClick={() => setSelectedLead(lead.id)} 
                                className="px-4 py-2 rounded-xl text-blue-700 font-bold bg-blue-50 border border-blue-100 hover:bg-blue-150 transition-colors shadow-sm"
                              >
                                Assign
                              </button>
                            </td>
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
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-55 p-4 animate-fade-in">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full relative shadow-2xl animate-slide-up border border-gray-150">
            <h3 className="text-xl font-bold text-gray-900 mb-2">Assign Loan File</h3>
            <p className="text-gray-500 text-sm mb-5 font-semibold">Choose an available executive, department, and priority to route this file.</p>
            
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

              <div>
                <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">File Priority *</label>
                <select className="border rounded-2xl px-4 py-3 w-full bg-gray-50 focus:ring-2 focus:ring-blue-200 focus:border-blue-500 transition-all" value={assignData.priority} onChange={(e) => setAssignData(p => ({...p, priority: e.target.value}))}>
                  <option value="Low">Low Priority</option>
                  <option value="Medium">Medium Priority</option>
                  <option value="High">High Priority</option>
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