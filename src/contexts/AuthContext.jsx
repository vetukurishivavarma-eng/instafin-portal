import React, { createContext, useContext, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import API_BASE from '../config/api';
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [accessToken, setAccessToken] = useState(null);
  const [impersonating, setImpersonating] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const savedUser = localStorage.getItem('instafin_user');
    const savedToken = localStorage.getItem('instafin_token');
    const savedImpersonating = localStorage.getItem('instafin_impersonating');
    // Only restore session if both user meta and a token exist.
    // Without a persisted access token, require re-login on page reload.
    if (savedUser && savedToken) {
      setUser(JSON.parse(savedUser));
      setAccessToken(savedToken);
    }
    if (savedImpersonating) {
      try {
        setImpersonating(JSON.parse(savedImpersonating));
      } catch (e) {
        setImpersonating(null);
      }
    }
    setLoading(false);
  }, []);

  const login = async (email, password) => {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Login failed');
    }
    const data = await res.json();
    setUser(data.user);
    setAccessToken(data.accessToken);
    localStorage.setItem('instafin_user', JSON.stringify(data.user));
    // Security: Access token stored in memory only (React state).
    // Refresh token is stored temporarily for the refresh flow;
    // TODO: Migrate to httpOnly cookie in production.
    localStorage.setItem('instafin_refresh', data.refreshToken);
    // Role-based redirect
    if (data.user.role === 'admin') {
      navigate('/admin/dashboard');
    } else if (data.user.role === 'executive') {
      navigate('/executive/leads');
    } else {
      navigate('/dashboard');
    }
    return data.user;
  };

  const logout = async () => {
    const refreshToken = localStorage.getItem('instafin_refresh');
    if (refreshToken) {
      try {
        await fetch(`${API_BASE}/auth/logout`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        });
      } catch (e) {}
    }
    setUser(null);
    setAccessToken(null);
    setImpersonating(null);
    localStorage.removeItem('instafin_user');
    localStorage.removeItem('instafin_refresh');
    localStorage.removeItem('instafin_impersonating');
    navigate('/login');
  };

  const refreshAccessToken = async () => {
    const refreshToken = localStorage.getItem('instafin_refresh');
    if (!refreshToken) return false;
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    setAccessToken(data.accessToken);
    localStorage.setItem('instafin_refresh', data.refreshToken);
    return true;
  };

  const impersonate = async (executiveUser) => {
    setImpersonating(executiveUser);
    localStorage.setItem('instafin_impersonating', JSON.stringify(executiveUser));
  };

  const stopImpersonation = () => {
    setImpersonating(null);
    localStorage.removeItem('instafin_impersonating');
  };

  // When impersonating, the effective role becomes 'executive'
  const effectiveRole = impersonating ? 'executive' : user?.role;

  const isAdmin = user?.role === 'admin';
  const isExecutive = user?.role === 'executive';
  const isDSA = user?.role === 'dsa';
  const isImpersonating = !!impersonating;

  return (
    <AuthContext.Provider value={{ user, impersonating, impersonate, stopImpersonation, effectiveRole, isImpersonating, login, logout, accessToken, refreshAccessToken, isAdmin, isExecutive, isDSA, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}