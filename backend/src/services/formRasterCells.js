/**
 * Cell detection for fully-rasterized forms (each page one scanned image —
 * Axis's home-loan form), where neither the text layer nor vector graphics
 * exist to anchor against and calibration falls back to Gemini vision.
 *
 * Gemini reliably finds the right NEIGHBORHOOD for each field but not the
 * exact pixels, so its boxes land a few points off the printed cells. The
 * printed cells, though, are visible in the scan itself: every writable
 * area is a light region enclosed by dark ruled borders. This module
 * renders each page, finds those enclosed light regions (connected
 * components of light pixels of plausible cell size), and snaps each
 * Gemini-guessed box onto the actual cells nearest to it.
 */
import { createCanvas } from '@napi-rs/canvas';
import pdfjsLibModule from 'pdfjs-dist/legacy/build/pdf.js';

const pdfjsLib = pdfjsLibModule.getDocument ? pdfjsLibModule : pdfjsLibModule.default;

class NapiCanvasFactory {
  create(w, h) {
    const canvas = createCanvas(w, h);
    return { canvas, context: canvas.getContext('2d') };
  }
  reset(cd, w, h) {
    cd.canvas.width = w;
    cd.canvas.height = h;
  }
  destroy(cd) {
    cd.canvas.width = 0;
    cd.canvas.height = 0;
  }
}

const RENDER_SCALE = 2;
const DARK_LUMA = 210; // scan pixels darker than this count as ruled-line ink
                       // (Axis's grid is a faint pink — mid-toned, not black)
const SEAL_RADIUS = 4; // dilation, px: seals the gaps in DASHED cell borders
                       // so flood fill can't leak out of a cell through them

// Separable binary dilation of the dark mask by SEAL_RADIUS in x then y.
function dilateDark(dark, width, height, r) {
  const tmp = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const row = y * width;
    let count = 0;
    for (let x = -r; x < width; x++) {
      if (x + r < width && dark[row + x + r]) count++;
      if (x - r - 1 >= 0 && dark[row + x - r - 1]) count--;
      if (x >= 0) tmp[row + x] = count > 0 ? 1 : 0;
    }
  }
  const out = new Uint8Array(width * height);
  for (let x = 0; x < width; x++) {
    let count = 0;
    for (let y = -r; y < height; y++) {
      if (y + r < height && tmp[(y + r) * width + x]) count++;
      if (y - r - 1 >= 0 && tmp[(y - r - 1) * width + x]) count--;
      if (y >= 0) out[y * width + x] = count > 0 ? 1 : 0;
    }
  }
  return out;
}

/**
 * Connected components of light pixels, 4-connective, via iterative flood
 * fill. Returns bounding boxes with fill counts. `dark` is the SEALED
 * (dilated) ink mask — light means "not sealed ink".
 */
function findLightComponents(dark, width, height) {
  const labels = new Int32Array(width * height); // 0 = unvisited
  const comps = [];
  const stack = new Int32Array(width * height);

  for (let start = 0; start < width * height; start++) {
    if (labels[start] !== 0 || dark[start]) continue;
    const compId = comps.length + 1;
    let sp = 0;
    stack[sp++] = start;
    labels[start] = compId;
    let minX = width, maxX = 0, minY = height, maxY = 0, count = 0;
    while (sp > 0) {
      const idx = stack[--sp];
      const x = idx % width;
      const y = (idx / width) | 0;
      count++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (x > 0 && labels[idx - 1] === 0 && !dark[idx - 1]) { labels[idx - 1] = compId; stack[sp++] = idx - 1; }
      if (x < width - 1 && labels[idx + 1] === 0 && !dark[idx + 1]) { labels[idx + 1] = compId; stack[sp++] = idx + 1; }
      if (y > 0 && labels[idx - width] === 0 && !dark[idx - width]) { labels[idx - width] = compId; stack[sp++] = idx - width; }
      if (y < height - 1 && labels[idx + width] === 0 && !dark[idx + width]) { labels[idx + width] = compId; stack[sp++] = idx + width; }
    }
    comps.push({ minX, maxX, minY, maxY, count });
  }
  return comps;
}

