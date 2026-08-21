/**
 * Turn a scanned/flat bank form PDF into a genuinely fillable AcroForm PDF by
 * creating real text fields at the positions detected by calibration
 * (services/formCalibrator.js — Gemini Vision, run once per form by an admin).
 *
 * Baking real fields means filling later never needs an LLM call and never
 * guesses text placement at fill-time: formFiller.js's AcroForm strategy
 * (pdf-lib field.setText()) handles it deterministically, and the same PDF
 * can also be opened and filled by hand in any PDF reader.
 */
import { PDFDocument, StandardFonts, rgb, PDFName, PDFString } from 'pdf-lib';

// Resource name the baked fields' /DA strings refer to, registered once in
// the AcroForm's /DR (default resources) font dictionary.
const FONT_RESOURCE_NAME = 'Helv';

/**
 * @param {object} opts
 * @param {Buffer} opts.fileBuffer - blank form PDF bytes (the original scan)
 * @param {object} opts.fieldMap   - { full_name: { page, xPct, yPct, fontSize }, ... }
 * @returns {Promise<{ buffer: Buffer, createdCount: number }>}
 */
export async function bakeAcroFormFields({ fileBuffer, fieldMap = {} }) {
  const pdf = await PDFDocument.load(fileBuffer, { updateMetadata: false });
  const form = pdf.getForm();
  const font = await pdf.embedFont(StandardFonts.Helvetica);

  let createdCount = 0;
  const fontSizeByKey = {};
  for (const [key, pos] of Object.entries(fieldMap)) {
    if (!pos || typeof pos !== 'object') continue;

    const pageIndex = (pos.page || 1) - 1;
    if (pageIndex < 0 || pageIndex >= pdf.getPageCount()) continue;
    const page = pdf.getPage(pageIndex);
    const { width, height } = page.getSize();

    const fontSize = Math.min(12, Math.max(7, pos.fontSize || 10));
    const boxHeight = fontSize + 6;
    const x = (pos.xPct / 100) * width;
    // Calibration is top-left origin; pdf-lib page coordinates are bottom-left.
    // Sit the box just under the calibrated point so it lines up with the label.
    const y = Math.max(0, height - (pos.yPct / 100) * height - boxHeight);
    const boxWidth = Math.min(width - x - 8, Math.max(80, width * 0.38));
    if (boxWidth <= 0) continue;

    // Re-baking (recalibration) must not collide with a previously baked field.
    const existing = form.getFieldMaybe(key);
    if (existing) form.removeField(existing);

    try {
      const field = form.createTextField(key);
      field.addToPage(page, {
        x,
        y,
        width: boxWidth,
        height: boxHeight,
        font,
        textColor: rgb(0, 0, 0),
        borderWidth: 0,
        // Explicitly undefined (not omitted) so pdf-lib's "fill in a default
        // if the key is missing" logic doesn't paint a white rectangle over
        // the original scanned label/lines underneath the field.
        backgroundColor: undefined,
      });
      field.setFontSize(fontSize);
      fontSizeByKey[key] = fontSize;
      createdCount++;
    } catch (err) {
      console.warn(`Failed to bake AcroForm field "${key}":`, err.message);
    }
  }

  // Generate appearance streams so the fields render correctly (blank, but
  // properly boxed) in every PDF viewer, not just ones that support NeedAppearances.
  form.updateFieldAppearances(font);

  // pdf-lib doesn't set the AcroForm-level /DR (default resources) or /DA
  // (default appearance) when fields are created programmatically. Without
  // those, several PDF viewers — Adobe Acrobat/Reader in particular — have
  // no font to fall back on when the user actually types into a field, and
  // the field ends up present in the file but not truly editable. Set both
  // explicitly, plus a per-field /DA carrying that field's own font size.
  const acroFormDict = form.acroForm.dict;
  acroFormDict.set(
    PDFName.of('DR'),
    pdf.context.obj({ Font: pdf.context.obj({ [FONT_RESOURCE_NAME]: font.ref }) })
  );
  acroFormDict.set(PDFName.of('DA'), PDFString.of(`/${FONT_RESOURCE_NAME} 10 Tf 0 g`));

  for (const field of form.getFields()) {
    const size = fontSizeByKey[field.getName()] || 10;
    field.acroField.dict.set(PDFName.of('DA'), PDFString.of(`/${FONT_RESOURCE_NAME} ${size} Tf 0 g`));
  }

  const bytes = await pdf.save();
  return { buffer: Buffer.from(bytes), createdCount };
}
