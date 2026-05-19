import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import StatusBadge from '../components/StatusBadge';
import { useAuth } from '../contexts/AuthContext';
import API_BASE from '../config/api';

const getStatusBorder = (status) => {
  const colors = {
    'New': 'border-yellow-400',
    'Processing': 'border-blue-400',
    'Sanctioned': 'border-green-400',
    'Partially Disbursed': 'border-teal-400',
    'Disbursed': 'border-purple-400',
    'Assigned': 'border-orange-400',
    'Rejected': 'border-red-400'
  };
  return colors[status] || 'border-gray-200';
};

export default function PipelinePage() {
  const { accessToken, refreshAccessToken, isAdmin } = useAuth();
  const [searchParams] = useSearchParams();
  const [leads, setLeads] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || '');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingLead, setEditingLead] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [viewLead, setViewLead] = useState(null);
  const [sanctionLetterUrl, setSanctionLetterUrl] = useState(null);
  const [loadingLetter, setLoadingLetter] = useState(false);
  const intervalRef = useRef(null);

  const loadData = async () => {
    if (!accessToken) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/leads`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      if (res.status === 401) {
        // Token expired, try to refresh
        const refreshed = await refreshAccessToken();
        if (!refreshed) {
          setError('Session expired. Please login again.');
          return;
        }
        return; // Will reload on next token change
      }

      const data = await res.json();
      if (data.error) {
        setError(data.error);
        return;
      }
      setLeads(data.data || data);
    } catch (err) {
      console.error('Failed to load:', err);
      setError('Failed to load leads');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!accessToken) return;

    loadData();

    // Refresh data every 30 seconds instead of 3 seconds to reduce API load
    intervalRef.current = setInterval(loadData, 30000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [accessToken]);

  const fetchSanctionLetter = async (leadId) => {
    setLoadingLetter(true);
    setSanctionLetterUrl(null);
    try {
      const token = accessToken || localStorage.getItem('instafin_token');
      if (!token) return;

      const res = await fetch(`${API_BASE}/checklist-status/${leadId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (res.status === 401) {
        const refreshed = await refreshAccessToken();
        if (!refreshed) return;
        const retryToken = localStorage.getItem('instafin_token');
        const retryRes = await fetch(`${API_BASE}/checklist-status/${leadId}`, {
          headers: { Authorization: `Bearer ${retryToken}` }
        });
        const retryData = await retryRes.json();
        if (retryData && retryData.sanction_letter && retryData.sanction_letter.status === 'uploaded') {
          setSanctionLetterUrl(`${API_BASE}/checklist-status/file/${leadId}/sanction_letter`);
        }
        return;
      }

      const data = await res.json();
      if (data && data.sanction_letter && data.sanction_letter.status === 'uploaded') {
        setSanctionLetterUrl(`${API_BASE}/checklist-status/file/${leadId}/sanction_letter`);
      }
    } catch (err) {
      console.error('Failed to fetch sanction letter:', err);
    } finally {
      setLoadingLetter(false);
    }
  };

  const handleViewLead = (lead) => {
    setViewLead(lead);
    if (lead.status === 'Sanctioned') {
      fetchSanctionLetter(lead.id);
    }
  };

  const handleDownloadSanctionLetter = async (leadId) => {
    try {
      let token = accessToken || localStorage.getItem('instafin_token');

      // If no token, try to refresh
      if (!token) {
        const refreshed = await refreshAccessToken();
        if (!refreshed) {
          setError('Session expired. Please login again.');
          return;
        }
        token = localStorage.getItem('instafin_token');
      }

      const res = await fetch(`${API_BASE}/checklist-status/file/${leadId}/sanction_letter`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      // If 401, try refreshing token once
      if (res.status === 401) {
        const refreshed = await refreshAccessToken();
        if (!refreshed) {
          setError('Session expired. Please login again.');
          return;
        }
        token = localStorage.getItem('instafin_token');
        const retryRes = await fetch(`${API_BASE}/checklist-status/file/${leadId}/sanction_letter`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!retryRes.ok) {
          setError('Failed to download sanction letter');
          return;
        }
        const blob = await retryRes.blob();
        downloadBlob(blob, leadId);
        return;
      }

      if (!res.ok) {
        setError('Failed to download sanction letter');
        return;
      }

      const blob = await res.blob();
      downloadBlob(blob, leadId);
    } catch (err) {
      setError('Failed to download sanction letter');
    }
  };

  const downloadBlob = (blob, leadId) => {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sanction-letter-${leadId}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  const filteredLeads = leads.filter(lead => {
    const matchesSearch = !searchTerm ||
      lead.customerName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lead.mobile?.includes(searchTerm);
    const matchesStatus = !statusFilter || lead.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  if (error) {
    return (
      <div className="py-12">
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-2xl mb-6">
          {error}
        </div>
        <button onClick={loadData} className="bg-blue-700 text-white px-4 py-2 rounded-xl">
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Lead Management Pipeline</h1>
        <p className="text-gray-500">Track, assign, and manage all customer loan applications.</p>
      </div>

      <div className="bg-white rounded-3xl shadow-xl overflow-hidden">
        <div className="p-6 border-b flex flex-wrap gap-4 items-center justify-between">
          <h3 className="text-xl font-bold">All Leads ({filteredLeads.length})</h3>
          <div className="flex gap-4">
            <input type="text" placeholder="Search..." className="border rounded-xl px-4 py-2" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
            <select className="border rounded-xl px-4 py-2" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">All Status</option>
              <option value="New">New</option>
              <option value="Assigned">Assigned</option>
              <option value="Processing">Processing</option>
              <option value="Sanctioned">Sanctioned</option>
              <option value="Partially Disbursed">Partially Disbursed</option>
              <option value="Disbursed">Disbursed</option>
              <option value="Rejected">Rejected</option>
            </select>
          </div>
        </div>
        {loading ? (
          <div className="text-center py-12">Loading...</div>
        ) : filteredLeads.length === 0 ? (
          <div className="text-center py-12 text-gray-500">No leads found</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 p-6">
            {filteredLeads.map(lead => (
              <div
                key={lead.id}
                onClick={() => handleViewLead(lead)}
                className={`bg-white rounded-3xl shadow-lg hover:shadow-xl transition-all duration-300 border-l-4 ${getStatusBorder(lead.status)} cursor-pointer`}
              >
                <div className="p-6">
                  <div className="flex justify-between items-start mb-4">
                    <h3 className="text-xl font-bold text-gray-900">{lead.customerName}</h3>
                    <span className="bg-indigo-100 text-indigo-700 px-3 py-1 rounded-full text-xs font-semibold">
                      {lead.loanType}
                    </span>
                  </div>
                  <p className="text-2xl font-bold text-gray-800 mb-2">₹{lead.expectedAmount?.toLocaleString()}</p>
                  <p className="text-blue-600 text-sm mb-4">{lead.assignedBanks?.[0] || 'No bank assigned'}</p>
                  <div className="flex justify-between items-center border-t pt-4">
                    <span className="text-sm text-gray-500">{lead.assignedTo || 'Unassigned'}</span>
                    <StatusBadge status={lead.status} />
                  </div>
                  {isAdmin && (
                    <div className="flex gap-2 mt-4 pt-3 border-t">
                      <button
                        onClick={() => { setEditingLead(lead); setEditForm({...lead}); }}
                        className="flex-1 bg-blue-600 text-white py-2 px-3 rounded-lg text-sm font-semibold hover:bg-blue-700"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => setDeleteConfirm(lead)}
                        className="flex-1 bg-red-600 text-white py-2 px-3 rounded-lg text-sm font-semibold hover:bg-red-700"
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {editingLead && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setEditingLead(null)}>
          <div className="bg-white rounded-3xl p-6 w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-xl font-bold mb-4">Edit Lead</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Customer Name</label>
                <input
                  type="text"
                  className="w-full border rounded-xl px-4 py-2"
                  value={editForm.customerName || ''}
                  onChange={e => setEditForm({...editForm, customerName: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Mobile</label>
                <input
                  type="text"
                  className="w-full border rounded-xl px-4 py-2"
                  value={editForm.mobile || ''}
                  onChange={e => setEditForm({...editForm, mobile: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Loan Type</label>
                <select
                  className="w-full border rounded-xl px-4 py-2"
                  value={editForm.loanType || ''}
                  onChange={e => setEditForm({...editForm, loanType: e.target.value})}
                >
                  <option value="">Select Loan Type</option>
                  <option>Home Loan</option><option>LAP</option><option>Mudra Loan</option>
                  <option>MSME Loan</option><option>Business Loan</option><option>Personal Loan</option><option>Education Loan</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Expected Amount</label>
                <input
                  type="text"
                  className="w-full border rounded-xl px-4 py-2"
                  value={editForm.expectedAmount || ''}
                  onChange={e => setEditForm({...editForm, expectedAmount: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select
                  className="w-full border rounded-xl px-4 py-2"
                  value={editForm.status || 'New'}
                  onChange={e => setEditForm({...editForm, status: e.target.value})}
                >
                  <option>New</option><option>Processing</option><option>Assigned</option>
                  <option>Sanctioned</option><option>Disbursed</option>
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={async () => {
                  try {
                    const res = await fetch(`${API_BASE}/leads/${editingLead.id}`, {
                      method: 'PUT',
                      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        customerName: editForm.customerName,
                        mobile: editForm.mobile,
                        loanType: editForm.loanType,
                        expectedAmount: editForm.expectedAmount,
                        status: editForm.status
                      })
                    });
                    if (res.ok) {
                      setLeads(leads.map(l => l.id === editingLead.id ? {...l, ...editForm} : l));
                      setEditingLead(null);
                    }
                  } catch (err) {
                    setError('Failed to update lead');
                  }
                }}
                className="flex-1 bg-green-600 text-white py-2 rounded-xl font-semibold hover:bg-green-700"
              >
                Save Changes
              </button>
              <button
                onClick={() => setEditingLead(null)}
                className="flex-1 bg-gray-500 text-white py-2 rounded-xl font-semibold hover:bg-gray-600"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setDeleteConfirm(null)}>
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-xl font-bold mb-2 text-red-600">Delete Lead?</h3>
            <p className="text-gray-600 mb-4">
              Are you sure you want to delete <strong>{deleteConfirm.customerName}</strong>? This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={async () => {
                  try {
                    const res = await fetch(`${API_BASE}/leads/${deleteConfirm.id}`, {
                      method: 'DELETE',
                      headers: { Authorization: `Bearer ${accessToken}` }
                    });
                    if (res.ok) {
                      setLeads(leads.filter(l => l.id !== deleteConfirm.id));
                      setDeleteConfirm(null);
                    }
                  } catch (err) {
                    setError('Failed to delete lead');
                  }
                }}
                className="flex-1 bg-red-600 text-white py-2 rounded-xl font-semibold hover:bg-red-700"
              >
                Delete
              </button>
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 bg-gray-500 text-white py-2 rounded-xl font-semibold hover:bg-gray-600"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View Lead Details Modal */}
      {viewLead && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={() => { setViewLead(null); setSanctionLetterUrl(null); }}>
          <div className="bg-white rounded-3xl p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-2xl font-bold text-gray-900">Lead Details</h3>
              <button onClick={() => { setViewLead(null); setSanctionLetterUrl(null); }} className="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
            </div>

            <div className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div className="bg-gray-50 rounded-xl p-4">
                  <p className="text-sm text-gray-500">Customer Name</p>
                  <p className="font-semibold text-lg">{viewLead.customerName}</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-4">
                  <p className="text-sm text-gray-500">Mobile</p>
                  <p className="font-semibold text-lg">{viewLead.mobile}</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-4">
                  <p className="text-sm text-gray-500">Loan Type</p>
                  <p className="font-semibold">{viewLead.loanType || 'N/A'}</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-4">
                  <p className="text-sm text-gray-500">Expected Amount</p>
                  <p className="font-semibold">₹{viewLead.expectedAmount?.toLocaleString() || 'N/A'}</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-4">
                  <p className="text-sm text-gray-500">Status</p>
                  <StatusBadge status={viewLead.status} />
                </div>
                <div className="bg-gray-50 rounded-xl p-4">
                  <p className="text-sm text-gray-500">Assigned To</p>
                  <p className="font-semibold">{viewLead.assignedTo || 'Unassigned'}</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-4">
                  <p className="text-sm text-gray-500">Assigned Banks</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {viewLead.assignedBanks && viewLead.assignedBanks.length > 0 ? (
                      viewLead.assignedBanks.map((bank, i) => (
                        <span key={i} className="bg-green-100 text-green-700 px-2 py-0.5 rounded-full text-xs font-medium">{bank}</span>
                      ))
                    ) : (
                      <span className="text-gray-400 text-sm">None</span>
                    )}
                  </div>
                </div>
                <div className="bg-gray-50 rounded-xl p-4">
                  <p className="text-sm text-gray-500">Priority</p>
                  <p className="font-semibold">{viewLead.priority || 'Medium'}</p>
                </div>
              </div>

              {viewLead.remarks && (
                <div className="bg-gray-50 rounded-xl p-4">
                  <p className="text-sm text-gray-500">Remarks</p>
                  <p className="font-medium">{viewLead.remarks}</p>
                </div>
              )}

              {/* Sanction Letter Section */}
              {viewLead.status === 'Sanctioned' && (
                <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                  <h4 className="font-semibold text-green-800 mb-2">Sanction Letter</h4>
                  {loadingLetter ? (
                    <p className="text-sm text-gray-500">Loading sanction letter...</p>
                  ) : sanctionLetterUrl ? (
                    <button
                      onClick={() => handleDownloadSanctionLetter(viewLead.id)}
                      className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-800 font-medium"
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      Download Sanction Letter
                    </button>
                  ) : (
                    <p className="text-sm text-gray-500">No sanction letter uploaded</p>
                  )}
                </div>
              )}
            </div>

            <div className="mt-6">
              <button
                onClick={() => { setViewLead(null); setSanctionLetterUrl(null); }}
                className="w-full bg-gray-200 text-gray-700 py-3 rounded-xl font-semibold hover:bg-gray-300"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}