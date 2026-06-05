import React, { useState, useEffect } from 'react';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, LineElement, PointElement, Title, Filler } from 'chart.js';
import { Doughnut, Bar, Line } from 'react-chartjs-2';
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
  if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(2)}Cr`;
  if (amount >= 100000) return `₹${(amount / 100000).toFixed(1)}L`;
  return `₹${amount.toLocaleString('en-IN')}`;
};

// Short month label formatter
const formatMonth = (monthKey) => {
  const [y, m] = monthKey.split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[parseInt(m, 10) - 1]} ${y.slice(2)}`;
};

export default function DashboardCharts() {
  const { accessToken } = useAuth();
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
          label: 'Sanctioned (₹K)',
          data: sanctioned,
          backgroundColor: bgColors.map(c => c.replace(')', ', 0.15)').replace('rgb', 'rgba')),
          borderRadius: 6,
          borderSkipped: false,
          order: 2
        }
      ]
    };
  }

  // Build monthly trend line chart with amounts
  let trendChartData = null;
  if (monthlyTrend && monthlyTrend.length > 0) {
    const labels = monthlyTrend.map(d => formatMonth(d.month));
    const counts = monthlyTrend.map(d => d.count);
    const expected = monthlyTrend.map(d => Math.round((d.totalExpected || 0) / 10000) / 10); // in lakhs (1dp)
    const sanctioned = monthlyTrend.map(d => Math.round((d.totalSanctioned || 0) / 10000) / 10);
    const disbursed = monthlyTrend.map(d => Math.round((d.totalDisbursed || 0) / 10000) / 10);

    trendChartData = {
      labels,
      datasets: [
        {
          label: 'Leads',
          data: counts,
          borderColor: '#6366F1',
          backgroundColor: 'rgba(99, 102, 241, 0.08)',
          fill: true,
          tension: 0.4,
          pointBackgroundColor: '#6366F1',
          pointBorderColor: '#fff',
          pointBorderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 7,
          borderWidth: 3,
          yAxisID: 'y'
        },
        {
          label: 'Expected (₹L)',
          data: expected,
          borderColor: '#F59E0B',
          backgroundColor: 'rgba(245, 158, 11, 0.08)',
          fill: false,
          tension: 0.4,
          borderDash: [6, 3],
          pointBackgroundColor: '#F59E0B',
          pointBorderColor: '#fff',
          pointBorderWidth: 2,
          pointRadius: 3,
          pointHoverRadius: 6,
          borderWidth: 2,
          yAxisID: 'y1'
        },
        {
          label: 'Sanctioned (₹L)',
          data: sanctioned,
          borderColor: '#10B981',
          backgroundColor: 'rgba(16, 185, 129, 0.08)',
          fill: false,
          tension: 0.4,
          pointBackgroundColor: '#10B981',
          pointBorderColor: '#fff',
          pointBorderWidth: 2,
          pointRadius: 3,
          pointHoverRadius: 6,
          borderWidth: 2,
          yAxisID: 'y1'
        },
        {
          label: 'Disbursed (₹L)',
          data: disbursed,
          borderColor: '#8B5CF6',
          backgroundColor: 'rgba(139, 92, 246, 0.08)',
          fill: false,
          tension: 0.4,
          borderDash: [3, 3],
          pointBackgroundColor: '#8B5CF6',
          pointBorderColor: '#fff',
          pointBorderWidth: 2,
          pointRadius: 3,
          pointHoverRadius: 6,
          borderWidth: 2,
          yAxisID: 'y1'
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
            if (context.dataset.label === 'Sanctioned (₹K)') return ` Sanctioned: ${formatCurrency(d.totalSanctioned || 0)}`;
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

  const lineOptions = {
    maintainAspectRatio: false,
    responsive: true,
    interaction: { intersect: false, mode: 'index' },
    plugins: {
      tooltip: {
        callbacks: {
          label: function(context) {
            const val = context.parsed[context.dataset.yAxisID === 'y1' ? 'y1' : 'y'];
            const label = context.dataset.label || '';
            if (label.includes('₹L')) return ` ${label}: ₹${val.toFixed(1)}L`;
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
        ticks: { font: { size: 10 }, callback: function(value) { return '₹' + value.toFixed(1) + 'L'; } },
        title: { display: true, text: 'Amount (₹ Lakhs)', font: { size: 10 } }
      }
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6 mt-6 sm:mt-8">
      {/* Top row: 2 charts side by side */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
        <div className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-lg">
          <h3 className="text-base sm:text-lg font-bold text-gray-800 mb-4">Lead Status Distribution</h3>
          {statusChartData ? (
            <div className="h-48 sm:h-64">
              <Doughnut data={statusChartData} options={{ maintainAspectRatio: false, responsive: true, plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, padding: 12, font: { size: 10 } } } } }} />
            </div>
          ) : (
            <div className="h-48 sm:h-64 flex items-center justify-center text-gray-400 text-sm">No data</div>
          )}
        </div>
        <div className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-lg">
          <h3 className="text-base sm:text-lg font-bold text-gray-800 mb-4">Leads by Loan Type</h3>
          {loanTypeChartData ? (
            <div className="h-48 sm:h-64">
              <Bar data={loanTypeChartData} options={barOptions} />
            </div>
          ) : (
            <div className="h-48 sm:h-64 flex items-center justify-center text-gray-400 text-sm">No loan type data available</div>
          )}
        </div>
      </div>

      {/* Bottom row: Monthly Trend full width */}
      <div className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-lg">
        <h3 className="text-base sm:text-lg font-bold text-gray-800 mb-4">📈 Monthly Lead Trend</h3>
        {trendChartData ? (
          <div className="h-48 sm:h-64">
            <Line data={trendChartData} options={lineOptions} />
          </div>
        ) : (
          <div className="h-48 sm:h-64 flex items-center justify-center text-gray-400 text-sm">No trend data available</div>
        )}
      </div>
    </div>
  );
}
