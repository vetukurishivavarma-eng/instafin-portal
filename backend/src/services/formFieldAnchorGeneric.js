/**
 * Generic field anchoring — no per-field names, patterns, or whitelist.
 *
 * formTextAnchor.js's anchorFieldsFromTextLayer() only finds fields whose
 * label text matches a hand-written regex in FIELD_LABEL_PATTERNS, one
 * entry per canonical key. That doesn't scale: every new field on every
 * new bank form needs a human to notice it's missing and write a pattern
 * for it (see formFieldInventory.js's discovery report for how much of a
 * real form that whitelist misses).
 *
 * This module instead structurally segments EVERY line on the page —
 * using only spacing between text items, not what the words say — into
 * label / comb-cell / checkbox-option runs, and derives each field's key
 * directly from its own label text. It reuses the same box math and
 * column-boundary logic already proven in formTextAnchor.js.
 *
 * Calibrated from measured spacing on real bank-form rows:
 *   - words within one label phrase ("CURRENT RESIDENCE IS"): ~1-6pt gaps
 *   - digits/letters in a comb-cell run (D D M M Y Y Y Y): ~8-10pt gaps
 *   - checkbox options next to each other (Self owned  Family  Rented): ~18-30pt gaps
 * A run of 4+ single characters at comb-cell spacing is a segmented input.
 * 2+ short words at wider-than-label spacing (that aren't a comb run) are
 * mutually-exclusive checkbox options next to a label — checkboxes
 * themselves are undecorated squares with no text of their own, so the
 * option WORDS are the only text-layer signal a checkbox group exists.
 */
import pdfjsLibModule from 'pdfjs-dist/legacy/build/pdf.js';
import { extractPages, pageHasCoApplicantColumn, findRowColumnGapX, findNearestColumnGapX, extractCellRects, findCellRunBox, applyCellRun } from './formTextAnchor.js';
import { classifyLine } from './formFieldInventory.js';

const pdfjsLib = pdfjsLibModule.getDocument ? pdfjsLibModule : pdfjsLibModule.default;

// A dashed-border rectangle of roughly photo/signature size is the standard
// PDF convention for "paste your photograph here" — decorative instruction
// text sits inside it ("PASTE LATEST PASSPORT SIZE COLOUR PHOTOGRAPH..."),
// not a field label. Detected from the page's actual vector graphics (a
// setDash call followed by a rectangular path of plausible size), not
// guessed from the words — the same mechanism catches a signature box or
// any other bank's photo placeholder, not just HDFC's.
async function findDashedRegions(fileBuffer) {
  const { OPS } = pdfjsLib;
  const pdfDoc = await pdfjsLib.getDocument({
    data: new Uint8Array(fileBuffer),
    isEvalSupported: false,
    disableFontFace: true,
  }).promise;

  const regionsByPage = {};
  for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
    const page = await pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1 });
    const opList = await page.getOperatorList();

    const regions = [];
    let lastDash = null;
    for (let i = 0; i < opList.fnArray.length; i++) {
      const fn = opList.fnArray[i];
      const args = opList.argsArray[i];
      if (fn === OPS.setDash) {
        lastDash = args;
      } else if (fn === OPS.constructPath && lastDash && lastDash[0] && lastDash[0].length > 0) {
        const bbox = args[2]; // [xmin, xmax, ymin, ymax]
        if (bbox) {
          const w = bbox[1] - bbox[0];
          const h = bbox[3] - bbox[2];
          // Plausible photo/signature box: roughly stamp-to-passport-photo
          // sized, not a full-width divider or a tiny tick mark.
          if (w > 40 && w < 250 && h > 40 && h < 300) {
            regions.push({ x1: bbox[0], x2: bbox[1], y1: bbox[2], y2: bbox[3] });
          }
        }
      }
    }
    regionsByPage[pageNum] = { regions, height: viewport.height };
    await page.cleanup();
  }
  await pdfDoc.destroy();
  return regionsByPage;
}

