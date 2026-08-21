/**
 * Fill a blank bank application form PDF with applicant values.
 *
 * Two strategies, applied in order:
 *  1. AcroForm fields — if the PDF has real form fields, fill them by name.
 *  2. Coordinate overlay — for scanned forms (e.g. BOI), draw the values at
 *     positions from the AI-calibrated field map (percentage-based).
 */
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

/**
 * @param {object} opts
 * @param {Buffer} opts.fileBuffer - blank form PDF bytes
 * @param {object} [opts.fieldMap]  - { full_name: { page, xPct, yPct, fontSize }, ... } from calibration
 * @param {object} [opts.values]    - { full_name: 'Rajesh Kumar', ... }
 * @returns {Promise<Buffer>} filled PDF bytes
 */
export async function fillPdfForm({ fileBuffer, fieldMap = {}, values = {} }) {
  const pdf = await PDFDocument.load(fileBuffer, { updateMetadata: false });

  let filledAcroCount = 0;
  // Keys already satisfied by a real AcroForm field must not also get an
  // overlay draw below — that would double-fill (interactive value + static
  // text stacked on top of it), which baking made possible for the first time.
  const filledAcroKeys = new Set();

  // ── 1. AcroForm fields (if the PDF is a fillable form) ──
  try {
    const form = pdf.getForm();
    const acroFields = form.getFields();
    if (acroFields.length > 0) {
      const normalizedValues = {};
      for (const [key, val] of Object.entries(values)) {
        normalizedValues[key.toLowerCase().replace(/[\s-]+/g, '_')] = val;
      }
      for (const field of acroFields) {
        const name = String(field.getName() || '').trim();
        const lookupKey = name.toLowerCase().replace(/[\s-]+/g, '_');
        let value =
          values[lookupKey] ??
          values[name] ??
          normalizedValues[lookupKey] ??
          normalizedValues[name];
        if (value === undefined || value === null) value = '';
        value = String(value);
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

  // ── 2. Coordinate overlay from the AI-calibrated field map (skip anything
  //      already filled as a real AcroForm field above) ──
  const font = await pdf.embedFont(StandardFonts.Helvetica);

  let overlayCount = 0;
  for (const [key, pos] of Object.entries(fieldMap || {})) {
    if (filledAcroKeys.has(key)) continue;
    let value = values[key];
    if (value === undefined || value === null || value === '') continue;
    value = String(value);

    const pageIndex = (pos.page || 1) - 1;
    if (pageIndex < 0 || pageIndex >= pdf.getPageCount()) continue;
    const page = pdf.getPage(pageIndex);

    const { width, height } = page.getSize();
    const fontSize = pos.fontSize || 10;
    const x = (pos.xPct / 100) * width;
    // pdf-lib origin is bottom-left; calibration is top-left
    const y = height - (pos.yPct / 100) * height - fontSize;

    page.drawText(value, {
      x,
      y,
      size: fontSize,
      font,
      color: rgb(0, 0, 0),
      maxWidth: Math.max(40, width * 0.45),
    });
    overlayCount++;
  }

  const bytes = await pdf.save();
  return { buffer: Buffer.from(bytes), filledAcroCount, overlayCount };
}
