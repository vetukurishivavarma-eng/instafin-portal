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
  const [executives, setExecutives] = useState([]);
  const [selectedExec, setSelectedExec] = useState('');
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [bankModal, setBankModal] = useState(null);
  const [selectedBank, setSelectedBank] = useState('');

  useEffect(() => {
    if (!accessToken) return;
    fetch(`${API_BASE}/leads/meta/executives`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    })
      .then(r => r.json())
      .then(data => setExecutives(data || []))
      .catch(() => {});
  }, [accessToken]);

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
      // Filter leads assigned to this executive
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

      // Update the lead in the local state
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

  return (
    <div className="py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Executive Management</h1>
        <p className="text-gray-500">Select an executive to view and manage their assigned leads</p>
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-2xl mb-6">{error}</div>
      )}
      {success && (
        <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded-2xl mb-6">{success}</div>
      )}

      {/* Executive Selector */}
      <div className="bg-white rounded-3xl shadow-xl p-6 mb-8">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Select Executive</h2>
        <select
          className="w-full border rounded-xl px-4 py-3"
          value={selectedExec}
          onChange={handleExecSelect}
        >
          <option value="">Choose an executive</option>
          {executives.map(ex => (
            <option key={ex.id} value={ex.name}>{ex.name} — {ex.department}</option>
          ))}
        </select>
      </div>

      {/* Leads Table */}
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
    </div>
  );
}