/**
 * Detect writable cells on every page of a rasterized PDF.
 * @param {Buffer} fileBuffer
 * @returns {Promise<Record<number, Array<{x1:number,y1:number,x2:number,y2:number}>>>}
 *   cells per page in PDF space (points, origin bottom-left) — the same
 *   shape formTextAnchor's extractCellRects returns.
 */
export async function detectRasterCellRects(fileBuffer) {
  const doc = await pdfjsLib.getDocument({
    data: new Uint8Array(fileBuffer),
    isEvalSupported: false,
    disableFontFace: true,
    canvasFactory: new NapiCanvasFactory(),
  }).promise;

  const cellsByPage = {};
  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    const page = await doc.getPage(pageNum);
    const pdfViewport = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: RENDER_SCALE });
    const w = Math.ceil(viewport.width);
    const h = Math.ceil(viewport.height);
    const canvas = createCanvas(w, h);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, w, h);
    await page.render({ canvasContext: ctx, viewport }).promise;

    const { data } = ctx.getImageData(0, 0, w, h);
    const dark = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) {
      const lum = (data[i * 4] * 3 + data[i * 4 + 1] * 4 + data[i * 4 + 2]) >> 3;
      dark[i] = lum < DARK_LUMA ? 1 : 0;
    }
    // Seal the gaps in dashed cell borders so a cell's interior can't
    // flood out through them; the resulting boxes are compensated below.
    const sealed = dilateDark(dark, w, h, SEAL_RADIUS);

    const comps = findLightComponents(sealed, w, h);
    const cells = [];
    for (const c of comps) {
      // Undo the dilation's shrink of each interior.
      const minX = c.minX - SEAL_RADIUS;
      const maxX = c.maxX + SEAL_RADIUS;
      const minY = c.minY - SEAL_RADIUS;
      const maxY = c.maxY + SEAL_RADIUS;
      const cw = maxX - minX + 1;
      const ch = maxY - minY + 1;
      // Plausible writable-cell interior at RENDER_SCALE: a single comb
      // square up to a full-width input strip; not a glyph counter (the
      // hole in an "o"), not the page background.
      if (cw < 12 || ch < 12) continue;
      if (ch > 34 * RENDER_SCALE) continue;
      if (cw > 470 * RENDER_SCALE) continue;
      // Mostly-solid region — a genuine open cell, not a sprawling snake
      // of background threading between paragraphs. The count is from the
      // ERODED interior, so compare against the eroded bbox area, and
      // loosely: pre-printed placeholder glyphs inside a cell (a DOB row's
      // "D D M M Y") eat into the count after they're dilated too.
      const erodedArea = (c.maxX - c.minX + 1) * (c.maxY - c.minY + 1);
      if (c.count / erodedArea < 0.4) continue;
      const sx = pdfViewport.width / w;
      const sy = pdfViewport.height / h;
      cells.push({
        x1: Math.max(0, minX) * sx,
        x2: Math.min(w, maxX + 1) * sx,
        // bitmap origin top-left -> PDF origin bottom-left
        y1: pdfViewport.height - Math.min(h, maxY + 1) * sy,
        y2: pdfViewport.height - Math.max(0, minY) * sy,
      });
    }
    cellsByPage[pageNum] = cells;
    await page.cleanup();
  }
  await doc.destroy();
  return cellsByPage;
}

/** True when a page is one flat scan with nothing to anchor against. */
export async function pdfIsRasterOnly(fileBuffer) {
  const doc = await pdfjsLib.getDocument({
    data: new Uint8Array(fileBuffer),
    isEvalSupported: false,
    disableFontFace: true,
  }).promise;
  let textItems = 0;
  const pagesToCheck = Math.min(doc.numPages, 3);
  for (let p = 1; p <= pagesToCheck; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    textItems += tc.items.length;
    await page.cleanup();
  }
  await doc.destroy();
  return textItems < 10;
}

const ROW_TOLERANCE_PT = 14; // how far off Gemini's vertical guess may be
const RUN_GAP_PT = 10; // bridges the small divider between sub-groups on one
                       // row (Title box | Name cells) without crossing the
                       // much wider Applicant/Co-applicant gutter

