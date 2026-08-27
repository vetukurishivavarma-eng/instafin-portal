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

/**
 * Give a widget an EMPTY appearance stream so the field is present, named
 * and fillable, but paints nothing over the form underneath it.
 *
 * pdf-lib always gives a button a background (addToPage falls back to grey
 * whenever backgroundColor is omitted OR explicitly undefined), which on a
 * scanned form means a grey slab where the printed "paste photograph here"
 * frame used to be. An empty appearance keeps the printed frame visible and
 * the field targetable; formFiller.js replaces this stream with the actual
 * uploaded photo or drawn signature via setImage().
 */
function makeWidgetTransparent(pdf, field) {
  for (const widget of field.acroField.getWidgets()) {
    const rect = widget.getRectangle();
    const empty = pdf.context.formXObject([], {
      BBox: pdf.context.obj([0, 0, rect.width, rect.height]),
      Matrix: pdf.context.obj([1, 0, 0, 1, 0, 0]),
      Resources: pdf.context.obj({}),
    });
    widget.setNormalAppearance(pdf.context.register(empty));
    widget.dict.delete(PDFName.of('MK'));
  }
}

// Resource name the baked fields' /DA strings refer to, registered once in
// the AcroForm's /DR (default resources) font dictionary.
const FONT_RESOURCE_NAME = 'Helv';

// A key like "gender__M" is one option of a checkbox group (baked by
// formTextAnchor's label + option-token detection: base key, double
// underscore, option token). Classify from the key shape itself rather than
// trusting an upstream pos.fieldType, so any authoring path (text-anchor
// today, a future one tomorrow) that emits this key shape gets baked as a
// real checkbox without every caller having to remember to set fieldType.
const CHECKBOX_GROUP_KEY = /^.+__[A-Za-z0-9]+$/;

function classifyFieldType(key, pos) {
  if (pos.fieldType === 'checkbox') return 'checkbox';
  if (pos.fieldType === 'image') return 'image';
  if (CHECKBOX_GROUP_KEY.test(key)) return 'checkbox';
  return 'text';
}

/**
 * @param {object} opts
 * @param {Buffer} opts.fileBuffer - blank form PDF bytes (the original scan)
 * @param {object} opts.fieldMap   - { full_name: { page, xPct, yPct, fontSize, widthPct?, heightPct? }, ... }
 *   xPct/yPct are always the box's TOP-LEFT corner, as a percentage of page
 *   width/height (0-100, origin top-left — matches how the page is normally
 *   viewed, not PDF's native bottom-left coordinate space).
 *   widthPct/heightPct (also page-relative percentages) give the box's exact
 *   drawn size — pass these when a human traced the real field on the
 *   rendered page (pixel-accurate). Omit them for the older AI-estimated
 *   single-point calibration, which falls back to a heuristic box size.
 * @returns {Promise<{ buffer: Buffer, createdCount: number }>}
 */
export async function bakeAcroFormFields({ fileBuffer, fieldMap = {} }) {
  const pdf = await PDFDocument.load(fileBuffer, { updateMetadata: false });
  const form = pdf.getForm();
  const font = await pdf.embedFont(StandardFonts.Helvetica);

  // Recalibration bakes onto the previously baked file (the pristine
  // original isn't kept), so a field the NEW map no longer emits — a key
  // dropped or renamed since last time — would silently survive at its old,
  // possibly wrong position. Baking always expresses the full current
  // calibration, so start from zero fields, not just replace-by-key.
  for (const field of [...form.getFields()]) {
    try {
      form.removeField(field);
    } catch (err) {
      console.warn(`Could not remove stale field "${field.getName()}":`, err.message);
    }
  }

  let createdCount = 0;
  const fontSizeByKey = {};
  const imageFieldKeys = [];
  for (const [key, pos] of Object.entries(fieldMap)) {
    if (!pos || typeof pos !== 'object') continue;

    const pageIndex = (pos.page || 1) - 1;
    if (pageIndex < 0 || pageIndex >= pdf.getPageCount()) continue;
    const page = pdf.getPage(pageIndex);
    const { width, height } = page.getSize();

    const hasExplicitBox = Number.isFinite(pos.widthPct) && Number.isFinite(pos.heightPct);
    const boxWidth = hasExplicitBox
      ? Math.max(4, (pos.widthPct / 100) * width)
      : Math.min(width - (pos.xPct / 100) * width - 8, Math.max(80, width * 0.38));
    const boxHeight = hasExplicitBox
      ? Math.max(4, (pos.heightPct / 100) * height)
      : Math.min(12, Math.max(7, pos.fontSize || 10)) + 6;
    const fontSize = hasExplicitBox
      ? Math.min(14, Math.max(6, boxHeight - 4))
      : Math.min(12, Math.max(7, pos.fontSize || 10));
    const x = (pos.xPct / 100) * width;
    // Calibration/drawing is top-left origin; pdf-lib page coordinates are
    // bottom-left. Sit the box's top edge at the calibrated/drawn point.
    const y = Math.max(0, height - (pos.yPct / 100) * height - boxHeight);
    if (boxWidth <= 0) continue;

    // Re-baking (recalibration) must not collide with a previously baked field.
    const existing = form.getFieldMaybe(key);
    if (existing) form.removeField(existing);

    const fieldType = classifyFieldType(key, pos);

    // "Paste a photo/signature here" isn't a text or checkbox value at
    // all — filling it for real means embedding actual image bytes at
    // this position (pdf-lib page.drawImage with a supplied photo), a
    // different operation this module doesn't do. Leave the dashed box as
    // printed rather than bake a field with nothing meaningful to put in it.
    try {
      if (fieldType === 'image') {
        // A photo frame or a signature strip. Baked as a real (transparent)
        // button field so it has a name, a page and an exact rectangle that
        // formFiller.js can stamp an uploaded photo or a drawn signature
        // into, and so the portal's fill UI knows to offer an upload / a
        // scratch-pad for it. These used to be skipped outright, which is
        // why photo and signature areas had no input anywhere in the portal.
        const field = form.createButton(key);
        field.addToPage('', page, { x, y, width: boxWidth, height: boxHeight, borderWidth: 0, font });
        makeWidgetTransparent(pdf, field);
        form.markFieldAsClean(field.ref);
        imageFieldKeys.push(key);
        createdCount++;
        continue;
      }

      if (fieldType === 'checkbox') {
        // Option checkboxes (gender M/F/T, yes/no, etc.) — a real PDFCheckBox
        // so the fill step ticks it, rather than a text field the filler
        // would otherwise draw a word into.
        const field = form.createCheckBox(key);
        field.addToPage(page, { x, y, width: boxWidth, height: boxHeight, borderWidth: 0 });
        createdCount++;
      } else {
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
      }
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
    // Image buttons have no text to render, and handing them a text /DA
    // makes some viewers paint a caption box over the photo.
    if (imageFieldKeys.includes(field.getName())) continue;
    const size = fontSizeByKey[field.getName()] || 10;
    field.acroField.dict.set(PDFName.of('DA'), PDFString.of(`/${FONT_RESOURCE_NAME} ${size} Tf 0 g`));
  }

  // updateFieldAppearances above can regenerate a button's appearance (and
  // with it pdf-lib's default grey background). Re-blank them last, so the
  // printed photo/signature frame stays visible on the downloaded form.
  for (const key of imageFieldKeys) {
    const field = form.getFieldMaybe(key);
    if (field) makeWidgetTransparent(pdf, field);
  }

  const bytes = await pdf.save();
  return { buffer: Buffer.from(bytes), createdCount, imageFieldKeys };
}
