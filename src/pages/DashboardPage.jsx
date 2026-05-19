import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import DashboardCharts from '../components/charts/DashboardCharts';
import API_BASE from '../config/api';

export default function DashboardPage() {
  const { user, isAdmin, accessToken, refreshAccessToken } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    totalLeads: 0,
    freshLeads: 0,
    assigned: 0,
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

  const StatCard = ({ label, value, gradient, filterStatus }) => (
    <div
      onClick={() => navigate(filterStatus ? `/leads?status=${filterStatus}` : '/leads')}
      className={`bg-gradient-to-br ${gradient} rounded-3xl p-6 shadow-lg cursor-pointer hover:shadow-xl hover:scale-[1.02] transition-all duration-200`}
    >
      <p className="text-white/80 text-sm font-medium">{label}</p>
      <h3 className="text-5xl font-bold text-white mt-2">{value}</h3>
    </div>
  );

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
        <StatCard label="Total Leads" value={stats.totalLeads.toLocaleString()} gradient="from-blue-500 to-blue-700" filterStatus={null} />
        <StatCard label="Fresh Leads" value={stats.newLeads || stats.freshLeads} gradient="from-cyan-400 to-cyan-600" filterStatus="New" />
        <StatCard label="Assigned" value={stats.assigned} gradient="from-orange-400 to-orange-600" filterStatus="Assigned" />
        <StatCard label="Processing" value={stats.processing} gradient="from-yellow-400 to-orange-500" filterStatus="Processing" />
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard label="Sanctioned" value={stats.sanctioned} gradient="from-green-400 to-emerald-600" filterStatus="Sanctioned" />
        <StatCard label="Disbursed" value={stats.disbursed} gradient="from-purple-500 to-indigo-600" filterStatus="Disbursed" />
        <StatCard label="Rejected" value={stats.rejected || 0} gradient="from-red-500 to-red-700" filterStatus="Rejected" />
        <div className="bg-gradient-to-br from-emerald-400 to-teal-600 rounded-3xl p-6 shadow-lg">
          <p className="text-white/80 text-sm font-medium">Revenue Generated</p>
          <h3 className="text-5xl font-bold text-white mt-2">{stats.revenue}</h3>
        </div>
      </div>

      <DashboardCharts />
    </div>
  );
}
