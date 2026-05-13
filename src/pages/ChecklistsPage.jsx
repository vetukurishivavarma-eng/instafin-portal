import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import API_BASE from '../config/api';

export default function ChecklistsPage() {
  const { accessToken } = useAuth();
  const [bankProducts, setBankProducts] = useState([]);
  const [privateBankProducts, setPrivateBankProducts] = useState([]);
  const [nbfcProducts, setNbfcProducts] = useState([]);
  const [selectedPSB, setSelectedPSB] = useState('');
  const [selectedPrivate, setSelectedPrivate] = useState('');
  const [selectedNBFC, setSelectedNBFC] = useState('');

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

  return (
    <div className="py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Checklist & Application Forms</h1>
        <p className="text-gray-500">Download application forms and checklists for banks.</p>
      </div>

      {/* PSB Banks */}
      <div className="mb-12">
        <h2 className="text-xl font-bold text-blue-700 mb-4">PSB Banks</h2>
        <div className="bg-white rounded-3xl shadow-md p-6 mb-6">
          <select className="w-full border rounded-xl px-4 py-3 mb-4" value={selectedPSB} onChange={(e) => setSelectedPSB(e.target.value)}>
            <option value="">Select Bank</option>
            {bankProducts.map((b, i) => <option key={i} value={b.bank}>{b.bank}</option>)}
          </select>
          {bankProducts.filter(b => b.bank === selectedPSB).map(bank => (
            <div key={bank.bank} className="border rounded-2xl p-4">
              <h3 className="font-bold text-blue-700 mb-3">{bank.bank}</h3>
              <div className="space-y-2">
                {bank.forms.map((form, i) => (
                  <div key={i} className="flex justify-between items-center border rounded-xl px-4 py-3">
                    <span>{form}</span>
                    <div className="flex gap-2">
                      <button className="bg-blue-700 text-white px-3 py-1 rounded-lg text-sm">Form</button>
                      <button className="bg-green-600 text-white px-3 py-1 rounded-lg text-sm">Checklist</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Private Banks */}
      <div className="mb-12">
        <h2 className="text-xl font-bold text-green-700 mb-4">Private Banks</h2>
        <div className="bg-white rounded-3xl shadow-md p-6 mb-6">
          <select className="w-full border rounded-xl px-4 py-3 mb-4" value={selectedPrivate} onChange={(e) => setSelectedPrivate(e.target.value)}>
            <option value="">Select Bank</option>
            {privateBankProducts.map((b, i) => <option key={i} value={b.bank}>{b.bank}</option>)}
          </select>
          {privateBankProducts.filter(b => b.bank === selectedPrivate).map(bank => (
            <div key={bank.bank} className="border rounded-2xl p-4">
              <h3 className="font-bold text-green-700 mb-3">{bank.bank}</h3>
              <div className="space-y-2">
                {bank.forms.map((form, i) => (
                  <div key={i} className="flex justify-between items-center border rounded-xl px-4 py-3">
                    <span>{form}</span>
                    <div className="flex gap-2">
                      <button className="bg-green-700 text-white px-3 py-1 rounded-lg text-sm">Form</button>
                      <button className="bg-blue-600 text-white px-3 py-1 rounded-lg text-sm">Checklist</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* NBFCS */}
      <div>
        <h2 className="text-xl font-bold text-purple-700 mb-4">NBFCS</h2>
        <div className="bg-white rounded-3xl shadow-md p-6 mb-6">
          <select className="w-full border rounded-xl px-4 py-3 mb-4" value={selectedNBFC} onChange={(e) => setSelectedNBFC(e.target.value)}>
            <option value="">Select NBFC</option>
            {nbfcProducts.map((b, i) => <option key={i} value={b.bank}>{b.bank}</option>)}
          </select>
          {nbfcProducts.filter(b => b.bank === selectedNBFC).map(bank => (
            <div key={bank.bank} className="border rounded-2xl p-4">
              <h3 className="font-bold text-purple-700 mb-3">{bank.bank}</h3>
              <div className="space-y-2">
                {bank.forms.map((form, i) => (
                  <div key={i} className="flex justify-between items-center border rounded-xl px-4 py-3">
                    <span>{form}</span>
                    <div className="flex gap-2">
                      <button className="bg-purple-700 text-white px-3 py-1 rounded-lg text-sm">Form</button>
                      <button className="bg-green-600 text-white px-3 py-1 rounded-lg text-sm">Checklist</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
