import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, LineElement, PointElement, Title, Filler, LineController } from 'chart.js';
import { Doughnut, Bar } from 'react-chartjs-2';
import { useAuth } from '../../contexts/AuthContext';
import API_BASE from '../../config/api';

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, LineElement, PointElement, Title, Filler, LineController);

// Format currency in Indian format
const formatCurrency = (amount) => {
  const num = Number(amount) || 0;
  if (num >= 10000000) return `\u20B9${(num / 10000000).toFixed(2)}Cr`;
  if (num >= 100000) return `\u20B9${(num / 100000).toFixed(1)}L`;
  return `\u20B9${num.toLocaleString('en-IN')}`;
};

// Short month label formatter
const formatMonth = (monthKey) => {
  if (!monthKey || !monthKey.includes('-')) return monthKey || '';
  const [y, m] = monthKey.split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthIndex = parseInt(m, 10) - 1;
  if (monthIndex < 0 || monthIndex > 11 || !y) return monthKey;
  return `${months[monthIndex]} ${y.slice(2)}`;
};

// Download chart as PNG
function downloadChart(chartRef, filename) {
  const chart = chartRef.current;
  if (!chart) return;
  const origRatio = chart.options.devicePixelRatio;
  chart.options.devicePixelRatio = 2;
  chart.update();
  const link = document.createElement('a');
  link.download = `${filename}.png`;
  link.href = chart.toBase64Image('image/png', 1);
  link.click();
  chart.options.devicePixelRatio = origRatio || 1;
  chart.update();
}

// Loan type icon based on name
const getLoanTypeIcon = (name) => {
  const lower = name.toLowerCase();
  if (lower.includes('home')) return '🏠';
  if (lower.includes('lap') || lower.includes('property')) return '🏢';
  if (lower.includes('msme') || lower.includes('sme') || lower.includes('business')) return '💼';
  if (lower.includes('personal')) return '👤';
  if (lower.includes('mudra')) return '💰';
  if (lower.includes('education')) return '🎓';
  return '📋';
};

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const STATUS_COLORS = ['#FBBF24', '#3B82F6', '#10B981', '#8B5CF6', '#EC4899', '#14B8A6', '#EF4444'];