function itemInRegion(item, region, pageHeight) {
  // Item y is PDF-space (origin bottom-left), matching the region bbox.
  return item.x >= region.x1 - 5 && item.x <= region.x2 + 5 && item.y >= region.y1 - 5 && item.y <= region.y2 + 5;
}

const WORD_GLUE_GAP = 1.5; // merge split glyphs of one word ("S"+"URNAME")
const LABEL_GAP_MAX = 6; // words still inside one label phrase
const COMB_GAP_MAX = 11; // consecutive single-char cells of a comb input
const OPTION_GAP_MAX = 60; // consecutive option words next to checkboxes
const MIN_COMB_RUN = 4;
const MIN_OPTION_RUN = 2;

function isSingleCharToken(s) {
  return s.length === 1 && /[A-Za-z0-9]/.test(s);
}

function isShortWord(s) {
  return s.length >= 1 && s.length <= 20 && /[A-Za-z]/.test(s);
}

// Some PDFs draw a glyph twice at (near-)identical coordinates — e.g. a
// faux-bold technique. Left as-is, each becomes its own single-char "word"
// after merging, and a genuine 4-cell comb run reads as 8 alternating
// duplicates whose glued pairs ("DD", "MM") are no longer single characters
// and so don't look like comb cells at all — misreading a real segmented
// date-of-birth input as three isolated two-letter option words instead.
function dedupeItems(items) {
  const out = [];
  for (const it of items) {
    const last = out[out.length - 1];
    if (last && last.str === it.str && Math.abs(last.x - it.x) < 0.5 && Math.abs(last.width - it.width) < 0.5) {
      continue;
    }
    out.push(it);
  }
  return out;
}

// Undo font-based glyph splitting: "S" + "URNAME" (near-zero gap) -> "SURNAME".
function mergeIntoWords(items) {
  const words = [];
  for (const it of dedupeItems(items)) {
    const last = words[words.length - 1];
    if (last && it.x - (last.x + last.width) <= WORD_GLUE_GAP) {
      last.str += it.str;
      last.width = it.x + it.width - last.x;
    } else {
      words.push({ str: it.str, x: it.x, y: it.y, width: it.width, height: it.height });
    }
  }
  return words;
}

// Does a run of 4+ consecutive single-char words start at index j?
function combRunLengthAt(words, gaps, j) {
  if (!isSingleCharToken(words[j].str.trim())) return 0;
  let k = j + 1;
  while (k < words.length && isSingleCharToken(words[k].str.trim()) && gaps[k] <= COMB_GAP_MAX) k++;
  return k - j;
}

function segmentLine(words, gaps) {
  const segments = [];
  let i = 0;
  while (i < words.length) {
    const combLen = combRunLengthAt(words, gaps, i);
    if (combLen >= MIN_COMB_RUN) {
      segments.push({ type: 'comb', words: words.slice(i, i + combLen) });
      i += combLen;
      continue;
    }
    const s0 = words[i].str.trim();
    if (isShortWord(s0)) {
      // Real option sets are shape-consistent — all single letters (M F T)
      // or all real words (Self owned / Family / Rented) — never a mix.
      // Without this, a short label immediately preceding an option run at
      // option-like spacing (HDFC's "Age" sitting right before its row's
      // "M F T" gender selector) gets swallowed as a bogus 4th option
      // instead of staying its own field.
      const firstIsSingleLetter = /^[A-Za-z]$/.test(s0);
      let j = i + 1;
      while (j < words.length) {
        // A 4+ single-char run starting here is a comb input, not more
        // option words — stop before absorbing an unrelated field's cells.
        if (combRunLengthAt(words, gaps, j) >= MIN_COMB_RUN) break;
        const sj = words[j].str.trim();
        if (!isShortWord(sj) || gaps[j] <= LABEL_GAP_MAX || gaps[j] > OPTION_GAP_MAX) break;
        if (/^[A-Za-z]$/.test(sj) !== firstIsSingleLetter) break;
        j++;
      }
      if (j - i >= MIN_OPTION_RUN) {
        segments.push({ type: 'option', words: words.slice(i, j) });
        i = j;
        continue;
      }
    }
    // Label run: merge consecutive words at tight (same-phrase) spacing.
    let j = i + 1;
    while (j < words.length && gaps[j] != null && gaps[j] <= LABEL_GAP_MAX) j++;
    segments.push({ type: 'label', words: words.slice(i, j) });
    i = j;
  }
  return segments;
}

