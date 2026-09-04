/**
 * Document-type keyword catalog, ported from src/utils/bulkDocMatcher.ts so
 * that WhatsApp intake resolves a document name ("Aadhaar", "Address Proof")
 * to the exact same documentId the manual bulk-upload screen would assign
 * ("kyc_aadhaar", "kyc_addr_proof", ...). Keep the two files in sync if the
 * keyword list changes on the frontend.
 *
 * NOTE (known scoping limit — see docs/WHATSAPP_INTAKE.md): the frontend
 * narrows this catalog further per lead via a client-side decision tree
 * (loan type + status + income source + resident type) plus optional
 * per-browser localStorage keyword overrides. Neither is available
 * server-side today, so intake validates a document name against the FULL
 * catalog ("is this a real, known document type?") rather than the exact
 * subset required for one specific lead. Executives still see the true
 * per-lead checklist in the portal UI.
 */

const CONFIDENCE_THRESHOLD = 0.6;

export const KEYWORD_MAP = {
  kyc_aadhaar: [['aadhaar'], ['aadhar'], ['uidai'], ['adhaar']],
  kyc_pan: [['pan'], ['pan card'], ['permanent account']],
  kyc_addr_proof: [
    ['address proof'], ['address'], ['utility bill'], ['electricity bill'], ['water bill'], ['rent agreement'],
  ],
  kyc_passport: [['passport']],
  kyc_voter: [['voter'], ['voter id'], ['voter card'], ['election']],
  kyc_dl: [['driving license'], ['driving licence'], ['dl']],
  kyc_photo: [['photo'], ['photograph'], ['passport size']],
  kyc_nri_passport: [['nri passport'], ['nri visa']],
  kyc_poa: [['power of attorney'], ['poa']],
  kyc_overseas_addr: [['overseas address'], ['overseas proof'], ['foreign address']],
  kyc_overseas_credit: [['overseas credit'], ['foreign credit'], ['international credit']],
  kyc_work_permit: [['work permit'], ['employment permit']],
  kyc_visa: [['visa']],
  kyc_cdc: [['cdc'], ['continuous discharge'], ['seaman']],
  kyc_poa_bio: [['poa holder bio'], ['poa bio'], ['bio data poa'], ['poa biodata']],
  kyc_poa_notarized: [['poa notarized'], ['notarized poa'], ['notarized power'], ['adjudicated poa']],

  inc_salary_acct_12: [['salary account'], ['salary statement'], ['salary a c']],
  inc_salary_acct_6: [['salary account 6'], ['6 month salary'], ['salary statement 6']],
  inc_payslips_6: [['pay slip'], ['payslip'], ['salary slip'], ['paystub'], ['pay stub']],
  inc_payslips_12: [['12 pay slip'], ['pay slip 12'], ['year pay slip']],
  inc_offer_letter: [['offer letter'], ['appointment letter'], ['relieving letter'], ['joining letter']],
  inc_form16_2y: [['form 16'], ['form16']],
  inc_company_id: [['company id'], ['employee id'], ['identity card'], ['id card']],
  inc_salary_slips: [['salary slip 3'], ['3 month salary'], ['recent salary']],
  inc_salary_slips_6: [['salary slip 6'], ['6 month salary slip']],
  inc_form16: [['form 16 latest'], ['latest form 16'], ['form16 latest']],
  inc_it_returns: [['it return'], ['income tax return'], ['tax return'], ['itr']],
  inc_it_returns_2_nri: [['itr nri'], ['nri return'], ['w2 form'], ['nri it return']],
  inc_bank_stmt: [['bank statement'], ['bank statement 6'], ['bank a c']],
  inc_bank_stmt_12: [['bank statement 12'], ['12 month bank'], ['year bank statement']],
  inc_emp_letter: [['employment letter'], ['employment certificate'], ['employee certificate'], ['service certificate']],
  inc_salary_cert_orig: [['salary certificate'], ['salary cert'], ['original salary']],
  inc_employer_id: [['employer id'], ['employer card'], ['current employer']],
  inc_prev_employer: [['previous employer'], ['previous company'], ['former employer'], ['prev employer']],
  inc_overseas_bank_6: [['overseas bank'], ['nri bank'], ['foreign bank'], ['nri account']],
  inc_overseas_res: [['overseas residence'], ['foreign residence'], ['utility bill overseas'], ['abroad residence'], ['foreign utility']],
  inc_emp_contract: [['employment contract'], ['work contract'], ['service contract']],
  inc_credit_info: [['credit information'], ['credit report'], ['credit info'], ['cibil'], ['experian'], ['credit score']],

  inc_it_returns_3: [['it return 3 year'], ['3 year it return'], ['itr 3 year'], ['itr last 3']],
  inc_audit_report: [['audit report'], ['audited financial'], ['ca certified']],
  inc_income_cert: [['income certificate'], ['income proof']],

  biz_gst: [['gst return'], ['gstr'], ['gst filing']],
  biz_gst_reg: [['gst registration'], ['gst certificate'], ['gst reg']],
  biz_reg: [['business registration'], ['incorporation'], ['company registration']],
  biz_shop_act: [['shop act'], ['establishment license'], ['establishment licence'], ['shop license']],
  biz_partnership: [['partnership deed']],
  biz_moa_aoa: [['moa'], ['aoa'], ['memorandum'], ['articles of association']],
  biz_udyam: [['udyam'], ['udyog aadhaar'], ['udyam aadhaar']],
  biz_trade_license: [['trade license'], ['trade licence']],
  biz_msme: [['msme'], ['sme certificate']],

  prop_sale_agreement: [['sale agreement'], ['agreement of sale'], ['agreement to sell']],
  prop_sale_deed: [['sale deed'], ['registered sale']],
  prop_sale_deed_draft: [['sale deed draft'], ['draft sale deed']],
  prop_link_docs: [['link document'], ['chain document'], ['previous deed']],
  prop_plan_proceeding: [['plan proceeding'], ['building plan'], ['approved plan'], ['sanction plan']],
  prop_house_tax: [['house tax'], ['property tax'], ['municipal tax']],
  prop_power_bill: [['power bill'], ['electricity bill'], ['current bill']],
  prop_title_deed: [['title deed'], ['title document'], ['original title']],
  prop_encumbrance: [['encumbrance'], ['ec certificate']],
  prop_completion: [['completion certificate'], ['cc certificate']],
  prop_occupancy: [['occupancy certificate'], ['oc certificate']],
  prop_mutation: [['mutation'], ['mutated']],
  prop_khata: [['khata'], ['katha']],
  prop_dev_agreement: [['development agreement']],
  prop_allotment: [['allotment letter'], ['allotment']],
  prop_payment: [['payment receipt'], ['booking receipt'], ['payment proof'], ['receipt']],
  prop_noc: [['noc'], ['no objection']],
  prop_estimation: [['estimation'], ['cost estimate'], ['construction estimate']],

  fin_ca_stmt: [['ca statement'], ['certified financial'], ['ca certified statement']],
  fin_balance_sheet: [['balance sheet']],
  fin_pnl: [['profit loss'], ['p and l'], ['pnl'], ['income statement']],
  fin_cashflow: [['cash flow'], ['cashflow']],
  fin_credit_report: [['credit report'], ['cibil report'], ['experian report']],
  fin_existing_loans: [['existing loan'], ['loan sanction'], ['sanction letter']],
  fin_security: [['security document'], ['collateral']],

  legal_opinion: [['legal opinion'], ['title search'], ['advocate opinion']],
  legal_dev_rights: [['development rights']],
  legal_poa: [['power of attorney legal'], ['registered poa']],
  legal_undertaking: [['undertaking'], ['declaration'], ['affidavit']],

  loan_sanction_letter: [['sanction letter'], ['loan sanction'], ['offer letter loan']],
  loan_acct_stmt: [['loan account'], ['loan statement'], ['loan a c']],

  cibil_report_upload: [['cibil report'], ['cibil'], ['credit bureau report']],
};

