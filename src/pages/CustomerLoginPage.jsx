import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import StatusBadge from '../components/StatusBadge';
import API_BASE from '../config/api';
import { getChecklistWithFallback, getCoapplicantChecklist } from '../utils/resolver';
import { downloadEligibilityPDF } from '../export/pdf';

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
  const [editingExpectedAmount, setEditingExpectedAmount] = useState(false);
  const [editExpectedAmountValue, setEditExpectedAmountValue] = useState('');
  const [showAssignBank, setShowAssignBank] = useState(false);
  const [newBankName, setNewBankName] = useState('');
  const [newBranchName, setNewBranchName] = useState('');
  const [customBankName, setCustomBankName] = useState('');
  const [editingCoapplicants, setEditingCoapplicants] = useState(false);
  const [editCoapplicants, setEditCoapplicants] = useState([]);

  // ===== Eligibility Calculator State =====
  const [eligPF, setEligPF] = useState('');
  const [eligIncomeTax, setEligIncomeTax] = useState('');
  const [eligProfessionTax, setEligProfessionTax] = useState('');
  const [eligGrossSalary, setEligGrossSalary] = useState('');
  const [eligRentalIncome, setEligRentalIncome] = useState('');
  const [eligEmiNmiPercent, setEligEmiNmiPercent] = useState('50');
  const [eligBankEmis, setEligBankEmis] = useState([{ bank: '', emi: '' }]);
  const [eligPrincipal, setEligPrincipal] = useState('100000');
  const [eligRate, setEligRate] = useState('8.5');
  const [eligPeriod, setEligPeriod] = useState('240');
  const [eligHasCoapplicant, setEligHasCoapplicant] = useState(false);
  const [eligCoapplicantGross, setEligCoapplicantGross] = useState('');
  const [showEligModal, setShowEligModal] = useState(false);
  const [eligDownloading, setEligDownloading] = useState(false);
  const [searchSummary, setSearchSummary] = useState('');

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

  // Escape key to close document viewer
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape' && viewDoc) {
        if (viewDoc.url) URL.revokeObjectURL(viewDoc.url);
        setViewDoc(null);
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [viewDoc]);

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

    // Handle multiple co-applicants
    const coapps = lead.coapplicants || [];
    if (coapps.length > 0) {
      let allItems = [...items];
      coapps.forEach(coapp => {
        if (coapp.name) {
          const coAppItems = getCoapplicantChecklist(items, coapp.name);
          allItems = [...allItems, ...coAppItems];
        }
      });
      setChecklistItems(allItems);
    } else if (lead.hasCoapplicant && lead.coapplicantName) {
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
  const handleViewDocument = async (fileId, docName) => {
    if (!fileId) return;
    // Find document info from checklistStatuses
    let fileName = '';
    let fileCategory = '';
    let fileDescription = '';
    let fileUploadDate = '';

    Object.entries(checklistStatuses).forEach(([docId, files]) => {
      const matchedFile = (files || []).find(f => f.id === fileId);
      if (matchedFile) {
        // Find the checklist item to get the document name
        const checklistItem = checklistItems.find(item => item.id === docId);
        fileName = checklistItem?.name || docName || 'Document';
        fileCategory = checklistItem?.category || '';
        fileDescription = matchedFile.description || '';
        fileUploadDate = matchedFile.uploadedAt || '';
      }
    });

    setViewDoc({
      url: null,
      id: fileId,
      name: fileName,
      category: fileCategory,
      description: fileDescription,
      uploadDate: fileUploadDate,
      mimeType: '',
      fileSize: null,
      loading: true,
      zoom: 1
    });

    try {
      const res = await fetch(`${API_BASE}/checklist-status/file/${fileId}`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (!res.ok) throw new Error('Failed');

      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);

      // Get file size from Content-Length header or blob
      const contentLength = res.headers.get('Content-Length');
      const fileSize = contentLength ? parseInt(contentLength, 10) : blob.size;

      setViewDoc(prev => ({
        ...prev,
        url: blobUrl,
        mimeType: blob.type || 'application/pdf',
        fileSize,
        loading: false,
        zoom: 1
      }));
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

  // ===== Inline Edit: Expected Amount =====
  const handleSaveExpectedAmount = async () => {
    if (!selectedLead) return;
    const amount = parseFloat(editExpectedAmountValue);
    if (isNaN(amount) || amount < 0) {
      setError('Please enter a valid amount');
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/leads/${selectedLead.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({ expectedAmount: amount })
      });
      if (res.ok) {
        const data = await res.json();
        setSelectedLead(prev => ({ ...prev, expectedAmount: data.expectedAmount || amount }));
        setEditingExpectedAmount(false);
        setSuccess('Expected amount updated!');
        setTimeout(() => setSuccess(''), 3000);
      } else {
        const err = await res.json();
        setError(err.error || 'Failed to update expected amount');
      }
    } catch (err) {
      setError('Failed to update expected amount');
    }
  };

  // ===== Assign Bank =====
  const handleAssignBank = async () => {
    if (!selectedLead) return;
    const bankName = customBankName.trim() || newBankName.trim();
    if (!bankName) {
      setError('Please select or enter a bank name');
      return;
    }
    const currentBanks = selectedLead.bankDetails || selectedLead.assignedBanks || [];
    // Check duplicate
    const exists = currentBanks.some(b => {
      const name = typeof b === 'string' ? b : b.bankName;
      return name.toLowerCase() === bankName.toLowerCase();
    });
    if (exists) {
      setError('This bank is already assigned');
      return;
    }
    const newBanks = [...currentBanks, { bankName, branchName: newBranchName.trim() || undefined }];
    try {
      const res = await fetch(`${API_BASE}/leads/${selectedLead.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({ assignedBanks: newBanks.map(b => typeof b === 'string' ? b : b.bankName + (b.branchName ? ` - ${b.branchName}` : '')) })
      });
      if (res.ok) {
        const data = await res.json();
        setSelectedLead(prev => ({ ...prev, bankDetails: newBanks, assignedBanks: data.lead?.assignedBanks || newBanks.map(b => typeof b === 'string' ? b : b.bankName + (b.branchName ? ` - ${b.branchName}` : '')) }));
        setShowAssignBank(false);
        setNewBankName('');
        setNewBranchName('');
        setCustomBankName('');
        setSuccess('Bank assigned successfully!');
        setTimeout(() => setSuccess(''), 3000);
      } else {
        const err = await res.json();
        setError(err.error || 'Failed to assign bank');
      }
    } catch (err) {
      setError('Failed to assign bank');
    }
  };

  // ===== Remove Bank =====
  const handleRemoveBank = async (bankToRemove) => {
    if (!selectedLead) return;
    const currentBanks = selectedLead.bankDetails || selectedLead.assignedBanks || [];
    const updatedBanks = currentBanks.filter(b => {
      const name = typeof b === 'string' ? b : b.bankName;
      return name !== bankToRemove;
    });
    try {
      const res = await fetch(`${API_BASE}/leads/${selectedLead.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({ assignedBanks: updatedBanks.map(b => typeof b === 'string' ? b : b.bankName + (b.branchName ? ` - ${b.branchName}` : '')) })
      });
      if (res.ok) {
        const data = await res.json();
        setSelectedLead(prev => ({ ...prev, bankDetails: updatedBanks, assignedBanks: updatedBanks.map(b => typeof b === 'string' ? b : b.bankName + (b.branchName ? ` - ${b.branchName}` : '')) }));
        setSuccess(`${bankToRemove} removed from assigned banks.`);
        setTimeout(() => setSuccess(''), 3000);
      } else {
        const err = await res.json();
        setError(err.error || 'Failed to remove bank');
      }
    } catch (err) {
      setError('Failed to remove bank');
    }
  };

  // ===== Co-applicants Management =====
  const handleAddCoapplicant = () => {
    setEditCoapplicants(prev => [...prev, { name: '', incomeSource: 'salaried' }]);
  };

  const handleRemoveCoapplicant = (index) => {
    setEditCoapplicants(prev => prev.filter((_, i) => i !== index));
  };

  const handleUpdateCoapplicant = (index, field, value) => {
    setEditCoapplicants(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const handleSaveCoapplicants = async () => {
    if (!selectedLead) return;
    try {
      const res = await fetch(`${API_BASE}/leads/${selectedLead.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({ coapplicants: editCoapplicants })
      });
      if (res.ok) {
        const data = await res.json();
        setSelectedLead(prev => ({ ...prev, coapplicants: editCoapplicants }));
        setEditingCoapplicants(false);
        setSuccess('Co-applicants updated!');
        setTimeout(() => setSuccess(''), 3000);
      } else {
        const err = await res.json();
        setError(err.error || 'Failed to update co-applicants');
      }
    } catch (err) {
      setError('Failed to update co-applicants');
    }
  };

  const handleStartEditCoapplicants = () => {
    setEditCoapplicants(selectedLead.coapplicants || []);
    setEditingCoapplicants(true);
  };

  // ===== Eligibility Helper Functions =====
  const eligNum = (v) => parseFloat(v) || 0;
  const eligFormatNum = (n) => n.toLocaleString('en-IN', { maximumFractionDigits:0 });
  const eligFormatDec = (n) => n.toLocaleString('en-IN', { minimumFractionDigits:2, maximumFractionDigits:2 });
  const eligHandleNumInput = (setter) => (e) => {
    const v = e.target.value;
    if (v === '' || /^\d*\.?\d*$/.test(v)) setter(v);
  };

  // ===== Computed Eligibility Values =====
  const eligCoapplicantGrossVal = eligHasCoapplicant ? eligNum(eligCoapplicantGross) : 0;
  const eligTotalDeductions = eligNum(eligPF) + eligNum(eligIncomeTax) + eligNum(eligProfessionTax);
  const eligNetSalary = (eligNum(eligGrossSalary) + eligCoapplicantGrossVal) - eligTotalDeductions;
  const eligNetIncome = eligNetSalary + eligNum(eligRentalIncome);
  const eligTotalExistingEmis = eligBankEmis.reduce((sum, b) => sum + eligNum(b.emi), 0);
  const eligEmiAvailable = (eligNetIncome * eligNum(eligEmiNmiPercent) / 100) - eligTotalExistingEmis;
  const eligMonthlyRate = eligNum(eligRate) / 100 / 12;
  const eligEmiPerLac = eligMonthlyRate > 0 && eligNum(eligPeriod) > 0
    ? (100000 * eligMonthlyRate * Math.pow(1 + eligMonthlyRate, eligNum(eligPeriod))) / (Math.pow(1 + eligMonthlyRate, eligNum(eligPeriod)) - 1)
    : 0;
  const eligEligibleAmount = eligEmiPerLac > 0 ? (Math.max(0, eligEmiAvailable) / eligEmiPerLac) * 100000 : 0;

  const eligAddBankEmi = () => setEligBankEmis([...eligBankEmis, { bank: '', emi: '' }]);
  const eligRemoveBankEmi = (i) => setEligBankEmis(eligBankEmis.filter((_, idx) => idx !== i));
  const eligUpdateBankEmi = (i, field, val) => {
    const updated = [...eligBankEmis];
    updated[i][field] = val;
    setEligBankEmis(updated);
  };

  const handleCheckEligibility = () => setShowEligModal(true);

  const handleDownloadEligPDF = async () => {
    setEligDownloading(true);
    try {
      await downloadEligibilityPDF({
        applicantName: selectedLead?.customerName || 'Applicant',
        loanType: (selectedLead?.loanType || '').replace(/_/g, ' '),
        mobile: selectedLead?.mobile || '',
        pf: eligNum(eligPF),
        incomeTax: eligNum(eligIncomeTax),
        professionTax: eligNum(eligProfessionTax),
        totalDeductions: eligTotalDeductions,
        grossSalary: eligNum(eligGrossSalary),
        netSalary: eligNetSalary,
        rentalIncome: eligNum(eligRentalIncome),
        netIncome: eligNetIncome,
        emiNmiPercent: eligNum(eligEmiNmiPercent),
        bankEmis: eligBankEmis.map(b => ({ bank: b.bank, emi: eligNum(b.emi) })),
        totalExistingEmis: eligTotalExistingEmis,
        emiAvailable: eligEmiAvailable,
        principal: eligNum(eligPrincipal),
        rate: eligNum(eligRate),
        period: eligNum(eligPeriod),
        emiPerLac: eligEmiPerLac,
        eligibleAmount: eligEligibleAmount,
        hasCoapplicant: eligHasCoapplicant,
        coapplicantGross: eligCoapplicantGrossVal,
      });
    } catch (err) {
      setError('Failed to download eligibility report');
    } finally {
      setEligDownloading(false);
    }
  };

  const handleShareEligWhatsApp = () => {
    const name = selectedLead?.customerName || 'Applicant';
    const loanType = (selectedLead?.loanType || '').replace(/_/g, ' ') || '';
    const eligible = eligEligibleAmount > 0 ? eligFormatNum(Math.round(eligEligibleAmount)) : 'Not Eligible';
    const coAppText = eligHasCoapplicant ? `Co-applicant Gross: ${eligFormatNum(eligCoapplicantGrossVal)}\n` : '';
    const msg =
      `*Eligibility Report - ${name}*\n` +
      `${loanType ? `Loan Type: ${loanType}\n` : ''}\n` +
      `*Income Details:*\n` +
      `Gross Salary: ${eligFormatNum(eligNum(eligGrossSalary))}\n` +
      coAppText +
      `Total Deductions: ${eligFormatDec(eligTotalDeductions)}\n` +
      `Net Salary: ${eligFormatDec(eligNetSalary)}\n` +
      `Rental Income: ${eligFormatNum(eligNum(eligRentalIncome))}\n` +
      `Net Income: ${eligFormatDec(eligNetIncome)}\n\n` +
      `*EMI Details:*\n` +
      `EMI/NMI%: ${eligNum(eligEmiNmiPercent)}%\n` +
      `Existing EMIs: ${eligFormatDec(eligTotalExistingEmis)}\n` +
      `EMI Available: ${eligFormatDec(eligEmiAvailable)}\n\n` +
      `*Loan Parameters:*\n` +
      `Rate: ${eligNum(eligRate)}% p.a.\n` +
      `Period: ${eligNum(eligPeriod)} months\n` +
      `EMI per LAC: ${eligFormatDec(eligEmiPerLac)}\n\n` +
      `*Eligible Loan Amount: ${eligible}*`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`);
  };

  // Pre-fill eligibility from AI summary
  const prefillEligibilityFromSummary = () => {
    if (!summary) return;
    try {
      let parsedExtra = null;
      const jsonMatch = summary.match(/```json([\s\S]*?)```/);
      if (jsonMatch && jsonMatch[1]) {
        try {
          const root = JSON.parse(jsonMatch[1].trim());
          parsedExtra = root.extracted_details || null;
        } catch (_) {}
      }

      if (parsedExtra) {
        let foundAny = false;
        if (parsedExtra.gross_income) {
          const val = parseInt(String(parsedExtra.gross_income).replace(/,/g, ''));
          if (val > 0) { setEligGrossSalary(String(val)); foundAny = true; }
        } else if (parsedExtra.monthly_income) {
          const val = parseInt(String(parsedExtra.monthly_income).replace(/,/g, ''));
          if (val > 0) { setEligGrossSalary(String(val)); foundAny = true; }
        }
        if (parsedExtra.pf) {
          const val = parseInt(String(parsedExtra.pf).replace(/,/g, ''));
          if (val > 0) { setEligPF(String(val)); foundAny = true; }
        }
        if (parsedExtra.income_tax) {
          const val = parseInt(String(parsedExtra.income_tax).replace(/,/g, ''));
          if (val > 0) { setEligIncomeTax(String(val)); foundAny = true; }
        }
        if (parsedExtra.profession_tax) {
          const val = parseInt(String(parsedExtra.profession_tax).replace(/,/g, ''));
          if (val > 0) { setEligProfessionTax(String(val)); foundAny = true; }
        }
        if (parsedExtra.rental_income) {
          const val = parseInt(String(parsedExtra.rental_income).replace(/,/g, ''));
          if (val > 0) { setEligRentalIncome(String(val)); foundAny = true; }
        }
        if (foundAny) return;
      }

      // Fallback: regex patterns
      const text = summary.replace(/\*\*/g, '').replace(/\*/g, '');
      const incomePatterns = [
        /(?:gross\s+monthly\s+income|gross\s+salary|gross\s+income|monthly\s+income|salary\s+income|total\s+income)[:\s]*₹?\s*([\d,]+)/i,
        /(?:gross\s+monthly\s+income|gross\s+salary|gross\s+income|monthly\s+income|salary\s+income|total\s+income)[:\s]*rs?\.?\s*([\d,]+)/i,
        /(?:earns|income|salary)(?:\s+is|\s*~|\s*approx(?:imately)?)?\s*(?:₹|rs?\.?)?\s*([\d,]+)\s*(?:per\s+month|\/month|\/pm|monthly)/i
      ];
      let salaryVal = 0;
      for (const pattern of incomePatterns) {
        const match = text.match(pattern);
        if (match) {
          const val = parseInt(match[1].replace(/,/g, ''));
          if (val > 0) { salaryVal = val; break; }
        }
      }
      if (salaryVal > 0) setEligGrossSalary(String(salaryVal));

      const pfPatterns = [
        /(?:provident\s+fund|pf|p\.f\.)[:\s]*₹?\s*([\d,]+)/i,
        /(?:provident\s+fund|pf|p\.f\.)[:\s]*rs?\.?\s*([\d,]+)/i,
        /(?:pf|provident\s+fund)(?:\s+deduction|\s+contribution)?[\s:]*₹?\s*([\d,]+)/i
      ];
      let pfVal = 0;
      for (const pattern of pfPatterns) {
        const match = text.match(pattern);
        if (match) {
          const val = parseInt(match[1].replace(/,/g, ''));
          if (val > 0) { pfVal = val; break; }
        }
      }
      if (pfVal > 0) setEligPF(String(pfVal));

      const taxPatterns = [
        /(?:income\s+tax|tax\s+deduction|tax\s+deducted|tds)[:\s]*₹?\s*([\d,]+)/i,
        /(?:income\s+tax|tax\s+deduction|tds)[:\s]*rs?\.?\s*([\d,]+)/i
      ];
      let taxVal = 0;
      for (const pattern of taxPatterns) {
        const match = text.match(pattern);
        if (match) {
          const val = parseInt(match[1].replace(/,/g, ''));
          if (val > 0) { taxVal = val; break; }
        }
      }
      if (taxVal > 0) setEligIncomeTax(String(taxVal));
    } catch (err) {
      console.error('Failed to parse summary for eligibility:', err);
    }
  };

  // Reset & pre-fill eligibility when lead changes
  useEffect(() => {
    if (!selectedLead) return;
    setEligPF('');
    setEligIncomeTax('');
    setEligProfessionTax('');
    setEligGrossSalary('');
    setEligRentalIncome('');
    setEligEmiNmiPercent('50');
    setEligBankEmis([{ bank: '', emi: '' }]);
    setEligPrincipal('100000');
    setEligRate('8.5');
    setEligPeriod('240');
    setEligCoapplicantGross('');
    setEligHasCoapplicant(selectedLead.hasCoapplicant || false);
    const lt = (selectedLead.loanType || '').toLowerCase();
    if (lt.includes('education')) {
      setEligRate('10.5');
      setEligPeriod('120');
    } else if (lt.includes('lap')) {
      setEligRate('10');
      setEligPeriod('180');
    } else {
      setEligRate('8.5');
      setEligPeriod('240');
    }
  }, [selectedLead?.id]);

  // Pre-fill from AI summary when it changes
  useEffect(() => {
    if (summary) prefillEligibilityFromSummary();
  }, [summary]);

  // ===== Markdown rendering helpers for AI summary =====
  const parseBoldText = (text, searchTerm) => {
    if (typeof text !== 'string') return text;
    const parts = text.split(/(\*\*.*?\*\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i} className="font-semibold text-gray-900">{part.slice(2, -2)}</strong>;
      }
      if (!searchTerm) return part;
      const escaped = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const subParts = part.split(new RegExp(`(${escaped})`, 'gi'));
      return subParts.map((sub, j) =>
        sub.toLowerCase() === searchTerm.toLowerCase()
          ? <mark key={`${i}-${j}`} className="bg-yellow-300 text-gray-900 rounded px-0.5">{sub}</mark>
          : sub
      );
    });
  };

  const renderSummary = (text, searchTerm = '') => {
    if (!text) return null;
    return text.split('\n').map((line, index) => {
      if (line.startsWith('### ')) {
        return <h4 key={index} className="text-md font-bold text-gray-800 mt-4 mb-2">{line.replace('### ', '')}</h4>;
      }
      if (line.startsWith('## ')) {
        return <h3 key={index} className="text-lg font-bold text-indigo-900 mt-5 mb-3 border-b border-indigo-50 pb-1">{line.replace('## ', '')}</h3>;
      }
      if (line.startsWith('# ')) {
        return <h2 key={index} className="text-xl font-bold text-indigo-950 mt-6 mb-4">{line.replace('# ', '')}</h2>;
      }
      if (line.startsWith('- ') || line.startsWith('* ')) {
        const cleanLine = line.replace(/^[-*]\s+/, '');
        return (
          <li key={index} className="ml-6 list-disc text-gray-700 my-1">
            {parseBoldText(cleanLine, searchTerm)}
          </li>
        );
      }
      if (line.trim() === '') {
        return <div key={index} className="h-2" />;
      }
      return <p key={index} className="text-gray-700 my-1 leading-relaxed">{parseBoldText(line, searchTerm)}</p>;
    });
  };

  const stripJsonBlock = (text) => {
    if (!text) return text;
    return text.replace(/```json[\s\S]*?```/g, '').trim();
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
                {editingExpectedAmount ? (
                  <div className="flex items-center gap-2 mt-1">
                    <div className="relative flex-1">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-semibold text-xs">₹</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={editExpectedAmountValue}
                        onChange={(e) => setEditExpectedAmountValue(e.target.value.replace(/[^\d]/g, ''))}
                        className="w-full pl-7 pr-3 py-1.5 text-sm font-semibold border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                        autoFocus
                        onKeyDown={(e) => { if (e.key === 'Enter') handleSaveExpectedAmount(); if (e.key === 'Escape') setEditingExpectedAmount(false); }}
                      />
                    </div>
                    <button onClick={handleSaveExpectedAmount} className="p-1.5 text-blue-700 bg-blue-100 rounded-lg hover:bg-blue-200" title="Save">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                    </button>
                    <button onClick={() => setEditingExpectedAmount(false)} className="p-1.5 text-gray-500 bg-gray-100 rounded-lg hover:bg-gray-200" title="Cancel">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 mt-1">
                    <p className="font-semibold">{selectedLead.expectedAmount ? formatCurrency(selectedLead.expectedAmount) : 'N/A'}</p>
                    <button
                      onClick={() => {
                        setEditExpectedAmountValue(String(selectedLead.expectedAmount || ''));
                        setEditingExpectedAmount(true);
                      }}
                      className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                      title="Edit expected amount"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                    </button>
                  </div>
                )}
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
                <div className="flex items-center justify-between">
                  <span className="text-gray-500 font-medium">Assigned Banks:</span>
                  <button
                    onClick={() => setShowAssignBank(true)}
                    className="text-xs text-blue-700 font-semibold bg-blue-100 px-2.5 py-1 rounded-lg hover:bg-blue-200 transition-all flex items-center gap-1"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                    Assign
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {(selectedLead.bankDetails || selectedLead.assignedBanks || []).length > 0 ? (
                    (selectedLead.bankDetails || selectedLead.assignedBanks || []).map((bank, i) => {
                      const bankName = typeof bank === 'string' ? bank : bank.bankName;
                      const branchName = typeof bank === 'object' ? bank.branchName : null;
                      return (
                        <div key={i} className="flex items-center gap-1 group">
                          <div className="flex flex-col">
                            <span className="bg-green-50 text-green-700 px-2.5 py-1 rounded-lg text-xs font-medium border border-green-100">
                              {bankName}
                            </span>
                            {branchName && (
                              <span className="text-[10px] text-gray-500 mt-0.5 ml-1">Branch: {branchName}</span>
                            )}
                          </div>
                          <button
                            onClick={() => {
                              if (window.confirm(`Remove ${bankName} from assigned banks?`)) {
                                handleRemoveBank(bankName);
                              }
                            }}
                            className="p-0.5 text-red-300 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-all rounded-full hover:bg-red-50"
                            title={`Remove ${bankName}`}
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                          </button>
                        </div>
                      );
                    })
                  ) : (
                    <p className="text-xs text-gray-400 italic">No banks assigned yet</p>
                  )}
                </div>
              </div>
            </div>

            {/* Co-applicants Section */}
            <div className="mt-4 pt-4 border-t border-gray-100">
              <div className="flex items-center justify-between mb-2">
                <span className="text-gray-500 font-medium text-sm">Co-applicants:</span>
                <button
                  onClick={handleStartEditCoapplicants}
                  className="text-xs text-blue-700 font-semibold bg-blue-100 px-2.5 py-1 rounded-lg hover:bg-blue-200 transition-all flex items-center gap-1"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                  Manage
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {(selectedLead.coapplicants || []).length > 0 ? (
                  (selectedLead.coapplicants || []).map((coapp, i) => (
                    <span key={i} className="bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded-lg text-xs font-medium border border-indigo-100">
                      {coapp.name}
                      {coapp.incomeSource && (
                        <span className="ml-1.5 text-indigo-400">({coapp.incomeSource})</span>
                      )}
                    </span>
                  ))
                ) : (
                  <p className="text-xs text-gray-400 italic">No co-applicants added</p>
                )}
              </div>
            </div>

            {/* Assign Bank Inline Form */}
            {showAssignBank && (
              <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-xl">
                <h4 className="text-sm font-bold text-blue-800 mb-3 flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0012 9.75c-2.551 0-5.056.2-7.5.582V21M3 21h18M12 6.75h.008v.008H12V6.75z" />
                  </svg>
                  Assign a Bank
                </h4>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-semibold text-gray-600 mb-1 block">Select Bank</label>
                    <select
                      value={newBankName}
                      onChange={(e) => { setNewBankName(e.target.value); setCustomBankName(''); }}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                    >
                      <option value="">-- Select a bank --</option>
                      <option value="HDFC">HDFC</option>
                      <option value="ICICI">ICICI</option>
                      <option value="SBI">SBI</option>
                      <option value="Axis">Axis</option>
                      <option value="Kotak Mahindra">Kotak Mahindra</option>
                      <option value="Yes Bank">Yes Bank</option>
                      <option value="PNB">PNB</option>
                      <option value="Bank of Baroda">Bank of Baroda</option>
                      <option value="Canara Bank">Canara Bank</option>
                      <option value="Union Bank">Union Bank</option>
                      <option value="Indian Bank">Indian Bank</option>
                      <option value="IDBI">IDBI</option>
                      <option value="Federal Bank">Federal Bank</option>
                      <option value="South Indian Bank">South Indian Bank</option>
                      <option value="DBS">DBS</option>
                      <option value="RBL">RBL</option>
                      <option value="AU Small Finance Bank">AU Small Finance Bank</option>
                      <option value="IndusInd">IndusInd</option>
                      <option value="Bajaj Finserv">Bajaj Finserv</option>
                      <option value="Tata Capital">Tata Capital</option>
                      <option value="LIC Housing Finance">LIC Housing Finance</option>
                      <option value="Aditya Birla Capital">Aditya Birla Capital</option>
                      <option value="other">Other (type below)</option>
                    </select>
                  </div>
                  {newBankName === 'other' && (
                    <div>
                      <label className="text-xs font-semibold text-gray-600 mb-1 block">Custom Bank Name</label>
                      <input
                        type="text"
                        value={customBankName}
                        onChange={(e) => setCustomBankName(e.target.value)}
                        placeholder="Enter bank name..."
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                      />
                    </div>
                  )}
                  <div>
                    <label className="text-xs font-semibold text-gray-600 mb-1 block">Branch Name (optional)</label>
                    <input
                      type="text"
                      value={newBranchName}
                      onChange={(e) => setNewBranchName(e.target.value)}
                      placeholder="e.g. MG Road Branch"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleAssignBank}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold text-sm hover:bg-blue-700 transition-all"
                    >
                      Assign Bank
                    </button>
                    <button
                      onClick={() => { setShowAssignBank(false); setNewBankName(''); setNewBranchName(''); setCustomBankName(''); }}
                      className="px-4 py-2 text-gray-600 bg-gray-100 rounded-lg font-semibold text-sm hover:bg-gray-200 transition-all"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Co-applicants Edit Modal */}
            {editingCoapplicants && (
              <div className="mt-4 p-4 bg-indigo-50 border border-indigo-200 rounded-xl">
                <h4 className="text-sm font-bold text-indigo-800 mb-3 flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Manage Co-applicants
                </h4>
                <div className="space-y-3">
                  {editCoapplicants.length === 0 && (
                    <p className="text-xs text-gray-500 italic">No co-applicants added yet.</p>
                  )}
                  {editCoapplicants.map((coapp, index) => (
                    <div key={index} className="bg-white border border-indigo-100 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold text-indigo-700">Co-applicant #{index + 1}</span>
                        <button
                          onClick={() => handleRemoveCoapplicant(index)}
                          className="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1 block">Full Name</label>
                          <input
                            type="text"
                            value={coapp.name}
                            onChange={(e) => handleUpdateCoapplicant(index, 'name', e.target.value)}
                            placeholder="Co-applicant name"
                            className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1 block">Income Source</label>
                          <select
                            value={coapp.incomeSource}
                            onChange={(e) => handleUpdateCoapplicant(index, 'incomeSource', e.target.value)}
                            className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                          >
                            <option value="salaried">Salaried</option>
                            <option value="nonsalaried">Non-Salaried / Business</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  ))}
                  <button
                    onClick={handleAddCoapplicant}
                    className="text-xs text-indigo-700 font-semibold bg-indigo-100 px-3 py-1.5 rounded-lg hover:bg-indigo-200 transition-all flex items-center gap-1"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                    Add Co-applicant
                  </button>
                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={handleSaveCoapplicants}
                      className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-semibold text-sm hover:bg-indigo-700 transition-all"
                    >
                      Save Co-applicants
                    </button>
                    <button
                      onClick={() => setEditingCoapplicants(false)}
                      className="px-4 py-2 text-gray-600 bg-gray-100 rounded-lg font-semibold text-sm hover:bg-gray-200 transition-all"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}
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
                            <li key={item.id} className={`px-4 py-3 ${uploadedFiles.length > 0 ? 'bg-green-50/50' : item.required ? 'bg-red-50/60' : ''}`}>
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
                                        onClick={() => handleViewDocument(file.id, item.name)}
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

          {/* Customer Profile Analysis Section */}
          <div className="bg-white rounded-2xl shadow-sm border border-indigo-200 overflow-hidden">
            <div className="bg-gradient-to-r from-indigo-700 via-purple-700 to-indigo-800 px-5 sm:px-6 py-4 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white bg-opacity-10 rounded-xl">
                  <svg className={`w-5 h-5 text-white ${summaryLoading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-bold text-lg leading-tight">Full Customer Profile Analysis</h3>
                  <p className="text-xs text-indigo-200">AI-powered analysis from all uploaded documents</p>
                </div>
              </div>
              {uploadedCount > 0 && !summaryLoading && (
                <button
                  onClick={handleGenerateSummary}
                  className="text-xs font-semibold bg-white bg-opacity-20 hover:bg-opacity-30 text-white px-3 py-1.5 rounded-lg transition-all"
                >
                  {summary ? 'Re-Analyze' : 'Analyze Documents'}
                </button>
              )}
            </div>

            <div className="p-5 sm:p-6">
              {summaryLoading ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="relative w-16 h-16 mb-4">
                    <div className="absolute inset-0 rounded-full border-4 border-indigo-100"></div>
                    <div className="absolute inset-0 rounded-full border-4 border-indigo-600 border-t-transparent animate-spin"></div>
                  </div>
                  <p className="font-semibold text-gray-900">Analyzing All Uploaded Files...</p>
                  <p className="text-xs text-gray-500 mt-1 max-w-[280px]">Gemini is parsing documents, verifying data, and conducting credit risk analysis...</p>
                </div>
              ) : summary ? (
                <div className="max-h-[600px] overflow-y-auto pr-1">
                  <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 mb-4 text-xs text-indigo-800 flex items-start gap-2.5">
                    <svg className="w-5 h-5 text-indigo-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div>
                      <strong>AI Inspection Complete.</strong> Analysis based on all uploaded documents has been saved.
                    </div>
                  </div>

                  {extractedProfile && (
                    <div className="bg-indigo-50/50 border border-indigo-100 rounded-2xl p-4 mb-4">
                      <div className="flex items-center gap-2 mb-3 pb-2 border-b border-indigo-100">
                        <span className="flex h-2 w-2 relative">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                        </span>
                        <h4 className="text-xs font-extrabold text-indigo-950 uppercase tracking-wider">AI Verified KYC Profile</h4>
                      </div>
                      <div className="space-y-2 text-xs text-gray-700">
                        <div className="grid grid-cols-3">
                          <span className="font-medium text-gray-500">Full Name</span>
                          <span className="col-span-2 font-semibold text-gray-900">{extractedProfile.full_name || 'N/A'}</span>
                        </div>
                        <div className="grid grid-cols-3">
                          <span className="font-medium text-gray-500">DOB / Gender</span>
                          <span className="col-span-2 font-semibold text-gray-900">
                            {extractedProfile.dob || 'N/A'} {extractedProfile.gender ? `(${extractedProfile.gender})` : ''}
                          </span>
                        </div>
                        <div className="grid grid-cols-3">
                          <span className="font-medium text-gray-500">Aadhaar No</span>
                          <span className="col-span-2 font-semibold text-gray-900 tracking-wider">{extractedProfile.aadhaar_number || 'N/A'}</span>
                        </div>
                        <div className="grid grid-cols-3">
                          <span className="font-medium text-gray-500">PAN Number</span>
                          <span className="col-span-2 font-semibold text-gray-900 tracking-wider">{extractedProfile.pan_number || 'N/A'}</span>
                        </div>
                        <div className="grid grid-cols-3">
                          <span className="font-medium text-gray-500">Address</span>
                          <span className="col-span-2 text-gray-600 leading-normal">{extractedProfile.address || 'N/A'}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Search bar for summary */}
                  <div className="relative mb-4">
                    <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2 shadow-sm focus-within:ring-2 focus-within:ring-indigo-500 focus-within:border-indigo-500 transition-all">
                      <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                      <input
                        type="text"
                        placeholder="Search in profile analysis..."
                        className="flex-1 text-sm text-gray-700 outline-none bg-transparent"
                        value={searchSummary}
                        onChange={(e) => setSearchSummary(e.target.value)}
                      />
                      {searchSummary && (
                        <>
                          <span className="text-xs text-gray-400">
                            {(stripJsonBlock(summary || '').match(new RegExp(searchSummary.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')) || []).length} match{((stripJsonBlock(summary || '').match(new RegExp(searchSummary.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')) || []).length) !== 1 ? 'es' : ''}
                          </span>
                          <button
                            onClick={() => setSearchSummary('')}
                            className="p-0.5 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {renderSummary(stripJsonBlock(summary), searchSummary)}
                </div>
              ) : (
                <div className="text-center py-12 flex flex-col items-center">
                  <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4 text-gray-400">
                    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <h4 className="font-bold text-gray-900 mb-1">No Profile Summary Generated</h4>
                  <p className="text-xs text-gray-500 max-w-xs mb-6">
                    {uploadedCount === 0
                      ? "Upload documents first in the section above, then click 'Analyze Documents' to generate the profile analysis."
                      : "All documents uploaded! Click below to have Gemini analyze and summarize this lead's credit profile."}
                  </p>
                  <button
                    onClick={handleGenerateSummary}
                    disabled={uploadedCount === 0}
                    className={`w-full max-w-xs py-3 rounded-xl font-bold text-sm shadow-md transition-all flex items-center justify-center gap-2 ${
                      uploadedCount === 0
                        ? 'bg-gray-100 text-gray-400 cursor-not-allowed shadow-none'
                        : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-100 hover:shadow-lg'
                    }`}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    Analyze Documents & Summarize
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Eligibility Calculator Section */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5 sm:p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-blue-100 rounded-xl">
                <svg className="w-6 h-6 text-blue-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M15 14h.01M12 14h.01M15 17h.01M12 17h.01M9 11h.01M12 11h.01M15 11h.01M12 11h.01M9 14h.01M12 14h.01M15 14h.01M12 14h.01M9 17h.01M12 17h.01M15 17h.01M12 17h.01" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">Eligibility Calculator</h3>
                <p className="text-sm text-gray-500">Fields auto-populated from AI profile analysis where available</p>
              </div>
            </div>

            <div className="grid lg:grid-cols-2 gap-8">
              {/* Left: Input fields */}
              <div className="space-y-4">
                <div className="bg-gray-50 rounded-2xl p-5">
                  <h4 className="text-sm font-bold text-blue-700 mb-3">Statutory Deductions</h4>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs text-gray-600 mb-1 block">Provident Fund</label>
                      <input type="text" inputMode="decimal" className="w-full border rounded-xl px-3 py-2 text-sm" value={eligPF} onChange={eligHandleNumInput(setEligPF)} placeholder="0" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-600 mb-1 block">Income Tax</label>
                      <input type="text" inputMode="decimal" className="w-full border rounded-xl px-3 py-2 text-sm" value={eligIncomeTax} onChange={eligHandleNumInput(setEligIncomeTax)} placeholder="0" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-600 mb-1 block">Profession Tax</label>
                      <input type="text" inputMode="decimal" className="w-full border rounded-xl px-3 py-2 text-sm" value={eligProfessionTax} onChange={eligHandleNumInput(setEligProfessionTax)} placeholder="0" />
                    </div>
                  </div>
                </div>

                <div className="bg-gray-50 rounded-2xl p-5">
                  <h4 className="text-sm font-bold text-blue-700 mb-3">Income</h4>
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs text-gray-600 mb-1 block">Gross Salary (Monthly)</label>
                      <input type="text" inputMode="decimal" className="w-full border rounded-xl px-3 py-2 text-sm" value={eligGrossSalary} onChange={eligHandleNumInput(setEligGrossSalary)} placeholder="0" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-600 mb-1 block">Proposed Rental Income</label>
                      <input type="text" inputMode="decimal" className="w-full border rounded-xl px-3 py-2 text-sm" value={eligRentalIncome} onChange={eligHandleNumInput(setEligRentalIncome)} placeholder="0" />
                    </div>
                    <div>
                      <label className="flex items-center gap-2 cursor-pointer select-none group">
                        <input
                          type="checkbox"
                          className="w-4 h-4 rounded text-blue-600 border-gray-300 focus:ring-blue-500 cursor-pointer"
                          checked={eligHasCoapplicant}
                          onChange={(e) => { setEligHasCoapplicant(e.target.checked); if (!e.target.checked) setEligCoapplicantGross(''); }}
                        />
                        <span className="text-sm font-medium text-gray-700 group-hover:text-blue-700 transition-colors">
                          Include Co-applicant Income
                        </span>
                      </label>
                      {eligHasCoapplicant && (
                        <div className="mt-2">
                          <label className="text-xs text-gray-600 mb-1 block">
                            Co-applicant Monthly Gross {selectedLead?.coapplicantName ? `(${selectedLead.coapplicantName})` : ''}
                          </label>
                          <input type="text" inputMode="decimal" className="w-full border rounded-xl px-3 py-2 text-sm" value={eligCoapplicantGross} onChange={eligHandleNumInput(setEligCoapplicantGross)} placeholder="0" />
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="bg-gray-50 rounded-2xl p-5">
                  <h4 className="text-sm font-bold text-blue-700 mb-3">EMI Details</h4>
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs text-gray-600 mb-1 block">EMI/NMI % (as per NAI)</label>
                      <input type="text" inputMode="decimal" className="w-full border rounded-xl px-3 py-2 text-sm" value={eligEmiNmiPercent} onChange={eligHandleNumInput(setEligEmiNmiPercent)} placeholder="50" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-600 mb-1 block">Existing Bank EMIs</label>
                      {eligBankEmis.map((item, i) => (
                        <div key={i} className="flex gap-2 mb-2">
                          <input type="text" className="flex-1 border rounded-xl px-3 py-2 text-sm" placeholder="Bank name" value={item.bank} onChange={(e) => eligUpdateBankEmi(i, 'bank', e.target.value)} />
                          <input type="text" inputMode="decimal" className="w-32 border rounded-xl px-3 py-2 text-sm" placeholder="EMI" value={item.emi} onChange={(e) => eligUpdateBankEmi(i, 'emi', e.target.value)} />
                          {eligBankEmis.length > 1 && (
                            <button onClick={() => eligRemoveBankEmi(i)} className="text-red-500 hover:text-red-700 px-2">&times;</button>
                          )}
                        </div>
                      ))}
                      <button onClick={eligAddBankEmi} className="text-xs text-blue-600 hover:underline mt-1">+ Add another</button>
                    </div>
                  </div>
                </div>

                <div className="bg-gray-50 rounded-2xl p-5">
                  <h4 className="text-sm font-bold text-blue-700 mb-3">Loan Parameters</h4>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs text-gray-600 mb-1 block">Principal</label>
                      <input type="text" inputMode="decimal" className="w-full border rounded-xl px-3 py-2 text-sm" value={eligPrincipal} onChange={eligHandleNumInput(setEligPrincipal)} placeholder="100000" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-600 mb-1 block">Rate (% p.a.)</label>
                      <input type="text" inputMode="decimal" className="w-full border rounded-xl px-3 py-2 text-sm" value={eligRate} onChange={eligHandleNumInput(setEligRate)} placeholder="8.5" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-600 mb-1 block">Period (months)</label>
                      <input type="text" inputMode="decimal" className="w-full border rounded-xl px-3 py-2 text-sm" value={eligPeriod} onChange={eligHandleNumInput(setEligPeriod)} placeholder="240" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Right: Calculated Results */}
              <div className="space-y-4">
                <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl p-6 border border-blue-100">
                  <h4 className="text-sm font-bold text-blue-800 mb-4">Calculated Results (live)</h4>
                  <div className="space-y-3">
                    <div className="flex justify-between py-2 border-b border-blue-100">
                      <span className="text-sm text-gray-600">Total Deductions</span>
                      <span className="text-sm font-semibold">₹{eligFormatDec(eligTotalDeductions)}</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-blue-100">
                      <span className="text-sm text-gray-600">Net Salary</span>
                      <span className="text-sm font-semibold">₹{eligFormatDec(eligNetSalary)}</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-blue-100">
                      <span className="text-sm text-gray-600">Net Income</span>
                      <span className="text-sm font-bold text-green-700">₹{eligFormatDec(eligNetIncome)}</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-blue-100">
                      <span className="text-sm text-gray-600">Existing EMIs</span>
                      <span className="text-sm font-semibold">₹{eligFormatDec(eligTotalExistingEmis)}</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-blue-100">
                      <span className="text-sm text-gray-600">EMI Available</span>
                      <span className={`text-sm font-bold ${eligEmiAvailable < 0 ? 'text-red-600' : 'text-blue-700'}`}>₹{eligFormatDec(eligEmiAvailable)}</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-blue-100">
                      <span className="text-sm text-gray-600">EMI per LAC</span>
                      <span className="text-sm font-semibold">₹{eligFormatDec(eligEmiPerLac)}</span>
                    </div>
                    <div className={`mt-4 p-4 rounded-xl text-white text-center ${eligEligibleAmount > 0 ? 'bg-gradient-to-r from-blue-600 to-blue-700' : 'bg-gradient-to-r from-red-500 to-red-600'}`}>
                      <p className="text-xs opacity-80 mb-1">Eligible Loan Amount</p>
                      {eligEligibleAmount > 0 ? (
                        <p className="text-2xl font-bold">₹{eligFormatNum(Math.round(eligEligibleAmount))}</p>
                      ) : (
                        <p className="text-xl font-extrabold tracking-wide">NOT ELIGIBLE</p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={handleCheckEligibility}
                    className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-xl font-semibold text-sm hover:bg-blue-700 shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Check Eligibility
                  </button>
                  <button
                    onClick={handleShareEligWhatsApp}
                    className="px-4 py-3 bg-green-600 text-white rounded-xl font-semibold text-sm hover:bg-green-700 shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                    </svg>
                    Share
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Eligibility Results Modal */}
          {showEligModal && (
            <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50" onClick={() => setShowEligModal(false)}>
              <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between rounded-t-3xl z-10">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-100 rounded-xl">
                      <svg className="w-5 h-5 text-blue-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-gray-900">Eligibility Report</h3>
                      <p className="text-sm text-gray-500">{selectedLead?.customerName} | {(selectedLead?.loanType || '').replace(/_/g, ' ')}</p>
                    </div>
                  </div>
                  <button onClick={() => setShowEligModal(false)} className="text-gray-500 hover:text-gray-700 text-2xl leading-none">&times;</button>
                </div>

                <div className="p-6 space-y-4">
                  <div className="bg-gray-50 rounded-2xl p-5">
                    <h4 className="text-sm font-bold text-gray-800 mb-3 border-b pb-2">Income Details</h4>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Gross Salary (Monthly)</span>
                        <span className="font-semibold">₹{eligFormatNum(eligNum(eligGrossSalary))}</span>
                      </div>
                      {eligHasCoapplicant && (
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">Co-applicant Gross</span>
                          <span className="font-semibold">₹{eligFormatNum(eligCoapplicantGrossVal)}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Proposed Rental Income</span>
                        <span className="font-semibold">₹{eligFormatNum(eligNum(eligRentalIncome))}</span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-gray-50 rounded-2xl p-5">
                    <h4 className="text-sm font-bold text-gray-800 mb-3 border-b pb-2">Statutory Deductions</h4>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Provident Fund</span>
                        <span className="font-semibold">₹{eligFormatNum(eligNum(eligPF))}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Income Tax</span>
                        <span className="font-semibold">₹{eligFormatNum(eligNum(eligIncomeTax))}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Profession Tax</span>
                        <span className="font-semibold">₹{eligFormatNum(eligNum(eligProfessionTax))}</span>
                      </div>
                      <div className="flex justify-between text-sm pt-2 border-t font-bold">
                        <span className="text-gray-800">Total Deductions</span>
                        <span className="text-gray-900">₹{eligFormatDec(eligTotalDeductions)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-green-50 rounded-2xl p-5 border border-green-200">
                    <h4 className="text-sm font-bold text-green-800 mb-3 border-b border-green-200 pb-2">Net Income</h4>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Net Salary</span>
                        <span className="font-semibold">₹{eligFormatDec(eligNetSalary)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">+ Rental Income</span>
                        <span className="font-semibold">₹{eligFormatNum(eligNum(eligRentalIncome))}</span>
                      </div>
                      <div className="flex justify-between text-sm pt-2 border-t border-green-200 font-bold">
                        <span className="text-green-800">Net Income</span>
                        <span className="text-green-700 text-lg">₹{eligFormatDec(eligNetIncome)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-gray-50 rounded-2xl p-5">
                    <h4 className="text-sm font-bold text-gray-800 mb-3 border-b pb-2">EMI Details</h4>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">EMI/NMI %</span>
                        <span className="font-semibold">{eligNum(eligEmiNmiPercent)}%</span>
                      </div>
                      {eligBankEmis.filter(b => b.bank || eligNum(b.emi) > 0).map((b, i) => (
                        <div key={i} className="flex justify-between text-sm">
                          <span className="text-gray-600">{b.bank || `Bank ${i + 1}`}</span>
                          <span className="font-semibold">₹{eligFormatNum(eligNum(b.emi))}</span>
                        </div>
                      ))}
                      <div className="flex justify-between text-sm pt-2 border-t font-bold">
                        <span className="text-gray-800">Total Existing EMIs</span>
                        <span className="text-gray-900">₹{eligFormatDec(eligTotalExistingEmis)}</span>
                      </div>
                      <div className={`flex justify-between text-sm p-2 rounded-lg ${eligEmiAvailable < 0 ? 'bg-red-50' : 'bg-blue-50'}`}>
                        <span className="text-gray-800 font-medium">EMI Available</span>
                        <span className={`font-bold ${eligEmiAvailable < 0 ? 'text-red-600' : 'text-blue-700'}`}>₹{eligFormatDec(eligEmiAvailable)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-gray-50 rounded-2xl p-5">
                    <h4 className="text-sm font-bold text-gray-800 mb-3 border-b pb-2">Loan Parameters</h4>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Principal</span>
                        <span className="font-semibold">₹{eligFormatNum(eligNum(eligPrincipal))}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Rate</span>
                        <span className="font-semibold">{eligNum(eligRate)}% p.a.</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Period</span>
                        <span className="font-semibold">{eligNum(eligPeriod)} months</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">EMI per LAC</span>
                        <span className="font-semibold">₹{eligFormatDec(eligEmiPerLac)}</span>
                      </div>
                    </div>
                  </div>

                  <div className={`p-6 rounded-2xl text-white text-center ${eligEligibleAmount > 0 ? 'bg-gradient-to-r from-blue-600 to-blue-700' : 'bg-gradient-to-r from-red-500 to-red-600'}`}>
                    <p className="text-sm opacity-80 mb-1">Eligible Loan Amount (as per Income)</p>
                    {eligEligibleAmount > 0 ? (
                      <p className="text-3xl font-bold mt-2">₹{eligFormatNum(Math.round(eligEligibleAmount))}</p>
                    ) : (
                      <>
                        <p className="text-4xl font-extrabold mt-2 tracking-wide">NOT ELIGIBLE</p>
                        <p className="text-sm opacity-80 mt-2">Existing EMIs exceed available EMI capacity</p>
                      </>
                    )}
                  </div>

                  <div className="flex gap-3 pt-2">
                    <button
                      onClick={handleDownloadEligPDF}
                      disabled={eligDownloading}
                      className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-xl font-semibold text-sm hover:bg-blue-700 shadow-md hover:shadow-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      {eligDownloading ? 'Downloading...' : 'Download Report'}
                    </button>
                    <button
                      onClick={() => { setShowEligModal(false); setTimeout(handleShareEligWhatsApp, 300); }}
                      className="flex-1 px-4 py-3 bg-green-600 text-white rounded-xl font-semibold text-sm hover:bg-green-700 shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                      </svg>
                      Share to WhatsApp
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
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
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fadeIn"
          onClick={() => { if (viewDoc.url) URL.revokeObjectURL(viewDoc.url); setViewDoc(null); }}
        >
          <div
            className="bg-white rounded-3xl shadow-2xl max-w-5xl w-full mx-4 max-h-[90vh] flex flex-col overflow-hidden animate-slideUp"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header toolbar */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 bg-gray-50/80">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                {/* File type icon */}
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                  viewDoc.mimeType?.includes('pdf')
                    ? 'bg-red-50 text-red-600'
                    : viewDoc.mimeType?.includes('image')
                      ? 'bg-purple-50 text-purple-600'
                      : 'bg-blue-50 text-blue-600'
                }`}>
                  {viewDoc.mimeType?.includes('pdf') ? (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                    </svg>
                  ) : viewDoc.mimeType?.includes('image') ? (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m.75 12l3 3m0 0l3-3m-3 3v-6m-1.5-9H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                    </svg>
                  )}
                </div>
                <div className="min-w-0">
                  <h3 className="text-base font-bold text-gray-900 truncate">{viewDoc.name || 'Document'}</h3>
                  <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
                    {viewDoc.category && (
                      <span className="bg-gray-100 px-1.5 py-0.5 rounded text-[10px] font-medium capitalize">
                        {viewDoc.category.replace(/_/g, ' ')}
                      </span>
                    )}
                    {viewDoc.fileSize !== null && (
                      <span>
                        {viewDoc.fileSize >= 1048576
                          ? `${(viewDoc.fileSize / 1048576).toFixed(1)} MB`
                          : viewDoc.fileSize >= 1024
                            ? `${(viewDoc.fileSize / 1024).toFixed(0)} KB`
                            : `${viewDoc.fileSize} B`}
                      </span>
                    )}
                    {viewDoc.uploadDate && (
                      <span>
                        {new Date(viewDoc.uploadDate).toLocaleDateString('en-IN', {
                          day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
                        })}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1.5 flex-shrink-0">
                {/* Zoom controls — only for PDF and images */}
                {viewDoc.url && !viewDoc.loading && (viewDoc.mimeType?.includes('pdf') || viewDoc.mimeType?.includes('image')) && (
                  <div className="flex items-center gap-0.5 mr-1 bg-white rounded-lg border border-gray-200 shadow-sm">
                    <button
                      onClick={() => setViewDoc(prev => ({ ...prev, zoom: Math.max(0.25, (prev.zoom || 1) - 0.25) }))}
                      className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-l-lg transition-colors"
                      title="Zoom out"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                        <line x1="5" y1="12" x2="19" y2="12" />
                      </svg>
                    </button>
                    <span className="text-[11px] font-semibold text-gray-600 min-w-[38px] text-center select-none">
                      {Math.round((viewDoc.zoom || 1) * 100)}%
                    </span>
                    <button
                      onClick={() => setViewDoc(prev => ({ ...prev, zoom: Math.min(4, (prev.zoom || 1) + 0.25) }))}
                      className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-r-lg transition-colors"
                      title="Zoom in"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                        <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                      </svg>
                    </button>
                    <button
                      onClick={() => setViewDoc(prev => ({ ...prev, zoom: 1 }))}
                      className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors ml-0.5"
                      title="Reset zoom"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M1 5l12-2v13M1 9l12-2M1 13l12-2M1 17l12-2" />
                      </svg>
                    </button>
                  </div>
                )}

                {/* Download */}
                {viewDoc.url && !viewDoc.loading && (
                  <a
                    href={viewDoc.url}
                    download={viewDoc.name || 'document'}
                    className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    title="Download file"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </a>
                )}

                {/* Fullscreen */}
                {viewDoc.url && !viewDoc.loading && (
                  <button
                    onClick={() => {
                      const el = document.querySelector('.doc-preview-iframe') || document.querySelector('.doc-preview-image');
                      if (el && el.requestFullscreen) el.requestFullscreen();
                    }}
                    className="p-2 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                    title="Fullscreen"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                    </svg>
                  </button>
                )}

                {/* Close */}
                <button
                  onClick={() => { if (viewDoc.url) URL.revokeObjectURL(viewDoc.url); setViewDoc(null); }}
                  className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors ml-1"
                  title="Close (Esc)"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Description bar */}
            {viewDoc.description && (
              <div className="px-5 py-2 bg-amber-50/60 border-b border-amber-100 text-xs text-amber-800 flex items-center gap-2">
                <svg className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>{viewDoc.description}</span>
              </div>
            )}

            {/* Document preview area */}
            <div className="flex-1 overflow-auto bg-gray-100/50 flex items-start justify-center p-2 sm:p-4">
              {viewDoc.loading ? (
                <div className="flex flex-col items-center justify-center h-[70vh] text-gray-500">
                  <div className="relative w-14 h-14 mb-4">
                    <div className="absolute inset-0 rounded-full border-[3px] border-gray-200"></div>
                    <div className="absolute inset-0 rounded-full border-[3px] border-blue-500 border-t-transparent animate-spin"></div>
                  </div>
                  <p className="font-semibold text-gray-700 text-sm">Loading document...</p>
                  <p className="text-xs text-gray-400 mt-1">Preparing preview for viewing</p>
                </div>
              ) : viewDoc.mimeType?.includes('image') ? (
                <div
                  className="flex items-start justify-center w-full"
                  style={{ transform: `scale(${viewDoc.zoom || 1})`, transformOrigin: 'top center', transition: 'transform 0.2s ease' }}
                >
                  <img
                    src={viewDoc.url}
                    alt={viewDoc.name || 'Document'}
                    className="doc-preview-image max-w-full rounded-xl shadow-lg border border-gray-200 bg-white"
                    style={{ maxHeight: '75vh' }}
                  />
                </div>
              ) : viewDoc.mimeType?.includes('pdf') ? (
                <div
                  className="w-full h-[75vh] flex flex-col items-center"
                  style={{ transform: `scale(${viewDoc.zoom || 1})`, transformOrigin: 'top center', transition: 'transform 0.2s ease' }}
                >
                  <iframe
                    src={`${viewDoc.url}#view=FitH&navpanes=0&toolbar=0`}
                    title={viewDoc.name || 'Document'}
                    className="doc-preview-iframe w-full h-full rounded-xl shadow-lg border border-gray-200 bg-white"
                  />
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-[60vh] text-gray-500">
                  <svg className="w-20 h-20 mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m.75 12l3 3m0 0l3-3m-3 3v-6m-1.5-9H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                  </svg>
                  <p className="font-semibold text-gray-700 text-sm mb-1">Preview not available</p>
                  <p className="text-xs text-gray-400 mb-4">This file type cannot be previewed in the browser.</p>
                  <a
                    href={viewDoc.url}
                    download={viewDoc.name || 'document'}
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl font-semibold text-sm hover:bg-blue-700 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Download File
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
