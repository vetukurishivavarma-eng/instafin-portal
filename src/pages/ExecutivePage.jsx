import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import StatusBadge from '../components/StatusBadge';
import API_BASE from '../config/api';
import { ALL_BANKS, COMMON_BANKS } from '../data/banks';

export default function ExecutivePage() {
  const { accessToken, impersonate, user } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('leads');
  const [executives, setExecutives] = useState([]);
  const [selectedExec, setSelectedExec] = useState('');
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [bankModal, setBankModal] = useState(null);
  const [selectedBank, setSelectedBank] = useState('');
  const [customBankInput, setCustomBankInput] = useState('');
  const [branchName, setBranchName] = useState('');
  const [showBankSuggestions, setShowBankSuggestions] = useState(false);
  const bankInputRef = useRef(null);
  const [filteredSuggestions, setFilteredSuggestions] = useState([]);

  // Access request state
  const [pendingRequests, setPendingRequests] = useState([]);
  const [allRequests, setAllRequests] = useState([]);
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [processingId, setProcessingId] = useState(null);
  const [showRejectModal, setShowRejectModal] = useState(null);
  const [showRevokeModal, setShowRevokeModal] = useState(null);
  const [emailTesting, setEmailTesting] = useState(false);
  const [testEmailAddress, setTestEmailAddress] = useState('yeshwantraavi4@gmail.com');

  // Lead History state
  const [showHistoryFor, setShowHistoryFor] = useState(null);
  const [historyData, setHistoryData] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const handleShowHistory = async (lead) => {
    setHistoryLoading(true);
    setShowHistoryFor(lead);
    try {
      const res = await fetch(`${API_BASE}/status-history/${lead.id}`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const data = await res.json();
      setHistoryData(data.data || []);
    } catch (err) {
      setHistoryData([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  // Test SMTP configuration
  const handleTestEmail = async () => {
    if (!testEmailAddress) {
      setError('Please enter an email address to send the test to.');
      return;
    }
    setEmailTesting(true);
    setError('');
    setSuccess('');
    try {
      const res = await fetch(`${API_BASE}/auth/test-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({ email: testEmailAddress })
      });
      const data = await res.json();
      if (data.success) {
        setSuccess(`✅ Test email sent to ${testEmailAddress}! Check inbox (and spam folder).`);
      } else {
        setError(`❌ Email test failed: ${data.error || 'Unknown error'}`);
      }
    } catch (err) {
      setError('Failed to test email: ' + err.message);
    } finally {
      setEmailTesting(false);
    }
  };

  useEffect(() => {
    if (!accessToken) return;
    fetch(`${API_BASE}/leads/meta/executives`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    })
      .then(r => r.json())
      .then(data => setExecutives(data || []))
      .catch(() => {});
  }, [accessToken]);

  // Fetch pending access requests
  useEffect(() => {
    if (!accessToken || activeTab !== 'requests') return;
    fetchPendingRequests();
  }, [accessToken, activeTab]);

  const fetchPendingRequests = async () => {
    setRequestsLoading(true);
    try {
      const [pendingRes, allRes] = await Promise.all([
        fetch(`${API_BASE}/auth/pending-requests`, {
          headers: { Authorization: `Bearer ${accessToken}` }
        }),
        fetch(`${API_BASE}/auth/all-requests`, {
          headers: { Authorization: `Bearer ${accessToken}` }
        })
      ]);
      const pendingData = pendingRes.ok ? await pendingRes.json() : [];
      const allData = allRes.ok ? await allRes.json() : [];
      setPendingRequests(Array.isArray(pendingData) ? pendingData : []);
      setAllRequests(Array.isArray(allData) ? allData : []);
    } catch (err) {
      setError('Failed to load access requests');
    } finally {
      setRequestsLoading(false);
    }
  };

  const handleApprove = async (requestId) => {
    setProcessingId(requestId);
    setError('');
    setSuccess('');
    try {
      const res = await fetch(`${API_BASE}/auth/approve-request/${requestId}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to approve request');
        return;
      }
      let successMsg = data.message;
      if (data.emailSent) {
        successMsg += ' ✅ Email sent.';
      } else {
        successMsg += ' ⚠️ Email NOT sent';
        if (data.emailError) successMsg += ` — ${data.emailError}`;
      }
      if (data.whatsappSent) successMsg += ' ✅ WhatsApp sent.';
      setSuccess(successMsg);
      fetchPendingRequests();
    } catch (err) {
      setError('Failed to approve request');
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (requestId) => {
    setProcessingId(requestId);
    setError('');
    setSuccess('');
    try {
      const res = await fetch(`${API_BASE}/auth/reject-request/${requestId}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to reject request');
        return;
      }
      let successMsg = data.message;
      if (data.emailSent) {
        successMsg += ' ✅ Email sent.';
      } else {
        successMsg += ' ⚠️ Email NOT sent';
        if (data.emailError) successMsg += ` — ${data.emailError}`;
      }
      setSuccess(successMsg);
      setShowRejectModal(null);
      fetchPendingRequests();
    } catch (err) {
      setError('Failed to reject request');
    } finally {
      setProcessingId(null);
    }
  };

  const fetchExecutiveLeads = async (execName) => {
    if (!execName) {
      setLeads([]);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/leads`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const data = await res.json();
      const allLeads = data.data || data || [];
      const execLeads = allLeads.filter(l => l.assignedTo === execName);
      setLeads(execLeads);
    } catch (err) {
      setError('Failed to load leads');
    } finally {
      setLoading(false);
    }
  };

  const handleExecSelect = (e) => {
    const name = e.target.value;
    setSelectedExec(name);
    fetchExecutiveLeads(name);
  };

  const handleAssignBank = async () => {
    const bankName = selectedBank === 'Other' ? customBankInput.trim() : selectedBank;
    if (!bankName || !bankModal) {
      setError('Please select or type a bank name');
      setTimeout(() => setError(''), 5000);
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/leads/${bankModal.id}/assign-bank`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({ bankName, branchName: branchName.trim() || null })
      });

      if (!res.ok) {
        const errData = await res.json();
        setError(errData.error || 'Failed to assign bank');
        setTimeout(() => setError(''), 5000);
        return;
      }

      const data = await res.json();
      setSuccess(`Bank "${bankName}" assigned to ${bankModal.customerName}`);
      setTimeout(() => setSuccess(''), 3000);

      setLeads(prev => prev.map(l => {
        if (l.id === bankModal.id) {
          return {
            ...l,
            assignedBanks: [...(l.assignedBanks || []), bankName],
            status: data.lead.status
          };
        }
        return l;
      }));

      setBankModal(null);
      setSelectedBank('');
      setCustomBankInput('');
      setBranchName('');
    } catch (err) {
      setError('Failed to assign bank');
      setTimeout(() => setError(''), 5000);
    }
  };

  const tabs = [
    { key: 'leads', label: 'Executive Leads' },
    { key: 'requests', label: `Access Requests (${pendingRequests.length})` },
  ];

  return (
    <div className="py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Executive Management</h1>
        <p className="text-gray-500">Manage executives, their leads, and access requests</p>
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-2xl mb-6">
          {error}
          <button onClick={() => setError('')} className="float-right font-bold">&times;</button>
        </div>
      )}
      {success && (
        <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded-2xl mb-6">
          {success}
          <button onClick={() => setSuccess('')} className="float-right font-bold">&times;</button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 mb-8">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-6 py-3 rounded-xl font-semibold text-sm transition-all ${
              activeTab === tab.key
                ? 'bg-blue-600 text-white shadow-lg'
                : 'bg-white text-gray-600 hover:bg-gray-50 shadow'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab 1: Executive Leads Management */}
      {activeTab === 'leads' && (
        <>
          <div className="bg-white rounded-3xl shadow-xl p-6 mb-8">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Select Executive</h2>
            <select
              className="w-full border rounded-xl px-4 py-3"
              value={selectedExec}
              onChange={handleExecSelect}
            >
              <option value="">Choose an executive</option>
              {executives.map(ex => (
                <option key={ex.id} value={ex.name}>{ex.name} — {ex.department || 'Executive'}</option>
              ))}
            </select>
            
            {/* Login as Executive buttons */}
            <div className="mt-4 flex flex-wrap gap-2">
              {executives.map(ex => (
                <button
                  key={ex.id}
                  onClick={() => {
                    impersonate({ id: ex.id, name: ex.name, email: ex.email || '' });
                    navigate('/executive/leads');
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-lg text-xs font-semibold hover:from-indigo-600 hover:to-purple-700 transition-all hover:scale-105 active:scale-95 shadow-md"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                  </svg>
                  Login as {ex.name}
                </button>
              ))}
            </div>
          </div>

          {selectedExec && (
            <div className="bg-white rounded-3xl shadow-xl p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-gray-900">
                  Leads assigned to {selectedExec}
                </h2>
                <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-sm font-medium">
                  {leads.length} Lead{leads.length !== 1 ? 's' : ''}
                </span>
              </div>

              {loading ? (
                <p className="text-gray-500 text-center py-8">Loading leads...</p>
              ) : leads.length === 0 ? (
                <p className="text-gray-500 text-center py-8">No leads assigned to this executive.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-3 px-4 text-sm font-semibold text-gray-600">Customer</th>
                        <th className="text-left py-3 px-4 text-sm font-semibold text-gray-600">Mobile</th>
                        <th className="text-left py-3 px-4 text-sm font-semibold text-gray-600">Loan Type</th>
                        <th className="text-left py-3 px-4 text-sm font-semibold text-gray-600">Amount</th>
                        <th className="text-left py-3 px-4 text-sm font-semibold text-gray-600">Banks</th>
                        <th className="text-left py-3 px-4 text-sm font-semibold text-gray-600">Status</th>
                        <th className="text-left py-3 px-4 text-sm font-semibold text-gray-600">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {leads.map(lead => (
                        <tr key={lead.id} className="border-b hover:bg-gray-50">
                          <td className="py-3 px-4 font-medium">{lead.customerName}</td>
                          <td className="py-3 px-4 text-gray-600">{lead.mobile}</td>
                          <td className="py-3 px-4">
                            <span className="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full text-xs font-medium">
                              {lead.loanType || 'N/A'}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-gray-600">{lead.expectedAmount || 'N/A'}</td>
                          <td className="py-3 px-4">
                            {lead.assignedBanks && lead.assignedBanks.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {lead.assignedBanks.map((bank, i) => (
                                  <span key={i} className="bg-green-100 text-green-700 px-2 py-0.5 rounded-full text-xs font-medium">{bank}</span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-gray-400 text-xs">No bank assigned</span>
                            )}
                          </td>
                          <td className="py-3 px-4"><StatusBadge status={lead.status} /></td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => { setBankModal(lead); setSelectedBank(''); }}
                                className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 transition-colors"
                              >
                                Assign Bank
                              </button>
                              <button
                                onClick={() => handleShowHistory(lead)}
                                className="text-xs bg-indigo-100 text-indigo-700 px-3 py-1.5 rounded-lg hover:bg-indigo-200 transition-colors font-semibold"
                              >
                                History
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
          )}

          {/* Assign Bank Modal */}
          {bankModal && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={() => setBankModal(null)}>
              <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl" onClick={e => e.stopPropagation()}>
                <h3 className="text-xl font-bold text-gray-900 mb-2">Assign Bank</h3>
                <p className="text-gray-500 mb-6">Assign a bank to <strong>{bankModal.customerName}</strong></p>

                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Select Bank</label>
                  <select
                    className="w-full border rounded-xl px-4 py-3"
                    value={selectedBank}
                    onChange={e => {
                      setSelectedBank(e.target.value);
                      if (e.target.value !== 'Other') {
                        setCustomBankInput('');
                        setShowBankSuggestions(false);
                      }
                    }}
                  >
                    <option value="">Choose a bank</option>
                    {ALL_BANKS.map(bank => (
                      <option key={bank} value={bank}>{bank}</option>
                    ))}
                  </select>

                  {selectedBank === 'Other' && (
                    <div className="mt-3 relative" ref={bankInputRef}>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Type Bank Name</label>
                      <input
                        type="text"
                        placeholder="Start typing bank name..."
                        className="w-full border rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                        value={customBankInput}
                        onChange={e => {
                          const val = e.target.value;
                          setCustomBankInput(val);
                          if (val.length >= 1) {
                            const filtered = COMMON_BANKS.filter(b =>
                              b.toLowerCase().includes(val.toLowerCase())
                            );
                            setFilteredSuggestions(filtered.slice(0, 8));
                            setShowBankSuggestions(true);
                          } else {
                            setFilteredSuggestions([]);
                            setShowBankSuggestions(false);
                          }
                        }}
                        onFocus={() => {
                          if (customBankInput.length >= 1 && filteredSuggestions.length > 0) {
                            setShowBankSuggestions(true);
                          }
                        }}
                        onBlur={() => {
                          setTimeout(() => setShowBankSuggestions(false), 200);
                        }}
                      />
                      {showBankSuggestions && filteredSuggestions.length > 0 && (
                        <div className="absolute z-10 w-full bg-white border border-gray-200 rounded-xl shadow-lg mt-1 max-h-48 overflow-y-auto">
                          {filteredSuggestions.map((suggestion, i) => (
                            <button
                              key={i}
                              type="button"
                              className="w-full text-left px-4 py-2.5 hover:bg-blue-50 text-sm font-medium transition-colors border-b border-gray-50 last:border-b-0"
                              onMouseDown={() => {
                                setCustomBankInput(suggestion);
                                setShowBankSuggestions(false);
                              }}
                            >
                              {suggestion}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Branch Name Input - appears when a bank is selected */}
                {(selectedBank || (selectedBank === 'Other' && customBankInput.trim())) && (
                  <div className="mb-6 bg-blue-50 border border-blue-100 rounded-xl p-4">
                    <label className="block text-sm font-bold text-gray-700 mb-2">
                      Branch Name <span className="text-gray-400 font-normal">(optional)</span>
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Andheri Main Branch, MG Road Branch..."
                      className="w-full border border-gray-200 rounded-xl px-4 py-2.5 bg-white focus:ring-2 focus:ring-blue-200 focus:outline-none transition-all font-semibold text-sm"
                      value={branchName}
                      onChange={e => setBranchName(e.target.value)}
                    />
                    <p className="text-[10px] text-gray-400 mt-1">Branch details will appear in lead details and shared checklists.</p>
                  </div>
                )}

                {bankModal.assignedBanks && bankModal.assignedBanks.length > 0 && (
                  <div className="mb-6">
                    <p className="text-sm text-gray-500 mb-2">Already assigned:</p>
                    <div className="flex flex-wrap gap-2">
                      {bankModal.assignedBanks.map((bank, i) => (
                        <span key={i} className="inline-flex items-center gap-1.5 bg-green-100 text-green-700 px-3 py-1 rounded-full text-sm">
                          {bank}
                          <button
                            onClick={async (e) => {
                              e.stopPropagation();
                              if (!window.confirm(`Remove "${bank}" from ${bankModal.customerName}?`)) return;
                              try {
                                const res = await fetch(`${API_BASE}/leads/${bankModal.id}/remove-bank`, {
                                  method: 'PUT',
                                  headers: {
                                    'Content-Type': 'application/json',
                                    Authorization: `Bearer ${accessToken}`
                                  },
                                  body: JSON.stringify({ bankName: bank })
                                });
                                if (!res.ok) {
                                  const errData = await res.json();
                                  setError(errData.error || 'Failed to remove bank');
                                  setTimeout(() => setError(''), 5000);
                                  return;
                                }
                                const data = await res.json();
                                setSuccess(`"${bank}" removed from ${bankModal.customerName}`);
                                setTimeout(() => setSuccess(''), 3000);
                                setBankModal(prev => ({
                                  ...prev,
                                  assignedBanks: prev.assignedBanks.filter(b => b !== bank),
                                  status: data.lead.status
                                }));
                                setLeads(prev => prev.map(l => {
                                  if (l.id === bankModal.id) {
                                    return { ...l, assignedBanks: l.assignedBanks.filter(b => b !== bank), status: data.lead.status };
                                  }
                                  return l;
                                }));
                              } catch (err) {
                                setError('Failed to remove bank');
                                setTimeout(() => setError(''), 5000);
                              }
                            }}
                            className="ml-0.5 text-green-500 hover:text-red-600 transition-colors"
                            title={`Remove ${bank}`}
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex gap-3">
                  <button
                    onClick={() => setBankModal(null)}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-xl text-gray-700 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAssignBank}
                    disabled={selectedBank === 'Other' ? !customBankInput.trim() : !selectedBank}
                    className={`flex-1 px-4 py-2 rounded-xl font-medium text-white ${selectedBank === 'Other' ? (customBankInput.trim() ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-300 cursor-not-allowed') : (selectedBank ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-300 cursor-not-allowed')}`}
                  >
                    Assign Bank
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Tab 2: Access Requests */}
      {activeTab === 'requests' && (
        <div className="space-y-8">
          {/* Pending Requests */}
          <div className="bg-white rounded-3xl shadow-xl p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-gray-900">
                Pending Access Requests
                {pendingRequests.length > 0 && (
                  <span className="ml-3 bg-yellow-100 text-yellow-700 px-3 py-1 rounded-full text-sm font-medium">
                    {pendingRequests.length} pending
                  </span>
                )}
              </h2>
              <div className="flex items-center gap-3">
                <input
                  type="email"
                  value={testEmailAddress}
                  onChange={e => setTestEmailAddress(e.target.value)}
                  placeholder="Enter email to send test to"
                  className="border rounded-xl px-4 py-2 text-sm w-72 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={handleTestEmail}
                  disabled={emailTesting}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-200 transition-all disabled:opacity-50"
                >
                  {emailTesting ? '⏳ Sending...' : '🧪 Test Email'}
                </button>
              </div>
            </div>

            {requestsLoading ? (
              <p className="text-gray-500 text-center py-8">Loading requests...</p>
            ) : pendingRequests.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-5xl mb-4">📨</div>
                <h3 className="text-lg font-semibold text-gray-700 mb-2">No Pending Requests</h3>
                <p className="text-gray-500">New executive access requests will appear here.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {pendingRequests.map(request => (
                  <div key={request.id} className="border border-gray-200 rounded-2xl p-5 hover:shadow-md transition-shadow">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="flex-1">
                        <h3 className="text-lg font-bold text-gray-900">{request.name}</h3>
                        <div className="flex flex-wrap gap-4 mt-1 text-sm text-gray-600">
                          <span>📧 {request.email}</span>
                          {request.mobile && <span>📞 {request.mobile}</span>}
                        </div>
                        <p className="text-xs text-gray-400 mt-2">
                          Requested: {new Date(request.created_at).toLocaleDateString('en-IN', {
                            day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
                          })}
                        </p>
                      </div>
                      <div className="flex gap-3">
                        <button
                          onClick={() => handleApprove(request.id)}
                          disabled={processingId === request.id}
                          className="px-6 py-2.5 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl font-semibold text-sm hover:from-green-600 hover:to-emerald-700 transition-all disabled:opacity-50 shadow-md"
                        >
                          {processingId === request.id ? 'Approving...' : '✅ Approve'}
                        </button>
                        <button
                          onClick={() => setShowRejectModal(request)}
                          className="px-6 py-2.5 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-xl font-semibold text-sm hover:from-red-600 hover:to-red-700 transition-all shadow-md"
                        >
                          ❌ Reject
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Request History */}
          {allRequests.length > 0 && (
            <div className="bg-white rounded-3xl shadow-xl p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-6">Request History</h2>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-3 px-4 text-sm font-semibold text-gray-600">Name</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-gray-600">Email</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-gray-600">Status</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-gray-600">Date</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-gray-600">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allRequests.map(request => (
                      <tr key={request.id} className="border-b hover:bg-gray-50">
                        <td className="py-3 px-4 font-medium">{request.name}</td>
                        <td className="py-3 px-4 text-gray-600">{request.email}</td>
                        <td className="py-3 px-4">
                          <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                            request.status === 'approved' ? 'bg-green-100 text-green-700' :
                            request.status === 'rejected' ? 'bg-red-100 text-red-700' :
                            request.status === 'revoked' ? 'bg-gray-100 text-gray-600' :
                            'bg-yellow-100 text-yellow-700'
                          }`}>
                            {request.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-gray-500 text-sm">
                          {new Date(request.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </td>
                        <td className="py-3 px-4">
                          {request.status === 'approved' && (
                            <button
                              onClick={() => setShowRevokeModal(request)}
                              className="px-3 py-1.5 bg-red-100 text-red-700 rounded-lg text-xs font-semibold hover:bg-red-200 transition-colors"
                            >
                              🗑️ Delete
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Revoke Access Confirmation Modal */}
      {showRevokeModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={() => setShowRevokeModal(null)}>
          <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
                <svg className="w-6 h-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-900">Revoke Executive Access</h3>
                <p className="text-sm text-gray-500">This action cannot be undone</p>
              </div>
            </div>
            <p className="text-gray-600 mb-2">
              Are you sure you want to revoke access for <strong>{showRevokeModal.name}</strong>?
            </p>
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl p-3 mb-6">
              This will delete their user account. <strong>{showRevokeModal.email}</strong> will no longer be able to log in.
            </p>
            <div className="flex gap-3">
              <button
                onClick={async () => {
                  setProcessingId(showRevokeModal.id);
                  try {
                    const res = await fetch(`${API_BASE}/auth/revoke-access/${showRevokeModal.id}`, {
                      method: 'POST',
                      headers: { Authorization: `Bearer ${accessToken}` }
                    });
                    const data = await res.json();
                    if (!res.ok) {
                      setError(data.error || 'Failed to revoke access');
                    } else {
                      setSuccess(data.message);
                    }
                    setShowRevokeModal(null);
                    fetchPendingRequests();
                  } catch (err) {
                    setError('Failed to revoke access');
                    setShowRevokeModal(null);
                  } finally {
                    setProcessingId(null);
                  }
                }}
                disabled={processingId === showRevokeModal.id}
                className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-xl font-semibold hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {processingId === showRevokeModal.id ? (
                  'Revoking...'
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    Yes, Revoke Access
                  </>
                )}
              </button>
              <button
                onClick={() => setShowRevokeModal(null)}
                className="flex-1 px-4 py-2.5 border border-gray-300 rounded-xl text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Confirmation Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={() => setShowRejectModal(null)}>
          <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-xl font-bold text-gray-900 mb-2">Reject Access Request</h3>
            <p className="text-gray-600 mb-6">
              Are you sure you want to reject <strong>{showRejectModal.name}</strong>'s access request?
            </p>
            <p className="text-sm text-gray-500 mb-6">
              A rejection email will be sent to {showRejectModal.email}.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => handleReject(showRejectModal.id)}
                disabled={processingId === showRejectModal.id}
                className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-xl font-semibold hover:bg-red-700 disabled:opacity-50"
              >
                {processingId === showRejectModal.id ? 'Rejecting...' : 'Yes, Reject'}
              </button>
              <button
                onClick={() => setShowRejectModal(null)}
                className="flex-1 px-4 py-2.5 border border-gray-300 rounded-xl text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
      {/* Lead History Popup */}
      {showHistoryFor && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={() => { setShowHistoryFor(null); setHistoryData([]); }}>
          <div className="bg-white rounded-3xl p-8 max-w-lg w-full max-h-[80vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-xl font-bold text-gray-900">Lead History</h3>
                <p className="text-sm text-gray-500">{showHistoryFor.customerName} - {showHistoryFor.mobile}</p>
              </div>
              <button
                onClick={() => { setShowHistoryFor(null); setHistoryData([]); }}
                className="text-gray-400 hover:text-gray-600 text-2xl"
              >
                &times;
              </button>
            </div>
            {historyLoading ? (
              <div className="text-center py-12"><p>Loading...</p></div>
            ) : historyData.length === 0 ? (
              <div className="text-center py-12 text-gray-500">No status history available.</div>
            ) : (
              <div className="space-y-4">
                {historyData.map((entry, index) => (
                  <div key={entry.id || index} className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold px-2 py-0.5 rounded bg-green-100 text-green-700">{entry.new_status}</span>
                      <span className="text-xs text-gray-500">{entry.changed_by} - {new Date(entry.changed_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
}
