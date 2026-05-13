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

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <Link to="/" className="text-2xl font-bold text-blue-700">InstaFin</Link>
            </div>
            <div className="flex items-center space-x-6">
              <Link to="/dashboard" className={location.pathname === '/dashboard' ? 'text-blue-700 font-semibold' : 'text-gray-600'}>Dashboard</Link>
              <Link to="/leads" className={location.pathname === '/leads' ? 'text-blue-700 font-semibold' : 'text-gray-600'}>Leads</Link>
              {user?.role === 'admin' && (
                <Link to="/add-lead" className={location.pathname === '/add-lead' ? 'text-blue-700 font-semibold' : 'text-gray-600'}>Add Lead</Link>
              )}
              <Link to="/eligibility" className={location.pathname === '/eligibility' ? 'text-blue-700 font-semibold' : 'text-gray-600'}>Eligibility</Link>
              <Link to="/documents" className={location.pathname === '/documents' ? 'text-blue-700 font-semibold' : 'text-gray-600'}>Documents</Link>
              <Link to="/checklists" className={location.pathname === '/checklists' ? 'text-blue-700 font-semibold' : 'text-gray-600'}>Checklists</Link>
              <Link to="/sanction" className={location.pathname === '/sanction' ? 'text-blue-700 font-semibold' : 'text-gray-600'}>Sanction</Link>
              <Link to="/features" className={location.pathname === '/features' ? 'text-blue-700 font-semibold' : 'text-gray-600'}>Features</Link>
              <Link to="/contact" className={location.pathname === '/contact' ? 'text-blue-700 font-semibold' : 'text-gray-600'}>Contact</Link>
              <div className="flex items-center space-x-3">
                <span className="text-gray-700">{user?.name}</span>
                <button onClick={() => { logout(); navigate('/login'); }} className="text-sm text-gray-500 hover:text-red-600">Logout</button>
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