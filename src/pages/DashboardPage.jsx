import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';

const API_BASE = 'http://localhost:3001/api';

export default function DashboardPage() {
  const { user, isAdmin, accessToken, refreshAccessToken } = useAuth();
  const [stats, setStats] = useState({
    totalLeads: 0,
    freshLeads: 0,
    processing: 0,
    sanctioned: 0,
    disbursed: 0,
    revenue: '₹0L'
  });
  const [error, setError] = useState('');

  const fetchStats = async () => {
    if (!accessToken) return;

    try {
      const res = await fetch(`${API_BASE}/leads/stats/overview`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      if (res.status === 401) {
        const refreshed = await refreshAccessToken();
        if (!refreshed) {
          setError('Session expired. Please login again.');
          return;
        }
        return;
      }

      const data = await res.json();
      if (data.error) {
        setError(data.error);
        return;
      }
      setError('');
      const revenue = ((data.totalLeads * 10240) / 100000).toFixed(1);
      setStats({ ...data, revenue: `₹${revenue}L` });
    } catch (err) {
      console.error('Failed to fetch stats:', err);
    }
  };

  useEffect(() => {
    if (!accessToken) return;
    fetchStats();
  }, [accessToken]);

  return (
    <div className="py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500">Welcome back, {user?.name || 'User'}</p>
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-2xl mb-6">
          {error}
        </div>
      )}

      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-gradient-to-br from-blue-500 to-blue-700 rounded-3xl p-6 shadow-lg">
          <p className="text-blue-100 text-sm font-medium">Total Leads</p>
          <h3 className="text-5xl font-bold text-white mt-2">{stats.totalLeads.toLocaleString()}</h3>
        </div>
        <div className="bg-gradient-to-br from-cyan-400 to-cyan-600 rounded-3xl p-6 shadow-lg">
          <p className="text-cyan-100 text-sm font-medium">Fresh Leads</p>
          <h3 className="text-5xl font-bold text-white mt-2">{stats.newLeads || stats.freshLeads}</h3>
        </div>
        <div className="bg-gradient-to-br from-yellow-400 to-orange-500 rounded-3xl p-6 shadow-lg">
          <p className="text-yellow-100 text-sm font-medium">Processing</p>
          <h3 className="text-5xl font-bold text-white mt-2">{stats.processing}</h3>
        </div>
        <div className="bg-gradient-to-br from-green-400 to-emerald-600 rounded-3xl p-6 shadow-lg">
          <p className="text-green-100 text-sm font-medium">Sanctioned</p>
          <h3 className="text-5xl font-bold text-white mt-2">{stats.sanctioned}</h3>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-gradient-to-br from-purple-500 to-indigo-600 rounded-3xl p-6 shadow-lg">
          <p className="text-purple-100 text-sm font-medium">Disbursed</p>
          <h3 className="text-5xl font-bold text-white mt-2">{stats.disbursed}</h3>
        </div>
        <div className="bg-gradient-to-br from-emerald-400 to-teal-600 rounded-3xl p-6 shadow-lg">
          <p className="text-emerald-100 text-sm font-medium">Revenue Generated</p>
          <h3 className="text-5xl font-bold text-white mt-2">{stats.revenue}</h3>
        </div>
      </div>
    </div>
  );
}