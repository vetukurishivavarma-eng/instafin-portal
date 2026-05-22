import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

const API_BASE = 'http://localhost:3001/api';

export default function EligibilityPage() {
  const { accessToken } = useAuth();
  const [formData, setFormData] = useState({
    monthlyGrossSalary: '',
    yearlyIncome: '',
    interestRate: '8.5',
    loanTenure: '20',
    propertyValue: ''
  });
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [calcType, setCalcType] = useState('salaried');

  const handleCalculate = async () => {
    setLoading(true);
    try {
      const endpoint = calcType === 'salaried' ? 'eligibility/salaried' : 'eligibility/non-salaried';
      const res = await fetch(`${API_BASE}/calculator/${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(formData),
      });
      const data = await res.json();
      setResult(data);
    } catch (err) {
      console.error('Calc failed:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">EMI & Eligibility Calculator</h1>
        <p className="text-gray-500">Calculate loan eligibility for Home Loan, LAP, and Personal Loan.</p>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {['Home Loan', 'LAP', 'Personal Loan'].map((loanType, i) => (
          <div key={i} className="bg-white rounded-3xl shadow-xl p-6">
            <h3 className="text-xl font-bold text-blue-700 mb-4">{loanType} Calculator</h3>

            <div className="flex gap-2 mb-4">
              <button onClick={() => setCalcType('salaried')} className={`px-3 py-1 rounded-lg text-sm ${calcType === 'salaried' ? 'bg-blue-700 text-white' : 'bg-gray-100'}`}>Salaried</button>
              <button onClick={() => setCalcType('non-salaried')} className={`px-3 py-1 rounded-lg text-sm ${calcType === 'non-salaried' ? 'bg-blue-700 text-white' : 'bg-gray-100'}`}>Non-Salaried</button>
            </div>

            <div className="space-y-3 mb-4">
              {calcType === 'salaried' ? (
                <input type="text" placeholder="Monthly Gross Salary" className="w-full border rounded-xl px-3 py-2" value={formData.monthlyGrossSalary} onChange={(e) => setFormData(p => ({...p, monthlyGrossSalary: e.target.value}))} />
              ) : (
                <input type="text" placeholder="Yearly Income" className="w-full border rounded-xl px-3 py-2" value={formData.yearlyIncome} onChange={(e) => setFormData(p => ({...p, yearlyIncome: e.target.value}))} />
              )}
              <input type="text" placeholder="Interest Rate (%)" className="w-full border rounded-xl px-3 py-2" value={formData.interestRate} onChange={(e) => setFormData(p => ({...p, interestRate: e.target.value}))} />
              <input type="text" placeholder="Loan Tenure (Years)" className="w-full border rounded-xl px-3 py-2" value={formData.loanTenure} onChange={(e) => setFormData(p => ({...p, loanTenure: e.target.value}))} />
              <input type="text" placeholder="Property Value" className="w-full border rounded-xl px-3 py-2" value={formData.propertyValue} onChange={(e) => setFormData(p => ({...p, propertyValue: e.target.value}))} />
            </div>

            <button onClick={handleCalculate} disabled={loading} className="w-full bg-blue-700 text-white py-2 rounded-xl disabled:opacity-50">
              {loading ? 'Calculating...' : 'Check Eligibility'}
            </button>

            <div className="mt-4 text-center bg-blue-50 rounded-xl p-4">
              <p className="text-sm text-gray-500">Eligible Amount</p>
              <p className="text-3xl font-bold text-blue-700">
                {result?.eligibleAmount ? `₹${(result.eligibleAmount / 100000).toFixed(1)}L` : '₹50L'}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
