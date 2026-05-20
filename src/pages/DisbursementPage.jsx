import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import StatusBadge from '../components/StatusBadge';
import API_BASE from '../config/api';

export default function DisbursementPage() {
  const { accessToken, refreshAccessToken } = useAuth();
  const [leads, setLeads] = useState([]);
  const [selectedLead, setSelectedLead] = useState(null);
  const [banks, setBanks] = useState([]);
  const [bankAmounts, setBankAmounts] = useState({}); // { [bankId]: amountString }
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
        if (!refreshed) { setError('Session expired. Please login again.'); return; }
        return fetchSanctionedLeads();
      }

      const data = await res.json();
      const allLeads = data.data || data || [];
      // Show leads with at least one sanctioned or partially-disbursed bank
      const eligible = allLeads.filter(
        l => l.status === 'Sanctioned' || l.status === 'Partially Disbursed'
      );
      setLeads(eligible);
    } catch (err) {
      setError('Failed to load leads');
    } finally {
      setFetchingLeads(false);
    }
  };

  const fetchBanks = async (leadId) => {
    try {
      const token = accessToken || localStorage.getItem('instafin_token');
      const res = await fetch(`${API_BASE}/leads/${leadId}/banks`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setBanks(data.banks || []);
      setBankAmounts({});
    } catch (err) {
      setError('Failed to load bank details');
    }
  };

  const handleLeadSelect = (lead) => {
    setSelectedLead(lead);
    setError('');
    setSuccess('');
    fetchBanks(lead.id);
  };

  const handleDisburseBank = async (bankId) => {
    const amountStr = bankAmounts[bankId];
    if (!amountStr) return;
    const amount = Number(amountStr);
    if (isNaN(amount) || amount <= 0) {
      setError('Enter a valid amount');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const token = accessToken || localStorage.getItem('instafin_token');
      const res = await fetch(`${API_BASE}/leads/${selectedLead.id}/banks/${bankId}/disburse`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ amount })
      });

      if (res.status === 401) {
        const refreshed = await refreshAccessToken();
        if (!refreshed) { setError('Session expired.'); setLoading(false); return; }
        return handleDisburseBank(bankId);
      }

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to disburse');
        setLoading(false);
        return;
      }

      const bank = banks.find(b => b.id === bankId);
      setSuccess(`${bank?.bank_name}: ₹${amount.toLocaleString()} disbursed successfully`);
      setTimeout(() => setSuccess(''), 5000);

      setBankAmounts({});
      fetchBanks(selectedLead.id);
      fetchSanctionedLeads();
    } catch (err) {
      setError('Failed to process disbursement');
    } finally {
      setLoading(false);
    }
  };

  const handleDisburseFull = (bankId) => {
    const bank = banks.find(b => b.id === bankId);
    if (!bank) return;
    const remaining = (Number(bank.sanctioned_amount) || 0) - (Number(bank.disbursed_amount) || 0);
    setBankAmounts(prev => ({ ...prev, [bankId]: remaining.toString() }));
  };

  const formatCurrency = (val) => {
    if (!val && val !== 0) return '-';
    return `₹${Number(val).toLocaleString()}`;
  };

  // Filter banks that can receive disbursement
  const disbursementBanks = banks.filter(b => ['Sanctioned', 'Partially Disbursed'].includes(b.status));

  // Aggregate stats
  const totalSanctioned = banks
    .filter(b => ['Sanctioned', 'Partially Disbursed', 'Disbursed'].includes(b.status))
    .reduce((sum, b) => sum + (Number(b.sanctioned_amount) || 0), 0);
  const totalDisbursed = banks.reduce((sum, b) => sum + (Number(b.disbursed_amount) || 0), 0);

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Disbursement</h1>
        <p className="text-gray-500 mt-1">Process bank-wise disbursements for sanctioned leads</p>
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
                  const leadTotalSanctioned = lead.sanctionedAmount || 0;
                  const leadTotalDisbursed = lead.disbursedAmount || 0;
                  const progress = leadTotalSanctioned ? (leadTotalDisbursed / leadTotalSanctioned) * 100 : 0;

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
                            <p className="text-sm text-gray-500">{lead.mobile} &middot; {lead.assignedBanks?.join(', ')}</p>
                          </div>
                        </div>
                        <StatusBadge status={lead.status} />
                      </div>

                      <div className="grid grid-cols-3 gap-4 mt-3 text-sm">
                        <div>
                          <p className="text-gray-500">Sanctioned</p>
                          <p className="font-semibold text-gray-800">{formatCurrency(leadTotalSanctioned)}</p>
                        </div>
                        <div>
                          <p className="text-gray-500">Disbursed</p>
                          <p className="font-semibold text-gray-800">{formatCurrency(leadTotalDisbursed)}</p>
                        </div>
                        <div>
                          <p className="text-gray-500">Remaining</p>
                          <p className="font-semibold text-green-600">{formatCurrency(leadTotalSanctioned - leadTotalDisbursed)}</p>
                        </div>
                      </div>

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

        {/* Bank-wise Disbursement Panel */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-2xl shadow-sm border p-6 sticky top-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Process Disbursement</h3>

            {selectedLead ? (
              <>
                {/* Lead Summary */}
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
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Total Sanctioned</span>
                      <span className="font-semibold">{formatCurrency(totalSanctioned)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Total Disbursed</span>
                      <span className="font-semibold">{formatCurrency(totalDisbursed)}</span>
                    </div>
                  </div>
                </div>

                {/* Bank Cards */}
                {disbursementBanks.length === 0 ? (
                  <p className="text-gray-500 text-sm text-center py-4">No banks available for disbursement</p>
                ) : (
                  <div className="space-y-4">
                    {disbursementBanks.map(bank => {
                      const sanctioned = Number(bank.sanctioned_amount) || 0;
                      const disbursed = Number(bank.disbursed_amount) || 0;
                      const remaining = sanctioned - disbursed;
                      const progress = sanctioned ? (disbursed / sanctioned) * 100 : 0;

                      return (
                        <div key={bank.id} className="border rounded-xl p-4">
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-bold text-gray-900">{bank.bank_name}</span>
                            <StatusBadge status={bank.status} />
                          </div>

                          <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                            <div>
                              <span className="text-gray-500">Sanctioned: </span>
                              <span className="font-medium">{formatCurrency(sanctioned)}</span>
                            </div>
                            <div>
                              <span className="text-gray-500">Disbursed: </span>
                              <span className="font-medium">{formatCurrency(disbursed)}</span>
                            </div>
                          </div>

                          <div className="mb-3">
                            <div className="w-full bg-gray-200 rounded-full h-1.5">
                              <div
                                className="bg-green-500 h-1.5 rounded-full transition-all"
                                style={{ width: `${progress}%` }}
                              />
                            </div>
                            <p className="text-xs text-gray-500 mt-1">Remaining: {formatCurrency(remaining)}</p>
                          </div>

                          <div className="flex gap-2">
                            <div className="relative flex-1">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">₹</span>
                              <input
                                type="number"
                                value={bankAmounts[bank.id] || ''}
                                onChange={(e) => setBankAmounts(prev => ({ ...prev, [bank.id]: e.target.value }))}
                                placeholder="Amount"
                                className="w-full pl-7 pr-2 py-2 border rounded-lg text-sm"
                                min="0"
                                max={remaining}
                              />
                            </div>
                            <button
                              onClick={() => handleDisburseFull(bank.id)}
                              className="px-3 py-2 text-xs font-medium text-green-700 bg-green-50 rounded-lg hover:bg-green-100 whitespace-nowrap"
                            >
                              Full
                            </button>
                            <button
                              onClick={() => handleDisburseBank(bank.id)}
                              disabled={!bankAmounts[bank.id] || Number(bankAmounts[bank.id]) <= 0 || loading}
                              className="px-4 py-2 text-sm font-semibold text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              Disburse
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Fully Disbursed Banks */}
                {banks.filter(b => b.status === 'Disbursed').length > 0 && (
                  <div className="mt-4 pt-4 border-t">
                    <p className="text-xs text-gray-500 mb-2">Fully Disbursed</p>
                    {banks.filter(b => b.status === 'Disbursed').map(bank => (
                      <div key={bank.id} className="flex items-center justify-between text-sm py-1">
                        <span className="text-gray-600">{bank.bank_name}</span>
                        <span className="text-green-600 font-medium">{formatCurrency(bank.disbursed_amount)}</span>
                      </div>
                    ))}
                  </div>
                )}
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
