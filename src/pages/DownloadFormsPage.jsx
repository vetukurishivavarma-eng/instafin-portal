import React, { useState, useEffect } from 'react';
import { 
  getAvailableKeys, 
  getChecklistByKey, 
  getChecklist, 
  addChecklistItemToFlow, 
  deleteChecklistItemFromFlow, 
  selectionToKey 
} from '../utils/resolver';
import { downloadPDF } from '../export/pdf';
import { useAuth } from '../contexts/AuthContext';
import { ALL_BANKS } from '../data/banks';
import API_BASE from '../config/api';

const loanTypeLabels = {
  home_loan: 'Home Loan',
  lap: 'Loan Against Property (LAP)',
  mudra: 'Mudra Loan',
  msme: 'MSME Loan',
  business_loan: 'Business Loan',
  personal_loan: 'Personal Loan',
  education_loan: 'Education Loan',
};

const loanStatusLabels = {
  new: 'New Loan',
  topup_equity: 'Top-up/Equity',
  takeover: 'Takeover',
  construction: 'Construction',
  mudra: 'Mudra',
};

const incomeSourceLabels = {
  salaried: 'Salaried',
  non_salaried: 'Self Employed / Non-Salaried',
};

const residentTypeLabels = {
  nri: 'NRI',
  indian_resident: 'Indian Resident',
  merchant_navy: 'Merchant Navy',
};

const businessTypeLabels = {
  proprietor: 'Proprietorship',
  partnership: 'Partnership',
  pvt_ltd: 'Private Limited',
  llp: 'LLP',
};

const categoryLabels = {
  kyc: 'KYC Documents',
  income_proof: 'Income Proof',
  business_documents: 'Business Documents',
  property_documents: 'Property Documents',
  financial_documents: 'Financial Documents',
  legal_documents: 'Legal Documents',
  others: 'Others'
};

const BANK_LOAN_TYPES = [
  'Home Loan',
  'Loan Against Property (LAP)',
  'Personal Loan',
  'Business Loan',
  'Mudra Loan',
  'MSME Loan',
  'Education Loan',
  'Auto Loan / Vehicle Loan',
  'Gold Loan',
  'Working Capital Loan',
];

const FILE_TYPE_OPTIONS = ['pdf', 'docx', 'doc'];

