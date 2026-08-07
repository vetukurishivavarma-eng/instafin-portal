/**
 * Shared Gemini integration used by:
 *  - POST /api/leads/:id/summarize  (document analysis + profile extraction)
 *  - POST /api/leads/:id/fill-form  (auto-fill a bank PDF from extracted details)
 *  - POST /api/forms/:id/calibrate  (locate field positions on a blank form PDF)
 */
import fs from 'fs';
import path from 'path';
import { PDFDocument } from 'pdf-lib';
import { supabase } from '../lib/supabase.js';

// ─────────────────────────────────────────────────────────────
// Section metadata (shared with leads routes)
// ─────────────────────────────────────────────────────────────
// Overrides checked BEFORE the generic prefix map: a few msme_/firm_ ids belong to other sections
export const SECTION_PREFIX_OVERRIDES = {
  income_proof: ['msme_form26as'],
  financial_documents: ['msme_cma', 'msme_partner_sanc', 'msme_partner_loan_stmt'],
  property_documents: ['msme_sale_deed'],
};

export const SECTION_PREFIX_MAP = {
  kyc: ['kyc_'],
  income_proof: ['inc_'],
  business_documents: ['biz_', 'msme_', 'firm_'],
  property_documents: ['prop_'],
  financial_documents: ['fin_', 'loan_'],
  legal_documents: ['legal_'],
  others: ['other_docs', 'other_'],
};

export const SECTION_LABELS = {
  kyc: 'KYC Documents',
  income_proof: 'Income Proof',
  business_documents: 'Business Documents',
  property_documents: 'Property Documents',
  financial_documents: 'Financial Documents',
  legal_documents: 'Legal Documents',
  others: 'Other Documents',
};

export function getSectionFromDocumentId(documentId) {
  if (!documentId) return 'others';
  for (const [section, prefixes] of Object.entries(SECTION_PREFIX_OVERRIDES)) {
    if (prefixes.some(p => documentId.startsWith(p))) return section;
  }
  for (const [section, prefixes] of Object.entries(SECTION_PREFIX_MAP)) {
    if (prefixes.some(p => documentId.startsWith(p))) return section;
  }
  return 'others';
}

// ─────────────────────────────────────────────────────────────
// Low-level Gemini generateContent call (model discovery + retries)
// ─────────────────────────────────────────────────────────────

// Score a model name — higher is preferred (flash > pro, newer > older, stable > preview)
function scoreModelName(name) {
  const n = (name || '').toLowerCase();
  if (!n.includes('gemini')) return -1;
  let score = 0;
  if (n.includes('flash')) score += 100;
  if (n.includes('2.5')) score += 50;
  else if (n.includes('2.0')) score += 40;
  else if (n.includes('1.5')) score += 20;
  if (n.includes('preview') || n.includes('beta')) score -= 30;
  return score;
}

// Fallbacks used only when the model list endpoint itself fails
function defaultModelCandidates() {
  return ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'];
}

// Query ListModels for this API key and return every generateContent-capable
// Gemini model, best-first. This is the source of truth — if the key's project
// only has access to specific models (e.g. preview names), we use exactly those.
async function discoverModelCandidates(apiKey) {
  try {
    const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
    const listResponse = await fetch(listUrl);
    if (!listResponse.ok) {
      console.warn(`Gemini model list endpoint returned status ${listResponse.status}`);
      return defaultModelCandidates();
    }
    const listData = await listResponse.json();
    // Exclude model families that cannot do document/image understanding
    // (image generation, TTS, robotics, computer-use, omni, embeddings, etc.)
    const EXCLUDED_FAMILIES = ['image', 'tts', 'robotics', 'computer-use', 'omni', 'audio', 'embedding', 'food', 'er-'];
    const isSuitable = (name) => {
      const n = name.toLowerCase();
      if (EXCLUDED_FAMILIES.some(x => n.includes(x))) return false;
      // Free-tier API keys have limit: 0 on pro models — only flash/lite models
      // carry usable quota, so never attempt pro models (they always fail with 429).
      return n.includes('flash');
    };
    const available = (listData.models || [])
      .filter(m =>
        m.supportedGenerationMethods?.includes('generateContent') &&
        m.name?.startsWith('models/gemini') &&
        isSuitable(m.name.replace('models/', ''))
      )
      .map(m => m.name.replace('models/', ''))
      .sort((a, b) => scoreModelName(b) - scoreModelName(a));
    if (available.length > 0) {
      console.log(`Gemini models available to this API key: ${available.join(', ')}`);
      return available;
    }
    console.warn('No generateContent-capable Gemini models found in model list response');
    return defaultModelCandidates();
  } catch (listErr) {
    console.warn('Could not query Gemini model list:', listErr.message);
    return defaultModelCandidates();
  }
}

