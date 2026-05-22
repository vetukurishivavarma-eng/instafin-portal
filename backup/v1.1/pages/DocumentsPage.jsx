import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';

const API_BASE = 'http://localhost:3001/api';

export default function DocumentsPage() {
  const { accessToken, isAdmin, refreshAccessToken } = useAuth();
  const [leads, setLeads] = useState([]);
  const [selectedLead, setSelectedLead] = useState('');
  const [selectedLoan, setSelectedLoan] = useState('');
  const [checklist, setChecklist] = useState([]);
  const [uploadedDocs, setUploadedDocs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  // Get selected lead object for auto-populating loan type
  const selectedLeadObj = leads.find(l => l.id === selectedLead);

  const handleLeadChange = (leadId) => {
    setSelectedLead(leadId);
    const lead = leads.find(l => l.id === leadId);
    if (lead && lead.loanType) {
      setSelectedLoan(lead.loanType);
    } else {
      setSelectedLoan('');
    }
    setUploadedDocs([]);
    setChecklist([]);
  };

  const handleClear = () => {
    setSelectedLead('');
    setSelectedLoan('');
    setUploadedDocs([]);
    setChecklist([]);
  };

  const fetchWithAuth = async (url, options = {}) => {
    const res = await fetch(url, {
      ...options,
      headers: { ...options.headers, Authorization: `Bearer ${accessToken}` }
    });
    if (res.status === 401) {
      const refreshed = await refreshAccessToken();
      if (!refreshed) {
        setError('Session expired. Please login again.');
        throw new Error('Session expired');
      }
      throw new Error('Token refreshed');
    }
    return res;
  };

  useEffect(() => {
    if (!accessToken) return;
    setError('');
    fetchWithAuth(`${API_BASE}/leads`)
      .then(r => r.json())
      .then(data => setLeads(data.data || []))
      .catch(() => {});
  }, [accessToken]);

  useEffect(() => {
    if (!selectedLoan || !accessToken) {
      setChecklist([]);
      return;
    }
    fetchWithAuth(`${API_BASE}/documents/checklist?loanType=${encodeURIComponent(selectedLoan)}`)
      .then(r => r.json())
      .then(data => setChecklist(Array.isArray(data) ? data : []))
      .catch(() => setChecklist([]));
  }, [selectedLoan, accessToken]);

  useEffect(() => {
    if (!selectedLead || !accessToken) {
      setUploadedDocs([]);
      return;
    }
    fetchWithAuth(`${API_BASE}/documents/lead/${selectedLead}`)
      .then(r => r.json())
      .then(data => {
        const docs = Array.isArray(data) ? data.map(d => d.documentName) : [];
        setUploadedDocs(docs);
      })
      .catch(() => setUploadedDocs([]));
  }, [selectedLead, accessToken]);

  const handleFileUpload = async (documentName, file) => {
    if (!selectedLead) {
      setSuccess('Please select a lead first');
      return;
    }
    setUploadLoading(true);
    const formData = new FormData();
    formData.append('leadId', selectedLead);
    formData.append('documentName', documentName);
    formData.append('file', file);

    try {
      const res = await fetch(`${API_BASE}/documents/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
        body: formData
      });
      if (res.ok) {
        setUploadedDocs(prev => [...prev, documentName]);
        setSuccess(`${documentName} uploaded successfully!`);
        setTimeout(() => setSuccess(''), 3000);
      }
    } catch (err) {
      setSuccess('Upload failed');
    } finally {
      setUploadLoading(false);
    }
  };

  const pendingDocs = checklist.filter(doc => doc.required && !uploadedDocs.includes(doc.name));
  const optionalDocs = checklist.filter(doc => !doc.required && !uploadedDocs.includes(doc.name));

  const getStatusColor = (docName) => {
    return uploadedDocs.includes(docName) ? 'bg-green-100 text-green-700' : 'bg-red-50 text-red-600';
  };

  return (
    <div className="py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Document Upload</h1>
        <p className="text-gray-500">Upload customer KYC, income proofs, and property documents.</p>
      </div>

      {success && (
        <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded-2xl mb-6">{success}</div>
      )}

      <div className="bg-white rounded-3xl shadow-xl p-8">
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-6 mb-6">
          <h3 className="text-xl font-bold text-blue-700 mb-4">Select Lead & Loan Type</h3>
          <div className="grid md:grid-cols-3 gap-4">
            <select className="border rounded-xl px-4 py-3" value={selectedLead} onChange={(e) => handleLeadChange(e.target.value)}>
              <option value="">Select Lead / Customer</option>
              {leads.map(lead => (
                <option key={lead.id} value={lead.id}>
                  {lead.customerName} - {lead.mobile}
                </option>
              ))}
            </select>
            <select
              className={`border rounded-xl px-4 py-3 ${selectedLead && selectedLoan ? 'bg-gray-100 cursor-not-allowed' : ''}`}
              value={selectedLoan}
              onChange={(e) => setSelectedLoan(e.target.value)}
              disabled={!!(selectedLead && selectedLoan)}
            >
              <option value="">Select Loan Type</option>
              <option>Home Loan</option><option>LAP</option><option>Mudra Loan</option><option>MSME Loan</option><option>Business Loan</option><option>Personal Loan</option>
            </select>
            {selectedLead && (
              <button
                onClick={handleClear}
                className="bg-red-500 text-white px-4 py-3 rounded-xl font-semibold hover:bg-red-600"
              >
                Clear / Reset
              </button>
            )}
          </div>
        </div>

        {selectedLead && selectedLoan && checklist.length > 0 && (
          <div className="mb-6">
            <h3 className="text-lg font-bold text-gray-800 mb-4">Required Documents ({checklist.filter(d => d.required).length})</h3>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {checklist.filter(doc => doc.required).map((doc, i) => (
                <div key={i} className={`border rounded-xl p-4 ${getStatusColor(doc.name)}`}>
                  <div className="flex justify-between items-start mb-2">
                    <span className="font-medium">{doc.name}</span>
                    <span className="text-xs bg-gray-200 px-2 py-1 rounded-full">{doc.category}</span>
                  </div>
                  {uploadedDocs.includes(doc.name) ? (
                    <span className="text-sm text-green-700 font-semibold">✓ Uploaded</span>
                  ) : (
                    <label className="block mt-2">
                      <input
                        type="file"
                        className="hidden"
                        onChange={(e) => {
                          if (e.target.files[0]) {
                            handleFileUpload(doc.name, e.target.files[0]);
                          }
                        }}
                        accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                      />
                      <span className="cursor-pointer text-sm bg-blue-600 text-white px-3 py-1 rounded-lg hover:bg-blue-700">
                        {uploadLoading ? 'Uploading...' : 'Upload'}
                      </span>
                    </label>
                  )}
                </div>
              ))}
            </div>

            {optionalDocs.length > 0 && (
              <div className="mt-6">
                <h4 className="text-md font-semibold text-gray-600 mb-3">Optional Documents ({optionalDocs.length})</h4>
                <div className="grid md:grid-cols-3 gap-3">
                  {optionalDocs.map((doc, i) => (
                    <div key={i} className={`border rounded-xl p-3 ${getStatusColor(doc.name)}`}>
                      <span className="text-sm">{doc.name}</span>
                      {uploadedDocs.includes(doc.name) ? (
                        <span className="text-xs ml-2 text-green-700">✓</span>
                      ) : (
                        <label className="block mt-1">
                          <input
                            type="file"
                            className="hidden"
                            onChange={(e) => {
                              if (e.target.files[0]) {
                                handleFileUpload(doc.name, e.target.files[0]);
                              }
                            }}
                            accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                          />
                          <span className="cursor-pointer text-xs bg-gray-500 text-white px-2 py-1 rounded">Upload</span>
                        </label>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-6 mt-6">
          <div className="bg-green-50 border border-green-200 rounded-2xl p-5">
            <h4 className="font-bold text-green-700 mb-3">Uploaded ({uploadedDocs.length})</h4>
            {uploadedDocs.length === 0 ? (
              <p className="text-sm text-gray-500">No documents uploaded yet</p>
            ) : (
              uploadedDocs.map((doc, i) => <div key={i} className="bg-white border rounded-xl px-4 py-2 mb-2 text-sm">{doc}</div>)
            )}
          </div>
          <div className="bg-red-50 border border-red-200 rounded-2xl p-5">
            <h4 className="font-bold text-red-700 mb-3">Pending ({pendingDocs.length})</h4>
            {pendingDocs.length === 0 ? (
              <p className="text-sm text-green-600 font-semibold">All required documents uploaded!</p>
            ) : (
              pendingDocs.map((doc, i) => <div key={i} className="bg-white border rounded-xl px-4 py-2 mb-2 text-sm">{doc.name}</div>)
            )}
          </div>
        </div>

        {selectedLead && pendingDocs.length === 0 && (
          <div className="flex gap-4 mt-6">
            <button className="px-6 py-3 rounded-xl font-semibold text-white bg-purple-700 hover:bg-purple-800">
              Send to Bank Login
            </button>
          </div>
        )}
      </div>
    </div>
  );
}