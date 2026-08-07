import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import StatusBadge from '../components/StatusBadge';
import API_BASE from '../config/api';

// ──────────────────────────────────────────────
// Score gauge — SVG arc from 300 to 900
// ──────────────────────────────────────────────
function ScoreGauge({ score }) {
  const MIN = 300;
  const MAX = 900;
  const hasScore = score !== null && score !== undefined && Number.isFinite(Number(score));
  const numericScore = hasScore ? Number(score) : null;
  const pct = numericScore === null ? 0 : Math.max(0, Math.min(1, (numericScore - MIN) / (MAX - MIN)));
  const circumference = 2 * Math.PI * 84;
  const dashOffset = circumference * (1 - pct);

  const band = !hasScore ? { label: 'Not Available', color: '#cbd5e1' }
    : numericScore >= 800 ? { label: 'Excellent', color: '#10b981' }
    : numericScore >= 750 ? { label: 'Very Good', color: '#22c55e' }
    : numericScore >= 700 ? { label: 'Good', color: '#84cc16' }
    : numericScore >= 650 ? { label: 'Fair', color: '#eab308' }
    : numericScore >= 600 ? { label: 'Needs Attention', color: '#f97316' }
    : { label: 'Poor', color: '#ef4444' };

  return (
    <div className="relative w-48 h-48 sm:w-56 sm:h-56 mx-auto">
      <svg viewBox="0 0 200 200" className="w-full h-full -rotate-90">
        <circle cx="100" cy="100" r="84" fill="none" stroke="#f1f5f9" strokeWidth="14" />
        <circle
          cx="100" cy="100" r="84" fill="none"
          stroke={band.color} strokeWidth="14" strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={dashOffset}
          className="transition-all duration-1000 ease-out"
          style={{ filter: `drop-shadow(0 2px 6px ${band.color}55)` }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-5xl sm:text-6xl font-extrabold text-gray-900 tabular-nums">{score ?? '—'}</span>
        <span className="text-xs font-bold uppercase tracking-wider mt-1" style={{ color: band.color }}>
          {band.label}
        </span>
        <span className="text-[10px] text-gray-400 font-medium mt-1">CIBIL Score</span>
      </div>
    </div>
  );
}

// Score color helpers
const scoreColor = (s) => (s >= 750 ? 'text-emerald-600' : s >= 650 ? 'text-amber-600' : 'text-red-600');

function StatCard({ label, value, accent }) {
  return (
    <div className={`bg-white rounded-2xl border p-4 shadow-sm hover:shadow-md transition-shadow ${accent || 'border-gray-200'}`}>
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{label}</p>
      <p className="text-xl sm:text-2xl font-extrabold text-gray-900 mt-1 tabular-nums">{value}</p>
    </div>
  );
}

function SectionCard({ title, icon, children }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 sm:p-6">
      <div className="flex items-center gap-2.5 mb-4">
        <span className="text-lg">{icon}</span>
        <h3 className="font-bold text-gray-900">{title}</h3>
      </div>
      {children}
    </div>
  );
}

const fmtMoney = (v) => {
  if (v === null || v === undefined || v === '') return '—';
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  return n === 0 ? '₹0' : `₹${n.toLocaleString('en-IN')}`;
};

