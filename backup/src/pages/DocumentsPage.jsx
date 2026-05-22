import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

const API_BASE = 'http://localhost:3001/api';

export default function DocumentsPage() {
  const { accessToken } = useAuth();
  const [bankProducts, setBankProducts] = useState([]);
  const [privateBankProducts, setPrivateBankProducts] = useState([]);
  const [nbfcProducts, setNbfcProducts] = useState([]);
  const [selectedBank, setSelectedBank] = useState('');
  const [selectedLoan, setSelectedLoan] = useState('');
  const [checklist, setChecklist] = useState([]);
  const [uploadedDocs, setUploadedDocs] = useState([]);
  const [loading, setLoading] = useState(false);

  React.useEffect(() => {
    Promise.all([
      fetch(`${API_BASE}/banks/psb`, { headers: { Authorization: `Bearer ${accessToken}` } }).then(r => r.json()),
      fetch(`${API_BASE}/banks/private`, { headers: { Authorization: `Bearer ${accessToken}` } }).then(r => r.json()),
      fetch(`${API_BASE}/banks/nbfc`, { headers: { Authorization: `Bearer ${accessToken}` } }).then(r => r.json()),
    ]).then(([psb, priv, nbfc]) => {
      setBankProducts(psb);
      setPrivateBankProducts(priv);
      setNbfcProducts(nbfc);
    });
  }, [accessToken]);

  React.useEffect(() => {
    if (selectedBank && selectedLoan) {
      fetch(`${API_BASE}/documents/checklist?bank=${encodeURIComponent(selectedBank)}&loanType=${encodeURIComponent(selectedLoan)}`, { headers: { Authorization: `Bearer ${accessToken}` } })
        .then(r => r.json())
        .then(data => setChecklist(Array.isArray(data) ? data : []))
        .catch(() => setChecklist([]));
    } else {
      setChecklist([]);
    }
  }, [selectedBank, selectedLoan, accessToken]);

  const allBanks = [...bankProducts, ...privateBankProducts, ...nbfcProducts];
  const pendingDocs = checklist.filter(doc => !uploadedDocs.includes(doc));

  return (
    <div className="py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Document Upload</h1>
        <p className="text-gray-500">Upload customer KYC, income proofs, and property documents.</p>
      </div>

      <div className="bg-white rounded-3xl shadow-xl p-8">
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-6 mb-6">
          <h3 className="text-xl font-bold text-blue-700 mb-4">Generate Checklist</h3>
          <div className="grid md:grid-cols-2 gap-4">
            <select className="border rounded-xl px-4 py-3" value={selectedBank} onChange={(e) => setSelectedBank(e.target.value)}>
              <option value="">Select Bank / NBFC</option>
              {allBanks.map((bank, i) => <option key={i} value={bank.bank}>{bank.bank}</option>)}
            </select>
            <select className="border rounded-xl px-4 py-3" value={selectedLoan} onChange={(e) => setSelectedLoan(e.target.value)}>
              <option value="">Select Loan Type</option>
              <option>Home Loan</option><option>LAP</option><option>Business Loan</option><option>MSME Loan</option><option>Personal Loan</option>
            </select>
          </div>
        </div>

        {checklist.length > 0 && (
          <div className="grid md:grid-cols-3 gap-4 mb-6">
            {checklist.map((doc, i) => (
              <div key={i} className="bg-gray-50 border rounded-xl p-4">
                <label className="flex items-center gap-2 mb-2">
                  <input type="checkbox" checked={uploadedDocs.includes(doc)} onChange={() => {
                    setUploadedDocs(prev => prev.includes(doc) ? prev.filter(d => d !== doc) : [...prev, doc]);
                  }} />
                  <span className="text-sm">{doc}</span>
                </label>
                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full">Required</span>
              </div>
            ))}
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-green-50 border border-green-200 rounded-2xl p-5">
            <h4 className="font-bold text-green-700 mb-3">Received ({uploadedDocs.length})</h4>
            {uploadedDocs.map((doc, i) => <div key={i} className="bg-white border rounded-xl px-4 py-2 mb-2 text-sm">{doc}</div>)}
          </div>
          <div className="bg-red-50 border border-red-200 rounded-2xl p-5">
            <h4 className="font-bold text-red-700 mb-3">Pending ({pendingDocs.length})</h4>
            {pendingDocs.map((doc, i) => <div key={i} className="bg-white border rounded-xl px-4 py-2 mb-2 text-sm">{doc}</div>)}
          </div>
        </div>

        <div className="flex gap-4 mt-6">
          <button disabled={pendingDocs.length > 0} className={`px-6 py-3 rounded-xl font-semibold text-white ${pendingDocs.length > 0 ? 'bg-gray-400' : 'bg-purple-700'}`}>
            Send to Bank Login
          </button>
        </div>
      </div>
    </div>
  );
}
