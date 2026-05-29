import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import Layout from './components/Layout'
import ImpersonationBanner from './components/ImpersonationBanner'
import LandingPage from './pages/LandingPage'
import LoginPage from './pages/LoginPage'
import FeaturesPage from './pages/FeaturesPage'
import ContactPage from './pages/ContactPage'

// Admin pages
import DashboardPage from './pages/DashboardPage'
import CustomerTrackingPage from './pages/CustomerTrackingPage'
import DownloadFormsPage from './pages/DownloadFormsPage'
import SanctionPage from './pages/SanctionPage'
import DisbursementPage from './pages/DisbursementPage'
import RevenuePage from './pages/RevenuePage'
import ExecutivePage from './pages/ExecutivePage'

// Executive pages
import LeadEntryPage from './pages/LeadEntryPage'
import CustomerListPage from './pages/CustomerListPage'
import ChecklistsPage from './pages/ChecklistsPage'
import EligibilityPage from './pages/EligibilityPage'

import './index.css'

// Protected Route wrapper
function ProtectedRoute({ children, allowedRoles }) {
  const { user, loading, effectiveRole } = useAuth();

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(effectiveRole) && !allowedRoles.includes(user.role)) {
    // Admin can access all routes (for impersonation preview)
    if (user.role === 'admin') return children;
    
    // Redirect to appropriate dashboard based on role
    if (user.role === 'admin') return <Navigate to="/admin/dashboard" replace />;
    if (user.role === 'executive') return <Navigate to="/executive/leads" replace />;
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}

// Role-based redirect component
function RoleRedirect() {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (user.role === 'admin') return <Navigate to="/admin/dashboard" replace />;
  if (user.role === 'executive') return <Navigate to="/executive/leads" replace />;
  return <Navigate to="/dashboard" replace />;
}

function AppRoutes() {
  const { isImpersonating } = useAuth();
  
  return (
    <>
      <ImpersonationBanner />
      <Layout>
        <Routes>
        {/* Public routes */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/features" element={<FeaturesPage />} />
        <Route path="/contact" element={<ContactPage />} />

        {/* Legacy routes - redirect based on role */}
        <Route path="/dashboard" element={<RoleRedirect />} />
        <Route path="/leads" element={<RoleRedirect />} />
        <Route path="/executive" element={<RoleRedirect />} />

        {/* Admin routes */}
        <Route path="/admin/dashboard" element={
          <ProtectedRoute allowedRoles={['admin']}>
            <DashboardPage />
          </ProtectedRoute>
        } />
        <Route path="/admin/leads" element={
          <ProtectedRoute allowedRoles={['admin']}>
            <LeadEntryPage />
          </ProtectedRoute>
        } />
        <Route path="/admin/customer-tracking" element={
          <ProtectedRoute allowedRoles={['admin']}>
            <CustomerTrackingPage />
          </ProtectedRoute>
        } />
        <Route path="/admin/download-forms" element={
          <ProtectedRoute allowedRoles={['admin']}>
            <DownloadFormsPage />
          </ProtectedRoute>
        } />
        <Route path="/admin/sanction" element={
          <ProtectedRoute allowedRoles={['admin']}>
            <SanctionPage />
          </ProtectedRoute>
        } />
        <Route path="/admin/disburse" element={
          <ProtectedRoute allowedRoles={['admin']}>
            <DisbursementPage />
          </ProtectedRoute>
        } />
        <Route path="/admin/revenue" element={
          <ProtectedRoute allowedRoles={['admin']}>
            <RevenuePage />
          </ProtectedRoute>
        } />
        <Route path="/admin/executives" element={
          <ProtectedRoute allowedRoles={['admin']}>
            <ExecutivePage />
          </ProtectedRoute>
        } />

        {/* Executive routes */}
        <Route path="/executive/leads" element={
          <ProtectedRoute allowedRoles={['executive']}>
            <LeadEntryPage />
          </ProtectedRoute>
        } />

        <Route path="/executive/customers" element={
          <ProtectedRoute allowedRoles={['executive']}>
            <CustomerListPage />
          </ProtectedRoute>
        } />
        <Route path="/executive/checklists" element={
          <ProtectedRoute allowedRoles={['executive']}>
            <ChecklistsPage />
          </ProtectedRoute>
        } />
        <Route path="/executive/credit-query" element={
          <ProtectedRoute allowedRoles={['executive']}>
            <EligibilityPage />
          </ProtectedRoute>
        } />
        <Route path="/executive/sanction" element={
          <ProtectedRoute allowedRoles={['executive']}>
            <SanctionPage />
          </ProtectedRoute>
        } />
        <Route path="/executive/disburse" element={
          <ProtectedRoute allowedRoles={['executive']}>
            <DisbursementPage />
          </ProtectedRoute>
        } />

        {/* Legacy compatibility - keep old paths working with role-based redirect */}
        <Route path="/eligibility" element={<RoleRedirect />} />
        <Route path="/checklists" element={<RoleRedirect />} />
        <Route path="/download-forms" element={<RoleRedirect />} />
        <Route path="/sanction" element={<RoleRedirect />} />
        <Route path="/disburse" element={<RoleRedirect />} />

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
    </>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