export default function CibilReportPage() {
  const { accessToken, isImpersonating, impersonating } = useAuth();

  // Lead selection
  const [leads, setLeads] = useState([]);
  const [leadsLoading, setLeadsLoading] = useState(false);
  const [selectedLead, setSelectedLead] = useState(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const dropdownRef = useRef(null);

  // Upload
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const fileInputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);

  // Reports
  const [reports, setReports] = useState([]);
  const [loadingReports, setLoadingReports] = useState(false);
  const [activeReport, setActiveReport] = useState(null);

  // Documents for AI generation
  const [documents, setDocuments] = useState([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [generating, setGenerating] = useState(false);

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!accessToken) return;
    fetchEligibleLeads();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  const fetchEligibleLeads = async () => {
    setLeadsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/leads`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const data = await res.json();
      const allLeads = data.data || [];

      const executiveName = isImpersonating ? impersonating?.name : null;
      const filtered = executiveName
        ? allLeads.filter(l => l.assignedTo === executiveName)
        : allLeads;

      setLeads(filtered.filter(l => l.isActive !== false));
    } catch (err) {
      setError('Failed to load leads');
    } finally {
      setLeadsLoading(false);
    }
  };

  const fetchReports = async (leadId) => {
    setLoadingReports(true);
    try {
      const res = await fetch(`${API_BASE}/cibil/lead/${leadId}`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const data = await res.json();
      const list = data.data || [];
      setReports(list);
      setActiveReport(list.length > 0 ? list[0] : null);
    } catch (err) {
      setReports([]);
      setActiveReport(null);
    } finally {
      setLoadingReports(false);
    }
  };

  const fetchDocuments = async (leadId) => {
    setDocsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/cibil/lead/${leadId}/documents`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const data = await res.json();
      setDocuments(data.data || []);
    } catch (err) {
      setDocuments([]);
    } finally {
      setDocsLoading(false);
    }
  };

  const handleSelectLead = (lead) => {
    setSelectedLead(lead);
    setDropdownOpen(false);
    setSearchTerm('');
    setError('');
    setSuccess('');
    setReports([]);
    setActiveReport(null);
    setDocuments([]);
    fetchReports(lead.id);
    fetchDocuments(lead.id);
  };

  const handleClearLead = () => {
    setSelectedLead(null);
    setReports([]);
    setActiveReport(null);
    setDocuments([]);
    setError('');
    setSuccess('');
  };

  // ── Upload + parse ──
  const uploadFile = async (file) => {
    if (!selectedLead) {
      setError('Please select a lead first.');
      return;
    }
    if (!file) return;

    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    const isImage = /image\/(png|jpe?g)/.test(file.type);

    if (!isPdf && !isImage) {
      setError('Please upload a PDF or image of the CIBIL report.');
      return;
    }

    setUploading(true);
    setError('');
    setSuccess('');
    setUploadProgress(`Parsing ${file.name} with AI… this takes ~20-40 seconds`);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('leadId', selectedLead.id);

      const res = await fetch(`${API_BASE}/cibil/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
        body: formData
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to upload CIBIL report');
      }

      setSuccess(`CIBIL report parsed successfully${data.data?.cibil_score ? ` — Score ${data.data.cibil_score}` : ''}!`);
      setUploadProgress('');
      await fetchReports(selectedLead.id);
    } catch (err) {
      setError(err.message || 'Failed to parse CIBIL report');
      setUploadProgress('');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleFileDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) uploadFile(file);
  };

  // ── Generate from documents ──
  const generateReport = async () => {
    if (!selectedLead) {
      setError('Please select a lead first.');
      return;
    }
    if (documents.length === 0) {
      setError('No documents uploaded for this lead. Upload documents in the Checklists page first.');
      return;
    }

    setGenerating(true);
    setError('');
    setSuccess('');
    try {
      const res = await fetch(`${API_BASE}/cibil/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({ leadId: selectedLead.id })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to generate CIBIL report');
      }
      setSuccess(`AI credit profile generated${data.data?.cibil_score ? ` — Estimated score ${data.data.cibil_score}` : ''}!`);
      await fetchReports(selectedLead.id);
    } catch (err) {
      setError(err.message || 'Failed to generate CIBIL report');
    } finally {
      setGenerating(false);
    }
  };

  // ── Actions ──
  const handleDownload = async (report) => {
    try {
      const res = await fetch(`${API_BASE}/cibil/${report.id}/file`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to download');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = report.file_name || 'cibil-report';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message || 'Failed to download report');
    }
  };

  const handleDelete = async (report) => {
    if (!window.confirm('Delete this CIBIL report and its parsed data?')) return;
    try {
      const res = await fetch(`${API_BASE}/cibil/${report.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (res.ok) {
        setSuccess('CIBIL report deleted.');
        const remaining = reports.filter(r => r.id !== report.id);
        setReports(remaining);
        setActiveReport(remaining.length > 0 ? remaining[0] : null);
      } else {
        const errData = await res.json();
        setError(errData.error || 'Failed to delete report');
      }
    } catch (err) {
      setError('Failed to delete report');
    }
  };

  const filteredLeads = leads.filter(l =>
    !searchTerm ||
    l.customerName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    l.mobile?.includes(searchTerm) ||
    l.loanType?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const rp = activeReport?.report_data || {};
  const accounts = rp.accounts || [];
  const enquiries = rp.enquiries || [];

  return (
    <div className="py-6 sm:py-10 px-3 sm:px-6">
      {/* Header */}
      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">CIBIL Report</h1>
        <p className="text-xs sm:text-base text-gray-500 mt-1">
          Generate an estimated credit profile from the customer's documents — or upload their CIBIL PDF and let AI extract the score, accounts &amp; enquiries.
        </p>
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-2xl mb-6 text-sm flex items-start justify-between gap-3">
          <span>{error}</span>
          <button onClick={() => setError('')} className="font-bold">&times;</button>
        </div>
      )}
      {success && (
        <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded-2xl mb-6 text-sm flex items-start justify-between gap-3">
          <span>{success}</span>
          <button onClick={() => setSuccess('')} className="font-bold">&times;</button>
        </div>
      )}

      {/* Lead selector */}
      <div ref={dropdownRef} className="relative mb-8 max-w-2xl mx-auto">
        <label className="block text-sm font-semibold text-gray-700 mb-2">
          Select Lead
          {leads.length > 0 && (
            <span className="text-gray-400 font-normal ml-2">({leads.length} available)</span>
          )}
        </label>
        <div
          className={`flex items-center bg-white border-2 rounded-2xl px-4 py-3 cursor-pointer transition-all
            ${dropdownOpen ? 'border-blue-500 shadow-lg shadow-blue-100' : 'border-gray-200 hover:border-gray-300 shadow-sm'}`}
          onClick={() => { if (!leadsLoading) setDropdownOpen(!dropdownOpen); }}
        >
          {selectedLead ? (
            <div className="flex-1 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-sm">
                  {selectedLead.customerName?.charAt(0)?.toUpperCase() || '?'}
                </div>
                <div>
                  <p className="font-semibold text-gray-900 text-sm">{selectedLead.customerName}</p>
                  <p className="text-xs text-gray-500">{selectedLead.mobile}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="hidden sm:inline text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded-full">
                  {selectedLead.loanType?.replace(/_/g, ' ')}
                </span>
                <StatusBadge status={selectedLead.status} />
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center gap-3 text-gray-400">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              {leadsLoading ? 'Loading leads...' : 'Search and select a lead...'}
            </div>
          )}
          <svg className={`w-5 h-5 text-gray-400 transition-transform ml-2 ${dropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>

        {selectedLead && (
          <button
            onClick={(e) => { e.stopPropagation(); handleClearLead(); }}
            className="absolute right-12 top-[46px] -translate-y-1/2 p-1 text-gray-400 hover:text-red-500 transition-colors"
            title="Clear selection"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}

        {dropdownOpen && (
          <div className="absolute z-20 mt-2 w-full bg-white border border-gray-200 rounded-2xl shadow-xl overflow-hidden">
            <div className="p-3 border-b border-gray-100">
              <div className="relative">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  placeholder="Search by name, mobile, or loan type..."
                  className="w-full pl-10 pr-4 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  autoFocus
                />
              </div>
            </div>
            <div className="max-h-72 overflow-y-auto">
              {leadsLoading ? (
                <div className="p-6 text-center text-gray-500 text-sm">Loading leads...</div>
              ) : filteredLeads.length === 0 ? (
                <div className="p-6 text-center text-gray-400 text-sm">
                  {searchTerm ? 'No leads match your search.' : 'No active leads found.'}
                </div>
              ) : (
                filteredLeads.map(lead => (
                  <div
                    key={lead.id}
                    onClick={(e) => { e.stopPropagation(); handleSelectLead(lead); }}
                    className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors hover:bg-blue-50 border-b border-gray-50 last:border-0
                      ${selectedLead?.id === lead.id ? 'bg-blue-50' : ''}`}
                  >
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex-shrink-0 flex items-center justify-center text-white font-bold text-sm">
                      {lead.customerName?.charAt(0)?.toUpperCase() || '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-gray-900 text-sm truncate">{lead.customerName}</p>
                        <StatusBadge status={lead.status} />
                      </div>
                      <p className="text-xs text-gray-500 truncate">
                        {lead.mobile}
                        {lead.loanType && <span className="mx-1.5">&middot;</span>}
                        {lead.loanType && <span className="capitalize">{lead.loanType.replace(/_/g, ' ')}</span>}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {!selectedLead ? (
        <div className="text-center py-16 border-2 border-dashed border-gray-200 rounded-3xl bg-white/50">
          <div className="text-5xl mb-3">🧠</div>
          <p className="text-gray-500 font-semibold">Select a lead above to generate or view its credit report.</p>
          <p className="text-gray-400 text-sm mt-1">The AI builds an estimated CIBIL profile from the customer's uploaded documents.</p>
        </div>
      ) : (
        <div className="space-y-6 max-w-5xl mx-auto">
          {/* AI Generate panel — primary action */}
          <div className="bg-gradient-to-br from-violet-50 to-indigo-50/40 border border-violet-200 rounded-3xl shadow-sm p-6 sm:p-8">
            <div className="flex items-start gap-4 flex-col sm:flex-row sm:items-center">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-600 text-white shadow-lg shadow-violet-200 shrink-0">
                <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" />
                </svg>
              </div>
              <div className="flex-1">
                <h2 className="text-xl font-bold text-gray-900">AI Credit Report Generator</h2>
                <p className="text-sm text-gray-600 mt-1">
                  Generate an estimated CIBIL credit profile from this lead's uploaded documents — no CIBIL PDF required.
                </p>
              </div>
            </div>

            {docsLoading ? (
              <div className="mt-5 text-sm text-gray-500 animate-pulse">Loading uploaded documents...</div>
            ) : documents.length === 0 ? (
              <div className="mt-5 rounded-2xl bg-white/70 border border-violet-100 p-4 text-sm text-gray-500">
                No documents uploaded for this lead yet.{' '}
                <span className="font-semibold text-gray-700">Upload documents in the Checklists page first</span> (bank statements, salary slips, loan documents, KYC), then come back here to generate.
              </div>
            ) : (
              <div className="mt-5">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className="text-sm text-gray-600">
                    <span className="font-bold text-gray-900">{documents.length}</span> document{documents.length > 1 ? 's' : ''} available:
                  </div>
                  <button
                    onClick={generateReport}
                    disabled={generating}
                    className="px-5 py-2.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold rounded-xl text-sm shadow-lg shadow-violet-200 transition-all hover:scale-[1.02] active:scale-[0.98]"
                  >
                    {generating ? 'Generating…' : '✨ Generate Report from Documents'}
                  </button>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {documents.slice(0, 8).map(d => (
                    <span key={d.id} className="inline-flex items-center gap-1.5 bg-white border border-gray-200 rounded-full px-3 py-1 text-xs text-gray-600">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      {d.document_name || d.document_id}
                    </span>
                  ))}
                  {documents.length > 8 && (
                    <span className="text-xs text-gray-400 self-center">+{documents.length - 8} more</span>
                  )}
                </div>
                {generating && (
                  <div className="mt-4 rounded-2xl bg-white/80 border border-violet-100 p-4 flex items-center gap-3">
                    <div className="inline-block animate-spin rounded-full h-5 w-5 border-2 border-violet-600 border-t-transparent" />
                    <p className="text-sm text-gray-600 font-medium">
                      Analyzing {documents.length} document{documents.length > 1 ? 's' : ''} with AI… this takes 30–60 seconds
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Upload zone — optional secondary (only if customer provides an actual CIBIL PDF) */}
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wide">Optional — upload an actual CIBIL PDF</h3>
            <span className="text-[10px] font-semibold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">if the customer provides one</span>
          </div>
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleFileDrop}
            onClick={() => { if (!uploading) fileInputRef.current?.click(); }}
            className={`border-2 border-dashed rounded-3xl p-6 sm:p-10 text-center cursor-pointer transition-all
              ${dragOver ? 'border-blue-500 bg-blue-50 scale-[1.01] shadow-lg shadow-blue-100' : 'border-gray-200 bg-white hover:border-blue-400 hover:bg-blue-50/40'}`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,image/png,image/jpeg"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && uploadFile(e.target.files[0])}
              disabled={uploading}
            />
            {uploading ? (
              <div className="py-4">
                <div className="inline-block animate-spin rounded-full h-10 w-10 border-4 border-blue-500 border-t-transparent mb-4" />
                <p className="font-semibold text-gray-700">{uploadProgress || 'Uploading...'}</p>
                <p className="text-sm text-gray-400 mt-1">This usually takes 20-40 seconds.</p>
              </div>
            ) : (
              <>
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white mb-4 shadow-lg shadow-blue-200">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                  </svg>
                </div>
                <p className="font-bold text-gray-800 text-lg">Upload CIBIL Report</p>
                <p className="text-sm text-gray-500 mt-1">Drop the PDF here, or click to browse</p>
                <p className="text-xs text-gray-400 mt-3">
                  PDF or PNG/JPG · Max 20MB · The report will be parsed with AI and saved to this lead
                </p>
              </>
            )}
          </div>

          {/* Reports list */}
          {reports.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide mr-1">History:</span>
              {reports.map(r => (
                <button
                  key={r.id}
                  onClick={() => setActiveReport(r)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all
                    ${activeReport?.id === r.id
                      ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300 hover:text-blue-700'}`}
                >
                  {r.cibil_score ? `${r.cibil_score} pts` : (r.file_path ? 'Parsed' : 'Generated')} · {new Date(r.parsed_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                </button>
              ))}
            </div>
          )}

          {loadingReports ? (
            <div className="text-center py-12 text-gray-400 font-semibold animate-pulse">Loading CIBIL reports...</div>
          ) : !activeReport ? (
            <div className="text-center py-10 text-gray-400 font-medium border-2 border-dashed border-gray-200 rounded-3xl">
              No CIBIL report uploaded for this lead yet.
            </div>
          ) : (
            <>
              {/* Score hero */}
              <div className="bg-gradient-to-br from-white to-blue-50/40 rounded-3xl border border-gray-200 shadow-sm p-6 sm:p-8">
                <div className="flex flex-col sm:flex-row items-center justify-center gap-8 sm:gap-12">
                  <ScoreGauge score={rp.cibil_score} />
                  <div className="flex-1 w-full max-w-md">
                    <div className="flex items-center gap-3 mb-4">
                      <span className="text-2xl">👤</span>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-lg font-extrabold text-gray-900">{rp.consumer?.name || selectedLead.customerName}</p>
                          {!activeReport.file_path && (
                            <span className="text-[10px] font-bold uppercase tracking-wide bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full">AI Generated · Estimated</span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500">
                          Report generated: {rp.report_generated_on || '—'}
                        </p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                      <div><span className="text-gray-400 font-medium">DOB</span><p className="font-semibold text-gray-800">{rp.consumer?.dob || '—'}</p></div>
                      <div><span className="text-gray-400 font-medium">PAN</span><p className="font-semibold text-gray-800 uppercase">{rp.consumer?.pan_number || '—'}</p></div>
                      <div><span className="text-gray-400 font-medium">Gender</span><p className="font-semibold text-gray-800">{rp.consumer?.gender || '—'}</p></div>
                      <div><span className="text-gray-400 font-medium">Employment</span><p className="font-semibold text-gray-800">{rp.consumer?.employment || '—'}</p></div>
                      <div className="col-span-2"><span className="text-gray-400 font-medium">Address</span><p className="font-semibold text-gray-800">{rp.consumer?.address || '—'}</p></div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Credit summary */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                <StatCard label="Accounts" value={rp.credit_summary?.total_accounts ?? '—'} accent="border-blue-200" />
                <StatCard label="Active" value={rp.credit_summary?.active_accounts ?? '—'} accent="border-emerald-200" />
                <StatCard label="Closed" value={rp.credit_summary?.closed_accounts ?? '—'} accent="border-gray-200" />
                <StatCard label="Written Off" value={rp.credit_summary?.written_off_accounts ?? '—'} accent={(rp.credit_summary?.written_off_accounts || 0) > 0 ? 'border-red-300' : 'border-gray-200'} />
                <StatCard label="Outstanding" value={fmtMoney(rp.credit_summary?.total_outstanding)} accent="border-amber-200" />
                <StatCard label="Enquiries" value={rp.credit_summary?.total_enquiries ?? '—'} accent="border-violet-200" />
              </div>

              {/* Accounts */}
              <SectionCard title={`Accounts (${accounts.length})`} icon="🏦">
                {accounts.length === 0 ? (
                  <p className="text-sm text-gray-400">No accounts found in the report.</p>
                ) : (
                  <div className="overflow-x-auto -mx-2">
                    <table className="w-full text-sm min-w-[640px]">
                      <thead>
                        <tr className="text-left text-xs text-gray-400 uppercase tracking-wide border-b border-gray-100">
                          <th className="px-2 py-2.5 font-semibold">Lender</th>
                          <th className="px-2 py-2.5 font-semibold">Type</th>
                          <th className="px-2 py-2.5 font-semibold">A/c No.</th>
                          <th className="px-2 py-2.5 font-semibold">Opened</th>
                          <th className="px-2 py-2.5 font-semibold">Status</th>
                          <th className="px-2 py-2.5 font-semibold">DPD</th>
                          <th className="px-2 py-2.5 font-semibold text-right">Sanctioned</th>
                          <th className="px-2 py-2.5 font-semibold text-right">Balance</th>
                        </tr>
                      </thead>
                      <tbody>
                        {accounts.map((a, i) => (
                          <tr key={i} className="border-b border-gray-50 hover:bg-blue-50/40 transition-colors">
                            <td className="px-2 py-3 font-semibold text-gray-800">{a.lender}</td>
                            <td className="px-2 py-3 text-gray-600">{a.account_type || '—'}</td>
                            <td className="px-2 py-3 text-gray-500 tabular-nums">{a.account_number || '—'}</td>
                            <td className="px-2 py-3 text-gray-500">{a.opened_date || '—'}</td>
                            <td className="px-2 py-3">
                              <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${(a.status || '').toLowerCase().includes('written') || (a.status || '').toLowerCase().includes('settle')
                                ? 'bg-red-100 text-red-700'
                                : (a.status || '').toLowerCase().includes('closed')
                                  ? 'bg-gray-100 text-gray-600'
                                  : 'bg-emerald-100 text-emerald-700'}`}>
                                {a.status || '—'}
                              </span>
                            </td>
                            <td className={`px-2 py-3 tabular-nums font-semibold ${a.days_past_due > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                              {a.days_past_due || 0}
                            </td>
                            <td className="px-2 py-3 text-right tabular-nums text-gray-600">{fmtMoney(a.amount_sanctioned)}</td>
                            <td className="px-2 py-3 text-right tabular-nums font-semibold text-gray-800">{fmtMoney(a.current_balance)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </SectionCard>

              {/* Enquiries */}
              <SectionCard title={`Credit Enquiries (${enquiries.length})`} icon="🔎">
                {enquiries.length === 0 ? (
                  <p className="text-sm text-gray-400">No enquiries found in the report.</p>
                ) : (
                  <div className="overflow-x-auto -mx-2">
                    <table className="w-full text-sm min-w-[480px]">
                      <thead>
                        <tr className="text-left text-xs text-gray-400 uppercase tracking-wide border-b border-gray-100">
                          <th className="px-2 py-2.5 font-semibold">Institution</th>
                          <th className="px-2 py-2.5 font-semibold">Date</th>
                          <th className="px-2 py-2.5 font-semibold">Purpose</th>
                          <th className="px-2 py-2.5 font-semibold text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {enquiries.map((en, i) => (
                          <tr key={i} className="border-b border-gray-50 hover:bg-violet-50/40 transition-colors">
                            <td className="px-2 py-3 font-semibold text-gray-800">{en.institution}</td>
                            <td className="px-2 py-3 text-gray-500">{en.date || '—'}</td>
                            <td className="px-2 py-3 text-gray-600">{en.purpose || '—'}</td>
                            <td className="px-2 py-3 text-right tabular-nums text-gray-600">{fmtMoney(en.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </SectionCard>

              {/* Underwriting notes */}
              {rp.notes && (
                <div className="bg-gradient-to-br from-amber-50 to-orange-50/40 border border-amber-200 rounded-2xl p-5 sm:p-6 shadow-sm">
                  <div className="flex items-center gap-2.5 mb-3">
                    <span className="text-lg">📝</span>
                    <h3 className="font-bold text-gray-900">Underwriting Note</h3>
                  </div>
                  <p className="text-sm text-gray-700 leading-relaxed">{rp.notes}</p>
                </div>
              )}

              {/* Actions */}
              <div className="flex flex-wrap gap-3">
                {activeReport.file_path && (
                  <button
                    onClick={() => handleDownload(activeReport)}
                    className="px-4 py-2.5 bg-white border border-gray-200 hover:border-blue-300 hover:text-blue-700 text-gray-700 font-semibold rounded-xl text-sm transition-all shadow-sm"
                  >
                    ⬇️ Download Original Report
                  </button>
                )}
                {accessToken && (
                  <button
                    onClick={() => handleDelete(activeReport)}
                    className="px-4 py-2.5 bg-red-50 border border-red-200 hover:bg-red-100 text-red-600 font-semibold rounded-xl text-sm transition-all"
                  >
                    🗑 Delete Report
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
