import React, { useState, useEffect, useRef } from 'react';
import StatusBadge from '../components/StatusBadge';
import { useAuth } from '../contexts/AuthContext';

const API_BASE = 'http://localhost:3001/api';

export default function PipelinePage() {
  const { accessToken, refreshAccessToken } = useAuth();
  const [leads, setLeads] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
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
              <option value="Processing">Processing</option>
              <option value="Sanctioned">Sanctioned</option>
              <option value="Disbursed">Disbursed</option>
            </select>
          </div>
        </div>
        {loading ? (
          <div className="text-center py-12">Loading...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-gray-50">
                <tr><th className="p-4">Customer</th><th className="p-4">Loan</th><th className="p-4">Amount</th><th className="p-4">Bank</th><th className="p-4">Executive</th><th className="p-4">Status</th></tr>
              </thead>
              <tbody>
                {filteredLeads.map(lead => (
                  <tr key={lead.id} className="border-t hover:bg-gray-50">
                    <td className="p-4 font-medium">{lead.customerName}</td>
                    <td className="p-4">{lead.loanType}</td>
                    <td className="p-4">{lead.expectedAmount}</td>
                    <td className="p-4 text-blue-700">{lead.assignedBanks?.[0] || '-'}</td>
                    <td className="p-4">{lead.assignedTo || '-'}</td>
                    <td className="p-4"><StatusBadge status={lead.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}