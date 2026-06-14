import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import API_BASE from '../config/api';

const ACTION_STYLES = {
  created: 'bg-green-100 text-green-700 border-green-200',
  modified: 'bg-blue-100 text-blue-700 border-blue-200',
  deleted: 'bg-red-100 text-red-700 border-red-200',
  restored: 'bg-teal-100 text-teal-700 border-teal-200',
  marked_inactive: 'bg-orange-100 text-orange-700 border-orange-200',
};

const ACTION_LABELS = {
  created: 'Lead Created',
  modified: 'Lead Modified',
  deleted: 'Lead Deleted',
  restored: 'Lead Restored',
  marked_inactive: 'Marked Inactive',
};

export default function AuditLogPage() {
  const { accessToken, effectiveRole } = useAuth();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [actionFilter, setActionFilter] = useState('');

  useEffect(() => {
    if (!accessToken) return;
    fetchLogs();
  }, [accessToken]);

  const fetchLogs = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/audit-logs`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        setLogs(Array.isArray(data) ? data : []);
      } else {
        const err = await res.json();
        setError(err.error || 'Failed to fetch audit logs');
      }
    } catch (err) {
      setError('Failed to fetch audit logs. The audit_logs table may not exist yet.');
    } finally {
      setLoading(false);
    }
  };

  const getActionStyle = (action) => {
    return ACTION_STYLES[action] || 'bg-gray-100 text-gray-700 border-gray-200';
  };

  const getActionLabel = (action) => {
    return ACTION_LABELS[action] || action;
  };

  const filteredLogs = logs.filter(log => {
    const matchesSearch = !searchTerm ||
      (log.leads?.customer_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (log.admin_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (log.details || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesAction = !actionFilter || log.action === actionFilter;
    return matchesSearch && matchesAction;
  });

  if (effectiveRole !== 'admin') {
    return (
      <div className="py-12 text-center">
        <p className="text-gray-500 font-semibold">Only admins can view audit logs.</p>
      </div>
    );
  }

  return (
    <div className="py-6 sm:py-12 px-3 sm:px-6 min-h-screen bg-gradient-mesh">
      <div className="max-w-6xl mx-auto animate-fade-in-up">
        {/* Header */}
        <div className="mb-6 sm:mb-8">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center">
              <svg className="w-5 h-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl sm:text-4xl font-extrabold text-gray-900 tracking-tight">Audit Log</h1>
              <p className="text-xs sm:text-base text-gray-500 font-medium mt-1">
                Full lead activity history — who added, modified, deleted, or changed status of leads.
              </p>
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 sm:px-6 py-3 sm:py-4 rounded-2xl sm:rounded-3xl mb-6 shadow-sm animate-fade-in-up text-sm">
            {error}
          </div>
        )}

        {/* Filters */}
        <div className="bg-white rounded-2xl sm:rounded-3xl border border-gray-200 p-4 sm:p-6 mb-6 shadow-sm">
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 items-start sm:items-center">
            <div className="flex-1 w-full sm:w-auto">
              <input
                type="text"
                placeholder="Search by lead name, admin name, or details..."
                className="border border-gray-200 rounded-2xl px-4 sm:px-5 py-2.5 sm:py-3 text-sm bg-gray-50/50 focus:ring-2 focus:ring-indigo-200 focus:outline-none transition-all shadow-sm w-full"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className="border border-gray-200 rounded-2xl px-4 sm:px-5 py-2.5 sm:py-3 text-sm bg-gray-50/50 focus:ring-2 focus:ring-indigo-200 focus:outline-none transition-all shadow-sm font-bold w-full sm:w-auto"
            >
              <option value="">All Actions</option>
              <option value="created">Lead Created</option>
              <option value="modified">Lead Modified</option>
              <option value="deleted">Lead Deleted</option>
              <option value="restored">Lead Restored</option>
              <option value="marked_inactive">Marked Inactive</option>
            </select>
            <button
              onClick={fetchLogs}
              className="px-4 sm:px-5 py-2.5 sm:py-3 rounded-2xl font-bold bg-indigo-600 text-white hover:bg-indigo-700 transition-all shadow-md shadow-indigo-500/10 whitespace-nowrap text-sm"
            >
              <svg className="w-4 h-4 inline mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh
            </button>
          </div>
        </div>

        {/* Logs List */}
        {loading ? (
          <div className="text-center py-16 font-bold text-gray-400 text-lg animate-pulse">Loading audit logs...</div>
        ) : filteredLogs.length === 0 ? (
          <div className="bg-white rounded-3xl border border-gray-150 p-16 text-center text-gray-400 font-bold shadow-sm text-lg">
            {logs.length === 0
              ? 'No audit logs found yet. Activity will appear here as admins perform actions on leads.'
              : 'No logs match your current filters.'}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredLogs.map((log) => (
              <div
                key={log.id}
                className="bg-white rounded-2xl sm:rounded-3xl border border-gray-200 p-4 sm:p-6 hover:border-gray-300 transition-all shadow-sm hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    {/* Lead name + badge */}
                    <div className="flex items-center gap-2 flex-wrap mb-1.5">
                      <span className="font-bold text-gray-900 text-sm sm:text-base">
                        {log.leads?.customer_name || 'Unknown Lead'}
                      </span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${getActionStyle(log.action)}`}>
                        {getActionLabel(log.action)}
                      </span>
                    </div>

                    {/* Admin who performed action */}
                    <div className="flex items-center gap-1.5 text-xs sm:text-sm text-gray-600">
                      <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                      <span className="font-semibold text-gray-700">{log.admin_name}</span>
                      {log.leads?.mobile && (
                        <>
                          <span className="text-gray-300">•</span>
                          <span className="text-gray-500">{log.leads.mobile}</span>
                        </>
                      )}
                    </div>

                    {/* Details */}
                    {log.details && (
                      <p className="text-xs sm:text-sm text-gray-500 mt-1.5 leading-relaxed bg-gray-50 rounded-xl px-3 py-2 border border-gray-100">
                        {log.details}
                      </p>
                    )}
                  </div>

                  {/* Timestamp */}
                  <div className="shrink-0 text-right">
                    <p className="text-[10px] sm:text-xs text-gray-400 font-medium whitespace-nowrap">
                      {new Date(log.created_at).toLocaleString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && logs.length > 0 && (
          <p className="text-center text-xs text-gray-400 mt-6 font-medium">
            Showing {filteredLogs.length} of {logs.length} total audit log entries
          </p>
        )}
      </div>
    </div>
  );
}
