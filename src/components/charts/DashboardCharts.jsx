import React, { useState, useEffect } from 'react';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, LineElement, PointElement, Title } from 'chart.js';
import { Doughnut, Bar, Line } from 'react-chartjs-2';
import { useAuth } from '../../contexts/AuthContext';
import API_BASE from '../../config/api';

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, LineElement, PointElement, Title);

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
      backgroundColor: ['#FBBF24', '#3B82F6', '#10B981', '#8B5CF6'],
      borderWidth: 0
    }]
  } : null;

  const loanTypeDataObj = loanTypeData ? {
    labels: Object.keys(loanTypeData),
    datasets: [{
      label: 'Leads',
      data: Object.values(loanTypeData),
      backgroundColor: '#6366F1',
      borderRadius: 8
    }]
  } : null;

  return (
    <div className="grid md:grid-cols-2 gap-6 mt-8">
      <div className="bg-white rounded-3xl p-6 shadow-lg">
        <h3 className="text-lg font-bold text-gray-800 mb-4">Lead Status Distribution</h3>
        {statusChartData && <div className="h-64"><Doughnut data={statusChartData} options={{ maintainAspectRatio: false }} /></div>}
      </div>
      <div className="bg-white rounded-3xl p-6 shadow-lg">
        <h3 className="text-lg font-bold text-gray-800 mb-4">Leads by Loan Type</h3>
        {loanTypeDataObj && <div className="h-64"><Bar data={loanTypeDataObj} options={{ maintainAspectRatio: false, responsive: true }} /></div>}
      </div>
    </div>
  );
}