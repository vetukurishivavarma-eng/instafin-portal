import React, { Suspense, lazy } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import Layout from './components/Layout'
import ImpersonationBanner from './components/ImpersonationBanner'
import ErrorBoundary from './components/ErrorBoundary'
import LandingPage from './pages/LandingPage'
import LoginPage from './pages/LoginPage'
import FeaturesPage from './pages/FeaturesPage'
import ContactPage from './pages/ContactPage'
import NotFoundPage from './pages/NotFoundPage'

// Code-split pages with React.lazy for faster initial load
const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const CustomerTrackingPage = lazy(() => import('./pages/CustomerTrackingPage'))
const DownloadFormsPage = lazy(() => import('./pages/DownloadFormsPage'))
const SanctionPage = lazy(() => import('./pages/SanctionPage'))
const DisbursementPage = lazy(() => import('./pages/DisbursementPage'))
const RevenuePage = lazy(() => import('./pages/RevenuePage'))
const ExecutivePage = lazy(() => import('./pages/ExecutivePage'))
const LeadEntryPage = lazy(() => import('./pages/LeadEntryPage'))
const CustomerListPage = lazy(() => import('./pages/CustomerListPage'))
const ChecklistsPage = lazy(() => import('./pages/ChecklistsPage'))
const EligibilityPage = lazy(() => import('./pages/EligibilityPage'))

import './index.css'

// Loading skeleton for lazy-loaded pages
function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center">
        <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-3"></div>
        <p className="text-sm text-gray-400">Loading...</p>
      </div>
    </div>
  );
}

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
            <Suspense fallback={<PageLoader />}><DashboardPage /></Suspense>
          </ProtectedRoute>
        } />
        <Route path="/admin/leads" element={
          <ProtectedRoute allowedRoles={['admin']}>
            <Suspense fallback={<PageLoader />}><LeadEntryPage /></Suspense>
          </ProtectedRoute>
        } />
        <Route path="/admin/customer-tracking" element={
          <ProtectedRoute allowedRoles={['admin']}>
            <Suspense fallback={<PageLoader />}><CustomerTrackingPage /></Suspense>
          </ProtectedRoute>
        } />
        <Route path="/admin/download-forms" element={
          <ProtectedRoute allowedRoles={['admin']}>
            <Suspense fallback={<PageLoader />}><DownloadFormsPage /></Suspense>
          </ProtectedRoute>
        } />
        <Route path="/admin/sanction" element={
          <ProtectedRoute allowedRoles={['admin']}>
            <Suspense fallback={<PageLoader />}><SanctionPage /></Suspense>
          </ProtectedRoute>
        } />
        <Route path="/admin/disburse" element={
          <ProtectedRoute allowedRoles={['admin']}>
            <Suspense fallback={<PageLoader />}><DisbursementPage /></Suspense>
          </ProtectedRoute>
        } />
        <Route path="/admin/revenue" element={
          <ProtectedRoute allowedRoles={['admin']}>
            <Suspense fallback={<PageLoader />}><RevenuePage /></Suspense>
          </ProtectedRoute>
        } />
        <Route path="/admin/executives" element={
          <ProtectedRoute allowedRoles={['admin']}>
            <Suspense fallback={<PageLoader />}><ExecutivePage /></Suspense>
          </ProtectedRoute>
        } />

        {/* Executive routes */}
        <Route path="/executive/leads" element={
          <ProtectedRoute allowedRoles={['executive']}>
            <Suspense fallback={<PageLoader />}><LeadEntryPage /></Suspense>
          </ProtectedRoute>
        } />

        <Route path="/executive/customers" element={
          <ProtectedRoute allowedRoles={['executive']}>
            <Suspense fallback={<PageLoader />}><CustomerListPage /></Suspense>
          </ProtectedRoute>
        } />
        <Route path="/executive/checklists" element={
          <ProtectedRoute allowedRoles={['executive']}>
            <Suspense fallback={<PageLoader />}><ChecklistsPage /></Suspense>
          </ProtectedRoute>
        } />
        <Route path="/executive/credit-query" element={
          <ProtectedRoute allowedRoles={['executive']}>
            <Suspense fallback={<PageLoader />}><EligibilityPage /></Suspense>
          </ProtectedRoute>
        } />
        <Route path="/executive/sanction" element={
          <ProtectedRoute allowedRoles={['executive']}>
            <Suspense fallback={<PageLoader />}><SanctionPage /></Suspense>
          </ProtectedRoute>
        } />
        <Route path="/executive/disburse" element={
          <ProtectedRoute allowedRoles={['executive']}>
            <Suspense fallback={<PageLoader />}><DisbursementPage /></Suspense>
          </ProtectedRoute>
        } />

        {/* Legacy compatibility - keep old paths working with role-based redirect */}
        <Route path="/eligibility" element={<RoleRedirect />} />
        <Route path="/checklists" element={<RoleRedirect />} />
        <Route path="/download-forms" element={<RoleRedirect />} />
        <Route path="/sanction" element={<RoleRedirect />} />
        <Route path="/disburse" element={<RoleRedirect />} />

        {/* 404 page */}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Layout>
    </>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>,
)