// Number of distinct models to attempt before giving up — each failed call wastes
// time, and on the free tier the bottleneck is quota, not model availability.
const MAX_MODEL_ATTEMPTS = 5;

// Parse google.rpc.RetryInfo retryDelay (e.g. "34s") from a Gemini error body.
// Returns ms (capped at 15s) or null if absent.
function extractRetryDelayMs(errorText) {
  try {
    const parsed = JSON.parse(errorText);
    const details = parsed?.error?.details || [];
    for (const d of details) {
      if (d['@type']?.includes('RetryInfo') && d.retryDelay) {
        const secs = parseFloat(String(d.retryDelay).replace(/[^0-9.]/g, ''));
        if (Number.isFinite(secs) && secs > 0) {
          return Math.min(Math.round(secs * 1000), 15000);
        }
      }
    }
  } catch { /* response body may not be JSON */ }
  return null;
}

export async function generateWithGemini(contentsParts, apiKey) {
  if (!apiKey) return null;

  const candidateModels = (await discoverModelCandidates(apiKey)).slice(0, MAX_MODEL_ATTEMPTS);

  let success = false;
  let lastErrorText = '';
  let quotaExhausted = false;

  for (const model of candidateModels) {
    if (success) break;
    console.log(`Attempting Gemini call with model: ${model}`);

    // Per model: 1 initial attempt + 1 retry after a 429 (quota is per-model,
    // so a short wait can let the next attempt through). Never hammer more than that.
    const maxAttempts = 2;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const response = await fetch(geminiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: contentsParts }] }),
        });

        if (response.ok) {
          const resData = await response.json();
          const text = resData.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) {
            console.log(`Successfully completed Gemini call using model: ${model}`);
            return text;
          }
          throw new Error('Empty candidates response from Gemini API.');
        }

        const errorText = await response.text();
        lastErrorText = `Model ${model} returned status ${response.status}: ${errorText}`;
        console.warn(`Attempt with ${model} failed (status ${response.status}). Details: ${errorText}`);

        if (response.status === 429 || response.status === 503) {
          // "limit: 0" means this model has NO quota for this key — retrying is futile
          if (errorText.includes('limit: 0')) {
            quotaExhausted = true;
            break; // skip this model, try the next
          }
          const delay = extractRetryDelayMs(errorText) ?? 4000;
          console.log(`Quota/rate limit on ${model}. Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue; // one retry on the same model
        }
        break; // non-retryable error (400/404/403) → next model
      } catch (err) {
        lastErrorText = err.message;
        console.error(`Error on model ${model} (attempt ${attempt}):`, err.message);
        break;
      }
    }
  }

  if (quotaExhausted || lastErrorText.includes('limit: 0')) {
    throw new Error(
      `Gemini API free-tier quota is exhausted for this API key (some models report limit: 0). ` +
      `Wait for the daily quota reset or enable billing at https://ai.google.dev/gemini-api/pricing to raise limits.`
    );
  }

  throw new Error(
    `Gemini API is currently overloaded or experiencing high demand. Please try again in a few seconds. ` +
    `(Tried models: ${candidateModels.join(', ')}. Last error: ${lastErrorText})`
  );
}

// ─────────────────────────────────────────────────────────────
// Document analysis for a lead (used by /summarize and /fill-form)
// ─────────────────────────────────────────────────────────────
const uploadsDir = path.join(process.cwd(), 'uploads');

export async function loadDocumentBuffer(fileName) {
  const localPath = path.join(uploadsDir, fileName);
  if (fs.existsSync(localPath)) {
    return fs.readFileSync(localPath);
  }
  const { data, error } = await supabase.storage
    .from('lead-documents')
    .download(fileName);
  if (error) {
    console.warn(`Could not download ${fileName} from Supabase:`, error.message);
    return null;
  }
  if (typeof data.arrayBuffer === 'function') {
    const arrayBuffer = await data.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }
  return Buffer.from(data);
}

