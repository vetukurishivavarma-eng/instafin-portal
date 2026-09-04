import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import API_BASE from '../config/api';

const STATUS_STYLES = {
  ready: 'bg-green-100 text-green-700 border-green-200',
  connecting: 'bg-amber-100 text-amber-700 border-amber-200',
  disconnected: 'bg-red-100 text-red-700 border-red-200',
  not_started: 'bg-gray-100 text-gray-600 border-gray-200',
};

const STATUS_LABELS = {
  ready: 'Connected — listening for documents',
  connecting: 'Waiting for QR scan',
  disconnected: 'Disconnected',
  not_started: 'Not started',
};

const OUTCOME_STYLES = {
  processed: 'bg-green-100 text-green-700 border-green-200',
  duplicate: 'bg-amber-100 text-amber-700 border-amber-200',
  failed: 'bg-red-100 text-red-700 border-red-200',
  received: 'bg-gray-100 text-gray-600 border-gray-200',
};

export default function WhatsAppIntakePage() {
  const { accessToken, effectiveRole } = useAuth();
  const [status, setStatus] = useState(null);
  const [qr, setQr] = useState(null);
  const [logs, setLogs] = useState([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const authedGet = useCallback(async (path) => {
    const res = await fetch(`${API_BASE}${path}`, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Request failed (${res.status})`);
    return res.json();
  }, [accessToken]);

  const refreshStatus = useCallback(async () => {
    try {
      const data = await authedGet('/whatsapp-intake/status');
      setStatus(data);
      setError('');

      if (data.qrAvailable) {
        try {
          const qrData = await authedGet('/whatsapp-intake/qr');
          setQr(qrData.qr);
        } catch {
          setQr(null);
        }
      } else {
        setQr(null);
      }
    } catch (err) {
      setError(err.message || 'Failed to fetch WhatsApp intake status');
    }
  }, [authedGet]);

  const refreshLogs = useCallback(async () => {
    try {
      const query = statusFilter ? `?status=${statusFilter}` : '';
      const data = await authedGet(`/whatsapp-intake/logs${query}`);
      setLogs(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || 'Failed to fetch WhatsApp intake logs');
    }
  }, [authedGet, statusFilter]);

  useEffect(() => {
    if (!accessToken) return;
    setLoading(true);
    Promise.all([refreshStatus(), refreshLogs()]).finally(() => setLoading(false));
  }, [accessToken, refreshStatus, refreshLogs]);

  // Poll status every 5s while a QR is waiting to be scanned or the link is still connecting —
  // otherwise every 20s, since a steady "ready" connection changes rarely.
  useEffect(() => {
    if (!accessToken) return;
    const interval = status?.connectionStatus === 'ready' ? 20000 : 5000;
    const id = setInterval(refreshStatus, interval);
    return () => clearInterval(id);
  }, [accessToken, status?.connectionStatus, refreshStatus]);

  if (effectiveRole !== 'admin' && effectiveRole !== 'operations_head') {
    return (
      <div className="py-12 text-center">
        <p className="text-gray-500 font-semibold">Only admins and operations heads can view WhatsApp intake.</p>
      </div>
    );
  }

  const connectionStatus = status?.connectionStatus || 'not_started';

  return (
    <div className="py-6 sm:py-12 px-3 sm:px-6 min-h-screen bg-gradient-mesh">
      <div className="max-w-6xl mx-auto animate-fade-in-up">
        {/* Header */}
        <div className="mb-6 sm:mb-8">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center">
              <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8-1.155 0-2.257-.194-3.268-.55L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl sm:text-4xl font-extrabold text-gray-900 tracking-tight">WhatsApp Document Intake</h1>
              <p className="text-xs sm:text-base text-gray-500 font-medium mt-1">
                Customers send documents to WhatsApp as "LeadID_DocumentName.ext" — they land here, linked to the lead automatically.
              </p>
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 sm:px-6 py-3 sm:py-4 rounded-2xl sm:rounded-3xl mb-6 shadow-sm animate-fade-in-up text-sm">
            {error}
          </div>
        )}

        {loading ? (
          <div className="text-center py-16 font-bold text-gray-400 text-lg animate-pulse">Loading...</div>
        ) : (
          <>
            {/* Connection status card */}
            <div className="bg-white rounded-2xl sm:rounded-3xl border border-gray-200 p-4 sm:p-6 mb-6 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 flex-wrap mb-1.5">
                    <span className={`text-xs font-bold px-3 py-1 rounded-full border ${STATUS_STYLES[connectionStatus] || STATUS_STYLES.not_started}`}>
                      {STATUS_LABELS[connectionStatus] || connectionStatus}
                    </span>
                    {status && !status.enabled && (
                      <span className="text-xs font-bold px-3 py-1 rounded-full border bg-gray-100 text-gray-600 border-gray-200">
                        Feature disabled (WHATSAPP_INTAKE_ENABLED=false)
                      </span>
                    )}
                  </div>
                  <p className="text-xs sm:text-sm text-gray-500">
                    Provider: <span className="font-semibold text-gray-700">{status?.provider || 'whatsapp-web'}</span>
                    {status?.lastError && (
                      <span className="text-red-600 font-medium"> · Last error: {status.lastError}</span>
                    )}
                  </p>
                </div>
                <button
                  onClick={() => { refreshStatus(); refreshLogs(); }}
                  className="px-4 sm:px-5 py-2.5 rounded-2xl font-bold bg-green-600 text-white hover:bg-green-700 transition-all shadow-md shadow-green-500/10 whitespace-nowrap text-sm self-start"
                >
                  Refresh
                </button>
              </div>

              {qr && (
                <div className="mt-6 pt-6 border-t border-gray-100 flex flex-col items-center text-center">
                  <p className="text-sm font-semibold text-gray-700 mb-3">
                    Scan with the business phone: WhatsApp → Linked Devices → Link a Device
                  </p>
                  <img src={qr} alt="WhatsApp linking QR code" className="w-52 h-52 rounded-2xl border border-gray-200 shadow-sm" />
                  <p className="text-xs text-gray-400 mt-3">Refreshes automatically until the device links.</p>
                </div>
              )}

              {status?.enabled && connectionStatus === 'ready' && (
                <p className="mt-4 pt-4 border-t border-gray-100 text-sm text-green-700 font-medium">
                  Linked and listening — documents sent to the business WhatsApp number will be processed automatically.
                </p>
              )}
            </div>

            {/* Logs */}
            <div className="bg-white rounded-2xl sm:rounded-3xl border border-gray-200 p-4 sm:p-6 mb-4 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                <h2 className="text-lg font-bold text-gray-900">Recent messages</h2>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="border border-gray-200 rounded-2xl px-4 py-2 text-sm bg-gray-50/50 focus:ring-2 focus:ring-green-200 focus:outline-none transition-all shadow-sm font-bold w-full sm:w-auto"
                >
                  <option value="">All outcomes</option>
                  <option value="processed">Processed</option>
                  <option value="duplicate">Duplicate</option>
                  <option value="failed">Failed</option>
                </select>
              </div>

              {logs.length === 0 ? (
                <div className="py-12 text-center text-gray-400 font-bold">
                  No WhatsApp messages received yet.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {logs.map((log) => (
                    <div
                      key={log.id}
                      className="rounded-2xl border border-gray-200 p-3.5 sm:p-4 hover:border-gray-300 transition-all"
                    >
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="font-semibold text-gray-900 text-sm truncate">{log.originalFilename}</span>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${OUTCOME_STYLES[log.status] || OUTCOME_STYLES.received}`}>
                              {log.status}
                            </span>
                          </div>
                          <p className="text-xs text-gray-500">
                            From {log.senderNumber}
                            {log.parsedLeadCode && <> · Lead {log.parsedLeadCode}</>}
                            {log.matchedDocumentId && <> · {log.matchedDocumentId}</>}
                          </p>
                          {log.failureReason && (
                            <p className="text-xs text-red-600 mt-1 font-medium">{log.failureReason}</p>
                          )}
                        </div>
                        <p className="text-[10px] sm:text-xs text-gray-400 font-medium whitespace-nowrap shrink-0">
                          {new Date(log.receivedAt).toLocaleString('en-IN', {
                            day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                          })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
