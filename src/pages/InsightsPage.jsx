import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import API_BASE from '../config/api';

const inr = (n) => `₹${Math.round(n || 0).toLocaleString('en-IN')}`;
const monthLabel = (key) => {
  const [y, m] = key.split('-');
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
};

function useApi() {
  const { accessToken } = useAuth();
  return useCallback(async (path, options = {}) => {
    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || 'Request failed');
    return body;
  }, [accessToken]);
}

export default function InsightsPage() {
  const { accessToken, effectiveRole } = useAuth();
  const isAdmin = effectiveRole === 'admin';
  const isManager = isAdmin || effectiveRole === 'operations_head';
  const tabs = [
    { id: 'stuck', label: 'Stuck leads' },
    ...(isManager ? [{ id: 'banks', label: 'Bank turnaround' }] : []),
    ...(isAdmin ? [{ id: 'revenue', label: 'Revenue & forecast' }] : []),
  ];
  const [tab, setTab] = useState('stuck');

  if (!accessToken) return null;

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 sm:py-8">
      <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900">Insights</h1>
      <p className="text-sm text-gray-500 mt-1">Where files are stuck, which banks move fastest, and what revenue is coming.</p>

      <div className="flex gap-2 mt-5 border-b border-gray-200 overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-bold whitespace-nowrap border-b-2 -mb-px transition-colors ${
              tab === t.id ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {tab === 'stuck' && <StuckLeads canAssign={isManager} />}
        {tab === 'banks' && isManager && <BankTurnaround />}
        {tab === 'revenue' && isAdmin && <RevenueForecast />}
      </div>
    </div>
  );
}

function Card({ children, className = '' }) {
  return <div className={`bg-white rounded-2xl shadow-sm border border-gray-200 ${className}`}>{children}</div>;
}

function Notice({ tone = 'gray', children }) {
  const tones = { gray: 'bg-gray-50 text-gray-600', red: 'bg-red-50 text-red-700', green: 'bg-green-50 text-green-700' };
  return <div className={`rounded-xl px-4 py-3 text-sm ${tones[tone]}`}>{children}</div>;
}

