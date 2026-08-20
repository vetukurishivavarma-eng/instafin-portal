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

// The date revenue counts toward in the monthly breakdown: the admin-entered
// "revenue received" date if set, otherwise the lead's entry/creation date.
function pickRevenueDate(lead) {
  return lead.revenueReceivedDate || pickDate(lead);
}

// Compute single lead's revenue - prefers Revenue Received + Revenue Pending, then the
// legacy manual override, then falls back to the lead's revenue percent (default 1%) of disbursed/sanctioned
function calcLeadRevenue(lead) {
  const received = parseFloat(lead.revenueReceived);
  const pending = parseFloat(lead.revenuePending);
  if (!isNaN(received) || !isNaN(pending)) {
    return (isNaN(received) ? 0 : received) + (isNaN(pending) ? 0 : pending);
  }
  if (lead.revenue !== null && lead.revenue !== undefined && lead.revenue !== '') {
    return parseFloat(lead.revenue) || 0;
  }
  const percent = lead.revenuePercent !== null && lead.revenuePercent !== undefined && lead.revenuePercent !== ''
    ? parseFloat(lead.revenuePercent)
    : 1;
  const amount = parseFloat(lead.disbursedAmount || lead.sanctionedAmount || lead.expectedAmount) || 0;
  return amount * (percent / 100);
}

