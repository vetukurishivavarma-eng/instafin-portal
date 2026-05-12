import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import Layout from './components/Layout'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import LeadEntryPage from './pages/LeadEntryPage'
import PipelinePage from './pages/PipelinePage'
import EligibilityPage from './pages/EligibilityPage'
import DocumentsPage from './pages/DocumentsPage'
import ChecklistsPage from './pages/ChecklistsPage'
import SanctionPage from './pages/SanctionPage'
import FeaturesPage from './pages/FeaturesPage'
import ContactPage from './pages/ContactPage'
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
        <Route path="/" element={
          <ProtectedRoute>
            <DashboardPage />
          </ProtectedRoute>
        } />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/leads" element={<PipelinePage />} />
        <Route path="/eligibility" element={<EligibilityPage />} />
        <Route path="/documents" element={<DocumentsPage />} />
        <Route path="/checklists" element={<ChecklistsPage />} />
        <Route path="/sanction" element={<SanctionPage />} />
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