/**
 * Validate that a file buffer is a readable PDF or image before sending it to
 * Gemini. Gemini rejects invalid PDFs with "The document has no pages", which
 * previously killed the entire request. Returns { ok: true } or { ok: false, reason }.
 */
export async function validateDocumentBuffer(buffer, mimeType) {
  if (!buffer || buffer.length === 0) {
    return { ok: false, reason: 'empty file' };
  }
  if (mimeType === 'application/pdf') {
    const head = buffer.subarray(0, 5).toString('ascii');
    if (head !== '%PDF-') {
      return { ok: false, reason: 'file is not a valid PDF (renamed or corrupt)' };
    }
    try {
      const doc = await PDFDocument.load(buffer, { ignoreEncryption: true });
      if (doc.getPageCount() === 0) {
        return { ok: false, reason: 'PDF has no pages' };
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: `PDF could not be parsed (${e.message})` };
    }
  }
  if (mimeType === 'image/png') {
    if (buffer[0] !== 0x89 || buffer[1] !== 0x50 || buffer[2] !== 0x4e || buffer[3] !== 0x47) {
      return { ok: false, reason: 'file is not a valid PNG image' };
    }
    return { ok: true };
  }
  if (mimeType === 'image/jpeg') {
    if (buffer[0] !== 0xff || buffer[1] !== 0xd8 || buffer[2] !== 0xff) {
      return { ok: false, reason: 'file is not a valid JPEG image' };
    }
    return { ok: true };
  }
  return { ok: false, reason: 'unsupported file type' };
}

/**
 * Analyze a lead's uploaded documents with Gemini and return the summary text.
 * @param {object} opts
 * @param {object} opts.lead         - lead row from Supabase
 * @param {Array}  opts.uploads      - lead_checklist_status rows (status 'uploaded')
 * @param {string} [opts.section]    - optional section filter key
 * @returns {Promise<string>} summary text (with embedded ```json block)
 */
