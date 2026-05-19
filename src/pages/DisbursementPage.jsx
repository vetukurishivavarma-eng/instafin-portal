import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import StatusBadge from '../components/StatusBadge';
import API_BASE from '../config/api';

export default function DisbursementPage() {
  const { accessToken, refreshAccessToken } = useAuth();
  const [leads, setLeads] = useState([]);
  const [selectedLead, setSelectedLead] = useState(null);
  const [disburseAmount, setDisburseAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetchingLeads, setFetchingLeads] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (!accessToken) return;
    fetchSanctionedLeads();
  }, [accessToken]);

  const fetchSanctionedLeads = async () => {
    setFetchingLeads(true);
    try {
      const token = accessToken || localStorage.getItem('instafin_token');
      const res = await fetch(`${API_BASE}/leads`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (res.status === 401) {
        const refreshed = await refreshAccessToken();
        if (!refreshed) {
          setError('Session expired. Please login again.');
          return;
        }
        return fetchSanctionedLeads();
      }

      const data = await res.json();
      const allLeads = data.data || data || [];
      // Filter sanctioned and partially disbursed leads
      const sanctionedLeads = allLeads.filter(
        l => l.status === 'Sanctioned' || l.status === 'Partially Disbursed'
      );
      setLeads(sanctionedLeads);
    } catch (err) {
      setError('Failed to load leads');
    } finally {
      setFetchingLeads(false);
    }
  };

  const handleLeadSelect = (lead) => {
    setSelectedLead(lead);
    setDisburseAmount('');
    setError('');
    setSuccess('');
  };

  const getRemainingAmount = (lead) => {
    const sanctioned = lead.sanctionedAmount || 0;
    const disbursed = lead.disbursedAmount || 0;
    return sanctioned - disbursed;
  };

  const handleDisburse = async () => {
    if (!selectedLead || !disburseAmount) return;

    const amount = Number(disburseAmount);
    if (isNaN(amount) || amount <= 0) {
      setError('Enter a valid amount');
      return;
    }

    const remaining = getRemainingAmount(selectedLead);
    if (amount > remaining) {
      setError(`Amount exceeds remaining ₹${remaining.toLocaleString()}`);
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const token = accessToken || localStorage.getItem('instafin_token');
      const res = await fetch(`${API_BASE}/leads/${selectedLead.id}/disburse`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ amount })
      });

      if (res.status === 401) {
        const refreshed = await refreshAccessToken();
        if (!refreshed) {
          setError('Session expired. Please login again.');
          setLoading(false);
          return;
        }
        return handleDisburse();
      }

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to disburse');
        setLoading(false);
        return;
      }

      setSuccess(data.message);
      setSelectedLead(null);
      setDisburseAmount('');
      fetchSanctionedLeads();
    } catch (err) {
      setError('Failed to process disbursement');
    } finally {
      setLoading(false);
    }
  };

  const handleDisburseAll = () => {
    if (!selectedLead) return;
    const remaining = getRemainingAmount(selectedLead);
    setDisburseAmount(remaining.toString());
  };

  const formatCurrency = (val) => {
    if (!val && val !== 0) return '-';
    return `₹${Number(val).toLocaleString()}`;
  };

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Disbursement</h1>
        <p className="text-gray-500 mt-1">Manage sanctioned leads and process disbursements</p>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700">
          {error}
          <button onClick={() => setError('')} className="ml-2 text-red-500 hover:text-red-700">&times;</button>
        </div>
      )}

      {success && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-xl text-green-700">
          {success}
          <button onClick={() => setSuccess('')} className="ml-2 text-green-500 hover:text-green-700">&times;</button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Leads List */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
            <div className="p-4 border-b bg-gray-50">
              <h3 className="font-semibold text-gray-800">
                Sanctioned Leads ({leads.length})
              </h3>
            </div>

            {fetchingLeads ? (
              <div className="p-8 text-center text-gray-500">Loading...</div>
            ) : leads.length === 0 ? (
              <div className="p-8 text-center text-gray-500">No sanctioned leads found</div>
            ) : (
              <div className="divide-y max-h-[600px] overflow-y-auto">
                {leads.map(lead => {
                  const remaining = getRemainingAmount(lead);
                  const progress = lead.sanctionedAmount
                    ? ((lead.disbursedAmount || 0) / lead.sanctionedAmount) * 100
                    : 0;

                  return (
                    <div
                      key={lead.id}
                      onClick={() => handleLeadSelect(lead)}
                      className={`p-4 cursor-pointer transition-all hover:bg-blue-50 ${
                        selectedLead?.id === lead.id ? 'bg-blue-50 border-l-4 border-l-blue-500' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center text-white font-bold text-sm">
                            {lead.customerName?.charAt(0)?.toUpperCase() || '?'}
                          </div>
                          <div>
                            <h4 className="font-semibold text-gray-900">{lead.customerName || 'Unknown'}</h4>
                            <p className="text-sm text-gray-500">{lead.mobile}</p>
                          </div>
                        </div>
                        <StatusBadge status={lead.status} />
                      </div>

                      <div className="grid grid-cols-3 gap-4 mt-3 text-sm">
                        <div>
                          <p className="text-gray-500">Sanctioned</p>
                          <p className="font-semibold text-gray-800">{formatCurrency(lead.sanctionedAmount)}</p>
                        </div>
                        <div>
                          <p className="text-gray-500">Disbursed</p>
                          <p className="font-semibold text-gray-800">{formatCurrency(lead.disbursedAmount)}</p>
                        </div>
                        <div>
                          <p className="text-gray-500">Remaining</p>
                          <p className="font-semibold text-green-600">{formatCurrency(remaining)}</p>
                        </div>
                      </div>

                      {/* Progress bar */}
                      <div className="mt-3">
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-gradient-to-r from-green-400 to-emerald-500 h-2 rounded-full transition-all"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                        <p className="text-xs text-gray-500 mt-1">{progress.toFixed(0)}% disbursed</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Disbursement Panel */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-2xl shadow-sm border p-6 sticky top-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Process Disbursement</h3>

            {selectedLead ? (
              <>
                <div className="bg-gray-50 rounded-xl p-4 mb-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center text-white font-bold">
                      {selectedLead.customerName?.charAt(0)?.toUpperCase() || '?'}
                    </div>
                    <div>
                      <h4 className="font-semibold text-gray-900">{selectedLead.customerName}</h4>
                      <p className="text-sm text-gray-500">{selectedLead.mobile}</p>
                    </div>
                  </div>

                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Sanctioned Amount</span>
                      <span className="font-semibold">{formatCurrency(selectedLead.sanctionedAmount)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Already Disbursed</span>
                      <span className="font-semibold">{formatCurrency(selectedLead.disbursedAmount)}</span>
                    </div>
                    <div className="flex justify-between border-t pt-2">
                      <span className="text-gray-700 font-medium">Remaining</span>
                      <span className="font-bold text-green-600">{formatCurrency(getRemainingAmount(selectedLead))}</span>
                    </div>
                  </div>
                </div>

                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Disbursement Amount
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">₹</span>
                    <input
                      type="number"
                      value={disburseAmount}
                      onChange={(e) => setDisburseAmount(e.target.value)}
                      placeholder="Enter amount"
                      className="w-full pl-8 pr-4 py-3 border rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500"
                      min="0"
                      max={getRemainingAmount(selectedLead)}
                    />
                  </div>
                  <button
                    onClick={handleDisburseAll}
                    className="mt-2 text-sm text-green-600 hover:text-green-800 font-medium"
                  >
                    Disburse Full Amount ({formatCurrency(getRemainingAmount(selectedLead))})
                  </button>
                </div>

                {disburseAmount && Number(disburseAmount) > 0 && (
                  <div className="mb-4 p-3 bg-blue-50 rounded-xl text-sm text-blue-800">
                    <p className="font-medium">After disbursement:</p>
                    <p>
                      Status: {Number(disburseAmount) >= getRemainingAmount(selectedLead)
                        ? 'Disbursed (Complete)'
                        : 'Partially Disbursed'}
                    </p>
                    <p>Total Disbursed: {formatCurrency((selectedLead.disbursedAmount || 0) + Number(disburseAmount))}</p>
                  </div>
                )}

                <button
                  onClick={handleDisburse}
                  disabled={!disburseAmount || Number(disburseAmount) <= 0 || loading}
                  className={`w-full px-6 py-3 rounded-xl font-semibold text-white transition-all ${
                    disburseAmount && Number(disburseAmount) > 0 && !loading
                      ? 'bg-gradient-to-r from-green-500 to-emerald-600 hover:shadow-lg'
                      : 'bg-gray-300 cursor-not-allowed'
                  }`}
                >
                  {loading ? 'Processing...' : 'Disburse'}
                </button>
              </>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <svg className="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                <p>Select a lead to process disbursement</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