export default function RevenuePage() {
  const { accessToken, effectiveRole, user } = useAuth();
  const [allLeads, setAllLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const isAdmin = effectiveRole === 'admin' || user?.role === 'admin';

  // Manual revenue entry (admin only)
  const [revenueDrafts, setRevenueDrafts] = useState({}); // { [leadId]: { percent, received, pending, receivedDate } }
  const [savingRevenueId, setSavingRevenueId] = useState(null);
  const [showRevenueEditor, setShowRevenueEditor] = useState(false);

  const getRevenueDraft = (lead) => {
    return revenueDrafts[lead.id] || {
      percent: lead.revenuePercent !== null && lead.revenuePercent !== undefined ? String(lead.revenuePercent) : '1',
      received: lead.revenueReceived !== null && lead.revenueReceived !== undefined ? String(lead.revenueReceived) : '',
      pending: lead.revenuePending !== null && lead.revenuePending !== undefined ? String(lead.revenuePending) : '',
      receivedDate: lead.revenueReceivedDate ? String(lead.revenueReceivedDate).slice(0, 10) : '',
    };
  };

  const setRevenueDraftField = (leadId, lead, field, value) => {
    setRevenueDrafts(prev => ({
      ...prev,
      [leadId]: { ...getRevenueDraft(lead), ...prev[leadId], [field]: value }
    }));
  };

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

  // Admin: save manual revenue percent/received/pending/date for a lead
  const handleSaveRevenue = async (lead) => {
    const draft = getRevenueDraft(lead);
    if (draft.percent === '' && draft.received === '' && draft.pending === '' && draft.receivedDate === '') {
      setError('Enter at least one revenue field first.');
      setTimeout(() => setError(''), 4000);
      return;
    }
    setSavingRevenueId(lead.id);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/leads/${lead.id}/revenue`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          revenuePercent: draft.percent !== '' ? parseFloat(draft.percent) : undefined,
          revenueReceived: draft.received !== '' ? parseFloat(draft.received) : undefined,
          revenuePending: draft.pending !== '' ? parseFloat(draft.pending) : undefined,
          revenueReceivedDate: draft.receivedDate !== '' ? draft.receivedDate : undefined,
        })
      });
      const data = await res.json();
      if (res.ok) {
        await fetchLeads();
        setRevenueDrafts(prev => {
          const next = { ...prev };
          delete next[lead.id];
          return next;
        });
        setError('');
      } else {
        setError(data.error || 'Failed to save revenue');
        setTimeout(() => setError(''), 4000);
      }
    } catch (err) {
      setError('Failed to save revenue');
      setTimeout(() => setError(''), 4000);
    } finally {
      setSavingRevenueId(null);
    }
  };

  // Leads that are eligible for revenue entry (disbursed / partially disbursed / sanctioned)
  const revenueEligibleLeads = useMemo(() => {
    return allLeads.filter(l => ['Disbursed', 'Partially Disbursed', 'Sanctioned'].includes(l.status));
  }, [allLeads]);

  // ===== Compute per-month breakdown =====
  const monthlyBreakdown = useMemo(() => {
    const monthMap = {};

    const getOrCreateMonth = (key) => {
      if (!monthMap[key]) {
        monthMap[key] = {
          period: key,
          year: key.split('-')[0],
          month: key.split('-')[1],
          label: '',
          totalRevenue: 0,
          totalRevenuePending: 0,
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
      return monthMap[key];
    };

    allLeads.forEach(l => {
      const key = getPeriodKey(pickDate(l));
      const status = l.status || '';

      if (key) {
        const m = getOrCreateMonth(key);
        const expected = parseFloat(l.expectedAmount) || 0;
        const sanctioned = parseFloat(l.sanctionedAmount) || 0;
        const disbursed = parseFloat(l.disbursedAmount) || 0;

        m.totalExpected += expected;
        m.totalSanctioned += sanctioned;
        m.totalDisbursed += disbursed;

        if (status === 'Disbursed') {
          m.disbursedCount++;
        } else if (status === 'Partially Disbursed') {
          m.partiallyDisbursedCount++;
        } else if (status === 'Sanctioned') {
          m.sanctionedCount++;
        } else if (status === 'New') {
          m.newCount++;
        } else if (status === 'Assigned') {
          m.assignedCount++;
        } else if (status === 'Processing') {
          m.processingCount++;
        }
      }

      // Revenue is bucketed by its own received date (falls back to the lead's
      // entry date), which can land in a different month than the counts above.
      if (status === 'Disbursed' || status === 'Partially Disbursed') {
        const revenueKey = getPeriodKey(pickRevenueDate(l));
        if (revenueKey) {
          const rm = getOrCreateMonth(revenueKey);
          const pending = parseFloat(l.revenuePending);
          rm.totalRevenue += calcLeadRevenue(l) - (isNaN(pending) ? 0 : pending);
          rm.totalRevenuePending += isNaN(pending) ? 0 : pending;
        }
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
      totalRevenuePending: 0,
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
      totalRevenuePending: acc.totalRevenuePending + m.totalRevenuePending,
      totalDisbursed: acc.totalDisbursed + m.totalDisbursed,
      totalSanctioned: acc.totalSanctioned + m.totalSanctioned,
      totalExpected: acc.totalExpected + m.totalExpected,
      disbursedCount: acc.disbursedCount + m.disbursedCount,
      partiallyDisbursedCount: acc.partiallyDisbursedCount + m.partiallyDisbursedCount,
      sanctionedCount: acc.sanctionedCount + m.sanctionedCount,
      completedPayouts: acc.completedPayouts + m.disbursedCount,
      pendingPayouts: acc.pendingPayouts + m.partiallyDisbursedCount + m.sanctionedCount,
    }), {
      totalRevenue: 0, totalRevenuePending: 0, totalDisbursed: 0, totalSanctioned: 0, totalExpected: 0,
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
              <p className="text-white/80 text-xs sm:text-sm font-medium">{currentMonthData.label} Revenue Received</p>
              <h3 className="text-xl sm:text-3xl font-bold text-white mt-1 sm:mt-2">{formatCurrency(currentMonthData.totalRevenue)}</h3>
              <p className="text-white/60 text-xs mt-1">{formatCurrency(currentMonthData.totalRevenuePending)} pending</p>
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

          {/* ===== Manual Revenue Entry (Admin only) ===== */}
          {isAdmin && revenueEligibleLeads.length > 0 && (
            <div className="bg-white rounded-2xl sm:rounded-3xl shadow-xl p-4 sm:p-6 mb-6 sm:mb-8 border-2 border-emerald-100">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center">
                    <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-lg sm:text-xl font-bold text-gray-900">Manual Revenue Entry</h2>
                    <p className="text-xs text-gray-500">Set the revenue % (default 1%), and track how much has been received vs is still pending. The date received determines which month the revenue counts toward.</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowRevenueEditor(!showRevenueEditor)}
                  className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg hover:bg-emerald-100 transition-colors"
                >
                  {showRevenueEditor ? 'Hide Editor' : 'Edit Revenue'}
                </button>
              </div>

              {showRevenueEditor && (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs sm:text-sm">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-2.5 px-2 font-semibold text-gray-500 uppercase tracking-wider">Customer</th>
                        <th className="text-left py-2.5 px-2 font-semibold text-gray-500 uppercase tracking-wider">Mobile</th>
                        <th className="text-left py-2.5 px-2 font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                        <th className="text-right py-2.5 px-2 font-semibold text-gray-500 uppercase tracking-wider">Disbursed</th>
                        <th className="text-right py-2.5 px-2 font-semibold text-gray-500 uppercase tracking-wider">Total Revenue</th>
                        <th className="text-right py-2.5 px-2 font-semibold text-gray-500 uppercase tracking-wider">Revenue %</th>
                        <th className="text-right py-2.5 px-2 font-semibold text-gray-500 uppercase tracking-wider">Revenue Received (₹)</th>
                        <th className="text-right py-2.5 px-2 font-semibold text-gray-500 uppercase tracking-wider">Revenue Pending (₹)</th>
                        <th className="text-center py-2.5 px-2 font-semibold text-gray-500 uppercase tracking-wider">Date Received</th>
                        <th className="text-center py-2.5 px-2 font-semibold text-gray-500 uppercase tracking-wider">Save</th>
                      </tr>
                    </thead>
                    <tbody>
                      {revenueEligibleLeads.map(l => {
                        const current = calcLeadRevenue(l);
                        const draft = getRevenueDraft(l);
                        const hasManualSplit = (l.revenueReceived !== null && l.revenueReceived !== undefined && l.revenueReceived !== '')
                          || (l.revenuePending !== null && l.revenuePending !== undefined && l.revenuePending !== '');
                        return (
                          <tr key={l.id} className="border-b border-gray-100 hover:bg-gray-50/60 transition-colors">
                            <td className="py-2.5 px-2 font-semibold text-gray-800 whitespace-nowrap">{l.customerName || '—'}</td>
                            <td className="py-2.5 px-2 text-gray-600">{l.mobile || '—'}</td>
                            <td className="py-2.5 px-2">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                l.status === 'Disbursed' ? 'bg-purple-50 text-purple-700' : l.status === 'Partially Disbursed' ? 'bg-teal-50 text-teal-700' : 'bg-green-50 text-green-700'
                              }`}>
                                {l.status || '—'}
                              </span>
                            </td>
                            <td className="py-2.5 px-2 text-right font-semibold text-blue-600 whitespace-nowrap">
                              {formatCurrency(parseFloat(l.disbursedAmount || l.sanctionedAmount || 0))}
                            </td>
                            <td className="py-2.5 px-2 text-right font-bold whitespace-nowrap">
                              <span className={hasManualSplit ? 'text-emerald-600' : 'text-gray-400'}>
                                {formatCurrency(current)}
                                {hasManualSplit && <span className="ml-1 text-[9px] text-emerald-500 uppercase">manual</span>}
                              </span>
                            </td>
                            <td className="py-2.5 px-2 text-right">
                              <input
                                type="number"
                                value={draft.percent}
                                onChange={(e) => setRevenueDraftField(l.id, l, 'percent', e.target.value)}
                                placeholder="1"
                                step="0.1"
                                className="w-16 text-right border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white focus:ring-2 focus:ring-emerald-500 outline-none"
                              />
                            </td>
                            <td className="py-2.5 px-2 text-right">
                              <input
                                type="number"
                                value={draft.received}
                                onChange={(e) => setRevenueDraftField(l.id, l, 'received', e.target.value)}
                                placeholder="0"
                                className="w-28 text-right border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white focus:ring-2 focus:ring-emerald-500 outline-none"
                              />
                            </td>
                            <td className="py-2.5 px-2 text-right">
                              <input
                                type="number"
                                value={draft.pending}
                                onChange={(e) => setRevenueDraftField(l.id, l, 'pending', e.target.value)}
                                placeholder="0"
                                className="w-28 text-right border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white focus:ring-2 focus:ring-emerald-500 outline-none"
                              />
                            </td>
                            <td className="py-2.5 px-2 text-center">
                              <input
                                type="date"
                                value={draft.receivedDate}
                                onChange={(e) => setRevenueDraftField(l.id, l, 'receivedDate', e.target.value)}
                                className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white focus:ring-2 focus:ring-emerald-500 outline-none"
                              />
                            </td>
                            <td className="py-2.5 px-2 text-center">
                              <button
                                onClick={() => handleSaveRevenue(l)}
                                disabled={savingRevenueId === l.id}
                                className="px-3 py-1.5 text-xs font-semibold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50"
                              >
                                {savingRevenueId === l.id ? 'Saving...' : 'Save'}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <p className="text-[10px] text-gray-400 mt-3">
                    Revenue % defaults to 1% of the disbursed amount when Revenue Received/Pending are left blank. The Date Received determines which month the received amount is counted toward in the breakdown below — leave it blank to use the lead's entry month.
                  </p>
                </div>
              )}
            </div>
          )}

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
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 sm:gap-6">
              <div className="sm:border-r sm:border-gray-700 sm:pr-6">
                <p className="text-gray-400 text-xs sm:text-sm">Total Revenue Received</p>
                <p className="text-xl sm:text-2xl font-bold mt-1 text-emerald-400">{formatCurrency(overall.totalRevenue)}</p>
              </div>
              <div className="sm:border-r sm:border-gray-700 sm:pr-6">
                <p className="text-gray-400 text-xs sm:text-sm">Total Revenue Pending</p>
                <p className="text-xl sm:text-2xl font-bold mt-1 text-orange-400">{formatCurrency(overall.totalRevenuePending)}</p>
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
