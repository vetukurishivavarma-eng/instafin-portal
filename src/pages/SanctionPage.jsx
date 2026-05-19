import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import StatusBadge from '../components/StatusBadge';
import API_BASE from '../config/api';

export default function SanctionPage() {
  const { accessToken } = useAuth();
  const [leads, setLeads] = useState([]);
  const [selectedLead, setSelectedLead] = useState(null);
  const [sanctionedAmount, setSanctionedAmount] = useState('');
  const [sanctionLetter, setSanctionLetter] = useState(null);
  const [letterUploaded, setLetterUploaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [amountError, setAmountError] = useState('');

  useEffect(() => {
    if (!accessToken) return;
    fetchProcessingLeads();
  }, [accessToken]);

  const fetchProcessingLeads = async () => {
    try {
      const res = await fetch(`${API_BASE}/leads?status=Processing`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const data = await res.json();
      setLeads(data.data || data || []);
    } catch (err) {
      setError('Failed to load leads');
    }
  };

  const handleLeadSelect = (e) => {
    const leadId = e.target.value;
    const lead = leads.find(l => String(l.id) === String(leadId));
    setSelectedLead(lead || null);
    setSanctionedAmount('');
    setSanctionLetter(null);
    setLetterUploaded(false);
    setError('');
    setSuccess('');
    setAmountError('');
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSanctionLetter(file);
    }
  };

  const handleUploadLetter = async () => {
    if (!sanctionLetter || !selectedLead) return;

    setLoading(true);
    setError('');

    try {
      const formData = new FormData();
      formData.append('leadId', selectedLead.id);
      formData.append('documentId', 'sanction_letter');
      formData.append('documentName', 'Sanction Letter');
      formData.append('file', sanctionLetter);

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

      setLetterUploaded(true);
      setSuccess('Sanction letter uploaded successfully');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError('Failed to upload sanction letter');
    } finally {
      setLoading(false);
    }
  };

  const handleSanction = async () => {
    if (!selectedLead || !sanctionedAmount || !letterUploaded) return;

    // Hard validation - block if amount exceeds expected
    const expected = Number(String(selectedLead.expectedAmount).replace(/[^0-9]/g, ''));
    const sanctioned = Number(sanctionedAmount);
    if (!expected || !sanctioned || sanctioned > expected) {
      setAmountError(`Cannot exceed expected loan amount (₹${expected.toLocaleString()})`);
      return;
    }

    setLoading(true);
    setError('');
    setAmountError('');

    try {
      const res = await fetch(`${API_BASE}/leads/${selectedLead.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          status: 'Sanctioned',
          expectedAmount: sanctionedAmount
        })
      });

      if (!res.ok) {
        const errData = await res.json();
        setError(errData.error || 'Failed to sanction lead');
        return;
      }

      setSuccess(`Lead ${selectedLead.customerName} sanctioned successfully with amount ₹${Number(sanctionedAmount).toLocaleString()}`);
      setTimeout(() => setSuccess(''), 5000);

      // Reset and refresh
      setSelectedLead(null);
      setSanctionedAmount('');
      setSanctionLetter(null);
      setLetterUploaded(false);
      fetchProcessingLeads();
    } catch (err) {
      setError('Failed to sanction lead');
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async () => {
    if (!selectedLead) return;

    setLoading(true);
    setError('');

    try {
      const res = await fetch(`${API_BASE}/leads/${selectedLead.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({ status: 'Rejected' })
      });

      if (!res.ok) {
        const errData = await res.json();
        setError(errData.error || 'Failed to reject lead');
        return;
      }

      setSuccess(`Lead ${selectedLead.customerName} has been rejected`);
      setTimeout(() => setSuccess(''), 5000);

      // Reset and refresh
      setSelectedLead(null);
      setSanctionedAmount('');
      setSanctionLetter(null);
      setLetterUploaded(false);
      fetchProcessingLeads();
    } catch (err) {
      setError('Failed to reject lead');
    } finally {
      setLoading(false);
    }
  };

  const formatAmount = (val) => {
    const num = val.replace(/[^0-9]/g, '');
    return num;
  };

  return (
    <div className="py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Sanction Management</h1>
        <p className="text-gray-500">Select a processing lead to sanction or reject</p>
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-2xl mb-6">{error}</div>
      )}
      {success && (
        <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded-2xl mb-6">{success}</div>
      )}

      {/* Lead Selector */}
      <div className="bg-white rounded-3xl shadow-xl p-6 mb-8">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Select Processing Lead</h2>
        <select
          className="w-full border rounded-xl px-4 py-3"
          value={selectedLead?.id || ''}
          onChange={handleLeadSelect}
        >
          <option value="">Choose a lead</option>
          {leads.map(lead => (
            <option key={lead.id} value={lead.id}>
              {lead.customerName} — {lead.mobile} ({lead.loanType || 'N/A'})
            </option>
          ))}
        </select>
        {leads.length === 0 && (
          <p className="text-gray-500 text-sm mt-2">No leads with "Processing" status available.</p>
        )}
      </div>

      {/* Sanction Form */}
      {selectedLead && (
        <div className="bg-white rounded-3xl shadow-xl p-8">
          {/* Lead Info */}
          <div className="bg-blue-50 rounded-xl p-6 mb-8">
            <h3 className="text-lg font-semibold text-blue-800 mb-3">Lead Information</h3>
            <div className="grid md:grid-cols-3 gap-4 text-sm">
              <div>
                <span className="text-gray-500">Customer: </span>
                <span className="font-medium">{selectedLead.customerName}</span>
              </div>
              <div>
                <span className="text-gray-500">Mobile: </span>
                <span className="font-medium">{selectedLead.mobile}</span>
              </div>
              <div>
                <span className="text-gray-500">Loan Type: </span>
                <span className="font-medium">{selectedLead.loanType || 'N/A'}</span>
              </div>
              <div>
                <span className="text-gray-500">Expected Amount: </span>
                <span className="font-medium">{selectedLead.expectedAmount || 'N/A'}</span>
              </div>
              <div>
                <span className="text-gray-500">Status: </span>
                <StatusBadge status={selectedLead.status} />
              </div>
              <div>
                <span className="text-gray-500">Banks: </span>
                <span className="font-medium">
                  {selectedLead.assignedBanks && selectedLead.assignedBanks.length > 0
                    ? selectedLead.assignedBanks.join(', ')
                    : 'None'}
                </span>
              </div>
            </div>
          </div>

          {/* Sanctioned Amount */}
          <div className="mb-6">
            <label className="block text-sm font-semibold text-gray-700 mb-2">Sanctioned Amount (₹)</label>
            <input
              type="text"
              placeholder="Enter sanctioned amount (numbers only)"
              className={`w-full border rounded-xl px-4 py-3 text-lg ${amountError ? 'border-red-500' : ''}`}
              value={sanctionedAmount}
              onChange={(e) => {
                const val = formatAmount(e.target.value);
                setSanctionedAmount(val);

                // Real-time validation
                const rawExpected = selectedLead.expectedAmount;
                const expected = Number(String(rawExpected).replace(/[^0-9]/g, ''));
                const sanctioned = Number(val);
                console.log('Validation:', { rawExpected, expected, val, sanctioned, willError: val && expected && sanctioned > expected });
                if (val && expected && sanctioned > expected) {
                  setAmountError(`Cannot exceed expected loan amount (₹${expected.toLocaleString()})`);
                } else {
                  setAmountError('');
                }
              }}
            />
            {amountError && (
              <p className="text-sm text-red-500 mt-1">{amountError}</p>
            )}
            {sanctionedAmount && !amountError && (
              <p className="text-sm text-gray-500 mt-1">₹{Number(sanctionedAmount).toLocaleString()}</p>
            )}
          </div>

          {/* Upload Sanction Letter */}
          <div className="mb-8">
            <label className="block text-sm font-semibold text-gray-700 mb-2">Sanction Letter</label>
            <div className="flex items-center gap-4">
              <label className={`flex-1 cursor-pointer border-2 border-dashed rounded-xl p-4 text-center transition-colors ${
                letterUploaded ? 'border-green-400 bg-green-50' : 'border-gray-300 hover:border-blue-400'
              }`}>
                {sanctionLetter ? (
                  <div>
                    <svg className="mx-auto h-8 w-8 text-green-500 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="text-sm font-medium text-gray-700">{sanctionLetter.name}</p>
                    {letterUploaded && <p className="text-xs text-green-600 mt-1">Uploaded</p>}
                  </div>
                ) : (
                  <div>
                    <svg className="mx-auto h-8 w-8 text-gray-400 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    <p className="text-sm text-gray-500">Click to select sanction letter</p>
                    <p className="text-xs text-gray-400 mt-1">PDF, JPG, PNG, DOC (max 10MB)</p>
                  </div>
                )}
                <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" onChange={handleFileSelect} />
              </label>

              {sanctionLetter && !letterUploaded && (
                <button
                  onClick={handleUploadLetter}
                  disabled={loading}
                  className="px-6 py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap"
                >
                  {loading ? 'Uploading...' : 'Upload Letter'}
                </button>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-4">
            <button
              onClick={handleSanction}
              disabled={!letterUploaded || !sanctionedAmount || !!amountError || loading}
              className={`flex-1 px-6 py-3 rounded-xl font-semibold text-white transition-all ${
                letterUploaded && sanctionedAmount && !amountError
                  ? 'bg-green-700 hover:bg-green-800 shadow-sm hover:shadow-md'
                  : 'bg-gray-300 cursor-not-allowed'
              }`}
            >
              {loading ? 'Processing...' : 'Sanction Lead'}
            </button>
            <button
              onClick={handleReject}
              disabled={loading}
              className="px-6 py-3 rounded-xl font-semibold text-white bg-red-600 hover:bg-red-700 shadow-sm hover:shadow-md disabled:opacity-50"
            >
              Reject Lead
            </button>
          </div>

          {!letterUploaded && (
            <p className="text-xs text-gray-500 mt-3 text-center">Upload the sanction letter to enable the Sanction button</p>
          )}
        </div>
      )}

      {!selectedLead && leads.length > 0 && (
        <div className="text-center py-8 text-gray-500">
          Select a processing lead above to proceed with sanction or rejection.
        </div>
      )}
    </div>
  );
}
