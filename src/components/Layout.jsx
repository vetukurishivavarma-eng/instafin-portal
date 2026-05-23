import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  if (location.pathname === '/login' || location.pathname === '/') {
    return <>{children}</>;
  }
  const getLinkClass = (path) => {
    const isActive = location.pathname === path;
    return `text-xs lg:text-sm font-medium transition-colors ${isActive ? 'text-blue-700 font-bold' : 'text-gray-600 hover:text-blue-700'}`;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between min-h-[4rem] py-3 md:py-0 gap-4 md:gap-0">
            <div className="flex items-center">
              <Link to="/" className="text-2xl font-bold text-blue-700">InstaFin</Link>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 lg:gap-x-6 gap-y-2">
              <Link to="/dashboard" className={getLinkClass('/dashboard')}>Dashboard</Link>
              <Link to="/leads" className={getLinkClass('/leads')}>Leads</Link>
              {user?.role === 'admin' && (
                <Link to="/executive" className={getLinkClass('/executive')}>Executive</Link>
              )}
              <Link to="/eligibility" className={getLinkClass('/eligibility')}>Eligibility</Link>
              <Link to="/checklists" className={getLinkClass('/checklists')}>Checklists</Link>
              <Link to="/download-forms" className={getLinkClass('/download-forms')}>Download Forms</Link>
              <Link to="/sanction" className={getLinkClass('/sanction')}>Sanction</Link>
              <Link to="/disburse" className={getLinkClass('/disburse')}>Disburse</Link>
              <Link to="/features" className={getLinkClass('/features')}>Features</Link>
              <Link to="/contact" className={getLinkClass('/contact')}>Contact</Link>
              <div className="flex items-center space-x-3 ml-2 border-l pl-3 border-gray-200">
                <span className="text-xs lg:text-sm font-semibold text-gray-700">{user?.name}</span>
                <button onClick={() => { logout(); navigate('/login'); }} className="text-xs lg:text-sm font-semibold text-gray-500 hover:text-red-600 transition-colors">Logout</button>
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