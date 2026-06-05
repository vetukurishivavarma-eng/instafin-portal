import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function Layout({ children }) {
  const { user, effectiveRole, logout } = useAuth();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);

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
                  <Link to="/admin/credit-query" className={getLinkClass('/admin/credit-query')}>Credit Query</Link>
                  <Link to="/admin/sanction" className={getLinkClass('/admin/sanction')}>Sanction</Link>
                  <Link to="/admin/disburse" className={getLinkClass('/admin/disburse')}>Disburse</Link>
                  <Link to="/admin/revenue" className={getLinkClass('/admin/revenue')}>Revenue</Link>
                  <Link to="/admin/executives" className={getLinkClass('/admin/executives')}>Executives</Link>
                  <Link to="/admin/download-forms" className={getLinkClass('/admin/download-forms')}>Download Forms</Link>
                </>
              )}

              {/* Executive Navigation */}
              {effectiveRole === 'executive' && (
                <>
                  <Link to="/executive/dashboard" className={getLinkClass('/executive/dashboard')}>Dashboard</Link>
                  <Link to="/executive/leads" className={getLinkClass('/executive/leads')}>Leads</Link>
                  <Link to="/executive/customer-login" className={getLinkClass('/executive/customer-login')}>Customer Login</Link>
                  <Link to="/executive/checklists" className={getLinkClass('/executive/checklists')}>Checklist & Upload</Link>
                  <Link to="/executive/credit-query" className={getLinkClass('/executive/credit-query')}>Credit Query</Link>
                  <Link to="/executive/sanction" className={getLinkClass('/executive/sanction')}>Sanction</Link>
                  <Link to="/executive/disburse" className={getLinkClass('/executive/disburse')}>Disburse</Link>
                </>
              )}

              <div className="flex items-center space-x-3 ml-2 border-l pl-3 border-gray-200">
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
                  <Link to="/admin/credit-query" className={getMobileLinkClass('/admin/credit-query')} onClick={() => setMobileMenuOpen(false)}>Credit Query</Link>
                  <Link to="/admin/sanction" className={getMobileLinkClass('/admin/sanction')} onClick={() => setMobileMenuOpen(false)}>Sanction</Link>
                  <Link to="/admin/disburse" className={getMobileLinkClass('/admin/disburse')} onClick={() => setMobileMenuOpen(false)}>Disburse</Link>
                  <Link to="/admin/revenue" className={getMobileLinkClass('/admin/revenue')} onClick={() => setMobileMenuOpen(false)}>Revenue</Link>
                  <Link to="/admin/executives" className={getMobileLinkClass('/admin/executives')} onClick={() => setMobileMenuOpen(false)}>Executives</Link>
                  <Link to="/admin/download-forms" className={getMobileLinkClass('/admin/download-forms')} onClick={() => setMobileMenuOpen(false)}>Download Forms</Link>
                </>
              )}

              {/* Executive Navigation */}
              {effectiveRole === 'executive' && (
                <>
                  <Link to="/executive/dashboard" className={getMobileLinkClass('/executive/dashboard')} onClick={() => setMobileMenuOpen(false)}>Dashboard</Link>
                  <Link to="/executive/leads" className={getMobileLinkClass('/executive/leads')} onClick={() => setMobileMenuOpen(false)}>Leads</Link>
                  <Link to="/executive/customer-login" className={getMobileLinkClass('/executive/customer-login')} onClick={() => setMobileMenuOpen(false)}>Customer Login</Link>
                  <Link to="/executive/checklists" className={getMobileLinkClass('/executive/checklists')} onClick={() => setMobileMenuOpen(false)}>Checklist & Upload</Link>
                  <Link to="/executive/credit-query" className={getMobileLinkClass('/executive/credit-query')} onClick={() => setMobileMenuOpen(false)}>Credit Query</Link>
                  <Link to="/executive/sanction" className={getMobileLinkClass('/executive/sanction')} onClick={() => setMobileMenuOpen(false)}>Sanction</Link>
                  <Link to="/executive/disburse" className={getMobileLinkClass('/executive/disburse')} onClick={() => setMobileMenuOpen(false)}>Disburse</Link>
                </>
              )}

              <div className="border-t border-gray-200 pt-3 mt-2 px-3 flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-700">{user?.name}</span>
                <button onClick={logout} className="text-sm font-semibold text-red-500 hover:text-red-700 transition-colors">Logout</button>
              </div>
            </div>
          )}
        </div>
      </nav>
      <main className="max-w-7xl mx-auto py-4 sm:py-6 px-3 sm:px-6 lg:px-8 app-content">
        {children}
      </main>
    </div>
  );
}