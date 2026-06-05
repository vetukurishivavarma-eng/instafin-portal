import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import StatusBadge from '../components/StatusBadge';
import API_BASE from '../config/api';
import { getChecklistWithFallback, getCoapplicantChecklist } from '../utils/resolver';

// Normalize field values for checklist matching
const normalizeValue = (val) => {
  if (!val) return val;
  return val.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
};

// Format currency
const formatCurrency = (amount) => {
  const num = Number(amount) || 0;
  return `₹${num.toLocaleString('en-IN')}`;
};

export default function CustomerLoginPage() {
  const { accessToken, user, impersonating, isImpersonating, effectiveRole } = useAuth();
  const [leads, setLeads] = useState([]);
  const [selectedLead, setSelectedLead] = useState(null);
  const [loading, setLoading] = useState(false);
  const [leadsLoading, setLeadsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Dropdown state
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const dropdownRef = useRef(null);

  // Document management
  const [checklistItems, setChecklistItems] = useState([]);
  const [checklistStatuses, setChecklistStatuses] = useState({});
  const [showUploadForm, setShowUploadForm] = useState(null);
  const [uploadDescription, setUploadDescription] = useState('');
  const [uploadingDoc, setUploadingDoc] = useState(null);
  const [deletingDoc, setDeletingDoc] = useState(null);
  const [viewDoc, setViewDoc] = useState(null);

  // AI Summary / Auto-fill
  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [extractedProfile, setExtractedProfile] = useState(null);

  // Bank forms
  const [downloadingForm, setDownloadingForm] = useState(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch leads
  useEffect(() => {
    if (!accessToken) return;
    fetchLeads();
  }, [accessToken]);

  const fetchLeads = async () => {
    setLeadsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/leads`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const data = await res.json();
      const allLeads = data.data || [];

      // Filter by assigned executive (for exec) or admin view
      const executiveName = isImpersonating ? impersonating?.name : null;
      let filtered = executiveName
        ? allLeads.filter(l => l.assignedTo === executiveName)
        : allLeads;

      // If logged in as executive (not admin), filter by assigned
      if (user?.role === 'executive' && !isImpersonating) {
        filtered = filtered.filter(l => l.assignedTo === user.name);
      }

      // Only active leads
      setLeads(filtered.filter(l => l.isActive !== false));
    } catch (err) {
      setError('Failed to load leads');
    } finally {
      setLeadsLoading(false);
    }
  };

  // Handle lead selection
  const handleSelectLead = async (lead) => {
    setSelectedLead(lead);
    setDropdownOpen(false);
    setSearchTerm('');
    setError('');
    setSuccess('');
    setShowUploadForm(null);
    setSummary(null);
    setExtractedProfile(null);

    // Load checklist for this lead
    loadChecklistForLead(lead);
    
    // Fetch uploaded documents
    fetchChecklistStatuses(lead.id);
    
    // Fetch existing summary
    fetchSummary(lead.id);
  };

  const handleClearLead = () => {
    setSelectedLead(null);
    setChecklistItems([]);
    setChecklistStatuses({});
    setSummary(null);
    setExtractedProfile(null);
    setError('');
    setSuccess('');
  };

  // Load checklist based on lead's loan type
  const loadChecklistForLead = (lead) => {
    const selection = {
      loanType: normalizeValue(lead.loanType),
      loanStatus: normalizeValue(lead.loanStatus) || 'new',
      incomeSource: normalizeValue(lead.incomeSource),
      residentType: normalizeValue(lead.residentType),
      businessType: normalizeValue(lead.businessType)
    };

    if (!selection.loanType) return;

    const items = getChecklistWithFallback(selection);

    if (lead.hasCoapplicant) {
      const coAppItems = getCoapplicantChecklist(items, lead.coapplicantName);
      setChecklistItems([...items, ...coAppItems]);
    } else {
      setChecklistItems(items);
    }
  };

  // Fetch checklist statuses (uploaded files)
  const fetchChecklistStatuses = (leadId) => {
    fetch(`${API_BASE}/checklist-status/${leadId}`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    })
    .then(r => r.json())
    .then(data => {
      if (data && data.grouped) {
        setChecklistStatuses(data.grouped);
      } else {
        setChecklistStatuses({});
      }
    })
    .catch(() => setChecklistStatuses({}));
  };

  // Fetch existing summary
  const fetchSummary = (leadId) => {
    setSummaryLoading(true);
    fetch(`${API_BASE}/leads/${leadId}/summary`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    })
    .then(r => r.json())
    .then(data => {
      if (data.hasSummary) {
        setSummary(data.summary);
        // Try to parse extracted details
        try {
          const jsonMatch = data.summary.match(/```json([\s\S]*?)```/);
          if (jsonMatch && jsonMatch[1]) {
            const parsed = JSON.parse(jsonMatch[1].trim());
            setExtractedProfile(parsed.extracted_details || null);
          }
        } catch {}
      }
      setSummaryLoading(false);
    })
    .catch(() => setSummaryLoading(false));
  };

  // Generate new summary
  const handleGenerateSummary = async () => {
    if (!selectedLead) return;
    setSummaryLoading(true);
    try {
      const res = await fetch(`${API_BASE}/leads/${selectedLead.id}/summarize`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });
      const data = await res.json();
      if (res.ok) {
        setSummary(data.summary);
        fetchChecklistStatuses(selectedLead.id);
        setSuccess('Documents analyzed successfully!');
        setTimeout(() => setSuccess(''), 3000);
        try {
          const jsonMatch = data.summary.match(/```json([\s\S]*?)```/);
          if (jsonMatch && jsonMatch[1]) {
            const parsed = JSON.parse(jsonMatch[1].trim());
            setExtractedProfile(parsed.extracted_details || null);
          }
        } catch {}
      } else {
        setError(data.error || 'Failed to analyze documents');
      }
    } catch (err) {
      setError('Failed to analyze documents');
    } finally {
      setSummaryLoading(false);
    }
  };

  // Upload file
  const handleFileUpload = async (documentId, documentName, file, description) => {
    if (!selectedLead) return;
    setUploadingDoc(documentId);
    try {
      const formData = new FormData();
      formData.append('leadId', selectedLead.id);
      formData.append('documentId', documentId);
      formData.append('documentName', documentName);
      formData.append('description', (description || '').trim());
      formData.append('file', file);

      const res = await fetch(`${API_BASE}/checklist-status/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
        body: formData
      });

      if (res.ok) {
        fetchChecklistStatuses(selectedLead.id);
        setSuccess(`${documentName} uploaded successfully!`);
        setShowUploadForm(null);
        setUploadDescription('');
        setTimeout(() => setSuccess(''), 3000);
      } else {
        const errData = await res.json();
        setError(errData.error || 'Upload failed');
      }
    } catch (err) {
      setError('Upload failed');
    } finally {
      setUploadingDoc(null);
    }
  };

  // Delete file
  const handleDeleteDocument = async (fileId, documentName) => {
    if (!selectedLead || !window.confirm(`Delete this file for "${documentName}"?`)) return;
    setDeletingDoc(fileId);
    try {
      const res = await fetch(`${API_BASE}/checklist-status/file/${fileId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (res.ok) {
        fetchChecklistStatuses(selectedLead.id);
        setSuccess('File deleted successfully!');
        setTimeout(() => setSuccess(''), 3000);
      } else {
        const errData = await res.json();
        setError(errData.error || 'Delete failed');
      }
    } catch (err) {
      setError('Delete failed');
    } finally {
      setDeletingDoc(null);
    }
  };

  // View file
  const handleViewDocument = async (fileId) => {
    setViewDoc({ url: null, id: fileId, loading: true });
    try {
      const res = await fetch(`${API_BASE}/checklist-status/file/${fileId}`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (!res.ok) throw new Error('Failed');
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      setViewDoc({ url: blobUrl, id: fileId, loading: false });
    } catch (err) {
      setError('Failed to load document');
      setViewDoc(null);
    }
  };

  // Download bank form
  const handleDownloadForm = async (bankName) => {
    if (!selectedLead) return;
    setDownloadingForm(bankName);
    try {
      // First find the form for this bank + loan type
      const loanTypeLabel = (selectedLead.loanType || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      const params = new URLSearchParams({ bank: bankName, loan_type: loanTypeLabel });

      const searchRes = await fetch(`${API_BASE}/forms?${params.toString()}`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const searchData = await searchRes.json();
      const forms = searchData.data || [];

      if (forms.length === 0) {
        // Fallback: try without loan type filter
        const fallbackRes = await fetch(`${API_BASE}/forms?bank=${encodeURIComponent(bankName)}`, {
          headers: { Authorization: `Bearer ${accessToken}` }
        });
        const fallbackData = await fallbackRes.json();
        const fallbackForms = fallbackData.data || [];
        
        if (fallbackForms.length === 0) {
          setError(`No application form found for ${bankName}. Please upload one in the Download Forms page.`);
          return;
        }
        
        // Download first available form
        await downloadFormById(fallbackForms[0].id);
        return;
      }

      await downloadFormById(forms[0].id);
    } catch (err) {
      setError('Failed to download form');
    } finally {
      setDownloadingForm(null);
    }
  };

  const downloadFormById = async (formId) => {
    const res = await fetch(`${API_BASE}/forms/${formId}/download`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!res.ok) throw new Error('Download failed');

    const disposition = res.headers.get('Content-Disposition');
    let filename = 'application_form.pdf';
    if (disposition) {
      const match = disposition.match(/filename="(.+)"/);
      if (match) filename = match[1];
    }

    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);

    setSuccess('Form downloaded successfully!');
    setTimeout(() => setSuccess(''), 3000);
  };

  // Filter leads
  const filteredLeads = leads.filter(l =>
    !searchTerm ||
    l.customerName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    l.mobile?.includes(searchTerm) ||
    l.loanType?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Group checklist items by category
  const categoryOrder = ['kyc', 'income_proof', 'business_documents', 'property_documents', 'financial_documents', 'legal_documents', 'others'];
  const categoryLabels = {
    kyc: 'KYC Documents',
    income_proof: 'Income Proof',
    business_documents: 'Business Documents',
    property_documents: 'Property Documents',
    financial_documents: 'Financial Documents',
    legal_documents: 'Legal Documents',
    others: 'Others'
  };

  const uploadedCount = checklistItems.filter(item => {
    const files = checklistStatuses[item.id];
    return files && files.length > 0;
  }).length;
  const pendingCount = checklistItems.filter(item => {
    const files = checklistStatuses[item.id];
    return item.required && (!files || files.length === 0);
  }).length;

  return (
    <div className="py-6 sm:py-12 px-3 sm:px-6">
      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Customer Login</h1>
        <p className="text-xs sm:text-base text-gray-500 mt-1">
          Select a lead to view application forms, manage documents, and download bank forms.
        </p>
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-2xl mb-6 text-sm">
          {error}
          <button onClick={() => setError('')} className="ml-2 float-right">&times;</button>
        </div>
      )}
      {success && (
        <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded-2xl mb-6 text-sm">
          {success}
          <button onClick={() => setSuccess('')} className="ml-2 float-right">&times;</button>
        </div>
      )}

      {/* Lead Dropdown */}
      <div ref={dropdownRef} className="relative mb-8 max-w-2xl mx-auto">
        <label className="block text-sm font-semibold text-gray-700 mb-2">
          Select Lead
          {leads.length > 0 && (
            <span className="text-gray-400 font-normal ml-2">({leads.length} available)</span>
          )}
        </label>
        <div
          className={`flex items-center bg-white border-2 rounded-2xl px-4 py-3 cursor-pointer transition-all
            ${dropdownOpen ? 'border-blue-500 shadow-lg shadow-blue-100' : 'border-gray-200 hover:border-gray-300 shadow-sm'}`}
          onClick={() => { if (!leadsLoading) setDropdownOpen(!dropdownOpen); }}
        >
          {selectedLead ? (
            <div className="flex-1 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-sm">
                  {selectedLead.customerName?.charAt(0)?.toUpperCase() || '?'}
                </div>
                <div>
                  <p className="font-semibold text-gray-900 text-sm">{selectedLead.customerName}</p>
                  <p className="text-xs text-gray-500">{selectedLead.mobile}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="hidden sm:inline text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded-full">
                  {selectedLead.loanType?.replace(/_/g, ' ')}
                </span>
                <StatusBadge status={selectedLead.status} />
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center gap-3 text-gray-400">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              {leadsLoading ? 'Loading leads...' : 'Search and select a lead...'}
            </div>
          )}
          <svg className={`w-5 h-5 text-gray-400 transition-transform ml-2 ${dropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>

        {selectedLead && (
          <button
            onClick={(e) => { e.stopPropagation(); handleClearLead(); }}
            className="absolute right-12 top-[46px] -translate-y-1/2 p-1 text-gray-400 hover:text-red-500 transition-colors"
            title="Clear selection"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}

        {dropdownOpen && (
          <div className="absolute z-20 mt-2 w-full bg-white border border-gray-200 rounded-2xl shadow-xl overflow-hidden">
            <div className="p-3 border-b border-gray-100">
              <div className="relative">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  placeholder="Search by name, mobile, or loan type..."
                  className="w-full pl-10 pr-4 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  autoFocus
                />
              </div>
            </div>
            <div className="max-h-72 overflow-y-auto">
              {leadsLoading ? (
                <div className="p-6 text-center text-gray-500 text-sm">Loading leads...</div>
              ) : filteredLeads.length === 0 ? (
                <div className="p-6 text-center text-gray-400 text-sm">
                  {searchTerm ? 'No leads match your search.' : 'No active leads assigned to you.'}
                </div>
              ) : (
                filteredLeads.map(lead => (
                  <div
                    key={lead.id}
                    onClick={(e) => { e.stopPropagation(); handleSelectLead(lead); }}
                    className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors hover:bg-blue-50 border-b border-gray-50 last:border-0
                      ${selectedLead?.id === lead.id ? 'bg-blue-50' : ''}`}
                  >
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex-shrink-0 flex items-center justify-center text-white font-bold text-sm">
                      {lead.customerName?.charAt(0)?.toUpperCase() || '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-gray-900 text-sm truncate">{lead.customerName}</p>
                        <StatusBadge status={lead.status} />
                      </div>
                      <p className="text-xs text-gray-500 truncate">
                        {lead.mobile}
                        {lead.loanType && <span className="mx-1.5">&middot;</span>}
                        {lead.loanType && <span className="capitalize">{lead.loanType.replace(/_/g, ' ')}</span>}
                      </p>
                    </div>
                    <span className="text-[10px] text-gray-400 bg-gray-100 px-2 py-1 rounded-full flex-shrink-0">
                      {lead.assignedBanks?.length || 0} bank{(lead.assignedBanks?.length || 0) !== 1 ? 's' : ''}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Lead Selected - Main Content */}
      {selectedLead ? (
        <div className="space-y-6 max-w-5xl mx-auto">
          {/* Lead Summary Card */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5 sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold">
                  {selectedLead.customerName?.charAt(0)?.toUpperCase() || '?'}
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">{selectedLead.customerName}</h3>
                  <p className="text-sm text-gray-500">{selectedLead.mobile} | {selectedLead.loanType?.replace(/_/g, ' ')}</p>
                </div>
              </div>
              <StatusBadge status={selectedLead.status} />
            </div>

            <div className="grid md:grid-cols-3 gap-4 text-sm">
              <div>
                <span className="text-gray-500 font-medium">Expected Amount:</span>
                <p className="font-semibold mt-1">{selectedLead.expectedAmount ? formatCurrency(selectedLead.expectedAmount) : 'N/A'}</p>
              </div>
              <div>
                <span className="text-gray-500 font-medium">Date of Entry:</span>
                <p className="font-semibold mt-1">
                  {selectedLead.entryDate || selectedLead.createdAt
                    ? new Date(selectedLead.entryDate || selectedLead.createdAt).toLocaleDateString('en-IN', {
                        day: '2-digit', month: 'short', year: 'numeric'
                      })
                    : 'N/A'}
                </p>
              </div>
              <div>
                <span className="text-gray-500 font-medium">Assigned Banks:</span>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {(selectedLead.bankDetails || selectedLead.assignedBanks || []).map((bank, i) => {
                    const bankName = typeof bank === 'string' ? bank : bank.bankName;
                    const branchName = typeof bank === 'object' ? bank.branchName : null;
                    return (
                      <div key={i} className="flex flex-col">
                        <span className="bg-green-50 text-green-700 px-2.5 py-1 rounded-lg text-xs font-medium border border-green-100">
                          {bankName}
                        </span>
                        {branchName && (
                          <span className="text-[10px] text-gray-500 mt-0.5 ml-1">Branch: {branchName}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Auto-filled Application Form from Uploaded Docs */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5 sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-50 to-blue-50 border border-indigo-100 flex items-center justify-center">
                  <svg className="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Loan Application Form</h3>
                  <p className="text-xs text-gray-500">Auto-populated from uploaded KYC documents</p>
                </div>
              </div>
              {uploadedCount > 0 && !summaryLoading && (
                <button
                  onClick={handleGenerateSummary}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-xl font-semibold text-sm hover:bg-indigo-700 transition-all flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  {summary ? 'Re-Analyze' : 'Analyze Documents'}
                </button>
              )}
            </div>

            {summaryLoading ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="relative w-12 h-12 mb-3">
                  <div className="absolute inset-0 rounded-full border-4 border-indigo-100"></div>
                  <div className="absolute inset-0 rounded-full border-4 border-indigo-600 border-t-transparent animate-spin"></div>
                </div>
                <p className="font-semibold text-gray-700 text-sm">Analyzing uploaded documents...</p>
                <p className="text-xs text-gray-400 mt-1">Extracting KYC details to auto-fill the application form.</p>
              </div>
            ) : extractedProfile ? (
              <div className="bg-gray-50 rounded-xl p-5">
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Full Name</label>
                    <p className="text-sm font-semibold text-gray-900 mt-1">{extractedProfile.full_name || 'N/A'}</p>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Date of Birth</label>
                    <p className="text-sm font-semibold text-gray-900 mt-1">
                      {extractedProfile.dob || 'N/A'}
                      {extractedProfile.gender ? ` (${extractedProfile.gender})` : ''}
                    </p>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Aadhaar Number</label>
                    <p className="text-sm font-semibold text-gray-900 mt-1 tracking-wider">{extractedProfile.aadhaar_number || 'N/A'}</p>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">PAN Number</label>
                    <p className="text-sm font-semibold text-gray-900 mt-1 tracking-wider">{extractedProfile.pan_number || 'N/A'}</p>
                  </div>
                  <div className="md:col-span-2">
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Address</label>
                    <p className="text-sm text-gray-900 mt-1">{extractedProfile.address || 'N/A'}</p>
                  </div>
                </div>
                <div className="mt-4 pt-3 border-t border-gray-200">
                  <p className="text-[10px] text-gray-400 italic">
                    Data extracted from uploaded KYC documents. Upload additional documents and re-analyze to update.
                  </p>
                </div>
              </div>
            ) : (
              <div className="text-center py-10 border-2 border-dashed border-gray-200 rounded-xl">
                <svg className="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p className="text-sm font-medium text-gray-400">
                  {uploadedCount === 0 
                    ? 'Upload documents below, then click "Analyze Documents" to auto-fill the form.'
                    : 'Click "Analyze Documents" to extract KYC details from uploaded files.'}
                </p>
              </div>
            )}
          </div>

          {/* Bank Application Forms Download */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5 sm:p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-green-50 to-emerald-50 border border-green-100 flex items-center justify-center">
                <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">Bank Application Forms</h3>
                <p className="text-xs text-gray-500">Download forms for offline filling</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              {(selectedLead.bankDetails || selectedLead.assignedBanks || []).length > 0 ? (
                (selectedLead.bankDetails || selectedLead.assignedBanks || []).map((bank, i) => {
                  const bankName = typeof bank === 'string' ? bank : bank.bankName;
                  return (
                    <button
                      key={i}
                      onClick={() => handleDownloadForm(bankName)}
                      disabled={downloadingForm === bankName}
                      className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl font-semibold text-sm hover:bg-blue-700 transition-all disabled:opacity-50"
                    >
                      {downloadingForm === bankName ? (
                        <>
                          <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                          Downloading...
                        </>
                      ) : (
                        <>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                            <polyline points="7 10 12 15 17 10" />
                            <line x1="12" y1="15" x2="12" y2="3" />
                          </svg>
                          {bankName} Form
                        </>
                      )}
                    </button>
                  );
                })
              ) : (
                <p className="text-sm text-gray-400">No banks assigned to this lead.</p>
              )}
            </div>
          </div>

          {/* Required Documents Section */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5 sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-100 flex items-center justify-center">
                  <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Required Documents</h3>
                  <p className="text-xs text-gray-500">Upload pending documents and view uploaded files</p>
                </div>
              </div>
              {checklistItems.length > 0 && (
                <div className="flex gap-2 text-sm">
                  <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-xs font-medium">
                    {uploadedCount} Uploaded
                  </span>
                  <span className="bg-red-100 text-red-700 px-3 py-1 rounded-full text-xs font-medium">
                    {pendingCount} Pending
                  </span>
                </div>
              )}
            </div>

            {checklistItems.length === 0 ? (
              <div className="text-center py-8 text-gray-400 text-sm border-2 border-dashed border-gray-200 rounded-xl">
                No checklist data available for this lead's loan type.
              </div>
            ) : (
              <div className="space-y-4">
                {categoryOrder.map(category => {
                  const items = checklistItems.filter(item => item.category === category);
                  if (items.length === 0) return null;

                  return (
                    <div key={category} className="border border-gray-200 rounded-xl overflow-hidden">
                      <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200">
                        <h4 className="font-semibold text-gray-800 text-sm">{categoryLabels[category] || category}</h4>
                      </div>
                      <ul className="divide-y divide-gray-100">
                        {items.map(item => {
                          const uploadedFiles = checklistStatuses[item.id] || [];
                          const showForm = showUploadForm === item.id;

                          return (
                            <li key={item.id} className={`px-4 py-3 ${uploadedFiles.length > 0 ? 'bg-green-50/50' : ''}`}>
                              <div className="flex items-center gap-3">
                                {/* Status dot */}
                                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                                  uploadedFiles.length > 0 ? 'bg-green-500' : item.required ? 'bg-red-400' : 'bg-gray-300'
                                }`} />

                                {/* Document name */}
                                <div className="flex-1 min-w-0">
                                  <p className={`text-sm font-medium ${uploadedFiles.length > 0 ? 'text-green-800' : 'text-gray-800'}`}>
                                    {item.name}
                                  </p>
                                  {uploadedFiles.length > 0 && (
                                    <p className="text-xs text-green-600 mt-0.5">{uploadedFiles.length} file(s) uploaded</p>
                                  )}
                                </div>

                                {/* Required badge */}
                                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                                  item.required ? 'bg-red-50 text-red-600' : 'bg-gray-100 text-gray-500'
                                }`}>
                                  {item.required ? 'Required' : 'Optional'}
                                </span>

                                {/* Add File / Cancel button */}
                                {showForm ? (
                                  <button
                                    onClick={() => { setShowUploadForm(null); setUploadDescription(''); }}
                                    className="text-xs text-gray-500 font-semibold bg-gray-100 px-2.5 py-1.5 rounded-lg hover:bg-gray-200"
                                  >
                                    Cancel
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => setShowUploadForm(item.id)}
                                    className="text-xs text-blue-700 font-semibold bg-blue-100 px-2.5 py-1.5 rounded-lg hover:bg-blue-200"
                                  >
                                    + Add File
                                  </button>
                                )}
                              </div>

                              {/* Upload Form */}
                              {showForm && (
                                <div className="ml-5 mt-3 p-3 bg-white border border-blue-200 rounded-xl">
                                  <div className="space-y-2">
                                    <textarea
                                      value={uploadDescription}
                                      onChange={(e) => setUploadDescription(e.target.value)}
                                      placeholder="Document description (optional)"
                                      rows={1}
                                      className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-xs focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                                      disabled={uploadingDoc === item.id}
                                    />
                                    <label className={`flex items-center justify-center gap-2 w-full py-2 rounded-lg text-xs font-semibold cursor-pointer ${
                                      uploadingDoc === item.id
                                        ? 'bg-gray-300 text-gray-500 cursor-wait'
                                        : 'bg-blue-600 text-white hover:bg-blue-700'
                                    }`}>
                                      {uploadingDoc === item.id ? (
                                        <>
                                          <svg className="animate-spin h-3.5 w-3.5" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                          </svg>
                                          Uploading...
                                        </>
                                      ) : 'Choose File & Upload'}
                                      <input
                                        type="file"
                                        className="hidden"
                                        accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                                        disabled={uploadingDoc === item.id}
                                        onChange={(e) => {
                                          if (e.target.files[0]) {
                                            handleFileUpload(item.id, item.name, e.target.files[0], uploadDescription);
                                          }
                                        }}
                                      />
                                    </label>
                                  </div>
                                </div>
                              )}

                              {/* Uploaded files list */}
                              {uploadedFiles.length > 0 && (
                                <div className="ml-5 mt-2 space-y-1.5">
                                  {uploadedFiles.map((file) => (
                                    <div key={file.id} className="flex items-center gap-2 bg-white border border-green-200 rounded-lg px-3 py-2">
                                      <svg className="w-5 h-5 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                      </svg>
                                      <div className="flex-1 min-w-0">
                                        <p className="text-xs font-medium text-gray-900 truncate">
                                          {file.description || 'No description'}
                                        </p>
                                        {file.uploadedAt && (
                                          <p className="text-[10px] text-gray-500">
                                            {new Date(file.uploadedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                          </p>
                                        )}
                                      </div>
                                      <button
                                        onClick={() => handleViewDocument(file.id)}
                                        className="text-xs text-blue-700 font-semibold bg-blue-100 px-2 py-1 rounded-lg hover:bg-blue-200"
                                      >
                                        View
                                      </button>
                                      <button
                                        onClick={() => handleDeleteDocument(file.id, file.description || item.name)}
                                        disabled={deletingDoc === file.id}
                                        className="text-xs text-red-700 font-semibold bg-red-100 px-2 py-1 rounded-lg hover:bg-red-200 disabled:opacity-50"
                                      >
                                        {deletingDoc === file.id ? '...' : 'Delete'}
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-12 text-center max-w-lg mx-auto">
          <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <h3 className="text-xl font-bold text-gray-400 mb-2">Select a Lead</h3>
          <p className="text-gray-400 text-sm">Use the dropdown above to search and select a lead to view application forms, manage documents, and download bank forms.</p>
        </div>
      )}

      {/* View Document Modal */}
      {viewDoc && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => { if (viewDoc.url) URL.revokeObjectURL(viewDoc.url); setViewDoc(null); }}>
          <div className="bg-white rounded-3xl shadow-2xl max-w-4xl w-full mx-4 max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center px-6 py-4 border-b">
              <h3 className="text-lg font-bold text-gray-900">Uploaded Document</h3>
              <div className="flex items-center gap-3">
                {viewDoc.url && (
                  <a href={viewDoc.url} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline">
                    Open in new tab
                  </a>
                )}
                <button onClick={() => { if (viewDoc.url) URL.revokeObjectURL(viewDoc.url); setViewDoc(null); }} className="text-gray-500 hover:text-gray-700 text-2xl leading-none">&times;</button>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-4">
              {viewDoc.loading ? (
                <div className="flex items-center justify-center h-[70vh] text-gray-500">Loading document...</div>
              ) : (
                <iframe src={viewDoc.url} title="Document Preview" className="w-full h-[70vh] border rounded-lg" />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
