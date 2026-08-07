/**
 * CIBIL Report parsing service.
 *
 * Parses an uploaded CIBIL consumer credit report (PDF) using Gemini vision and
 * returns a structured JSON summary: score, consumer details, account details,
 * and credit enquiries.
 *
 * Used by:
 *  - POST /api/cibil/upload  (upload + parse a customer's CIBIL report PDF)
 */
import path from 'path';
import { generateWithGemini, loadDocumentBuffer, validateDocumentBuffer } from './gemini.js';

// ─────────────────────────────────────────────────────────────
// Gemini prompt for CIBIL report extraction
// ─────────────────────────────────────────────────────────────
function buildCibilPrompt(fileName) {
  return `
You are an expert credit analyst at InstaFin Portal. The attached file is a CIBIL consumer credit report PDF (file name: "${fileName}").

Carefully read the entire report and extract ALL the following details exactly as they appear. Do not invent or guess any values — if something is not present in the report, use null for that field (or an empty array for lists).

Return a SINGLE valid JSON object (no markdown fences, no commentary — only the JSON). Use this exact structure:

{
  "cibil_score": 0,
  "score_band": "string or null",
  "report_generated_on": "DD/MM/YYYY or null",
  "consumer": {
    "name": "string or null",
    "dob": "string or null",
    "gender": "string or null",
    "pan_number": "string or null",
    "mobile": "string or null",
    "email": "string or null",
    "employment": "string or null",
    "address": "string or null"
  },
  "credit_summary": {
    "total_accounts": 0,
    "active_accounts": 0,
    "closed_accounts": 0,
    "written_off_accounts": 0,
    "settled_accounts": 0,
    "total_outstanding": 0,
    "monthly_obligations": 0,
    "total_enquiries": 0,
    "credit_cards": 0,
    "loans": 0
  },
  "accounts": [
    {
      "lender": "string",
      "account_type": "Credit Card / Loan / Overdraft / etc.",
      "account_number": "masked number as printed",
      "ownership": "Individual / Joint / etc.",
      "opened_date": "MM/YYYY or null",
      "status": "Current / Written Off / Settled / Closed / etc.",
      "days_past_due": 0,
      "amount_sanctioned": 0,
      "current_balance": 0,
      "overdue_amount": 0,
      "remarks": "string or null"
    }
  ],
  "enquiries": [
    {
      "institution": "string",
      "date": "DD/MM/YYYY",
      "purpose": "string or null",
      "amount": 0
    }
  ],
  "notes": "A short 2-3 sentence underwriting note: highlight any red flags (recent defaults, high DPD, multiple enquiries in last 6 months, written-off accounts, high credit utilisation), or a positive note if the report is clean."
}

CRITICAL RULES:
- The CIBIL score is a number between 300 and 900. If it appears as e.g. "750" return 750.
- Accounts list: include EVERY account shown in the report. If there are no accounts, use an empty array.
- Enquiries list: include every enquiry. If none, use an empty array.
- Numbers: strip currency symbols and commas before storing (e.g. "₹1,25,000" → 125000).
- Only output the JSON object. No other text before or after.
`;
}