export async function analyzeLeadDocuments({ lead, uploads, section = null }) {
  // 1. Prepare parts for Gemini Multimodal API
  const contentsParts = [];
  const documentDescriptions = [];

  for (const doc of uploads) {
    const fileName = doc.file_path;
    if (!fileName) continue;

    let fileBuffer;
    let mimeType = 'application/pdf';

    const ext = path.extname(fileName).toLowerCase();
    if (ext === '.pdf') mimeType = 'application/pdf';
    else if (ext === '.png') mimeType = 'image/png';
    else if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg';
    else {
      documentDescriptions.push(`Document: "${doc.document_name}" (unsupported file type for visual rendering, listed for reference)`);
      continue;
    }

    fileBuffer = await loadDocumentBuffer(fileName);
    if (fileBuffer) {
      const validation = await validateDocumentBuffer(fileBuffer, mimeType);
      if (!validation.ok) {
        console.warn(`Skipping unreadable document "${doc.document_name}" (${fileName}): ${validation.reason}`);
        documentDescriptions.push(`Document: "${doc.document_name}" (skipped — ${validation.reason})`);
        continue;
      }
      contentsParts.push({
        inlineData: { mimeType, data: fileBuffer.toString('base64') },
      });
      documentDescriptions.push(`Document: "${doc.document_name}" (uploaded, format: ${mimeType})`);
    }
  }

  if (contentsParts.length === 0) {
    throw new Error('No readable document files (PDF/PNG/JPG) were found for analysis.');
  }

  // 2. Generate user context prompt
  const promptText = `
You are an expert financial analyst, credit assessor, and underwriting agent at InstaFin Portal.
Your task is to analyze the attached documents and extract the exact details and facts from them:
- Customer Name: ${lead.customer_name}
- Mobile: ${lead.mobile || 'N/A'}
- Email: ${lead.email || 'N/A'}
- Loan Type: ${lead.loan_type || 'N/A'}
- Expected Amount: ${lead.expected_amount || 'N/A'}
${section ? `- Focus Section: ${SECTION_LABELS[section]} (analyze ONLY the documents belonging to this section)` : '- Focus: ALL uploaded documents'}

Uploaded Documents Context:
${documentDescriptions.join('\n')}

INSTRUCTIONS:
1. DO NOT write any conversational fluff, long narratives, or essay-style paragraphs.
2. DO NOT write any overall underwriter summary, executive underwriting summary, credit risk score/risk profiling, or credit recommendation. The user strictly wants ONLY the raw data extracted from the documents, nothing else.
3. For each uploaded document in the list, create a distinct header starting with "## " followed by an emoji and the document title (e.g., "## 🪪 Aadhaar Card (KYC)" or "## 💳 PAN Card (KYC)" or "## 🏦 Bank Statement (Financials)" or "## 💼 Income & Business Proof").
4. Under each document header, extract and list the exact key-value facts from that document in a clean, highly structured bullet-point format using "- **Key**: Value" pairs.
5. If the document is missing or not uploaded, DO NOT include its section.

Outline of document sections to generate:

## 🪪 Aadhaar Card (KYC)
*(Include only if Aadhaar is present. Extract these exact keys as bullet points)*
- **Document Type**: Aadhaar Card
- **Full Name**: [Extracted Full Name]
- **DOB**: [Extracted Date of Birth]
- **Gender**: [Extracted Gender]
- **Aadhaar Number**: [Extracted Aadhaar Number (format: XXXX XXXX XXXX or masked)]
- **Address**: [Extracted Address]
- **Legitimacy Status**: [Matched / Spelling Mismatch / Suspicious / Valid]
- **Verification Note**: [1 sentence concise check against applicant name "${lead.customer_name}"]

## 💳 PAN Card (KYC)
*(Include only if PAN is present. Extract these exact keys as bullet points)*
- **Document Type**: PAN Card
- **Full Name**: [Extracted Full Name]
- **PAN Number**: [Extracted PAN Number (format: XXXXX1234X)]
- **DOB**: [Extracted Date of Birth]
- **Legitimacy Status**: [Matched / Valid]
- **Verification Note**: [1 sentence concise check against applicant name "${lead.customer_name}"]

## 🏦 Bank Statement (Financials)
*(Include only if Bank Statement/Passbook is present. Extract these exact keys as bullet points)*
- **Document Type**: Bank Statement
- **Bank Name**: [Extracted Bank Name]
- **Account Holder**: [Extracted Account Holder Name]
- **Statement Period**: [Extracted Date Range]
- **Average Balance**: [Extracted Average Balance Amount]
- **Total Credits**: [Extracted total credits / income deposits]
- **Total Debits**: [Extracted total debits]
- **Bounces / Penalties**: [Extracted count of bounces or "None"]
- **Legitimacy Status**: [Matched / Valid / High Consistency]
- **Verification Note**: [1 sentence concise assessment of cash flow stability]

## 💼 Income & Business Proof
*(Include only if GST, ITR, or Salary Slips are present. Extract these exact keys as bullet points)*
- **Document Type**: [e.g., GST Registration / ITR / Salary Slip]
- **Business/Company Name**: [Extracted Employer or Registered Business Name]
- **GSTIN / Registration Number**: [Extracted Registration Number if applicable]
- **Gross Monthly Income**: [Extracted Gross Income or Turnover]
- **Net Monthly Income**: [Extracted Net Income]
- **Legitimacy Status**: [Matched / Valid]
- **Verification Note**: [1 sentence summary of business activity/salaried employment proof]

CRITICAL TECHNICAL INSTRUCTION:
At the very end of your response, append a structured JSON block inside a \`\`\`json \`\`\` code block (ensure it is the ONLY JSON code block in your entire output). 
This JSON block MUST contain the following structured fields extracted from the documents:
{
  "extracted_details": {
    "full_name": "Applicant's full name as written on identity proof",
    "dob": "Date of Birth (DD/MM/YYYY) if available",
    "gender": "Male / Female / Other",
    "aadhaar_number": "Aadhaar number if present (format: XXXX XXXX XXXX or masked)",
    "pan_number": "PAN number if present (format: XXXXX1234X)",
    "address": "Full residential address as written on Aadhaar/proof",
    "gross_income": "Gross monthly income as a numeric value (e.g., 50000). Extract from Gross Monthly Income or similar fields. 0 if not found.",
    "monthly_income": "Net monthly income as a numeric value (e.g., 45000). Extract from Net Monthly Income or similar fields. 0 if not found.",
    "pf": "Provident Fund deduction amount as a numeric value (e.g., 2500). Extract from salary slip if visible. 0 if not found.",
    "income_tax": "Income Tax / TDS deduction as a numeric value (e.g., 1500). Extract from salary slip if visible. 0 if not found.",
    "profession_tax": "Profession Tax deduction as a numeric value (e.g., 200). Extract from salary slip if visible. 0 if not found.",
    "rental_income": "Proposed or existing rental income as a numeric value (e.g., 10000). Extract from bank statement or income proofs. 0 if not found."
  },
  "face_bounding_box": [ymin, xmin, ymax, xmax]
}

Note: Locate the small profile photo of the applicant on the Aadhaar card, PAN card, or standard ID proof. Return the face_bounding_box normalized coordinates from 0 to 1000 as [ymin, xmin, ymax, xmax] (e.g., [200, 150, 450, 400]). If no face/photo is found or it is not an image/PDF, return null for face_bounding_box.

For a ${section ? SECTION_LABELS[section] : 'full'} analysis, apply the same structured extraction to every uploaded document in the provided context, and always complete the JSON block with all available fields.
`;

  contentsParts.unshift({ text: promptText });

  // 3. Call Gemini
  const apiKey = process.env.GEMINI_API_KEY;
  let summaryText = '';

  if (apiKey) {
    summaryText = await generateWithGemini(contentsParts, apiKey);
  } else {
    console.warn('GEMINI_API_KEY environment variable is not set. Generating mock analysis for testing.');
    summaryText = `
## 🪪 Aadhaar Card (KYC)
- **Document Type**: Aadhaar Card
- **Full Name**: ${lead.customer_name}
- **DOB**: 15/08/1990
- **Gender**: Male
- **Aadhaar Number**: XXXX XXXX 1234
- **Address**: 123, High Street, Sector 5, Bengaluru, Karnataka - 560001
- **Legitimacy Status**: Matched
- **Verification Note**: Mock verified. Name matches the loan application perfectly.

## 💳 PAN Card (KYC)
- **Document Type**: PAN Card
- **Full Name**: ${lead.customer_name}
- **PAN Number**: ABCDE1234F
- **DOB**: 15/08/1990
- **Legitimacy Status**: Matched
- **Verification Note**: Mock verified. Legitimate PAN record assumed.

## 🏦 Bank Statement (Financials)
- **Document Type**: Bank Statement
- **Bank Name**: State Bank of India
- **Account Holder**: ${lead.customer_name}
- **Statement Period**: 01/10/2025 to 31/03/2026
- **Average Balance**: ₹45,000
- **Total Credits**: ₹3,00,000
- **Total Debits**: ₹2,80,000
- **Bounces / Penalties**: None
- **Legitimacy Status**: High Consistency
- **Verification Note**: Regular cash inflows matching standard income profile.

## 💼 Income & Business Proof
- **Document Type**: Salary Slip / Income Proof
- **Business/Company Name**: InstaFin Partners Ltd
- **GSTIN / Registration Number**: N/A (Salaried Employee)
- **Gross Monthly Income**: ₹50,000
- **Net Monthly Income**: ₹45,000
- **Legitimacy Status**: Matched
- **Verification Note**: Income source verified as ${lead.income_source || 'salaried'}.

\`\`\`json
{
  "extracted_details": {
    "full_name": "${lead.customer_name}",
    "dob": "15/08/1990",
    "gender": "Male",
    "aadhaar_number": "XXXX XXXX 1234",
    "pan_number": "ABCDE1234F",
    "address": "123, High Street, Sector 5, Bengaluru, Karnataka - 560001",
    "gross_income": 50000,
    "monthly_income": 45000,
    "pf": 2500,
    "income_tax": 1500,
    "profession_tax": 200,
    "rental_income": 0
  },
  "face_bounding_box": [220, 150, 520, 420]
}
\`\`\`
`;
  }

  return summaryText;
}

// ─────────────────────────────────────────────────────────────
// Parse the structured ```json block from a summary
// ─────────────────────────────────────────────────────────────
export function extractDetailsFromSummary(summaryText) {
  try {
    const jsonMatch = (summaryText || '').match(/```json([\s\S]*?)```/);
    if (jsonMatch && jsonMatch[1]) {
      const parsed = JSON.parse(jsonMatch[1].trim());
      return parsed?.extracted_details || null;
    }
  } catch (e) {
    console.warn('Failed to parse extracted details from summary:', e.message);
  }
  return null;
}
