/**
 * Fill a blank bank application form PDF with applicant values.
 *
 * Two strategies, applied in order:
 *  1. AcroForm fields — if the PDF has real form fields, fill them by name.
 *  2. Coordinate overlay — for scanned forms (e.g. BOI), draw the values at
 *     positions from the AI-calibrated field map (percentage-based).
 */
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

// Letter -> word a checkbox-group option token might represent, for matching
// against a plain value like "Male" against a baked field named "gender__M".
const CHECKBOX_OPTION_WORDS = { M: 'male', F: 'female', T: 'third', O: 'other', Y: 'yes', N: 'no' };

function checkboxOptionMatchesValue(optionToken, value) {
  const v = String(value).trim().toLowerCase();
  if (!v) return false;
  const token = optionToken.toLowerCase();
  if (v === token) return true;
  const word = CHECKBOX_OPTION_WORDS[optionToken.toUpperCase()];
  return word ? v === word || v.startsWith(word) || v[0] === token : v[0] === token;
}

// The standard 14 fonts (Helvetica etc.) can only encode WinAnsi — a value
// containing ₹ (or any other character outside that codepage, e.g. from a
// Gemini-extracted document) throws and aborts the whole fill request.
// Replacing the handful of characters Indian financial documents actually
// produce keeps fill deterministic instead of failing form-wide on one field.
export function sanitizeForWinAnsi(value) {
  return String(value)
    .replace(/₹/g, 'Rs. ')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    // eslint-disable-next-line no-control-regex
    .replace(/[^\x00-\xFF]/g, '?');
}

// A photo upload or a drawn signature arrives as a data URL from the portal's
// fill UI ("data:image/png;base64,...") — or, from an API caller, as bare
// base64. Anything that isn't actually PNG/JPEG bytes is rejected here rather
// than blowing up the whole fill.
const IMAGE_DATA_URL = /^data:image\/(png|jpe?g);base64,/i;

function parseImageValue(value) {
  if (typeof value !== 'string' || value.length < 64) return null;
  const match = value.match(IMAGE_DATA_URL);
  const base64 = match ? value.slice(match[0].length) : value;
  let bytes;
  try {
    bytes = Buffer.from(base64.replace(/\s+/g, ''), 'base64');
  } catch {
    return null;
  }
  if (bytes.length < 64) return null;
  // Trust the actual magic bytes, not the declared mime type — a plain text
  // value can survive a loose base64 decode, and this is what stops it.
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return { bytes, kind: 'png' };
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return { bytes, kind: 'jpg' };
  return null;
}

/**
 * @param {object} opts
 * @param {Buffer} opts.fileBuffer - blank form PDF bytes
 * @param {object} [opts.fieldMap]  - { full_name: { page, xPct, yPct, fontSize }, ... } from calibration
 * @param {object} [opts.values]    - { full_name: 'Rajesh Kumar', signature_of_applicant: 'data:image/png;base64,...', ... }
 * @returns {Promise<{ buffer: Buffer, filledAcroCount: number, overlayCount: number, imageCount: number }>}
 */
