import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import './LandingPage.css';

export default function LandingPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [showSignup, setShowSignup] = useState(false);
  const [formData, setFormData] = useState({ name: '', email: '', password: '' });

  useEffect(() => {
    if (searchParams.get('action') === 'signup') {
      setShowSignup(true);
    }
  }, [searchParams]);

  const handleLogin = () => {
    navigate('/login');
  };

  const handleSignup = (e) => {
    e.preventDefault();
    alert('Signup functionality coming soon! Contact admin for access.');
    setShowSignup(false);
  };

  return (
    <div className="landing">
      <div className="floating-shapes">
        <div className="shape shape-1"></div>
        <div className="shape shape-2"></div>
        <div className="shape shape-3"></div>
        <div className="shape shape-4"></div>
        <div className="shape shape-5"></div>
        <div className="shape shape-6"></div>
      </div>

      <nav className="landing-nav">
        <div className="logo">
          <span className="logo-icon">IF</span>
          <span className="logo-text">InstaFin</span>
        </div>
        <div className="nav-actions">
          <button className="btn-login" onClick={handleLogin}>Login</button>
          <button className="btn-signup" onClick={() => setShowSignup(true)}>Sign Up</button>
        </div>
      </nav>

      <main className="landing-content">
        <div className="hero">
          <h1 className="title">
            <span className="title-line">Streamline Your</span>
            <span className="title-gradient">Loan Management</span>
          </h1>
          <p className="subtitle">
            The all-in-one portal for loan executives to manage leads,
            track documents, and close deals faster.
          </p>

          <div className="hero-features">
            <div className="feature-tag">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
              Lead Management
            </div>
            <div className="feature-tag">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
              </svg>
              Document Tracking
            </div>
            <div className="feature-tag">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="1" x2="12" y2="23"/>
                <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
              </svg>
              Sanction Processing
            </div>
          </div>

          <div className="cta-buttons">
            <button className="btn-primary" onClick={handleLogin}>
              <span>Get Started</span>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="5" y1="12" x2="19" y2="12"/>
                <polyline points="12 5 19 12 12 19"/>
              </svg>
            </button>
            <button className="btn-secondary" onClick={() => setShowSignup(true)}>
              Request Access
            </button>
          </div>
        </div>
      </main>

      {showSignup && (
        <div className="modal-overlay" onClick={() => setShowSignup(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowSignup(false)}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
            <h2>Request Access</h2>
            <p className="modal-subtitle">Fill in your details and we'll get back to you</p>
            <form onSubmit={handleSignup}>
              <div className="form-group">
                <label>Full Name</label>
                <input
                  type="text"
                  placeholder="Enter your name"
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  required
                />
              </div>
              <div className="form-group">
                <label>Email Address</label>
                <input
                  type="email"
                  placeholder="Enter your email"
                  value={formData.email}
                  onChange={(e) => setFormData({...formData, email: e.target.value})}
                  required
                />
              </div>
              <div className="form-group">
                <label>Password</label>
                <input
                  type="password"
                  placeholder="Create a password"
                  value={formData.password}
                  onChange={(e) => setFormData({...formData, password: e.target.value})}
                  required
                />
              </div>
              <button type="submit" className="btn-submit">Submit Request</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}