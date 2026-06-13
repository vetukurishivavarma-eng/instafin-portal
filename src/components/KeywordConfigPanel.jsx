import React, { useState, useEffect, useMemo } from 'react';
import {
  getBuiltinKeywordMap,
  getCustomKeywordOverrides,
  addCustomKeyword,
  removeCustomKeyword,
  resetCustomKeywordsForDoc,
  resetAllCustomKeywords,
} from '../utils/bulkDocMatcher';
import { getAvailableKeys, getChecklistByKey } from '../utils/resolver';

const CATEGORY_ORDER = ['kyc', 'income_proof', 'business_documents', 'property_documents', 'financial_documents', 'legal_documents', 'others'];
const CATEGORY_LABELS = {
  kyc: 'KYC Documents',
  income_proof: 'Income Proof',
  business_documents: 'Business Documents',
  property_documents: 'Property Documents',
  financial_documents: 'Financial Documents',
  legal_documents: 'Legal Documents',
  others: 'Others',
};

// Collect all unique document IDs+names from the decision tree
function collectAllDocItems() {
  const seen = new Map();
  const keys = getAvailableKeys();
  keys.forEach(key => {
    const items = getChecklistByKey(key);
    if (items) {
      items.forEach(item => {
        if (!seen.has(item.id)) {
          seen.set(item.id, item);
        }
      });
    }
  });
  return Array.from(seen.values());
}

