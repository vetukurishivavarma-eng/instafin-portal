/**
 * Bulk Document Matcher
 * Matches uploaded filenames to checklist document items based on keywords.
 * Supports scoring, fallback matching, and returns unmatched files for manual assignment.
 * Supports custom keyword overrides stored in localStorage for admin customization.
 */

import { ChecklistItem } from '../data/types';

// Score threshold for a confident match
const CONFIDENCE_THRESHOLD = 0.6;

// localStorage key for custom keyword overrides
const CUSTOM_KW_KEY = 'instafin_bulk_kw_overrides';

export interface MatchResult {
  matched: Array<{ file: File; documentId: string; documentName: string }>;
  unmatched: Array<{ file: File; reason: string }>;
}

// ===== Custom keyword override management =====

/**
 * Read custom keyword overrides from localStorage.
 * Format: { [docId]: { keywords: string[]; enabled: boolean } }
 */
export function getCustomKeywordOverrides(): Record<string, { keywords: string[]; enabled: boolean }> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(CUSTOM_KW_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/**
 * Save custom keyword overrides to localStorage.
 */
export function saveCustomKeywordOverrides(overrides: Record<string, { keywords: string[]; enabled: boolean }>): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(CUSTOM_KW_KEY, JSON.stringify(overrides));
  } catch (e) {
    console.error('Failed to save custom keyword overrides:', e);
  }
}

/**
 * Add a custom keyword for a document type.
 */
export function addCustomKeyword(docId: string, keyword: string): void {
  const overrides = getCustomKeywordOverrides();
  if (!overrides[docId]) {
    overrides[docId] = { keywords: [], enabled: true };
  }
  const kw = keyword.trim().toLowerCase();
  if (kw && !overrides[docId].keywords.includes(kw)) {
    overrides[docId].keywords.push(kw);
    saveCustomKeywordOverrides(overrides);
  }
}

/**
 * Remove a custom keyword from a document type.
 */
export function removeCustomKeyword(docId: string, keyword: string): void {
  const overrides = getCustomKeywordOverrides();
  if (!overrides[docId]) return;
  overrides[docId].keywords = overrides[docId].keywords.filter(k => k !== keyword);
  if (overrides[docId].keywords.length === 0) {
    delete overrides[docId];
  }
  saveCustomKeywordOverrides(overrides);
}

/**
 * Toggle whether custom keywords are enabled for a document type.
 */
export function toggleCustomKeywords(docId: string, enabled: boolean): void {
  const overrides = getCustomKeywordOverrides();
  if (!overrides[docId]) {
    if (enabled) {
      overrides[docId] = { keywords: [], enabled: true };
    }
  } else {
    overrides[docId].enabled = enabled;
  }
  saveCustomKeywordOverrides(overrides);
}

/**
 * Get the effective (merged built-in + custom overrides) keyword map for a single document ID.
 */
export function getEffectiveKeywordGroups(docId: string): string[][] {
  const builtin = KEYWORD_MAP[docId] || [];
  const custom = getCustomKeywordOverrides();
  const override = custom[docId];
  if (override && override.enabled && override.keywords.length > 0) {
    // Return built-in groups PLUS each custom keyword as its own group
    return [...builtin, ...override.keywords.map(kw => [kw])];
  }
  return builtin;
}

/**
 * Get the full effective keyword map (all docIds merged with overrides).
 */
export function getFullEffectiveKeywordMap(): Record<string, string[][]> {
  const allDocIds = new Set([...Object.keys(KEYWORD_MAP)]);
  const custom = getCustomKeywordOverrides();
  Object.keys(custom).forEach(id => allDocIds.add(id));
  
  const result: Record<string, string[][]> = {};
  for (const docId of allDocIds) {
    const groups = getEffectiveKeywordGroups(docId);
    if (groups.length > 0) {
      result[docId] = groups;
    }
  }
  return result;
}

/**
 * Get the built-in keyword map (read-only copy for display).
 */
