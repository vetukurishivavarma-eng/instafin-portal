import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
    rejectedLeads: 0,
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
  const [navigatingTo, setNavigatingTo] = useState(null);

  // Filter state lifted from DashboardCharts — controls charts below
  const now = new Date();
  const [filterYear, setFilterYear] = useState(String(now.getFullYear()));
  const [filterMonth, setFilterMonth] = useState(String(now.getMonth() + 1).padStart(2, '0'));
  const [filterActive, setFilterActive] = useState('active');

  const MONTH_NAMES = useMemo(() => ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], []);
  const CHART_FILTER_PROPS = useMemo(() => ({ filterYear, filterMonth, filterActive }), [filterYear, filterMonth, filterActive]);

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
        // Retry with the new token
        const token = localStorage.getItem('instafin_token');
        if (!token) return;
        const retry = await fetch(`${API_BASE}/leads/stats/overview`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!retry.ok) {
          setError('Failed to load dashboard data after refresh.');
          return;
        }
        const retryData = await retry.json();
        if (retryData.error) {
          setError(retryData.error);
          return;
        }
        setError('');
        const rev = ((retryData.totalLeads * 10240) / 100000).toFixed(1);
        setStats({ ...retryData, revenue: `\u20B9${rev}L` });
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

  const handleNavigate = useCallback((status) => {
    const path = status ? `${basePath}/leads?status=${status}` : `${basePath}/leads`;
    setNavigatingTo(status || 'all');
    // Brief delay to show the press feedback before navigation
    setTimeout(() => navigate(path), 150);
  }, [basePath, navigate]);

  const StatCard = ({ label, value, gradient, filterStatus }) => {
    const isNavigating = navigatingTo === (filterStatus || 'all');
    return (
      <div
        onClick={() => handleNavigate(filterStatus)}
        className={`bg-gradient-to-br ${gradient} rounded-3xl p-6 shadow-lg cursor-pointer
          hover:shadow-xl hover:scale-[1.02] active:scale-[0.97]
          transition-all duration-200 ease-out
          ${isNavigating ? 'opacity-70 scale-[0.97] pointer-events-none' : ''}`}
      >
        <p className="text-white/80 text-sm font-medium">{label}</p>
        <h3 className="text-5xl font-bold text-white mt-2">{value}</h3>
        {isNavigating && (
          <div className="mt-2 flex items-center gap-1.5">
            <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            <span className="text-white/70 text-xs font-medium">Loading...</span>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="py-6 sm:py-12 animate-fade-in-up">
      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm sm:text-base text-gray-500">Welcome back, {user?.name || 'User'}</p>
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-2xl mb-6">
          {error}
        </div>
      )}

      {/* ===== VIBRANT FILTER BAR — moved above stats ===== */}
      <div className="relative bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-500 rounded-3xl p-5 sm:p-7 mb-6 sm:mb-8 shadow-xl shadow-indigo-500/20 overflow-hidden">
        {/* Decorative blobs */}
        <div className="absolute -top-10 -right-10 w-40 h-40 bg-white/5 rounded-full blur-2xl" />
        <div className="absolute -bottom-8 -left-8 w-32 h-32 bg-pink-300/10 rounded-full blur-2xl" />
        
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-4">
            <svg className="w-5 h-5 text-white/70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
            <span className="text-white/80 text-xs font-semibold uppercase tracking-widest">Filter Insights</span>
          </div>
          
          <div className="flex flex-wrap items-end gap-3 sm:gap-4">
            {/* Year */}
            <div className="flex-1 min-w-[100px]">
              <label className="block text-[10px] font-bold uppercase tracking-wider text-white/60 mb-1.5">Year</label>
              <select
                value={filterYear}
                onChange={e => setFilterYear(e.target.value)}
                className="w-full bg-white/15 backdrop-blur-md border border-white/20 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-white/40 transition-all cursor-pointer appearance-none"
              >
                {[String(now.getFullYear()), String(now.getFullYear() - 1), String(now.getFullYear() - 2)].map(y => (
                  <option key={y} value={y} className="text-gray-900 bg-white">{y}</option>
                ))}
              </select>
            </div>
            {/* Month */}
            <div className="flex-1 min-w-[120px]">
              <label className="block text-[10px] font-bold uppercase tracking-wider text-white/60 mb-1.5">Month</label>
              <select
                value={filterMonth}
                onChange={e => setFilterMonth(e.target.value)}
                className="w-full bg-white/15 backdrop-blur-md border border-white/20 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-white/40 transition-all cursor-pointer appearance-none"
              >
                {MONTH_NAMES.map((name, i) => {
                  const m = String(i + 1).padStart(2, '0');
                  return (
                    <option key={m} value={m} className="text-gray-900 bg-white">{name}</option>
                  );
                })}
              </select>
            </div>
            {/* Active/Inactive Toggle */}
            <div className="flex-1 min-w-[120px]">
              <label className="block text-[10px] font-bold uppercase tracking-wider text-white/60 mb-1.5">Leads</label>
              <div className="flex bg-white/10 backdrop-blur-md rounded-xl p-0.5 gap-0.5 border border-white/10">
                {[
                  { value: 'active', label: 'Active' },
                  { value: 'inactive', label: 'Inactive' },
                  { value: 'all', label: 'All' },
                ].map(({ value, label }) => (
                  <button
                    key={value}
                    onClick={() => setFilterActive(value)}
                    className={`flex-1 text-center text-xs font-bold px-2 py-2 rounded-lg transition-all duration-200 ${
                      filterActive === value
                        ? 'bg-white text-indigo-700 shadow-lg shadow-black/10'
                        : 'text-white/70 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {/* Active badge */}
            <div className="flex items-center gap-2 px-4 py-2.5 bg-white/10 backdrop-blur-md rounded-xl border border-white/10">
              <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              <span className="text-white font-bold text-sm">{filterActive === 'active' ? 'Active' : filterActive === 'inactive' ? 'Inactive' : 'All'} Leads</span>
            </div>
          </div>
        </div>
      </div>

      {/* ===== STAT CARDS ===== */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 stats-grid">
        <StatCard label="Total Leads" value={stats.totalLeads.toLocaleString()} gradient="from-slate-700 to-slate-900" filterStatus={null} />
        <StatCard label="Active" value={stats.activeLeads.toLocaleString()} gradient="from-blue-500 to-blue-700" filterStatus={null} />
        <StatCard label="New" value={stats.newLeads || 0} gradient="from-sky-400 to-cyan-600" filterStatus="New" />
        <StatCard label="Inactive" value={stats.inactiveLeads || 0} gradient="from-gray-400 to-gray-600" filterStatus="Inactive" />
        <StatCard label="Assigned" value={stats.assigned} gradient="from-orange-400 to-orange-600" filterStatus="Assigned" />
        <StatCard label="Processing" value={stats.processing} gradient="from-yellow-400 to-orange-500" filterStatus="Processing" />
        <StatCard label="Sanctioned" value={stats.sanctioned} gradient="from-green-400 to-emerald-600" filterStatus="Sanctioned" />
        <StatCard label="Part. Disbursed" value={stats.partiallyDisbursed} gradient="from-teal-400 to-cyan-600" filterStatus="Partially Disbursed" />
        <StatCard label="Disbursed" value={stats.disbursed} gradient="from-purple-500 to-indigo-600" filterStatus="Disbursed" />
        <StatCard label="Closed" value={stats.closed || 0} gradient="from-gray-700 to-gray-900" filterStatus="Closed" />
        <StatCard label="Rejected" value={stats.rejectedLeads || stats.rejected || 0} gradient="from-red-500 to-red-700" filterStatus="Rejected" />
        <div className="bg-gradient-to-br from-emerald-400 to-teal-600 rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-lg cursor-default hover:shadow-xl hover:scale-[1.02] active:scale-[0.97] transition-all duration-200 ease-out">
          <p className="text-white/80 text-xs sm:text-sm font-medium">Revenue</p>
          <h3 className="text-2xl sm:text-5xl font-bold text-white mt-1 sm:mt-2">{stats.revenue}</h3>
        </div>
      </div>

      <DashboardCharts {...CHART_FILTER_PROPS} />
    </div>
  );
}
