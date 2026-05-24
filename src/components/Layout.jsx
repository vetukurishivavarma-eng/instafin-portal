import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function Layout({ children }) {
  const { user, isAdmin, isExecutive, logout } = useAuth();
  const location = useLocation();

  // Public pages - no nav
  if (location.pathname === '/login' || location.pathname === '/' || location.pathname === '/features' || location.pathname === '/contact') {
    return <>{children}</>;
  }

  const getLinkClass = (path) => {
    const isActive = location.pathname === path;
    return `text-xs lg:text-sm font-medium transition-colors whitespace-nowrap ${isActive ? 'text-blue-700 font-bold' : 'text-gray-600 hover:text-blue-700'}`;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between min-h-[4rem] py-3 md:py-0 gap-4 md:gap-0">
            <div className="flex items-center">
              <Link to={isAdmin ? '/admin/dashboard' : isExecutive ? '/executive/leads' : '/'} className="text-2xl font-bold text-blue-700">InstaFin</Link>
              {user && (
                <span className="ml-3 px-2.5 py-0.5 bg-blue-100 text-blue-700 text-xs font-semibold rounded-full uppercase">
                  {user.role}
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-x-4 lg:gap-x-5 gap-y-2">
              {/* Admin Navigation */}
              {isAdmin && (
                <>
                  <Link to="/admin/dashboard" className={getLinkClass('/admin/dashboard')}>Dashboard</Link>
                  <Link to="/admin/leads" className={getLinkClass('/admin/leads')}>Leads</Link>
                  <Link to="/admin/customer-tracking" className={getLinkClass('/admin/customer-tracking')}>Customer Tracking</Link>
                  <Link to="/admin/download-forms" className={getLinkClass('/admin/download-forms')}>Download Forms</Link>
                  <Link to="/admin/sanction" className={getLinkClass('/admin/sanction')}>Sanction</Link>
                  <Link to="/admin/disburse" className={getLinkClass('/admin/disburse')}>Disburse</Link>
                  <Link to="/admin/revenue" className={getLinkClass('/admin/revenue')}>Revenue</Link>
                  <Link to="/admin/executives" className={getLinkClass('/admin/executives')}>Executives</Link>
                </>
              )}

              {/* Executive Navigation */}
              {isExecutive && (
                <>
                  <Link to="/executive/leads" className={getLinkClass('/executive/leads')}>Add Lead</Link>
                  <Link to="/executive/customers" className={getLinkClass('/executive/customers')}>Customers</Link>
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
        </div>
      </nav>
      <main className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  );
}