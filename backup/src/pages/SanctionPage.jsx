import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

const API_BASE = 'http://localhost:3001/api';

export default function SanctionPage() {
  const { accessToken } = useAuth();
  const [formData, setFormData] = useState({ customerName: '', sanctionedAmount: '', interestRate: '', loanTenure: '' });
  const [revenueData, setRevenueData] = useState({ sanctionedAmount: 4700000, bankPayout: 0.6, incentive: 4000 });
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const handleSanction = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/sanctions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(formData),
      });
      const data = await res.json();
      setMessage(`Sanction created! ID: ${data.id}`);
    } catch {
      setMessage('Failed to create sanction');
    } finally {
      setLoading(false);
    }
  };

  const handleRevenueCalc = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/revenue/calculate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ sanctionedAmount: revenueData.sanctionedAmount, bankPayoutPercent: revenueData.bankPayout, executiveIncentive: revenueData.incentive }),
      });
      const data = await res.json();
      setResult(data);
    } catch {
      console.error('Calc failed');
    } finally {
      setLoading(false);
    }
  };

  const grossRevenue = revenueData.sanctionedAmount * (revenueData.bankPayout / 100);
  const netProfit = grossRevenue - (revenueData.incentive || 0);

  return (
    <div className="py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Sanction & Revenue Management</h1>
        <p className="text-gray-500">Track sanctioned cases, disbursements, and payouts.</p>
      </div>

      {message && <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded-2xl mb-6">{message}</div>}

      <div className="grid lg:grid-cols-2 gap-8">
        {/* Sanction Form */}
        <div className="bg-green-50 border border-green-200 rounded-3xl p-8">
          <h3 className="text-xl font-bold text-green-700 mb-4">Create Sanction</h3>
          <form onSubmit={handleSanction}>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <input type="text" placeholder="Customer Name" className="border rounded-xl px-4 py-3" value={formData.customerName} onChange={(e) => setFormData(p => ({...p, customerName: e.target.value}))} />
              <input type="text" placeholder="Sanctioned Amount" className="border rounded-xl px-4 py-3" value={formData.sanctionedAmount} onChange={(e) => setFormData(p => ({...p, sanctionedAmount: e.target.value}))} />
              <input type="text" placeholder="Interest Rate" className="border rounded-xl px-4 py-3" value={formData.interestRate} onChange={(e) => setFormData(p => ({...p, interestRate: e.target.value}))} />
              <input type="text" placeholder="Loan Tenure" className="border rounded-xl px-4 py-3" value={formData.loanTenure} onChange={(e) => setFormData(p => ({...p, loanTenure: e.target.value}))} />
            </div>
            <button type="submit" disabled={loading} className="bg-green-700 text-white px-6 py-3 rounded-xl font-semibold disabled:opacity-50">
              {loading ? 'Saving...' : 'Save Sanction'}
            </button>
          </form>
        </div>

        {/* Revenue Calculator */}
        <div className="bg-purple-50 border border-purple-200 rounded-3xl p-8">
          <h3 className="text-xl font-bold text-purple-700 mb-4">Revenue Calculator</h3>
          <div className="space-y-4 mb-4">
            <div className="flex justify-between bg-white rounded-xl px-5 py-3 border">
              <span>Gross Revenue</span><span className="font-bold">₹{grossRevenue.toLocaleString()}</span>
            </div>
            <div className="flex justify-between bg-white rounded-xl px-5 py-3 border">
              <span>Net Profit</span><span className="font-bold text-green-700">₹{netProfit.toLocaleString()}</span>
            </div>
          </div>
          <button onClick={handleRevenueCalc} disabled={loading} className="w-full bg-purple-700 text-white py-3 rounded-xl font-semibold disabled:opacity-50">
            Calculate
          </button>
        </div>
      </div>
    </div>
  );
}