export function getBuiltinKeywordMap(): Record<string, string[][]> {
  return { ...KEYWORD_MAP };
}

/**
 * Reset all custom keyword overrides for a single document type.
 */
export function resetCustomKeywordsForDoc(docId: string): void {
  const overrides = getCustomKeywordOverrides();
  delete overrides[docId];
  saveCustomKeywordOverrides(overrides);
}

/**
 * Reset ALL custom keyword overrides.
 */
export function resetAllCustomKeywords(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(CUSTOM_KW_KEY);
  } catch {}
}

/**
 * Strips file extension and normalizes filename for matching.
 * Removes common noise like underscores, hyphens, extra spaces.
 */
function normalizeFilename(name: string): string {
  return name
    .replace(/\.[^/.]+$/, '')           // remove extension
    .replace(/[-_]/g, ' ')               // hyphens/underscores to spaces
    .replace(/\s+/g, ' ')                // collapse whitespace
    .trim()
    .toLowerCase();
}

/**
 * Comprehensive keyword-to-document mapping.
 * Each document ID has a list of keyword groups — if any group's ALL keywords match, that's a hit.
 * This allows matching "Aadhaar Card Front" or just "aadhaar" to the aadhaar document.
 */
const KEYWORD_MAP: Record<string, string[][]> = {
  // ===== KYC Documents =====
  kyc_aadhaar: [
    ['aadhaar'],
    ['aadhar'],
    ['uidai'],
    ['adhaar'],
  ],
  kyc_pan: [
    ['pan'],
    ['pan card'],
    ['permanent account'],
  ],
  kyc_addr_proof: [
    ['address proof'],
    ['address'],
    ['utility bill'],
    ['electricity bill'],
    ['water bill'],
    ['rent agreement'],
  ],
  kyc_passport: [
    ['passport'],
  ],
  kyc_voter: [
    ['voter'],
    ['voter id'],
    ['voter card'],
    ['election'],
  ],
  kyc_dl: [
    ['driving license'],
    ['driving licence'],
    ['dl'],
  ],
  kyc_photo: [
    ['photo'],
    ['photograph'],
    ['passport size'],
  ],
  kyc_nri_passport: [
    ['nri passport'],
    ['nri visa'],
  ],
  kyc_poa: [
    ['power of attorney'],
    ['poa'],
  ],
  kyc_overseas_addr: [
    ['overseas address'],
    ['overseas proof'],
    ['foreign address'],
  ],
  kyc_overseas_credit: [
    ['overseas credit'],
    ['foreign credit'],
    ['international credit'],
  ],
  kyc_work_permit: [
    ['work permit'],
    ['employment permit'],
  ],
  kyc_visa: [
    ['visa'],
  ],
  kyc_cdc: [
    ['cdc'],
    ['continuous discharge'],
    ['seaman'],
  ],
  kyc_poa_bio: [
    ['poa holder bio'],
    ['poa bio'],
    ['bio data poa'],
    ['poa biodata'],
  ],
  kyc_poa_notarized: [
    ['poa notarized'],
    ['notarized poa'],
    ['notarized power'],
    ['adjudicated poa'],
  ],

  // ===== Income Proof - Salaried =====
  inc_salary_acct_12: [
    ['salary account'],
    ['salary statement'],
    ['salary a c'],
  ],
  inc_salary_acct_6: [
    ['salary account 6'],
    ['6 month salary'],
    ['salary statement 6'],
  ],
  inc_payslips_6: [
    ['pay slip'],
    ['payslip'],
    ['salary slip'],
    ['paystub'],
    ['pay stub'],
  ],
  inc_payslips_12: [
    ['12 pay slip'],
    ['pay slip 12'],
    ['year pay slip'],
  ],
  inc_offer_letter: [
    ['offer letter'],
    ['appointment letter'],
    ['relieving letter'],
    ['joining letter'],
  ],
  inc_form16_2y: [
    ['form 16'],
    ['form16'],
  ],
  inc_company_id: [
    ['company id'],
    ['employee id'],
    ['identity card'],
    ['id card'],
  ],
  inc_salary_slips: [
    ['salary slip 3'],
    ['3 month salary'],
    ['recent salary'],
  ],
  inc_salary_slips_6: [
    ['salary slip 6'],
    ['6 month salary slip'],
  ],
  inc_form16: [
    ['form 16 latest'],
    ['latest form 16'],
    ['form16 latest'],
  ],
  inc_it_returns: [
    ['it return'],
    ['income tax return'],
    ['tax return'],
    ['itr'],
  ],
  inc_it_returns_2_nri: [
    ['itr nri'],
    ['nri return'],
    ['w2 form'],
    ['nri it return'],
  ],
  inc_bank_stmt: [
    ['bank statement'],
    ['bank statement 6'],
    ['bank a c'],
  ],
  inc_bank_stmt_12: [
    ['bank statement 12'],
    ['12 month bank'],
    ['year bank statement'],
  ],
  inc_emp_letter: [
    ['employment letter'],
    ['employment certificate'],
    ['employee certificate'],
    ['service certificate'],
  ],
  inc_salary_cert_orig: [
    ['salary certificate'],
    ['salary cert'],
    ['original salary'],
  ],
  inc_employer_id: [
    ['employer id'],
    ['employer card'],
    ['current employer'],
  ],
  inc_prev_employer: [
    ['previous employer'],
    ['previous company'],
    ['former employer'],
    ['prev employer'],
  ],
  inc_overseas_bank_6: [
    ['overseas bank'],
    ['nri bank'],
    ['foreign bank'],
    ['nri account'],
  ],
  inc_overseas_res: [
    ['overseas residence'],
    ['foreign residence'],
    ['utility bill overseas'],
    ['abroad residence'],
    ['foreign utility'],
  ],
  inc_emp_contract: [
    ['employment contract'],
    ['work contract'],
    ['service contract'],
  ],
  inc_credit_info: [
    ['credit information'],
    ['credit report'],
    ['credit info'],
    ['cibil'],
    ['experian'],
    ['credit score'],
  ],

  // ===== Income Proof - Non-Salaried =====
  inc_it_returns_3: [
    ['it return 3 year'],
    ['3 year it return'],
    ['itr 3 year'],
    ['itr last 3'],
  ],
  inc_audit_report: [
    ['audit report'],
    ['audited financial'],
    ['ca certified'],
  ],
  inc_income_cert: [
    ['income certificate'],
    ['income proof'],
  ],

  // ===== Business Documents =====
  biz_gst: [
    ['gst return'],
    ['gstr'],
    ['gst filing'],
  ],
  biz_gst_reg: [
    ['gst registration'],
    ['gst certificate'],
    ['gst reg'],
  ],
  biz_reg: [
    ['business registration'],
    ['incorporation'],
    ['company registration'],
  ],
  biz_shop_act: [
    ['shop act'],
    ['establishment license'],
    ['establishment licence'],
    ['shop license'],
  ],
  biz_partnership: [
    ['partnership deed'],
  ],
  biz_moa_aoa: [
    ['moa'],
    ['aoa'],
    ['memorandum'],
    ['articles of association'],
  ],
  biz_udyam: [
    ['udyam'],
    ['udyog aadhaar'],
    ['udyam aadhaar'],
  ],
  biz_trade_license: [
    ['trade license'],
    ['trade licence'],
  ],
  biz_msme: [
    ['msme'],
    ['sme certificate'],
  ],

  // ===== Property Documents =====
  prop_sale_agreement: [
    ['sale agreement'],
    ['agreement of sale'],
    ['agreement to sell'],
  ],
  prop_sale_deed: [
    ['sale deed'],
    ['registered sale'],
  ],
  prop_sale_deed_draft: [
    ['sale deed draft'],
    ['draft sale deed'],
  ],
  prop_link_docs: [
    ['link document'],
    ['chain document'],
    ['previous deed'],
  ],
  prop_plan_proceeding: [
    ['plan proceeding'],
    ['building plan'],
    ['approved plan'],
    ['sanction plan'],
  ],
  prop_house_tax: [
    ['house tax'],
    ['property tax'],
    ['municipal tax'],
  ],
  prop_power_bill: [
    ['power bill'],
    ['electricity bill'],
    ['current bill'],
  ],
  prop_title_deed: [
    ['title deed'],
    ['title document'],
    ['original title'],
  ],
  prop_encumbrance: [
    ['encumbrance'],
    ['ec certificate'],
  ],
  prop_completion: [
    ['completion certificate'],
    ['cc certificate'],
  ],
  prop_occupancy: [
    ['occupancy certificate'],
    ['oc certificate'],
  ],
  prop_mutation: [
    ['mutation'],
    ['mutated'],
  ],
  prop_khata: [
    ['khata'],
    ['katha'],
  ],
  prop_dev_agreement: [
    ['development agreement'],
  ],
  prop_allotment: [
    ['allotment letter'],
    ['allotment'],
  ],
  prop_payment: [
    ['payment receipt'],
    ['booking receipt'],
    ['payment proof'],
    ['receipt'],
  ],
  prop_noc: [
    ['noc'],
    ['no objection'],
  ],
  prop_estimation: [
    ['estimation'],
    ['cost estimate'],
    ['construction estimate'],
  ],

  // ===== Financial Documents =====
  fin_ca_stmt: [
    ['ca statement'],
    ['certified financial'],
    ['ca certified statement'],
  ],
  fin_balance_sheet: [
    ['balance sheet'],
  ],
  fin_pnl: [
    ['profit loss'],
    ['p and l'],
    ['pnl'],
    ['income statement'],
  ],
  fin_cashflow: [
    ['cash flow'],
    ['cashflow'],
  ],
  fin_credit_report: [
    ['credit report'],
    ['cibil report'],
    ['experian report'],
  ],
  fin_existing_loans: [
    ['existing loan'],
    ['loan sanction'],
    ['sanction letter'],
  ],
  fin_security: [
    ['security document'],
    ['collateral'],
  ],

  // ===== Legal Documents =====
  legal_opinion: [
    ['legal opinion'],
    ['title search'],
    ['advocate opinion'],
  ],
  legal_dev_rights: [
    ['development rights'],
  ],
  legal_poa: [
    ['power of attorney legal'],
    ['registered poa'],
  ],
  legal_undertaking: [
    ['undertaking'],
    ['declaration'],
    ['affidavit'],
  ],

  // ===== Common / Others =====
  loan_sanction_letter: [
    ['sanction letter'],
    ['loan sanction'],
    ['offer letter loan'],
  ],
  loan_acct_stmt: [
    ['loan account'],
    ['loan statement'],
    ['loan a c'],
  ],
};