export default function KeywordConfigPanel({ success, setSuccess, setError }) {
  const builtinMap = useMemo(() => getBuiltinKeywordMap(), []);
  const [customOverrides, setCustomOverrides] = useState(() => getCustomKeywordOverrides());
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [addingKeyword, setAddingKeyword] = useState({}); // { docId: 'tempValue' }
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  // Refresh when overrides change
  const refreshOverrides = () => {
    setCustomOverrides({ ...getCustomKeywordOverrides() });
  };

  const allItems = useMemo(() => collectAllDocItems(), []);

  const filteredItems = useMemo(() => {
    return allItems.filter(item => {
      const builtinKws = builtinMap[item.id] || [];
      const customKws = customOverrides[item.id]?.keywords || [];
      const allKws = [...builtinKws.flat(), ...customKws];
      const textMatch = !search ||
        item.name.toLowerCase().includes(search.toLowerCase()) ||
        item.id.toLowerCase().includes(search.toLowerCase()) ||
        allKws.some(k => k.includes(search.toLowerCase()));
      const catMatch = !categoryFilter || item.category === categoryFilter;
      return textMatch && catMatch;
    });
  }, [allItems, builtinMap, customOverrides, search, categoryFilter]);

  const handleAddKeyword = (docId) => {
    const kw = (addingKeyword[docId] || '').trim();
    if (!kw) return;
    addCustomKeyword(docId, kw);
    setAddingKeyword(prev => ({ ...prev, [docId]: '' }));
    refreshOverrides();
    setSuccess(`Keyword "${kw}" added!`);
    setTimeout(() => setSuccess(''), 3000);
  };

  const handleRemoveKeyword = (docId, keyword) => {
    removeCustomKeyword(docId, keyword);
    refreshOverrides();
    setSuccess(`Keyword "${keyword}" removed.`);
    setTimeout(() => setSuccess(''), 3000);
  };

  const handleResetDoc = (docId) => {
    resetCustomKeywordsForDoc(docId);
    refreshOverrides();
    setSuccess('Custom keywords reset for this document.');
    setTimeout(() => setSuccess(''), 3000);
  };

  const handleResetAll = () => {
    resetAllCustomKeywords();
    refreshOverrides();
    setShowResetConfirm(false);
    setSuccess('All custom keywords reset to defaults.');
    setTimeout(() => setSuccess(''), 3000);
  };

  const totalCustom = Object.keys(customOverrides).length;

  const groupedItems = useMemo(() => {
    const groups = {};
    CATEGORY_ORDER.forEach(cat => {
      const items = filteredItems.filter(i => i.category === cat);
      if (items.length > 0) groups[cat] = items;
    });
    return groups;
  }, [filteredItems]);

  return (
    <div className="max-w-6xl mx-auto">
      <div className="bg-white rounded-3xl shadow-xl p-6 border border-gray-150">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Bulk Upload Keyword Configuration</h2>
            <p className="text-sm text-gray-500 mt-1">
              Customize filename keywords used by the bulk upload Segregate feature.
              {totalCustom > 0 && (
                <span className="ml-2 text-violet-600 font-semibold">
                  ({totalCustom} document{totalCustom > 1 ? 's' : ''} have custom keywords)
                </span>
              )}
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => setShowResetConfirm(true)}
              disabled={totalCustom === 0}
              className={`px-4 py-2.5 rounded-xl font-semibold text-xs transition-all flex items-center gap-2 ${
                totalCustom > 0
                  ? 'bg-red-50 text-red-700 hover:bg-red-100 border border-red-200'
                  : 'bg-gray-50 text-gray-400 cursor-not-allowed border border-gray-200'
              }`}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
              Reset All Custom Keywords
            </button>
          </div>
        </div>

        {/* Info Banner */}
        <div className="bg-violet-50 border border-violet-200 rounded-2xl p-4 mb-6 text-xs text-violet-800 flex items-start gap-3">
          <svg className="w-5 h-5 text-violet-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <strong>How it works:</strong> When you upload files for bulk segregation, the system matches filenames against keywords.
            Built-in keywords are shown in gray. You can add custom keywords (shown in violet) to improve matching for your specific file naming patterns.
            Custom keywords are stored in your browser and apply to all users on this device.
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-4 mb-6">
          <div className="flex-1 min-w-[200px]">
            <input
              type="text"
              placeholder="Search by document name, ID, or keyword..."
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-violet-200 outline-none"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <select
            className="border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-semibold focus:ring-2 focus:ring-violet-200 outline-none bg-white"
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value)}
          >
            <option value="">All Categories</option>
            {CATEGORY_ORDER.map(cat => (
              <option key={cat} value={cat}>{CATEGORY_LABELS[cat] || cat}</option>
            ))}
          </select>
          <span className="text-xs text-gray-400 self-center font-medium">
            {filteredItems.length} document{filteredItems.length !== 1 ? 's' : ''} shown
          </span>
        </div>

        {/* Document List */}
        {filteredItems.length === 0 ? (
          <div className="text-center py-16 text-gray-400 font-semibold border border-dashed rounded-2xl">
            No documents match your search.
          </div>
        ) : (
          <div className="space-y-6 max-h-[600px] overflow-y-auto pr-2">
            {CATEGORY_ORDER.map(cat => {
              const items = groupedItems[cat];
              if (!items || items.length === 0) return null;
              return (
                <div key={cat} className="border border-gray-200 rounded-2xl overflow-hidden">
                  <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                    <h4 className="font-bold text-gray-800 text-sm">{CATEGORY_LABELS[cat] || cat}</h4>
                    <span className="text-[10px] font-bold text-gray-500">{items.length} item{items.length !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="divide-y divide-gray-100">
                    {items.map(item => {
                      const builtinGroups = builtinMap[item.id] || [];
                      const builtinKeywords = builtinGroups.flat();
                      const custom = customOverrides[item.id];
                      const customKeywords = custom?.keywords || [];
                      const isEnabled = custom?.enabled !== false;
                      const addingVal = addingKeyword[item.id] || '';

                      return (
                        <div key={item.id} className="px-5 py-4 hover:bg-gray-50/50 transition-colors">
                          <div className="flex items-start justify-between gap-4 mb-2">
                            <div>
                              <p className="text-sm font-bold text-gray-900">{item.name}</p>
                              <p className="text-[10px] text-gray-400 font-mono mt-0.5">{item.id}</p>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                                item.required ? 'bg-red-50 text-red-600' : 'bg-gray-100 text-gray-500'
                              }`}>
                                {item.required ? 'Required' : 'Optional'}
                              </span>
                              {customKeywords.length > 0 && (
                                <span className="text-[10px] font-bold text-violet-600 bg-violet-50 px-2 py-0.5 rounded-full">
                                  +{customKeywords.length} custom
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Built-in keywords */}
                          {builtinKeywords.length > 0 && (
                            <div className="mb-2">
                              <p className="text-[10px] font-semibold text-gray-400 mb-1 uppercase tracking-wider">Built-in keywords:</p>
                              <div className="flex flex-wrap gap-1">
                                {[...new Set(builtinKeywords)].map(kw => (
                                  <span key={kw} className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium bg-gray-100 text-gray-500 border border-gray-200">
                                    {kw}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Custom keywords */}
                          <div className="mb-2">
                            <div className="flex items-center gap-2 mb-1">
                              <p className="text-[10px] font-semibold text-violet-600 uppercase tracking-wider">Custom keywords:</p>
                              {customKeywords.length > 0 && (
                                <button
                                  onClick={() => handleResetDoc(item.id)}
                                  className="text-[9px] text-red-500 hover:text-red-700 font-medium"
                                >
                                  Clear custom
                                </button>
                              )}
                            </div>
                            <div className="flex flex-wrap gap-1">
                              {customKeywords.length > 0 ? (
                                customKeywords.map(kw => (
                                  <span key={kw} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-violet-100 text-violet-700 border border-violet-200">
                                    {kw}
                                    <button
                                      onClick={() => handleRemoveKeyword(item.id, kw)}
                                      className="text-violet-400 hover:text-red-600 font-bold leading-none"
                                      title={`Remove "${kw}"`}
                                    >
                                      &times;
                                    </button>
                                  </span>
                                ))
                              ) : (
                                <span className="text-[10px] text-gray-400 italic">No custom keywords — files will only match against built-in keywords</span>
                              )}
                            </div>
                          </div>

                          {/* Add keyword form */}
                          <div className="flex items-center gap-2 mt-2">
                            <input
                              type="text"
                              placeholder="Add a custom keyword (e.g., my_adhaar_scan)"
                              className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-xs focus:ring-2 focus:ring-violet-300 outline-none"
                              value={addingVal}
                              onChange={e => setAddingKeyword(prev => ({ ...prev, [item.id]: e.target.value }))}
                              onKeyDown={e => { if (e.key === 'Enter') handleAddKeyword(item.id); }}
                            />
                            <button
                              onClick={() => handleAddKeyword(item.id)}
                              disabled={!addingVal.trim()}
                              className="px-3 py-1.5 rounded-lg bg-violet-600 text-white font-semibold text-xs hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                            >
                              Add
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Reset All Confirmation Modal */}
      {showResetConfirm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowResetConfirm(false)}>
          <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-2xl bg-red-100 flex items-center justify-center">
                <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-900">Reset All Custom Keywords?</h3>
                <p className="text-sm text-gray-500 mt-1">
                  This will remove all {totalCustom} custom keyword overrides you've added. Built-in keywords will remain. This action cannot be undone.
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowResetConfirm(false)}
                className="flex-1 px-4 py-3 border border-gray-300 rounded-xl text-gray-700 font-semibold hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleResetAll}
                className="flex-1 px-4 py-3 bg-red-600 text-white rounded-xl font-semibold hover:bg-red-700 transition-all shadow-md"
              >
                Reset All
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
