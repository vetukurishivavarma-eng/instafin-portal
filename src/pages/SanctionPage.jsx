import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import StatusBadge from '../components/StatusBadge';
import API_BASE from '../config/api';

export default function SanctionPage() {
  const { accessToken, user, impersonating, isImpersonating } = useAuth();
  const [leads, setLeads] = useState([]);
  const [selectedLead, setSelectedLead] = useState(null);
  const [banks, setBanks] = useState([]);
  const [bankForms, setBankForms] = useState({}); // { [bankId]: { amount, uploaded } }
  const [sanctionFiles, setSanctionFiles] = useState({}); // { [bankId]: [files...] }
  const [showUploadForm, setShowUploadForm] = useState(null); // bankId
  const [newUpload, setNewUpload] = useState({ file: null, description: '' });
  const [deletingDoc, setDeletingDoc] = useState(null);
  const [viewDoc, setViewDoc] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (!accessToken) return;
    fetchLeads();
  }, [accessToken]);

  const fetchLeads = async () => {
    try {
      const res = await fetch(`${API_BASE}/leads`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const data = await res.json();
      const allLeads = data.data || data || [];
      // Filter by impersonated executive if admin is impersonating
      const executiveName = isImpersonating ? impersonating?.name : null;
      let filteredLeads = executiveName
        ? allLeads.filter(l => l.assignedTo === executiveName)
        : allLeads;
      // Show leads that have at least one processing bank AND at least one assigned bank
      setLeads(filteredLeads.filter(l => l.status === 'Processing' && l.assignedBanks?.length > 0));
    } catch (err) {
      setError('Failed to load leads');
    }
  };

  // Fetch existing sanction letter files from checklist-status
  const fetchSanctionFiles = async (leadId, banksList) => {
    try {
      const res = await fetch(`${API_BASE}/checklist-status/${leadId}`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const data = await res.json();
      const grouped = data?.grouped || {};
      // Filter only sanction letter documents
      const sanctionDocs = {};
      Object.entries(grouped).forEach(([docId, files]) => {
        if (docId.startsWith('sanction_letter_')) {
          // Extract bank name from documentId: sanction_letter_BankName
          const bankName = docId.replace('sanction_letter_', '');
          // Find the matching bank to get its id (use banksList from param, not state)
          const bank = (banksList || banks).find(b => b.bank_name === bankName);
          if (bank) {
            sanctionDocs[bank.id] = files;
          }
        }
      });
      setSanctionFiles(prev => ({...prev, ...sanctionDocs}));
    } catch (err) {
      console.error('Failed to load sanction files:', err);
    }
  };

  const fetchBanks = async (leadId) => {
    try {
      const res = await fetch(`${API_BASE}/leads/${leadId}/banks`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const data = await res.json();
      const banksList = data.banks || [];
      setBanks(banksList);
      // Initialize form state for each processing bank
      const forms = {};
      banksList.forEach(b => {            forms[b.id] = { amount: '' };
      });
      setBankForms(forms);
      setNewUpload({ file: null, description: '' });
      setShowUploadForm(null);

      // Fetch existing sanction files after banks are loaded
      await fetchSanctionFiles(leadId, banksList);
    } catch (err) {
      setError('Failed to load bank details');
    }
  };

  const handleLeadSelect = (e) => {
    const leadId = e.target.value;
    const lead = leads.find(l => String(l.id) === String(leadId));
    setSelectedLead(lead || null);
    setError('');
    setSuccess('');
    setSanctionFiles({});
    if (lead) {
      fetchBanks(lead.id);
    } else {
      setBanks([]);
      setBankForms({});
    }
  };

  const updateBankForm = (bankId, field, value) => {
    setBankForms(prev => ({
      ...prev,
      [bankId]: { ...prev[bankId], [field]: value }
    }));
  };

  const resetUploadForm = () => {
    setNewUpload({ file: null, description: '' });
    setShowUploadForm(null);
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      setNewUpload(prev => ({ ...prev, file }));
    }
  };

  const handleUploadLetter = async (bankId) => {
    if (!newUpload.file || !selectedLead) return;

    setLoading(true);
    setError('');

    try {
      const bank = banks.find(b => b.id === bankId);
      const formData = new FormData();
      formData.append('leadId', selectedLead.id);
      formData.append('documentId', `sanction_letter_${bank.bank_name}`);
      formData.append('documentName', `Sanction Letter - ${bank.bank_name}`);
      formData.append('description', newUpload.description || '');
      formData.append('file', newUpload.file);

      const res = await fetch(`${API_BASE}/checklist-status/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
        body: formData
      });

      if (!res.ok) {
        const errData = await res.json();
        setError(errData.error || 'Failed to upload sanction letter');
        return;
      }

      // Refresh files for this bank
      await fetchSanctionFiles(selectedLead.id);
      resetUploadForm();
      setSuccess('Sanction letter uploaded');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError('Failed to upload sanction letter');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteDocument = async (fileId, bankId) => {
    if (!selectedLead || !window.confirm('Delete this sanction letter file? This cannot be undone.')) return;

    setDeletingDoc(fileId);
    try {
      const res = await fetch(`${API_BASE}/checklist-status/file/${fileId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      if (res.ok) {
        await fetchSanctionFiles(selectedLead.id);
        setSuccess('File deleted successfully');
        setTimeout(() => setSuccess(''), 3000);
      } else {
        const errData = await res.json();
        setError(errData.error || 'Delete failed');
        setTimeout(() => setError(''), 5000);
      }
    } catch (err) {
      setError('Delete failed');
      setTimeout(() => setError(''), 5000);
    } finally {
      setDeletingDoc(null);
    }
  };

  const handleViewDocument = async (fileId) => {
    setViewDoc({ url: null, id: fileId, loading: true });
    try {
      const res = await fetch(`${API_BASE}/checklist-status/file/${fileId}`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (!res.ok) throw new Error('Failed to fetch file');
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      setViewDoc({ url: blobUrl, id: fileId, loading: false });
    } catch (err) {
      setError('Failed to load document');
      setTimeout(() => setError(''), 5000);
      setViewDoc(null);
    }
  };

  const handleSanctionBank = async (bankId) => {
    const form = bankForms[bankId];
    const files = sanctionFiles[bankId] || [];
    if (!form?.amount || files.length === 0) return;

    setLoading(true);
    setError('');

    try {
      const bank = banks.find(b => b.id === bankId);
      const res = await fetch(`${API_BASE}/leads/${selectedLead.id}/banks/${bankId}/sanction`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({ sanctionedAmount: Number(form.amount) })
      });

      if (!res.ok) {
        const errData = await res.json();
        setError(errData.error || 'Failed to sanction bank');
        return;
      }

      const data = await res.json();
      setSuccess(`${bank.bank_name} sanctioned with ₹${Number(form.amount).toLocaleString()}`);
      setTimeout(() => setSuccess(''), 5000);

      // Refresh banks and leads
      fetchBanks(selectedLead.id);
      fetchLeads();
    } catch (err) {
      setError('Failed to sanction bank');
    } finally {
      setLoading(false);
    }
  };

  const handleRejectBank = async (bankId) => {
    const bank = banks.find(b => b.id === bankId);
    if (!window.confirm(`Are you sure you want to reject ${bank?.bank_name}?`)) return;

    setLoading(true);
    setError('');

    try {
      const res = await fetch(`${API_BASE}/leads/${selectedLead.id}/banks/${bankId}/reject`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({})
      });

      if (!res.ok) {
        const errData = await res.json();
        setError(errData.error || 'Failed to reject bank');
        return;
      }

      setSuccess(`${bank.bank_name} has been rejected`);
      setTimeout(() => setSuccess(''), 5000);

      fetchBanks(selectedLead.id);
      fetchLeads();
    } catch (err) {
      setError('Failed to reject bank');
    } finally {
      setLoading(false);
    }
  };

  const formatAmount = (val) => val.replace(/[^0-9]/g, '');

  // Compute aggregate stats
  const totalSanctioned = banks
    .filter(b => ['Sanctioned', 'Partially Disbursed', 'Disbursed'].includes(b.status))
    .reduce((sum, b) => sum + (Number(b.sanctioned_amount) || 0), 0);

  const processingBanks = banks.filter(b => b.status === 'Processing');
  const sanctionedBanks = banks.filter(b => ['Sanctioned', 'Partially Disbursed', 'Disbursed'].includes(b.status));
  const rejectedBanks = banks.filter(b => b.status === 'Rejected');

  return (
    <div className="py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Sanction Management</h1>
        <p className="text-gray-500">Select a lead to sanction or reject individual banks</p>
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-2xl mb-6">{error}</div>
      )}
      {success && (
        <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded-2xl mb-6">{success}</div>
      )}

      {/* Lead Selector */}
      <div className="bg-white rounded-3xl shadow-xl p-6 mb-8">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Select Lead</h2>
        <select
          className="w-full border rounded-xl px-4 py-3"
          value={selectedLead?.id || ''}
          onChange={handleLeadSelect}
        >
          <option value="">Choose a lead</option>
          {leads.map(lead => (
            <option key={lead.id} value={lead.id}>
              {lead.customerName} — {lead.mobile} ({lead.loanType || 'N/A'}) — {lead.assignedBanks?.join(', ')}
            </option>
          ))}
        </select>
        {leads.length === 0 && (
          <p className="text-gray-500 text-sm mt-2">No leads with processing banks available.</p>
        )}
      </div>

      {/* Lead Info + Bank Cards */}
      {selectedLead && (
        <div>
          {/* Lead Summary */}
          <div className="bg-blue-50 rounded-3xl p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-blue-800">{selectedLead.customerName}</h3>
              <StatusBadge status={selectedLead.status} />
            </div>
            <div className="grid md:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-gray-500">Mobile: </span>
                <span className="font-medium">{selectedLead.mobile}</span>
              </div>
              <div>
                <span className="text-gray-500">Loan Type: </span>
                <span className="font-medium">{selectedLead.loanType || 'N/A'}</span>
              </div>
              <div>
                <span className="text-gray-500">Expected: </span>
                <span className="font-medium">₹{Number(selectedLead.expectedAmount || 0).toLocaleString()}</span>
              </div>
              <div>
                <span className="text-gray-500">Total Sanctioned: </span>
                <span className="font-bold text-green-700">₹{totalSanctioned.toLocaleString()}</span>
              </div>
            </div>
          </div>

          {/* Processing Banks — Action Required */}
          {processingBanks.length > 0 && (
            <div className="mb-8">
              <h3 className="text-lg font-bold text-gray-900 mb-4">
                Pending Sanction ({processingBanks.length})
              </h3>
              <div className="grid gap-4">
                {processingBanks.map(bank => {
                  const form = bankForms[bank.id] || {};
                  const uploadedFiles = sanctionFiles[bank.id] || [];
                  return (
                    <div key={bank.id} className="bg-white rounded-2xl shadow-lg p-6 border-l-4 border-yellow-400">
                      <div className="flex items-center justify-between mb-4">
                        <h4 className="text-lg font-bold text-gray-900">{bank.bank_name}</h4>
                        <StatusBadge status={bank.status} />
                      </div>

                      {/* Amount Input */}
                      <div className="mb-4">
                        <label className="block text-sm font-semibold text-gray-700 mb-2">Sanctioned Amount (₹)</label>
                        <input
                          type="text"
                          placeholder="Enter amount"
                          className="w-full border rounded-xl px-4 py-3"
                          value={form.amount || ''}
                          onChange={(e) => updateBankForm(bank.id, 'amount', formatAmount(e.target.value))}
                        />
                        {form.amount && (
                          <p className="text-sm text-gray-500 mt-1">₹{Number(form.amount).toLocaleString()}</p>
                        )}
                      </div>

                      {/* Upload Sanction Letter — Multi-file support */}
                      <div className="mb-4">
                        <div className="flex items-center justify-between mb-2">
                          <label className="block text-sm font-semibold text-gray-700">Sanction Letter</label>
                        </div>

                        {/* Uploaded files list */}
                        {uploadedFiles.length > 0 && (
                          <div className="mb-3 space-y-2">
                            {uploadedFiles.map((file) => (
                              <div
                                key={file.id}
                                className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-lg px-4 py-3"
                              >
                                {/* File icon */}
                                <div className="flex-shrink-0">
                                  <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                  </svg>
                                </div>

                                {/* File info */}
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-gray-900 truncate">
                                    {file.description || 'Sanction letter'}
                                  </p>
                                  <p className="text-xs text-gray-500 mt-0.5">
                                    {file.originalFile || 'Unknown file'}
                                    {file.uploadedAt && (
                                      <span className="ml-2">
                                        {new Date(file.uploadedAt).toLocaleDateString('en-IN', {
                                          day: '2-digit',
                                          month: 'short',
                                          year: 'numeric',
                                          hour: '2-digit',
                                          minute: '2-digit'
                                        })}
                                      </span>
                                    )}
                                  </p>
                                </div>

                                {/* View button */}
                                <button
                                  onClick={() => handleViewDocument(file.id)}
                                  className="text-xs text-blue-700 font-semibold bg-blue-100 px-3 py-1.5 rounded-lg hover:bg-blue-200"
                                >
                                  View
                                </button>

                                {/* Delete button */}
                                <button
                                  onClick={() => handleDeleteDocument(file.id, bank.id)}
                                  disabled={deletingDoc === file.id}
                                  className="text-xs text-red-700 font-semibold bg-red-100 px-3 py-1.5 rounded-lg hover:bg-red-200 disabled:opacity-50"
                                >
                                  {deletingDoc === file.id ? '...' : 'Delete'}
                                </button>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* "Add File" button when form is closed */}
                        {showUploadForm !== bank.id && (
                          <button
                            onClick={() => { resetUploadForm(); setShowUploadForm(bank.id); }}
                            className="text-xs text-blue-700 font-semibold bg-blue-100 px-3 py-1.5 rounded-lg hover:bg-blue-200"
                          >
                            + Add File
                          </button>
                        )}

                        {/* Upload form (inline) */}
                        {showUploadForm === bank.id && (
                          <div className="p-4 bg-white border border-blue-200 rounded-xl space-y-3">
                            {/* Description field */}
                            <div>
                              <label className="block text-xs font-semibold text-gray-700 mb-1">
                                Description
                              </label>
                              <textarea
                                value={newUpload.description}
                                onChange={(e) => setNewUpload(prev => ({ ...prev, description: e.target.value }))}
                                placeholder="Describe the sanction letter (e.g. Final sanction letter, Revised terms, etc.)"
                                rows={2}
                                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none"
                                disabled={loading}
                              />
                            </div>

                            {/* File input + Upload button */}
                            <div className="flex items-center gap-3">
                              <label className={`flex-1 cursor-pointer text-sm px-4 py-2 rounded-lg font-medium text-center ${
                                loading
                                  ? 'bg-gray-300 text-gray-500 cursor-wait'
                                  : newUpload.file
                                    ? 'bg-green-600 text-white'
                                    : 'bg-blue-600 text-white hover:bg-blue-700'
                              }`}>
                                {loading ? (
                                  <span className="flex items-center justify-center gap-2">
                                    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                    </svg>
                                    Uploading...
                                  </span>
                                ) : newUpload.file ? (
                                  <span className="flex items-center justify-center gap-2">
                                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    {newUpload.file.name}
                                  </span>
                                ) : (
                                  'Choose File'
                                )}
                                <input
                                  type="file"
                                  className="hidden"
                                  accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                                  disabled={loading}
                                  onChange={handleFileSelect}
                                />
                              </label>
                              {newUpload.file && (
                                <button
                                  onClick={() => handleUploadLetter(bank.id)}
                                  disabled={loading}
                                  className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap"
                                >
                                  Upload
                                </button>
                              )}
                              <button
                                onClick={resetUploadForm}
                                disabled={loading}
                                className="px-3 py-2 text-gray-500 hover:text-gray-700 text-sm"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Action Buttons */}
                      <div className="flex gap-3">
                        <button
                          onClick={() => handleSanctionBank(bank.id)}
                          disabled={!form.amount || uploadedFiles.length === 0 || loading}
                          className={`flex-1 px-4 py-3 rounded-xl font-semibold text-white transition-all ${
                            form.amount && uploadedFiles.length > 0
                              ? 'bg-green-700 hover:bg-green-800'
                              : 'bg-gray-300 cursor-not-allowed'
                          }`}
                        >
                          Sanction {bank.bank_name}
                        </button>
                        <button
                          onClick={() => handleRejectBank(bank.id)}
                          disabled={loading}
                          className="px-4 py-3 rounded-xl font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50"
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Sanctioned Banks — Read Only */}
          {sanctionedBanks.length > 0 && (
            <div className="mb-8">
              <h3 className="text-lg font-bold text-gray-900 mb-4">
                Sanctioned ({sanctionedBanks.length})
              </h3>
              <div className="grid gap-3">
                {sanctionedBanks.map(bank => (
                  <div key={bank.id} className="bg-green-50 rounded-2xl p-4 border border-green-200">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-bold text-gray-900">{bank.bank_name}</span>
                        <span className="ml-3 text-green-700 font-semibold">
                          ₹{Number(bank.sanctioned_amount).toLocaleString()}
                        </span>
                      </div>
                      <StatusBadge status={bank.status} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Rejected Banks */}
          {rejectedBanks.length > 0 && (
            <div className="mb-8">
              <h3 className="text-lg font-bold text-gray-900 mb-4">
                Rejected ({rejectedBanks.length})
              </h3>
              <div className="grid gap-3">
                {rejectedBanks.map(bank => (
                  <div key={bank.id} className="bg-gray-50 rounded-2xl p-4 border border-gray-200">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-gray-600 line-through">{bank.bank_name}</span>
                      <StatusBadge status={bank.status} />
                    </div>
                    {bank.remarks && <p className="text-sm text-gray-500 mt-1">{bank.remarks}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* No processing banks */}
          {processingBanks.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              All banks have been processed for this lead.
            </div>
          )}
        </div>
      )}

      {!selectedLead && leads.length > 0 && (
        <div className="text-center py-8 text-gray-500">
          Select a lead above to proceed with bank-wise sanction or rejection.
        </div>
      )}

      {/* View Document Modal */}
      {viewDoc && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => { if (viewDoc.url) URL.revokeObjectURL(viewDoc.url); setViewDoc(null); }}>
          <div className="bg-white rounded-3xl shadow-2xl max-w-4xl w-full mx-4 max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center px-6 py-4 border-b">
              <h3 className="text-lg font-bold text-gray-900">Sanction Letter</h3>
              <div className="flex items-center gap-3">
                {viewDoc.url && (
                  <a
                    href={viewDoc.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-blue-600 hover:underline"
                  >
                    Open in new tab
                  </a>
                )}
                <button
                  onClick={() => { if (viewDoc.url) URL.revokeObjectURL(viewDoc.url); setViewDoc(null); }}
                  className="text-gray-500 hover:text-gray-700 text-2xl leading-none"
                >
                  &times;
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-4">
              {viewDoc.loading ? (
                <div className="flex items-center justify-center h-[70vh] text-gray-500">Loading document...</div>
              ) : (
                <iframe
                  src={viewDoc.url}
                  title="Sanction Letter"
                  className="w-full h-[70vh] border rounded-lg"
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