/**
 * Build a flat keyword-to-documentId map for faster matching using the effective keyword map.
 */
function buildKeywordIndex(): Map<string, Array<{ docId: string; groupIndex: number }>> {
  const index = new Map<string, Array<{ docId: string; groupIndex: number }>>();
  const effectiveMap = getFullEffectiveKeywordMap();
  
  for (const [docId, groups] of Object.entries(effectiveMap)) {
    groups.forEach((keywords, groupIndex) => {
      keywords.forEach(keyword => {
        if (!index.has(keyword)) {
          index.set(keyword, []);
        }
        index.get(keyword)!.push({ docId, groupIndex });
      });
    });
  }
  
  return index;
}

/**
 * Get all unique keywords from the effective map for faster rejection.
 */
function getAllKeywords(): Set<string> {
  const keywords = new Set<string>();
  const effectiveMap = getFullEffectiveKeywordMap();
  for (const groups of Object.values(effectiveMap)) {
    groups.forEach(group => group.forEach(kw => keywords.add(kw)));
  }
  return keywords;
}

/**
 * Try to match a single filename against the effective keyword map.
 * Returns the matched document ID and name, or null.
 */
function matchFile(
  file: File,
  checklistItems: ChecklistItem[]
): { documentId: string; documentName: string; score: number; matchedKeywords: string[] } | null {
  const filename = file.name;
  const normalized = normalizeFilename(filename);
  
  // If filename is empty after normalization, skip
  if (!normalized) return null;

  // Quick check: does the filename contain any known keywords?
  const allKws = getAllKeywords();
  let hasAnyKeyword = false;
  for (const kw of allKws) {
    if (normalized.includes(kw)) {
      hasAnyKeyword = true;
      break;
    }
  }
  if (!hasAnyKeyword) return null;

  // Build a docId -> ChecklistItem lookup
  const itemMap = new Map<string, ChecklistItem>();
  checklistItems.forEach(item => itemMap.set(item.id, item));

  // Use effective keyword map (built-in + custom overrides)
  const effectiveMap = getFullEffectiveKeywordMap();
  
  // Score each potential match
  const scores: Array<{
    docId: string;
    score: number;
    matchedKeywords: string[];
  }> = [];

  for (const [docId, groups] of Object.entries(effectiveMap)) {
    // Skip if this docId isn't in the checklist
    if (!itemMap.has(docId)) continue;

    let bestGroupScore = 0;
    let bestGroupKeywords: string[] = [];

    groups.forEach(keywords => {
      // Calculate how many keywords from this group match
      const matched = keywords.filter(kw => normalized.includes(kw));
      if (matched.length > 0) {
        // Score = proportion of matched keywords in this group / total groups for this doc
        const groupScore = matched.length / keywords.length;
        if (groupScore > bestGroupScore) {
          bestGroupScore = groupScore;
          bestGroupKeywords = matched;
        }
      }
    });

    if (bestGroupScore > 0) {
      scores.push({
        docId,
        score: bestGroupScore,
        matchedKeywords: bestGroupKeywords,
      });
    }
  }

  if (scores.length === 0) return null;

  // Sort by score descending, take best
  scores.sort((a, b) => b.score - a.score);
  const best = scores[0];

  // If best score is below threshold, return null
  if (best.score < CONFIDENCE_THRESHOLD) return null;

  const matchedItem = itemMap.get(best.docId);
  if (!matchedItem) return null;

  // Check if there's a very close competitor (score within 0.2 of best)
  if (scores.length > 1 && scores[1].score >= best.score - 0.2 && scores[1].score > 0) {
    // Ambiguous match - return null to let user decide
    return null;
  }

  return {
    documentId: best.docId,
    documentName: matchedItem.name,
    score: best.score,
    matchedKeywords: best.matchedKeywords,
  };
}