// ─────────────────────────────────────────────────────────────
// Parse the JSON block from Gemini's response
// ─────────────────────────────────────────────────────────────
export function extractCibilData(summaryText) {
  try {
    const text = (summaryText || '').trim();
    // Strip markdown fences if present
    const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    const jsonText = fenceMatch ? fenceMatch[1] : text;
    return JSON.parse(jsonText.trim());
  } catch (e) {
    console.warn('Failed to parse CIBIL data from Gemini response:', e.message);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// Gemini prompt: ESTIMATE a credit profile from the lead's uploaded documents
// ─────────────────────────────────────────────────────────────
function buildGeneratePrompt(fileNameList, lead) {
  return `
You are a senior credit underwriter at InstaFin Portal. The applicant has NOT provided an official CIBIL report.
Instead, you must ANALYZE the attached uploaded documents (bank statements, loan documents, sanction letters,
salary slips, GST/ITR, identity proofs, etc.) and produce an ESTIMATED consumer credit profile.

Applicant context:
- Customer Name: ${lead?.customer_name || 'N/A'}
- Mobile: ${lead?.mobile || 'N/A'}
- Loan Type Applied For: ${lead?.loan_type || 'N/A'}
- Expected Amount: ${lead?.expected_amount || 'N/A'}

Documents being analyzed:
${fileNameList.map(f => `- "${f}"`).join('\n')}

Build the profile as follows:
1. CONSUMER: Extract identity details (name, DOB, gender, PAN, mobile, email, employment, address) from identity/income documents if present; otherwise leave fields null.
2. ACCOUNTS: Derive existing credit facilities visible in the documents — e.g. loans/sanctions mentioned in sanction letters or loan documents, EMI/loan debits recurring in bank statements, overdraft/credit card references. For each, capture the lender if named, account type, opened date if shown, status (Current / Overdue / Closed), days past due only if visible, and amounts (sanctioned, current balance, overdue) only if derivable. If no credit facility is visible, return an EMPTY array — never invent lenders or account numbers.
3. CREDIT SUMMARY: Sum up the accounts (total/active/closed/written_off/settled counts, total outstanding, monthly obligations from recurring EMI debits, total enquiries only if visible, credit card and loan counts). Use 0 for anything not derivable.
4. ENQUIRIES: Include only enquiries explicitly visible in the documents (e.g. a CIBIL/Experian report snippet). Otherwise return an EMPTY array.
5. CIBIL SCORE: Estimate a score between 300 and 900 based on OBSERVED credit behaviour: regular on-time EMI debits and healthy cash flow raise it; bounced/penalty entries, overdue loans, high credit utilisation, or written-off/settled accounts lower it. Base the estimate on the evidence — if documents are thin (e.g. only salary slips), estimate conservatively around 650-700 and say so in the notes.

Return a SINGLE valid JSON object (no markdown fences, no commentary — only the JSON). Use this exact structure:

{
  "cibil_score": 0,
  "score_band": "string or null",
  "report_generated_on": "DD/MM/YYYY",
  "source": "generated",
  "consumer": {
    "name": "string or null",
    "dob": "string or null",
    "gender": "string or null",
    "pan_number": "string or null",
    "mobile": "string or null",
    "email": "string or null",
    "employment": "string or null",
    "address": "string or null"
  },
  "credit_summary": {
    "total_accounts": 0,
    "active_accounts": 0,
    "closed_accounts": 0,
    "written_off_accounts": 0,
    "settled_accounts": 0,
    "total_outstanding": 0,
    "monthly_obligations": 0,
    "total_enquiries": 0,
    "credit_cards": 0,
    "loans": 0
  },
  "accounts": [
    {
      "lender": "string",
      "account_type": "Credit Card / Loan / Overdraft / etc.",
      "account_number": "masked number or null",
      "ownership": "Individual / Joint / etc.",
      "opened_date": "MM/YYYY or null",
      "status": "Current / Overdue / Written Off / Settled / Closed / etc.",
      "days_past_due": 0,
      "amount_sanctioned": 0,
      "current_balance": 0,
      "overdue_amount": 0,
      "remarks": "string or null"
    }
  ],
  "enquiries": [
    {
      "institution": "string",
      "date": "DD/MM/YYYY",
      "purpose": "string or null",
      "amount": 0
    }
  ],
  "notes": "2-3 sentences: explain WHAT evidence the estimate is based on and any red flags (EMI bounces, overdue entries, high utilisation) or strengths (regular payments, clean cash flow). MUST end with this disclaimer: 'This is an estimated credit profile generated by AI from the applicant's uploaded documents, not an official CIBIL bureau report.'"
}

CRITICAL RULES:
- Only output the JSON object. No other text before or after.
- Never fabricate lenders, account numbers, or exact figures that are not derivable from the documents — use null/0/empty arrays instead.
- The CIBIL score must always be a number between 300 and 900.
- Strip currency symbols and commas from numbers (e.g. "₹1,25,000" → 125000).
`;
}

// ─────────────────────────────────────────────────────────────
// Main entry: generate an ESTIMATED credit report from uploaded documents
// ─────────────────────────────────────────────────────────────
export async function generateCibilReport(lead, uploads) {
  // Prefer the most credit-relevant documents and cap the payload sent to Gemini
  // (Gemini has context limits — sending every scanned PDF can cause 400 errors).
  const PRIORITY_PREFIXES = ['loan_', 'fin_', 'inc_', 'biz_', 'legal_', 'kyc_'];
  const sortedUploads = [...(uploads || [])].sort((a, b) => {
    const rank = (d) => {
      const id = d.document_id || '';
      const idx = PRIORITY_PREFIXES.findIndex(p => id.startsWith(p));
      return idx === -1 ? 99 : idx;
    };
    return rank(a) - rank(b);
  }).slice(0, 10);

  // Load readable files (PDF/PNG/JPG) from uploads
  const contentsParts = [];
  const fileNameList = [];
  const skippedDocs = [];

  for (const doc of sortedUploads) {
    const fileName = doc.file_path;
    if (!fileName) continue;

    const ext = path.extname(fileName).toLowerCase();
    const mimeType = ext === '.png' ? 'image/png'
      : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg'
      : ext === '.pdf' ? 'application/pdf'
      : null;

    if (!mimeType) {
      fileNameList.push(`${doc.document_name || fileName} (listed for reference, unsupported type)`);
      continue;
    }

    const fileBuffer = await loadDocumentBuffer(fileName);
    if (fileBuffer) {
      // Reject corrupt/renamed/empty files before they hit Gemini
      // (Gemini returns 400 "The document has no pages" for invalid PDFs)
      const validation = await validateDocumentBuffer(fileBuffer, mimeType);
      if (!validation.ok) {
        const label = doc.document_name || fileName;
        console.warn(`CIBIL generate: skipping unreadable document "${label}": ${validation.reason}`);
        skippedDocs.push(`${label} (${validation.reason})`);
        continue;
      }
      contentsParts.push({ inlineData: { mimeType, data: fileBuffer.toString('base64') } });
      fileNameList.push(doc.document_name || fileName);
    }
  }

  if (contentsParts.length === 0) {
    const detail = skippedDocs.length
      ? ` Unreadable file(s): ${skippedDocs.join('; ')}. Please re-upload these documents.`
      : ' Upload documents first.';
    throw new Error(`No readable documents (PDF/PNG/JPG) found for this lead.${detail}`);
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn('GEMINI_API_KEY not set. Returning mock CIBIL generation for testing.');
    const mock = mockCibilReport();
    return { ...mock, source: 'generated', notes: `${mock.notes} This is an estimated credit profile generated by AI from the applicant's uploaded documents, not an official CIBIL bureau report.` };
  }

  contentsParts.unshift({ text: buildGeneratePrompt(fileNameList, lead) });
  const summaryText = await generateWithGemini(contentsParts, apiKey);
  const parsed = extractCibilData(summaryText);

  if (!parsed) {
    throw new Error('Could not generate a credit profile from the uploaded documents.');
  }

  return parsed;
}

// ─────────────────────────────────────────────────────────────
// Mock fallback used when GEMINI_API_KEY is not configured (testing/dev)
// ─────────────────────────────────────────────────────────────
function mockCibilReport() {
  return {
    cibil_score: 742,
    score_band: 'Good',
    report_generated_on: new Date().toLocaleDateString('en-IN'),
    consumer: {
      name: 'Rahul Sharma',
      dob: '15/08/1990',
      gender: 'Male',
      pan_number: 'ABCDE1234F',
      mobile: '9876543210',
      email: 'rahul.sharma@example.com',
      employment: 'Salaried',
      address: '123, MG Road, Bengaluru, Karnataka - 560001',
    },
    credit_summary: {
      total_accounts: 4,
      active_accounts: 3,
      closed_accounts: 1,
      written_off_accounts: 0,
      settled_accounts: 0,
      total_outstanding: 185000,
      monthly_obligations: 12700,
      total_enquiries: 2,
      credit_cards: 2,
      loans: 2,
    },
    accounts: [
      {
        lender: 'HDFC Bank',
        account_type: 'Credit Card',
        account_number: 'XXXX1234',
        ownership: 'Individual',
        opened_date: '06/2018',
        status: 'Current',
        days_past_due: 0,
        amount_sanctioned: 150000,
        current_balance: 45000,
        overdue_amount: 0,
        remarks: null,
      },
      {
        lender: 'State Bank of India',
        account_type: 'Personal Loan',
        account_number: 'XXXX5678',
        ownership: 'Individual',
        opened_date: '03/2020',
        status: 'Current',
        days_past_due: 0,
        amount_sanctioned: 300000,
        current_balance: 140000,
        overdue_amount: 0,
        remarks: 'Regular payments observed.',
      },
      {
        lender: 'Axis Bank',
        account_type: 'Credit Card',
        account_number: 'XXXX9012',
        ownership: 'Individual',
        opened_date: '11/2021',
        status: 'Current',
        days_past_due: 0,
        amount_sanctioned: 80000,
        current_balance: 0,
        overdue_amount: 0,
        remarks: null,
      },
      {
        lender: 'Bajaj Finserv',
        account_type: 'Consumer Loan',
        account_number: 'XXXX3456',
        ownership: 'Individual',
        opened_date: '05/2019',
        status: 'Closed',
        days_past_due: 0,
        amount_sanctioned: 120000,
        current_balance: 0,
        overdue_amount: 0,
        remarks: 'Account closed as settled.',
      },
    ],
    enquiries: [
      { institution: 'ICICI Bank', date: '12/03/2025', purpose: 'Consumer Loan', amount: 250000 },
      { institution: 'Kotak Mahindra Bank', date: '02/01/2025', purpose: 'Credit Card', amount: 0 },
    ],
    notes: 'The report shows a clean credit history with all accounts in Current status and no write-offs. Credit utilisation on the HDFC card is moderate. Only 2 enquiries in the last 12 months, indicating no aggressive credit seeking.',
  };
}

// ─────────────────────────────────────────────────────────────
// Main entry: parse a CIBIL report PDF buffer
// ─────────────────────────────────────────────────────────────
export async function parseCibilReport(fileBuffer, fileName) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    console.warn('GEMINI_API_KEY not set. Returning mock CIBIL analysis for testing.');
    return mockCibilReport();
  }

  const ext = path.extname(fileName || '').toLowerCase();
  const mimeType = ext === '.png' ? 'image/png'
    : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg'
    : 'application/pdf';

  const contentsParts = [
    { text: buildCibilPrompt(fileName) },
    {
      inlineData: {
        mimeType,
        data: fileBuffer.toString('base64'),
      },
    },
  ];

  const summaryText = await generateWithGemini(contentsParts, apiKey);
  const parsed = extractCibilData(summaryText);

  if (!parsed) {
    throw new Error('Could not extract structured CIBIL data from the report. The file may not be a valid CIBIL report.');
  }

  return parsed;
}
