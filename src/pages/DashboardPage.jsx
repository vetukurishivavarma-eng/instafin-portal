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
        <div className="bg-white rounded-2xl p-6 shadow-sm border-l-4 border-blue-500">
          <p className="text-gray-500 text-sm">Total Leads</p>
          <h3 className="text-4xl font-bold text-blue-700 mt-2">{stats.totalLeads.toLocaleString()}</h3>
        </div>
        <div className="bg-white rounded-2xl p-6 shadow-sm border-l-4 border-cyan-500">
          <p className="text-gray-500 text-sm">Fresh Leads</p>
          <h3 className="text-4xl font-bold text-cyan-700 mt-2">{stats.newLeads || stats.freshLeads}</h3>
        </div>
        <div className="bg-white rounded-2xl p-6 shadow-sm border-l-4 border-yellow-500">
          <p className="text-gray-500 text-sm">Processing</p>
          <h3 className="text-4xl font-bold text-yellow-600 mt-2">{stats.processing}</h3>
        </div>
        <div className="bg-white rounded-2xl p-6 shadow-sm border-l-4 border-green-500">
          <p className="text-gray-500 text-sm">Sanctioned</p>
          <h3 className="text-4xl font-bold text-green-700 mt-2">{stats.sanctioned}</h3>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl p-6 shadow-sm border-l-4 border-purple-500">
          <p className="text-gray-500 text-sm">Disbursed</p>
          <h3 className="text-4xl font-bold text-purple-700 mt-2">{stats.disbursed}</h3>
        </div>
        <div className="bg-white rounded-2xl p-6 shadow-sm border-l-4 border-emerald-500">
          <p className="text-gray-500 text-sm">Revenue Generated</p>
          <h3 className="text-4xl font-bold text-emerald-700 mt-2">{stats.revenue}</h3>
        </div>
      </div>
    </div>
  );
}