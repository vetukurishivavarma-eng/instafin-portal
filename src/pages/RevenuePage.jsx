import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import API_BASE from '../config/api';

export default function RevenuePage() {
  const { accessToken } = useAuth();
  const [revenueData, setRevenueData] = useState({
    totalRevenue: 0,
    monthlyData: [],
    pendingPayouts: 0,
    completedPayouts: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!accessToken) return;
    fetchRevenue();
  }, [accessToken]);

  const fetchRevenue = async () => {
    try {
      // Fetch leads to calculate revenue estimates
      const res = await fetch(`${API_BASE}/leads`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const data = await res.json();
      const allLeads = data.data || data || [];

      // Calculate revenue from leads
      const disbursedLeads = allLeads.filter(l => l.status === 'Disbursed');
      const partiallyDisbursed = allLeads.filter(l => l.status === 'Partially Disbursed');
      const sanctionedLeads = allLeads.filter(l => l.status === 'Sanctioned');

      const totalRevenue = disbursedLeads.reduce((sum, l) => {
        const amount = parseFloat(l.expectedAmount) || 0;
        return sum + (amount * 0.01); // Assume 1% revenue
      }, 0);

      setRevenueData({
        totalRevenue,
        disbursedCount: disbursedLeads.length,
        partiallyDisbursedCount: partiallyDisbursed.length,
        sanctionedCount: sanctionedLeads.length,
        totalDisbursed: disbursedLeads.reduce((s, l) => s + (parseFloat(l.expectedAmount) || 0), 0),
        pendingPayouts: partiallyDisbursed.length + sanctionedLeads.length,
        completedPayouts: disbursedLeads.length,
      });
      setLoading(false);
    } catch (err) {
      setError('Failed to load revenue data');
      setLoading(false);
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <div className="py-6 sm:py-12 px-3 sm:px-6">
      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Revenue Dashboard</h1>
        <p className="text-sm sm:text-base text-gray-500">Track revenue, disbursements, and payouts</p>
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-2xl mb-6 text-sm">{error}</div>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading revenue data...</div>
      ) : (
        <>
          {/* Revenue Overview Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6 mb-6 sm:mb-8 stats-grid">
            <div className="bg-gradient-to-br from-emerald-400 to-teal-600 rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-lg">
              <p className="text-white/80 text-xs sm:text-sm font-medium">Revenue</p>
              <h3 className="text-xl sm:text-3xl font-bold text-white mt-1 sm:mt-2">{formatCurrency(revenueData.totalRevenue)}</h3>
            </div>
            <div className="bg-gradient-to-br from-blue-500 to-blue-700 rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-lg">
              <p className="text-white/80 text-xs sm:text-sm font-medium">Disbursed</p>
              <h3 className="text-xl sm:text-3xl font-bold text-white mt-1 sm:mt-2">{formatCurrency(revenueData.totalDisbursed)}</h3>
            </div>
            <div className="bg-gradient-to-br from-purple-500 to-indigo-600 rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-lg">
              <p className="text-white/80 text-xs sm:text-sm font-medium">Completed</p>
              <h3 className="text-xl sm:text-3xl font-bold text-white mt-1 sm:mt-2">{revenueData.completedPayouts}</h3>
            </div>
            <div className="bg-gradient-to-br from-orange-400 to-orange-600 rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-lg">
              <p className="text-white/80 text-xs sm:text-sm font-medium">Pending</p>
              <h3 className="text-xl sm:text-3xl font-bold text-white mt-1 sm:mt-2">{revenueData.pendingPayouts}</h3>
            </div>
          </div>

          {/* Detailed Breakdown */}
          <div className="bg-white rounded-2xl sm:rounded-3xl shadow-xl p-4 sm:p-6 mb-6 sm:mb-8">
            <h2 className="text-lg sm:text-xl font-bold text-gray-900 mb-4 sm:mb-6">Revenue Breakdown</h2>
            <div className="space-y-4 sm:space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-4 bg-gradient-to-r from-green-50 to-emerald-50 rounded-2xl gap-1 sm:gap-0">
                <div>
                  <h3 className="font-semibold text-gray-800 text-sm sm:text-base">Disbursed Loans</h3>
                  <p className="text-xs sm:text-sm text-gray-500">{revenueData.disbursedCount} loans fully disbursed</p>
                </div>
                <span className="text-lg sm:text-xl font-bold text-green-600">{formatCurrency(revenueData.totalRevenue * 0.6)}</span>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-2xl gap-1 sm:gap-0">
                <div>
                  <h3 className="font-semibold text-gray-800 text-sm sm:text-base">Partially Disbursed</h3>
                  <p className="text-xs sm:text-sm text-gray-500">{revenueData.partiallyDisbursedCount} loans in progress</p>
                </div>
                <span className="text-lg sm:text-xl font-bold text-blue-600">{formatCurrency(revenueData.totalRevenue * 0.25)}</span>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-4 bg-gradient-to-r from-yellow-50 to-orange-50 rounded-2xl gap-1 sm:gap-0">
                <div>
                  <h3 className="font-semibold text-gray-800 text-sm sm:text-base">Sanctioned (Pending)</h3>
                  <p className="text-xs sm:text-sm text-gray-500">{revenueData.sanctionedCount} loans awaiting disbursal</p>
                </div>
                <span className="text-lg sm:text-xl font-bold text-orange-600">{formatCurrency(revenueData.totalRevenue * 0.15)}</span>
              </div>
            </div>
          </div>

          {/* Income Summary */}
          <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl sm:rounded-3xl p-5 sm:p-8 shadow-xl text-white">
            <h2 className="text-lg sm:text-xl font-bold mb-4">Revenue Summary</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
              <div className="sm:border-r sm:border-gray-700 sm:pr-6">
                <p className="text-gray-400 text-xs sm:text-sm">Total Loans Processed</p>
                <p className="text-xl sm:text-2xl font-bold mt-1">
                  {revenueData.disbursedCount + revenueData.partiallyDisbursedCount + revenueData.sanctionedCount}
                </p>
              </div>
              <div className="sm:border-r sm:border-gray-700 sm:pr-6">
                <p className="text-gray-400 text-xs sm:text-sm">Avg Revenue per Loan</p>
                <p className="text-xl sm:text-2xl font-bold mt-1">
                  {revenueData.disbursedCount > 0
                    ? formatCurrency(revenueData.totalRevenue / revenueData.disbursedCount)
                    : formatCurrency(0)}
                </p>
              </div>
              <div>
                <p className="text-gray-400 text-xs sm:text-sm">Projected Revenue</p>
                <p className="text-xl sm:text-2xl font-bold mt-1 text-emerald-400">
                  {formatCurrency(revenueData.totalRevenue * 1.3)}
                </p>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
