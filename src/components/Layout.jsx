import React, { useState, useEffect, useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import API_BASE from '../config/api';

export default function Layout({ children }) {
  const { user, effectiveRole, logout, accessToken } = useAuth();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);

  // Delete request approval state
  const [showDeleteRequests, setShowDeleteRequests] = useState(false);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [approvingId, setApprovingId] = useState(null);
  const [confirmApproveId, setConfirmApproveId] = useState(null);
  const [actionError, setActionError] = useState('');

  const fetchPendingCount = useCallback(async () => {
    if (effectiveRole !== 'admin' || !accessToken) return;
    try {
      const res = await fetch(`${API_BASE}/delete-requests/count`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        setPendingCount(data.count || 0);
      }
    } catch (err) {
      // Silent fail
    }
  }, [effectiveRole, accessToken]);

  const fetchRequests = useCallback(async () => {
    if (effectiveRole !== 'admin' || !accessToken) return;
    setRequestsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/delete-requests`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        setPendingRequests(data.data || []);
      }
    } catch (err) {
      setActionError('Failed to load requests');
    } finally {
      setRequestsLoading(false);
    }
  }, [effectiveRole, accessToken]);

  // Fetch pending count on mount and periodically
  useEffect(() => {
    fetchPendingCount();
    const interval = setInterval(fetchPendingCount, 15000); // every 15 seconds
    return () => clearInterval(interval);
  }, [fetchPendingCount]);

  // Fetch full list when popup opens
  useEffect(() => {
    if (showDeleteRequests) {
      fetchRequests();
      setActionError('');
      setConfirmApproveId(null);
    }
  }, [showDeleteRequests, fetchRequests]);

  const handleApprove = async (requestId) => {
    setApprovingId(requestId);
    setActionError('');
    try {
      const res = await fetch(`${API_BASE}/delete-requests/${requestId}/approve`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
      });
      if (res.ok) {
        setPendingRequests(prev => prev.filter(r => r.id !== requestId));
        setPendingCount(prev => Math.max(0, prev - 1));
        setConfirmApproveId(null);
      } else {
        const err = await res.json();
        setActionError(err.error || 'Failed to approve');
      }
    } catch (err) {
      setActionError('Failed to approve request');
    } finally {
      setApprovingId(null);
    }
  };

  const handleReject = async (requestId) => {
    setApprovingId(requestId);
    setActionError('');
    try {
      const res = await fetch(`${API_BASE}/delete-requests/${requestId}/reject`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Rejected by admin' })
      });
      if (res.ok) {
        setPendingRequests(prev => prev.filter(r => r.id !== requestId));
        setPendingCount(prev => Math.max(0, prev - 1));
      } else {
        const err = await res.json();
        setActionError(err.error || 'Failed to reject');
      }
    } catch (err) {
      setActionError('Failed to reject request');
    } finally {
      setApprovingId(null);
    }
  };

  // Public pages - no nav
  if (location.pathname === '/login' || location.pathname === '/' || location.pathname === '/features' || location.pathname === '/contact') {
    return <>{children}</>;
  }

  const getLinkClass = (path) => {
    const isActive = location.pathname === path;
    return `text-xs lg:text-sm font-medium transition-colors whitespace-nowrap ${isActive ? 'text-blue-700 font-bold' : 'text-gray-600 hover:text-blue-700'}`;
  };

  const getMobileLinkClass = (path) => {
    const isActive = location.pathname === path;
    return `block px-3 py-2 rounded-lg text-sm font-medium transition-colors ${isActive ? 'text-blue-700 font-bold bg-blue-50' : 'text-gray-600 hover:text-blue-700 hover:bg-gray-50'}`;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between min-h-[4rem] py-3">
            <div className="flex items-center">
              <Link to={effectiveRole === 'admin' ? '/admin/dashboard' : effectiveRole === 'executive' ? '/executive/dashboard' : '/'} className="text-2xl font-bold text-blue-700">InstaFin</Link>
              {user && (
                <span className="ml-3 px-2.5 py-0.5 bg-blue-100 text-blue-700 text-xs font-semibold rounded-full uppercase">
                  {user.role}
                </span>
              )}
            </div>
            
            {/* Mobile menu button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
              aria-label="Toggle navigation menu"
            >
              {mobileMenuOpen ? (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              ) : (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                  <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
                </svg>
              )}
            </button>

            {/* Desktop navigation */}
            <div className="hidden md:flex md:items-center gap-x-4 lg:gap-x-5">
              {/* Admin Navigation */}
              {effectiveRole === 'admin' && (
                <>
                  <Link to="/admin/dashboard" className={getLinkClass('/admin/dashboard')}>Dashboard</Link>
                  <Link to="/admin/leads" className={getLinkClass('/admin/leads')}>Leads</Link>
                  <Link to="/admin/customer-login" className={getLinkClass('/admin/customer-login')}>Customer Login</Link>
                  <Link to="/admin/credit-query" className={getLinkClass('/admin/credit-query')}>Processing &amp; Query</Link>
                  <Link to="/admin/sanction" className={getLinkClass('/admin/sanction')}>Sanction</Link>
                  <Link to="/admin/disburse" className={getLinkClass('/admin/disburse')}>Disburse</Link>
                  <Link to="/admin/revenue" className={getLinkClass('/admin/revenue')}>Revenue</Link>
                  <Link to="/admin/executives" className={getLinkClass('/admin/executives')}>Executives</Link>
                  <Link to="/admin/download-forms" className={getLinkClass('/admin/download-forms')}>Download Forms</Link>
                  <Link to="/admin/audit-log" className={getLinkClass('/admin/audit-log')}>Audit Log</Link>
                </>
              )}

              {/* Executive Navigation */}
              {effectiveRole === 'executive' && (
                <>
                  <Link to="/executive/dashboard" className={getLinkClass('/executive/dashboard')}>Dashboard</Link>
                  <Link to="/executive/leads" className={getLinkClass('/executive/leads')}>Leads</Link>
                  <Link to="/executive/customer-login" className={getLinkClass('/executive/customer-login')}>Customer Login</Link>
                  <Link to="/executive/checklists" className={getLinkClass('/executive/checklists')}>Checklist & Upload</Link>
                  <Link to="/executive/credit-query" className={getLinkClass('/executive/credit-query')}>Processing &amp; Query</Link>
                  <Link to="/executive/sanction" className={getLinkClass('/executive/sanction')}>Sanction</Link>
                  <Link to="/executive/disburse" className={getLinkClass('/executive/disburse')}>Disburse</Link>
                </>
              )}

              <div className="flex items-center space-x-3 ml-2 border-l pl-3 border-gray-200">
                {/* Bell icon for admin - delete request notifications */}
                {effectiveRole === 'admin' && (
                  <div className="relative">
                    <button
                      onClick={() => setShowDeleteRequests(true)}
                      className="relative p-1.5 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                      title="Pending Delete Requests — requires admin approval"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                      </svg>
                      {pendingCount > 0 && (
                        <span className="absolute -top-1 -right-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold leading-none text-white bg-red-500 rounded-full border-2 border-white">
                          {pendingCount > 9 ? '9+' : pendingCount}
                        </span>
                      )}
                    </button>
                  </div>
                )}
                <span className="text-xs lg:text-sm font-semibold text-gray-700">{user?.name}</span>
                <button onClick={logout} className="text-xs lg:text-sm font-semibold text-gray-500 hover:text-red-600 transition-colors">Logout</button>
              </div>
            </div>
          </div>

          {/* Mobile navigation dropdown */}
          {mobileMenuOpen && (
            <div className="md:hidden border-t border-gray-200 py-3 space-y-1">
              {/* Admin Navigation */}
              {effectiveRole === 'admin' && (
                <>
                  <Link to="/admin/dashboard" className={getMobileLinkClass('/admin/dashboard')} onClick={() => setMobileMenuOpen(false)}>Dashboard</Link>
                  <Link to="/admin/leads" className={getMobileLinkClass('/admin/leads')} onClick={() => setMobileMenuOpen(false)}>Leads</Link>
                  <Link to="/admin/customer-login" className={getMobileLinkClass('/admin/customer-login')} onClick={() => setMobileMenuOpen(false)}>Customer Login</Link>
                  <Link to="/admin/credit-query" className={getMobileLinkClass('/admin/credit-query')} onClick={() => setMobileMenuOpen(false)}>Processing &amp; Query</Link>
                  <Link to="/admin/sanction" className={getMobileLinkClass('/admin/sanction')} onClick={() => setMobileMenuOpen(false)}>Sanction</Link>
                  <Link to="/admin/disburse" className={getMobileLinkClass('/admin/disburse')} onClick={() => setMobileMenuOpen(false)}>Disburse</Link>
                  <Link to="/admin/revenue" className={getMobileLinkClass('/admin/revenue')} onClick={() => setMobileMenuOpen(false)}>Revenue</Link>
                  <Link to="/admin/executives" className={getMobileLinkClass('/admin/executives')} onClick={() => setMobileMenuOpen(false)}>Executives</Link>
                  <Link to="/admin/download-forms" className={getMobileLinkClass('/admin/download-forms')} onClick={() => setMobileMenuOpen(false)}>Download Forms</Link>
                  <Link to="/admin/audit-log" className={getMobileLinkClass('/admin/audit-log')} onClick={() => setMobileMenuOpen(false)}>Audit Log</Link>
                </>
              )}

              {/* Executive Navigation */}
              {effectiveRole === 'executive' && (
                <>
                  <Link to="/executive/dashboard" className={getMobileLinkClass('/executive/dashboard')} onClick={() => setMobileMenuOpen(false)}>Dashboard</Link>
                  <Link to="/executive/leads" className={getMobileLinkClass('/executive/leads')} onClick={() => setMobileMenuOpen(false)}>Leads</Link>
                  <Link to="/executive/customer-login" className={getMobileLinkClass('/executive/customer-login')} onClick={() => setMobileMenuOpen(false)}>Customer Login</Link>
                  <Link to="/executive/checklists" className={getMobileLinkClass('/executive/checklists')} onClick={() => setMobileMenuOpen(false)}>Checklist & Upload</Link>
                  <Link to="/executive/credit-query" className={getMobileLinkClass('/executive/credit-query')} onClick={() => setMobileMenuOpen(false)}>Processing &amp; Query</Link>
                  <Link to="/executive/sanction" className={getMobileLinkClass('/executive/sanction')} onClick={() => setMobileMenuOpen(false)}>Sanction</Link>
                  <Link to="/executive/disburse" className={getMobileLinkClass('/executive/disburse')} onClick={() => setMobileMenuOpen(false)}>Disburse</Link>
                </>
              )}

              <div className="border-t border-gray-200 pt-3 mt-2 px-3 flex items-center justify-between">
                {effectiveRole === 'admin' && (
                  <button
                    onClick={() => { setShowDeleteRequests(true); setMobileMenuOpen(false); }}
                    className="relative text-sm font-semibold text-gray-700 hover:text-blue-700 transition-colors flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                    </svg>
                    Delete Requests
                    {pendingCount > 0 && (
                      <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold text-white bg-red-500 rounded-full">
                        {pendingCount}
                      </span>
                    )}
                  </button>
                )}
                <span className="text-sm font-semibold text-gray-700">{user?.name}</span>
                <button onClick={logout} className="text-sm font-semibold text-red-500 hover:text-red-700 transition-colors">Logout</button>
              </div>
            </div>
          )}
        </div>
      </nav>

      {/* Delete Requests Approval Popup */}
      {showDeleteRequests && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md overflow-y-auto flex justify-center items-start z-[100] p-4 animate-fade-in">
          <div
            className="bg-white rounded-3xl p-6 sm:p-8 max-w-2xl w-full relative shadow-2xl animate-slide-up border border-gray-150 my-8"
            style={{ maxHeight: '85vh', overflowY: 'auto' }}
          >
            <button
              onClick={() => setShowDeleteRequests(false)}
              className="absolute top-4 right-4 p-2 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>

            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center">
                <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </div>
              <div>
                <h2 className="text-xl font-extrabold text-gray-900">Delete Requests</h2>
                <p className="text-sm text-gray-500 font-medium">
                  {pendingCount > 0
                    ? `${pendingCount} pending request${pendingCount > 1 ? 's' : ''} awaiting your review`
                    : 'No pending delete requests'}
                </p>
              </div>
            </div>

            {actionError && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-2xl mt-4 text-sm">
                {actionError}
              </div>
            )}

            <div className="mt-5 space-y-3">
              {requestsLoading ? (
                <div className="text-center py-8 text-gray-400 font-semibold animate-pulse">Loading requests...</div>
              ) : pendingRequests.length === 0 ? (
                <div className="text-center py-8 text-gray-400 font-semibold border-2 border-dashed border-gray-200 rounded-2xl">
                  All clear — no delete requests pending
                </div>
              ) : (
                pendingRequests.map(req => (
                  <div key={req.id} className="border border-gray-200 rounded-2xl p-4 hover:bg-gray-50/50 transition-colors">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-gray-900 text-sm">{req.customer_name}</span>
                          <span className="text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-bold uppercase">Delete</span>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">
                          Requested by <span className="font-semibold text-gray-700">{req.requested_by_name}</span>
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {new Date(req.created_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </p>
                        {req.reason && (
                          <div className="mt-2 bg-gray-50 rounded-xl px-3 py-2 border border-gray-100">
                            <p className="text-xs font-semibold text-gray-600">Reason:</p>
                            <p className="text-xs text-gray-700 mt-0.5">{req.reason}</p>
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col gap-1.5 shrink-0">
                        {confirmApproveId === req.id ? (
                          <>
                            <button
                              onClick={() => handleApprove(req.id)}
                              disabled={approvingId === req.id}
                              className="px-4 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-lg transition-colors disabled:opacity-50"
                            >
                              {approvingId === req.id ? 'Approving...' : 'Yes, Delete'}
                            </button>
                            <button
                              onClick={() => setConfirmApproveId(null)}
                              disabled={approvingId === req.id}
                              className="px-4 py-1.5 bg-gray-200 hover:bg-gray-300 text-gray-700 text-xs font-bold rounded-lg transition-colors disabled:opacity-50"
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => setConfirmApproveId(req.id)}
                              disabled={approvingId !== null}
                              className="px-4 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-lg transition-colors disabled:opacity-50"
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => handleReject(req.id)}
                              disabled={approvingId !== null}
                              className="px-4 py-1.5 bg-gray-200 hover:bg-gray-300 text-gray-700 text-xs font-bold rounded-lg transition-colors disabled:opacity-50"
                            >
                              Reject
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                    {confirmApproveId === req.id && (
                      <div className="mt-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                        <p className="text-xs font-bold text-red-700">⚠️ Confirm Deletion</p>
                        <p className="text-xs text-red-600 mt-0.5">
                          This will permanently delete "{req.customer_name}" and all associated records (bank data, status history, documents). This action cannot be undone.
                        </p>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            <button
              onClick={() => setShowDeleteRequests(false)}
              className="w-full mt-5 py-3 rounded-2xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold transition-all text-sm"
            >
              Close
            </button>
          </div>
        </div>
      )}

      <main className="max-w-7xl mx-auto py-4 sm:py-6 px-3 sm:px-6 lg:px-8 app-content">
        {children}
      </main>
    </div>
  );
}
