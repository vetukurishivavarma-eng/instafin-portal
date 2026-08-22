/**
 * Deterministic field authoring from a PDF's real text layer.
 *
 * Replaces screenshot-guessing (Gemini vision on a rasterized image) as the
 * primary way to figure out where each field's writable box is on a bank
 * form. Instead: read the PDF's actual text content and positions (pdfjs-dist),
 * find each field's printed label, and derive the box from the label's real
 * position plus the layout around it (next text item on the line, or a
 * detected Applicant/Co-applicant column boundary). This is reproducible —
 * the same PDF bytes always produce the same field map — unlike an AI vision
 * guess or a one-off manual drag.
 *
 * Falls back to nothing found (empty fields) for scanned/rasterized pages
 * with no text layer; callers should fall back to the Gemini vision path or
 * the manual Draw Fields editor in that case.
 */
import pdfjsLibModule from 'pdfjs-dist/legacy/build/pdf.js';
const pdfjsLib = pdfjsLibModule.getDocument ? pdfjsLibModule : pdfjsLibModule.default;
import { FORM_FIELD_KEYS } from '../data/formSources.js';

const norm = (s) => (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

// Ordered by specificity — first pattern that matches a line wins for that key.
const FIELD_LABEL_PATTERNS = {
  full_name: [/^FIRSTNAME/, /^SURNAME/, /^FULLNAME/, /^APPLICANTNAME/, /^NAME$/],
  dob: [/^DATEOFBIRTH/, /^DOB$/],
  gender: [/GENDER/, /^SEX$/],
  aadhaar_number: [/^UIDAADHAAR/, /AADHAAR/, /AADHAR/],
  pan_number: [/^PANNO/, /PANNUMBER/, /^PAN$/],
  address: [/^FLATDOORBLOCK/, /^CURRENTADDRESS/, /^PERMANENTADDRESS/, /^ADDRESS/],
  mobile: [/^MOBILENO/, /^MOBILE$/],
  email: [/EMAILIDPERSONAL/, /^EMAILID/, /^EMAIL$/],
  loan_amount: [/^AMOUNT/, /LOANAMOUNT/],
  loan_type: [/TYPEOFLOAN/, /LOANTYPE/, /PURPOSEOFLOAN/],
  gross_income: [/GROSSINCOME/],
  monthly_income: [/MONTHLYINCOME/, /NETMONTHLYINCOME/, /NETINCOME/],
  rental_income: [/RENTALINCOME/, /OTHERINCOME/],
  employer_name: [/EMPLOYERBUSINESSNAME/, /^EMPLOYER/, /COMPANYNAME/, /BUSINESSNAME/],
  application_date: [/APPLICATIONDATE/, /DATEOFAPPLICATION/],
  // co_applicant_name / co_applicant_dob are derived from the full_name / dob
  // row match plus a detected Co-applicant column — handled separately below.
};

const GENDER_OPTION_LABELS = { M: 'Male', F: 'Female', T: 'Third' };

async function extractPages(fileBuffer) {
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(fileBuffer),
    isEvalSupported: false,
    disableFontFace: true,
  });
  const pdfDoc = await loadingTask.promise;
  const pages = [];

  for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
    const page = await pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1 });
    const textContent = await page.getTextContent();

    const items = textContent.items
      .filter((it) => it.str && it.str.trim())
      .map((it) => {
        const x = it.transform[4];
        const y = it.transform[5];
        const width = it.width || 0;
        const height = it.height || Math.abs(it.transform[3]) || 10;
        return { str: it.str, x, y, width, height };
      });

    // Group into lines by clustering on baseline y (within a small tolerance).
    const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
    const lines = [];
    for (const item of sorted) {
      let line = lines.find((l) => Math.abs(l.y - item.y) < 2.5);
      if (!line) {
        line = { y: item.y, items: [] };
        lines.push(line);
      }
      line.items.push(item);
    }
    for (const line of lines) {
      line.items.sort((a, b) => a.x - b.x);
      line.text = line.items.map((i) => i.str).join(' ');
    }
    lines.sort((a, b) => b.y - a.y);

    pages.push({
      pageNum,
      width: viewport.width,
      height: viewport.height,
      lines,
    });

    await page.cleanup();
  }

  await pdfDoc.destroy();
  return pages;
}

// Find the x-position of a "Co-applicant" column header on this page, if any.
function findCoApplicantColumnX(page) {
  for (const line of page.lines) {
    for (const item of line.items) {
      if (norm(item.str) === 'COAPPLICANT') return item.x;
    }
  }
  return null;
}

