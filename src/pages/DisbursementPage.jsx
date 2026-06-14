import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import StatusBadge from '../components/StatusBadge';
import API_BASE from '../config/api';

export default function DisbursementPage() {
  const { accessToken, refreshAccessToken, user, impersonating, isImpersonating } = useAuth();
  const [leads, setLeads] = useState([]);
  const [selectedLead, setSelectedLead] = useState(null);
  const [banks, setBanks] = useState([]);
  const [bankAmounts, setBankAmounts] = useState({}); // { [bankId]: amountString }
  const [disbursements, setDisbursements] = useState({}); // { [bankId]: [{id, amount, disbursed_at, ...}] }
  const [editingDisbursement, setEditingDisbursement] = useState(null); // { bankId, id, amount, notes }
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
      // Filter by impersonated executive if admin is impersonating
      const executiveName = isImpersonating ? impersonating?.name : null;
      const filteredByExecutive = executiveName
        ? allLeads.filter(l => l.assignedTo === executiveName)
        : allLeads;
      // Show leads with at least one sanctioned or partially-disbursed bank
      const eligible = filteredByExecutive.filter(
        l => l.status === 'Sanctioned' || l.status === 'Partially Disbursed'
      );
      setLeads(eligible);
    } catch (err) {
      setError('Failed to load leads');
    } finally {
      setFetchingLeads(false);
    }
  };

  const fetchDisbursementsForBank = async (leadId, bankId) => {
    try {
      const token = accessToken || localStorage.getItem('instafin_token');
      const res = await fetch(`${API_BASE}/leads/${leadId}/banks/${bankId}/disbursements`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setDisbursements(prev => ({ ...prev, [bankId]: data.disbursements || [] }));
    } catch (err) {
      console.error('Failed to load disbursements:', err);
    }
  };

  const fetchBanks = async (leadId) => {
    try {
      const token = accessToken || localStorage.getItem('instafin_token');
      const res = await fetch(`${API_BASE}/leads/${leadId}/banks`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      const banksData = data.banks || [];
      setBanks(banksData);
      setBankAmounts({});
      // Fetch disbursement history for each bank
      banksData.forEach(bank => fetchDisbursementsForBank(leadId, bank.id));
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
      // Also refresh disbursements immediately for the bank that was just disbursed
      fetchDisbursementsForBank(selectedLead.id, bankId);
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
    <div className="max-w-6xl mx-auto px-3 sm:px-6 py-6 sm:py-12">
      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Disbursement</h1>
        <p className="text-sm sm:text-base text-gray-500 mt-1">Process bank-wise disbursements for sanctioned leads</p>
      </div>

      {error && (
        <div className="mb-4 p-3 sm:p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
          {error}
          <button onClick={() => setError('')} className="ml-2 text-red-500 hover:text-red-700">&times;</button>
        </div>
      )}
      {success && (
        <div className="mb-4 p-3 sm:p-4 bg-green-50 border border-green-200 rounded-xl text-green-700 text-sm">
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

                          {/* Disbursement History */}
                          {(disbursements[bank.id]?.length > 0 || bank.status === 'Partially Disbursed' || bank.status === 'Disbursed') && (
                            <div className="mt-3 pt-3 border-t border-gray-100">
                              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Disbursement History</p>
                              <div className="space-y-1.5">
                                {(disbursements[bank.id] || []).map(d => (
                                  editingDisbursement?.id === d.id && editingDisbursement?.bankId === bank.id ? (
                                    <div key={d.id} className="bg-amber-50 border border-amber-200 rounded-lg p-2">
                                      <div className="flex gap-2 items-center mb-1.5">
                                        <span className="text-xs text-gray-500">₹</span>
                                        <input
                                          type="number"
                                          value={editingDisbursement.amount}
                                          onChange={(e) => setEditingDisbursement(prev => ({ ...prev, amount: e.target.value }))}
                                          className="w-28 px-2 py-1 border rounded text-xs"
                                          min="1"
                                        />
                                        <input
                                          type="text"
                                          value={editingDisbursement.notes || ''}
                                          onChange={(e) => setEditingDisbursement(prev => ({ ...prev, notes: e.target.value }))}
                                          placeholder="Notes (optional)"
                                          className="flex-1 px-2 py-1 border rounded text-xs"
                                        />
                                      </div>
                                      <div className="flex gap-1.5 justify-end">
                                        <button
                                          onClick={async () => {
                                            const newAmount = Number(editingDisbursement.amount);
                                            if (!newAmount || newAmount <= 0) {
                                              setError('Enter a valid amount');
                                              return;
                                            }
                                            setLoading(true);
                                            try {
                                              const token = accessToken || localStorage.getItem('instafin_token');
                                              const res = await fetch(
                                                `${API_BASE}/leads/${selectedLead.id}/banks/${bank.id}/disbursements/${d.id}`,
                                                {
                                                  method: 'PUT',
                                                  headers: {
                                                    'Content-Type': 'application/json',
                                                    Authorization: `Bearer ${token}`
                                                  },
                                                  body: JSON.stringify({
                                                    amount: newAmount,
                                                    notes: editingDisbursement.notes
                                                  })
                                                }
                                              );
                                              const data = await res.json();
                                              if (!res.ok) {
                                                setError(data.error || 'Failed to update');
                                                setLoading(false);
                                                return;
                                              }
                                              setEditingDisbursement(null);
                                              setSuccess('Disbursement updated successfully');
                                              setTimeout(() => setSuccess(''), 4000);
                                              fetchBanks(selectedLead.id);
                                            } catch (err) {
                                              setError('Failed to update disbursement');
                                            } finally {
                                              setLoading(false);
                                            }
                                          }}
                                          disabled={loading}
                                          className="px-2 py-1 text-xs font-semibold bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                                        >
                                          Save
                                        </button>
                                        <button
                                          onClick={() => setEditingDisbursement(null)}
                                          className="px-2 py-1 text-xs font-semibold bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                                        >
                                          Cancel
                                        </button>
                                      </div>
                                    </div>
                                  ) : (
                                    <div key={d.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-2.5 py-1.5">
                                      <div className="flex items-center gap-2 min-w-0">
                                        <svg className="w-3 h-3 text-green-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                        <span className="font-bold text-gray-800 text-xs">₹{Number(d.amount).toLocaleString()}</span>
                                        <span className="text-[10px] text-gray-400">
                                          {d.disbursed_at ? new Date(d.disbursed_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : ''}
                                        </span>
                                        {d.disbursedByName && (
                                          <span className="text-[10px] text-gray-400">by {d.disbursedByName}</span>
                                        )}
                                        {d.notes && (
                                          <span className="text-[10px] text-gray-400 italic truncate max-w-[80px]">· {d.notes}</span>
                                        )}
                                      </div>
                                      <button
                                        onClick={() => setEditingDisbursement({ bankId: bank.id, id: d.id, amount: d.amount, notes: d.notes || '' })}
                                        className="px-1.5 py-0.5 text-[10px] font-semibold text-blue-600 bg-blue-50 rounded hover:bg-blue-100 flex-shrink-0"
                                      >
                                        Edit
                                      </button>
                                    </div>
                                  )
                                ))}
                                {/* Show total disbursed for this bank if there's history */}
                                {disbursements[bank.id]?.length > 1 && (
                                  <div className="flex justify-between items-center pt-1.5 border-t border-gray-200 mt-1.5 px-2.5">
                                    <span className="text-[10px] font-bold text-gray-500 uppercase">Total Disbursed</span>
                                    <span className="text-xs font-bold text-gray-800">₹{disbursements[bank.id].reduce((s, d) => s + Number(d.amount), 0).toLocaleString()}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
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
