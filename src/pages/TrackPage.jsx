import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import API_BASE from '../config/api';

// Login-free progress page a customer opens from the link their executive shared.
const STAGES = ['New', 'Assigned', 'Processing', 'Sanctioned', 'Disbursed'];
const STAGE_COPY = {
  New: 'Application received',
  Assigned: 'Executive assigned',
  Processing: 'With the bank',
  Sanctioned: 'Loan sanctioned',
  Disbursed: 'Money disbursed',
};

function stageIndex(status) {
  if (status === 'Partially Disbursed') return STAGES.indexOf('Sanctioned');
  return STAGES.indexOf(status);
}

const fmtDate = (d) => new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
const inr = (n) => `₹${Math.round(n || 0).toLocaleString('en-IN')}`;

export default function TrackPage() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`${API_BASE}/track/${encodeURIComponent(token)}`)
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || 'This tracking link is invalid or has expired.');
        setData(body);
      })
      .catch((err) => setError(err.message));
  }, [token]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white px-4 py-10">
      <div className="max-w-xl mx-auto">
        <p className="text-2xl font-bold text-blue-700">InstaFin</p>

        {error && (
          <div className="mt-8 bg-white rounded-2xl shadow p-6">
            <h1 className="text-lg font-bold text-gray-900">Link not available</h1>
            <p className="text-sm text-gray-600 mt-2">{error} Please ask your InstaFin executive for a fresh link.</p>
          </div>
        )}

        {!error && !data && <p className="mt-8 text-sm text-gray-500">Loading your application…</p>}

        {data && <Progress data={data} />}
      </div>
    </div>
  );
}

function Progress({ data }) {
  const current = stageIndex(data.status);
  const stopped = ['Rejected', 'Closed', 'Inactive'].includes(data.status);
  const docs = data.documents || {};

  return (
    <div className="mt-6 space-y-4">
      <div className="bg-white rounded-2xl shadow p-6">
        <p className="text-sm text-gray-500">Hello {data.firstName || 'there'},</p>
        <h1 className="text-xl font-extrabold text-gray-900 mt-1">
          Your {(data.loanType || 'loan').replace(/_/g, ' ')} application
        </h1>
        {data.leadCode && <p className="text-xs text-gray-400 mt-1">Reference {data.leadCode}</p>}

        {stopped ? (
          <div className="mt-5 rounded-xl bg-gray-100 px-4 py-3 text-sm text-gray-700">
            This application is currently <b>{data.status.toLowerCase()}</b>. Your executive will contact you about next steps.
          </div>
        ) : (
          <ol className="mt-6 space-y-4">
            {STAGES.map((stage, i) => {
              const done = i < current || (i === current && stage === 'Disbursed');
              const active = i === current && stage !== 'Disbursed';
              const reachedAt = (data.timeline || []).filter((t) => t.status === stage).at(-1)?.at;
              return (
                <li key={stage} className="flex items-start gap-3">
                  <span className={`mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-full text-xs font-bold ${
                    done ? 'bg-green-500 text-white' : active ? 'bg-blue-600 text-white ring-4 ring-blue-100' : 'bg-gray-200 text-gray-500'
                  }`}>
                    {done ? '✓' : i + 1}
                  </span>
                  <div>
                    <p className={`text-sm font-bold ${done || active ? 'text-gray-900' : 'text-gray-400'}`}>
                      {STAGE_COPY[stage]}
                      {active && data.status === 'Partially Disbursed' && ' · partly disbursed'}
                    </p>
                    {reachedAt && <p className="text-xs text-gray-400">{fmtDate(reachedAt)}</p>}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      {typeof docs.uploaded === 'number' && (
        <div className="bg-white rounded-2xl shadow p-6">
          <h2 className="font-bold text-gray-900">Documents</h2>
          {docs.required ? (
            <>
              <p className="text-sm text-gray-600 mt-1">{Math.min(docs.uploaded, docs.required)} of {docs.required} received</p>
              <div className="mt-3 h-2 rounded-full bg-gray-100 overflow-hidden">
                <div className="h-full bg-blue-600" style={{ width: `${Math.min(100, Math.round((docs.uploaded / docs.required) * 100))}%` }} />
              </div>
            </>
          ) : (
            <p className="text-sm text-gray-600 mt-1">{docs.uploaded} received so far</p>
          )}
        </div>
      )}

      {(data.banks || []).length > 0 && (
        <div className="bg-white rounded-2xl shadow p-6">
          <h2 className="font-bold text-gray-900">Banks</h2>
          <ul className="mt-3 divide-y divide-gray-100">
            {data.banks.map((b, i) => (
              <li key={`${b.bankName}-${i}`} className="flex items-center justify-between py-2 text-sm">
                <span className="font-semibold text-gray-800">{b.bankName}</span>
                <span className="text-gray-600">
                  {b.status}
                  {b.sanctionedAmount ? ` · ${inr(b.sanctionedAmount)}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {data.updatedAt && <p className="text-center text-xs text-gray-400">Last updated {fmtDate(data.updatedAt)}</p>}
    </div>
  );
}
