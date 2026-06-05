import React, { useState, useEffect, useRef } from 'react';
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
  const [leadsLoading, setLeadsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showAddQuery, setShowAddQuery] = useState(false);
  const [newQuery, setNewQuery] = useState({
    bank_name: '',
    query_type: 'initial',
    remarks: ''
  });
  const [resolvingQuery, setResolvingQuery] = useState(null);
  const [resolutionText, setResolutionText] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const dropdownRef = useRef(null);

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

  useEffect(() => {
    if (!accessToken) return;
    fetchEligibleLeads();
  }, [accessToken]);

  const fetchEligibleLeads = async () => {
    setLeadsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/leads`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const data = await res.json();
      const allLeads = data.data || [];

      const executiveName = isImpersonating ? impersonating?.name : null;
      const filtered = executiveName
        ? allLeads.filter(l => l.assignedTo === executiveName)
        : allLeads;

      const eligible = filtered.filter(l => {
        if (l.status === 'Rejected') return false;
        const hasBanks = l.assignedBanks && l.assignedBanks.length > 0;
        return l.isActive !== false && hasBanks;
      });

      setLeads(eligible);
    } catch (err) {
      setError('Failed to load leads');
    } finally {
      setLeadsLoading(false);
    }
  };

  const handleSelectLead = async (lead) => {
    setSelectedLead(lead);
    setDropdownOpen(false);
    setSearchTerm('');
    setError('');
    setSuccess('');
    setShowAddQuery(false);

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

  const handleClearLead = () => {
    setSelectedLead(null);
    setCreditQueries([]);
    setBanks([]);
    setShowAddQuery(false);
    setError('');
    setSuccess('');
  };

  const handleAddQuery = async (e) => {
    e.preventDefault();
    if (!newQuery.bank_name || !newQuery.remarks.trim() || !selectedLead) return;

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
          remarks: newQuery.remarks.trim()
        })
      });

      if (res.ok) {
        setSuccess('Credit query added successfully!');
        setNewQuery({ bank_name: '', query_type: 'initial', remarks: '' });
        setShowAddQuery(false);
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

  const handleResolveQuery = async (queryId) => {
    if (!resolutionText.trim()) {
      setError('Please enter a resolution heading/description');
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/credit-queries/${queryId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          status: 'resolved',
          response_remarks: resolutionText.trim(),
          response_date: new Date().toISOString().split('T')[0]
        })
      });

      if (res.ok) {
        setSuccess('Credit query resolved successfully!');
        setCreditQueries(prev => prev.map(q =>
          q.id === queryId ? { ...q, status: 'resolved', response_remarks: resolutionText.trim(), response_date: new Date().toISOString().split('T')[0] } : q
        ));
        setResolvingQuery(null);
        setResolutionText('');
      } else {
        const errData = await res.json();
        setError(errData.error || 'Failed to resolve query');
      }
    } catch (err) {
      setError('Failed to resolve query');
    }
  };

  const toggleResolveForm = (queryId) => {
    if (resolvingQuery === queryId) {
      setResolvingQuery(null);
      setResolutionText('');
    } else {
      setResolvingQuery(queryId);
      setResolutionText('');
    }
  };

  const getQueryStatusBadge = (status) => {
    const colors = {
      'pending': 'bg-yellow-100 text-yellow-700 border-yellow-200',
      'sent': 'bg-blue-100 text-blue-700 border-blue-200',
      'received': 'bg-green-100 text-green-700 border-green-200',
      'completed': 'bg-emerald-100 text-emerald-700 border-emerald-200',
      'resolved': 'bg-green-600 text-white border-green-700',
      'rejected': 'bg-red-100 text-red-700 border-red-200'
    };
    return (
      <span className={`${colors[status] || 'bg-gray-100 text-gray-600'} px-2 py-0.5 rounded-full text-xs font-semibold border`}>
        {status === 'resolved' ? 'Resolved' : status?.charAt(0).toUpperCase() + status?.slice(1) || 'Pending'}
      </span>
    );
  };

  // Filter leads based on search
  const filteredLeads = leads.filter(l =>
    !searchTerm ||
    l.customerName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    l.mobile?.includes(searchTerm) ||
    l.loanType?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="py-6 sm:py-12 px-3 sm:px-6">
      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Credit Query Management</h1>
        <p className="text-xs sm:text-base text-gray-500 mt-1">Manage credit inquiries raised by banks for active leads.</p>
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

      {/* Lead Search / Dropdown Select */}
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

        {/* Clear selection button */}
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

        {/* Dropdown */}
        {dropdownOpen && (
          <div className="absolute z-20 mt-2 w-full bg-white border border-gray-200 rounded-2xl shadow-xl overflow-hidden">
            {/* Search input */}
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

            {/* Results */}
            <div className="max-h-72 overflow-y-auto">
              {leadsLoading ? (
                <div className="p-6 text-center text-gray-500 text-sm">Loading leads...</div>
              ) : filteredLeads.length === 0 ? (
                <div className="p-6 text-center text-gray-400 text-sm">
                  {searchTerm ? 'No leads match your search.' : 'No active leads with bank assignments.'}
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

      {/* Credit Query Details - shown when a lead is selected */}
      {selectedLead ? (
        <div className="space-y-6 max-w-4xl mx-auto">
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

            <div className="grid md:grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-500 font-medium">Assigned Banks:</span>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {(selectedLead.bankDetails || selectedLead.assignedBanks || []).map((bank, i) => {
                    const bankName = typeof bank === 'string' ? bank : bank.bankName;
                    const branchName = typeof bank === 'object' ? bank.branchName : null;
                    return (
                      <div key={i} className="flex flex-col">
                        <span className="bg-green-50 text-green-700 px-2.5 py-1 rounded-lg text-xs font-medium border border-green-100">
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
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5 sm:p-6">
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
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Query *</label>
                  <textarea
                    className="w-full border rounded-xl px-3 py-2 text-sm bg-white resize-none"
                    rows={2}
                    maxLength={500}
                    value={newQuery.remarks}
                    onChange={e => setNewQuery({...newQuery, remarks: e.target.value})}
                    placeholder="Describe the credit query..."
                    required
                  />
                  <div className="flex justify-end mt-1">
                    <span className={`text-[11px] font-medium transition-colors ${
                      newQuery.remarks.length >= 475
                        ? 'text-red-500'
                        : newQuery.remarks.length >= 400
                        ? 'text-amber-500'
                        : 'text-gray-400'
                    }`}>
                      {newQuery.remarks.length}/500
                    </span>
                  </div>
                </div>
              </form>
            )}

            {/* Queries List */}
            {creditQueries.length === 0 ? (
              <div className="text-center py-10 text-gray-500 border-2 border-dashed border-gray-200 rounded-xl">
                <svg className="w-14 h-14 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p className="font-medium">No credit queries raised yet</p>
                <p className="text-xs mt-1 text-gray-400">Click "New Query" to raise a credit inquiry for a bank.</p>
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
                          {query.status !== 'resolved' && (
                            <button
                              onClick={() => toggleResolveForm(query.id)}
                              className={`p-1.5 rounded-lg transition-colors ${
                                resolvingQuery === query.id
                                  ? 'bg-gray-200 text-gray-600'
                                  : 'text-green-600 hover:bg-green-50'
                              }`}
                              title={resolvingQuery === query.id ? 'Cancel' : 'Resolve Query'}
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

                    {/* Resolution Form */}
                    {resolvingQuery === query.id && (
                      <div className="ml-11 mb-3 p-4 bg-green-50 border border-green-200 rounded-xl">
                        <label className="block text-xs font-bold text-green-800 mb-2">
                          Resolution Details
                        </label>
                        <textarea
                          value={resolutionText}
                          onChange={(e) => setResolutionText(e.target.value)}
                          placeholder="Enter resolution heading and description..."
                          rows={3}
                          className="w-full border border-green-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none resize-none mb-2"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleResolveQuery(query.id)}
                            disabled={!resolutionText.trim()}
                            className="px-4 py-2 bg-green-600 text-white rounded-lg text-xs font-semibold hover:bg-green-700 disabled:opacity-50 flex items-center gap-1.5"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                            Resolve Query
                          </button>
                          <button
                            onClick={() => { setResolvingQuery(null); setResolutionText(''); }}
                            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg text-xs font-semibold hover:bg-gray-300"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Show resolution text on resolved queries */}
                    {query.status === 'resolved' && query.response_remarks && (
                      <div className="ml-11 mb-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                        <div className="flex items-center gap-1.5 mb-1">
                          <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                          <span className="text-xs font-bold text-green-800 uppercase tracking-wider">Resolution</span>
                        </div>
                        <p className="text-sm text-green-900 whitespace-pre-wrap">{query.response_remarks}</p>
                      </div>
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
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-12 text-center max-w-lg mx-auto">
          <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <h3 className="text-xl font-bold text-gray-400 mb-2">Select a Lead</h3>
          <p className="text-gray-400 text-sm">Use the dropdown above to search and select an active lead with assigned banks to view and manage credit queries.</p>
        </div>
      )}
    </div>
  );
}
