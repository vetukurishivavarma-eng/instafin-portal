/**
 * Third-party CIBIL / credit-bureau report fetch — provider-agnostic.
 *
 * Configuration (set in the server environment, e.g. Render dashboard → Environment):
 *   CIBIL_API_BASE_URL   e.g. https://api.provider.com/v1
 *   CIBIL_API_KEY        API key / bearer token for that provider
 *   CIBIL_API_PROVIDER   optional adapter: generic (default), signzy, idfy
 *
 * Default ("generic") contract:
 *   POST {base}/cibil/report
 *   Authorization: Bearer <key>
 *   body: { pan, name, dob, mobile, consent: 'Y', consent_reference }
 *
 * The response normalizer is tolerant — it maps common field names across
 * providers (score, consumer, accounts, enquiries, summary) into the portal's
 * canonical report shape. Once you have your provider's exact contract, adjust
 * the buildBody/normalizeReport adapters for precise field mapping.
 */
import crypto from 'crypto';

const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

const num = (v) => {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(String(v).replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : null;
};

const firstOf = (obj, ...keys) => {
  for (const k of keys) {
    const v = obj?.[k];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
};

// Endpoint path per provider adapter
function buildUrl(baseUrl, provider) {
  const base = (baseUrl || '').replace(/\/+$/, '');
  if (provider === 'signzy' || provider === 'idfy') {
    return `${base}/v2/users/cibil/report`;
  }
  return `${base}/cibil/report`;
}

// Request body per provider adapter
function buildBody(provider, { pan, name, dob, mobile }) {
  const consentReference = `IFP-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
  if (provider === 'signzy' || provider === 'idfy') {
    return {
      type: 'CIBIL',
      pan: String(pan).trim().toUpperCase(),
      details: { name, dob, mobile },
      consent: 'Y',
      consent_reference: consentReference,
    };
  }
  return {
    pan: String(pan).trim().toUpperCase(),
    name: name || null,
    dob: dob || null,
    mobile: mobile || null,
    consent: 'Y',
    consent_reference: consentReference,
  };
}

// Tolerant mapping of a provider response into the portal's canonical report shape
function normalizeReport(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new Error('The CIBIL API returned an empty or invalid response.');
  }

  // Some providers wrap the payload: { data: {...} } or { result: {...} }
  const data = (raw.data && typeof raw.data === 'object') ? raw.data : raw;
  const consumer = data.consumer || data.customer || data.applicant || data.details || {};
  const summary = data.credit_summary || data.summary || data.creditSummary || {};

  const accounts = Array.isArray(data.accounts)
    ? data.accounts
    : Array.isArray(data.creditAccounts) ? data.creditAccounts : [];
  const enquiries = Array.isArray(data.enquiries)
    ? data.enquiries
    : Array.isArray(data.inquiries) ? data.inquiries : [];

  const score = num(firstOf(data, 'cibil_score', 'score', 'bureauScore', 'creditScore', 'score_value'));

  // Guard against a 200 response that doesn't actually contain a credit report
  const hasRecognizableData =
    score !== null ||
    Object.keys(consumer).length > 0 ||
    accounts.length > 0 ||
    enquiries.length > 0;
  if (!hasRecognizableData) {
    throw new Error('The CIBIL API response did not contain a recognizable credit report.');
  }

  return {
    cibil_score: score,
    score_band: firstOf(data, 'score_band', 'scoreBand', 'rating') || null,
    report_generated_on: firstOf(data, 'report_generated_on', 'report_date', 'generated_on') || new Date().toLocaleDateString('en-IN'),
    source: 'api',
    provider: (process.env.CIBIL_API_PROVIDER || 'generic').toLowerCase(),
    consumer: {
      name: firstOf(consumer, 'name', 'full_name', 'fullName') || null,
      dob: firstOf(consumer, 'dob', 'date_of_birth') || null,
      gender: firstOf(consumer, 'gender') || null,
      pan_number: firstOf(consumer, 'pan', 'pan_number') || null,
      mobile: firstOf(consumer, 'mobile', 'phone', 'mobile_number') || null,
      email: firstOf(consumer, 'email') || null,
      employment: firstOf(consumer, 'employment', 'occupation') || null,
      address: firstOf(consumer, 'address', 'current_address') || null,
    },
    credit_summary: {
      total_accounts: num(summary.total_accounts) ?? num(data.total_accounts),
      active_accounts: num(summary.active_accounts) ?? num(data.active_accounts),
      closed_accounts: num(summary.closed_accounts) ?? num(data.closed_accounts),
      written_off_accounts: num(summary.written_off_accounts) ?? num(data.written_off_accounts),
      settled_accounts: num(summary.settled_accounts) ?? num(data.settled_accounts),
      total_outstanding: num(summary.total_outstanding) ?? num(data.total_outstanding),
      monthly_obligations: num(summary.monthly_obligations) ?? num(data.monthly_obligations),
      total_enquiries: num(summary.total_enquiries) ?? num(data.total_enquiries) ?? enquiries.length,
      credit_cards: num(summary.credit_cards) ?? num(data.credit_cards),
      loans: num(summary.loans) ?? num(data.loans),
    },
    accounts: accounts.map(a => ({
      lender: firstOf(a, 'lender', 'bank', 'institution', 'credit_institution') || 'Unknown',
      account_type: firstOf(a, 'account_type', 'accountType', 'type') || null,
      account_number: firstOf(a, 'account_number', 'accountNumber') || null,
      ownership: firstOf(a, 'ownership') || null,
      opened_date: firstOf(a, 'opened_date', 'date_opened', 'openedDate') || null,
      status: firstOf(a, 'status', 'account_status') || null,
      days_past_due: num(a.days_past_due) ?? num(a.dpd),
      amount_sanctioned: num(a.amount_sanctioned) ?? num(a.sanctioned_amount),
      current_balance: num(a.current_balance) ?? num(a.balance),
      overdue_amount: num(a.overdue_amount) ?? num(a.overdue),
      remarks: firstOf(a, 'remarks') || null,
    })),
    enquiries: enquiries.map(e => ({
      institution: firstOf(e, 'institution', 'institution_name', 'name') || 'Unknown',
      date: firstOf(e, 'date', 'enquiry_date') || null,
      purpose: firstOf(e, 'purpose') || null,
      amount: num(e.amount),
    })),
    notes: firstOf(data, 'notes', 'summary_text') || 'Report fetched from the third-party CIBIL API.',
    raw: raw,
  };
}

export function isCibilApiConfigured() {
  return !!(process.env.CIBIL_API_BASE_URL && process.env.CIBIL_API_KEY);
}

/**
 * Fetch a real CIBIL report from the configured third-party API.
 * @param {object} opts
 * @param {string} opts.pan    - 10-character PAN
 * @param {string} [opts.name] - customer full name (identity match)
 * @param {string} [opts.dob]  - date of birth (identity match)
 * @param {string} [opts.mobile] - mobile number (identity match)
 * @returns {Promise<{ report: object, consentReference: string|null }>} canonical report (source: 'api') + the consent reference sent to the provider
 */
export async function fetchCibilReport({ pan, name, dob, mobile }) {
  const baseUrl = process.env.CIBIL_API_BASE_URL;
  const apiKey = process.env.CIBIL_API_KEY;
  const provider = (process.env.CIBIL_API_PROVIDER || 'generic').toLowerCase();

  if (!baseUrl || !apiKey) {
    throw new Error(
      'The third-party CIBIL API is not configured. Set CIBIL_API_BASE_URL and CIBIL_API_KEY in the server environment (Render → Environment).'
    );
  }

  const normalizedPan = String(pan || '').trim().toUpperCase();
  if (!PAN_RE.test(normalizedPan)) {
    throw new Error('A valid 10-character PAN is required (e.g. ABCDE1234F).');
  }

  const url = buildUrl(baseUrl, provider);
  const body = buildBody(provider, { pan: normalizedPan, name, dob, mobile });

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });
  } catch (err) {
    throw new Error(`Could not reach the CIBIL API (${url}). ${err.message}`);
  }

  const rawText = await response.text();
  let raw;
  try {
    raw = JSON.parse(rawText);
  } catch {
    raw = { raw_text: rawText.slice(0, 2000) };
  }

  if (!response.ok) {
    const msg = raw?.error?.message || raw?.message || raw?.status_message || `HTTP ${response.status}`;
    throw new Error(`CIBIL API request failed: ${msg}`);
  }

  const report = normalizeReport(raw);
  return { report, consentReference: body.consent_reference || null };
}
