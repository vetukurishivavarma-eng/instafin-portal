import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import API_BASE from '../config/api';
import { downloadEligibilityPDF } from '../export/pdf';

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

  // Co-applicant fields
  const [hasCoapplicant, setHasCoapplicant] = useState(false);
  const [coapplicantGrossSalary, setCoapplicantGrossSalary] = useState('');

  // Fetch leads on mount
  useEffect(() => {
    if (!accessToken) return;
    fetch(`${API_BASE}/leads`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    })
      .then(r => r.json())
      .then(data => {
        const allLeads = data.data || [];
        // Filter: Home Loan, LAP, Education Loan only (normalize case)
        const eligible = allLeads.filter(l => {
          const lt = (l.loanType || '').toLowerCase().replace(/\s+/g, '_');
          return ['home_loan', 'lap', 'education_loan'].includes(lt);
        });
        setLeads(eligible);
      })
      .catch(() => {});
  }, [accessToken]);

  // Helper: parse number or 0
  const num = (v) => parseFloat(v) || 0;

  // ---- FORMULAS ----
  const coapplicantGross = hasCoapplicant ? num(coapplicantGrossSalary) : 0;
  const totalDeductions = num(pf) + num(incomeTax) + num(professionTax);
  const netSalary = (num(grossSalary) + coapplicantGross) - totalDeductions;
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

  useEffect(() => {
    if (selectedLead) {
      if (selectedLead.hasCoapplicant) {
        setHasCoapplicant(true);
      } else {
        setHasCoapplicant(false);
      }
      setCoapplicantGrossSalary('');
    } else {
      setHasCoapplicant(false);
      setCoapplicantGrossSalary('');
    }
  }, [selectedLeadId, leads]);

  // Share eligibility via WhatsApp
  const handleShareWhatsApp = () => {
    const name = selectedLead?.customerName || 'Applicant';
    const loanType = selectedLead?.loanType?.replace(/_/g, ' ') || '';
    const eligible = eligibleAmount > 0 ? formatNum(Math.round(eligibleAmount)) : 'Not Eligible';
    const coapplicantText = hasCoapplicant ? `Co-applicant Gross: ${formatNum(coapplicantGross)}\n` : '';

    const msg =
      `*Eligibility Report - ${name}*\n` +
      `${loanType ? `Loan Type: ${loanType}\n` : ''}\n` +
      `*Income Details:*\n` +
      `Gross Salary: ${formatNum(num(grossSalary))}\n` +
      coapplicantText +
      `Total Deductions: ${formatDecimal(totalDeductions)}\n` +
      `Net Salary: ${formatDecimal(netSalary)}\n` +
      `Rental Income: ${formatNum(num(rentalIncome))}\n` +
      `Net Income: ${formatDecimal(netIncome)}\n\n` +
      `*EMI Details:*\n` +
      `EMI/NMI%: ${num(emiNmiPercent)}%\n` +
      `Existing EMIs: ${formatDecimal(totalExistingEmis)}\n` +
      `EMI Available: ${formatDecimal(emiAvailable)}\n\n` +
      `*Loan Parameters:*\n` +
      `Rate: ${num(rate)}% p.a.\n` +
      `Period: ${num(period)} months\n` +
      `EMI per LAC: ${formatDecimal(emiPerLac)}\n\n` +
      `*Eligible Loan Amount: ${eligible}*`;

    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`);
  };

  // Download eligibility PDF
  const [downloading, setDownloading] = useState(false);
  const handleDownloadPDF = async () => {
    setDownloading(true);
    try {
      await downloadEligibilityPDF({
        applicantName: selectedLead?.customerName || 'Applicant',
        loanType: selectedLead?.loanType?.replace(/_/g, ' ') || '',
        mobile: selectedLead?.mobile || '',
        pf: num(pf),
        incomeTax: num(incomeTax),
        professionTax: num(professionTax),
        totalDeductions,
        grossSalary: num(grossSalary),
        netSalary,
        rentalIncome: num(rentalIncome),
        netIncome,
        emiNmiPercent: num(emiNmiPercent),
        bankEmis,
        totalExistingEmis,
        emiAvailable,
        principal: num(principal),
        rate: num(rate),
        period: num(period),
        emiPerLac,
        eligibleAmount,
        hasCoapplicant,
        coapplicantGross,
      });
    } catch (err) {
      console.error('PDF download failed:', err);
    } finally {
      setDownloading(false);
    }
  };

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
            <div className="space-y-4">
              <div>
                <label className="text-sm text-gray-600 mb-1 block">Gross Salary (Monthly)</label>
                <input type="text" inputMode="decimal" className="w-full border rounded-xl px-4 py-2.5 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all" value={grossSalary} onChange={handleNumInput(setGrossSalary)} placeholder="0" />
              </div>
              <div>
                <label className="text-sm text-gray-600 mb-1 block">Proposed Rental Income</label>
                <input type="text" inputMode="decimal" className="w-full border rounded-xl px-4 py-2.5 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all" value={rentalIncome} onChange={handleNumInput(setRentalIncome)} placeholder="0" />
              </div>

              {/* Co-applicant checkbox and monthly gross input */}
              <div className="pt-2 border-t border-gray-100">
                <label className="flex items-center gap-2.5 cursor-pointer select-none group">
                  <input
                    type="checkbox"
                    className="w-4 h-4 rounded text-blue-600 border-gray-300 focus:ring-blue-500 cursor-pointer"
                    checked={hasCoapplicant}
                    onChange={(e) => {
                      setHasCoapplicant(e.target.checked);
                      if (!e.target.checked) setCoapplicantGrossSalary('');
                    }}
                  />
                  <span className="text-sm font-semibold text-gray-700 group-hover:text-blue-750 transition-colors">
                    Include Co-applicant Income
                  </span>
                </label>

                {hasCoapplicant && (
                  <div className="mt-3 p-4 bg-gradient-to-r from-blue-50/70 to-indigo-50/50 rounded-2xl border border-blue-100/50 animate-fade-in-up">
                    <label className="text-xs font-semibold text-gray-600 mb-1.5 block">
                      Co-applicant Monthly Gross Salary * {selectedLead?.coapplicantName ? `(${selectedLead.coapplicantName})` : ''}
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      className="w-full border rounded-xl px-3 py-2 bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all text-sm font-medium"
                      value={coapplicantGrossSalary}
                      onChange={handleNumInput(setCoapplicantGrossSalary)}
                      placeholder="Enter gross monthly income"
                    />
                  </div>
                )}
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
              <div className={`flex justify-between items-center py-2 border-b px-3 rounded-lg ${emiAvailable < 0 ? 'bg-red-50' : 'bg-blue-50'}`}>
                <span className="font-medium text-gray-800">EMI Available (approx.)</span>
                <span className={`font-bold text-xl ${emiAvailable < 0 ? 'text-red-600' : 'text-blue-700'}`}>{formatDecimal(emiAvailable)}</span>
              </div>

              {/* EMI per LAC */}
              {emiPerLac > 0 && (
                <div className="flex justify-between items-center py-2 border-b">
                  <span className="text-gray-600">EMI per LAC</span>
                  <span className="font-semibold text-lg">{formatDecimal(emiPerLac)}</span>
                </div>
              )}

              {/* Eligible Loan Amount */}
              <div className={`mt-4 p-6 rounded-2xl text-white text-center ${eligibleAmount > 0 ? 'bg-gradient-to-r from-blue-600 to-blue-700' : 'bg-gradient-to-r from-red-500 to-red-600'}`}>
                <p className="text-sm opacity-80">Eligible Loan Amount (as per Income)</p>
                {eligibleAmount > 0 ? (
                  <p className="text-3xl font-bold mt-1">{formatNum(Math.round(eligibleAmount))}</p>
                ) : (
                  <>
                    <p className="text-4xl font-extrabold mt-1 tracking-wide">NOT ELIGIBLE</p>
                    <p className="text-sm opacity-80 mt-2">Existing EMIs exceed available EMI capacity</p>
                  </>
                )}
              </div>

            </div>
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={handleDownloadPDF}
              disabled={downloading}
              className="inline-flex items-center justify-center px-5 py-3 rounded-2xl font-semibold text-sm bg-blue-600 text-white hover:bg-blue-700 shadow-md hover:shadow-lg transition-all disabled:opacity-50"
            >
              <svg className="-ml-1 mr-2 h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              {downloading ? 'Generating...' : 'Download Report'}
            </button>
            <button
              onClick={handleShareWhatsApp}
              className="inline-flex items-center justify-center px-5 py-3 rounded-2xl font-semibold text-sm bg-green-600 text-white hover:bg-green-700 shadow-md hover:shadow-lg transition-all"
            >
              <svg className="-ml-1 mr-2 h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
              Send to WhatsApp
            </button>
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