function StuckLeads({ canAssign }) {
  const api = useApi();
  const [rows, setRows] = useState(null);
  const [sla, setSla] = useState({});
  const [error, setError] = useState('');
  const [raised, setRaised] = useState({}); // leadId -> 'saving' | 'done' | error text

  useEffect(() => {
    api('/insights/stuck-leads')
      .then((body) => { setRows(body.data || []); setSla(body.slaDays || {}); })
      .catch((err) => setError(err.message));
  }, [api]);

  const raiseHurdle = async (leadId) => {
    setRaised((r) => ({ ...r, [leadId]: 'saving' }));
    try {
      await api(`/insights/stuck-leads/${leadId}/hurdle`, { method: 'POST' });
      setRaised((r) => ({ ...r, [leadId]: 'done' }));
    } catch (err) {
      setRaised((r) => ({ ...r, [leadId]: err.message }));
    }
  };

  if (error) return <Notice tone="red">{error}</Notice>;
  if (!rows) return <Notice>Loading…</Notice>;

  const critical = rows.filter((r) => r.severity === 'critical').length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <Stat label="Stuck files" value={rows.length} tone={rows.length ? 'amber' : 'green'} />
        <Stat label="Critical (2× over limit)" value={critical} tone={critical ? 'red' : 'green'} />
      </div>
      <p className="text-xs text-gray-500">
        Time limits per stage: {Object.entries(sla).map(([s, d]) => `${s} ${d}d`).join(' · ')}. The clock restarts on every status change.
      </p>

      {rows.length === 0 ? (
        <Notice tone="green">No stuck leads — every open file is within its stage time limit.</Notice>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Stage</th>
                <th className="px-4 py-3">Days in stage</th>
                <th className="px-4 py-3">Executive</th>
                <th className="px-4 py-3 text-right">Expected</th>
                {canAssign && <th className="px-4 py-3" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((r) => {
                const state = raised[r.leadId];
                return (
                  <tr key={r.leadId}>
                    <td className="px-4 py-3">
                      <p className="font-bold text-gray-900">{r.customerName}</p>
                      <p className="text-xs text-gray-400">{r.leadCode || '—'} · {(r.loanType || '').replace(/_/g, ' ')}</p>
                    </td>
                    <td className="px-4 py-3">{r.status}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-bold ${
                        r.severity === 'critical' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                      }`}>
                        {r.daysInStage}d / {r.slaDays}d
                      </span>
                    </td>
                    <td className="px-4 py-3">{r.assignedToName || 'Unassigned'}</td>
                    <td className="px-4 py-3 text-right">{r.expectedAmount ? inr(r.expectedAmount) : '—'}</td>
                    {canAssign && (
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {state === 'done' ? (
                          <span className="text-xs font-bold text-green-700">Task raised ✓</span>
                        ) : (
                          <button
                            onClick={() => raiseHurdle(r.leadId)}
                            disabled={state === 'saving'}
                            className="text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-lg hover:bg-blue-100 disabled:opacity-50"
                          >
                            {state === 'saving' ? 'Raising…' : 'Raise Daily Hurdle'}
                          </button>
                        )}
                        {state && state !== 'done' && state !== 'saving' && (
                          <p className="text-[11px] text-red-600 mt-1">{state}</p>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

function Stat({ label, value, tone = 'gray' }) {
  const tones = {
    gray: 'text-gray-900', green: 'text-green-700', amber: 'text-amber-600', red: 'text-red-600', blue: 'text-blue-700',
  };
  return (
    <Card className="px-5 py-4 min-w-[160px]">
      <p className="text-xs font-bold uppercase tracking-wide text-gray-400">{label}</p>
      <p className={`text-2xl font-extrabold mt-1 ${tones[tone]}`}>{value}</p>
    </Card>
  );
}

function BankTurnaround() {
  const api = useApi();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/insights/bank-tat').then((b) => setRows(b.data || [])).catch((err) => setError(err.message));
  }, [api]);

  if (error) return <Notice tone="red">{error}</Notice>;
  if (!rows) return <Notice>Loading…</Notice>;
  if (!rows.length) return <Notice>No bank files yet — add banks to leads to start the leaderboard.</Notice>;

  return (
    <div className="space-y-3">
      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-3">Bank</th>
              <th className="px-4 py-3 text-right">Files</th>
              <th className="px-4 py-3">Approval rate</th>
              <th className="px-4 py-3 text-right">Median days to decision</th>
              <th className="px-4 py-3 text-right">Pending (avg wait)</th>
              <th className="px-4 py-3 text-right">Rejected</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((b, i) => (
              <tr key={b.bankName}>
                <td className="px-4 py-3 font-bold text-gray-900">{i === 0 && b.approvalRate !== null ? '🏆 ' : ''}{b.bankName}</td>
                <td className="px-4 py-3 text-right">{b.applications}</td>
                <td className="px-4 py-3">
                  {b.approvalRate === null ? <span className="text-gray-400">No decisions yet</span> : (
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-24 rounded-full bg-gray-100 overflow-hidden">
                        <div className="h-full bg-green-500" style={{ width: `${b.approvalRate}%` }} />
                      </div>
                      <span className="font-bold">{b.approvalRate}%</span>
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 text-right">{b.medianDecisionDays ?? '—'}</td>
                <td className="px-4 py-3 text-right">{b.pending}{b.avgPendingDays !== null ? ` (${b.avgPendingDays}d)` : ''}</td>
                <td className="px-4 py-3 text-right">{b.rejected}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <p className="text-xs text-gray-500">
        Days to decision run from when the bank was added to the file until it was sanctioned or rejected (last update on that bank record).
      </p>
    </div>
  );
}

function RevenueForecast() {
  const api = useApi();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/insights/revenue').then(setData).catch((err) => setError(err.message));
  }, [api]);

  if (error) return <Notice tone="red">{error}</Notice>;
  if (!data) return <Notice>Loading…</Notice>;

  const peak = Math.max(1, ...data.last6Months.map((m) => m.revenue));
  const f = data.forecast;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Earned" value={inr(data.earned)} tone="green" />
        <Stat label="Received" value={inr(data.received)} tone="blue" />
        <Stat label="To collect" value={inr(data.pendingCollection)} tone="amber" />
        <Stat label="Forecast" value={inr(f.total)} tone="gray" />
      </div>

      <Card className="p-5">
        <h3 className="font-bold text-gray-900">Commission forecast</h3>
        <div className="mt-3 space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-gray-600">Sanctioned, not yet disbursed</span><span className="font-bold">{inr(f.sanctionedPipeline)}</span></div>
          <div className="flex justify-between">
            <span className="text-gray-600">
              Files at banks × {f.approvalRatePercent}% approval rate{f.approvalRateIsDefault ? ' (default until files are decided)' : ' (your history)'}
            </span>
            <span className="font-bold">{inr(f.processingPipeline)}</span>
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <h3 className="font-bold text-gray-900">Earned revenue, last 6 months</h3>
        <div className="mt-4 flex items-end gap-3 h-40">
          {data.last6Months.map((m) => (
            <div key={m.month} className="flex-1 flex flex-col items-center justify-end h-full">
              <span className="text-[10px] font-bold text-gray-600 mb-1">{m.revenue ? inr(m.revenue) : ''}</span>
              <div className="w-full rounded-t-lg bg-gradient-to-t from-emerald-500 to-teal-400" style={{ height: `${(m.revenue / peak) * 100}%`, minHeight: m.revenue ? 4 : 0 }} />
              <span className="text-[11px] text-gray-500 mt-1">{monthLabel(m.month)}</span>
            </div>
          ))}
        </div>
      </Card>
      <p className="text-xs text-gray-500">
        Same rule as the Revenue page: entered received + pending first, otherwise the lead's commission % (default 1%) of the disbursed/sanctioned amount.
      </p>
    </div>
  );
}
