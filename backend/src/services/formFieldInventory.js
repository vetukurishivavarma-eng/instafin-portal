/**
 * Generic form-field discovery.
 *
 * Walks every page of a PDF's text layer and lists every line that looks
 * like it names an input (a row/field label) — as opposed to prose
 * (instructions, declarations, legal text). This is deliberately NOT
 * scoped to the canonical FORM_FIELD_KEYS whitelist that formTextAnchor.js
 * fills against: it's a discovery tool for finding out everything that's
 * actually on a form, so a human can decide what's worth wiring up as a
 * fillable field, before any of it is used for filling.
 *
 * Best-effort and deliberately over-inclusive: a false positive (prose
 * wrongly kept as a "label") just adds one row a human skips past; a false
 * negative (a real label wrongly dropped as "prose") hides a field
 * entirely. The classifier below only excludes lines that look strongly
 * like sentences, for that reason.
 *
 * This does NOT attempt to precisely separate "the label" from "the value
 * area" the way formTextAnchor.js does for its known keys — that requires
 * per-field logic. It reports the whole line's text plus two coarse
 * structural hints (does it contain a run of single-character comb cells?
 * does it contain a cluster of short option-like words?) and leaves
 * interpretation to the reviewer.
 */
import { extractPages } from './formTextAnchor.js';

export function classifyLine(text) {
  const trimmed = (text || '').replace(/\s+/g, ' ').trim();
  if (!trimmed) return null;
  const words = trimmed.split(' ');
  // A row packed with short structural tokens (a shared "Date of Birth /
  // Gender  D D M M Y Y Y Y  Age  M F T ..." row, repeated for both
  // applicant and co-applicant) can run just as long as a real sentence,
  // but it isn't one — real English words average ~4.5 letters, whereas a
  // comb-cell/checkbox row is dominated by 1-3 char tokens. Judge by word
  // shape before word count, so this doesn't get discarded as prose.
  const avgWordLen = trimmed.replace(/\s/g, '').length / words.length;
  const looksStructural = avgWordLen <= 4 && words.length >= 6;
  if (!looksStructural) {
    // Long, sentence-shaped lines are almost always instructions/declarations
    // ("Borrower shall be liable to pay..."), not field labels.
    if (trimmed.length > 90) return 'prose';
    if (words.length > 14) return 'prose';
    if (/[.!?]$/.test(trimmed) && words.length > 6) return 'prose';
  }
  return 'label';
}

// A run of 4+ consecutive single-character tokens (D D D D, X X X X, M M M
// M Y Y Y Y) is a segmented/comb-cell input — one character typed per box —
// rather than free text.
function hasCombCellRun(items) {
  let run = 0;
  let best = 0;
  for (const it of items) {
    const s = it.str.trim();
    if (s.length === 1 && /[A-Za-z0-9]/.test(s)) {
      run++;
      best = Math.max(best, run);
    } else {
      run = 0;
    }
  }
  return best >= 4;
}

// 3+ short (2-15 char) word-like tokens on one line suggests a set of
// mutually-exclusive options next to checkboxes (e.g. "Mr. Ms. Mrs. Dr.
// CA", "Self owned Family Rented Provided by Employer") rather than one
// free-text value slot — checkboxes themselves are undecorated squares
// with no text of their own, so the option WORDS are the only text-layer
// signal that a checkbox group is present at all.
function hasOptionWordGroup(items) {
  const words = items
    .map((it) => it.str.trim())
    .filter((s) => s.length >= 2 && s.length <= 15 && /^[A-Za-z.]+$/.test(s));
  return words.length >= 3;
}

/**
 * @param {Buffer} fileBuffer
 * @returns {Promise<Array<{page:number, text:string, yPct:number, hasCombCells:boolean, hasOptionWords:boolean}>>}
 */
export async function inventoryFormFields(fileBuffer) {
  const pages = await extractPages(fileBuffer);
  const rows = [];
  for (const page of pages) {
    for (const line of page.lines) {
      if (classifyLine(line.text) !== 'label') continue;
      rows.push({
        page: page.pageNum,
        text: line.text.trim(),
        yPct: Number((((page.height - line.y) / page.height) * 100).toFixed(2)),
        hasCombCells: hasCombCellRun(line.items),
        hasOptionWords: hasOptionWordGroup(line.items),
      });
    }
  }
  return rows;
}
