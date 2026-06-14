import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, LineElement, PointElement, Title, Filler, LineController } from 'chart.js';
import { Doughnut } from 'react-chartjs-2';
import { useAuth } from '../../contexts/AuthContext';
import API_BASE from '../../config/api';

ChartJS.register(ArcElement, Tooltip, Legend);

// Format currency in Indian format
const formatCurrency = (amount) => {
  const num = Number(amount) || 0;
  if (num >= 10000000) return `\u20B9${(num / 10000000).toFixed(2)}Cr`;
  if (num >= 100000) return `\u20B9${(num / 100000).toFixed(1)}L`;
  return `\u20B9${num.toLocaleString('en-IN')}`;
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

export default function DashboardCharts({ filterYear: externalYear, filterMonth: externalMonth, filterActive: externalActive }) {
  const { accessToken, refreshAccessToken } = useAuth();
  const statusChartRef = useRef(null);
  const [allLeads, setAllLeads] = useState([]);
  const [loanTypeData, setLoanTypeData] = useState(null);
  const [selectedLoanType, setSelectedLoanType] = useState('');
  const [loading, setLoading] = useState(true);

  // Use external filters from DashboardPage if provided, otherwise fall back to internal state
  const now = new Date();
  const [internalYear, setInternalYear] = useState(String(now.getFullYear()));
  const [internalMonth, setInternalMonth] = useState(String(now.getMonth() + 1).padStart(2, '0'));
  const [internalActive, setInternalActive] = useState('active');

  const filterYear = externalYear || internalYear;
  const filterMonth = externalMonth || internalMonth;
  const filterActive = externalActive || internalActive;
  const setFilterYear = externalYear ? () => {} : setInternalYear;
  const setFilterMonth = externalMonth ? () => {} : setInternalMonth;
  const setFilterActive = externalActive ? () => {} : setInternalActive;

  // Available years/months from data
  const periods = new Map(); // "YYYY-MM" → { year, month, label, count }
  allLeads.forEach(l => {
    const key = getPeriodKey(l.entryDate || l.createdAt);
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
    const key = getPeriodKey(l.entryDate || l.createdAt);
    if (!key) return false;
    if (key !== `${filterYear}-${filterMonth}`) return false;
    if (filterActive === 'active') return l.isActive !== false;
    if (filterActive === 'inactive') return l.isActive === false;
    if (filterActive === 'closed') return l.isClosed === true;
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
      const [leadsData, loanType] = await Promise.all([
        fetchWithAuth(`${API_BASE}/leads`).then(r => r.data || r || []),
        fetchWithAuth(`${API_BASE}/leads/stats/loan-type-distribution`),
      ]);
      // leadsData might be { data: [...] } from the API
      const leads = Array.isArray(leadsData) ? leadsData : (leadsData.data || []);
      setAllLeads(leads);
      setLoanTypeData(loanType);
    } catch (err) {
      if (err?.status === 401) {
        const refreshed = await refreshAccessToken();
        if (refreshed) {
          const token = localStorage.getItem('instafin_token');
          if (token) {
            try {
              const [leadsRes, loanType] = await Promise.all([
                fetch(`${API_BASE}/leads`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
                fetch(`${API_BASE}/leads/stats/loan-type-distribution`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
              ]);
              const leads = Array.isArray(leadsRes) ? leadsRes : (leadsRes.data || []);
              setAllLeads(leads);
              setLoanTypeData(loanType);
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
    </div>
  );
}