/**
 * Snap a Gemini-calibrated field map onto raster-detected cells, in place.
 * Each field's box is replaced by the union of the detected cells its
 * guess overlaps (after picking the cell ROW nearest the guess's vertical
 * center). Boxes with no believable cells nearby are left untouched.
 * @returns {number} how many fields were snapped
 */
export function snapFieldMapToRasterCells(fields, cellsByPage, pageSizes) {
  let snapped = 0;
  for (const pos of Object.values(fields)) {
    if (!pos || typeof pos !== 'object') continue;
    if (pos.fieldType === 'image') continue;
    const cells = cellsByPage[pos.page || 1];
    const size = pageSizes[pos.page || 1];
    if (!cells || cells.length === 0 || !size) continue;

    const bx1 = (pos.xPct / 100) * size.width;
    const bw = ((pos.widthPct || 5) / 100) * size.width;
    const bx2 = bx1 + bw;
    const bh = ((pos.heightPct || 2) / 100) * size.height;
    const byTop = size.height - (pos.yPct / 100) * size.height; // PDF space
    const byCenter = byTop - bh / 2;

    // Candidate rows: cells whose vertical center is near the guess's.
    const near = cells.filter((c) => Math.abs((c.y1 + c.y2) / 2 - byCenter) <= ROW_TOLERANCE_PT + bh / 2);
    if (near.length === 0) continue;

    // Group into rows by vertical center, pick the row nearest the guess.
    const rows = [];
    for (const c of near.sort((a, b) => (b.y1 + b.y2) - (a.y1 + a.y2))) {
      const cy = (c.y1 + c.y2) / 2;
      const row = rows.find((r) => Math.abs(r.cy - cy) < 5);
      if (row) {
        row.cells.push(c);
        row.cy = (row.cy * (row.cells.length - 1) + cy) / row.cells.length;
      } else {
        rows.push({ cy, cells: [c] });
      }
    }
    // Score rows by how much of the guessed box's vertical extent they
    // cover — a guess that straddles its own row plus a neighbor still
    // overlaps its own row the most. Center distance only breaks ties.
    const byBottom = byTop - bh;
    for (const r of rows) {
      const bandY1 = Math.min(...r.cells.map((c) => c.y1));
      const bandY2 = Math.max(...r.cells.map((c) => c.y2));
      r.overlap = Math.max(0, Math.min(bandY2, byTop) - Math.max(bandY1, byBottom));
    }
    rows.sort((a, b) => (b.overlap - a.overlap) || (Math.abs(a.cy - byCenter) - Math.abs(b.cy - byCenter)));
    const row = rows[0];

    // Same-height cells only: a stray tall region (the two-sub-row blank
    // area beside a "License / Expiry" pair) must not stretch the run.
    const rowHeights = row.cells.map((c) => c.y2 - c.y1).sort((a, b) => a - b);
    const medH = rowHeights[Math.floor(rowHeights.length / 2)];
    const rowCells = row.cells.filter((c) => c.y2 - c.y1 <= medH * 1.6);

    // Within that row: the cells the guessed box horizontally overlaps.
    const overlapping = rowCells
      .filter((c) => Math.min(c.x2, bx2) - Math.max(c.x1, bx1) > Math.min(6, (c.x2 - c.x1) * 0.3))
      .sort((a, b) => a.x1 - b.x1);
    if (overlapping.length === 0) continue;

    // Split into contiguous runs (a gap wider than RUN_GAP_PT is a real
    // divider) and take the WIDEST one — the guess often also overlaps a
    // leading checkbox or title sub-box ("PAN Card ☐ Form 60 ☐" before the
    // actual comb cells), and the writable input is the long run, not the
    // stray first cell.
    const runs = [[overlapping[0]]];
    for (let i = 1; i < overlapping.length; i++) {
      const cur = runs[runs.length - 1];
      if (overlapping[i].x1 - cur[cur.length - 1].x2 > RUN_GAP_PT) runs.push([overlapping[i]]);
      else cur.push(overlapping[i]);
    }
    runs.sort((a, b) => (b[b.length - 1].x2 - b[0].x1) - (a[a.length - 1].x2 - a[0].x1));
    const run = runs[0];

    // Never carry the snapped box far past what Gemini actually indicated —
    // a row whose cells continue contiguously across the page (a full-width
    // comb strip) must not balloon the box to several times its guess.
    const x1 = Math.max(run[0].x1, bx1 - 25);
    const x2 = Math.min(run[run.length - 1].x2, bx2 + 25);
    let y1 = Math.min(...run.map((c) => c.y1));
    let y2 = Math.max(...run.map((c) => c.y2));
    // A tall stray region in the run (a crossed/masked cell block spanning
    // sub-rows) must not double the box height — clamp to the run's median
    // band when the union is much taller than a typical cell in it.
    const hs = run.map((c) => c.y2 - c.y1).sort((a, b) => a - b);
    const medRunH = hs[Math.floor(hs.length / 2)];
    if (y2 - y1 > medRunH * 1.8) {
      const y1s = run.map((c) => c.y1).sort((a, b) => a - b);
      const y2s = run.map((c) => c.y2).sort((a, b) => a - b);
      y1 = y1s[Math.floor(y1s.length / 2)];
      y2 = y2s[Math.floor(y2s.length / 2)];
    }
    if (x2 - x1 < 5 || y2 - y1 < 4) continue;

    pos.xPct = (x1 / size.width) * 100;
    pos.widthPct = ((x2 - x1) / size.width) * 100;
    pos.yPct = ((size.height - y2) / size.height) * 100;
    pos.heightPct = ((y2 - y1) / size.height) * 100;
    pos.fontSize = Math.min(12, Math.max(7, Math.round((y2 - y1 - 3) * 0.9)));
    snapped++;
  }
  return snapped;
}

