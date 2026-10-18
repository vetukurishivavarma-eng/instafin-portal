// Which category folder a lead's uploaded document belongs in — the same
// categories and names as the Checklists page (keep the two in sync). Uses the lead's own checklist first (exact), then the
// document-id prefix (for ids outside that checklist, e.g. legacy uploads).
import { getChecklistWithFallback } from '../whatsapp-intake/leadChecklistResolver.js';

export const CATEGORY_LABELS = {
  kyc: 'KYC Documents',
  income_proof: 'Income Proof',
  business_documents: 'Business Documents',
  property_documents: 'Property Documents',
  financial_documents: 'Financial Documents',
  legal_documents: 'Legal Documents',
  others: 'Others',
};

const PREFIXES = [
  ['kyc_', 'kyc'], ['inc_', 'income_proof'], ['biz_', 'business_documents'], ['msme_', 'business_documents'],
  ['firm_', 'business_documents'], ['prop_', 'property_documents'], ['fin_', 'financial_documents'],
  ['legal_', 'legal_documents'], ['loan_', 'financial_documents'], ['cibil_', 'financial_documents'],
];

export function leadChecklist(lead) {
  return getChecklistWithFallback({
    loanType: lead.loan_type, loanStatus: lead.loan_status, incomeSource: lead.income_source,
    residentType: lead.resident_type, businessType: lead.business_type,
  });
}

// Returns a function documentId -> { key, label }.
export function categorizer(lead) {
  const byId = new Map(leadChecklist(lead).map((i) => [i.id, i.category]));
  return (documentId) => {
    let key = byId.get(documentId);
    if (!key || !CATEGORY_LABELS[key]) key = (PREFIXES.find(([p]) => String(documentId || '').startsWith(p)) || [])[1] || 'others';
    return { key, label: CATEGORY_LABELS[key] };
  };
}
