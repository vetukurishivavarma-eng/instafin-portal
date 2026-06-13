import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import API_BASE from '../config/api';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Helper: extract YYYY-MM from a date string
function getPeriodKey(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function pickDate(lead) {
  return lead.entryDate || lead.createdAt;
}

// Compute single lead's revenue (1% of disbursed or sanctioned amount)
function calcLeadRevenue(lead) {
  const amount = parseFloat(lead.disbursedAmount || lead.sanctionedAmount || lead.expectedAmount) || 0;
  return amount * 0.01;
}

export default function RevenuePage() {
  const { accessToken } = useAuth();
  const [allLeads, setAllLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Month/year filter
  const now = new Date();
  const [selectedYear, setSelectedYear] = useState(String(now.getFullYear()));
  const [selectedMonth, setSelectedMonth] = useState(String(now.getMonth() + 1).padStart(2, '0'));

  useEffect(() => {
    if (!accessToken) return;
    fetchLeads();
  }, [accessToken]);

  const fetchLeads = async () => {
    try {
      const res = await fetch(`${API_BASE}/leads`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const data = await res.json();
      const leads = data.data || data || [];
      setAllLeads(leads);
      setLoading(false);
    } catch (err) {
      setError('Failed to load revenue data');
      setLoading(false);
    }
  };

  // ===== Compute per-month breakdown =====
  const monthlyBreakdown = useMemo(() => {
    const monthMap = {};

    allLeads.forEach(l => {
      const key = getPeriodKey(pickDate(l));
      if (!key) return;

      if (!monthMap[key]) {
        monthMap[key] = {
          period: key,
          year: key.split('-')[0],
          month: key.split('-')[1],
          label: '',
          totalRevenue: 0,
          disbursedCount: 0,
          partiallyDisbursedCount: 0,
          sanctionedCount: 0,
          newCount: 0,
          assignedCount: 0,
          processingCount: 0,
          totalDisbursed: 0,
          totalSanctioned: 0,
          totalExpected: 0,
        };
      }

      const m = monthMap[key];
      const status = l.status || '';
      const expected = parseFloat(l.expectedAmount) || 0;
      const sanctioned = parseFloat(l.sanctionedAmount) || 0;
      const disbursed = parseFloat(l.disbursedAmount) || 0;

      m.totalExpected += expected;
      m.totalSanctioned += sanctioned;
      m.totalDisbursed += disbursed;

      if (status === 'Disbursed') {
        m.disbursedCount++;
        m.totalRevenue += calcLeadRevenue(l);
      } else if (status === 'Partially Disbursed') {
        m.partiallyDisbursedCount++;
        m.totalRevenue += calcLeadRevenue(l);
      } else if (status === 'Sanctioned') {
        m.sanctionedCount++;
      } else if (status === 'New') {
        m.newCount++;
      } else if (status === 'Assigned') {
        m.assignedCount++;
      } else if (status === 'Processing') {
        m.processingCount++;
      }
    });

    // Sort by period descending (newest first)
    const sorted = Object.values(monthMap).sort((a, b) => b.period.localeCompare(a.period));
    sorted.forEach(m => {
      const monthIndex = parseInt(m.month, 10) - 1;
      m.label = `${MONTH_NAMES[monthIndex]} ${m.year}`;
    });
    return sorted;
  }, [allLeads]);

  // ===== Current selected month's data =====
  const currentMonthData = useMemo(() => {
    const key = `${selectedYear}-${selectedMonth}`;
    return monthlyBreakdown.find(m => m.period === key) || {
      period: key,
      label: `${MONTH_NAMES[parseInt(selectedMonth, 10) - 1]} ${selectedYear}`,
      totalRevenue: 0,
      disbursedCount: 0,
      partiallyDisbursedCount: 0,
      sanctionedCount: 0,
      newCount: 0,
      assignedCount: 0,
      processingCount: 0,
      totalDisbursed: 0,
      totalSanctioned: 0,
      totalExpected: 0,
    };
  }, [monthlyBreakdown, selectedYear, selectedMonth]);

  // ===== Overall totals (all time) =====
  const overall = useMemo(() => {
    return monthlyBreakdown.reduce((acc, m) => ({
      totalRevenue: acc.totalRevenue + m.totalRevenue,
      totalDisbursed: acc.totalDisbursed + m.totalDisbursed,
      totalSanctioned: acc.totalSanctioned + m.totalSanctioned,
      totalExpected: acc.totalExpected + m.totalExpected,
      disbursedCount: acc.disbursedCount + m.disbursedCount,
      partiallyDisbursedCount: acc.partiallyDisbursedCount + m.partiallyDisbursedCount,
      sanctionedCount: acc.sanctionedCount + m.sanctionedCount,
      completedPayouts: acc.completedPayouts + m.disbursedCount,
      pendingPayouts: acc.pendingPayouts + m.partiallyDisbursedCount + m.sanctionedCount,
    }), {
      totalRevenue: 0, totalDisbursed: 0, totalSanctioned: 0, totalExpected: 0,
      disbursedCount: 0, partiallyDisbursedCount: 0, sanctionedCount: 0,
      completedPayouts: 0, pendingPayouts: 0,
    });
  }, [monthlyBreakdown]);

  // Available years/months for filter
  const availableYears = [...new Set(monthlyBreakdown.map(m => m.year))].sort().reverse();
  const availableMonths = monthlyBreakdown
    .filter(m => m.year === selectedYear)
    .map(m => m.month)
    .sort();

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(amount);
  };

  // Show a compact revenue bar for each month in the table
  const maxRevenue = Math.max(...monthlyBreakdown.map(m => m.totalRevenue), 1);

  return (
    <div className="py-6 sm:py-12 px-3 sm:px-6">
      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Revenue Dashboard</h1>
        <p className="text-sm sm:text-base text-gray-500">Track revenue, disbursements, and payouts per month</p>
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-2xl mb-6 text-sm">{error}</div>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading revenue data...</div>
      ) : (
        <>

          {/* ===== Month/Year Filter ===== */}
          <div className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-lg mb-6 sm:mb-8">
            <div className="flex items-center gap-4">
              <div className="flex-1 min-w-[100px]">
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1">Year</label>
                <select
                  value={selectedYear}
                  onChange={e => setSelectedYear(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 text-gray-900 text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-all cursor-pointer"
                >
                  {availableYears.map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
              <div className="flex-1 min-w-[120px]">
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1">Month</label>
                <select
                  value={selectedMonth}
                  onChange={e => setSelectedMonth(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 text-gray-900 text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-all cursor-pointer"
                >
                  {availableMonths.length > 0 ? (
                    availableMonths.map(m => {
                      const key = `${selectedYear}-${m}`;
                      const period = monthlyBreakdown.find(p => p.period === key);
                      return (
                        <option key={m} value={m}>
                          {MONTH_NAMES[parseInt(m, 10) - 1]} {period ? `(₹${Math.round(period.totalRevenue).toLocaleString('en-IN')})` : ''}
                        </option>
                      );
                    })
                  ) : (
                    <option value={selectedMonth}>{MONTH_NAMES[parseInt(selectedMonth, 10) - 1]} {selectedYear}</option>
                  )}
                </select>
              </div>
              <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 rounded-xl self-end">
                <span className="text-lg font-bold text-emerald-700">{formatCurrency(currentMonthData.totalRevenue)}</span>
                <span className="text-[10px] font-medium uppercase tracking-wider text-emerald-600">Month Revenue</span>
              </div>
            </div>
          </div>

          {/* ===== Current Month Overview Cards ===== */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6 mb-6 sm:mb-8">
            <div className="bg-gradient-to-br from-emerald-400 to-teal-600 rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-lg">
              <p className="text-white/80 text-xs sm:text-sm font-medium">{currentMonthData.label} Revenue</p>
              <h3 className="text-xl sm:text-3xl font-bold text-white mt-1 sm:mt-2">{formatCurrency(currentMonthData.totalRevenue)}</h3>
              <p className="text-white/60 text-xs mt-1">Starts at ₹0 at month beginning</p>
            </div>
            <div className="bg-gradient-to-br from-blue-500 to-blue-700 rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-lg">
              <p className="text-white/80 text-xs sm:text-sm font-medium">{currentMonthData.label} Disbursed</p>
              <h3 className="text-xl sm:text-3xl font-bold text-white mt-1 sm:mt-2">{formatCurrency(currentMonthData.totalDisbursed)}</h3>
              <p className="text-white/60 text-xs mt-1">{currentMonthData.disbursedCount} loans disbursed</p>
            </div>
            <div className="bg-gradient-to-br from-purple-500 to-indigo-600 rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-lg">
              <p className="text-white/80 text-xs sm:text-sm font-medium">Completed (Month)</p>
              <h3 className="text-xl sm:text-3xl font-bold text-white mt-1 sm:mt-2">{currentMonthData.disbursedCount}</h3>
              <p className="text-white/60 text-xs mt-1">Fully disbursed</p>
            </div>
            <div className="bg-gradient-to-br from-orange-400 to-orange-600 rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-lg">
              <p className="text-white/80 text-xs sm:text-sm font-medium">Pending (Month)</p>
              <h3 className="text-xl sm:text-3xl font-bold text-white mt-1 sm:mt-2">{currentMonthData.partiallyDisbursedCount + currentMonthData.sanctionedCount}</h3>
              <p className="text-white/60 text-xs mt-1">{currentMonthData.sanctionedCount} sanctioned + {currentMonthData.partiallyDisbursedCount} partial</p>
            </div>
          </div>

          {/* ===== Monthly Revenue Breakdown Table ===== */}
          <div className="bg-white rounded-2xl sm:rounded-3xl shadow-xl p-4 sm:p-6 mb-6 sm:mb-8">
            <div className="flex items-center justify-between mb-4 sm:mb-6">
              <h2 className="text-lg sm:text-xl font-bold text-gray-900">Monthly Revenue Breakdown</h2>
              <span className="text-xs text-gray-400">Each month starts at ₹0</span>
            </div>

            {monthlyBreakdown.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-xs sm:text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-3 px-2 font-semibold text-gray-500 uppercase tracking-wider">Month</th>
                      <th className="text-right py-3 px-2 font-semibold text-gray-500 uppercase tracking-wider">Revenue</th>
                      <th className="text-right py-3 px-2 font-semibold text-gray-500 uppercase tracking-wider">Disbursed</th>
                      <th className="text-right py-3 px-2 font-semibold text-gray-500 uppercase tracking-wider">Expected</th>
                      <th className="text-center py-3 px-2 font-semibold text-gray-500 uppercase tracking-wider">Completed</th>
                      <th className="text-center py-3 px-2 font-semibold text-gray-500 uppercase tracking-wider">Partial</th>
                      <th className="text-center py-3 px-2 font-semibold text-gray-500 uppercase tracking-wider">Sanctioned</th>
                      <th className="text-center py-3 px-2 font-semibold text-gray-500 uppercase tracking-wider">Trend</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthlyBreakdown.map((m, idx) => {
                      const isSelected = m.period === `${selectedYear}-${selectedMonth}`;
                      const pct = (m.totalRevenue / maxRevenue) * 100;
                      return (
                        <tr
                          key={m.period}
                          onClick={() => { setSelectedYear(m.year); setSelectedMonth(m.month); }}
                          className={`border-b border-gray-100 transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-emerald-50 border-emerald-200'
                              : 'hover:bg-gray-50'
                          }`}
                        >
                          <td className="py-3 px-2 font-semibold text-gray-800 whitespace-nowrap">
                            {m.label}
                            {isSelected && <span className="ml-2 text-[10px] text-emerald-600 bg-emerald-100 px-1.5 py-0.5 rounded-full">Viewing</span>}
                          </td>
                          <td className="py-3 px-2 text-right font-bold text-emerald-600 whitespace-nowrap">
                            {formatCurrency(m.totalRevenue)}
                          </td>
                          <td className="py-3 px-2 text-right font-semibold text-blue-600 whitespace-nowrap">
                            {formatCurrency(m.totalDisbursed)}
                          </td>
                          <td className="py-3 px-2 text-right text-gray-600 whitespace-nowrap">
                            {formatCurrency(m.totalExpected)}
                          </td>
                          <td className="py-3 px-2 text-center font-semibold text-gray-800">
                            {m.disbursedCount}
                          </td>
                          <td className="py-3 px-2 text-center text-gray-600">
                            {m.partiallyDisbursedCount}
                          </td>
                          <td className="py-3 px-2 text-center text-gray-600">
                            {m.sanctionedCount}
                          </td>
                          <td className="py-3 px-2">
                            <div className="w-20 h-2 bg-gray-100 rounded-full overflow-hidden ml-auto">
                              <div
                                className="h-full bg-gradient-to-r from-emerald-400 to-emerald-600 rounded-full transition-all"
                                style={{ width: `${Math.min(pct, 100)}%` }}
                              />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-8 text-gray-400 text-sm">No revenue data available</div>
            )}
          </div>

          {/* ===== Overall Summary ===== */}
          <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl sm:rounded-3xl p-5 sm:p-8 shadow-xl text-white">
            <h2 className="text-lg sm:text-xl font-bold mb-4">Overall Revenue Summary (All Time)</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
              <div className="sm:border-r sm:border-gray-700 sm:pr-6">
                <p className="text-gray-400 text-xs sm:text-sm">Total Revenue</p>
                <p className="text-xl sm:text-2xl font-bold mt-1 text-emerald-400">{formatCurrency(overall.totalRevenue)}</p>
              </div>
              <div className="sm:border-r sm:border-gray-700 sm:pr-6">
                <p className="text-gray-400 text-xs sm:text-sm">Total Disbursed</p>
                <p className="text-xl sm:text-2xl font-bold mt-1">{formatCurrency(overall.totalDisbursed)}</p>
                <p className="text-gray-500 text-xs mt-1">{overall.disbursedCount} loans completed</p>
              </div>
              <div>
                <p className="text-gray-400 text-xs sm:text-sm">Total Loans Processed</p>
                <p className="text-xl sm:text-2xl font-bold mt-1">
                  {overall.disbursedCount + overall.partiallyDisbursedCount + overall.sanctionedCount}
                </p>
                <p className="text-gray-500 text-xs mt-1">
                  {overall.completedPayouts} completed · {overall.pendingPayouts} pending
                </p>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