/**
 * Detected cells merged into row-runs and shaped as Draw Fields editor
 * suggestions ({ key: {page, xPct, yPct, widthPct, heightPct} }) — for
 * raster forms where the text-layer generic anchor has nothing to work
 * with. One suggestion per contiguous cell run, not per cell, so a comb
 * row shows as one clickable strip instead of forty tiny boxes.
 */
export function rasterCellRunsAsSuggestions(cellsByPage, pageSizes) {
  const suggestions = {};
  for (const [pageNum, cells] of Object.entries(cellsByPage)) {
    const size = pageSizes[pageNum];
    if (!size || !cells.length) continue;

    // Group into rows by vertical center, then split each row at real gaps.
    const rows = [];
    for (const c of [...cells].sort((a, b) => (b.y1 + b.y2) - (a.y1 + a.y2))) {
      const cy = (c.y1 + c.y2) / 2;
      const row = rows.find((r) => Math.abs(r.cy - cy) < 5);
      if (row) row.cells.push(c);
      else rows.push({ cy, cells: [c] });
    }

    let n = 0;
    for (const row of rows) {
      const sorted = row.cells.sort((a, b) => a.x1 - b.x1);
      let run = [sorted[0]];
      const flush = () => {
        const x1 = run[0].x1;
        const x2 = run[run.length - 1].x2;
        const y1 = Math.min(...run.map((c) => c.y1));
        const y2 = Math.max(...run.map((c) => c.y2));
        if (x2 - x1 >= 8 && y2 - y1 >= 5) {
          suggestions[`p${pageNum}_row${++n}`] = {
            page: Number(pageNum),
            xPct: (x1 / size.width) * 100,
            yPct: ((size.height - y2) / size.height) * 100,
            widthPct: ((x2 - x1) / size.width) * 100,
            heightPct: ((y2 - y1) / size.height) * 100,
          };
        }
      };
      for (let i = 1; i < sorted.length; i++) {
        if (sorted[i].x1 - run[run.length - 1].x2 > RUN_GAP_PT) { flush(); run = [sorted[i]]; }
        else run.push(sorted[i]);
      }
      flush();
    }
  }
  return suggestions;
}

/** Page sizes in PDF points, 1-indexed. */
export async function getPageSizes(fileBuffer) {
  const doc = await pdfjsLib.getDocument({
    data: new Uint8Array(fileBuffer),
    isEvalSupported: false,
    disableFontFace: true,
  }).promise;
  const sizes = {};
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const vp = page.getViewport({ scale: 1 });
    sizes[p] = { width: vp.width, height: vp.height };
    await page.cleanup();
  }
  await doc.destroy();
  return sizes;
}
