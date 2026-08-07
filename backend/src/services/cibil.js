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
import { generateWithGemini } from './gemini.js';

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
