/**
 * Server-side port of the decision-tree lookup in src/utils/resolver.ts
 * (getChecklistWithFallback + selectionToKey), trimmed to what the WhatsApp
 * intake pipeline needs: given a lead's stored loan attributes, which
 * document IDs are actually part of that lead's checklist.
 *
 * Deliberately NOT ported: the localStorage checklist overrides
 * (addChecklistItemToFlow/deleteChecklistItemFromFlow in resolver.ts) — those
 * live only in whichever admin's browser set them and are never synced
 * anywhere the backend could read them. A WhatsApp upload is therefore
 * checked against the same base decision tree every lead detail page shows
 * before any per-browser override is applied, not the fully-customized view.
 */

import { DECISION_TREE, COMMON_CHECKLIST } from './leadChecklistData.js';

const CIBIL_REPORT_ID = 'cibil_report_upload';

function withCibilReportItem(items) {
  if (items.some((item) => item.id === CIBIL_REPORT_ID)) return items;
  return [...items, { id: CIBIL_REPORT_ID, name: 'CIBIL Report', category: 'financial_documents', required: false }];
}

/** Mirrors resolver.ts's selectionToKey. `selection` uses the same camelCase field names. */
function selectionToKey(selection) {
  const { loanType, loanStatus, incomeSource, residentType, businessType } = selection;
  if (!loanType || !loanStatus) return null;

  const parts = [loanType, loanStatus];

  if (loanType === 'msme') {
    if (businessType) parts.push(businessType);
    return parts.join('|');
  }

  if (!incomeSource) return null;
  parts.push(incomeSource);

  if (!residentType) return null;
  parts.push(residentType);

  if (businessType) {
    parts.push(businessType);
  } else if (incomeSource === 'non_salaried') {
    return null;
  }

  return parts.join('|');
}

/**
 * Mirrors resolver.ts's getChecklistWithFallback: exact key match, then
 * without businessType, then first entry for the loan type, then the common
 * checklist — so a lead with a partially-filled profile still resolves to
 * something instead of "no checklist at all".
 *
 * @param {{loanType?: string, loanStatus?: string, incomeSource?: string, residentType?: string, businessType?: string}} selection
 * @returns {Array<{id: string, name: string, category: string, required: boolean}>}
 */
export function getChecklistWithFallback(selection) {
  const key = selectionToKey(selection);

  if (key) {
    let checklist = DECISION_TREE[key];

    if (!checklist) {
      const parts = key.split('|');
      if (parts.length === 5) {
        checklist = DECISION_TREE[parts.slice(0, 4).join('|')];
      }
    }

    if (!checklist) {
      const loanType = key.split('|')[0];
      const fallbackKey = Object.keys(DECISION_TREE).find((k) => k.startsWith(loanType + '|'));
      if (fallbackKey) checklist = DECISION_TREE[fallbackKey];
    }

    if (checklist && checklist.length > 0) {
      return withCibilReportItem(checklist.filter(Boolean));
    }
  }

  if (selection.loanType) {
    const cleanLoanType = selection.loanType.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    const fallbackKey =
      Object.keys(DECISION_TREE).find((k) => k.startsWith(cleanLoanType + '|')) ||
      Object.keys(DECISION_TREE).find((k) => k.startsWith(selection.loanType + '|'));
    if (fallbackKey) {
      const fbChecklist = DECISION_TREE[fallbackKey];
      if (fbChecklist && fbChecklist.length > 0) {
        return withCibilReportItem(fbChecklist.filter(Boolean));
      }
    }
  }

  return withCibilReportItem(COMMON_CHECKLIST || []);
}

/**
 * @param {{loan_type?: string, loan_status?: string, income_source?: string, resident_type?: string, business_type?: string}} lead row (snake_case, as read from Supabase)
 * @returns {Set<string>} document IDs that are part of this lead's checklist
 */
export function getRequiredDocumentIdsForLead(lead) {
  const checklist = getChecklistWithFallback({
    loanType: lead.loan_type,
    loanStatus: lead.loan_status,
    incomeSource: lead.income_source,
    residentType: lead.resident_type,
    businessType: lead.business_type,
  });
  return new Set(checklist.map((item) => item.id));
}
