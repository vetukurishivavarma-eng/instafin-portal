/**
 * Round-trip for user-filled AcroForm PDFs.
 *
 * The baking pipeline (formAcroBaker.js) turns a blank scanned bank form
 * into a fillable PDF with real AcroForm fields named by canonical key
 * ("full_name", "gender__M", ...). A user types into that PDF in any
 * viewer, saves it, and uploads it back. This module closes the loop:
 *
 *   extractFormValues(buffer)  -> plain { key: value } object for DB storage
 *   flattenPdfForm(buffer)     -> print-ready PDF with the typed values
 *                                 painted into the page content and the
 *                                 form fields removed (no longer editable)
 */
import { PDFDocument, StandardFonts, PDFTextField, PDFCheckBox } from 'pdf-lib';
import { sanitizeForWinAnsi } from './formFiller.js';

/**
 * Read every AcroForm field value out of a filled PDF.
 *
 * Checkbox groups baked as "base__option" (gender__M, gender__F, ...) are
 * folded back into their base key: the checked option's token becomes the
 * value ("gender": "M"). Multiple checked options in one group join with
 * ", " rather than losing data. Plain checkboxes (no "__") become booleans.
 *
 * @param {Buffer} fileBuffer - the user-filled PDF
 * @returns {Promise<{ values: object, fieldCount: number }>}
 */
export async function extractFormValues(fileBuffer) {
  const pdf = await PDFDocument.load(fileBuffer, { updateMetadata: false });
  let form;
  try {
    form = pdf.getForm();
  } catch {
    return { values: {}, fieldCount: 0 };
  }

  const values = {};
  let fieldCount = 0;

  for (const field of form.getFields()) {
    const name = field.getName();
    fieldCount++;

    if (field instanceof PDFTextField) {
      const text = (field.getText() || '').trim();
      if (text) values[name] = text;
      continue;
    }

    if (field instanceof PDFCheckBox) {
      const sep = name.indexOf('__');
      if (sep > 0) {
        if (!field.isChecked()) continue;
        const base = name.slice(0, sep);
        const option = name.slice(sep + 2);
        values[base] = values[base] ? `${values[base]}, ${option}` : option;
      } else {
        values[name] = field.isChecked();
      }
    }
    // Other field types (dropdowns, radio groups) don't occur in baked
    // forms today; add handling here if a future baker emits them.
  }

  return { values, fieldCount };
}

/**
 * Flatten a filled PDF: regenerate field appearances so the typed text is
 * guaranteed painted (viewers sometimes save value-without-appearance),
 * then merge every field into the page content and remove the form. The
 * result prints exactly as filled and can no longer be edited.
 *
 * Typed values are sanitized to WinAnsi first — Helvetica (the baked
 * font) cannot encode ₹ and other non-Latin-1 characters, and an
 * unsanitized value would make appearance regeneration throw and abort
 * the whole flatten.
 *
 * A PDF with no AcroForm at all is returned unchanged (already flat).
 *
 * @param {Buffer} fileBuffer
 * @returns {Promise<Buffer>}
 */
export async function flattenPdfForm(fileBuffer) {
  const pdf = await PDFDocument.load(fileBuffer, { updateMetadata: false });
  let form;
  try {
    form = pdf.getForm();
  } catch {
    return fileBuffer;
  }
  if (form.getFields().length === 0) return fileBuffer;

  const font = await pdf.embedFont(StandardFonts.Helvetica);

  for (const field of form.getFields()) {
    if (field instanceof PDFTextField) {
      const text = field.getText();
      if (text) {
        try {
          field.setText(sanitizeForWinAnsi(text));
        } catch (err) {
          console.warn(`Could not sanitize field "${field.getName()}" for flatten:`, err.message);
        }
      }
    }
  }

  form.updateFieldAppearances(font);
  form.flatten();

  const bytes = await pdf.save();
  return Buffer.from(bytes);
}
