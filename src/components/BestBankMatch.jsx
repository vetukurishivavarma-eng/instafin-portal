import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import API_BASE from '../config/api';
import { rankBanks } from '../utils/bankMatcher';

const inr = (n) => `₹${Math.round(n || 0).toLocaleString('en-IN')}`;

// Customer Login eligibility calculator: which bank gives this customer the biggest loan, using the
// per-bank formulas admins save in Download Forms → Eligibility Calculator.
export default function BestBankMatch({ loanType, assignedBanks, income, defaults, onApply }) {
  const { accessToken } = useAuth();
  const [formulas, setFormulas] = useState(null);

  useEffect(() => {
    if (!accessToken) return;
    fetch(`${API_BASE}/eligibility-formulas`, { headers: { Authorization: `Bearer ${accessToken}` } })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setFormulas(Array.isArray(data) ? data : []))
      .catch(() => setFormulas([]));
  }, [accessToken]);

  if (!formulas || !loanType) return null;

  const matches = rankBanks(formulas, loanType, income, defaults, assignedBanks || []);
  const label = String(loanType).replace(/_/g, ' ');

  if (!matches.length) {
    return (
      <p className="text-xs text-gray-500 bg-gray-50 rounded-xl px-4 py-3">
        No bank formulas saved for {label} yet — add them in Download Forms → Eligibility Calculator to compare banks here.
      </p>
    );
  }

  if (!income.netIncome) {
    return (
      <p className="text-xs text-gray-500 bg-gray-50 rounded-xl px-4 py-3">
        Enter the income above to compare {matches.length} bank{matches.length > 1 ? 's' : ''} for {label}.
      </p>
    );
  }

  return (
    <div className="bg-white border border-emerald-200 rounded-2xl p-4">
      <h4 className="text-sm font-bold text-emerald-700">Best bank match · {label}</h4>
      <ol className="mt-3 space-y-2">
        {matches.slice(0, 5).map((m, i) => (
          <li key={m.bankName} className="flex items-center gap-3 rounded-xl bg-gray-50 px-3 py-2">
            <span className={`flex h-6 w-6 flex-none items-center justify-center rounded-full text-xs font-bold ${i === 0 ? 'bg-emerald-500 text-white' : 'bg-gray-200 text-gray-600'}`}>{i + 1}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-gray-900 truncate">
                {m.bankName}
                {m.assigned && <span className="ml-2 text-[10px] font-bold uppercase text-blue-700 bg-blue-100 px-1.5 py-0.5 rounded">on this file</span>}
              </p>
              <p className="text-[11px] text-gray-500">
                {m.rate}% · {m.period} months · EMI/NMI {m.emiNmiPercent}% · {m.source === 'formula' ? 'bank formula' : 'standard calculation'}
              </p>
              {m.formulaError && <p className="text-[11px] text-red-600">Formula error, used standard calculation: {m.formulaError}</p>}
            </div>
            <div className="text-right">
              <p className={`text-sm font-extrabold ${m.eligibleAmount > 0 ? 'text-gray-900' : 'text-red-600'}`}>
                {m.eligibleAmount > 0 ? inr(m.eligibleAmount) : 'Not eligible'}
              </p>
              <button
                type="button"
                onClick={() => onApply(m)}
                className="text-[11px] font-bold text-blue-700 hover:underline"
                title="Load this bank's rate, tenure and EMI/NMI % into the calculator"
              >
                Use these terms
              </button>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