function normalize(name) {
  return name
    .replace(/[-_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * @typedef {Object} DocumentMatch
 * @property {string} documentId
 * @property {number} score
 * @property {string[]} matchedKeywords
 */

/**
 * Matches a document name (already stripped of the Lead ID and extension)
 * against the keyword catalog.
 * @param {string} rawDocumentName
 * @returns {DocumentMatch|null}
 */
export function matchDocumentName(rawDocumentName) {
  const normalized = normalize(rawDocumentName);
  if (!normalized) return null;

  let best = null;
  let secondBestScore = 0;

  for (const [documentId, groups] of Object.entries(KEYWORD_MAP)) {
    let bestGroupScore = 0;
    let bestGroupKeywords = [];

    for (const keywords of groups) {
      const matched = keywords.filter((kw) => normalized.includes(kw));
      if (matched.length === 0) continue;
      const groupScore = matched.length / keywords.length;
      if (groupScore > bestGroupScore) {
        bestGroupScore = groupScore;
        bestGroupKeywords = matched;
      }
    }

    if (bestGroupScore === 0) continue;

    if (!best || bestGroupScore > best.score) {
      if (best) secondBestScore = Math.max(secondBestScore, best.score);
      best = { documentId, score: bestGroupScore, matchedKeywords: bestGroupKeywords };
    } else {
      secondBestScore = Math.max(secondBestScore, bestGroupScore);
    }
  }

  if (!best || best.score < CONFIDENCE_THRESHOLD) return null;

  // Ambiguous: a close competitor exists, don't guess — let it fall to manual review.
  if (secondBestScore >= best.score - 0.2 && secondBestScore > 0) return null;

  return best;
}

export function documentNameForId(documentId) {
  // Human-readable label derived from the id, e.g. kyc_addr_proof -> "Kyc Addr Proof".
  // Callers that already resolved the lead's real checklist should prefer that item's
  // own `name` field over this fallback.
  return documentId
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
