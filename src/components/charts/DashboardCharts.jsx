import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, LineElement, PointElement, Title, Filler } from 'chart.js';
import { Doughnut, Bar } from 'react-chartjs-2';
import { useAuth } from '../../contexts/AuthContext';
import API_BASE from '../../config/api';

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, LineElement, PointElement, Title, Filler);

// Format a loan_type key to a display label
const formatLoanType = (key) => {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
};

// Color palette for loan type bars
const LOAN_TYPE_COLORS = [
  '#6366F1', '#F59E0B', '#10B981', '#EF4444', '#8B5CF6',
  '#EC4899', '#06B6D4', '#F97316', '#14B8A6', '#84CC16',
];

// Format currency in Indian format
const formatCurrency = (amount) => {
  if (amount >= 10000000) return `\u20B9${(amount / 10000000).toFixed(2)}Cr`;
  if (amount >= 100000) return `\u20B9${(amount / 100000).toFixed(1)}L`;
  return `\u20B9${amount.toLocaleString('en-IN')}`;
};

// Short month label formatter
const formatMonth = (monthKey) => {
  const [y, m] = monthKey.split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[parseInt(m, 10) - 1]} ${y.slice(2)}`;
};

// Download chart as PNG
function downloadChart(chartRef, filename) {
  const chart = chartRef.current;
  if (!chart) return;
  // Temporarily enable retina-quality export via devicePixelRatio
  const origRatio = chart.options.devicePixelRatio;
  chart.options.devicePixelRatio = 2;
  chart.update();
  const link = document.createElement('a');
  link.download = `${filename}.png`;
  link.href = chart.toBase64Image('image/png', 1);
  link.click();
  // Restore original resolution
  chart.options.devicePixelRatio = origRatio || 1;
  chart.update();
}

export default function DashboardCharts() {
  const { accessToken } = useAuth();
  const statusChartRef = useRef(null);
  const loanTypeChartRef = useRef(null);
  const trendChartRef = useRef(null);
  const [statusData, setStatusData] = useState(null);
  const [loanTypeData, setLoanTypeData] = useState(null);
  const [monthlyTrend, setMonthlyTrend] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!accessToken) return;
    setLoading(true);
    Promise.all([
      fetch(`${API_BASE}/leads/stats/status-distribution`, { headers: { Authorization: `Bearer ${accessToken}` } }).then(r => r.json()),
      fetch(`${API_BASE}/leads/stats/loan-type-distribution`, { headers: { Authorization: `Bearer ${accessToken}` } }).then(r => r.json()),
      fetch(`${API_BASE}/leads/stats/monthly-trend`, { headers: { Authorization: `Bearer ${accessToken}` } }).then(r => r.json())
    ]).then(([status, loanType, trend]) => {
      setStatusData(status);
      setLoanTypeData(loanType);
      setMonthlyTrend(trend);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [accessToken]);

  const handleDownloadStatus = useCallback(() => {
    downloadChart(statusChartRef, 'lead-status-distribution');
  }, []);

  const handleDownloadLoanType = useCallback(() => {
    downloadChart(loanTypeChartRef, 'leads-by-loan-type');
  }, []);

  const handleDownloadTrend = useCallback(() => {
    downloadChart(trendChartRef, 'monthly-leads-trend');
  }, []);

  if (loading) return <div className="text-center py-8">Loading charts...</div>;

  const statusChartData = statusData ? {
    labels: Object.keys(statusData),
    datasets: [{
      data: Object.values(statusData),
      backgroundColor: ['#FBBF24', '#3B82F6', '#10B981', '#8B5CF6', '#EC4899', '#14B8A6', '#EF4444'],
      borderWidth: 0
    }]
  } : null;

  // Build loan type chart data from the enhanced response format
  let loanTypeChartData = null;
  if (loanTypeData) {
    const labels = Object.keys(loanTypeData);
    const counts = labels.map(k => loanTypeData[k].count || 0);
    const sanctioned = labels.map(k => Math.round((loanTypeData[k].totalSanctioned || 0) / 1000));
    const bgColors = labels.map((_, i) => LOAN_TYPE_COLORS[i % LOAN_TYPE_COLORS.length]);

    loanTypeChartData = {
      labels: labels.map(formatLoanType),
      datasets: [
        {
          label: 'Leads',
          data: counts,
          backgroundColor: bgColors,
          borderRadius: 6,
          borderSkipped: false,
          order: 1
        },
        {
          label: 'Sanctioned (\u20B9K)',
          data: sanctioned,
          backgroundColor: bgColors.map(c => c.replace(')', ', 0.15)').replace('rgb', 'rgba')),
          borderRadius: 6,
          borderSkipped: false,
          order: 2
        }
      ]
    };
  }

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

  const barOptions = {
    maintainAspectRatio: false,
    responsive: true,
    interaction: { intersect: false, mode: 'index' },
    plugins: {
      tooltip: {
        callbacks: {
          label: function(context) {
            const index = context.dataIndex;
            const key = Object.keys(loanTypeData || {})[index];
            if (!key) return '';
            const d = loanTypeData[key];
            if (context.dataset.label === 'Leads') return ` Leads: ${d.count || 0}`;
            if (context.dataset.label === 'Sanctioned (\u20B9K)') return ` Sanctioned: ${formatCurrency(d.totalSanctioned || 0)}`;
            return '';
          },
          afterBody: function(context) {
            const index = context[0]?.dataIndex;
            const key = Object.keys(loanTypeData || {})[index];
            if (!key) return '';
            const d = loanTypeData[key];
            return d.totalDisbursed > 0 ? [`Disbursed: ${formatCurrency(d.totalDisbursed)}`] : [];
          }
        }
      },
      legend: { display: true, position: 'bottom', labels: { usePointStyle: true, padding: 16, font: { size: 11 } } }
    },
    scales: {
      x: { grid: { display: false }, ticks: { font: { size: 10 } } },
      y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { font: { size: 10 }, precision: 0 } }
    }
  };

  const trendOptions = {
    maintainAspectRatio: false,
    responsive: true,
    interaction: { intersect: false, mode: 'index' },
    plugins: {
      tooltip: {
        callbacks: {
          label: function(context) {
            const val = context.parsed[context.dataset.yAxisID === 'y1' ? 'y1' : 'y'];
            const label = context.dataset.label || '';
            if (label.includes('\u20B9L')) return ` ${label}: \u20B9${val.toFixed(1)}L`;
            return ` ${label}: ${val}`;
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
        ticks: { font: { size: 10 }, callback: function(value) { return '\u20B9' + value.toFixed(1) + 'L'; } },
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
      {/* Top row: 2 charts side by side */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
        <div className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-lg">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base sm:text-lg font-bold text-gray-800">Lead Status Distribution</h3>
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
        <div className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-lg">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base sm:text-lg font-bold text-gray-800">Leads by Loan Type</h3>
            {loanTypeChartData && <DownloadBtn onClick={handleDownloadLoanType} />}
          </div>
          {loanTypeChartData ? (
            <div className="h-48 sm:h-64">
              <Bar ref={loanTypeChartRef} data={loanTypeChartData} options={barOptions} />
            </div>
          ) : (
            <div className="h-48 sm:h-64 flex items-center justify-center text-gray-400 text-sm">No loan type data available</div>
          )}
        </div>
      </div>

      {/* Bottom row: Monthly Trend full width - combo bar/line */}
      <div className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-lg">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base sm:text-lg font-bold text-gray-800">\uD83D\uDCCA Monthly Leads Overview</h3>
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
