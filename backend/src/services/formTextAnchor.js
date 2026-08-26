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
  first_name: [/^FIRSTNAME$/],
  middle_name: [/^MIDDLENAME$/],
  ckyc_number: [/^CKYCNUMBER/],
  dob: [/^DATEOFBIRTH/, /^DOB$/],
  gender: [/GENDER/, /^SEX$/],
  aadhaar_number: [/^UIDAADHAAR/, /AADHAAR/, /AADHAR/],
  pan_number: [/^PANNO/, /PANNUMBER/, /^PAN$/],
  address: [/^FLATDOORBLOCK/, /^CURRENTADDRESS/, /^PERMANENTADDRESS/, /^ADDRESS/],
  flat_door_block: [/^FLATDOORBLOCK/],
  premises_name: [/^NAMEOFPREMISESBUILDING/],
  road_street: [/^ROADSTREET/],
  area_locality: [/^AREALOCALITY/],
  town_city_village: [/^TOWNCITYVILLAGE/],
  district: [/^DISTRICT$/],
  state: [/^STATEUNIONTERRITORY/],
  pin_code: [/^PINCODE/],
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

// Find the first run of 2-3 consecutive single-letter M/F/T items that are
// genuinely gender option checkboxes, starting the scan at fromIdx. Requires
// at least two DISTINCT letters in the run, which is what tells a real
// "M F T" selector apart from an unrelated run of repeated single-letter
// placeholder glyphs immediately to its left on the same shared line — e.g.
// a date-of-birth comb box rendered as "M M M M" (one glyph per month
// digit) directly precedes the actual gender selector on HDFC's combined
// "Date of Birth / Gender" row, and a naive "next M/F/T-looking item" scan
// grabs three of those placeholder M's as if they were Male/Female/Third.
function findGenderOptionRun(items, fromIdx) {
  for (let i = fromIdx; i < items.length; i++) {
    const run = [];
    for (let j = i; j < items.length && run.length < 3; j++) {
      const s = items[j].str.trim();
      if (!/^[MFT]$/.test(s)) break;
      run.push(items[j]);
    }
    if (run.length >= 2 && new Set(run.map((it) => it.str.trim())).size >= 2) {
      return run;
    }
  }
  return null;
}

// Join a line's items into readable text, inserting a space only where
// there's an actual visual gap between glyphs. A naive join (space between
// every item) turns split label runs — common on these forms, where the
// first letter of a word is often its own text run at a different font
// size — into noise like "S URNAME" or "D ATE OF B IRTH". Gap-aware joining
// reconstructs "SURNAME" / "DATE OF BIRTH" instead.
function joinLineText(items) {
  let text = '';
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (i > 0) {
      const prev = items[i - 1];
      if (it.x - (prev.x + prev.width) > 1.2) text += ' ';
    }
    text += it.str;
  }
  return text;
}

