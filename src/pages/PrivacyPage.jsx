import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import API_BASE from '../config/api';

const fmtDate = (d) => new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

// Admin data-protection checklist (DPDP): login-signing secret status + old rejected/closed
// files still holding customer documents. Report only — deleting stays a reviewed manual step.
export default function PrivacyPage() {
  const { accessToken } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!accessToken) return;
    fetch(`${API_BASE}/privacy/overview`, { headers: { Authorization: `Bearer ${accessToken}` } })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || 'Failed to load');
        setData(body);
      })
      .catch((err) => setError(err.message));
  }, [accessToken]);

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 sm:py-8 space-y-5">
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900">Privacy &amp; Data</h1>
        <p className="text-sm text-gray-500 mt-1">Security posture and customer documents that are past their keep-by date.</p>
      </div>

      {error && <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {!error && !data && <p className="text-sm text-gray-500">Loading…</p>}

      {data && (
        <>
          <div className={`rounded-2xl border p-5 ${data.jwtSecretConfigured ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
            <h2 className={`font-bold ${data.jwtSecretConfigured ? 'text-green-800' : 'text-red-800'}`}>
              {data.jwtSecretConfigured ? '✓ Login tokens use a private secret' : '⚠ Login tokens use the public fallback secret'}
            </h2>
            {!data.jwtSecretConfigured && (
              <p className="text-sm text-red-700 mt-1">
                Anyone with the source code could forge an admin login. Set <code>JWT_SECRET</code> on the backend service (Render → Environment) — every user will need to log in again.
              </p>
            )}
            <p className="text-xs text-gray-500 mt-2">Also active: 10 login attempts per 15 minutes per email, and security headers on every API response.</p>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
            <h2 className="font-bold text-gray-900">Documents past retention ({data.retentionDays} days)</h2>
            <p className="text-sm text-gray-500 mt-1">
              Rejected or closed files older than {data.retentionDays} days that still hold uploaded documents.
              Under the DPDP Act, keep customer documents only as long as needed — review these and delete them from Lead Archives.
            </p>

            {data.candidates.length === 0 ? (
              <p className="mt-4 rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">Nothing past retention.</p>
            ) : (
              <>
                <p className="mt-4 text-sm font-bold text-amber-700">{data.candidates.length} files · {data.totalDocuments} documents</p>
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs uppercase tracking-wide text-gray-500">
                      <tr>
                        <th className="py-2 pr-4">Customer</th>
                        <th className="py-2 pr-4">Status</th>
                        <th className="py-2 pr-4">Since</th>
                        <th className="py-2 pr-4 text-right">Age</th>
                        <th className="py-2 text-right">Documents</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {data.candidates.map((c) => (
                        <tr key={c.leadId}>
                          <td className="py-2 pr-4"><span className="font-bold text-gray-900">{c.customerName}</span> <span className="text-xs text-gray-400">{c.leadCode || ''}</span></td>
                          <td className="py-2 pr-4">{c.status}</td>
                          <td className="py-2 pr-4">{fmtDate(c.since)}</td>
                          <td className="py-2 pr-4 text-right">{c.ageDays}d</td>
                          <td className="py-2 text-right">{c.documents}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