export default function DownloadFormsPage() {
  const { user, accessToken, effectiveRole } = useAuth();

  // Tab control: 'checklist' for pre-defined flows, 'builder' for custom criteria, 'bank_forms' for bank application forms
  const [activeTab, setActiveTab] = useState('checklist');

  // ──────────────────────────────────────────────
  // CHECKLIST / BUILDER STATE
  // ──────────────────────────────────────────────
  const [searchTerm, setSearchTerm] = useState('');
  const [loanTypeFilter, setLoanTypeFilter] = useState('');
  const [selectedFlowKey, setSelectedFlowKey] = useState('home_loan|new|salaried|indian_resident');
  const [builderSelection, setBuilderSelection] = useState({
    loanType: 'home_loan',
    loanStatus: 'new',
    incomeSource: 'salaried',
    residentType: 'indian_resident',
    businessType: '',
  });
  const [downloading, setDownloading] = useState(false);
  const [success, setSuccess] = useState('');
  const [refreshTick, setRefreshTick] = useState(0);
  const refreshChecklists = () => setRefreshTick(t => t + 1);

  // Admin Custom additions/deletions states
  const [showAddForm, setShowAddForm] = useState(false);
  const [newDocName, setNewDocName] = useState('');
  const [newDocCategory, setNewDocCategory] = useState('kyc');
  const [newDocRequired, setNewDocRequired] = useState(true);
  const [editingItemId, setEditingItemId] = useState(null);
  const [editDocName, setEditDocName] = useState('');
  const [editDocCategory, setEditDocCategory] = useState('kyc');
  const [editDocRequired, setEditDocRequired] = useState(true);

  // ──────────────────────────────────────────────
  // BANK FORMS STATE
  // ──────────────────────────────────────────────
  const [selectedBank, setSelectedBank] = useState('');
  const [selectedLoanType, setSelectedLoanType] = useState('');
  const [customBankName, setCustomBankName] = useState('');
  const [forms, setForms] = useState([]);
  const [loadingForms, setLoadingForms] = useState(false);
  const [searched, setSearched] = useState(false);
  const [formsError, setFormsError] = useState('');
  const [downloadingId, setDownloadingId] = useState(null);
  const [showAdminPanel, setShowAdminPanel] = useState(false);

  // ──────────────────────────────────────────────
  // LOAN TYPES STATE (moved from Executives page)
  // ──────────────────────────────────────────────
  const [loanTypes, setLoanTypes] = useState([]);
  const [loanTypesLoading, setLoanTypesLoading] = useState(false);
  const [showAddLoanType, setShowAddLoanType] = useState(false);
  const [loanTypeForm, setLoanTypeForm] = useState({ name: '', key: '', description: '' });
  const [editingLoanType, setEditingLoanType] = useState(null);
  const [loanTypeFormErrors, setLoanTypeFormErrors] = useState({});
  const [showAddFormPanel, setShowAddFormPanel] = useState(false);
  const [editingForm, setEditingForm] = useState(null);
  const [formEntry, setFormEntry] = useState({
    bank_name: '',
    loan_type: '',
    form_name: '',
    file_type: 'pdf'
  });
  const [formFile, setFormFile] = useState(null);

  // Fetch bank forms on tab switch to bank
  useEffect(() => {
    if (activeTab === 'bank_forms') {
      fetchBankForms();
    }
  }, [activeTab]);

  const fetchBankForms = async (bank, loanType) => {
    setLoadingForms(true);
    setFormsError('');
    try {
      const params = new URLSearchParams();
      if (bank) params.set('bank', bank);
      if (loanType) params.set('loan_type', loanType);
      params.set('active', 'all');

      const res = await fetch(`${API_BASE}/forms?${params.toString()}`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const data = await res.json();
      if (res.ok) {
        setForms(data.data || []);
        setSearched(true);
      } else {
        setFormsError(data.error || 'Failed to fetch forms');
      }
    } catch (err) {
      setFormsError('Failed to connect to server');
    } finally {
      setLoadingForms(false);
    }
  };

  const handleBankSearch = (e) => {
    e.preventDefault();
    const bank = selectedBank === 'Other' ? customBankName : selectedBank;
    fetchBankForms(bank, selectedLoanType);
  };

  const handleBankReset = () => {
    setSelectedBank('');
    setSelectedLoanType('');
    setCustomBankName('');
    setForms([]);
    setSearched(false);
    setFormsError('');
    setSuccess('');
  };

  const handleFormDownload = async (formId) => {
    setDownloadingId(formId);
    setFormsError('');
    setSuccess('');
    try {
      const res = await fetch(`${API_BASE}/forms/${formId}/download`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      if (!res.ok) {
        const err = await res.json();
        setFormsError(err.error || 'Failed to download form');
        return;
      }

      const disposition = res.headers.get('Content-Disposition');
      let filename = 'form.pdf';
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
    } catch (err) {
      setFormsError('Failed to download form');
    } finally {
      setDownloadingId(null);
    }
  };

  const readFileAsBase64 = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const resetFormEntry = () => {
    setFormEntry({ bank_name: '', loan_type: '', form_name: '', file_type: 'pdf' });
    setFormFile(null);
  };

  // ──────────────────────────────────────────────
  // LOAN TYPES API
  // ──────────────────────────────────────────────
  const loadLoanTypes = async () => {
    setLoanTypesLoading(true);
    try {
      const res = await fetch(`${API_BASE}/loan-types`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const data = await res.json();
      setLoanTypes(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load loan types:', err);
    } finally {
      setLoanTypesLoading(false);
    }
  };

  useEffect(() => {
    if (!accessToken) return;
    loadLoanTypes();
  }, [accessToken]);

  const handleSaveLoanType = async (e) => {
    e.preventDefault();
    setErrors('');
    setSuccess('');

    const errors = {};
    if (!loanTypeForm.name.trim()) errors.name = 'Name is required';
    if (!loanTypeForm.key.trim()) errors.key = 'Key is required';
    setLoanTypeFormErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setLoanTypesLoading(true);
    try {
      const url = editingLoanType
        ? `${API_BASE}/loan-types/${editingLoanType.id}`
        : `${API_BASE}/loan-types`;
      const method = editingLoanType ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify(loanTypeForm)
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to save loan type');
        return;
      }

      setSuccess(editingLoanType ? 'Loan type updated!' : 'Loan type created!');
      setShowAddLoanType(false);
      setEditingLoanType(null);
      setLoanTypeForm({ name: '', key: '', description: '' });
      loadLoanTypes();
    } catch (err) {
      setError('Failed to save loan type');
    } finally {
      setLoanTypesLoading(false);
    }
  };

  const handleDeleteLoanType = async (id) => {
    if (!window.confirm('Are you sure you want to delete this loan type? This may affect existing leads.')) return;

    setLoanTypesLoading(true);
    try {
      const res = await fetch(`${API_BASE}/loan-types/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to delete loan type');
        return;
      }

      setSuccess('Loan type deleted!');
      loadLoanTypes();
    } catch (err) {
      setError('Failed to delete loan type');
    } finally {
      setLoanTypesLoading(false);
    }
  };

  // Bank forms admin handlers
  const handleAddForm = async (e) => {
    e.preventDefault();
    if (!formEntry.bank_name || !formEntry.loan_type || !formEntry.form_name) {
      setFormsError('Bank name, loan type, and form name are required');
      return;
    }
    if (!formFile) {
      setFormsError('Please select a file to upload');
      return;
    }

    setLoadingForms(true);
    setFormsError('');
    try {
      const fileData = await readFileAsBase64(formFile);
      const ext = formFile.name.split('.').pop().toLowerCase();
      const fileType = ext === 'docx' ? 'docx' : ext === 'doc' ? 'doc' : 'pdf';

      const res = await fetch(`${API_BASE}/forms`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          bank_name: formEntry.bank_name,
          loan_type: formEntry.loan_type,
          form_name: formEntry.form_name,
          file_type: fileType,
          file_data: fileData
        })
      });

      const data = await res.json();
      if (res.ok) {
        setSuccess(`Form "${formEntry.form_name}" added successfully!`);
        setShowAddFormPanel(false);
        resetFormEntry();
        fetchBankForms();
      } else {
        setFormsError(data.error || 'Failed to add form');
      }
    } catch (err) {
      setFormsError('Failed to add form');
    } finally {
      setLoadingForms(false);
    }
  };

  const handleUpdateForm = async (e) => {
    e.preventDefault();
    if (!editingForm) return;

    setLoadingForms(true);
    setFormsError('');
    try {
      const body = {
        bank_name: editingForm.bank_name,
        loan_type: editingForm.loan_type,
        form_name: editingForm.form_name,
        file_type: editingForm.file_type
      };

      if (formFile) {
        const fileData = await readFileAsBase64(formFile);
        body.file_data = fileData;
      }

      const res = await fetch(`${API_BASE}/forms/${editingForm.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify(body)
      });

      const data = await res.json();
      if (res.ok) {
        setSuccess(`Form "${editingForm.form_name}" updated successfully!`);
        setEditingForm(null);
        setFormFile(null);
        fetchBankForms();
      } else {
        setFormsError(data.error || 'Failed to update form');
      }
    } catch (err) {
      setFormsError('Failed to update form');
    } finally {
      setLoadingForms(false);
    }
  };

  const handleToggleForm = async (formId) => {
    if (!window.confirm('Are you sure you want to toggle this form\'s availability?')) return;

    try {
      const res = await fetch(`${API_BASE}/forms/${formId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      if (res.ok) {
        setSuccess('Form status updated!');
        fetchBankForms();
      } else {
        const err = await res.json();
        setFormsError(err.error || 'Failed to toggle form');
      }
    } catch (err) {
      setFormsError('Failed to update form status');
    }
  };

  // ──────────────────────────────────────────────
  // CHECKLIST LOGIC (fully preserved from original)
  // ──────────────────────────────────────────────

  const handleLoanTypeChange = (loanType) => {
    setBuilderSelection(p => ({
      ...p,
      loanType,
      loanStatus: 'new',
      incomeSource: loanType === 'msme' ? '' : 'salaried',
      residentType: loanType === 'msme' ? '' : 'indian_resident',
      businessType: '',
    }));
  };

  const handleAddItemSubmit = (e) => {
    e.preventDefault();
    if (!newDocName.trim()) return;

    const key = activeTab === 'checklist' ? selectedFlowKey : selectionToKey(builderSelection);
    if (!key) return;

    const generatedId = 'cust_' + newDocName.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '') + '_' + Date.now();

    const newItem = {
      id: generatedId,
      name: newDocName.trim(),
      category: newDocCategory,
      required: newDocRequired
    };

    addChecklistItemToFlow(key, newItem);
    setNewDocName('');
    setSuccess(`"${newItem.name}" added successfully to this checklist flow!`);
    setTimeout(() => setSuccess(''), 3000);
    refreshChecklists();
  };

  const handleDeleteItem = (itemId) => {
    const key = activeTab === 'checklist' ? selectedFlowKey : selectionToKey(builderSelection);
    if (!key) return;
    deleteChecklistItemFromFlow(key, itemId);
    setSuccess('Document removed successfully!');
    setTimeout(() => setSuccess(''), 3000);
    refreshChecklists();
  };

  const startEditingItem = (item) => {
    setEditingItemId(item.id);
    setEditDocName(item.name);
    setEditDocCategory(item.category || 'kyc');
    setEditDocRequired(item.required);
  };

  const handleEditItemSubmit = (itemId) => {
    if (!editDocName.trim()) return;

    const key = activeTab === 'checklist' ? selectedFlowKey : selectionToKey(builderSelection);
    if (!key) return;

    const modifiedItem = {
      id: itemId,
      name: editDocName.trim(),
      category: editDocCategory,
      required: editDocRequired
    };

    if (!itemId.startsWith('cust_')) {
      deleteChecklistItemFromFlow(key, itemId);
    }
    addChecklistItemToFlow(key, modifiedItem);

    setEditingItemId(null);
    setSuccess(`"${modifiedItem.name}" updated successfully!`);
    setTimeout(() => setSuccess(''), 3000);
    refreshChecklists();
  };

  const allFlowKeys = getAvailableKeys();

  const parseFlowKey = (key) => {
    const parts = key.split('|');
    const loanType = parts[0] || '';
    const loanStatus = parts[1] || '';
    if (loanType === 'msme') {
      return {
        loanType,
        loanStatus,
        incomeSource: 'non_salaried',
        residentType: 'indian_resident',
        businessType: parts[2] || '',
      };
    }
    return {
      loanType,
      loanStatus,
      incomeSource: parts[2] || '',
      residentType: parts[3] || '',
      businessType: parts[4] || '',
    };
  };

  const filteredFlowKeys = allFlowKeys.filter(key => {
    const parsed = parseFlowKey(key);
    const textMatch = !searchTerm || key.toLowerCase().includes(searchTerm.toLowerCase()) || 
      (loanTypeLabels[parsed.loanType] && loanTypeLabels[parsed.loanType].toLowerCase().includes(searchTerm.toLowerCase()));
    const typeMatch = !loanTypeFilter || parsed.loanType === loanTypeFilter;
    return textMatch && typeMatch;
  });

  const _tick = refreshTick;
  let previewItems = [];
  let previewSelection = {};

  if (activeTab === 'checklist') {
    previewItems = getChecklistByKey(selectedFlowKey) || [];
    previewSelection = parseFlowKey(selectedFlowKey);
  } else if (activeTab === 'builder') {
    if (builderSelection.loanType === 'msme' && !builderSelection.businessType) {
      previewItems = [];
    } else {
      previewItems = getChecklist(builderSelection) || [];
    }
    previewSelection = builderSelection;
  }

  const handleDownload = async (selection, items, filenamePrefix) => {
    setDownloading(true);
    setSuccess('');
    try {
      await downloadPDF(selection, items);
      setSuccess('PDF checklist downloaded successfully!');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      console.error('PDF Download error:', err);
    } finally {
      setDownloading(false);
    }
  };

  const groupItems = (items) => {
    const grouped = {};
    items.forEach(item => {
      const cat = item.category || 'others';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(item);
    });
    return grouped;
  };

  const groupedPreviewItems = groupItems(previewItems);

  // ──────────────────────────────────────────────
  // RENDER
  // ──────────────────────────────────────────────

  return (
    <div className="py-12 px-6 min-h-screen bg-gradient-mesh animate-fade-in-up">
      {/* Header */}
      <div className="mb-6 max-w-6xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-extrabold text-gray-900 tracking-tight">Download Forms</h1>
          <p className="text-gray-500 font-semibold mt-1">
            {activeTab === 'bank_forms'
              ? 'Search and download loan application forms from Indian banks and financial institutions.'
              : 'Preview and download structured loan checklist PDF forms for compliance and routing.'}
          </p>
        </div>
        {activeTab === 'bank_forms' && effectiveRole === 'admin' && (
          <button
            onClick={() => setShowAdminPanel(!showAdminPanel)}
            className={`px-5 py-3 rounded-2xl font-bold transition-all flex items-center gap-2 ${
              showAdminPanel
                ? 'bg-indigo-100 text-indigo-700 border border-indigo-200'
                : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-md shadow-indigo-500/10'
            }`}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
            </svg>
            {showAdminPanel ? 'Hide Admin Panel' : 'Manage Forms'}
          </button>
        )}
      </div>

      {/* Success / Error notifications */}
      {success && (
        <div className="bg-green-100 border border-green-300 text-green-700 px-6 py-4 rounded-3xl mb-6 max-w-6xl mx-auto shadow-sm animate-fade-in-up">
          {success}
        </div>
      )}
      {formsError && activeTab === 'bank_forms' && (
        <div className="bg-red-100 border border-red-300 text-red-700 px-6 py-4 rounded-3xl mb-6 max-w-6xl mx-auto shadow-sm animate-fade-in-up">
          {formsError}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-4 max-w-6xl mx-auto mb-8 border-b pb-4">
        <button
          onClick={() => { setActiveTab('checklist'); setSuccess(''); }}
          className={`px-6 py-3 rounded-2xl font-bold transition-all text-sm flex items-center gap-2 ${
            activeTab === 'checklist'
              ? 'bg-blue-700 text-white shadow-md shadow-blue-500/10'
              : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
          }`}
        >
          📂 All Checklists ({allFlowKeys.length})
        </button>
        <button
          onClick={() => { setActiveTab('builder'); setSuccess(''); }}
          className={`px-6 py-3 rounded-2xl font-bold transition-all text-sm flex items-center gap-2 ${
            activeTab === 'builder'
              ? 'bg-blue-700 text-white shadow-md shadow-blue-500/10'
              : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
          }`}
        >
          ⚙️ Interactive Criteria Builder
        </button>
        <button
          onClick={() => { setActiveTab('bank_forms'); setSuccess(''); }}
          className={`px-6 py-3 rounded-2xl font-bold transition-all text-sm flex items-center gap-2 ${
            activeTab === 'bank_forms'
              ? 'bg-blue-700 text-white shadow-md shadow-blue-500/10'
              : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
          }`}
        >
          🏦 Bank Application Forms
        </button>
        <button
          onClick={() => { setActiveTab('loan_types'); setSuccess(''); }}
          className={`px-6 py-3 rounded-2xl font-bold transition-all text-sm flex items-center gap-2 ${
            activeTab === 'loan_types'
              ? 'bg-blue-700 text-white shadow-md shadow-blue-500/10'
              : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
          }`}
        >
          🏷️ Loan Types ({loanTypes.length})
        </button>
      </div>

      {/* ──────────────────────────────────────── */}
      {/* TAB 1: ALL CHECKLISTS (BROWSE)          */}
      {/* ──────────────────────────────────────── */}
      {(activeTab === 'checklist' || activeTab === 'builder') && (
        <div className="grid lg:grid-cols-12 gap-8 max-w-6xl mx-auto items-start">
          {/* LEFT COLUMN */}
          <div className="lg:col-span-5 space-y-6">
            {activeTab === 'checklist' ? (
              <div className="bg-white rounded-3xl p-6 border border-gray-150 shadow-sm space-y-4">
                <h2 className="text-xl font-bold text-gray-900">Search Pre-defined Flows</h2>
                <div className="flex flex-col gap-3">
                  <input 
                    type="text"
                    placeholder="Filter by keyword (e.g. salaried, nri)..."
                    className="border rounded-2xl px-4 py-3 text-sm bg-gray-50/50 w-full focus:ring-2 focus:ring-blue-100"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                  />
                  <select
                    className="border rounded-2xl px-4 py-3 text-sm bg-gray-50/50 font-semibold w-full focus:ring-2 focus:ring-blue-100"
                    value={loanTypeFilter}
                    onChange={e => setLoanTypeFilter(e.target.value)}
                  >
                    <option value="">All Loan Types</option>
                    {Object.entries(loanTypeLabels).map(([key, label]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                </div>
                <div className="border border-gray-150 rounded-2xl overflow-hidden max-h-[420px] overflow-y-auto divide-y divide-gray-100 shadow-inner">
                  {filteredFlowKeys.length > 0 ? (
                    filteredFlowKeys.map(key => {
                      const parsed = parseFlowKey(key);
                      const isSelected = selectedFlowKey === key;
                      return (
                        <button
                          key={key}
                          onClick={() => setSelectedFlowKey(key)}
                          className={`w-full text-left p-4 hover:bg-gray-50/50 transition-colors flex flex-col gap-1.5 ${
                            isSelected ? 'bg-indigo-50/70 border-l-4 border-indigo-600' : ''
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className={`text-xs font-black uppercase tracking-wider px-2 py-0.5 rounded-md ${
                              isSelected ? 'bg-indigo-200 text-indigo-800' : 'bg-gray-100 text-gray-600'
                            }`}>
                              {loanTypeLabels[parsed.loanType] || parsed.loanType}
                            </span>
                            <span className="text-[10px] text-gray-400 font-semibold">{loanStatusLabels[parsed.loanStatus] || parsed.loanStatus}</span>
                          </div>
                          {parsed.loanType === 'msme' ? (
                            <span className="text-sm font-bold text-gray-900 leading-tight">
                              {businessTypeLabels[parsed.businessType] || 'Self Employed'}
                            </span>
                          ) : (
                            <span className="text-sm font-bold text-gray-900 leading-tight">
                              {incomeSourceLabels[parsed.incomeSource]} ({residentTypeLabels[parsed.residentType]})
                            </span>
                          )}
                          {parsed.businessType && parsed.loanType !== 'msme' && (
                            <span className="text-xs text-indigo-750 font-bold bg-indigo-50 border border-indigo-100/60 px-2 py-0.5 rounded-full self-start shadow-sm mt-0.5">
                              💼 Structure: {businessTypeLabels[parsed.businessType]}
                            </span>
                          )}
                        </button>
                      );
                    })
                  ) : (
                    <div className="p-8 text-center text-gray-400 font-semibold">No matching flows found in code.</div>
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-3xl p-6 border border-gray-150 shadow-sm space-y-5">
                <h2 className="text-xl font-bold text-gray-900">Custom Criteria Selector</h2>
                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1 block">Loan Type *</label>
                    <select
                      className="border rounded-2xl px-4 py-3 w-full bg-gray-50/50 font-bold focus:ring-2 focus:ring-blue-100"
                      value={builderSelection.loanType}
                      onChange={e => handleLoanTypeChange(e.target.value)}
                    >
                      {Object.entries(loanTypeLabels).map(([k, v]) => (
                        <option key={k} value={k}>{v}</option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1 block">Loan Status *</label>
                      <select
                        className="border rounded-2xl px-4 py-3 w-full bg-gray-50/50 font-semibold focus:ring-2 focus:ring-blue-100"
                        value={builderSelection.loanStatus}
                        onChange={e => setBuilderSelection(p => ({ ...p, loanStatus: e.target.value }))}
                      >
                        <option value="new">New Loan</option>
                        <option value="takeover">Takeover</option>
                        <option value="construction">Construction</option>
                        <option value="topup_equity">Top-up/Equity</option>
                      </select>
                    </div>
                    {builderSelection.loanType !== 'msme' && (
                      <div>
                        <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1 block">Resident Type *</label>
                        <select
                          className="border rounded-2xl px-4 py-3 w-full bg-gray-50/50 font-semibold focus:ring-2 focus:ring-blue-100"
                          value={builderSelection.residentType}
                          onChange={e => setBuilderSelection(p => ({ ...p, residentType: e.target.value }))}
                        >
                          <option value="indian_resident">Indian Resident</option>
                          <option value="nri">NRI</option>
                          <option value="merchant_navy">Merchant Navy</option>
                        </select>
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    {builderSelection.loanType !== 'msme' && (
                      <div>
                        <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1 block">Income Source *</label>
                        <select
                          className="border rounded-2xl px-4 py-3 w-full bg-gray-50/50 font-semibold focus:ring-2 focus:ring-blue-100"
                          value={builderSelection.incomeSource}
                          onChange={e => {
                            const source = e.target.value;
                            setBuilderSelection(p => ({ 
                              ...p, 
                              incomeSource: source, 
                              businessType: source === 'salaried' ? '' : 'proprietor' 
                            }));
                          }}
                        >
                          <option value="salaried">Salaried</option>
                          <option value="non_salaried">Self Employed</option>
                        </select>
                      </div>
                    )}
                    {builderSelection.loanType === 'msme' ? (
                      <div>
                        <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1 block">Business Structure *</label>
                        <select
                          className="border rounded-2xl px-4 py-3 w-full bg-gray-50/50 font-semibold focus:ring-2 focus:ring-blue-100"
                          value={builderSelection.businessType}
                          onChange={e => setBuilderSelection(p => ({ ...p, businessType: e.target.value }))}
                        >
                          <option value="">Select Structure</option>
                          <option value="proprietor">Proprietorship</option>
                          <option value="partnership">Partnership</option>
                          <option value="pvt_ltd">Private Limited</option>
                          <option value="llp">LLP</option>
                        </select>
                      </div>
                    ) : (builderSelection.incomeSource === 'non_salaried' && (
                      <div>
                        <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1 block">Business Structure *</label>
                        <select
                          className="border rounded-2xl px-4 py-3 w-full bg-gray-50/50 font-semibold focus:ring-2 focus:ring-blue-100"
                          value={builderSelection.businessType}
                          onChange={e => setBuilderSelection(p => ({ ...p, businessType: e.target.value }))}
                        >
                          <option value="proprietor">Proprietorship</option>
                          <option value="partnership">Partnership</option>
                          <option value="pvt_ltd">Private Limited</option>
                          <option value="llp">LLP</option>
                        </select>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* RIGHT COLUMN: PREVIEW & DOWNLOAD */}
          <div className="lg:col-span-7 bg-white rounded-3xl p-8 border border-gray-150 shadow-md space-y-6">
            <div className="flex flex-wrap gap-4 items-start justify-between border-b pb-5">
              <div>
                <span className="text-[10px] uppercase font-black tracking-widest text-indigo-600 bg-indigo-50 border border-indigo-100 px-3 py-1 rounded-full shadow-sm">
                  Active Checklist Preview
                </span>
                <h2 className="text-2xl font-black text-gray-900 mt-3">
                  {loanTypeLabels[previewSelection.loanType] || previewSelection.loanType} Checklists
                </h2>
                <p className="text-xs text-gray-500 font-semibold mt-1 flex flex-wrap items-center gap-1.5">
                  📁 {loanStatusLabels[previewSelection.loanStatus] || previewSelection.loanStatus}
                  {previewSelection.loanType === 'msme' ? (
                    <>
                      {previewSelection.businessType && (
                        <><span className="text-gray-300">•</span> 💼 {businessTypeLabels[previewSelection.businessType]}</>
                      )}
                    </>
                  ) : (
                    <>
                      <span className="text-gray-300">•</span> 👤 {incomeSourceLabels[previewSelection.incomeSource]}
                      <span className="text-gray-300">•</span> 🌎 {residentTypeLabels[previewSelection.residentType]}
                      {previewSelection.businessType && (
                        <><span className="text-gray-300">•</span> 💼 {businessTypeLabels[previewSelection.businessType]}</>
                      )}
                    </>
                  )}
                </p>
              </div>
              <button
                onClick={() => handleDownload(previewSelection, previewItems, 'checklist')}
                disabled={previewItems.length === 0 || downloading}
                className="px-6 py-3.5 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-700 hover:from-blue-700 hover:to-indigo-850 text-white font-bold text-sm shadow-lg shadow-blue-500/10 hover-lift transition-all flex items-center gap-2 disabled:opacity-50"
              >
                {downloading ? (
                  <>
                    <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Compiling PDF...
                  </>
                ) : (
                  <>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                    Download Form
                  </>
                )}
              </button>
            </div>

            {/* Stats Badge Panel */}
            <div className="grid grid-cols-3 gap-4 bg-gray-50 border border-gray-100 rounded-2xl p-4 text-center">
              <div className="flex flex-col">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Total Items</span>
                <span className="text-xl font-extrabold text-gray-900 mt-0.5">{previewItems.length}</span>
              </div>
              <div className="flex flex-col border-x border-gray-200">
                <span className="text-[10px] font-bold text-amber-600 uppercase tracking-wide">Required</span>
                <span className="text-xl font-extrabold text-amber-800 mt-0.5">
                  {previewItems.filter(i => i.required).length}
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Optional</span>
                <span className="text-xl font-extrabold text-gray-600 mt-0.5">
                  {previewItems.filter(i => !i.required).length}
                </span>
              </div>
            </div>

            {/* Admin Custom Document Addition Console */}
            {user?.role === 'admin' && (
              <div className="bg-indigo-50/40 border border-indigo-150 rounded-2xl p-5 space-y-3 mb-6 shadow-sm">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-black text-indigo-950 uppercase tracking-widest flex items-center gap-1.5">
                    🛡️ Admin Console: Add File Requirement
                  </h3>
                  <button
                    onClick={() => setShowAddForm(!showAddForm)}
                    className="text-xs font-black text-indigo-600 hover:text-indigo-850 px-3 py-1 rounded-lg bg-indigo-100/50 hover:bg-indigo-100 transition-colors"
                  >
                    {showAddForm ? 'Hide Form' : 'Show Add Form'}
                  </button>
                </div>
                {showAddForm && (
                  <form onSubmit={handleAddItemSubmit} className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end pt-2 border-t border-indigo-100">
                    <div className="md:col-span-5 space-y-1.5">
                      <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Document Name</label>
                      <input 
                        type="text"
                        required
                        placeholder="e.g. Income Tax Acknowledgment"
                        className="border border-indigo-150 rounded-xl px-3 py-2 text-xs bg-white w-full focus:ring-2 focus:ring-indigo-100 outline-none"
                        value={newDocName}
                        onChange={e => setNewDocName(e.target.value)}
                      />
                    </div>
                    <div className="md:col-span-4 space-y-1.5">
                      <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Category</label>
                      <select
                        className="border border-indigo-150 rounded-xl px-3 py-2 text-xs bg-white font-bold w-full focus:ring-2 focus:ring-indigo-100 outline-none"
                        value={newDocCategory}
                        onChange={e => setNewDocCategory(e.target.value)}
                      >
                        {Object.entries(categoryLabels).map(([k, v]) => (
                          <option key={k} value={k}>{v}</option>
                        ))}
                      </select>
                    </div>
                    <div className="md:col-span-3 flex items-center justify-between gap-2 h-[38px] pb-1">
                      <label className="flex items-center gap-1.5 cursor-pointer select-none">
                        <input 
                          type="checkbox" 
                          className="rounded text-indigo-650 focus:ring-indigo-500"
                          checked={newDocRequired}
                          onChange={e => setNewDocRequired(e.target.checked)}
                        />
                        <span className="text-xs font-bold text-gray-700">Required</span>
                      </label>
                      <button
                        type="submit"
                        className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-750 text-white font-bold text-xs shadow-sm transition-all"
                      >
                        Add File
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}

            {/* Checklist preview sections */}
            <div className="space-y-6 max-h-[460px] overflow-y-auto pr-2 scrollbar-thin">
              {previewItems.length > 0 ? (
                Object.entries(groupedPreviewItems).map(([cat, list]) => (
                  <div key={cat} className="border border-gray-150 rounded-2xl overflow-hidden shadow-sm bg-white">
                    <div className="bg-gray-50 border-b border-gray-150 px-5 py-3 flex justify-between items-center">
                      <span className="font-extrabold text-gray-800 text-sm">{categoryLabels[cat] || cat}</span>
                      <span className="text-[10px] font-bold text-gray-500 bg-gray-200/60 px-2 py-0.5 rounded-full">{list.length} items</span>
                    </div>
                    <ul className="divide-y divide-gray-100 text-sm">
                      {list.map(item => {
                        const isEditing = editingItemId === item.id;
                        if (isEditing) {
                          return (
                            <li key={item.id} className="p-4 bg-indigo-50/30 border border-indigo-100 rounded-xl space-y-3 m-2 animate-fade-in">
                              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                                <div className="md:col-span-5 space-y-1">
                                  <label className="text-[9px] font-bold text-gray-500 uppercase tracking-wider">Document Name</label>
                                  <input 
                                    type="text"
                                    className="border border-indigo-150 rounded-xl px-2.5 py-1.5 text-xs bg-white w-full focus:ring-2 focus:ring-indigo-100 outline-none font-bold"
                                    value={editDocName}
                                    onChange={e => setEditDocName(e.target.value)}
                                  />
                                </div>
                                <div className="md:col-span-4 space-y-1">
                                  <label className="text-[9px] font-bold text-gray-500 uppercase tracking-wider">Category</label>
                                  <select
                                    className="border border-indigo-150 rounded-xl px-2.5 py-1.5 text-xs bg-white font-bold w-full focus:ring-2 focus:ring-indigo-100 outline-none"
                                    value={editDocCategory}
                                    onChange={e => setEditDocCategory(e.target.value)}
                                  >
                                    {Object.entries(categoryLabels).map(([k, v]) => (
                                      <option key={k} value={k}>{v}</option>
                                    ))}
                                  </select>
                                </div>
                                <div className="md:col-span-3 flex items-center justify-between gap-2 h-[34px]">
                                  <label className="flex items-center gap-1.5 cursor-pointer select-none">
                                    <input 
                                      type="checkbox" 
                                      className="rounded text-indigo-650 focus:ring-indigo-500"
                                      checked={editDocRequired}
                                      onChange={e => setEditDocRequired(e.target.checked)}
                                    />
                                    <span className="text-xs font-bold text-gray-700">Required</span>
                                  </label>
                                  <div className="flex gap-1.5">
                                    <button
                                      onClick={() => handleEditItemSubmit(item.id)}
                                      className="px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white font-bold text-[10px] shadow-sm transition-all"
                                    >
                                      Save
                                    </button>
                                    <button
                                      onClick={() => setEditingItemId(null)}
                                      className="px-3 py-1.5 rounded-lg bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold text-[10px] transition-all"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </li>
                          );
                        }
                        return (
                          <li key={item.id} className="p-4 flex items-center justify-between gap-4 hover:bg-gray-50/20 transition-colors">
                            <span className="font-bold text-gray-800 leading-snug">{item.name}</span>
                            <div className="flex items-center gap-3.5">
                              <span className={`px-2.5 py-0.5 text-[9px] font-black uppercase tracking-wider rounded-full shadow-sm ${
                                item.required ? 'bg-red-50 text-red-700 border border-red-100' : 'bg-gray-50 text-gray-500 border border-gray-150'
                              }`}>
                                {item.required ? 'Required' : 'Optional'}
                              </span>
                              {user?.role === 'admin' && (
                                <div className="flex items-center gap-1.5">
                                  <button
                                    onClick={() => startEditingItem(item)}
                                    title="Modify document requirement"
                                    className="text-indigo-600 hover:text-indigo-850 p-1.5 rounded-xl hover:bg-indigo-50 transition-all flex items-center justify-center"
                                  >
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                      <path d="M12 20h9" />
                                      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                                    </svg>
                                  </button>
                                  <button
                                    onClick={() => handleDeleteItem(item.id)}
                                    title="Delete document requirement"
                                    className="text-red-500 hover:text-red-750 p-1.5 rounded-xl hover:bg-red-50 transition-all flex items-center justify-center"
                                  >
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                      <polyline points="3 6 5 6 21 6" />
                                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                      <line x1="10" y1="11" x2="10" y2="17" />
                                      <line x1="14" y1="11" x2="14" y2="17" />
                                    </svg>
                                  </button>
                                </div>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))
              ) : (
                <div className="p-16 border border-dashed rounded-3xl text-center text-gray-400 bg-gray-50/50 font-semibold text-lg">
                  No items match this combination.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────── */}
      {/* TAB 4: LOAN TYPES MANAGEMENT             */}
      {/* ──────────────────────────────────────── */}
      {activeTab === 'loan_types' && (
        <div className="max-w-6xl mx-auto">
          <div className="bg-white rounded-3xl shadow-xl p-6 border border-gray-150">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-bold text-gray-900">Loan Types Management</h2>
                <p className="text-sm text-gray-500 mt-1">Manage loan types available in the Add Lead form for executives.</p>
              </div>
              <button
                onClick={() => {
                  setShowAddLoanType(true);
                  setEditingLoanType(null);
                  setLoanTypeForm({ name: '', key: '', description: '' });
                  setLoanTypeFormErrors({});
                }}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition-all shadow-md hover:shadow-lg hover:scale-105 active:scale-95"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Add Loan Type
              </button>
            </div>

            {loanTypesLoading && loanTypes.length === 0 ? (
              <p className="text-gray-500 text-center py-8">Loading loan types...</p>
            ) : loanTypes.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-5xl mb-4">🏦</div>
                <h3 className="text-lg font-semibold text-gray-700 mb-2">No Loan Types</h3>
                <p className="text-gray-500">Add your first loan type to get started.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-3 px-4 text-sm font-semibold text-gray-600">Name</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-gray-600">Key</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-gray-600">Description</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-gray-600">Status</th>
                      <th className="text-right py-3 px-4 text-sm font-semibold text-gray-600">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loanTypes.map(lt => (
                      <tr key={lt.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                        <td className="py-3 px-4 font-medium text-gray-900">{lt.name}</td>
                        <td className="py-3 px-4">
                          <code className="bg-gray-100 text-gray-700 px-2 py-0.5 rounded text-xs font-mono">{lt.key}</code>
                        </td>
                        <td className="py-3 px-4 text-gray-500 text-sm max-w-xs truncate">{lt.description || '—'}</td>
                        <td className="py-3 px-4">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                            lt.active !== false ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${lt.active !== false ? 'bg-green-500' : 'bg-gray-400'}`}></span>
                            {lt.active !== false ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => {
                                setEditingLoanType(lt);
                                setLoanTypeForm({ name: lt.name, key: lt.key, description: lt.description || '' });
                                setShowAddLoanType(true);
                                setLoanTypeFormErrors({});
                              }}
                              className="px-3 py-1.5 text-xs font-semibold bg-indigo-50 text-indigo-700 rounded-lg hover:bg-indigo-100 transition-colors"
                            >
                              Edit
                            </button>
                            <button
                              onClick={async () => {
                                const newActive = lt.active !== false ? false : true;
                                try {
                                  const res = await fetch(`${API_BASE}/loan-types/${lt.id}`, {
                                    method: 'PUT',
                                    headers: {
                                      'Content-Type': 'application/json',
                                      Authorization: `Bearer ${accessToken}`
                                    },
                                    body: JSON.stringify({ active: newActive })
                                  });
                                  if (res.ok) {
                                    setSuccess(`Loan type ${newActive ? 'activated' : 'deactivated'}!`);
                                    loadLoanTypes();
                                  }
                                } catch (err) {
                                  setError('Failed to toggle loan type');
                                }
                              }}
                              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                                lt.active !== false 
                                  ? 'bg-yellow-50 text-yellow-700 hover:bg-yellow-100' 
                                  : 'bg-green-50 text-green-700 hover:bg-green-100'
                              }`}
                            >
                              {lt.active !== false ? 'Deactivate' : 'Activate'}
                            </button>
                            <button
                              onClick={() => handleDeleteLoanType(lt.id)}
                              className="px-3 py-1.5 text-xs font-semibold bg-red-50 text-red-700 rounded-lg hover:bg-red-100 transition-colors"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Loan Type Add/Edit Modal */}
          {showAddLoanType && (
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowAddLoanType(false)}>
              <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl" onClick={e => e.stopPropagation()}>
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
                    <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-900">
                      {editingLoanType ? 'Edit Loan Type' : 'Add Loan Type'}
                    </h3>
                    <p className="text-sm text-gray-500">
                      {editingLoanType ? 'Update the loan type details.' : 'Create a new loan type for the Add Lead form.'}
                    </p>
                  </div>
                </div>

                <form onSubmit={handleSaveLoanType} className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Loan Type Name *</label>
                    <input
                      type="text"
                      placeholder="e.g., Gold Loan"
                      className={`w-full border rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-200 focus:outline-none transition-all ${loanTypeFormErrors.name ? 'border-red-500' : 'border-gray-200 focus:border-blue-500'}`}
                      value={loanTypeForm.name}
                      onChange={e => {
                        setLoanTypeForm(p => ({ ...p, name: e.target.value }));
                        setLoanTypeFormErrors(p => ({ ...p, name: '' }));
                      }}
                    />
                    {loanTypeFormErrors.name && <p className="text-red-500 text-xs mt-1 font-semibold">{loanTypeFormErrors.name}</p>}
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Key (slug) *</label>
                    <input
                      type="text"
                      placeholder="e.g., gold_loan"
                      className={`w-full border rounded-xl px-4 py-3 font-mono focus:ring-2 focus:ring-blue-200 focus:outline-none transition-all ${loanTypeFormErrors.key ? 'border-red-500' : 'border-gray-200 focus:border-blue-500'}`}
                      value={loanTypeForm.key}
                      onChange={e => {
                        const value = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
                        setLoanTypeForm(p => ({ ...p, key: value }));
                        setLoanTypeFormErrors(p => ({ ...p, key: '' }));
                      }}
                    />
                    {loanTypeFormErrors.key && <p className="text-red-500 text-xs mt-1 font-semibold">{loanTypeFormErrors.key}</p>}
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Description (Optional)</label>
                    <textarea
                      placeholder="Brief description of this loan type"
                      rows="3"
                      className="w-full border border-gray-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-200 focus:outline-none focus:border-blue-500 transition-all resize-none"
                      value={loanTypeForm.description}
                      onChange={e => setLoanTypeForm(p => ({ ...p, description: e.target.value }))}
                    />
                  </div>

                  <div className="flex gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setShowAddLoanType(false);
                        setEditingLoanType(null);
                        setLoanTypeForm({ name: '', key: '', description: '' });
                      }}
                      className="flex-1 px-4 py-3 border border-gray-300 rounded-xl text-gray-700 font-semibold hover:bg-gray-50 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={loanTypesLoading}
                      className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 disabled:opacity-50 transition-all shadow-md"
                    >
                      {loanTypesLoading ? 'Saving...' : editingLoanType ? 'Update' : 'Create'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ──────────────────────────────────────── */}
      {/* TAB 3: BANK APPLICATION FORMS            */}
      {/* ──────────────────────────────────────── */}
      {activeTab === 'bank_forms' && (
        <>
          {/* Admin Management Panel */}
          {showAdminPanel && effectiveRole === 'admin' && (
            <div className="max-w-6xl mx-auto mb-8 bg-white rounded-3xl border border-gray-150 shadow-sm overflow-hidden animate-fade-in-up">
              <div className="bg-indigo-50/60 px-6 py-4 border-b border-indigo-100 flex items-center justify-between">
                <h2 className="text-lg font-bold text-indigo-900 flex items-center gap-2">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                  Forms Management Console
                </h2>
                <button
                  onClick={() => { setShowAddFormPanel(true); setEditingForm(null); resetFormEntry(); }}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-sm transition-all flex items-center gap-1.5"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  Add New Form
                </button>
              </div>

              {(showAddFormPanel || editingForm) && (
                <div className="p-6 border-b border-gray-100 bg-gradient-to-r from-indigo-50/30 to-blue-50/30">
                  <h3 className="text-sm font-bold text-gray-700 mb-4">
                    {editingForm ? `Edit Form: ${editingForm.form_name}` : 'Add New Application Form'}
                  </h3>
                  <form onSubmit={editingForm ? handleUpdateForm : handleAddForm} className="grid md:grid-cols-12 gap-4 items-end">
                    <div className="md:col-span-3 space-y-1">
                      <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Bank Name *</label>
                      <select
                        className="w-full border rounded-xl px-3 py-2.5 text-xs bg-white focus:ring-2 focus:ring-indigo-100 outline-none font-semibold"
                        value={editingForm ? editingForm.bank_name : formEntry.bank_name}
                        onChange={e => {
                          const val = e.target.value;
                          if (editingForm) setEditingForm({...editingForm, bank_name: val});
                          else setFormEntry({...formEntry, bank_name: val});
                        }}
                        required
                      >
                        <option value="">Select Bank</option>
                        {ALL_BANKS.map(bank => (
                          <option key={bank} value={bank}>{bank}</option>
                        ))}
                      </select>
                    </div>
                    <div className="md:col-span-2 space-y-1">
                      <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Loan Type *</label>
                      <select
                        className="w-full border rounded-xl px-3 py-2.5 text-xs bg-white focus:ring-2 focus:ring-indigo-100 outline-none font-semibold"
                        value={editingForm ? editingForm.loan_type : formEntry.loan_type}
                        onChange={e => {
                          const val = e.target.value;
                          if (editingForm) setEditingForm({...editingForm, loan_type: val});
                          else setFormEntry({...formEntry, loan_type: val});
                        }}
                        required
                      >
                        <option value="">Select Type</option>
                        {BANK_LOAN_TYPES.map(lt => (
                          <option key={lt} value={lt}>{lt}</option>
                        ))}
                      </select>
                    </div>
                    <div className="md:col-span-3 space-y-1">
                      <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Form Name *</label>
                      <input
                        type="text"
                        className="w-full border rounded-xl px-3 py-2.5 text-xs bg-white focus:ring-2 focus:ring-indigo-100 outline-none font-semibold"
                        placeholder="e.g. SBI Home Loan Application Form"
                        value={editingForm ? editingForm.form_name : formEntry.form_name}
                        onChange={e => {
                          const val = e.target.value;
                          if (editingForm) setEditingForm({...editingForm, form_name: val});
                          else setFormEntry({...formEntry, form_name: val});
                        }}
                        required
                      />
                    </div>
                    <div className="md:col-span-2 space-y-1">
                      <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">File Type</label>
                      <select
                        className="w-full border rounded-xl px-3 py-2.5 text-xs bg-white focus:ring-2 focus:ring-indigo-100 outline-none font-semibold"
                        value={editingForm ? editingForm.file_type : formEntry.file_type}
                        onChange={e => {
                          const val = e.target.value;
                          if (editingForm) setEditingForm({...editingForm, file_type: val});
                          else setFormEntry({...formEntry, file_type: val});
                        }}
                      >
                        {FILE_TYPE_OPTIONS.map(ft => (
                          <option key={ft} value={ft}>{ft.toUpperCase()}</option>
                        ))}
                      </select>
                    </div>
                    <div className="md:col-span-2 space-y-1">
                      <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">File *</label>
                      <input
                        type="file"
                        accept=".pdf,.doc,.docx"
                        className="w-full text-xs border rounded-xl px-3 py-2 bg-white file:mr-2 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-[10px] file:font-bold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                        onChange={e => setFormFile(e.target.files[0])}
                        required={!editingForm}
                      />
                    </div>
                    <div className="md:col-span-12 flex gap-3 pt-2">
                      <button
                        type="submit"
                        disabled={loadingForms}
                        className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-sm transition-all disabled:opacity-50"
                      >
                        {loadingForms ? 'Saving...' : editingForm ? 'Update Form' : 'Add Form'}
                      </button>
                      <button
                        type="button"
                        onClick={() => { setShowAddFormPanel(false); setEditingForm(null); setFormFile(null); }}
                        className="px-6 py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs transition-all"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                </div>
              )}

              <div className="p-4">
                <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 px-2">
                  All Registered Forms ({forms.length})
                </div>
                {forms.length > 0 ? (
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {forms.map(form => (
                      <div key={form.id} className={`flex items-center justify-between px-4 py-3 rounded-xl border transition-colors ${
                        form.is_active ? 'bg-white border-gray-150' : 'bg-red-50/40 border-red-100 opacity-70'
                      }`}>
                        <div className="flex items-center gap-4">
                          <div className={`w-2 h-2 rounded-full ${form.is_active ? 'bg-green-500' : 'bg-red-400'}`} />
                          <div>
                            <span className="text-sm font-bold text-gray-900">{form.form_name}</span>
                            <div className="flex gap-2 mt-0.5">
                              <span className="text-[10px] font-semibold text-gray-500">{form.bank_name}</span>
                              <span className="text-[10px] text-gray-300">|</span>
                              <span className="text-[10px] font-semibold text-indigo-600">{form.loan_type}</span>
                              <span className="text-[10px] text-gray-300">|</span>
                              <span className="text-[10px] font-bold text-gray-400 uppercase">{form.file_type}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => { setEditingForm(form); setShowAddFormPanel(false); setFormFile(null); }}
                            className="p-2 rounded-lg text-indigo-600 hover:bg-indigo-50 transition-colors"
                            title="Edit"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                              <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => handleToggleForm(form.id)}
                            className={`p-2 rounded-lg transition-colors ${
                              form.is_active ? 'text-red-500 hover:bg-red-50' : 'text-green-600 hover:bg-green-50'
                            }`}
                            title={form.is_active ? 'Disable form' : 'Restore form'}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                              {form.is_active ? (
                                <><circle cx="12" cy="12" r="10" /><line x1="8" y1="12" x2="16" y2="12" /></>
                              ) : (
                                <><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="19" /><line x1="8" y1="12" x2="16" y2="12" /></>
                              )}
                            </svg>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-6 text-center text-gray-400 font-semibold text-sm border border-dashed rounded-2xl">
                    No forms registered yet. Use "Add New Form" to upload the first application form.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Search Section */}
          <div className="max-w-6xl mx-auto mb-8">
            <form onSubmit={handleBankSearch} className="bg-white rounded-3xl p-6 border border-gray-150 shadow-sm">
              <div className="grid md:grid-cols-12 gap-4 items-end">
                <div className="md:col-span-5 space-y-1.5">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Select Bank</label>
                  <select
                    className="w-full border border-gray-200 rounded-2xl px-4 py-3 bg-gray-50/50 focus:ring-2 focus:ring-blue-200 focus:outline-none transition-all font-bold text-sm"
                    value={selectedBank}
                    onChange={e => { setSelectedBank(e.target.value); setCustomBankName(''); }}
                  >
                    <option value="">— All Banks —</option>
                    {ALL_BANKS.map(bank => (
                      <option key={bank} value={bank}>{bank}</option>
                    ))}
                  </select>
                  {selectedBank === 'Other' && (
                    <input
                      type="text"
                      placeholder="Type custom bank/NBFC name..."
                      className="w-full border border-gray-200 rounded-2xl px-4 py-2.5 bg-gray-50/50 focus:ring-2 focus:ring-blue-200 focus:outline-none transition-all font-semibold text-sm mt-2"
                      value={customBankName}
                      onChange={e => setCustomBankName(e.target.value)}
                    />
                  )}
                </div>
                <div className="md:col-span-4 space-y-1.5">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Select Loan Type</label>
                  <select
                    className="w-full border border-gray-200 rounded-2xl px-4 py-3 bg-gray-50/50 focus:ring-2 focus:ring-blue-200 focus:outline-none transition-all font-bold text-sm"
                    value={selectedLoanType}
                    onChange={e => setSelectedLoanType(e.target.value)}
                  >
                    <option value="">— All Loan Types —</option>
                    {BANK_LOAN_TYPES.map(lt => (
                      <option key={lt} value={lt}>{lt}</option>
                    ))}
                  </select>
                </div>
                <div className="md:col-span-3 flex gap-3">
                  <button
                    type="submit"
                    disabled={loadingForms}
                    className="flex-1 py-3.5 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-700 hover:from-blue-700 hover:to-indigo-800 text-white font-bold text-sm shadow-md shadow-blue-500/10 hover-lift transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {loadingForms ? (
                      <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                    ) : (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <circle cx="11" cy="11" r="8" />
                        <line x1="21" y1="21" x2="16.65" y2="16.65" />
                      </svg>
                    )}
                    {loadingForms ? 'Searching...' : 'Search'}
                  </button>
                  <button
                    type="button"
                    onClick={handleBankReset}
                    className="px-5 py-3.5 rounded-2xl border border-gray-200 text-gray-600 hover:bg-gray-50 font-bold text-sm transition-all flex items-center gap-2"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <polyline points="1 4 1 10 7 10" />
                      <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                    </svg>
                    Reset
                  </button>
                </div>
              </div>
            </form>
          </div>

          {/* Results Section */}
          <div className="max-w-6xl mx-auto">
            {!searched ? (
              <div className="bg-white rounded-3xl border border-dashed border-gray-200 p-16 text-center">
                <div className="w-20 h-20 mx-auto mb-6 rounded-3xl bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center border border-blue-100">
                  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-blue-400">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                  </svg>
                </div>
                <h3 className="text-xl font-bold text-gray-400 mb-2">Search Application Forms</h3>
                <p className="text-gray-400 font-medium">
                  Select a bank and/or loan type above, then click <strong>Search</strong> to find available application forms.
                </p>
              </div>
            ) : loadingForms ? (
              <div className="text-center py-16 font-bold text-gray-400 text-lg animate-pulse">Loading forms...</div>
            ) : forms.length === 0 ? (
              <div className="bg-white rounded-3xl border border-gray-150 p-16 text-center shadow-sm">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-amber-50 flex items-center justify-center border border-amber-100">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-amber-400">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                </div>
                <h3 className="text-lg font-bold text-gray-500 mb-2">No Forms Found</h3>
                <p className="text-gray-400 font-medium">No application forms are available for the selected Bank and Loan Type.</p>
                {effectiveRole === 'admin' && (
                  <p className="text-gray-400 text-sm mt-2">You can add forms using the <strong>Manage Forms</strong> button above.</p>
                )}
              </div>
            ) : (
              <div className="bg-white rounded-3xl border border-gray-150 shadow-sm overflow-hidden">
                <div className="px-6 py-4 bg-gray-50/70 border-b border-gray-100 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold text-gray-700">
                      {forms.length} Form{forms.length !== 1 ? 's' : ''} Found
                    </span>
                    {selectedBank && (
                      <span className="px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 text-[10px] font-bold border border-blue-100">
                        Bank: {selectedBank === 'Other' ? customBankName : selectedBank}
                      </span>
                    )}
                    {selectedLoanType && (
                      <span className="px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 text-[10px] font-bold border border-indigo-100">
                        Type: {selectedLoanType}
                      </span>
                    )}
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead className="bg-gray-50/40 border-b text-xs font-bold text-gray-500 uppercase tracking-wider">
                      <tr>
                        <th className="p-5">Form Name</th>
                        <th className="p-5">Bank</th>
                        <th className="p-5">Loan Type</th>
                        <th className="p-5">File Type</th>
                        <th className="p-5 text-center">Download</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 text-sm">
                      {forms.map(form => (
                        <tr key={form.id} className={`hover:bg-gray-50/40 transition-colors ${!form.is_active ? 'opacity-50 bg-red-50/20' : ''}`}>
                          <td className="p-5">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100 flex items-center justify-center flex-shrink-0">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-blue-500">
                                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                  <polyline points="14 2 14 8 20 8" />
                                </svg>
                              </div>
                              <span className="font-bold text-gray-900">{form.form_name}</span>
                            </div>
                          </td>
                          <td className="p-5 font-semibold text-gray-700">{form.bank_name}</td>
                          <td className="p-5">
                            <span className="bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase">{form.loan_type}</span>
                          </td>
                          <td className="p-5">
                            <span className="font-bold text-gray-500 uppercase text-xs">{form.file_type}</span>
                          </td>
                          <td className="p-5 text-center">
                            <button
                              onClick={() => handleFormDownload(form.id)}
                              disabled={downloadingId === form.id || !form.is_active}
                              className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs transition-all ${
                                form.is_active
                                  ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm hover:shadow-md hover-lift'
                                  : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                              } ${downloadingId === form.id ? 'opacity-70' : ''}`}
                            >
                              {downloadingId === form.id ? (
                                <>
                                  <svg className="animate-spin h-3.5 w-3.5" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                  </svg>
                                  Downloading...
                                </>
                              ) : (
                                <>
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                    <polyline points="7 10 12 15 17 10" />
                                    <line x1="12" y1="15" x2="12" y2="3" />
                                  </svg>
                                  Download
                                </>
                              )}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}