export async function extractPages(fileBuffer) {
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
      line.text = joinLineText(line.items);
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

// Whether this page has a two-column Applicant/Co-applicant layout at all.
// NOTE: deliberately NOT used as the column boundary's x-position — the
// "Co-applicant" banner text is centered inside its own column, not
// left-aligned to the divider, so its x sits well inside co-applicant
// territory. Using it directly as a right-edge cap lets an applicant-side
// box run straight through the gutter and into the co-applicant's own
// cells (confirmed on HDFC's Aadhaar row, whose applicant box otherwise
// extended past x=418pt on a page whose true column split is ~293pt).
export function pageHasCoApplicantColumn(page) {
  for (const line of page.lines) {
    for (const item of line.items) {
      if (norm(item.str) === 'COAPPLICANT') return true;
    }
  }
  return false;
}

// Find the actual Applicant/Co-applicant gutter on THIS row: the largest
// horizontal gap between text items positioned to the right of afterX. On a
// two-column comb-cell row (Aadhaar, PAN, DOB, ...) this reliably lands on
// the real divider, unlike any page-wide banner-text position.
export function findRowColumnGapX(line, afterX) {
  const rightItems = line.items.filter((it) => it.x > afterX).sort((a, b) => a.x - b.x);
  let bestGap = 0;
  let boundaryX = null;
  for (let i = 0; i < rightItems.length - 1; i++) {
    const gap = rightItems[i + 1].x - (rightItems[i].x + rightItems[i].width);
    if (gap > bestGap) {
      bestGap = gap;
      boundaryX = rightItems[i + 1].x;
    }
  }
  // Require a gap clearly bigger than normal word/cell spacing so an
  // ordinary space between two words on a one-column row isn't mistaken
  // for a column gutter.
  return bestGap > 25 ? boundaryX : null;
}

// The NEAREST significant gap to the right of afterX, not the single
// biggest gap anywhere on the line. findRowColumnGapX's "biggest gap wins"
// rule is correct for a simple two-column Applicant/Co-applicant row, but
// wrong on a row with 3+ columns (a numbered "Estimate of Requirement of
// Funds" line, a multi-column table) — the biggest gap on the whole row
// might sit two columns further right than the field actually being
// bounded, letting its box run straight through intermediate columns
// instead of stopping at its own. A field's writable area must be clipped
// to the LOCAL boundary immediately to its right, not a global one.
export function findNearestColumnGapX(line, afterX, minGap = 20) {
  const rightItems = line.items.filter((it) => it.x > afterX).sort((a, b) => a.x - b.x);
  for (let i = 0; i < rightItems.length - 1; i++) {
    const gap = rightItems[i + 1].x - (rightItems[i].x + rightItems[i].width);
    if (gap > minGap) return rightItems[i + 1].x;
  }
  return null;
}

// An unanchored pattern (e.g. /GENDER/, matched against "...Birth/Gender"
// as one run-on window) can be satisfied by a window that starts further
// left than the label text actually does — the match is real, but its
// reported start position isn't where "Gender" itself begins. Shrink the
// window from the left, keeping only the tightest (rightmost) start index
// that still satisfies the pattern, so callers that need to know exactly
// where this label begins (capping a neighboring field's box against it)
// get an accurate position rather than an early, unrelated item.
function tightenLabelStart(line, patterns, startIdx, labelEndIdx) {
  for (let idx = labelEndIdx - 1; idx >= startIdx; idx--) {
    const windowText = norm(line.items.slice(idx, labelEndIdx).map((i) => i.str).join(''));
    if (windowText && patterns.some((re) => re.test(windowText))) return idx;
  }
  return startIdx;
}

// Locate the line + item range whose concatenated text matches one of the
// given regex patterns, normalized.
function findLabelMatch(pages, patterns) {
  for (const page of pages) {
    for (const line of page.lines) {
      // Try growing windows of items starting from EVERY position in the
      // line, not just the line's first item — dense bank forms routinely
      // pack multiple labels onto one shared text line (e.g. a single row
      // reading "Date of Birth / Gender  D D M M Y Y Y Y  Age  M F T"), so a
      // label a search is looking for is often not the first thing on the
      // line it lives on.
      for (let startIdx = 0; startIdx < line.items.length; startIdx++) {
        for (let endIdx = startIdx + 1; endIdx <= Math.min(line.items.length, startIdx + 10); endIdx++) {
          const windowText = norm(line.items.slice(startIdx, endIdx).map((i) => i.str).join(''));
          if (!windowText) continue;
          if (patterns.some((re) => re.test(windowText))) {
            return { page, line, labelStartIdx: tightenLabelStart(line, patterns, startIdx, endIdx), labelEndIdx: endIdx };
          }
        }
      }
    }
  }
  return null;
}

// Short decorative glyphs (currency symbols, colons, dashes/slashes used as
// "Field ₹ :" separators) that PDF text extraction reports as their own
// item immediately after a label. They are part of the label's punctuation,
// not the start of the writable area — treating them as "the next item"
// (the box's right-edge boundary) collapses the box to zero/negative width
// or plants it in the gap between the label and its own colon instead of
// past it, at the real value slot.
const CONNECTOR_TOKEN = /^[:\-/`₹.,()]+$/;

export function skipConnectorTokens(line, idx) {
  while (idx < line.items.length && CONNECTOR_TOKEN.test(line.items[idx].str.trim())) idx++;
  // A parenthesized aside straight after the label — "CKYC Number (If
  // available)", "Amount (in words)" — is part of the label, not the first
  // value item; left unskipped it becomes "the next item" and collapses
  // the box to zero width.
  if (idx < line.items.length && line.items[idx].str.trim().startsWith('(')) {
    let j = idx;
    while (j < line.items.length && !line.items[j].str.includes(')')) j++;
    if (j < line.items.length) idx = j + 1;
  }
  return idx;
}

// ── Vector-cell snapping ────────────────────────────────────────────────
//
// The writable areas on real bank forms are DRAWN — HDFC paints each comb
// cell as a filled white rectangle on a lavender background, SBI strokes
// each cell's outline — and that geometry, not the label text, is the
// ground truth for where a field's box belongs. Text-only placement
// (boxFromLine's "1.6x the label's font height, starting just past the
// label") reliably lands a few points high and short of the printed cells,
// which is exactly the misalignment visible when the baked fields are
// opened over the form. So: harvest every plausible input-cell rectangle
// from each page's operator list, and when a field's row has such cells,
// snap the box to the actual cell run instead of trusting the estimate.

// pdfjs constructPath sub-operator coordinate counts, needed to walk the
// packed coords array in step with the ops array.
const PATH_OP_COORD_COUNTS = {
  13: 2, // moveTo
  14: 2, // lineTo
  15: 6, // curveTo
  16: 4, // curveTo2
  17: 4, // curveTo3
  18: 0, // closePath
  19: 4, // rectangle (x, y, w, h)
};

/**
 * All individual rectangles of plausible input-cell size drawn on each
 * page, in PDF space (origin bottom-left), as {x1, y1, x2, y2}.
 * @returns {Promise<Record<number, Array<{x1:number,y1:number,x2:number,y2:number}>>>}
 */
export async function extractCellRects(fileBuffer) {
  const { OPS } = pdfjsLib;
  const pdfDoc = await pdfjsLib.getDocument({
    data: new Uint8Array(fileBuffer),
    isEvalSupported: false,
    disableFontFace: true,
  }).promise;

  // Paint ops that mean "this path is actually drawn on the page" (vs. a
  // clip path or text-positioning artifact).
  const FILL_OPS = new Set([OPS.fill, OPS.eoFill, OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke]);
  const STROKE_OPS = new Set([OPS.stroke, OPS.closeStroke]);

  // A closed 4-point polygon whose points all sit on the corners of its own
  // bounding box IS a rectangle — HDFC draws every comb cell this way
  // (moveTo + lineTo×3 + closePath + eoFill) rather than with `re`.
  const polyToRect = (pts) => {
    if (pts.length !== 4) return null;
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    const x1 = Math.min(...xs);
    const x2 = Math.max(...xs);
    const y1 = Math.min(...ys);
    const y2 = Math.max(...ys);
    const tol = 0.6;
    for (const [px, py] of pts) {
      const onX = Math.abs(px - x1) < tol || Math.abs(px - x2) < tol;
      const onY = Math.abs(py - y1) < tol || Math.abs(py - y2) < tol;
      if (!onX || !onY) return null;
    }
    return { x1, y1, x2, y2 };
  };

  const rectsByPage = {};
  for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
    const page = await pdfDoc.getPage(pageNum);
    const opList = await page.getOperatorList();
    const rects = [];

    // Track fill color so dark decorative bars (section header banners are
    // cell-sized!) don't register as writable cells. Stroked outlines
    // (SBI-style comb squares) count regardless of fill color.
    let fillIsLight = true;

    for (let i = 0; i < opList.fnArray.length; i++) {
      const fn = opList.fnArray[i];
      if (fn === OPS.setFillRGBColor) {
        const [r, g, b] = opList.argsArray[i];
        fillIsLight = r >= 190 && g >= 190 && b >= 190;
        continue;
      }
      if (fn !== OPS.constructPath) continue;

      const paintFn = opList.fnArray[i + 1];
      const isFill = FILL_OPS.has(paintFn);
      const isStroke = STROKE_OPS.has(paintFn);
      if (!isFill && !isStroke) continue; // clip path etc. — not drawn

      const [ops, coords] = opList.argsArray[i];
      if (!Array.isArray(ops) || !Array.isArray(coords)) continue;

      // One constructPath can contain a whole row of cells as individual
      // subpaths — walk them out one by one rather than taking the path's
      // union bbox, so the run can later be split at real gaps (e.g. the
      // Applicant/Co-applicant gutter).
      const candidates = [];
      let subpath = [];
      const flushSubpath = () => {
        const rect = polyToRect(subpath);
        if (rect) candidates.push(rect);
        subpath = [];
      };
      let ci = 0;
      for (const op of ops) {
        const count = PATH_OP_COORD_COUNTS[op];
        if (count === undefined) break; // unknown op — stop before desyncing
        if (op === 19) {
          const [x, y, w, h] = coords.slice(ci, ci + 4);
          candidates.push({ x1: Math.min(x, x + w), y1: Math.min(y, y + h), x2: Math.max(x, x + w), y2: Math.max(y, y + h) });
        } else if (op === 13) {
          flushSubpath(); // moveTo starts a new subpath
          subpath.push(coords.slice(ci, ci + 2));
        } else if (op === 14) {
          subpath.push(coords.slice(ci, ci + 2));
        } else if (op === 18) {
          flushSubpath();
        } else {
          subpath = []; // curves — not a rectangle, discard this subpath
        }
        ci += count;
      }
      flushSubpath();

      // SBI-style outlined cells: one path holds an outer and an inner
      // rect wound in opposite directions, so a single nonzero fill paints
      // just the border ring — the INNER rect is the writable cell. Such
      // ring pairs are filled with the dark border color, so nesting must
      // be detected BEFORE the light-fill rule below: an inner-of-a-pair
      // is a cell whatever its path's fill color; a lone dark filled rect
      // is a decorative bar (section banner) and is not.
      const contains = (a, b) =>
        a !== b && b.x1 >= a.x1 - 0.4 && b.x2 <= a.x2 + 0.4 && b.y1 >= a.y1 - 0.4 && b.y2 <= a.y2 + 0.4 &&
        (b.x2 - b.x1) < (a.x2 - a.x1);
      for (const r of candidates) {
        if (candidates.some((o) => contains(r, o))) continue; // outer of a ring
        const isInner = candidates.some((o) => contains(o, r));
        if (isFill && !isStroke && !fillIsLight && !isInner) continue; // colored banner bar
        const rw = r.x2 - r.x1;
        const rh = r.y2 - r.y1;
        // Plausible single input cell / input strip: tall enough to write
        // in, not a hairline divider, not a page-sized panel.
        if (rw >= 5 && rw <= 450 && rh >= 6 && rh <= 45) rects.push(r);
      }
    }

    rectsByPage[pageNum] = rects;
    await page.cleanup();
  }
  await pdfDoc.destroy();
  return rectsByPage;
}

// Cells further apart than this aren't one input's comb run — it's the
// gutter between columns (Applicant/Co-applicant) or between two fields.
const CELL_RUN_MAX_GAP = 18;

/**
 * Find the run of drawn cells belonging to a label's row and return the
 * snapped box for it in PDF space, or null when the row has no usable
 * drawn cells (fall back to the text-estimated box).
 */
export function findCellRunBox(cellRects, line, fontHeight, { startXMin, rightBoundX = null, pageWidth, labelStartX = null }) {
  if (!cellRects || cellRects.length === 0) return null;

  // Cells belonging to this row: their vertical span overlaps the label's
  // glyph band. (Labels sit vertically centered against their cell row on
  // these forms, so genuine cells always overlap it.)
  let bandY1 = line.y - 2;
  let bandY2 = line.y + fontHeight + 2;
  let effStartXMin = startXMin;
  const collect = () => cellRects
    .filter((r) => r.y2 >= bandY1 && r.y1 <= bandY2)
    .filter((r) => r.x2 > effStartXMin && (rightBoundX == null || r.x1 < rightBoundX))
    .filter((r) => r.x1 >= effStartXMin - 3)
    .sort((a, b) => a.x1 - b.x1);
  let rowCells = collect();

  // Header-above-cells style (SBI's "First Name / Middle Name / Last Name"
  // headers sitting on their own line directly over one shared comb row):
  // nothing beside the label, but the writable cells are immediately BELOW
  // it — and they start under the label's own x, not after its end.
  if (rowCells.length === 0 && labelStartX != null) {
    bandY1 = line.y - fontHeight * 4;
    bandY2 = line.y - 1;
    effStartXMin = Math.min(startXMin, labelStartX - 2);
    rowCells = collect();
  }
  if (rowCells.length === 0) return null;
  startXMin = effStartXMin;

  // A light background strip behind TWO stacked rows passes the size
  // filter too (it's only ~2 cell-heights tall) and, being continuous,
  // would both double the snapped box's height and let the run sail
  // through column gutters the real cells stop at. Real cells on one row
  // share a height; anything much taller than the row's median is such a
  // strip, not a cell — drop it, unless strips are all this row has.
  const heights = rowCells.map((r) => r.y2 - r.y1).sort((a, b) => a - b);
  const median = heights[Math.floor(heights.length / 2)];
  const tight = rowCells.filter((r) => r.y2 - r.y1 <= median * 1.75);
  if (tight.length > 0) rowCells = tight;

  // The run must begin near the label, not at some unrelated box far
  // across the page.
  if (rowCells[0].x1 - startXMin > pageWidth * 0.35) return null;

  const run = [rowCells[0]];
  for (let i = 1; i < rowCells.length; i++) {
    const prev = run[run.length - 1];
    if (rowCells[i].x1 - prev.x2 > CELL_RUN_MAX_GAP) break;
    run.push(rowCells[i]);
  }

  const x1 = run[0].x1;
  // A single wide strip can begin before the column boundary and extend
  // past it — the boundary always wins.
  const x2 = rightBoundX != null
    ? Math.min(run[run.length - 1].x2, rightBoundX - 2)
    : run[run.length - 1].x2;
  let y1 = Math.min(...run.map((r) => r.y1));
  let y2 = Math.max(...run.map((r) => r.y2));
  // A writable area drawn as one panel spanning TWO stacked rows (HDFC's
  // Monthly/Other Income block) makes the run two rows tall; clamp the
  // box to the label's own row band so it can't cover the row below.
  if (y2 - y1 > fontHeight * 2.4) {
    y2 = Math.min(y2, line.y + fontHeight + 2);
    y1 = Math.max(y1, y2 - fontHeight * 2);
  }
  if (x2 - x1 < 6) return null;
  return { x1, x2, y1, y2 };
}

// Overwrite a text-estimated box's geometry with a snapped cell run.
export function applyCellRun(box, run, page) {
  const inset = 1;
  box.xPct = ((run.x1 + inset) / page.width) * 100;
  box.widthPct = ((run.x2 - run.x1 - inset * 2) / page.width) * 100;
  box.yPct = ((page.height - run.y2 + inset) / page.height) * 100;
  box.heightPct = ((run.y2 - run.y1 - inset * 2) / page.height) * 100;
  box.fontSize = Math.min(12, Math.max(7, Math.round((run.y2 - run.y1 - 3) * 0.9)));
  return box;
}

export function boxFromLine(page, line, labelEndIdx, { leftBoundX = null, rightBoundX = null } = {}) {
  const labelItems = line.items.slice(0, labelEndIdx);
  const lastLabelItem = labelItems[labelItems.length - 1];
  const startX = leftBoundX != null ? leftBoundX : lastLabelItem.x + lastLabelItem.width + 3;

  // Next text item after the label on the same line caps the box, unless a
  // column boundary (or another field's own label sharing this line, see
  // rightBoundX callers) is tighter.
  //
  // For a box anchored to its own label (leftBoundX not given), "next item"
  // means literally the item right after the label — a comb-cell field
  // (Aadhaar, PAN) may have its own trailing "NO." left unconsumed by the
  // label match, which sits BEFORE startX and so never wins the `> startX`
  // check below; that's what lets the box legitimately span the full run
  // of placeholder cells instead of stopping at the first one.
  //
  // For a box DERIVED at a shifted position (leftBoundX given — the
  // co-applicant side of a shared row), there is no "next item by index"
  // relative to a label that lives somewhere else on the line entirely, so
  // the next item must be found by actual position instead. On a dense
  // comb-cell row this correctly caps (or nulls out) the derived box too,
  // rather than letting it run unchecked to the end of the line/page —
  // exactly the class of bug that let a derived co-applicant DOB box run
  // straight through that row's own gender checkboxes.
  const nextItem = leftBoundX != null ? line.items.find((it) => it.x > startX) : line.items[labelEndIdx];
  let endX = rightBoundX != null ? rightBoundX : page.width - 20;
  if (nextItem && nextItem.x > startX && nextItem.x < endX) {
    endX = nextItem.x - 3;
  }
  if (endX <= startX) return null;

  // Never let a box swallow a lone M/F/T token — on a row dense enough to
  // share several fields (comb-cells + a gender selector all in one line),
  // "biggest gap on the line" can pick a gap that has nothing to do with
  // the real column boundary (e.g. the Applicant's own Age->Gender gap is
  // wider than the true Applicant/Co-applicant gutter on HDFC's DOB row) —
  // if that happens, the safety net here is failing to place a box at all
  // rather than silently drawing a name/date on top of a checkbox.
  if (
    line.items.some((it) => {
      if (!/^[MFT]$/.test(it.str.trim())) return false;
      // Full glyph span vs. box span, not just "does it start after
      // startX" — a checkbox letter sitting just before startX can still
      // visually overlap the drawn box once its own width is accounted for.
      return it.x + it.width > startX && it.x < endX;
    })
  ) {
    return null;
  }

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

  // Ground truth for where writable areas actually sit — see the comment
  // block above extractCellRects.
  const cellRectsByPage = await extractCellRects(fileBuffer);

  const fields = {};
  // key -> { page, line, labelStartIdx, labelEndIdx }. Populated in a first
  // pass over every key before any box is computed, so that pass 2 can cap
  // a field's box against the START of any OTHER field's own label sharing
  // the same text line — dense forms routinely pack more than one label
  // onto one shared line (e.g. "...Date of Birth /Gender  D D M M Y Y ...
  // Age  M F T" is one line carrying both the dob and gender labels), and a
  // field's writable area must never be allowed to run into the next
  // label/field instead of stopping before it.
  const rowMatches = {};
  for (const key of FORM_FIELD_KEYS) {
    const patterns = FIELD_LABEL_PATTERNS[key];
    if (!patterns) continue;
    const match = findLabelMatch(pages, patterns);
    if (match) rowMatches[key] = match;
  }

  for (const key of FORM_FIELD_KEYS) {
    const match = rowMatches[key];
    if (!match) continue;

    // The label may be immediately followed on the same line by decorative
    // punctuation ("Amount ₹ :", "Monthly Income ₹") rather than the actual
    // writable area — fold those into the label so they don't get mistaken
    // for "the next field" and collapse the box.
    const contentStartIdx = skipConnectorTokens(match.line, match.labelEndIdx);

    const lastLabelItem = match.line.items[contentStartIdx - 1];
    const labelEndX = lastLabelItem.x + lastLabelItem.width;

    // Column boundary: prefer this row's own actual gutter (the largest gap
    // among its own items), which is exact. Only fall back to the page's
    // midline — never to the "Co-applicant" banner text's position, see
    // pageHasCoApplicantColumn's comment — when this row has no co-applicant
    // content to find a gap against (e.g. a blank cell with no placeholder
    // text at all) but the page is confirmed two-column.
    const rowGapX = findRowColumnGapX(match.line, labelEndX);
    let rightBoundX = null;
    if (rowGapX != null) {
      rightBoundX = rowGapX - 5;
    } else if (labelEndX < match.page.width / 2 && pageHasCoApplicantColumn(match.page)) {
      rightBoundX = match.page.width / 2;
    }

    // If another field's own label starts later on this exact same line,
    // never let this field's box run past it — take whichever bound is
    // tighter. ("<= lastLabelItem.x" rather than "<= labelEndX" so a
    // second label that sits immediately/tightly adjacent, with near-zero
    // or slightly negative visual gap from font kerning, still counts as
    // being to our right and gets used as a cap.)
    for (const [otherKey, otherMatch] of Object.entries(rowMatches)) {
      if (otherKey === key || otherMatch.line !== match.line) continue;
      const otherLabelStartItem = otherMatch.line.items[otherMatch.labelStartIdx];
      if (!otherLabelStartItem || otherLabelStartItem.x <= lastLabelItem.x) continue;
      const candidate = otherLabelStartItem.x - 3;
      if (rightBoundX == null || candidate < rightBoundX) rightBoundX = candidate;
    }

    if (key === 'gender') {
      // Look for single-letter option tokens (M/F/T) after the label on the
      // same line — these are checkbox targets, not a single text field.
      const optionItems = findGenderOptionRun(match.line.items, contentStartIdx);
      if (optionItems) {
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

    const box = boxFromLine(match.page, match.line, contentStartIdx, { rightBoundX });
    if (box) {
      // The heuristic box's own right edge already accounts for the next
      // text item on the line (a following label like "Source") — a wide
      // drawn strip must not carry the snapped box past it.
      const heuristicRightX = ((box.xPct + box.widthPct) / 100) * match.page.width;
      const run = findCellRunBox(cellRectsByPage[match.page.pageNum], match.line, lastLabelItem.height || 10, {
        startXMin: labelEndX,
        rightBoundX: rightBoundX != null ? Math.min(rightBoundX, heuristicRightX + 6) : heuristicRightX + 6,
        pageWidth: match.page.width,
        labelStartX: match.line.items[match.labelStartIdx]?.x ?? null,
      });
      if (run) applyCellRun(box, run, match.page);
      fields[key] = box;
    }
  }

  // Derive co_applicant_name / co_applicant_dob from the same row as their
  // applicant-side counterpart, placed after that row's own actual column
  // gutter (not the banner text's position — see findRowColumnGapX).
  const coDerivations = [['full_name', 'co_applicant_name'], ['dob', 'co_applicant_dob']];
  for (const [baseKey, coKey] of coDerivations) {
    const base = rowMatches[baseKey];
    if (!base) continue;
    const baseLastItem = base.line.items[base.labelEndIdx - 1];
    const baseLabelEndX = baseLastItem.x + baseLastItem.width;
    const rowGapX = findRowColumnGapX(base.line, baseLabelEndX);
    if (rowGapX == null && !pageHasCoApplicantColumn(base.page)) continue;
    const leftBoundX = rowGapX != null ? rowGapX + 5 : base.page.width / 2 + 5;
    const box = boxFromLine(base.page, base.line, base.labelEndIdx, { leftBoundX });
    if (box) {
      const run = findCellRunBox(cellRectsByPage[base.page.pageNum], base.line, baseLastItem.height || 10, {
        startXMin: leftBoundX,
        pageWidth: base.page.width,
      });
      // A derived box has no label of its own vouching for it — only real
      // drawn cells at the derived position do. Without them (a page whose
      // "Co-applicant" mention is just a checkbox, not a second column),
      // the heuristic box floats over whatever happens to be there
      // (SBI's photo frame) — drop it rather than bake a field into that.
      if (!run) continue;
      applyCellRun(box, run, base.page);
      fields[coKey] = box;
    }
  }

  if (Object.keys(fields).length === 0) return null;
  return { fields, calibrated_at: new Date().toISOString(), source: 'text-layer' };
}
