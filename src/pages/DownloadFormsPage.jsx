import React, { useState } from 'react';
import { 
  getAvailableKeys, 
  getChecklistByKey, 
  getChecklist, 
  addChecklistItemToFlow, 
  deleteChecklistItemFromFlow, 
  selectionToKey 
} from '../utils/resolver';
import { downloadPDF } from '../export/pdf';
import { useAuth } from '../contexts/AuthContext';

const loanTypeLabels = {
  home_loan: 'Home Loan',
  lap: 'Loan Against Property (LAP)',
  mudra: 'Mudra Loan',
  msme: 'MSME Loan',
  business_loan: 'Business Loan',
  personal_loan: 'Personal Loan',
  education_loan: 'Education Loan',
};

const loanStatusLabels = {
  new: 'New Loan',
  topup_equity: 'Top-up/Equity',
  takeover: 'Takeover',
  construction: 'Construction',
  mudra: 'Mudra',
};

const incomeSourceLabels = {
  salaried: 'Salaried',
  non_salaried: 'Self Employed / Non-Salaried',
};

const residentTypeLabels = {
  nri: 'NRI',
  indian_resident: 'Indian Resident',
  merchant_navy: 'Merchant Navy',
};

const businessTypeLabels = {
  proprietor: 'Proprietorship',
  partnership: 'Partnership',
  pvt_ltd: 'Private Limited',
  llp: 'LLP',
};

const categoryLabels = {
  kyc: 'KYC Documents',
  income_proof: 'Income Proof',
  business_documents: 'Business Documents',
  property_documents: 'Property Documents',
  financial_documents: 'Financial Documents',
  legal_documents: 'Legal Documents',
  others: 'Others'
};

