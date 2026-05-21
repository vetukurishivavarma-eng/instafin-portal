import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import API_BASE from '../config/api';

export default function EligibilityPage() {
  const { accessToken } = useAuth();
  const [leads, setLeads] = useState([]);
  const [selectedLeadId, setSelectedLeadId] = useState('');

  // Input fields
  const [pf, setPf] = useState('');
  const [incomeTax, setIncomeTax] = useState('');
  const [professionTax, setProfessionTax] = useState('');
  const [grossSalary, setGrossSalary] = useState('');
  const [rentalIncome, setRentalIncome] = useState('');
  const [emiNmiPercent, setEmiNmiPercent] = useState('');
  const [bankEmis, setBankEmis] = useState([{ bank: '', emi: '' }]);
  const [principal, setPrincipal] = useState('');
  const [rate, setRate] = useState('');
  const [period, setPeriod] = useState('');

  // Fetch leads on mount
  useEffect(() => {
    if (!accessToken) return;
    fetch(`${API_BASE}/leads`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    })
      .then(r => r.json())
      .then(data => {
        const allLeads = data.data || [];
        // Filter: Home Loan, LAP, Education Loan only
        const eligible = allLeads.filter(l =>
          ['home_loan', 'lap', 'education_loan'].includes(l.loanType)
        );
        setLeads(eligible);
      })
      .catch(() => {});
  }, [accessToken]);

  // Helper: parse number or 0
  const num = (v) => parseFloat(v) || 0;

  // ---- FORMULAS ----
  const totalDeductions = num(pf) + num(incomeTax) + num(professionTax);
  const netSalary = num(grossSalary) - totalDeductions;
  const netIncome = netSalary + num(rentalIncome);
  const totalExistingEmis = bankEmis.reduce((sum, b) => sum + num(b.emi), 0);
  const emiAvailable = (netIncome * num(emiNmiPercent) / 100) - totalExistingEmis;

  // EMI per LAC: PMT(rate/12, period, -100000)
  const monthlyRate = num(rate) / 100 / 12;
  const emiPerLac = monthlyRate > 0 && num(period) > 0
    ? (100000 * monthlyRate * Math.pow(1 + monthlyRate, num(period))) / (Math.pow(1 + monthlyRate, num(period)) - 1)
    : 0;

  const eligibleAmount = emiPerLac > 0 ? (Math.max(0, emiAvailable) / emiPerLac) * 100000 : 0;

  // Bank EMI handlers
  const addBankEmi = () => setBankEmis([...bankEmis, { bank: '', emi: '' }]);
  const removeBankEmi = (i) => setBankEmis(bankEmis.filter((_, idx) => idx !== i));
  const updateBankEmi = (i, field, val) => {
    const updated = [...bankEmis];
    updated[i][field] = val;
    setBankEmis(updated);
  };

  const formatNum = (n) => n.toLocaleString('en-IN', { maximumFractionDigits:0 });
  const formatDecimal = (n) => n.toLocaleString('en-IN', { minimumFractionDigits:2, maximumFractionDigits:2 });

  // Number input helper: allows only digits and decimal
  const handleNumInput = (setter) => (e) => {
    const v = e.target.value;
    if (v === '' || /^\d*\.?\d*$/.test(v)) setter(v);
  };

  const selectedLead = leads.find(l => String(l.id) === String(selectedLeadId));

  return (
    <div className="py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Eligibility Calculator</h1>
        <p className="text-gray-500">Calculate loan eligibility based on income and deductions</p>
      </div>

      <div className="grid lg:grid-cols-2 gap-8">
        {/* LEFT: Inputs */}
        <div className="space-y-6">

          {/* Lead Selector */}
          <div className="bg-white rounded-2xl shadow-md p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Select Lead</h2>
            <select
              className="w-full border rounded-xl px-4 py-3"
              value={selectedLeadId}
              onChange={(e) => setSelectedLeadId(e.target.value)}
            >
              <option value="">Select a lead...</option>
              {leads.map(l => (
                <option key={l.id} value={l.id}>
                  {l.customerName} - {l.mobile} ({l.loanType?.replace(/_/g, ' ')})
                </option>
              ))}
            </select>
            {selectedLead && (
              <div className="mt-3 p-3 bg-blue-50 rounded-xl text-sm">
                <span className="font-medium">{selectedLead.customerName}</span>
                <span className="text-gray-500 ml-2">| {selectedLead.loanType?.replace(/_/g, ' ')} | {selectedLead.mobile}</span>
              </div>
            )}
          </div>

          {/* Statutory Deductions */}
          <div className="bg-white rounded-2xl shadow-md p-6">
            <h2 className="text-lg font-bold text-blue-700 mb-4">Statutory Deductions</h2>
            <div className="space-y-3">
              <div>
                <label className="text-sm text-gray-600 mb-1 block">Provident Fund</label>
                <input type="text" inputMode="decimal" className="w-full border rounded-xl px-4 py-2.5" value={pf} onChange={handleNumInput(setPf)} placeholder="0" />
              </div>
              <div>
                <label className="text-sm text-gray-600 mb-1 block">Income Tax</label>
                <input type="text" inputMode="decimal" className="w-full border rounded-xl px-4 py-2.5" value={incomeTax} onChange={handleNumInput(setIncomeTax)} placeholder="0" />
              </div>
              <div>
                <label className="text-sm text-gray-600 mb-1 block">Profession Tax</label>
                <input type="text" inputMode="decimal" className="w-full border rounded-xl px-4 py-2.5" value={professionTax} onChange={handleNumInput(setProfessionTax)} placeholder="0" />
              </div>
            </div>
          </div>

          {/* Income */}
          <div className="bg-white rounded-2xl shadow-md p-6">
            <h2 className="text-lg font-bold text-blue-700 mb-4">Income</h2>
            <div className="space-y-3">
              <div>
                <label className="text-sm text-gray-600 mb-1 block">Gross Salary (Monthly)</label>
                <input type="text" inputMode="decimal" className="w-full border rounded-xl px-4 py-2.5" value={grossSalary} onChange={handleNumInput(setGrossSalary)} placeholder="0" />
              </div>
              <div>
                <label className="text-sm text-gray-600 mb-1 block">Proposed Rental Income</label>
                <input type="text" inputMode="decimal" className="w-full border rounded-xl px-4 py-2.5" value={rentalIncome} onChange={handleNumInput(setRentalIncome)} placeholder="0" />
              </div>
            </div>
          </div>

          {/* EMI/NMI & Existing EMIs */}
          <div className="bg-white rounded-2xl shadow-md p-6">
            <h2 className="text-lg font-bold text-blue-700 mb-4">EMI Details</h2>
            <div className="space-y-3">
              <div>
                <label className="text-sm text-gray-600 mb-1 block">EMI/NMI % (as per NAI)</label>
                <input type="text" inputMode="decimal" className="w-full border rounded-xl px-4 py-2.5" value={emiNmiPercent} onChange={handleNumInput(setEmiNmiPercent)} placeholder="e.g. 50" />
              </div>

              <div>
                <label className="text-sm text-gray-600 mb-1 block">Existing Bank EMIs</label>
                {bankEmis.map((item, i) => (
                  <div key={i} className="flex gap-2 mb-2">
                    <input
                      type="text"
                      className="flex-1 border rounded-xl px-3 py-2"
                      placeholder="Bank name"
                      value={item.bank}
                      onChange={(e) => updateBankEmi(i, 'bank', e.target.value)}
                    />
                    <input
                      type="text"
                      inputMode="decimal"
                      className="w-36 border rounded-xl px-3 py-2"
                      placeholder="EMI amount"
                      value={item.emi}
                      onChange={(e) => updateBankEmi(i, 'emi', e.target.value)}
                    />
                    {bankEmis.length > 1 && (
                      <button onClick={() => removeBankEmi(i)} className="text-red-500 hover:text-red-700 px-2">&times;</button>
                    )}
                  </div>
                ))}
                <button onClick={addBankEmi} className="text-sm text-blue-600 hover:underline mt-1">+ Add another bank</button>
              </div>
            </div>
          </div>

          {/* Loan Parameters */}
          <div className="bg-white rounded-2xl shadow-md p-6">
            <h2 className="text-lg font-bold text-blue-700 mb-4">Loan Parameters</h2>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-sm text-gray-600 mb-1 block">Principal Amount</label>
                <input type="text" inputMode="decimal" className="w-full border rounded-xl px-3 py-2.5" value={principal} onChange={handleNumInput(setPrincipal)} placeholder="100000" />
              </div>
              <div>
                <label className="text-sm text-gray-600 mb-1 block">Rate (% p.a.)</label>
                <input type="text" inputMode="decimal" className="w-full border rounded-xl px-3 py-2.5" value={rate} onChange={handleNumInput(setRate)} placeholder="7.5" />
              </div>
              <div>
                <label className="text-sm text-gray-600 mb-1 block">Period (months)</label>
                <input type="text" inputMode="decimal" className="w-full border rounded-xl px-3 py-2.5" value={period} onChange={handleNumInput(setPeriod)} placeholder="360" />
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT: Calculated Results */}
        <div className="space-y-6">
          <div className="bg-white rounded-2xl shadow-md p-6 border-2 border-green-200">
            <h2 className="text-lg font-bold text-green-700 mb-4">Calculated Results</h2>
            <div className="space-y-4">

              {/* Statutory Deductions Total */}
              <div className="flex justify-between items-center py-2 border-b">
                <span className="text-gray-600">Total Statutory Deductions</span>
                <span className="font-semibold text-lg">{formatDecimal(totalDeductions)}</span>
              </div>

              {/* Net Salary */}
              <div className="flex justify-between items-center py-2 border-b">
                <span className="text-gray-600">Net Salary</span>
                <span className="font-semibold text-lg">{formatDecimal(netSalary)}</span>
              </div>

              {/* Net Income */}
              <div className="flex justify-between items-center py-2 border-b bg-green-50 px-3 rounded-lg">
                <span className="font-medium text-gray-800">Net Income</span>
                <span className="font-bold text-xl text-green-700">{formatDecimal(netIncome)}</span>
              </div>

              {/* Total Existing EMIs */}
              <div className="flex justify-between items-center py-2 border-b">
                <span className="text-gray-600">Total Existing EMIs</span>
                <span className="font-semibold text-lg">{formatDecimal(totalExistingEmis)}</span>
              </div>

              {/* EMI Available */}
              <div className="flex justify-between items-center py-2 border-b bg-blue-50 px-3 rounded-lg">
                <span className="font-medium text-gray-800">EMI Available (approx.)</span>
                <span className="font-bold text-xl text-blue-700">{formatDecimal(Math.max(0, emiAvailable))}</span>
              </div>

              {/* EMI per LAC */}
              {emiPerLac > 0 && (
                <div className="flex justify-between items-center py-2 border-b">
                  <span className="text-gray-600">EMI per LAC</span>
                  <span className="font-semibold text-lg">{formatDecimal(emiPerLac)}</span>
                </div>
              )}

              {/* Eligible Loan Amount */}
              <div className="mt-4 p-4 bg-gradient-to-r from-blue-600 to-blue-700 rounded-2xl text-white text-center">
                <p className="text-sm opacity-80">Eligible Loan Amount (as per Income)</p>
                <p className="text-3xl font-bold mt-1">
                  {eligibleAmount > 0 ? `${formatNum(Math.round(eligibleAmount))}` : '--'}
                </p>
              </div>

            </div>
          </div>

          {/* Input Summary */}
          <div className="bg-gray-50 rounded-2xl p-6 text-sm text-gray-600">
            <h3 className="font-bold text-gray-800 mb-3">Input Summary</h3>
            <div className="grid grid-cols-2 gap-2">
              <div>PF: {num(pf).toLocaleString()}</div>
              <div>Income Tax: {num(incomeTax).toLocaleString()}</div>
              <div>Prof. Tax: {num(professionTax).toLocaleString()}</div>
              <div>Gross Salary: {num(grossSalary).toLocaleString()}</div>
              <div>Rental Income: {num(rentalIncome).toLocaleString()}</div>
              <div>EMI/NMI%: {num(emiNmiPercent)}%</div>
              <div>Existing EMIs: {totalExistingEmis.toLocaleString()}</div>
              <div>Rate: {num(rate)}% p.a.</div>
              <div>Period: {num(period)} months</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
