import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import DashboardCharts from '../components/charts/DashboardCharts';
import API_BASE from '../config/api';

export default function DashboardPage() {
  const { user, effectiveRole, accessToken, refreshAccessToken } = useAuth();
  const navigate = useNavigate();
  const basePath = effectiveRole === 'admin' ? '/admin' : '/executive';
  const [stats, setStats] = useState({
    totalLeads: 0,
    activeLeads: 0,
    inactiveLeads: 0,
    newLeads: 0,
    assigned: 0,
    processing: 0,
    sanctioned: 0,
    partiallyDisbursed: 0,
    disbursed: 0,
    rejected: 0,
    closed: 0,
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
      onClick={() => navigate(filterStatus ? `${basePath}/leads?status=${filterStatus}` : `${basePath}/leads`)}
      className={`bg-gradient-to-br ${gradient} rounded-3xl p-6 shadow-lg cursor-pointer hover:shadow-xl hover:scale-[1.02] transition-all duration-200`}
    >
      <p className="text-white/80 text-sm font-medium">{label}</p>
      <h3 className="text-5xl font-bold text-white mt-2">{value}</h3>
    </div>
  );

  return (
    <div className="py-6 sm:py-12">
      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm sm:text-base text-gray-500">Welcome back, {user?.name || 'User'}</p>
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-2xl mb-6">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6 stats-grid">
        <StatCard label="Active Leads" value={stats.activeLeads.toLocaleString()} gradient="from-blue-500 to-blue-700" filterStatus={null} />
        <StatCard label="New" value={stats.newLeads || 0} gradient="from-sky-400 to-cyan-600" filterStatus="New" />
        <StatCard label="Inactive" value={stats.inactiveLeads || 0} gradient="from-gray-400 to-gray-600" filterStatus="Inactive" />
        <StatCard label="Assigned" value={stats.assigned} gradient="from-orange-400 to-orange-600" filterStatus="Assigned" />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6 stats-grid">
        <StatCard label="Processing" value={stats.processing} gradient="from-yellow-400 to-orange-500" filterStatus="Processing" />
        <StatCard label="Sanctioned" value={stats.sanctioned} gradient="from-green-400 to-emerald-600" filterStatus="Sanctioned" />
        <StatCard label="Part. Disbursed" value={stats.partiallyDisbursed} gradient="from-teal-400 to-cyan-600" filterStatus="Partially Disbursed" />
        <StatCard label="Disbursed" value={stats.disbursed} gradient="from-purple-500 to-indigo-600" filterStatus="Disbursed" />
        <StatCard label="Closed" value={stats.closed || 0} gradient="from-gray-700 to-gray-900" filterStatus="Closed" />
        <StatCard label="Rejected" value={stats.rejected || 0} gradient="from-red-500 to-red-700" filterStatus="Rejected" />
        <div className="bg-gradient-to-br from-emerald-400 to-teal-600 rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-lg">
          <p className="text-white/80 text-xs sm:text-sm font-medium">Revenue Generated</p>
          <h3 className="text-2xl sm:text-5xl font-bold text-white mt-1 sm:mt-2">{stats.revenue}</h3>
        </div>
      </div>

      <DashboardCharts />
    </div>
  );
}