// Helper: extract YYYY-MM from a date string
function getPeriodKey(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function DashboardCharts() {
  const { accessToken, refreshAccessToken } = useAuth();
  const statusChartRef = useRef(null);
  const trendChartRef = useRef(null);
  const [allLeads, setAllLeads] = useState([]);
  const [loanTypeData, setLoanTypeData] = useState(null);
  const [monthlyTrend, setMonthlyTrend] = useState(null);
  const [selectedLoanType, setSelectedLoanType] = useState('');
  const [loading, setLoading] = useState(true);

  // Filters
  const now = new Date();
  const [filterYear, setFilterYear] = useState(String(now.getFullYear()));
  const [filterMonth, setFilterMonth] = useState(String(now.getMonth() + 1).padStart(2, '0'));
  const [filterActive, setFilterActive] = useState('active'); // 'active' | 'inactive' | 'all'

  // Available years/months from data
  const periods = new Map(); // "YYYY-MM" → { year, month, label, count }
  allLeads.forEach(l => {
    const key = getPeriodKey(l.createdAt || l.entryDate);
    if (key) {
      if (!periods.has(key)) {
        const [y, m] = key.split('-');
        periods.set(key, { year: y, month: m, label: `${MONTH_NAMES[parseInt(m) - 1]} ${y}`, count: 0 });
      }
      periods.get(key).count++;
    }
  });

  // Filter leads by year + month + active/inactive
  const filteredLeads = allLeads.filter(l => {
    const key = getPeriodKey(l.createdAt || l.entryDate);
    if (!key) return false;
    if (key !== `${filterYear}-${filterMonth}`) return false;
    if (filterActive === 'active') return l.isActive !== false;
    if (filterActive === 'inactive') return l.isActive === false;
    return true; // 'all'
  });

  // Compute loan type distribution from filtered leads
  const filteredLoanTypeMap = {};
  filteredLeads.forEach(l => {
    const type = (l.loanType || 'Unknown').trim();
    if (!filteredLoanTypeMap[type]) {
      filteredLoanTypeMap[type] = { count: 0, totalSanctioned: 0, totalDisbursed: 0 };
    }
    filteredLoanTypeMap[type].count++;
    filteredLoanTypeMap[type].totalSanctioned += Number(l.sanctionedAmount) || 0;
    filteredLoanTypeMap[type].totalDisbursed += Number(l.disbursedAmount) || 0;
  });

  // Compute status distribution from filtered leads
  const filteredStatusMap = {};
  filteredLeads.forEach(l => {
    const s = l.status || 'Unknown';
    filteredStatusMap[s] = (filteredStatusMap[s] || 0) + 1;
  });

  const fetchChartData = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);

    const fetchWithAuth = (url) =>
      fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } }).then(r => {
        if (r.status === 401) throw { status: 401 };
        return r.json();
      });

    try {
      const [leadsData, loanType, trend] = await Promise.all([
        fetchWithAuth(`${API_BASE}/leads`).then(r => r.data || r || []),
        fetchWithAuth(`${API_BASE}/leads/stats/loan-type-distribution`),
        fetchWithAuth(`${API_BASE}/leads/stats/monthly-trend`),
      ]);
      // leadsData might be { data: [...] } from the API
      const leads = Array.isArray(leadsData) ? leadsData : (leadsData.data || []);
      setAllLeads(leads);
      setLoanTypeData(loanType);
      setMonthlyTrend(trend);
    } catch (err) {
      if (err?.status === 401) {
        const refreshed = await refreshAccessToken();
        if (refreshed) {
          const token = localStorage.getItem('instafin_token');
          if (token) {
            try {
              const [leadsRes, loanType, trend] = await Promise.all([
                fetch(`${API_BASE}/leads`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
                fetch(`${API_BASE}/leads/stats/loan-type-distribution`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
                fetch(`${API_BASE}/leads/stats/monthly-trend`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
              ]);
              const leads = Array.isArray(leadsRes) ? leadsRes : (leadsRes.data || []);
              setAllLeads(leads);
              setLoanTypeData(loanType);
              setMonthlyTrend(trend);
            } catch {}
          }
        }
      }
    } finally {
      setLoading(false);
    }
  }, [accessToken, refreshAccessToken]);

  useEffect(() => {
    fetchChartData();
  }, [fetchChartData]);

  // Available years (sorted desc) and months for dropdowns
  const availableYears = [...new Set([...periods.keys()].map(k => k.split('-')[0]))].sort().reverse();
  const availableMonthsForYear = [...periods.keys()]
    .filter(k => k.startsWith(filterYear))
    .map(k => k.split('-')[1])
    .sort();

  const handleDownloadStatus = useCallback(() => {
    downloadChart(statusChartRef, 'lead-status-distribution');
  }, []);

  const handleDownloadTrend = useCallback(() => {
    downloadChart(trendChartRef, 'monthly-leads-trend');
  }, []);

  if (loading) return <div className="text-center py-8">Loading charts...</div>;

  const statusChartData = Object.keys(filteredStatusMap).length > 0 ? {
    labels: Object.keys(filteredStatusMap),
    datasets: [{
      data: Object.values(filteredStatusMap),
      backgroundColor: ['#FBBF24', '#3B82F6', '#10B981', '#8B5CF6', '#EC4899', '#14B8A6', '#EF4444'],
      borderWidth: 0
    }]
  } : null;

  // Build loan type entries sorted by count descending
  const loanTypeEntries = Object.entries(filteredLoanTypeMap).sort((a, b) => b[1].count - a[1].count);
  const totalLeads = loanTypeEntries.reduce((sum, [, d]) => sum + d.count, 0);

  // Selected loan type details
  const selectedDetail = selectedLoanType && filteredLoanTypeMap[selectedLoanType] ? filteredLoanTypeMap[selectedLoanType] : null;

  // Build monthly trend combo chart: bars for leads, lines for amounts
  let trendChartData = null;
  if (monthlyTrend && monthlyTrend.length > 0) {
    const labels = monthlyTrend.map(d => formatMonth(d.month));
    const counts = monthlyTrend.map(d => d.count);
    const expected = monthlyTrend.map(d => Math.round((d.totalExpected || 0) / 10000) / 10);
    const sanctioned = monthlyTrend.map(d => Math.round((d.totalSanctioned || 0) / 10000) / 10);
    const disbursed = monthlyTrend.map(d => Math.round((d.totalDisbursed || 0) / 10000) / 10);

    trendChartData = {
      labels,
      datasets: [
        {
          type: 'bar',
          label: 'Leads',
          data: counts,
          backgroundColor: 'rgba(99, 102, 241, 0.85)',
          borderRadius: 8,
          borderSkipped: false,
          yAxisID: 'y',
          order: 2
        },
        {
          type: 'line',
          label: 'Expected (\u20B9L)',
          data: expected,
          borderColor: '#F59E0B',
          backgroundColor: 'rgba(245, 158, 11, 0.08)',
          fill: true,
          tension: 0.3,
          borderDash: [6, 3],
          pointBackgroundColor: '#F59E0B',
          pointBorderColor: '#fff',
          pointBorderWidth: 2,
          pointRadius: 3,
          pointHoverRadius: 6,
          borderWidth: 2,
          yAxisID: 'y1',
          order: 1
        },
        {
          type: 'line',
          label: 'Sanctioned (\u20B9L)',
          data: sanctioned,
          borderColor: '#10B981',
          backgroundColor: 'rgba(16, 185, 129, 0.08)',
          fill: true,
          tension: 0.3,
          pointBackgroundColor: '#10B981',
          pointBorderColor: '#fff',
          pointBorderWidth: 2,
          pointRadius: 3,
          pointHoverRadius: 6,
          borderWidth: 2,
          yAxisID: 'y1',
          order: 1
        },
        {
          type: 'line',
          label: 'Disbursed (\u20B9L)',
          data: disbursed,
          borderColor: '#8B5CF6',
          backgroundColor: 'rgba(139, 92, 246, 0.08)',
          fill: true,
          tension: 0.3,
          borderDash: [3, 3],
          pointBackgroundColor: '#8B5CF6',
          pointBorderColor: '#fff',
          pointBorderWidth: 2,
          pointRadius: 3,
          pointHoverRadius: 6,
          borderWidth: 2,
          yAxisID: 'y1',
          order: 1
        }
      ]
    };
  }

  const trendOptions = {
    maintainAspectRatio: false,
    responsive: true,
    interaction: { intersect: false, mode: 'index' },
    plugins: {
      tooltip: {
        callbacks: {
          label: function(context) {
            const parsed = context.parsed || {};
            const key = context.dataset.yAxisID === 'y1' ? 'y1' : 'y';
            const val = parsed[key];
            if (val === undefined || val === null) return '';
            const label = context.dataset.label || '';
            if (label.includes('\u20B9L')) return ` ${label}: \u20B9${Number(val).toFixed(1)}L`;
            return ` ${label}: ${Number(val)}`;
          },
          afterBody: function(context) {
            const index = context[0]?.dataIndex;
            const d = monthlyTrend?.[index];
            if (!d) return [];
            const lines = [];
            if (d.totalExpected > 0) lines.push(`Expected: ${formatCurrency(d.totalExpected)}`);
            if (d.totalSanctioned > 0) lines.push(`Sanctioned: ${formatCurrency(d.totalSanctioned)}`);
            if (d.totalDisbursed > 0) lines.push(`Disbursed: ${formatCurrency(d.totalDisbursed)}`);
            return lines;
          }
        }
      },
      legend: {
        display: true,
        position: 'bottom',
        labels: { usePointStyle: true, padding: 12, font: { size: 10 } }
      }
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { font: { size: 9 }, maxRotation: 45, minRotation: 0 }
      },
      y: {
        type: 'linear',
        display: true,
        position: 'left',
        beginAtZero: true,
        grid: { color: 'rgba(0,0,0,0.05)' },
        ticks: { font: { size: 10 }, precision: 0, stepSize: 1 },
        title: { display: true, text: 'Leads', font: { size: 10 } }
      },
      y1: {
        type: 'linear',
        display: true,
        position: 'right',
        beginAtZero: true,
        grid: { drawOnChartArea: false },
        ticks: { font: { size: 10 }, callback: function(value) { const n = Number(value); return Number.isFinite(n) ? '\u20B9' + n.toFixed(1) + 'L' : ''; } },
        title: { display: true, text: 'Amount (\u20B9 Lakhs)', font: { size: 10 } }
      }
    }
  };

  // Shared download button styles
  const DownloadBtn = ({ onClick }) => (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-gray-500 hover:text-blue-700 bg-gray-50 hover:bg-blue-50 border border-gray-200 hover:border-blue-200 rounded-xl transition-all duration-200"
      title="Download as PNG"
    >
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
      </svg>
      Export
    </button>
  );

  return (
    <div className="space-y-4 sm:space-y-6 mt-6 sm:mt-8">
      {/* ===== Filter Bar: Month/Year + Active/Inactive ===== */}
      <div className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-lg">
        <div className="flex flex-wrap items-end gap-3 sm:gap-4">
          {/* Year selector */}
          <div className="flex-1 min-w-[100px]">
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1">Year</label>
            <select
              value={filterYear}
              onChange={e => {
                const newYear = e.target.value;
                setFilterYear(newYear);
                // Default to first available month in the new year
                const monthsForYear = [...periods.keys()]
                  .filter(k => k.startsWith(newYear))
                  .map(k => k.split('-')[1])
                  .sort();
                if (monthsForYear.length > 0) {
                  setFilterMonth(monthsForYear[0]);
                } else {
                  setFilterMonth('');
                }
              }}
              className="w-full bg-gray-50 border border-gray-200 text-gray-900 text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-all cursor-pointer"
            >
              {availableYears.map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
          {/* Month selector */}
          <div className="flex-1 min-w-[120px]">
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1">Month</label>
            <select
              value={filterMonth}
              onChange={e => setFilterMonth(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 text-gray-900 text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-all cursor-pointer"
            >
              {availableMonthsForYear.length > 0 ? (
                availableMonthsForYear.map(m => {
                  const key = `${filterYear}-${m}`;
                  const period = periods.get(key);
                  return (
                    <option key={m} value={m}>
                      {MONTH_NAMES[parseInt(m) - 1]} {period ? `(${period.count})` : ''}
                    </option>
                  );
                })
              ) : (
                <option value="">No data</option>
              )}
            </select>
          </div>
          {/* Active/Inactive filter */}
          <div className="flex-1 min-w-[120px]">
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1">Leads</label>
            <div className="flex bg-gray-100 rounded-xl p-0.5 gap-0.5">
              {[
                { value: 'active', label: 'Active' },
                { value: 'inactive', label: 'Inactive' },
                { value: 'all', label: 'All' },
              ].map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => setFilterActive(value)}
                  className={`flex-1 text-center text-xs font-semibold px-2 py-2 rounded-lg transition-all duration-150 ${
                    filterActive === value
                      ? 'bg-white text-indigo-700 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          {/* Lead count badge */}
          <div className="flex items-center gap-2 px-3 py-2 bg-indigo-50 rounded-xl">
            <span className="text-lg">{totalLeads}</span>
            <span className="text-[10px] font-medium uppercase tracking-wider text-indigo-600">
              {totalLeads === 1 ? 'Lead' : 'Leads'}
            </span>
          </div>
        </div>
      </div>

      {/* Top row: 2 cards side by side */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
        <div className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-lg">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base sm:text-lg font-bold text-gray-800 border-l-4 border-l-blue-500 pl-3">Lead Status Distribution</h3>
            {statusChartData && <DownloadBtn onClick={handleDownloadStatus} />}
          </div>
          {statusChartData ? (
            <div className="h-48 sm:h-64">
              <Doughnut ref={statusChartRef} data={statusChartData} options={{ maintainAspectRatio: false, responsive: true, plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, padding: 12, font: { size: 10 } } } } }} />
            </div>
          ) : (
            <div className="h-48 sm:h-64 flex items-center justify-center text-gray-400 text-sm">No data</div>
          )}
        </div>

        {/* Leads by Loan Type — Dropdown + Details */}
        <div className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-lg">
          <div className="mb-4">
            <h3 className="text-base sm:text-lg font-bold text-gray-800 border-l-4 border-l-indigo-500 pl-3">Leads by Loan Type</h3>
          </div>
          {loanTypeEntries.length > 0 ? (
            <div className="space-y-4">
              {/* Dropdown */}
              <div className="relative">
                <select
                  value={selectedLoanType}
                  onChange={(e) => setSelectedLoanType(e.target.value)}
                  className="w-full appearance-none bg-gray-50 border border-gray-200 text-gray-900 text-sm rounded-xl px-4 py-3 pr-10 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-all cursor-pointer"
                >
                  <option value="">— All Loan Types ({totalLeads} leads) —</option>
                  {loanTypeEntries.map(([name, data]) => (
                    <option key={name} value={name}>
                      {getLoanTypeIcon(name)} {name} — {data.count} {data.count === 1 ? 'lead' : 'leads'}
                    </option>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>

              {/* Selected detail panel */}
              {selectedDetail && (
                <div className="bg-gradient-to-br from-indigo-50 to-blue-50 rounded-xl p-4 space-y-3 animate-fade-in-up">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{getLoanTypeIcon(selectedLoanType)}</span>
                    <div>
                      <p className="text-sm font-bold text-gray-900">{selectedLoanType}</p>
                      <p className="text-xs text-gray-500">Loan type breakdown</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-white rounded-lg p-3 text-center">
                      <p className="text-2xl font-bold text-indigo-600">{selectedDetail.count}</p>
                      <p className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">Leads</p>
                    </div>
                    <div className="bg-white rounded-lg p-3 text-center">
                      <p className="text-sm font-bold text-emerald-600 truncate">{formatCurrency(selectedDetail.totalSanctioned)}</p>
                      <p className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">Sanctioned</p>
                    </div>
                    <div className="bg-white rounded-lg p-3 text-center">
                      <p className="text-sm font-bold text-purple-600 truncate">{formatCurrency(selectedDetail.totalDisbursed)}</p>
                      <p className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">Disbursed</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Compact summary list */}
              <div className="space-y-1">
                {loanTypeEntries.map(([name, data]) => {
                  const pct = totalLeads > 0 ? ((data.count / totalLeads) * 100).toFixed(1) : 0;
                  const isSelected = selectedLoanType === name;
                  return (
                    <button
                      key={name}
                      onClick={() => setSelectedLoanType(isSelected ? '' : name)}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs transition-all duration-150 text-left ${
                        isSelected
                          ? 'bg-indigo-100 text-indigo-900 shadow-sm'
                          : 'hover:bg-gray-100 text-gray-700'
                      }`}
                    >
                      <span className="text-base">{getLoanTypeIcon(name)}</span>
                      <span className="flex-1 font-semibold truncate">{name}</span>
                      <span className="font-bold text-gray-900">{data.count}</span>
                      <span className="text-gray-400 w-10 text-right">{pct}%</span>
                      {/* Mini bar */}
                      <div className="w-16 h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-indigo-500 to-blue-500 rounded-full transition-all"
                          style={{ width: `${Math.min(pct, 100)}%` }}
                        />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="h-48 flex items-center justify-center text-gray-400 text-sm">No loan type data available</div>
          )}
        </div>
      </div>

      {/* Bottom row: Monthly Trend full width - combo bar/line */}
      <div className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-lg">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base sm:text-lg font-bold text-gray-800 border-l-4 border-l-purple-500 pl-3">Monthly Leads Overview</h3>
          {trendChartData && <DownloadBtn onClick={handleDownloadTrend} />}
        </div>
        {trendChartData ? (
          <div className="h-48 sm:h-64">
            <Bar ref={trendChartRef} data={trendChartData} options={trendOptions} />
          </div>
        ) : (
          <div className="h-48 sm:h-64 flex items-center justify-center text-gray-400 text-sm">No trend data available</div>
        )}
      </div>
    </div>
  );
}
