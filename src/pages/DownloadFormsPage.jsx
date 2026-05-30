import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { ALL_BANKS } from '../data/banks';
import API_BASE from '../config/api';


const LOAN_TYPES = [
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

  // Search form state
  const [selectedBank, setSelectedBank] = useState('');
  const [selectedLoanType, setSelectedLoanType] = useState('');
  const [customBankName, setCustomBankName] = useState('');

  // Results state
  const [forms, setForms] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [downloadingId, setDownloadingId] = useState(null);

  // Admin management state
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingForm, setEditingForm] = useState(null);

  // Add/Edit form fields
  const [formEntry, setFormEntry] = useState({
    bank_name: '',
    loan_type: '',
    form_name: '',
    file_type: 'pdf'
  });
  const [formFile, setFormFile] = useState(null);

  // Fetch forms on load (show all active forms)
  useEffect(() => {
    fetchForms();
  }, []);

  const fetchForms = async (bank, loanType) => {
    setLoading(true);
    setError('');
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
        setError(data.error || 'Failed to fetch forms');
      }
    } catch (err) {
      setError('Failed to connect to server');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e) => {
    e.preventDefault();
    const bank = selectedBank === 'Other' ? customBankName : selectedBank;
    fetchForms(bank, selectedLoanType);
  };

  const handleReset = () => {
    setSelectedBank('');
    setSelectedLoanType('');
    setCustomBankName('');
    setForms([]);
    setSearched(false);
    setError('');
    setSuccess('');
  };

  const handleDownload = async (formId) => {
    setDownloadingId(formId);
    setError('');
    setSuccess('');
    try {
      const res = await fetch(`${API_BASE}/forms/${formId}/download`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      if (!res.ok) {
        const err = await res.json();
        setError(err.error || 'Failed to download form');
        return;
      }

      // Get filename from Content-Disposition header
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
      setError('Failed to download form');
    } finally {
      setDownloadingId(null);
    }
  };

  // Admin: Add new form
  const handleAddForm = async (e) => {
    e.preventDefault();
    if (!formEntry.bank_name || !formEntry.loan_type || !formEntry.form_name) {
      setError('Bank name, loan type, and form name are required');
      return;
    }
    if (!formFile) {
      setError('Please select a file to upload');
      return;
    }

    setLoading(true);
    setError('');
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
        setShowAddForm(false);
        resetFormEntry();
        fetchForms();
      } else {
        setError(data.error || 'Failed to add form');
      }
    } catch (err) {
      setError('Failed to add form');
    } finally {
      setLoading(false);
    }
  };

  // Admin: Update form
  const handleUpdateForm = async (e) => {
    e.preventDefault();
    if (!editingForm) return;

    setLoading(true);
    setError('');
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
        fetchForms();
      } else {
        setError(data.error || 'Failed to update form');
      }
    } catch (err) {
      setError('Failed to update form');
    } finally {
      setLoading(false);
    }
  };

  // Admin: Toggle form active/inactive
  const handleToggleForm = async (formId) => {
    if (!window.confirm('Are you sure you want to toggle this form\'s availability?')) return;

    try {
      const res = await fetch(`${API_BASE}/forms/${formId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      if (res.ok) {
        setSuccess('Form status updated!');
        fetchForms();
      } else {
        const err = await res.json();
        setError(err.error || 'Failed to toggle form');
      }
    } catch (err) {
      setError('Failed to update form status');
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

  return (
    <div className="py-12 px-6 min-h-screen bg-gradient-mesh animate-fade-in-up">
      {/* Header */}
      <div className="mb-10 max-w-6xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-extrabold text-gray-900 tracking-tight">Download Application Forms</h1>
          <p className="text-gray-500 font-semibold mt-1">
            Search and download loan application forms from Indian banks and financial institutions.
          </p>
        </div>
        {effectiveRole === 'admin' && (
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

      {/* Notifications */}
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
              onClick={() => { setShowAddForm(true); setEditingForm(null); resetFormEntry(); }}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-sm transition-all flex items-center gap-1.5"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Add New Form
            </button>
          </div>

          {/* Add/Edit Form Modal within panel */}
          {(showAddForm || editingForm) && (
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
                      if (editingForm) {
                        setEditingForm({...editingForm, bank_name: val});
                      } else {
                        setFormEntry({...formEntry, bank_name: val});
                      }
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
                      if (editingForm) {
                        setEditingForm({...editingForm, loan_type: val});
                      } else {
                        setFormEntry({...formEntry, loan_type: val});
                      }
                    }}
                    required
                  >
                    <option value="">Select Type</option>
                    {LOAN_TYPES.map(lt => (
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
                      if (editingForm) {
                        setEditingForm({...editingForm, form_name: val});
                      } else {
                        setFormEntry({...formEntry, form_name: val});
                      }
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
                      if (editingForm) {
                        setEditingForm({...editingForm, file_type: val});
                      } else {
                        setFormEntry({...formEntry, file_type: val});
                      }
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
                    disabled={loading}
                    className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-sm transition-all disabled:opacity-50"
                  >
                    {loading ? 'Saving...' : editingForm ? 'Update Form' : 'Add Form'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowAddForm(false); setEditingForm(null); setFormFile(null); }}
                    className="px-6 py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs transition-all"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Existing forms list in admin panel */}
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
                        onClick={() => { setEditingForm(form); setShowAddForm(false); setFormFile(null); }}
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
                            <>
                              <circle cx="12" cy="12" r="10" />
                              <line x1="8" y1="12" x2="16" y2="12" />
                            </>
                          ) : (
                            <>
                              <circle cx="12" cy="12" r="10" />
                              <line x1="12" y1="8" x2="12" y2="16" />
                              <line x1="8" y1="12" x2="16" y2="12" />
                            </>
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
        <form onSubmit={handleSearch} className="bg-white rounded-3xl p-6 border border-gray-150 shadow-sm">
          <div className="grid md:grid-cols-12 gap-4 items-end">
            {/* Bank Dropdown */}
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

            {/* Loan Type Dropdown */}
            <div className="md:col-span-4 space-y-1.5">
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Select Loan Type</label>
              <select
                className="w-full border border-gray-200 rounded-2xl px-4 py-3 bg-gray-50/50 focus:ring-2 focus:ring-blue-200 focus:outline-none transition-all font-bold text-sm"
                value={selectedLoanType}
                onChange={e => setSelectedLoanType(e.target.value)}
              >
                <option value="">— All Loan Types —</option>
                {LOAN_TYPES.map(lt => (
                  <option key={lt} value={lt}>{lt}</option>
                ))}
              </select>
            </div>

            {/* Buttons */}
            <div className="md:col-span-3 flex gap-3">
              <button
                type="submit"
                disabled={loading}
                className="flex-1 py-3.5 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-700 hover:from-blue-700 hover:to-indigo-800 text-white font-bold text-sm shadow-md shadow-blue-500/10 hover-lift transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? (
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
                {loading ? 'Searching...' : 'Search'}
              </button>
              <button
                type="button"
                onClick={handleReset}
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
                <polyline points="10 9 9 9 8 9" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-gray-400 mb-2">Search Application Forms</h3>
            <p className="text-gray-400 font-medium">
              Select a bank and/or loan type above, then click <strong>Search</strong> to find available application forms.
            </p>
          </div>
        ) : loading ? (
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
            <p className="text-gray-400 font-medium">
              No application forms are available for the selected Bank and Loan Type.
            </p>
            {(effectiveRole === 'admin') && (
              <p className="text-gray-400 text-sm mt-2">
                You can add forms using the <strong>Manage Forms</strong> button above.
              </p>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-3xl border border-gray-150 shadow-sm overflow-hidden">
            {/* Results header */}
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

            {/* Results table */}
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
                        <span className="bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase">
                          {form.loan_type}
                        </span>
                      </td>
                      <td className="p-5">
                        <span className="font-bold text-gray-500 uppercase text-xs">{form.file_type}</span>
                      </td>
                      <td className="p-5 text-center">
                        <button
                          onClick={() => handleDownload(form.id)}
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
    </div>
  );
}
