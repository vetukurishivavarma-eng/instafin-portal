import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import StatusBadge from '../components/StatusBadge';
import API_BASE from '../config/api';

const BANK_OPTIONS = [
  'SBI', 'PNB', 'HDFC', 'ICICI', 'Axis Bank', 'Bank of Baroda',
  'Canara Bank', 'Union Bank', 'Kotak Mahindra', 'IDFC First',
  'Bajaj Finserv', 'Tata Capital', 'L&T Finance', 'Muthoot Finance',
  'Manappuram Finance', 'Other'
];

export default function ExecutivePage() {
  const { accessToken } = useAuth();
  const [activeTab, setActiveTab] = useState('leads');
  const [executives, setExecutives] = useState([]);
  const [selectedExec, setSelectedExec] = useState('');
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [bankModal, setBankModal] = useState(null);
  const [selectedBank, setSelectedBank] = useState('');

  // Access request state
  const [pendingRequests, setPendingRequests] = useState([]);
  const [allRequests, setAllRequests] = useState([]);
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [processingId, setProcessingId] = useState(null);
  const [showRejectModal, setShowRejectModal] = useState(null);
  const [emailTesting, setEmailTesting] = useState(false);
  const [testEmailAddress, setTestEmailAddress] = useState('yeshwantraavi4@gmail.com');

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
    if (!selectedBank || !bankModal) return;
    try {
      const res = await fetch(`${API_BASE}/leads/${bankModal.id}/assign-bank`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({ bankName: selectedBank })
      });

      if (!res.ok) {
        const errData = await res.json();
        setError(errData.error || 'Failed to assign bank');
        setTimeout(() => setError(''), 5000);
        return;
      }

      const data = await res.json();
      setSuccess(`Bank "${selectedBank}" assigned to ${bankModal.customerName}`);
      setTimeout(() => setSuccess(''), 3000);

      setLeads(prev => prev.map(l => {
        if (l.id === bankModal.id) {
          return {
            ...l,
            assignedBanks: [...(l.assignedBanks || []), selectedBank],
            status: data.lead.status
          };
        }
        return l;
      }));

      setBankModal(null);
      setSelectedBank('');
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
                            <button
                              onClick={() => { setBankModal(lead); setSelectedBank(''); }}
                              className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 transition-colors"
                            >
                              Assign Bank
                            </button>
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
                    onChange={e => setSelectedBank(e.target.value)}
                  >
                    <option value="">Choose a bank</option>
                    {BANK_OPTIONS.map(bank => (
                      <option key={bank} value={bank}>{bank}</option>
                    ))}
                  </select>
                </div>

                {bankModal.assignedBanks && bankModal.assignedBanks.length > 0 && (
                  <div className="mb-6">
                    <p className="text-sm text-gray-500 mb-2">Already assigned:</p>
                    <div className="flex flex-wrap gap-2">
                      {bankModal.assignedBanks.map((bank, i) => (
                        <span key={i} className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-sm">{bank}</span>
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
                    disabled={!selectedBank}
                    className={`flex-1 px-4 py-2 rounded-xl font-medium text-white ${selectedBank ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-300 cursor-not-allowed'}`}
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
                            'bg-yellow-100 text-yellow-700'
                          }`}>
                            {request.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-gray-500 text-sm">
                          {new Date(request.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
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
}
