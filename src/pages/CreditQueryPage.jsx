import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import StatusBadge from '../components/StatusBadge';
import API_BASE from '../config/api';

export default function CreditQueryPage() {
  const { accessToken, user, impersonating, isImpersonating } = useAuth();
  const [leads, setLeads] = useState([]);
  const [selectedLead, setSelectedLead] = useState(null);
  const [creditQueries, setCreditQueries] = useState([]);
  const [banks, setBanks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showAddQuery, setShowAddQuery] = useState(false);
  const [newQuery, setNewQuery] = useState({
    bank_name: '',
    query_type: 'initial',
    remarks: ''
  });

  useEffect(() => {
    if (!accessToken) return;
    fetchEligibleLeads();
  }, [accessToken]);

  const fetchEligibleLeads = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/leads`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const data = await res.json();
      const allLeads = data.data || [];

      // Filter by impersonated executive if admin is impersonating
      const executiveName = isImpersonating ? impersonating?.name : null;
      const filtered = executiveName
        ? allLeads.filter(l => l.assignedTo === executiveName)
        : allLeads;

      // Only active leads with at least one bank assigned
      const eligible = filtered.filter(l => {
        const hasBanks = l.assignedBanks && l.assignedBanks.length > 0;
        return l.isActive !== false && hasBanks;
      });

      setLeads(eligible);
    } catch (err) {
      setError('Failed to load leads');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectLead = async (lead) => {
    setSelectedLead(lead);
    setError('');
    setSuccess('');
    setShowAddQuery(false);

    // Fetch credit queries for this lead
    try {
      const res = await fetch(`${API_BASE}/credit-queries/lead/${lead.id}`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const data = await res.json();
      setCreditQueries(data.data || []);
      setBanks(data.banks || []);
    } catch (err) {
      setCreditQueries([]);
      setBanks([]);
    }
  };

  const handleAddQuery = async (e) => {
    e.preventDefault();
    if (!newQuery.bank_name || !selectedLead) return;

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/credit-queries`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          lead_id: selectedLead.id,
          bank_name: newQuery.bank_name,
          query_type: newQuery.query_type,
          remarks: newQuery.remarks
        })
      });

      if (res.ok) {
        setSuccess('Credit query added successfully!');
        setNewQuery({ bank_name: '', query_type: 'initial', remarks: '' });
        setShowAddQuery(false);
        // Refresh
        const refreshRes = await fetch(`${API_BASE}/credit-queries/lead/${selectedLead.id}`, {
          headers: { Authorization: `Bearer ${accessToken}` }
        });
        const refreshData = await refreshRes.json();
        setCreditQueries(refreshData.data || []);
      } else {
        const errData = await res.json();
        setError(errData.error || 'Failed to add credit query');
      }
    } catch (err) {
      setError('Failed to add credit query');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateQueryStatus = async (queryId, newStatus) => {
    try {
      const res = await fetch(`${API_BASE}/credit-queries/${queryId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          status: newStatus,
          response_remarks: newStatus === 'completed' || newStatus === 'received' 
            ? 'Response received'
            : undefined
        })
      });

      if (res.ok) {
        setSuccess('Query status updated!');
        setCreditQueries(prev => prev.map(q => 
          q.id === queryId ? { ...q, status: newStatus } : q
        ));
      } else {
        const errData = await res.json();
        setError(errData.error || 'Failed to update query');
      }
    } catch (err) {
      setError('Failed to update query');
    }
  };

  const handleDeleteQuery = async (queryId) => {
    if (!window.confirm('Delete this credit query?')) return;
    try {
      const res = await fetch(`${API_BASE}/credit-queries/${queryId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (res.ok) {
        setCreditQueries(prev => prev.filter(q => q.id !== queryId));
        setSuccess('Credit query deleted!');
      }
    } catch (err) {
      setError('Failed to delete query');
    }
  };

  const getQueryStatusBadge = (status) => {
    const colors = {
      'pending': 'bg-yellow-100 text-yellow-700 border-yellow-200',
      'sent': 'bg-blue-100 text-blue-700 border-blue-200',
      'received': 'bg-green-100 text-green-700 border-green-200',
      'completed': 'bg-emerald-100 text-emerald-700 border-emerald-200',
      'rejected': 'bg-red-100 text-red-700 border-red-200'
    };
    return (
      <span className={`${colors[status] || 'bg-gray-100 text-gray-600'} px-2 py-0.5 rounded-full text-xs font-semibold border`}>
        {status?.charAt(0).toUpperCase() + status?.slice(1) || 'Pending'}
      </span>
    );
  };

  return (
    <div className="py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Credit Query Management</h1>
        <p className="text-gray-500 mt-1">Manage credit inquiries raised by banks for active leads.</p>
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-2xl mb-6">
          {error}
          <button onClick={() => setError('')} className="ml-2 float-right">&times;</button>
        </div>
      )}
      {success && (
        <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded-2xl mb-6">
          {success}
          <button onClick={() => setSuccess('')} className="ml-2 float-right">&times;</button>
        </div>
      )}

      <div className="grid lg:grid-cols-12 gap-6">
        {/* Left: Leads List */}
        <div className="lg:col-span-4">
          <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
            <div className="p-4 border-b bg-gray-50">
              <h3 className="font-semibold text-gray-800">
                Active Leads with Banks ({leads.length})
              </h3>
            </div>

            {loading && !selectedLead ? (
              <div className="p-6 text-center text-gray-500">Loading...</div>
            ) : leads.length === 0 ? (
              <div className="p-6 text-center text-gray-500">No active leads with bank assignments.</div>
            ) : (
              <div className="divide-y max-h-[600px] overflow-y-auto">
                {leads.map(lead => (
                  <div
                    key={lead.id}
                    onClick={() => handleSelectLead(lead)}
                    className={`p-4 cursor-pointer transition-all hover:bg-blue-50 ${
                      selectedLead?.id === lead.id ? 'bg-blue-50 border-l-4 border-l-blue-500' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <h4 className="font-semibold text-gray-900 text-sm">{lead.customerName}</h4>
                      <StatusBadge status={lead.status} />
                    </div>
                    <p className="text-xs text-gray-500">{lead.mobile}</p>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {lead.assignedBanks?.map((bank, i) => (
                        <span key={i} className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded text-[10px] font-medium border border-blue-100">
                          {bank}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: Credit Query Details */}
        <div className="lg:col-span-8">
          {selectedLead ? (
            <div className="space-y-6">
              {/* Lead Summary */}
              <div className="bg-white rounded-2xl shadow-sm border p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">{selectedLead.customerName}</h3>
                    <p className="text-sm text-gray-500">{selectedLead.mobile} | {selectedLead.loanType?.replace('_', ' ')}</p>
                  </div>
                  <StatusBadge status={selectedLead.status} />
                </div>

                <div className="grid md:grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500 font-medium">Assigned Banks:</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {(selectedLead.bankDetails || selectedLead.assignedBanks || []).map((bank, i) => {
                        const bankName = typeof bank === 'string' ? bank : bank.bankName;
                        const branchName = typeof bank === 'object' ? bank.branchName : null;
                        return (
                          <div key={i} className="flex flex-col">
                            <span className="bg-green-50 text-green-700 px-2 py-0.5 rounded text-xs font-medium border border-green-100">
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
                  <div>
                    <span className="text-gray-500 font-medium">Date of Entry:</span>
                    <p className="font-semibold mt-1">
                      {selectedLead.entryDate || selectedLead.createdAt 
                        ? new Date(selectedLead.entryDate || selectedLead.createdAt).toLocaleDateString('en-IN', {
                            day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
                          })
                        : 'N/A'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Credit Queries Section */}
              <div className="bg-white rounded-2xl shadow-sm border p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-gray-900">Credit Queries</h3>
                  <button
                    onClick={() => setShowAddQuery(!showAddQuery)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-xl font-semibold text-sm hover:bg-blue-700 transition-all flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                    {showAddQuery ? 'Cancel' : 'New Query'}
                  </button>
                </div>

                {/* Add Query Form */}
                {showAddQuery && (
                  <form onSubmit={handleAddQuery} className="bg-blue-50 rounded-xl p-5 mb-6 border border-blue-100">
                    <h4 className="font-semibold text-blue-800 text-sm mb-4">Raise New Credit Query</h4>
                    <div className="grid md:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1">Bank *</label>
                        <select
                          className="w-full border rounded-xl px-3 py-2.5 text-sm bg-white"
                          value={newQuery.bank_name}
                          onChange={e => setNewQuery({...newQuery, bank_name: e.target.value})}
                          required
                        >
                          <option value="">Select Bank</option>
                          {(selectedLead.assignedBanks || []).map((bank, i) => (
                            <option key={i} value={bank}>{bank}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1">Query Type</label>
                        <select
                          className="w-full border rounded-xl px-3 py-2.5 text-sm bg-white"
                          value={newQuery.query_type}
                          onChange={e => setNewQuery({...newQuery, query_type: e.target.value})}
                        >
                          <option value="initial">Initial Query</option>
                          <option value="followup">Follow-up Query</option>
                          <option value="revalidation">Revalidation</option>
                          <option value="other">Other</option>
                        </select>
                      </div>
                      <div className="flex items-end">
                        <button
                          type="submit"
                          disabled={loading}
                          className="w-full py-2.5 bg-blue-600 text-white rounded-xl font-semibold text-sm hover:bg-blue-700 disabled:opacity-50"
                        >
                          {loading ? 'Adding...' : 'Add Query'}
                        </button>
                      </div>
                    </div>
                    <div className="mt-3">
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Remarks (optional)</label>
                      <textarea
                        className="w-full border rounded-xl px-3 py-2 text-sm bg-white resize-none"
                        rows={2}
                        value={newQuery.remarks}
                        onChange={e => setNewQuery({...newQuery, remarks: e.target.value})}
                        placeholder="Any additional notes..."
                      />
                    </div>
                  </form>
                )}

                {/* Queries List */}
                {creditQueries.length === 0 ? (
                  <div className="text-center py-8 text-gray-500 border border-dashed rounded-xl">
                    <svg className="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <p>No credit queries raised yet for this lead.</p>
                    <p className="text-xs mt-1">Click "New Query" to raise a credit inquiry for a bank.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {creditQueries.map((query) => (
                      <div key={query.id} className="border border-gray-200 rounded-xl p-4 hover:shadow-sm transition-shadow">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100 flex items-center justify-center text-xs font-bold text-blue-700">
                              CQ
                            </div>
                            <div>
                              <span className="font-bold text-gray-900 text-sm">{query.bank_name}</span>
                              <span className="ml-2 text-xs text-gray-500 capitalize bg-gray-100 px-2 py-0.5 rounded-full">
                                {query.query_type}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {getQueryStatusBadge(query.status)}
                            <div className="flex gap-1">
                              {query.status === 'pending' && (
                                <>
                                  <button
                                    onClick={() => handleUpdateQueryStatus(query.id, 'sent')}
                                    className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50 transition-colors"
                                    title="Mark as Sent"
                                  >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                                    </svg>
                                  </button>
                                  <button
                                    onClick={() => handleUpdateQueryStatus(query.id, 'completed')}
                                    className="p-1.5 rounded-lg text-green-600 hover:bg-green-50 transition-colors"
                                    title="Mark as Completed"
                                  >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                  </button>
                                </>
                              )}
                              {query.status === 'sent' && (
                                <button
                                  onClick={() => handleUpdateQueryStatus(query.id, 'received')}
                                  className="p-1.5 rounded-lg text-green-600 hover:bg-green-50 transition-colors"
                                  title="Mark as Received"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                  </svg>
                                </button>
                              )}
                              <button
                                onClick={() => handleDeleteQuery(query.id)}
                                className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 transition-colors"
                                title="Delete"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            </div>
                          </div>
                        </div>

                        {query.remarks && (
                          <p className="text-sm text-gray-600 ml-11 mb-2">{query.remarks}</p>
                        )}

                        <div className="flex items-center gap-4 ml-11 text-xs text-gray-500">
                          <span>Query Date: {query.query_date ? new Date(query.query_date).toLocaleDateString('en-IN') : 'N/A'}</span>
                          {query.response_date && (
                            <span>Response: {new Date(query.response_date).toLocaleDateString('en-IN')}</span>
                          )}
                          <span>Created: {new Date(query.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-sm border p-12 text-center">
              <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <h3 className="text-xl font-bold text-gray-400 mb-2">Select a Lead</h3>
              <p className="text-gray-400">Choose an active lead with assigned banks to view and manage credit queries.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