export default function DownloadFormsPage() {
  const { user } = useAuth();
  
  // Tab control: 'browse' for all pre-defined flows, 'builder' for custom criteria builder
  const [activeTab, setActiveTab] = useState('browse');
  
  // Search & Filter states for All Flows
  const [searchTerm, setSearchTerm] = useState('');
  const [loanTypeFilter, setLoanTypeFilter] = useState('');
  
  // Selection state for detail preview
  const [selectedFlowKey, setSelectedFlowKey] = useState('home_loan|new|salaried|indian_resident');
  
  // Custom builder states
  const [builderSelection, setBuilderSelection] = useState({
    loanType: 'home_loan',
    loanStatus: 'new',
    incomeSource: 'salaried',
    residentType: 'indian_resident',
    businessType: '',
  });

  const [downloading, setDownloading] = useState(false);
  const [success, setSuccess] = useState('');

  // Admin Custom additions/deletions states
  const [showAddForm, setShowAddForm] = useState(false);
  const [newDocName, setNewDocName] = useState('');
  const [newDocCategory, setNewDocCategory] = useState('kyc');
  const [newDocRequired, setNewDocRequired] = useState(true);

  const handleAddItemSubmit = (e) => {
    e.preventDefault();
    if (!newDocName.trim()) return;

    const key = activeTab === 'browse' ? selectedFlowKey : selectionToKey(builderSelection);
    if (!key) return;

    const generatedId = 'cust_' + newDocName.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '') + '_' + Date.now();

    const newItem = {
      id: generatedId,
      name: newDocName.trim(),
      category: newDocCategory,
      required: newDocRequired
    };

    addChecklistItemToFlow(key, newItem);
    setNewDocName('');
    setSuccess(`"${newItem.name}" added successfully to this checklist flow!`);
    setTimeout(() => setSuccess(''), 3000);
  };

  const handleDeleteItem = (itemId) => {
    const key = activeTab === 'browse' ? selectedFlowKey : selectionToKey(builderSelection);
    if (!key) return;
    deleteChecklistItemFromFlow(key, itemId);
    setSuccess('Document removed successfully!');
    setTimeout(() => setSuccess(''), 3000);
  };

  // Fetch all pre-defined flows from resolver
  const allFlowKeys = getAvailableKeys();

  // Parse a checklist key "home_loan|new|salaried|indian_resident" into structured labels
  const parseFlowKey = (key) => {
    const parts = key.split('|');
    return {
      loanType: parts[0] || '',
      loanStatus: parts[1] || '',
      incomeSource: parts[2] || '',
      residentType: parts[3] || '',
      businessType: parts[4] || '',
    };
  };

  // Filter flows
  const filteredFlowKeys = allFlowKeys.filter(key => {
    const parsed = parseFlowKey(key);
    const textMatch = !searchTerm || key.toLowerCase().includes(searchTerm.toLowerCase()) || 
      (loanTypeLabels[parsed.loanType] && loanTypeLabels[parsed.loanType].toLowerCase().includes(searchTerm.toLowerCase()));
    const typeMatch = !loanTypeFilter || parsed.loanType === loanTypeFilter;
    return textMatch && typeMatch;
  });

  // Get currently previewed checklist items
  let previewItems = [];
  let previewSelection = {};

  if (activeTab === 'browse') {
    previewItems = getChecklistByKey(selectedFlowKey) || [];
    previewSelection = parseFlowKey(selectedFlowKey);
  } else {
    previewItems = getChecklist(builderSelection) || [];
    previewSelection = builderSelection;
  }

  const handleDownload = async (selection, items, filenamePrefix) => {
    setDownloading(true);
    setSuccess('');
    try {
      await downloadPDF(selection, items);
      setSuccess('PDF checklist downloaded successfully!');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      console.error('PDF Download error:', err);
    } finally {
      setDownloading(false);
    }
  };

  // Helper to group items by category
  const groupItems = (items) => {
    const grouped = {};
    items.forEach(item => {
      const cat = item.category || 'others';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(item);
    });
    return grouped;
  };

  const groupedPreviewItems = groupItems(previewItems);

  return (
    <div className="py-12 px-6 min-h-screen bg-gradient-mesh animate-fade-in-up">
      {/* Header */}
      <div className="mb-10 max-w-6xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-extrabold text-gray-900 tracking-tight">Download Checklist Forms</h1>
          <p className="text-gray-500 font-semibold mt-1">Preview and download structured loan checklist PDF forms for compliance and routing.</p>
        </div>
      </div>

      {success && (
        <div className="bg-green-100 border border-green-300 text-green-700 px-6 py-4 rounded-3xl mb-8 max-w-6xl mx-auto shadow-sm animate-fade-in-up">
          {success}
        </div>
      )}

      {/* Tabs Menu */}
      <div className="flex gap-4 max-w-6xl mx-auto mb-8 border-b pb-4">
        <button
          onClick={() => { setActiveTab('browse'); setSuccess(''); }}
          className={`px-6 py-3 rounded-2xl font-bold transition-all text-sm flex items-center gap-2 ${
            activeTab === 'browse'
              ? 'bg-blue-700 text-white shadow-md shadow-blue-500/10'
              : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
          }`}
        >
          📂 All Code Logic Flows ({allFlowKeys.length})
        </button>
        <button
          onClick={() => { setActiveTab('builder'); setSuccess(''); }}
          className={`px-6 py-3 rounded-2xl font-bold transition-all text-sm flex items-center gap-2 ${
            activeTab === 'builder'
              ? 'bg-blue-700 text-white shadow-md shadow-blue-500/10'
              : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
          }`}
        >
          ⚙️ Interactive Criteria Builder
        </button>
      </div>

      <div className="grid lg:grid-cols-12 gap-8 max-w-6xl mx-auto items-start">
        {/* LEFT COLUMN: NAVIGATION / INPUTS */}
        <div className="lg:col-span-5 space-y-6">
          
          {activeTab === 'browse' ? (
            /* ALL FLOWS LIST VIEW */
            <div className="bg-white rounded-3xl p-6 border border-gray-150 shadow-sm space-y-4">
              <h2 className="text-xl font-bold text-gray-900">Search Pre-defined Flows</h2>
              
              <div className="flex flex-col gap-3">
                <input 
                  type="text"
                  placeholder="Filter by keyword (e.g. salaried, nri)..."
                  className="border rounded-2xl px-4 py-3 text-sm bg-gray-50/50 w-full focus:ring-2 focus:ring-blue-100"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
                
                <select
                  className="border rounded-2xl px-4 py-3 text-sm bg-gray-50/50 font-semibold w-full focus:ring-2 focus:ring-blue-100"
                  value={loanTypeFilter}
                  onChange={e => setLoanTypeFilter(e.target.value)}
                >
                  <option value="">All Loan Types</option>
                  {Object.entries(loanTypeLabels).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>

              <div className="border border-gray-150 rounded-2xl overflow-hidden max-h-[420px] overflow-y-auto divide-y divide-gray-100 shadow-inner">
                {filteredFlowKeys.length > 0 ? (
                  filteredFlowKeys.map(key => {
                    const parsed = parseFlowKey(key);
                    const isSelected = selectedFlowKey === key;
                    return (
                      <button
                        key={key}
                        onClick={() => setSelectedFlowKey(key)}
                        className={`w-full text-left p-4 hover:bg-gray-50/50 transition-colors flex flex-col gap-1.5 ${
                          isSelected ? 'bg-indigo-50/70 border-l-4 border-indigo-600' : ''
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className={`text-xs font-black uppercase tracking-wider px-2 py-0.5 rounded-md ${
                            isSelected ? 'bg-indigo-200 text-indigo-800' : 'bg-gray-100 text-gray-600'
                          }`}>
                            {loanTypeLabels[parsed.loanType] || parsed.loanType}
                          </span>
                          <span className="text-[10px] text-gray-400 font-semibold">{loanStatusLabels[parsed.loanStatus] || parsed.loanStatus}</span>
                        </div>
                        <span className="text-sm font-bold text-gray-900 leading-tight">
                          {incomeSourceLabels[parsed.incomeSource]} ({residentTypeLabels[parsed.residentType]})
                        </span>
                        {parsed.businessType && (
                          <span className="text-xs text-indigo-750 font-bold bg-indigo-50 border border-indigo-100/60 px-2 py-0.5 rounded-full self-start shadow-sm mt-0.5">
                            💼 Structure: {businessTypeLabels[parsed.businessType]}
                          </span>
                        )}
                      </button>
                    );
                  })
                ) : (
                  <div className="p-8 text-center text-gray-400 font-semibold">
                    No matching flows found in code.
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* INTERACTIVE CRITERIA BUILDER */
            <div className="bg-white rounded-3xl p-6 border border-gray-150 shadow-sm space-y-5">
              <h2 className="text-xl font-bold text-gray-900">Custom Criteria Selector</h2>
              
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1 block">Loan Type *</label>
                  <select
                    className="border rounded-2xl px-4 py-3 w-full bg-gray-50/50 font-bold focus:ring-2 focus:ring-blue-100"
                    value={builderSelection.loanType}
                    onChange={e => setBuilderSelection(p => ({ ...p, loanType: e.target.value }))}
                  >
                    {Object.entries(loanTypeLabels).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1 block">Loan Status *</label>
                    <select
                      className="border rounded-2xl px-4 py-3 w-full bg-gray-50/50 font-semibold focus:ring-2 focus:ring-blue-100"
                      value={builderSelection.loanStatus}
                      onChange={e => setBuilderSelection(p => ({ ...p, loanStatus: e.target.value }))}
                    >
                      <option value="new">New Loan</option>
                      <option value="takeover">Takeover</option>
                      <option value="construction">Construction</option>
                      <option value="topup_equity">Top-up/Equity</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1 block">Resident Type *</label>
                    <select
                      className="border rounded-2xl px-4 py-3 w-full bg-gray-50/50 font-semibold focus:ring-2 focus:ring-blue-100"
                      value={builderSelection.residentType}
                      onChange={e => setBuilderSelection(p => ({ ...p, residentType: e.target.value }))}
                    >
                      <option value="indian_resident">Indian Resident</option>
                      <option value="nri">NRI</option>
                      <option value="merchant_navy">Merchant Navy</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1 block">Income Source *</label>
                    <select
                      className="border rounded-2xl px-4 py-3 w-full bg-gray-50/50 font-semibold focus:ring-2 focus:ring-blue-100"
                      value={builderSelection.incomeSource}
                      onChange={e => {
                        const source = e.target.value;
                        setBuilderSelection(p => ({ 
                          ...p, 
                          incomeSource: source, 
                          businessType: source === 'salaried' ? '' : 'proprietor' 
                        }));
                      }}
                    >
                      <option value="salaried">Salaried</option>
                      <option value="non_salaried">Self Employed</option>
                    </select>
                  </div>

                  {builderSelection.incomeSource === 'non_salaried' && (
                    <div>
                      <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1 block">Business Structure *</label>
                      <select
                        className="border rounded-2xl px-4 py-3 w-full bg-gray-50/50 font-semibold focus:ring-2 focus:ring-blue-100"
                        value={builderSelection.businessType}
                        onChange={e => setBuilderSelection(p => ({ ...p, businessType: e.target.value }))}
                      >
                        <option value="proprietor">Proprietorship</option>
                        <option value="partnership">Partnership</option>
                        <option value="pvt_ltd">Private Limited</option>
                        <option value="llp">LLP</option>
                      </select>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
          
        </div>

        {/* RIGHT COLUMN: PREVIEW & DOWNLOAD CARD */}
        <div className="lg:col-span-7 bg-white rounded-3xl p-8 border border-gray-150 shadow-md space-y-6">
          <div className="flex flex-wrap gap-4 items-start justify-between border-b pb-5">
            <div>
              <span className="text-[10px] uppercase font-black tracking-widest text-indigo-600 bg-indigo-50 border border-indigo-100 px-3 py-1 rounded-full shadow-sm">
                Active Checklist Preview
              </span>
              <h2 className="text-2xl font-black text-gray-900 mt-3">
                {loanTypeLabels[previewSelection.loanType] || previewSelection.loanType} Checklists
              </h2>
              <p className="text-xs text-gray-500 font-semibold mt-1 flex flex-wrap items-center gap-1.5">
                📁 {loanStatusLabels[previewSelection.loanStatus] || previewSelection.loanStatus}
                <span className="text-gray-300">•</span> 👤 {incomeSourceLabels[previewSelection.incomeSource]}
                <span className="text-gray-300">•</span> 🌎 {residentTypeLabels[previewSelection.residentType]}
                {previewSelection.businessType && (
                  <>
                    <span className="text-gray-300">•</span> 💼 {businessTypeLabels[previewSelection.businessType]}
                  </>
                )}
              </p>
            </div>
            
            <button
              onClick={() => handleDownload(previewSelection, previewItems, 'checklist')}
              disabled={previewItems.length === 0 || downloading}
              className="px-6 py-3.5 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-700 hover:from-blue-700 hover:to-indigo-850 text-white font-bold text-sm shadow-lg shadow-blue-500/10 hover-lift transition-all flex items-center gap-2 disabled:opacity-50"
            >
              {downloading ? (
                <>
                  <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Compiling PDF...
                </>
              ) : (
                <>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  Download Form
                </>
              )}
            </button>
          </div>

          {/* Stats Badge Panel */}
          <div className="grid grid-cols-3 gap-4 bg-gray-50 border border-gray-100 rounded-2xl p-4 text-center">
            <div className="flex flex-col">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Total Items</span>
              <span className="text-xl font-extrabold text-gray-900 mt-0.5">{previewItems.length}</span>
            </div>
            <div className="flex flex-col border-x border-gray-200">
              <span className="text-[10px] font-bold text-amber-600 uppercase tracking-wide">Required</span>
              <span className="text-xl font-extrabold text-amber-800 mt-0.5">
                {previewItems.filter(i => i.required).length}
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Optional</span>
              <span className="text-xl font-extrabold text-gray-600 mt-0.5">
                {previewItems.filter(i => !i.required).length}
              </span>
            </div>
          </div>

          {/* Admin Custom Document Addition Console */}
          {user?.role === 'admin' && (
            <div className="bg-indigo-50/40 border border-indigo-150 rounded-2xl p-5 space-y-3 mb-6 shadow-sm">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-black text-indigo-950 uppercase tracking-widest flex items-center gap-1.5">
                  🛡️ Admin Console: Add File Requirement
                </h3>
                <button
                  onClick={() => setShowAddForm(!showAddForm)}
                  className="text-xs font-black text-indigo-600 hover:text-indigo-850 px-3 py-1 rounded-lg bg-indigo-100/50 hover:bg-indigo-100 transition-colors"
                >
                  {showAddForm ? 'Hide Form' : 'Show Add Form'}
                </button>
              </div>

              {showAddForm && (
                <form onSubmit={handleAddItemSubmit} className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end pt-2 border-t border-indigo-100">
                  <div className="md:col-span-5 space-y-1.5">
                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Document Name</label>
                    <input 
                      type="text"
                      required
                      placeholder="e.g. Income Tax Acknowledgment"
                      className="border border-indigo-150 rounded-xl px-3 py-2 text-xs bg-white w-full focus:ring-2 focus:ring-indigo-100 outline-none"
                      value={newDocName}
                      onChange={e => setNewDocName(e.target.value)}
                    />
                  </div>

                  <div className="md:col-span-4 space-y-1.5">
                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Category</label>
                    <select
                      className="border border-indigo-150 rounded-xl px-3 py-2 text-xs bg-white font-bold w-full focus:ring-2 focus:ring-indigo-100 outline-none"
                      value={newDocCategory}
                      onChange={e => setNewDocCategory(e.target.value)}
                    >
                      {Object.entries(categoryLabels).map(([k, v]) => (
                        <option key={k} value={k}>{v}</option>
                      ))}
                    </select>
                  </div>

                  <div className="md:col-span-3 flex items-center justify-between gap-2 h-[38px] pb-1">
                    <label className="flex items-center gap-1.5 cursor-pointer select-none">
                      <input 
                        type="checkbox" 
                        className="rounded text-indigo-650 focus:ring-indigo-500"
                        checked={newDocRequired}
                        onChange={e => setNewDocRequired(e.target.checked)}
                      />
                      <span className="text-xs font-bold text-gray-700">Required</span>
                    </label>

                    <button
                      type="submit"
                      className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-750 text-white font-bold text-xs shadow-sm transition-all"
                    >
                      Add File
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {/* Checklist preview sections */}
          <div className="space-y-6 max-h-[460px] overflow-y-auto pr-2 scrollbar-thin">
            {previewItems.length > 0 ? (
              Object.entries(groupedPreviewItems).map(([cat, list]) => (
                <div key={cat} className="border border-gray-150 rounded-2xl overflow-hidden shadow-sm bg-white">
                  <div className="bg-gray-50 border-b border-gray-150 px-5 py-3 flex justify-between items-center">
                    <span className="font-extrabold text-gray-800 text-sm">{categoryLabels[cat] || cat}</span>
                    <span className="text-[10px] font-bold text-gray-500 bg-gray-200/60 px-2 py-0.5 rounded-full">{list.length} items</span>
                  </div>
                  <ul className="divide-y divide-gray-100 text-sm">
                    {list.map(item => (
                      <li key={item.id} className="p-4 flex items-center justify-between gap-4 hover:bg-gray-50/20 transition-colors">
                        <span className="font-bold text-gray-800 leading-snug">{item.name}</span>
                        <div className="flex items-center gap-3.5">
                          <span className={`px-2.5 py-0.5 text-[9px] font-black uppercase tracking-wider rounded-full shadow-sm ${
                            item.required ? 'bg-red-50 text-red-700 border border-red-100' : 'bg-gray-50 text-gray-500 border border-gray-150'
                          }`}>
                            {item.required ? 'Required' : 'Optional'}
                          </span>
                          {user?.role === 'admin' && (
                            <button
                              onClick={() => handleDeleteItem(item.id)}
                              title="Delete document requirement"
                              className="text-red-500 hover:text-red-750 p-1.5 rounded-xl hover:bg-red-50 transition-all flex items-center justify-center"
                            >
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="3 6 5 6 21 6" />
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                <line x1="10" y1="11" x2="10" y2="17" />
                                <line x1="14" y1="11" x2="14" y2="17" />
                              </svg>
                            </button>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ))
            ) : (
              <div className="p-16 border border-dashed rounded-3xl text-center text-gray-400 bg-gray-50/50 font-semibold text-lg">
                No items match this combination.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
