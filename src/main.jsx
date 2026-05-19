import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import Layout from './components/Layout'
import LandingPage from './pages/LandingPage'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import LeadEntryPage from './pages/LeadEntryPage'
import PipelinePage from './pages/PipelinePage'
import EligibilityPage from './pages/EligibilityPage'
import ChecklistsPage from './pages/ChecklistsPage'
import SanctionPage from './pages/SanctionPage'
import DisbursementPage from './pages/DisbursementPage'
import FeaturesPage from './pages/FeaturesPage'
import ContactPage from './pages/ContactPage'
import ExecutivePage from './pages/ExecutivePage'
import './index.css'

// Protected Route wrapper
function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

function AppRoutes() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/dashboard" element={
          <ProtectedRoute>
            <DashboardPage />
          </ProtectedRoute>
        } />
        <Route path="/leads" element={
          <ProtectedRoute>
            <PipelinePage />
          </ProtectedRoute>
        } />
        <Route path="/eligibility" element={
          <ProtectedRoute>
            <EligibilityPage />
          </ProtectedRoute>
        } />
        <Route path="/checklists" element={
          <ProtectedRoute>
            <ChecklistsPage />
          </ProtectedRoute>
        } />
        <Route path="/sanction" element={
          <ProtectedRoute>
            <SanctionPage />
          </ProtectedRoute>
        } />
        <Route path="/disburse" element={
          <ProtectedRoute>
            <DisbursementPage />
          </ProtectedRoute>
        } />
        <Route path="/features" element={<FeaturesPage />} />
        <Route path="/contact" element={<ContactPage />} />
        <Route
          path="/add-lead"
          element={
            <ProtectedRoute>
              <LeadEntryPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/executive"
          element={
            <ProtectedRoute>
              <ExecutivePage />
            </ProtectedRoute>
          }
        />
      </Routes>
    </Layout>
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
