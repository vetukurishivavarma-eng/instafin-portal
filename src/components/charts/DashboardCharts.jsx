import React, { useState, useEffect } from 'react';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, LineElement, PointElement, Title } from 'chart.js';
import { Doughnut, Bar } from 'react-chartjs-2';
import { useAuth } from '../../contexts/AuthContext';
import API_BASE from '../../config/api';

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, LineElement, PointElement, Title);

// Format a loan_type key to a display label
const formatLoanType = (key) => {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
};

// Color palette for loan type bars
const LOAN_TYPE_COLORS = [
  '#6366F1', // indigo
  '#F59E0B', // amber
  '#10B981', // emerald
  '#EF4444', // red
  '#8B5CF6', // violet
  '#EC4899', // pink
  '#06B6D4', // cyan
  '#F97316', // orange
  '#14B8A6', // teal
  '#84CC16', // lime
];

// Format currency in Indian format
const formatCurrency = (amount) => {
  if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(2)}Cr`;
  if (amount >= 100000) return `₹${(amount / 100000).toFixed(1)}L`;
  return `₹${amount.toLocaleString('en-IN')}`;
};

export default function DashboardCharts() {
  const { accessToken } = useAuth();
  const [statusData, setStatusData] = useState(null);
  const [loanTypeData, setLoanTypeData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!accessToken) return;
    Promise.all([
      fetch(`${API_BASE}/leads/stats/status-distribution`, { headers: { Authorization: `Bearer ${accessToken}` } }).then(r => r.json()),
      fetch(`${API_BASE}/leads/stats/loan-type-distribution`, { headers: { Authorization: `Bearer ${accessToken}` } }).then(r => r.json())
    ]).then(([status, loanType]) => {
      setStatusData(status);
      setLoanTypeData(loanType);
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
    const sanctioned = labels.map(k => Math.round((loanTypeData[k].totalSanctioned || 0) / 1000)); // in thousands for scale
    const bgColors = labels.map((_, i) => LOAN_TYPE_COLORS[i % LOAN_TYPE_COLORS.length]);

    // Custom tooltip that shows amounts
    const customTooltip = {
      callbacks: {
        label: function(context) {
          const index = context.dataIndex;
          const key = labels[index];
          const d = loanTypeData[key];
          const lines = [];
          lines.push(`Leads: ${d.count || 0}`);
          if (d.totalSanctioned > 0) lines.push(`Sanctioned: ${formatCurrency(d.totalSanctioned)}`);
          if (d.totalDisbursed > 0) lines.push(`Disbursed: ${formatCurrency(d.totalDisbursed)}`);
          return lines;
        }
      }
    };

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

  const barOptions = {
    maintainAspectRatio: false,
    responsive: true,
    interaction: {
      intersect: false,
      mode: 'index'
    },
    plugins: {
      tooltip: {
        callbacks: {
          label: function(context) {
            const index = context.dataIndex;
            const key = Object.keys(loanTypeData || {})[index];
            if (!key) return '';
            const d = loanTypeData[key];
            if (context.dataset.label === 'Leads') {
              return ` Leads: ${d.count || 0}`;
            }
            if (context.dataset.label === 'Sanctioned (₹K)') {
              const amt = d.totalSanctioned || 0;
              return ` Sanctioned: ${formatCurrency(amt)}`;
            }
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
      legend: {
        display: true,
        position: 'bottom',
        labels: {
          usePointStyle: true,
          padding: 16,
          font: { size: 11 }
        }
      }
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { font: { size: 10 } }
      },
      y: {
        beginAtZero: true,
        grid: { color: 'rgba(0,0,0,0.05)' },
        ticks: {
          font: { size: 10 },
          precision: 0
        }
      }
    }
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 mt-6 sm:mt-8">
      <div className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-lg">
        <h3 className="text-base sm:text-lg font-bold text-gray-800 mb-4">Lead Status Distribution</h3>
        {statusChartData && (
          <div className="h-48 sm:h-64">
            <Doughnut data={statusChartData} options={{ maintainAspectRatio: false, responsive: true, plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, padding: 12, font: { size: 10 } } } } }} />
          </div>
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
  );
}