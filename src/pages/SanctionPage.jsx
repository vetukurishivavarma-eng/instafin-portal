import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import StatusBadge from '../components/StatusBadge';
import API_BASE from '../config/api';

export default function SanctionPage() {
  const { accessToken } = useAuth();
  const [leads, setLeads] = useState([]);
  const [selectedLead, setSelectedLead] = useState(null);
  const [banks, setBanks] = useState([]);
  const [bankForms, setBankForms] = useState({}); // { [bankId]: { amount, file, uploaded } }
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
      // Show leads that have at least one processing bank
      setLeads(allLeads.filter(l => l.status === 'Processing'));
    } catch (err) {
      setError('Failed to load leads');
    }
  };

  const fetchBanks = async (leadId) => {
    try {
      const res = await fetch(`${API_BASE}/leads/${leadId}/banks`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const data = await res.json();
      setBanks(data.banks || []);
      // Initialize form state for each processing bank
      const forms = {};
      (data.banks || []).forEach(b => {
        forms[b.id] = { amount: '', file: null, uploaded: false };
      });
      setBankForms(forms);
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

  const handleFileSelect = (bankId, e) => {
    const file = e.target.files[0];
    if (file) updateBankForm(bankId, 'file', file);
  };

  const handleUploadLetter = async (bankId) => {
    const form = bankForms[bankId];
    if (!form?.file || !selectedLead) return;

    setLoading(true);
    setError('');

    try {
      const bank = banks.find(b => b.id === bankId);
      const formData = new FormData();
      formData.append('leadId', selectedLead.id);
      formData.append('documentId', `sanction_letter_${bank.bank_name}`);
      formData.append('documentName', `Sanction Letter - ${bank.bank_name}`);
      formData.append('file', form.file);

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

      updateBankForm(bankId, 'uploaded', true);
      setSuccess('Sanction letter uploaded');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError('Failed to upload sanction letter');
    } finally {
      setLoading(false);
    }
  };

  const handleSanctionBank = async (bankId) => {
    const form = bankForms[bankId];
    if (!form?.amount || !form?.uploaded) return;

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

                      {/* Upload Sanction Letter */}
                      <div className="mb-4">
                        <label className="block text-sm font-semibold text-gray-700 mb-2">Sanction Letter</label>
                        <div className="flex items-center gap-4">
                          <label className={`flex-1 cursor-pointer border-2 border-dashed rounded-xl p-3 text-center transition-colors ${
                            form.uploaded ? 'border-green-400 bg-green-50' : 'border-gray-300 hover:border-blue-400'
                          }`}>
                            {form.file ? (
                              <div className="flex items-center justify-center gap-2">
                                <svg className="h-5 w-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                <span className="text-sm text-gray-700">{form.file.name}</span>
                                {form.uploaded && <span className="text-xs text-green-600">Uploaded</span>}
                              </div>
                            ) : (
                              <span className="text-sm text-gray-500">Click to select file</span>
                            )}
                            <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" onChange={(e) => handleFileSelect(bank.id, e)} />
                          </label>
                          {form.file && !form.uploaded && (
                            <button
                              onClick={() => handleUploadLetter(bank.id)}
                              disabled={loading}
                              className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
                            >
                              Upload
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div className="flex gap-3">
                        <button
                          onClick={() => handleSanctionBank(bank.id)}
                          disabled={!form.uploaded || !form.amount || loading}
                          className={`flex-1 px-4 py-3 rounded-xl font-semibold text-white transition-all ${
                            form.uploaded && form.amount
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
    </div>
  );
}
