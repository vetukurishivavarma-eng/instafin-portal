import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import API_BASE from '../config/api';

export default function BulkUploadPage() {
  const { isAdmin, accessToken } = useAuth();
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

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

  if (!isAdmin) {
    return <div className="p-8 text-center">Access denied. Admin only.</div>;
  }

  return (
    <div className="py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Bulk Lead Upload</h1>
        <p className="text-gray-500">Upload Excel file to bulk import or update leads</p>
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-2xl mb-6">{error}</div>
      )}

      {result && (
        <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded-2xl mb-6">
          <h3 className="font-bold">Upload Successful!</h3>
          <p>New leads inserted: {result.inserted}</p>
          <p>Existing leads updated: {result.updated}</p>
          {result.errors.length > 0 && (
            <p className="text-red-600">Errors: {result.errors.length}</p>
          )}
        </div>
      )}

      <div className="bg-white rounded-3xl shadow-xl p-8">
        {!preview && !result && (
          <div className="text-center">
            <div className="border-2 border-dashed border-gray-300 rounded-xl p-12 mb-6">
              <svg className="mx-auto h-12 w-12 text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <label className="cursor-pointer">
                <span className="text-blue-600 hover:text-blue-700 font-medium">Click to upload</span>
                <span className="text-gray-500"> or drag and drop</span>
                <input type="file" className="hidden" accept=".xlsx,.xls" onChange={handleFileChange} />
              </label>
              <p className="text-sm text-gray-500 mt-2">Excel files only (.xlsx, .xls)</p>
            </div>

            {file && (
              <div className="mb-6">
                <p className="text-gray-700 font-medium">Selected: {file.name}</p>
                <button
                  onClick={handlePreview}
                  disabled={loading}
                  className="mt-4 bg-blue-600 text-white px-6 py-3 rounded-xl font-semibold hover:bg-blue-700 disabled:opacity-50"
                >
                  {loading ? 'Analyzing...' : 'Preview & Analyze'}
                </button>
              </div>
            )}
          </div>
        )}

        {preview && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-gray-800">Preview Changes</h2>
              <button onClick={handleReset} className="text-gray-500 hover:text-gray-700">
                Upload New File
              </button>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-4 gap-4 mb-8">
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-center">
                <div className="text-2xl font-bold text-blue-700">{preview.newLeadsCount}</div>
                <div className="text-sm text-blue-600">New Leads</div>
              </div>
              <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-center">
                <div className="text-2xl font-bold text-yellow-700">{preview.changedLeadsCount}</div>
                <div className="text-sm text-yellow-600">Changed Leads</div>
              </div>
              <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
                <div className="text-2xl font-bold text-green-700">{preview.existingLeadsCount}</div>
                <div className="text-sm text-green-600">Unchanged</div>
              </div>
              <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 text-center">
                <div className="text-2xl font-bold text-purple-700">{preview.newColumns.length}</div>
                <div className="text-sm text-purple-600">New Columns</div>
              </div>
            </div>

            {/* New Columns Warning */}
            {preview.newColumns.length > 0 && (
              <div className="bg-yellow-50 border border-yellow-300 rounded-xl p-4 mb-6">
                <h4 className="font-bold text-yellow-800 mb-2">New columns detected in Excel:</h4>
                <div className="flex flex-wrap gap-2">
                  {preview.newColumns.map((col, i) => (
                    <span key={i} className="bg-yellow-200 text-yellow-800 px-3 py-1 rounded-full text-sm">
                      {col}
                    </span>
                  ))}
                </div>
                <p className="text-sm text-yellow-700 mt-2">These columns will be automatically added to the database.</p>
              </div>
            )}

            {/* Changed Leads Preview */}
            {preview.changedLeads.length > 0 && (
              <div className="mb-6">
                <h3 className="font-bold text-gray-800 mb-4">Changed Leads (Preview - first 10):</h3>
                <div className="space-y-3">
                  {preview.changedLeads.slice(0, 10).map((lead, i) => (
                    <div key={i} className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-semibold text-gray-800">{lead.customerName}</p>
                          <p className="text-sm text-gray-500">Mobile: {lead.mobile}</p>
                        </div>
                        <span className="bg-yellow-200 text-yellow-800 px-2 py-1 rounded text-xs">
                          {Object.keys(lead.changes).length} changes
                        </span>
                      </div>
                      <div className="mt-2 text-sm">
                        {Object.entries(lead.changes).map(([field, vals], j) => (
                          <div key={j} className="flex gap-2 text-gray-600">
                            <span className="font-medium">{field}:</span>
                            <span className="line-through text-red-500">{vals.old || 'empty'}</span>
                            <span>→</span>
                            <span className="text-green-600">{vals.new}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                {preview.totalChanges > 10 && (
                  <p className="text-gray-500 text-sm mt-2">...and {preview.totalChanges - 10} more changes</p>
                )}
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-4">
              <button
                onClick={handleProcess}
                disabled={processing || (preview.newLeadsCount === 0 && preview.changedLeadsCount === 0)}
                className="bg-green-600 text-white px-6 py-3 rounded-xl font-semibold hover:bg-green-700 disabled:opacity-50"
              >
                {processing ? 'Processing...' : `Confirm & Upload (${preview.newLeadsCount + preview.changedLeadsCount} records)`}
              </button>
              <button
                onClick={handleReset}
                className="bg-gray-500 text-white px-6 py-3 rounded-xl font-semibold hover:bg-gray-600"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Instructions */}
      <div className="mt-6 bg-blue-50 border border-blue-200 rounded-xl p-6">
        <h3 className="font-bold text-blue-800 mb-2">Excel Format Instructions:</h3>
        <ul className="text-sm text-blue-700 space-y-1">
          <li>• First row should contain column headers (e.g., Customer Name, Mobile, Loan Type, etc.)</li>
          <li>• Use "Mobile" as unique identifier to detect existing leads</li>
          <li>• If mobile matches existing lead, changes will be detected and shown for approval</li>
          <li>• New columns in Excel will be automatically added to the database</li>
        </ul>
      </div>
    </div>
  );
}