import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import API_BASE from '../config/api';
import { getChecklist } from '../utils/resolver';
import { Selection } from '../checklist-spec';
import ChecklistDisplay from '../components/ChecklistDisplay';
import { downloadPDF } from '../export/pdf';
import { shareOnWhatsApp, isWebShareAvailable } from '../export/whatsapp';

export default function ChecklistsPage() {
  const { accessToken } = useAuth();
  const [leads, setLeads] = useState([]);
  const [selectedLead, setSelectedLead] = useState(null);
  const [checklistItems, setChecklistItems] = useState([]);
  const [checklistStatuses, setChecklistStatuses] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isDownloading, setIsDownloading] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(null);

  // Fetch leads
  useEffect(() => {
    if (!accessToken) return;
    fetchLeads();
  }, [accessToken]);

  const fetchLeads = () => {
    setLoading(true);
    fetch(`${API_BASE}/leads`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    })
    .then(r => r.json())
    .then(data => {
      setLeads(data.data || []);
      setLoading(false);
    })
    .catch(err => {
      console.error('Failed to load leads:', err);
      setError('Failed to load leads');
      setLoading(false);
    });
  };

  // Handle lead selection
  const handleLeadSelect = (leadId) => {
    const lead = leads.find(l => String(l.id) === String(leadId));
    if (lead) {
      setSelectedLead(lead);
      loadChecklistForLead(lead);
      fetchChecklistStatuses(lead.id);
    } else {
      setSelectedLead(null);
      setChecklistItems([]);
      setChecklistStatuses({});
    }
  };

  // Load checklist for lead using decision tree resolver
  const loadChecklistForLead = (lead) => {
    const selection = {
      loanType: lead.loanType,
      loanStatus: lead.loanStatus || 'new',
      incomeSource: lead.incomeSource,
      residentType: lead.residentType,
      businessType: lead.businessType
    };

    const items = getChecklist(selection);
    setChecklistItems(items);
  };

  // Fetch checklist statuses from the new API
  const fetchChecklistStatuses = (leadId) => {
    fetch(`${API_BASE}/checklist-status/${leadId}`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    })
    .then(r => r.json())
    .then(data => {
      // Convert to simple map: { documentId: 'uploaded' | 'pending' }
      const statusMap = {};
      if (data && typeof data === 'object') {
        Object.entries(data).forEach(([docId, info]) => {
          statusMap[docId] = info.status || 'pending';
        });
      }
      setChecklistStatuses(statusMap);
    })
    .catch(err => {
      console.error('Failed to load checklist statuses:', err);
      setChecklistStatuses({});
    });
  };

  // Handle file upload for a checklist item
  const handleFileUpload = async (documentId, documentName, file) => {
    if (!selectedLead) return;

    setUploadingDoc(documentId);
    try {
      const formData = new FormData();
      formData.append('leadId', selectedLead.id);
      formData.append('documentId', documentId);
      formData.append('documentName', documentName);
      formData.append('file', file);

      const res = await fetch(`${API_BASE}/checklist-status/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
        body: formData
      });

      if (res.ok) {
        setChecklistStatuses(prev => ({ ...prev, [documentId]: 'uploaded' }));
        setSuccess(`${documentName} uploaded successfully!`);
        setTimeout(() => setSuccess(''), 3000);
      } else {
        const errData = await res.json();
        setError(errData.error || 'Upload failed');
        setTimeout(() => setError(''), 5000);
      }
    } catch (err) {
      console.error('Upload error:', err);
      setError('Upload failed');
      setTimeout(() => setError(''), 5000);
    } finally {
      setUploadingDoc(null);
    }
  };

  // Download checklist as PDF
  const handleDownloadPDF = async () => {
    if (checklistItems.length === 0 || !selectedLead) return;

    setIsDownloading(true);
    try {
      const selection = {
        loanType: selectedLead.loanType,
        loanStatus: selectedLead.loanStatus || 'new',
        incomeSource: selectedLead.incomeSource,
        residentType: selectedLead.residentType,
        businessType: selectedLead.businessType
      };
      await downloadPDF(selection, checklistItems);
    } catch (err) {
      console.error('PDF generation error:', err);
      setError('Failed to generate PDF');
      setTimeout(() => setError(''), 5000);
    } finally {
      setIsDownloading(false);
    }
  };

  // Share pending documents via WhatsApp
  const handleSharePendingWhatsApp = async () => {
    const pendingItems = checklistItems.filter(item => {
      const status = checklistStatuses[item.id] || 'pending';
      return status === 'pending' && item.required;
    });

    if (pendingItems.length === 0) {
      setSuccess('All required documents have been uploaded!');
      setTimeout(() => setSuccess(''), 3000);
      return;
    }

    setIsSharing(true);
    try {
      await shareOnWhatsApp({
        loanType: selectedLead.loanType,
        title: `Pending Documents - ${selectedLead.customerName} (${selectedLead.loanType ? selectedLead.loanType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : 'Loan'})`,
        items: pendingItems.map(item => ({
          name: item.name,
          category: item.category,
          required: item.required
        }))
      });
    } catch (err) {
      console.error('WhatsApp share error:', err);
      setError('Failed to share on WhatsApp');
      setTimeout(() => setError(''), 5000);
    } finally {
      setIsSharing(false);
    }
  };

  // Compute stats
  const uploadedCount = checklistItems.filter(item => checklistStatuses[item.id] === 'uploaded').length;
  const pendingRequiredCount = checklistItems.filter(item =>
    item.required && (checklistStatuses[item.id] || 'pending') === 'pending'
  ).length;

  return (
    <div className="py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Checklist & Document Management</h1>
        <p className="text-gray-500">Select a lead to view required documents and upload files.</p>
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-2xl mb-6">
          {error}
        </div>
      )}

      {success && (
        <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded-2xl mb-6">
          {success}
        </div>
      )}

      {/* Leads Selection */}
      <div className="bg-white rounded-3xl shadow-xl p-6 mb-8">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Select Lead</h2>
        {loading ? (
          <div className="flex items-center justify-center py-8">Loading leads...</div>
        ) : (
          <div className="space-y-4">
            <select
              className="w-full border rounded-xl px-4 py-3"
              value={selectedLead?.id || ''}
              onChange={(e) => handleLeadSelect(e.target.value)}
            >
              <option value="">Select a lead</option>
              {leads.map(lead => (
                <option key={lead.id} value={lead.id}>
                  {lead.customerName} - {lead.mobile} ({lead.loanType})
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Checklist and Upload Section */}
      {selectedLead && (
        <div className="space-y-8">
          {/* Lead Info */}
          <div className="bg-blue-50 rounded-xl p-6">
            <h3 className="text-lg font-semibold text-blue-800 mb-3">Lead Information</h3>
            <div className="grid md:grid-cols-3 gap-4 text-sm">
              <div>
                <span className="text-gray-500">Customer: </span>
                <span className="font-medium">{selectedLead.customerName}</span>
              </div>
              <div>
                <span className="text-gray-500">Mobile: </span>
                <span className="font-medium">{selectedLead.mobile}</span>
              </div>
              <div>
                <span className="text-gray-500">Loan Type: </span>
                <span className="font-medium">{selectedLead.loanType || 'Not specified'}</span>
              </div>
              <div>
                <span className="text-gray-500">Loan Status: </span>
                <span className="font-medium">{selectedLead.loanStatus || 'Not specified'}</span>
              </div>
              <div>
                <span className="text-gray-500">Income Source: </span>
                <span className="font-medium">{selectedLead.incomeSource || 'Not specified'}</span>
              </div>
              <div>
                <span className="text-gray-500">Resident Type: </span>
                <span className="font-medium">{selectedLead.residentType || 'Not specified'}</span>
              </div>
              {selectedLead.incomeSource === 'non_salaried' && (
                <div>
                  <span className="text-gray-500">Business Type: </span>
                  <span className="font-medium">{selectedLead.businessType || 'Not specified'}</span>
                </div>
              )}
            </div>
          </div>

          {/* Checklist with Upload */}
          <div className="bg-white rounded-xl shadow-md p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-900">
                Required Documents ({checklistItems.filter(d => d.required).length})
              </h3>
              <div className="flex gap-3 text-sm">
                <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full font-medium">
                  {uploadedCount} Uploaded
                </span>
                <span className="bg-red-100 text-red-700 px-3 py-1 rounded-full font-medium">
                  {pendingRequiredCount} Pending
                </span>
              </div>
            </div>

            {checklistItems.length === 0 && (
              <p className="text-gray-500 text-center py-8">No checklist data available. Please ensure lead has all required information.</p>
            )}

            {checklistItems.length > 0 && (
              <div className="space-y-6">
                {/* Group by category */}
                {(() => {
                  const categoryOrder = ['kyc', 'income_proof', 'business_documents', 'property_documents', 'financial_documents', 'legal_documents', 'others'];
                  const categoryLabels = {
                    kyc: 'KYC Documents',
                    income_proof: 'Income Proof',
                    business_documents: 'Business Documents',
                    property_documents: 'Property Documents',
                    financial_documents: 'Financial Documents',
                    legal_documents: 'Legal Documents',
                    others: 'Others'
                  };

                  return categoryOrder.map(category => {
                    const items = checklistItems.filter(item => item.category === category);
                    if (items.length === 0) return null;

                    return (
                      <div key={category} className="border border-gray-200 rounded-xl overflow-hidden">
                        <div className="px-5 py-3 bg-gray-50 border-b border-gray-200">
                          <h4 className="font-semibold text-gray-900">{categoryLabels[category] || category}</h4>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {items.filter(i => i.required).length} required, {items.filter(i => !i.required).length} optional
                          </p>
                        </div>
                        <ul className="divide-y divide-gray-100">
                          {items.map(item => {
                            const status = checklistStatuses[item.id] || 'pending';
                            const isUploaded = status === 'uploaded';
                            const isUploading = uploadingDoc === item.id;

                            return (
                              <li key={item.id} className={`px-5 py-4 flex items-center gap-3 ${isUploaded ? 'bg-green-50' : ''}`}>
                                {/* Status icon */}
                                <div className="flex-shrink-0">
                                  {isUploaded ? (
                                    <svg className="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                    </svg>
                                  ) : item.required ? (
                                    <svg className="w-5 h-5 text-red-500" fill="currentColor" viewBox="0 0 20 20">
                                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                                    </svg>
                                  ) : (
                                    <svg className="w-5 h-5 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                    </svg>
                                  )}
                                </div>

                                {/* Document name */}
                                <div className="flex-1 min-w-0">
                                  <p className={`text-sm font-medium ${isUploaded ? 'text-green-800' : item.required ? 'text-gray-900' : 'text-gray-700'}`}>
                                    {item.name}
                                  </p>
                                </div>

                                {/* Required/Optional badge */}
                                <div className="flex-shrink-0">
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                    item.required ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-600'
                                  }`}>
                                    {item.required ? 'Required' : 'Optional'}
                                  </span>
                                </div>

                                {/* Upload button or Uploaded badge */}
                                <div className="flex-shrink-0">
                                  {isUploaded ? (
                                    <span className="text-xs text-green-700 font-semibold bg-green-100 px-3 py-1.5 rounded-lg">
                                      Uploaded
                                    </span>
                                  ) : (
                                    <label className={`cursor-pointer text-xs px-3 py-1.5 rounded-lg font-medium ${
                                      isUploading
                                        ? 'bg-gray-300 text-gray-500 cursor-wait'
                                        : 'bg-blue-600 text-white hover:bg-blue-700'
                                    }`}>
                                      {isUploading ? 'Uploading...' : 'Upload'}
                                      <input
                                        type="file"
                                        className="hidden"
                                        accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                                        disabled={isUploading}
                                        onChange={(e) => {
                                          if (e.target.files[0]) {
                                            handleFileUpload(item.id, item.name, e.target.files[0]);
                                          }
                                        }}
                                      />
                                    </label>
                                  )}
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    );
                  });
                })()}
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-4">
            {/* Download PDF */}
            <button
              onClick={handleDownloadPDF}
              disabled={checklistItems.length === 0 || isDownloading}
              className={`inline-flex items-center px-5 py-3 rounded-xl font-semibold text-sm transition-all ${
                checklistItems.length === 0
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-purple-700 text-white hover:bg-purple-800 shadow-sm hover:shadow-md'
              }`}
            >
              {isDownloading ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Generating...
                </>
              ) : (
                <>
                  <svg className="-ml-1 mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Download Checklist
                </>
              )}
            </button>

            {/* Share All via WhatsApp */}
            <button
              onClick={async () => {
                if (checklistItems.length === 0) return;
                setIsSharing(true);
                try {
                  await shareOnWhatsApp({
                    loanType: selectedLead.loanType,
                    items: checklistItems.filter(i => i.required).map(item => ({
                      name: item.name,
                      category: item.category,
                      required: item.required
                    }))
                  });
                } catch (err) {
                  setError('Failed to share on WhatsApp');
                  setTimeout(() => setError(''), 5000);
                } finally {
                  setIsSharing(false);
                }
              }}
              disabled={checklistItems.length === 0 || isSharing}
              className={`inline-flex items-center px-5 py-3 rounded-xl font-semibold text-sm transition-all ${
                checklistItems.length === 0
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-green-600 text-white hover:bg-green-700 shadow-sm hover:shadow-md'
              }`}
            >
              {isSharing ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Sharing...
                </>
              ) : (
                <>
                  <svg className="-ml-1 mr-2 h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                  </svg>
                  Share All via WhatsApp
                </>
              )}
            </button>

            {/* Share Pending via WhatsApp */}
            <button
              onClick={handleSharePendingWhatsApp}
              disabled={checklistItems.length === 0 || isSharing || pendingRequiredCount === 0}
              className={`inline-flex items-center px-5 py-3 rounded-xl font-semibold text-sm transition-all ${
                checklistItems.length === 0 || pendingRequiredCount === 0
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-orange-500 text-white hover:bg-orange-600 shadow-sm hover:shadow-md'
              }`}
            >
              <>
                <svg className="-ml-1 mr-2 h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                </svg>
                Send Pending via WhatsApp ({pendingRequiredCount})
              </>
            </button>
          </div>
        </div>
      )}

      {!selectedLead && leads.length > 0 && (
        <div className="text-center py-8 text-gray-500">
          Please select a lead to view checklist and upload documents.
        </div>
      )}
    </div>
  );
}
