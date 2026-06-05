import React, { useState, useEffect } from 'react';
import StatusBadge from '../components/StatusBadge';
import { useAuth } from '../contexts/AuthContext';
import API_BASE from '../config/api';

const STAGES = [
  { key: 'New', label: 'New Lead', color: 'bg-yellow-100 text-yellow-700 border-yellow-300' },
  { key: 'Assigned', label: 'Assigned', color: 'bg-orange-100 text-orange-700 border-orange-300' },
  { key: 'Processing', label: 'Processing', color: 'bg-blue-100 text-blue-700 border-blue-300' },
  { key: 'Sanctioned', label: 'Sanctioned', color: 'bg-green-100 text-green-700 border-green-300' },
  { key: 'Disbursed', label: 'Disbursed', color: 'bg-purple-100 text-purple-700 border-purple-300' },
  { key: 'Rejected', label: 'Rejected', color: 'bg-red-100 text-red-700 border-red-300' },
];

export default function CustomerTrackingPage() {
  const { accessToken, refreshAccessToken } = useAuth();
  const [leads, setLeads] = useState([]);
  const [filter, setFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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
      setLeads(data.data || data || []);
    } catch (err) {
      setError('Failed to load leads');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!accessToken) return;
    loadLeads();
  }, [accessToken]);

  const filteredLeads = leads.filter(lead => {
    if (filter !== 'all' && lead.status !== filter) return false;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      return (
        lead.customerName?.toLowerCase().includes(term) ||
        lead.mobile?.includes(term) ||
        lead.loanType?.toLowerCase().includes(term)
      );
    }
    return true;
  });

  // Group by stage
  const leadsByStage = {};
  STAGES.forEach(s => {
    leadsByStage[s.key] = filteredLeads.filter(l => l.status === s.key);
  });

  return (
    <div className="py-6 sm:py-12 px-3 sm:px-6">
      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Customer Tracking</h1>
        <p className="text-sm sm:text-base text-gray-500">Track all customer loan applications across stages</p>
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-2xl mb-6 text-sm">{error}</div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-2xl sm:rounded-3xl shadow-xl p-4 mb-6 sm:mb-8">
        <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 items-stretch sm:items-center">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setFilter('all')}
              className={`px-3 sm:px-4 py-1.5 rounded-full text-xs font-semibold transition-colors ${filter === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              All ({filteredLeads.length})
            </button>
            {STAGES.map(stage => (
              <button
                key={stage.key}
                onClick={() => setFilter(stage.key)}
                className={`px-3 sm:px-4 py-1.5 rounded-full text-xs font-semibold transition-colors ${filter === stage.key ? stage.color.split(' ').slice(0, 2).join(' ') : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
              >
                {stage.label} ({leads.filter(l => l.status === stage.key).length})
              </button>
            ))}
          </div>
          <input
            type="text"
            placeholder="Search customers..."
            className="border rounded-xl px-4 py-2 text-sm flex-1 min-w-0"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* Kanban Board */}
      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading customer data...</div>
      ) : filteredLeads.length === 0 ? (
        <div className="text-center py-12 text-gray-500 bg-white rounded-2xl sm:rounded-3xl shadow-xl">No customers found.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4">
          {STAGES.map(stage => (
            <div key={stage.key} className="bg-gray-50 rounded-2xl p-4 border border-gray-200">
              <div className={`text-xs font-bold px-3 py-1.5 rounded-full mb-4 inline-block border ${stage.color}`}>
                {stage.label}
              </div>
              <div className="space-y-3">
                {leadsByStage[stage.key].length === 0 ? (
                  <p className="text-gray-400 text-xs text-center py-4">No leads</p>
                ) : (
                  leadsByStage[stage.key].map(lead => (
                    <div key={lead.id} className="bg-white rounded-xl p-3 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
                      <h4 className="font-semibold text-gray-900 text-sm">{lead.customerName}</h4>
                      <p className="text-xs text-gray-500 mt-0.5">{lead.mobile}</p>
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">{lead.loanType}</span>
                        <span className="text-xs font-semibold text-gray-700">₹{(parseFloat(lead.expectedAmount) || 0).toLocaleString()}</span>
                      </div>
                      {lead.assignedTo && (
                        <p className="text-xs text-gray-400 mt-2 border-t pt-2">👤 {lead.assignedTo}</p>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
