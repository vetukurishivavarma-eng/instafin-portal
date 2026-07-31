import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import StatusBadge from '../components/StatusBadge';
import API_BASE from '../config/api';

// Category icon colors used for the grouped document sections
const CATEGORY_STYLES = {
  'KYC Documents': { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', icon: 'user' },
  'Income Proof': { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200', icon: 'currency' },
  'Business Documents': { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', icon: 'briefcase' },
  'Property Documents': { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200', icon: 'home' },
  'Financial Documents': { bg: 'bg-teal-50', text: 'text-teal-700', border: 'border-teal-200', icon: 'calculator' },
  'Existing Loan Documents': { bg: 'bg-cyan-50', text: 'text-cyan-700', border: 'border-cyan-200', icon: 'bank' },
  'Sanction Letters': { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', icon: 'document' },
  'Other Documents': { bg: 'bg-slate-50', text: 'text-slate-700', border: 'border-slate-200', icon: 'folder' },
};

const DEFAULT_CATEGORY_STYLE = { bg: 'bg-slate-50', text: 'text-slate-700', border: 'border-slate-200', icon: 'folder' };

function CategoryIcon({ name }) {
  const icon = CATEGORY_STYLES[name]?.icon || 'folder';
  const paths = {
    user: <><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" /></>,
    currency: <><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></>,
    briefcase: <><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 00.75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 00-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0112 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 01-.673-.38m0 0A2.18 2.18 0 013 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 013.413-.387m7.5 0V5.25A2.25 2.25 0 0013.5 3h-3a2.25 2.25 0 00-2.25 2.25v.894m7.5 0a48.667 48.667 0 00-7.5 0M12 12.75h.008v.008H12v-.008z" /></>,
    home: <><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" /></>,
    calculator: <><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 15.75V18m-7.5-6.75h.008v.008H8.25v-.008zm0 2.25h.008v.008H8.25V13.5zm0 2.25h.008v.008H8.25v-.008zm0 2.25h.008v.008H8.25V18zm2.498-6.75h.007v.008h-.007v-.008zm0 2.25h.007v.008h-.007V13.5zm0 2.25h.007v.008h-.007v-.008zm0 2.25h.007v.008h-.007V18zm2.504-6.75h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V13.5zm0 2.25h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V18zm2.498-6.75h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V13.5zM8.25 6h7.5v2.25h-7.5V6zM12 2.25c-1.892 0-3.758.11-5.593.322C5.307 2.7 4.5 3.65 4.5 4.757V19.5a2.25 2.25 0 002.25 2.25h10.5a2.25 2.25 0 002.25-2.25V4.757c0-1.108-.806-2.057-1.907-2.185A48.507 48.507 0 0012 2.25z" /></>,
    bank: <><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" /></>,
    document: <><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></>,
    folder: <><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" /></>,
  };
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
      {paths[icon] || paths.folder}
    </svg>
  );
}

function FileTypeIcon({ name }) {
  const lower = (name || '').toLowerCase();
  if (lower.includes('.pdf')) {
    return <svg className="w-4 h-4 text-red-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>;
  }
  if (lower.includes('.jpg') || lower.includes('.jpeg') || lower.includes('.png')) {
    return <svg className="w-4 h-4 text-purple-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" /></svg>;
  }
  return <svg className="w-4 h-4 text-blue-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m.75 12l3 3m0 0l3-3m-3 3v-6m-1.5-9H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>;
}

export default function LeadArchivesPage() {
  const { accessToken } = useAuth();
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedLead, setExpandedLead] = useState(null);
  const [viewDoc, setViewDoc] = useState(null);
  const [downloadingZip, setDownloadingZip] = useState(null);
  const hasSearchedRef = useRef(false);

  const fetchArchives = async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (searchTerm.trim()) params.set('search', searchTerm.trim());
      const res = await fetch(`${API_BASE}/archives/leads${params.toString() ? `?${params}` : ''}`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to load archives');
      }
      const data = await res.json();
      setLeads(data.data || []);
    } catch (err) {
      setError(err.message || 'Failed to load lead archives');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!accessToken) return;
    fetchArchives();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  // Debounce search - skip the initial mount fetch (handled by the accessToken effect above)
  useEffect(() => {
    if (!hasSearchedRef.current) {
      hasSearchedRef.current = true;
      return;
    }
    if (!accessToken) return;
    setExpandedLead(null);
    const timer = setTimeout(() => {
      fetchArchives();
    }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm]);

  // Group documents by category label
  const groupedDocs = useMemo(() => {
    if (!expandedLead) return [];
    const groups = {};
    (expandedLead.documents || []).forEach((doc) => {
      const label = doc.categoryLabel || 'Other Documents';
      if (!groups[label]) groups[label] = [];
      groups[label].push(doc);
    });
    return Object.entries(groups).map(([label, docs]) => ({
      label,
      docs,
      style: CATEGORY_STYLES[label] || DEFAULT_CATEGORY_STYLE,
    }));
  }, [expandedLead]);

  const handleViewDocument = async (fileId, docName) => {
    setViewDoc({ id: fileId, name: docName, url: null, loading: true });
    try {
      const res = await fetch(`${API_BASE}/checklist-status/file/${fileId}`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (!res.ok) throw new Error('Failed to load document');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setViewDoc(prev => ({ ...prev, url, loading: false }));
    } catch (err) {
      setError('Failed to load document');
      setViewDoc(null);
    }
  };

  const handleDownloadZip = async (lead) => {
    if (!lead.documents || lead.documents.length === 0) {
      setError('No documents uploaded for this lead.');
      setTimeout(() => setError(''), 4000);
      return;
    }
    setDownloadingZip(lead.id);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/archives/leads/${lead.id}/zip`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to create ZIP');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${lead.customerName || 'Lead'}-documents.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (err) {
      setError(err.message || 'Failed to download ZIP');
      setTimeout(() => setError(''), 5000);
    } finally {
      setDownloadingZip(null);
    }
  };

  const totalDocCount = (lead) => (lead.documents || []).length;

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50/60 via-white to-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2.5">
              <span className="w-10 h-10 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-lg shadow-blue-200">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.8">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
                </svg>
              </span>
              Lead Archives
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              All uploaded documents for every lead — regardless of status — organized by section. Download everything for a lead as a single ZIP file.
            </p>
          </div>
          <button
            onClick={fetchArchives}
            disabled={loading}
            className="flex-shrink-0 inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-xl font-semibold text-sm hover:bg-gray-50 hover:border-gray-300 transition-colors disabled:opacity-50 shadow-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
            </svg>
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        {error && (
          <div className="mb-5 p-3.5 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex items-center gap-2.5">
            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
            {error}
            <button onClick={() => setError('')} className="ml-auto text-red-500 hover:text-red-700 font-semibold">✕</button>
          </div>
        )}

        {/* Search bar */}
        <div className="relative max-w-xl mb-6">
          <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by customer name or mobile number..."
            className="w-full pl-11 pr-10 py-3 bg-white border border-gray-200 rounded-2xl shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              title="Clear search"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Leads list */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24">
            <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-4" />
            <p className="text-sm text-gray-500">Loading archives...</p>
          </div>
        ) : leads.length === 0 ? (
          <div className="text-center py-24 bg-white border border-gray-200 rounded-3xl">
            <div className="w-16 h-16 mx-auto mb-4 bg-blue-50 rounded-2xl flex items-center justify-center">
              <svg className="w-8 h-8 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-800">No leads found</h3>
            <p className="text-sm text-gray-500 mt-1">
              {searchTerm ? `No leads match "${searchTerm}". Try a different name or mobile number.` : 'No leads with uploaded documents yet.'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {leads.map((lead) => {
              const docCount = totalDocCount(lead);
              const isExpanded = expandedLead?.id === lead.id;
              return (
                <div
                  key={lead.id}
                  className={`bg-white border rounded-2xl overflow-hidden transition-all shadow-sm ${
                    isExpanded ? 'border-blue-300 shadow-lg shadow-blue-100/50 ring-1 ring-blue-200' : 'border-gray-200 hover:border-blue-200'
                  }`}
                >
                  {/* Lead header row */}
                  <div
                    className="px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3 cursor-pointer hover:bg-blue-50/40 transition-colors"
                    onClick={() => setExpandedLead(isExpanded ? null : lead)}
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0 ${
                        docCount > 0 ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500'
                      }`}>
                        {(lead.customerName || '?').charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold text-gray-900 truncate">{lead.customerName || 'Unknown'}</h3>
                          <StatusBadge status={lead.status} />
                          {lead.isClosed && (
                            <span className="bg-gray-800 text-white px-2.5 py-0.5 rounded-lg text-[10px] font-semibold">CLOSED</span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-gray-500 mt-1 flex-wrap">
                          {lead.mobile && <span>{lead.mobile}</span>}
                          {lead.loanType && <span className="capitalize">{lead.loanType.replace(/_/g, ' ')}</span>}
                          {lead.assignedTo && <span>Assigned: {lead.assignedTo}</span>}
                          {lead.entryDate && (
                            <span>Entry: {new Date(lead.entryDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold ${
                        docCount > 0 ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-gray-50 text-gray-500 border border-gray-200'
                      }`}>
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75" />
                        </svg>
                        {docCount} document{docCount !== 1 ? 's' : ''}
                      </span>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDownloadZip(lead); }}
                        disabled={downloadingZip === lead.id || docCount === 0}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm shadow-blue-100"
                        title={docCount === 0 ? 'No documents to download' : 'Download all documents as ZIP (organized by section)'}
                      >
                        {downloadingZip === lead.id ? (
                          <>
                            <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                            Zipping...
                          </>
                        ) : (
                          <>
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                            </svg>
                            Download ZIP
                          </>
                        )}
                      </button>
                      <svg
                        className={`w-5 h-5 text-gray-400 transition-transform duration-200 flex-shrink-0 ${isExpanded ? 'rotate-180' : ''}`}
                        fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                      </svg>
                    </div>
                  </div>

                  {/* Expanded documents grouped by category */}
                  {isExpanded && (
                    <div className="border-t border-gray-100 bg-gray-50/60 px-5 py-4 animate-fadeIn">
                      {groupedDocs.length === 0 ? (
                        <p className="text-sm text-gray-500 text-center py-6">No documents uploaded for this lead.</p>
                      ) : (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                          {groupedDocs.map((group) => (
                            <div key={group.label} className={`bg-white border ${group.style.border} rounded-xl overflow-hidden`}>
                              <div className={`px-3.5 py-2.5 flex items-center gap-2.5 ${group.style.bg} border-b ${group.style.border}`}>
                                <span className={`${group.style.text}`}>
                                  <CategoryIcon name={group.label} />
                                </span>
                                <h4 className={`text-xs font-bold uppercase tracking-wide ${group.style.text}`}>
                                  {group.label}
                                </h4>
                                <span className={`ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-full ${group.style.bg} ${group.style.text} border ${group.style.border}`}>
                                  {group.docs.length}
                                </span>
                              </div>
                              <div className="divide-y divide-gray-50">
                                {group.docs.map((doc) => (
                                  <div key={doc.id} className="px-3.5 py-2.5 flex items-center gap-2.5 hover:bg-gray-50 transition-colors">
                                    <FileTypeIcon name={doc.originalFile || doc.documentName} />
                                    <div className="flex-1 min-w-0">
                                      <p className="text-xs font-medium text-gray-800 truncate">
                                        {doc.description || doc.documentName || 'Document'}
                                      </p>
                                      {doc.uploadedAt && (
                                        <p className="text-[10px] text-gray-400">
                                          {new Date(doc.uploadedAt).toLocaleString('en-IN', {
                                            day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
                                          })}
                                        </p>
                                      )}
                                    </div>
                                    <button
                                      onClick={() => handleViewDocument(doc.id, doc.description || doc.documentName || 'Document')}
                                      className="text-[11px] text-blue-700 font-semibold bg-blue-50 px-2.5 py-1 rounded-lg hover:bg-blue-100 transition-colors flex-shrink-0"
                                    >
                                      View
                                    </button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Document viewer modal */}
        {viewDoc && (
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fadeIn"
            onClick={() => { if (viewDoc.url) URL.revokeObjectURL(viewDoc.url); setViewDoc(null); }}
          >
            <div
              className="bg-white rounded-3xl shadow-2xl max-w-5xl w-full mx-4 max-h-[90vh] flex flex-col overflow-hidden animate-slideUp"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 bg-gray-50/80">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <FileTypeIcon name={viewDoc.name} />
                  <div className="min-w-0">
                    <h3 className="text-base font-bold text-gray-900 truncate">{viewDoc.name || 'Document'}</h3>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {viewDoc.url && !viewDoc.loading && (
                    <a
                      href={viewDoc.url}
                      download={viewDoc.name || 'document'}
                      className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      title="Download"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                      </svg>
                    </a>
                  )}
                  <button
                    onClick={() => { if (viewDoc.url) URL.revokeObjectURL(viewDoc.url); setViewDoc(null); }}
                    className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                    title="Close"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-auto bg-gray-100 p-4 sm:p-6">
                {viewDoc.loading ? (
                  <div className="flex flex-col items-center justify-center py-20">
                    <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-3" />
                    <p className="text-sm text-gray-500">Loading document...</p>
                  </div>
                ) : viewDoc.url && (viewDoc.name || '').toLowerCase().match(/\.(jpg|jpeg|png)$/) ? (
                  <img src={viewDoc.url} alt={viewDoc.name} className="mx-auto max-h-[70vh] rounded-xl shadow-lg object-contain" />
                ) : (
                  <iframe
                    src={viewDoc.url}
                    title={viewDoc.name || 'Document'}
                    className="w-full h-[70vh] rounded-xl bg-white shadow-lg"
                  />
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
