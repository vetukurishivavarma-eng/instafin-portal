import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import StatusBadge from '../components/StatusBadge';
import { useAuth } from '../contexts/AuthContext';
import API_BASE from '../config/api';

export default function CustomerListPage() {
  const { user, accessToken, refreshAccessToken } = useAuth();
  const navigate = useNavigate();
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const loadLeads = async () => {
    if (!accessToken) return;
    try {
      const res = await fetch(`${API_BASE}/leads`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      if (res.status === 401) {
        const refreshed = await refreshAccessToken();
        if (!refreshed) return;
        return;
      }

      const data = await res.json();
      const allLeads = data.data || data || [];
      // Filter leads assigned to this executive
      const myLeads = allLeads.filter(l => l.assignedTo === user?.name);
      setLeads(myLeads);
    } catch (err) {
      console.error('Failed to load leads:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!accessToken || !user) return;
    loadLeads();
  }, [accessToken, user]);

  const filteredLeads = leads.filter(lead => {
    const matchesSearch = !searchTerm ||
      lead.customerName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lead.mobile?.includes(searchTerm);
    const matchesStatus = !statusFilter || lead.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">My Customers</h1>
        <p className="text-gray-500">View and manage customers assigned to you</p>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-3xl shadow-xl p-4 mb-8">
        <div className="flex flex-wrap gap-4 items-center">
          <input
            type="text"
            placeholder="Search by name or mobile..."
            className="border rounded-xl px-4 py-2 text-sm flex-1 min-w-[200px]"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <select
            className="border rounded-xl px-4 py-2 text-sm"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All Status</option>
            <option value="New">New</option>
            <option value="Processing">Processing</option>
            <option value="Sanctioned">Sanctioned</option>
            <option value="Partially Disbursed">Partially Disbursed</option>
            <option value="Disbursed">Disbursed</option>
            <option value="Rejected">Rejected</option>
          </select>
          <button
            onClick={() => navigate('/executive/leads')}
            className="ml-auto bg-blue-600 text-white px-5 py-2 rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors"
          >
            + Add New Lead
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading customers...</div>
      ) : filteredLeads.length === 0 ? (
        <div className="bg-white rounded-3xl shadow-xl p-12 text-center">
          <div className="text-6xl mb-4">📋</div>
          <h3 className="text-xl font-bold text-gray-800 mb-2">No Customers Yet</h3>
          <p className="text-gray-500 mb-6">
            {leads.length === 0
              ? "You haven't been assigned any customers yet."
              : 'No customers match your search.'}
          </p>
          {leads.length === 0 && (
            <button
              onClick={() => navigate('/executive/leads')}
              className="bg-blue-600 text-white px-6 py-3 rounded-xl font-semibold hover:bg-blue-700 transition-colors"
            >
              Add Your First Lead
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {filteredLeads.map(lead => (
            <div key={lead.id} className="bg-white rounded-3xl shadow-xl p-6 hover:shadow-lg transition-shadow">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex-1 min-w-[200px]">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-xl font-bold text-gray-900">{lead.customerName}</h3>
                    <StatusBadge status={lead.status} />
                  </div>
                  <div className="flex flex-wrap gap-4 text-sm text-gray-600">
                    <span>📞 {lead.mobile}</span>
                    <span>💼 {lead.loanType || 'N/A'}</span>
                    <span>💰 ₹{(parseFloat(lead.expectedAmount) || 0).toLocaleString()}</span>
                  </div>
                  {lead.assignedBanks && lead.assignedBanks.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {lead.assignedBanks.map((bank, i) => (
                        <span key={i} className="bg-green-100 text-green-700 px-2 py-0.5 rounded-full text-xs font-medium">{bank}</span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => navigate(`/executive/checklists?leadId=${lead.id}`)}
                    className="px-4 py-2 bg-indigo-100 text-indigo-700 rounded-xl text-sm font-semibold hover:bg-indigo-200 transition-colors"
                  >
                    Checklists
                  </button>
                  <button
                    onClick={() => navigate(`/executive/credit-query?leadId=${lead.id}`)}
                    className="px-4 py-2 bg-blue-100 text-blue-700 rounded-xl text-sm font-semibold hover:bg-blue-200 transition-colors"
                  >
                    Credit Query
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
