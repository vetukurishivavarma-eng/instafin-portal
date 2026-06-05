import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import API_BASE from '../config/api';

export default function BulkUploadModal({ isOpen, onClose, onComplete }) {
  const { accessToken } = useAuth();
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile && (selectedFile.name.endsWith('.xlsx') || selectedFile.name.endsWith('.xls'))) {
      setFile(selectedFile);
      setError('');
      setPreview(null);
      setResult(null);
    } else {
      setError('Please select a valid Excel file (.xlsx or .xls)');
    }
  };

  const handlePreview = async () => {
    if (!file) return;
    setLoading(true);
    setError('');

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch(`${API_BASE}/bulk/preview`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
        body: formData
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to preview file');
        return;
      }
      setPreview(data);
    } catch (err) {
      setError('Failed to upload file');
    } finally {
      setLoading(false);
    }
  };

  const handleProcess = async () => {
    if (!preview) return;
    setProcessing(true);
    setError('');

    try {
      const res = await fetch(`${API_BASE}/bulk/process`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          newLeads: preview.newLeads || [],
          changedLeads: preview.changedLeads,
          newColumns: preview.newColumns
        })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to process upload');
        return;
      }
      setResult(data);
      setPreview(null);
      if (onComplete) onComplete();
    } catch (err) {
      setError('Failed to process upload');
    } finally {
      setProcessing(false);
    }
  };

  const handleReset = () => {
    setFile(null);
    setPreview(null);
    setResult(null);
    setError('');
  };

  const handleClose = () => {
    handleReset();
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-3 sm:p-4" onClick={handleClose}>
      <div className="bg-white rounded-2xl sm:rounded-3xl p-5 sm:p-8 max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-2xl mx-2 sm:mx-0" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Bulk Lead Upload</h2>
            <p className="text-gray-500 text-xs sm:text-sm">Upload Excel file to bulk import or update leads</p>
          </div>
          <button onClick={handleClose} className="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
        </div>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-2xl mb-6 text-sm">{error}</div>
        )}

        {result && (
          <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded-2xl mb-6 text-sm">
            <h3 className="font-bold">Upload Successful!</h3>
            <p>New leads inserted: {result.inserted}</p>
            <p>Existing leads updated: {result.updated}</p>
            {result.errors.length > 0 && (
              <p className="text-red-600">Errors: {result.errors.length}</p>
            )}
          </div>
        )}

        {!preview && !result && (
          <div className="text-center">
            <div className="border-2 border-dashed border-gray-300 rounded-xl p-6 sm:p-12 mb-6">
              <svg className="mx-auto h-10 w-10 sm:h-12 sm:w-12 text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <label className="cursor-pointer">
                <span className="text-blue-600 hover:text-blue-700 font-medium text-sm">Click to upload</span>
                <span className="text-gray-500 text-sm"> or drag and drop</span>
                <input type="file" className="hidden" accept=".xlsx,.xls" onChange={handleFileChange} />
              </label>
              <p className="text-xs text-gray-500 mt-2">Excel files only (.xlsx, .xls)</p>
            </div>

            {file && (
              <div className="mb-6">
                <p className="text-gray-700 font-medium text-sm">Selected: {file.name}</p>
                <button
                  onClick={handlePreview}
                  disabled={loading}
                  className="mt-4 bg-blue-600 text-white px-5 sm:px-6 py-2.5 sm:py-3 rounded-xl font-semibold hover:bg-blue-700 disabled:opacity-50 text-sm"
                >
                  {loading ? 'Analyzing...' : 'Preview & Analyze'}
                </button>
              </div>
            )}

            <div className="mt-4 text-left bg-blue-50 border border-blue-200 rounded-xl p-4">
              <h4 className="font-bold text-blue-800 mb-2 text-sm">Excel Format:</h4>
              <ul className="text-xs text-blue-700 space-y-1">
                <li>• First row should contain column headers (Customer Name, Mobile, Loan Type, etc.)</li>
                <li>• Mobile is used as unique identifier to detect existing leads</li>
                <li>• New columns in Excel will be automatically added to the database</li>
              </ul>
            </div>
          </div>
        )}

        {preview && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-gray-800">Preview Changes</h3>
              <button onClick={handleReset} className="text-sm text-gray-500 hover:text-gray-700">Upload New File</button>
            </div>

            <div className="grid grid-cols-4 gap-4 mb-6">
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-center">
                <div className="text-xl font-bold text-blue-700">{preview.newLeadsCount}</div>
                <div className="text-xs text-blue-600">New Leads</div>
              </div>
              <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 text-center">
                <div className="text-xl font-bold text-yellow-700">{preview.changedLeadsCount}</div>
                <div className="text-xs text-yellow-600">Changed</div>
              </div>
              <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-center">
                <div className="text-xl font-bold text-green-700">{preview.existingLeadsCount}</div>
                <div className="text-xs text-green-600">Unchanged</div>
              </div>
              <div className="bg-purple-50 border border-purple-200 rounded-xl p-3 text-center">
                <div className="text-xl font-bold text-purple-700">{preview.newColumns.length}</div>
                <div className="text-xs text-purple-600">New Columns</div>
              </div>
            </div>

            {preview.newColumns.length > 0 && (
              <div className="bg-yellow-50 border border-yellow-300 rounded-xl p-4 mb-4">
                <h4 className="font-bold text-yellow-800 mb-2 text-sm">New columns detected:</h4>
                <div className="flex flex-wrap gap-2">
                  {preview.newColumns.map((col, i) => (
                    <span key={i} className="bg-yellow-200 text-yellow-800 px-2 py-0.5 rounded-full text-xs">{col}</span>
                  ))}
                </div>
              </div>
            )}

            {preview.changedLeads.length > 0 && (
              <div className="mb-4 max-h-48 overflow-y-auto">
                <h4 className="font-bold text-gray-800 mb-2 text-sm">Changed Leads (first 10):</h4>
                {preview.changedLeads.slice(0, 10).map((lead, i) => (
                  <div key={i} className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-2">
                    <p className="font-semibold text-sm">{lead.customerName} <span className="text-gray-500">({lead.mobile})</span></p>
                    <div className="text-xs mt-1">
                      {Object.entries(lead.changes).map(([field, vals], j) => (
                        <div key={j} className="text-gray-600">
                          {field}: <span className="line-through text-red-500">{vals.old || 'empty'}</span> → <span className="text-green-600">{vals.new}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={handleProcess}
                disabled={processing || (preview.newLeadsCount === 0 && preview.changedLeadsCount === 0)}
                className="flex-1 bg-green-600 text-white px-4 py-2.5 rounded-xl font-semibold hover:bg-green-700 disabled:opacity-50 text-sm"
              >
                {processing ? 'Processing...' : `Confirm Upload (${preview.newLeadsCount + preview.changedLeadsCount} records)`}
              </button>
              <button
                onClick={handleReset}
                className="px-4 py-2.5 bg-gray-500 text-white rounded-xl font-semibold hover:bg-gray-600 text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {result && (
          <div className="text-center mt-4">
            <button
              onClick={handleClose}
              className="bg-blue-600 text-white px-6 py-2.5 rounded-xl font-semibold hover:bg-blue-700"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