function labelText(seg) {
  return seg.words.map((w) => w.str).join(' ').replace(/\s+/g, ' ').trim();
}

function slugify(text) {
  const s = text
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return s.slice(0, 60) || 'field';
}

// The next line below this one on the page (page.lines is sorted
// top-to-bottom), used to cap a box's height so it can't bleed into the
// row underneath — see makeBox's maxHeightPts.
function nextLineBelowY(page, line) {
  const idx = page.lines.indexOf(line);
  if (idx === -1 || idx === page.lines.length - 1) return null;
  return page.lines[idx + 1].y;
}

function makeBox(page, line, xStart, xEnd, fontHeight, maxHeightPts) {
  if (xEnd - xStart < 3) return null;
  let boxHeight = Math.max(fontHeight * 1.6, page.height * 0.014);
  // Never let a box extend past the actual vertical room available before
  // the next row starts — on a densely packed page (a numbered funds
  // table, a multi-row referee section) the generic "1.6x font height"
  // estimate routinely exceeds the real row pitch, so without this a
  // field's box silently bleeds into the label/field on the line below it.
  if (maxHeightPts != null) boxHeight = Math.min(boxHeight, Math.max(4, maxHeightPts));
  const topY = page.height - (line.y + fontHeight * 0.3) - boxHeight * 0.15;
  const fontSize = Math.min(12, Math.max(7, Math.round(fontHeight * 0.9)));
  return {
    page: page.pageNum,
    xPct: (xStart / page.width) * 100,
    yPct: (topY / page.height) * 100,
    widthPct: ((xEnd - xStart) / page.width) * 100,
    heightPct: (boxHeight / page.height) * 100,
    fontSize,
  };
}