// Locate the line + item index whose concatenated text (from some start
// index) matches one of the given regex patterns, normalized.
function findLabelMatch(pages, patterns) {
  for (const page of pages) {
    for (const line of page.lines) {
      // Try growing windows of items from the start of the line so a label
      // split across multiple text runs ("FIRST" "NAME") still matches.
      for (let endIdx = 1; endIdx <= Math.min(line.items.length, 5); endIdx++) {
        const windowText = norm(line.items.slice(0, endIdx).map((i) => i.str).join(''));
        if (!windowText) continue;
        if (patterns.some((re) => re.test(windowText))) {
          return { page, line, labelEndIdx: endIdx };
        }
      }
    }
  }
  return null;
}

function boxFromLine(page, line, labelEndIdx, { leftBoundX = null, rightBoundX = null } = {}) {
  const labelItems = line.items.slice(0, labelEndIdx);
  const lastLabelItem = labelItems[labelItems.length - 1];
  const startX = leftBoundX != null ? leftBoundX : lastLabelItem.x + lastLabelItem.width + 3;

  // Next text item after the label on the same line caps the box, unless a
  // column boundary is tighter.
  const nextItem = line.items[labelEndIdx];
  let endX = rightBoundX != null ? rightBoundX : page.width - 20;
  if (nextItem && nextItem.x > startX && nextItem.x < endX) {
    endX = nextItem.x - 3;
  }
  if (endX <= startX) return null;

  const fontHeight = lastLabelItem.height || 10;
  const boxHeight = Math.max(fontHeight * 1.6, page.height * 0.014);
  const topY = page.height - (line.y + fontHeight * 0.3) - boxHeight * 0.15;

  const fontSize = Math.min(12, Math.max(7, Math.round(fontHeight * 0.9)));

  return {
    page: page.pageNum,
    xPct: (startX / page.width) * 100,
    yPct: (topY / page.height) * 100,
    widthPct: ((endX - startX) / page.width) * 100,
    heightPct: (boxHeight / page.height) * 100,
    fontSize,
  };
}

/**
 * @param {Buffer} fileBuffer
 * @returns {Promise<{ fields: object, calibrated_at: string, source: 'text-layer' } | null>}
 *   null if the PDF has no usable text layer at all (fully rasterized scan).
 */
export async function anchorFieldsFromTextLayer(fileBuffer) {
  const pages = await extractPages(fileBuffer);
  const totalTextItems = pages.reduce((n, p) => n + p.lines.reduce((m, l) => m + l.items.length, 0), 0);
  if (totalTextItems < 10) return null; // no real text layer — caller should fall back

  const fields = {};
  const rowMatches = {}; // key -> { page, line, labelEndIdx } for co-applicant derivation

  for (const key of FORM_FIELD_KEYS) {
    const patterns = FIELD_LABEL_PATTERNS[key];
    if (!patterns) continue;

    const match = findLabelMatch(pages, patterns);
    if (!match) continue;
    rowMatches[key] = match;

    const coApplicantX = findCoApplicantColumnX(match.page);
    const labelEndX = match.line.items[match.labelEndIdx - 1].x + match.line.items[match.labelEndIdx - 1].width;
    const rightBoundX = coApplicantX != null && coApplicantX > labelEndX ? coApplicantX - 5 : null;

    if (key === 'gender') {
      // Look for single-letter option tokens (M/F/T) after the label on the
      // same line — these are checkbox targets, not a single text field.
      const optionItems = match.line.items
        .slice(match.labelEndIdx)
        .filter((it) => /^[MFT]$/.test(it.str.trim()))
        .slice(0, 3);
      if (optionItems.length >= 2) {
        for (const opt of optionItems) {
          const letter = opt.str.trim();
          const size = Math.max(opt.width, opt.height, 8);
          fields[`gender__${letter}`] = {
            page: match.page.pageNum,
            xPct: (opt.x / match.page.width) * 100,
            yPct: ((match.page.height - opt.y - size) / match.page.height) * 100,
            widthPct: (size / match.page.width) * 100,
            heightPct: (size / match.page.height) * 100,
            fontSize: 9,
            fieldType: 'checkbox',
            optionValue: GENDER_OPTION_LABELS[letter] || letter,
          };
        }
        continue;
      }
      // fall through to plain text box if no option tokens found
    }

    const box = boxFromLine(match.page, match.line, match.labelEndIdx, { rightBoundX });
    if (box) fields[key] = box;
  }

  // Derive co_applicant_name / co_applicant_dob from the same row as their
  // applicant-side counterpart, placed after the detected column boundary.
  const coDerivations = [['full_name', 'co_applicant_name'], ['dob', 'co_applicant_dob']];
  for (const [baseKey, coKey] of coDerivations) {
    const base = rowMatches[baseKey];
    if (!base) continue;
    const coApplicantX = findCoApplicantColumnX(base.page);
    if (coApplicantX == null) continue;
    const box = boxFromLine(base.page, base.line, base.labelEndIdx, {
      leftBoundX: coApplicantX + 5,
    });
    if (box) fields[coKey] = box;
  }

  if (Object.keys(fields).length === 0) return null;
  return { fields, calibrated_at: new Date().toISOString(), source: 'text-layer' };
}
