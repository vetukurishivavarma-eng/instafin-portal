/**
 * AI field calibration for bank application form PDFs.
 *
 * Bank forms (especially BOI) are scanned images without editable form
 * fields, so the filler overlays text at known positions. This service uses
 * Gemini Vision ONCE per form to detect where each field belongs and stores
 * a percentage-based coordinate map on the application_forms row.
 *
 * Coordinates are stored as percentages of the page (xPct = % from left edge,
 * yPct = % from top edge) so they are independent of the PDF's physical size.
 */
import { generateWithGemini } from './gemini.js';
import { FORM_FIELD_KEYS } from '../data/formSources.js';

// Fields a customer/lead can provide that the filler should try to place.
// Presented to Gemini so it only returns keys that actually exist on the form.
const FIELD_DESCRIPTIONS = {
  full_name: 'Full name of the applicant',
  dob: 'Date of birth of the applicant (DD/MM/YYYY)',
  gender: 'Gender of the applicant (Male / Female / Other)',
  aadhaar_number: 'Aadhaar number (12 digits)',
  pan_number: 'PAN number (e.g. ABCDE1234F)',
  address: 'Full residential address',
  mobile: 'Mobile / phone number',
  email: 'Email address',
  loan_amount: 'Loan amount applied for (in rupees)',
  loan_type: 'Loan type / scheme name',
  gross_income: 'Gross monthly income',
  monthly_income: 'Net monthly income',
  rental_income: 'Rental income, if any',
  co_applicant_name: 'Co-applicant / guarantor full name',
  co_applicant_dob: 'Co-applicant date of birth',
  employer_name: 'Employer / business / company name',
  application_date: 'Date of application (DD/MM/YYYY)',
};

/**
 * Calibrate field positions for a blank form PDF.
 * @param {Buffer} fileBuffer - blank form PDF
 * @returns {Promise<{ fields: object, calibrated_at: string }>}
 */
export async function calibrateFormFields(fileBuffer) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not set on the server. Field calibration requires it.');
  }

  const fieldList = FORM_FIELD_KEYS
    .map(key => `  "${key}": "${FIELD_DESCRIPTIONS[key] || key}"`)
    .join(',\n');

  const promptText = `
You are an expert at reading bank loan application forms (PDFs).

I will attach a BLANK bank loan application form PDF (it may be a scanned image with multiple pages).

Your ONLY job: locate where the answer/value for each of the following fields should be typed or written on the form, and return their page number and position.

Available fields (keys) and what they mean:
{
${fieldList}
}

INSTRUCTIONS:
1. Look at every page of the attached PDF.
2. For each field key that has a visible input slot/box/line/label on the form, find the exact spot where the applicant's value would be written (the blank area next to/under the field label).
3. Return positions as PERCENTAGES of the page size:
   - "xPct": distance from the LEFT edge of the page as a percentage of page width (0-100).
   - "yPct": distance from the TOP edge of the page as a percentage of page height (0-100).
4. Return the 1-based page number ("page") where the field appears.
5. Only include fields that actually exist on the form. Omit fields that are not present.
6. For check-box fields (gender, etc.), return the position of the checkbox or the label area.

Respond with ONLY a JSON object, no markdown code fence, no commentary, in exactly this shape:
{
  "fields": {
    "full_name": { "page": 1, "xPct": 12.5, "yPct": 8.3, "fontSize": 10 },
    "dob": { "page": 1, "xPct": 60.0, "yPct": 8.3, "fontSize": 10 }
  }
}
Set fontSize to a sensible value between 8 and 12 (use the approximate height of the blank input area).
`;

  const parts = [
    { text: promptText },
    { inlineData: { mimeType: 'application/pdf', data: fileBuffer.toString('base64') } },
  ];

  const raw = await generateWithGemini(parts, apiKey);

  let parsed = null;
  // Try strict JSON first, then code-fenced JSON
  try {
    parsed = JSON.parse(raw.trim());
  } catch (e) {
    try {
      parsed = JSON.parse(raw.match(/```json([\s\S]*?)```/)?.[1]?.trim() || 'null');
    } catch (e2) {
      parsed = null;
    }
  }

  if (!parsed || !parsed.fields || typeof parsed.fields !== 'object') {
    throw new Error('Gemini did not return a valid field map. Please retry calibration.');
  }

  // Sanitize: only keep known keys with numeric positions, clamp percentages to 0-100
  const fields = {};
  for (const [key, pos] of Object.entries(parsed.fields)) {
    if (!FORM_FIELD_KEYS.includes(key)) continue;
    if (!pos || typeof pos !== 'object') continue;
    const page = Math.max(1, parseInt(pos.page, 10) || 1);
    const xPct = Math.min(100, Math.max(0, parseFloat(pos.xPct)));
    const yPct = Math.min(100, Math.max(0, parseFloat(pos.yPct)));
    const fontSize = Math.min(12, Math.max(7, parseFloat(pos.fontSize) || 10));
    if (!Number.isFinite(xPct) || !Number.isFinite(yPct)) continue;
    fields[key] = { page, xPct, yPct, fontSize };
  }

  if (Object.keys(fields).length === 0) {
    throw new Error('Calibration found no matching fields on this form. The form may be a non-standard layout.');
  }

  return { fields, calibrated_at: new Date().toISOString() };
}