export async function fillPdfForm({ fileBuffer, fieldMap = {}, values = {} }) {
  const pdf = await PDFDocument.load(fileBuffer, { updateMetadata: false });

  let form = null;
  let filledAcroCount = 0;
  // Keys already satisfied by a real AcroForm field must not also get an
  // overlay draw below — that would double-fill (interactive value + static
  // text stacked on top of it), which baking made possible for the first time.
  const filledAcroKeys = new Set();

  // ── 1. AcroForm fields (if the PDF is a fillable form) ──
  try {
    form = pdf.getForm();
    const acroFields = form.getFields();
    if (acroFields.length > 0) {
      const normalizedValues = {};
      for (const [key, val] of Object.entries(values)) {
        normalizedValues[key.toLowerCase().replace(/[\s-]+/g, '_')] = val;
      }
      for (const field of acroFields) {
        const name = String(field.getName() || '').trim();

        // Photo/signature widgets are baked as buttons — they take image
        // bytes, not text. Handled by their own pass below.
        if (field.constructor.name === 'PDFButton') continue;

        // Checkbox-group option field, e.g. "gender__M" — baked by
        // formTextAnchor's gender M/F/T detection. Resolve against the
        // plain base key's value ("gender": "Male"), not a field named
        // "gender__M" directly (the incoming values never use that name).
        const groupMatch = name.match(/^(.+)__([A-Za-z]+)$/);
        if (groupMatch && field.constructor.name === 'PDFCheckBox') {
          const [, baseKey, optionToken] = groupMatch;
          const baseValue = values[baseKey] ?? normalizedValues[baseKey.toLowerCase()];
          if (baseValue && checkboxOptionMatchesValue(optionToken, baseValue)) {
            try {
              field.check();
              filledAcroCount++;
              filledAcroKeys.add(baseKey);
            } catch { /* read-only or incompatible — skip */ }
          }
          continue;
        }

        const lookupKey = name.toLowerCase().replace(/[\s-]+/g, '_');
        let value =
          values[lookupKey] ??
          values[name] ??
          normalizedValues[lookupKey] ??
          normalizedValues[name];
        if (value === undefined || value === null) value = '';
        value = sanitizeForWinAnsi(value);
        if (!value) continue;
        try {
          if (field.constructor.name === 'PDFCheckBox') {
            // Only tick checkboxes for boolean-ish values
            if (value === 'true' || value === 'yes' || value === '1') field.check();
          } else if (field.constructor.name === 'PDFRadioGroup') {
            try {
              const opts = field.getOptions().map(o => o.display);
              const match = opts.find(o => o && o.toLowerCase().includes(value.toLowerCase()));
              if (match) field.select(match);
            } catch { /* skip radio groups that can't be matched */ }
          } else {
            field.setText(value);
          }
          filledAcroCount++;
          filledAcroKeys.add(lookupKey);
          filledAcroKeys.add(name);
        } catch (err) {
          // Some fields are read-only or incompatible — skip silently
        }
      }
    }
  } catch (err) {
    console.warn('AcroForm fill skipped:', err.message);
  }

  // ── 2. Photo / signature boxes ──
  // Stamped straight onto the page rather than into the baked button's
  // appearance, so the picture is visible in every viewer (and in print)
  // whether or not the reader supports form widgets. The baked button is
  // removed first so an empty widget can't sit on top of the image.
  let imageCount = 0;
  for (const [key, pos] of Object.entries(fieldMap || {})) {
    if (!pos || pos.fieldType !== 'image') continue;
    const parsed = parseImageValue(values[key]);
    if (!parsed) continue;

    const pageIndex = (pos.page || 1) - 1;
    if (pageIndex < 0 || pageIndex >= pdf.getPageCount()) continue;
    if (!Number.isFinite(pos.widthPct) || !Number.isFinite(pos.heightPct)) continue;

    const page = pdf.getPage(pageIndex);
    const { width, height } = page.getSize();
    const boxWidth = (pos.widthPct / 100) * width;
    const boxHeight = (pos.heightPct / 100) * height;
    if (boxWidth <= 1 || boxHeight <= 1) continue;

    try {
      const image = parsed.kind === 'png' ? await pdf.embedPng(parsed.bytes) : await pdf.embedJpg(parsed.bytes);

      if (form) {
        const baked = form.getFieldMaybe(key);
        if (baked) {
          try {
            form.removeField(baked);
          } catch { /* leave it: an empty transparent widget is harmless */ }
        }
      }

      // Fit inside the printed frame without distorting the face on a photo
      // or the slant of a signature, and centre whatever margin is left.
      const scale = Math.min(boxWidth / image.width, boxHeight / image.height);
      const drawWidth = image.width * scale;
      const drawHeight = image.height * scale;
      const boxLeft = (pos.xPct / 100) * width;
      const boxBottom = height - (pos.yPct / 100) * height - boxHeight;
      page.drawImage(image, {
        x: boxLeft + (boxWidth - drawWidth) / 2,
        y: boxBottom + (boxHeight - drawHeight) / 2,
        width: drawWidth,
        height: drawHeight,
      });
      imageCount++;
    } catch (err) {
      console.warn(`Failed to place image for "${key}":`, err.message);
    }
  }

  // ── 3. Coordinate overlay from the calibrated field map (skip anything
  //      already filled as a real AcroForm field above) ──
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const MIN_OVERLAY_FONT_SIZE = 6;

  let overlayCount = 0;
  for (const [key, pos] of Object.entries(fieldMap || {})) {
    if (filledAcroKeys.has(key)) continue;
    if (pos.fieldType === 'image') continue; // a photo/signature box, not text
    let value = values[key];
    if (value === undefined || value === null || value === '') continue;
    value = sanitizeForWinAnsi(value);
    if (!value) continue;

    const pageIndex = (pos.page || 1) - 1;
    if (pageIndex < 0 || pageIndex >= pdf.getPageCount()) continue;
    const page = pdf.getPage(pageIndex);

    const { width, height } = page.getSize();
    const x = (pos.xPct / 100) * width;

    const hasBox = Number.isFinite(pos.widthPct) && Number.isFinite(pos.heightPct) && pos.widthPct > 0;
    let fontSize;
    let boxWidth;
    let y;

    if (hasBox) {
      // A real anchored box (text-layer match or a manually drawn rectangle)
      // is known, so shrink the font to the value's actual rendered width
      // instead of guessing a page-relative maxWidth that has no relation to
      // the box the label actually sits next to.
      boxWidth = (pos.widthPct / 100) * width;
      const boxHeight = (pos.heightPct / 100) * height;
      fontSize = Math.min(pos.fontSize || 10, Math.max(MIN_OVERLAY_FONT_SIZE, boxHeight - 2));
      while (fontSize > MIN_OVERLAY_FONT_SIZE && font.widthOfTextAtSize(value, fontSize) > boxWidth) {
        fontSize -= 0.5;
      }
      // pdf-lib origin is bottom-left; calibration is top-left. Center the
      // text vertically within the drawn box rather than assuming the box
      // height equals the font size.
      const topY = height - (pos.yPct / 100) * height;
      y = topY - boxHeight + Math.max(0, (boxHeight - fontSize) / 2);
    } else {
      // Older single-point calibration with no known box size — fall back to
      // the previous generic heuristic (page-relative max width).
      fontSize = pos.fontSize || 10;
      boxWidth = Math.max(40, width * 0.45);
      y = height - (pos.yPct / 100) * height - fontSize;
    }

    try {
      page.drawText(value, {
        x,
        y,
        size: fontSize,
        font,
        color: rgb(0, 0, 0),
        maxWidth: boxWidth,
      });
      overlayCount++;
    } catch (err) {
      // A single bad value (still-unencodable char, corrupt page, etc.) must
      // not abort the whole fill — one skipped field beats a hard 500.
      console.warn(`Failed to draw overlay value for "${key}":`, err.message);
    }
  }

  const bytes = await pdf.save();
  return { buffer: Buffer.from(bytes), filledAcroCount, overlayCount, imageCount };
}