// Trim trailing decorative connector words/punctuation ("Amount ₹ :",
// "CKYC Number (if available)") off a label before it becomes a key/box
// anchor — reuses the same connector-token logic formTextAnchor.js applies
// to its whitelisted fields, plus a matching pass for a bracketed aside.
function trimTrailingConnectors(words) {
  let end = words.length;
  while (end > 0 && /^[:\-/`₹.,()]+$/.test(words[end - 1].str.trim())) end--;
  return words.slice(0, end);
}

function uniqueKey(usedKeys, base, { rightOfColumn }) {
  if (!usedKeys.has(base)) {
    usedKeys.add(base);
    return base;
  }
  const variant = rightOfColumn ? `${base}_co_applicant` : `${base}_2`;
  if (!usedKeys.has(variant)) {
    usedKeys.add(variant);
    return variant;
  }
  let n = 3;
  while (usedKeys.has(`${base}_${n}`)) n++;
  const fallback = `${base}_${n}`;
  usedKeys.add(fallback);
  return fallback;
}

/**
 * @param {Buffer} fileBuffer
 * @returns {Promise<{ fields: object, calibrated_at: string, source: 'text-layer-generic' } | null>}
 */
export async function anchorFieldsGenerically(fileBuffer) {
  const pages = await extractPages(fileBuffer);
  const totalTextItems = pages.reduce((n, p) => n + p.lines.reduce((m, l) => m + l.items.length, 0), 0);
  if (totalTextItems < 10) return null;

  const dashedByPage = await findDashedRegions(fileBuffer);
  // Ground truth for where writable areas actually sit — same snapping the
  // whitelist anchor uses (see formTextAnchor's extractCellRects).
  const cellRectsByPage = await extractCellRects(fileBuffer);

  const fields = {};
  const usedKeys = new Set();

  for (const page of pages) {
    const hasCoCol = pageHasCoApplicantColumn(page);
    const dashedRegions = dashedByPage[page.pageNum]?.regions || [];

    // Emit one honest "paste a photo/signature here" field per dashed box,
    // named from whatever instructional text sits inside it when that
    // text is short enough to make a sane key, else a positional fallback.
    // This runs BEFORE the label loop below so the region's own text gets
    // excluded from field-labeling first (see the filter inside the loop).
    dashedRegions.forEach((region, idx) => {
      const insideText = page.lines
        .flatMap((l) => l.items)
        .filter((it) => itemInRegion(it, region, page.height))
        .sort((a, b) => b.y - a.y || a.x - b.x)
        .map((it) => it.str)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      const base = insideText && insideText.length <= 60 ? slugify(insideText) : `image_placeholder_${idx + 1}`;
      const key = uniqueKey(usedKeys, base, { rightOfColumn: region.x1 > page.width / 2 });
      fields[key] = {
        page: page.pageNum,
        xPct: (region.x1 / page.width) * 100,
        yPct: ((page.height - region.y2) / page.height) * 100,
        widthPct: ((region.x2 - region.x1) / page.width) * 100,
        heightPct: ((region.y2 - region.y1) / page.height) * 100,
        fieldType: 'image',
      };
    });

    for (const line of page.lines) {
      // Skip prose (instructions, declarations, legal text) — the same
      // classifier formFieldInventory.js's discovery report uses. Without
      // this, segmentLine() dutifully chops every sentence in the terms
      // and conditions into "label" runs at each punctuation-sized gap.
      if (classifyLine(line.text) !== 'label') continue;

      // Text sitting inside a dashed photo/signature box is instructional
      // ("PASTE LATEST PASSPORT SIZE..."), not a field label — and without
      // this filter it also gets stitched onto whatever unrelated content
      // happens to share its y-range elsewhere on the page (a checklist
      // box beside it), producing a nonsense checkbox group. Already
      // captured as the image field above; drop it here.
      const filteredItems = line.items.filter(
        (it) => !dashedRegions.some((r) => itemInRegion(it, r, page.height))
      );
      if (filteredItems.length === 0) continue;

      const words = mergeIntoWords(filteredItems);
      const gaps = words.map((w, idx) => (idx === 0 ? null : w.x - (words[idx - 1].x + words[idx - 1].width)));
      const segments = segmentLine(words, gaps);
      const fontHeight = words[0]?.height || 10;
      const nextLineY = nextLineBelowY(page, line);
      const maxHeightPts = nextLineY != null ? (line.y - nextLineY) * 0.85 : null;

      let openLabelText = null; // fallback attribution for an orphaned run

      let i = 0;
      while (i < segments.length) {
        const seg = segments[i];

        if (seg.type !== 'label') {
          // A value run with no label immediately before it on this
          // segmentation pass (e.g. resumes after a big gap on a packed
          // row) — attribute it to the most recent label seen on this line.
          if (openLabelText) placeValueSegment(openLabelText, seg, i);
          i++;
          continue;
        }

        const trimmedWords = trimTrailingConnectors(seg.words);
        if (trimmedWords.length === 0) {
          i++;
          continue;
        }
        const text = trimmedWords.map((w) => w.str).join(' ').replace(/\s+/g, ' ').trim();

        // A "label" whose only real content is a single character isn't a
        // field name — it's a footnote marker (†, #) sitting on its own
        // line, or a decorative icon glyph (a hand-pointing symbol drawn
        // via a symbol font that happens to reuse the letter "C" as its
        // codepoint, seen right before "Signature of Applicant"). Real
        // field labels are never a single bare character. Treating one as
        // a field both creates a useless field AND, since it sits right
        // next to the real label it's decorating, reliably overlaps it.
        const alnumOnly = text.replace(/[^A-Za-z0-9]/g, '');
        if (alnumOnly.length < 2) {
          i++;
          continue;
        }

        openLabelText = text;
        const labelEndX = trimmedWords[trimmedWords.length - 1].x + trimmedWords[trimmedWords.length - 1].width;

        const next = segments[i + 1];
        if (next && next.type === 'comb') {
          placeValueSegment(text, next, i);
          i += 2;
          continue;
        }
        if (next && next.type === 'option') {
          placeValueSegment(text, next, i);
          i += 2;
          continue;
        }

        // Plain text field: box spans from the label's end to whatever
        // bounds it LOCALLY — take the tightest (nearest) of every
        // applicable boundary rather than trusting a single signal, since
        // "the next segment on this line" and "the nearest column gutter"
        // can disagree (an empty in-between cell produces no segment for
        // "next" to catch, but the gutter detector still finds the real
        // boundary from the text one column further out).
        const startX = labelEndX + 3;
        const bounds = [];
        if (next) bounds.push(next.words[0].x - 3);
        const nearGapX = findNearestColumnGapX(line, labelEndX);
        if (nearGapX != null) bounds.push(nearGapX - 5);
        if (bounds.length === 0) {
          const rowGapX = findRowColumnGapX(line, labelEndX);
          bounds.push(rowGapX != null ? rowGapX - 5 : hasCoCol ? page.width / 2 : page.width - 20);
        }
        const endX = Math.min(...bounds);
        const box = makeBox(page, line, startX, endX, fontHeight, maxHeightPts);
        if (box) {
          const run = findCellRunBox(cellRectsByPage[page.pageNum], line, fontHeight, {
            startXMin: labelEndX,
            rightBoundX: endX + 6,
            pageWidth: page.width,
            labelStartX: trimmedWords[0].x,
          });
          if (run) applyCellRun(box, run, page);
          const key = uniqueKey(usedKeys, slugify(text), { rightOfColumn: startX > page.width / 2 });
          fields[key] = box;
        }
        i++;
      }

      function placeValueSegment(label, seg, segIndex) {
        const rightOfColumn = seg.words[0].x > page.width / 2;
        const base = slugify(label);

        if (seg.type === 'comb') {
          const first = seg.words[0];
          const last = seg.words[seg.words.length - 1];
          const box = makeBox(page, line, first.x, last.x + last.width, fontHeight, maxHeightPts);
          if (box) {
            const run = findCellRunBox(cellRectsByPage[page.pageNum], line, fontHeight, {
              startXMin: first.x - 3,
              rightBoundX: last.x + last.width + 8,
              pageWidth: page.width,
            });
            if (run) applyCellRun(box, run, page);
            fields[uniqueKey(usedKeys, base, { rightOfColumn })] = box;
          }
          return;
        }

        // Option run: one checkbox-shaped sub-field per option word,
        // "<label>__<option>" — same shape formTextAnchor.js's gender
        // handling already bakes as a real PDFCheckBox.
        const groupKey = uniqueKey(usedKeys, base, { rightOfColumn });
        for (const w of seg.words) {
          const size = Math.max(w.width, w.height, 8);
          const optKey = `${groupKey}__${slugify(w.str)}`;
          fields[optKey] = {
            page: page.pageNum,
            xPct: (w.x / page.width) * 100,
            yPct: ((page.height - w.y - size) / page.height) * 100,
            widthPct: (size / page.width) * 100,
            heightPct: (size / page.height) * 100,
            fontSize: 9,
            fieldType: 'checkbox',
            optionValue: w.str.trim(),
          };
        }
      }
    }
  }

  if (Object.keys(fields).length === 0) return null;
  return { fields, calibrated_at: new Date().toISOString(), source: 'text-layer-generic' };
}