/**
 * Match multiple files against checklist items.
 * Returns matched files and unmatched files.
 */
export function matchFiles(
  files: File[],
  checklistItems: ChecklistItem[]
): MatchResult {
  const matched: Array<{ file: File; documentId: string; documentName: string }> = [];
  const unmatched: Array<{ file: File; reason: string }> = [];

  // Track which document IDs have been matched (to avoid duplicates)
  const usedDocIds = new Set<string>();

  // First pass: try exact / high-confidence matches
  const firstPassResults = files.map(file => {
    const match = matchFile(file, checklistItems);
    return { file, match };
  });

  // Sort by score descending for first pass allocation
  firstPassResults.sort((a, b) => {
    const scoreA = a.match?.score ?? 0;
    const scoreB = b.match?.score ?? 0;
    return scoreB - scoreA;
  });

  // Allocate matches (one doc per file)
  for (const { file, match } of firstPassResults) {
    if (match && !usedDocIds.has(match.documentId)) {
      usedDocIds.add(match.documentId);
      matched.push({
        file,
        documentId: match.documentId,
        documentName: match.documentName,
      });
    } else {
      unmatched.push({
        file,
        reason: match && usedDocIds.has(match.documentId)
          ? `Document "${match.documentName}" already matched by another file`
          : 'Could not match to any document type',
      });
    }
  }

  return { matched, unmatched };
}


