/**
 * Build the COMPLETE fillable-field plan for a blank bank application form.
 *
 * The pieces this composes already existed; what didn't exist was anything
 * that used all of them at once. Calibration used to bake only
 * formTextAnchor's 28-key canonical whitelist (or Gemini's guess at the same
 * 28 keys), so a six-page form with two hundred printed boxes came back with
 * a dozen fillable fields and the rest of the form dead — which is exactly
 * the "we still can't create fillable forms" symptom. The whitelist-free
 * generic anchor that finds EVERY box was wired only to the editor's
 * suggestion list, where nothing could be saved from it.
 *
 * So: generic anchoring is the base layer (every box on the form), and the
 * canonical whitelist is laid on top of it (the ~28 keys the portal can
 * auto-fill from a lead record without anyone typing). Where the two describe
 * the same printed box, canonical wins and the generic duplicate is dropped,
 * so no box ever ends up with two stacked fields.
 *
 * Strategy per form, in order — deterministic code first, vision only where
 * code has nothing to read:
 *   1. Text-layer PDFs (most bank forms): generic + canonical anchoring.
 *      Fully deterministic — the same bytes always produce the same map.
 *   2. Flat scans with no text layer (Axis-class): raster cell detection for
 *      geometry (still code, no model), plus Gemini vision for the canonical
 *      keys' semantics, since nothing on the page is machine-readable text.
 */
import { anchorFieldsFromTextLayer } from './formTextAnchor.js';
import { anchorFieldsGenerically } from './formFieldAnchorGeneric.js';
import { calibrateFormFields } from './formCalibrator.js';
import { detectRasterCellRects, getPageSizes, rasterCellRunsAsSuggestions } from './formRasterCells.js';
import { FORM_FIELD_KEYS, FORM_FIELD_LABELS } from '../data/formSources.js';

// A form with more fields than this is almost certainly a detector running
// away on prose, not a real form — baking thousands of widgets would make
// the PDF unusable in every viewer. Canonical fields are never dropped.
const MAX_FIELDS = 600;

function boxArea(b) {
  return Math.max(0, b.widthPct || 0) * Math.max(0, b.heightPct || 0);
}

// Fraction of the SMALLER box that the two boxes share. Using the smaller
// box as the denominator means a small canonical box sitting inside a large
// generic one still counts as "the same printed area" and wins.
function overlapFraction(a, b) {
  if ((a.page || 1) !== (b.page || 1)) return 0;
  const ax2 = a.xPct + (a.widthPct || 0);
  const ay2 = a.yPct + (a.heightPct || 0);
  const bx2 = b.xPct + (b.widthPct || 0);
  const by2 = b.yPct + (b.heightPct || 0);
  const w = Math.min(ax2, bx2) - Math.max(a.xPct, b.xPct);
  const h = Math.min(ay2, by2) - Math.max(a.yPct, b.yPct);
  if (w <= 0 || h <= 0) return 0;
  const smaller = Math.min(boxArea(a), boxArea(b));
  return smaller > 0 ? (w * h) / smaller : 0;
}

const SAME_BOX_OVERLAP = 0.35;

// A photo frame or signature strip occupies real estate that the rows beside
// it must not run into: a text box measured "from the label to the far edge of
// the page" slides straight under the photograph, and whatever the customer
// types there ends up hidden behind it once the picture is stamped on.
function clipTextBoxesAgainstImages(fields) {
  const images = Object.values(fields).filter((f) => f.fieldType === 'image' && hasBox(f));
  if (images.length === 0) return { clipped: 0, dropped: 0 };

  let clipped = 0;
  let dropped = 0;
  for (const [key, pos] of Object.entries(fields)) {
    if (pos.fieldType === 'image' || !hasBox(pos)) continue;
    for (const image of images) {
      if ((image.page || 1) !== (pos.page || 1)) continue;
      const bandTop = Math.max(pos.yPct, image.yPct);
      const bandBottom = Math.min(pos.yPct + pos.heightPct, image.yPct + image.heightPct);
      if (bandBottom - bandTop <= 0) continue; // different rows entirely

      // Mostly inside the frame: this is not a field, it's the frame's own
      // instruction text that got read as one.
      if (overlapFraction(pos, image) >= 0.6) {
        delete fields[key];
        dropped++;
        break;
      }

      const right = pos.xPct + pos.widthPct;
      if (pos.xPct < image.xPct && right > image.xPct) {
        pos.widthPct = Math.max(1, image.xPct - 0.5 - pos.xPct);
        clipped++;
      }
    }
  }
  return { clipped, dropped };
}

// Discovered fields are keyed by a slug of the form's own printed label
// ("mobile_number", "name_of_employer"). Where that label names something the
// portal already knows about a lead, rename the field to the canonical key so
// it auto-fills instead of waiting to be typed.
//
// This is a convenience layer, NOT how fields come to exist any more: an alias
// that misses just means the customer types that box themselves, rather than —
// as before — the box not being on the form at all. Order matters, since the
// first match wins: the narrower labels come before the broader ones, so
// "Name of Employer" can't be claimed by the applicant-name alias.
const norm = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

const CANONICAL_ALIASES = [
  ['ckyc_number', /CKYC/],
  ['employer_name', /EMPLOYER|COMPANYNAME|BUSINESSNAME|ORGANISATION|ORGANIZATION/],
  ['co_applicant_name', /^(NAMEOF)?COAPPLICANT(NAME)?$|^GUARANTORNAME$/],
  ['aadhaar_number', /AADHAAR|AADHAR|^UID$/],
  ['pan_number', /^PAN/],
  ['dob', /DATEOFBIRTH|^DOB$/],
  ['gender', /GENDER|^SEX$/],
  ['mobile', /MOBILE|CONTACTNO|PHONENO|CONTACTNUMBER/],
  ['email', /EMAIL/],
  ['pin_code', /PINCODE|POSTALCODE|^PIN$/],
  ['district', /DISTRICT/],
  ['state', /^STATE/],
  ['town_city_village', /TOWNCITY|CITYVILLAGE|^CITY$|^TOWN$/],
  ['gross_income', /GROSS(MONTHLY)?INCOME/],
  ['rental_income', /RENTALINCOME|OTHERINCOME/],
  ['monthly_income', /(NET|MONTHLY)INCOME|NETMONTHLYINCOME|MONTHLYSALARY/],
  ['loan_amount', /LOANAMOUNT|AMOUNT(REQUIRED|APPLIEDFOR|OFLOAN)/],
  ['loan_type', /TYPEOFLOAN|LOANTYPE|PURPOSEOFLOAN|SCHEME/],
  ['application_date', /DATEOFAPPLICATION|APPLICATIONDATE/],
  ['address', /ADDRESS/],
  ['full_name', /^(FULL)?NAMEOF(THE)?(APPLICANT|BORROWER|CUSTOMER)$|^(FULL)?NAME$|^APPLICANTNAME$|^NAMEOFAPPLICANT$/],
];

function canonicalKeyForLabel(label) {
  const n = norm(label);
  if (!n) return null;
  for (const [key, pattern] of CANONICAL_ALIASES) {
    if (pattern.test(n)) return key;
  }
  return null;
}

// A canonical box can stop short: the whitelist anchor measures from the end
// of the label to the next thing on the row, which on a segmented input is the
// comb run's FIRST cell — leaving a canonical field a few points wide sitting
// immediately left of the discovered field that covers the real writable run.
// Both then get baked, and auto-fill types into the stub. Where the discovered
// neighbour names the same canonical field, fold it in instead.
const NARROW_WIDTH_PCT = 8;
const ADJACENT_GAP_PCT = 2;

function isAdjacentContinuation(canonicalBox, discoveredBox) {
  if ((canonicalBox.page || 1) !== (discoveredBox.page || 1)) return false;
  if (canonicalBox.widthPct >= NARROW_WIDTH_PCT) return false;
  const gap = discoveredBox.xPct - (canonicalBox.xPct + canonicalBox.widthPct);
  if (gap < -0.5 || gap > ADJACENT_GAP_PCT) return false;
  const bandTop = Math.max(canonicalBox.yPct, discoveredBox.yPct);
  const bandBottom = Math.min(
    canonicalBox.yPct + canonicalBox.heightPct,
    discoveredBox.yPct + discoveredBox.heightPct
  );
  const shared = bandBottom - bandTop;
  return shared > 0 && shared >= Math.min(canonicalBox.heightPct, discoveredBox.heightPct) * 0.5;
}

function unionBox(a, b) {
  const right = Math.max(a.xPct + a.widthPct, b.xPct + b.widthPct);
  const bottom = Math.max(a.yPct + a.heightPct, b.yPct + b.heightPct);
  const xPct = Math.min(a.xPct, b.xPct);
  const yPct = Math.min(a.yPct, b.yPct);
  return { ...a, xPct, yPct, widthPct: right - xPct, heightPct: bottom - yPct };
}

// Boxes without a widthPct/heightPct (older single-point Gemini calibration)
// can't be compared geometrically — treat them as un-overlappable rather than
// silently dropping real fields.
function hasBox(b) {
  return Number.isFinite(b?.widthPct) && Number.isFinite(b?.heightPct) && b.widthPct > 0 && b.heightPct > 0;
}

/**
 * @param {Buffer} fileBuffer - the blank form PDF
 * @returns {Promise<{ fields: object, calibrated_at: string, source: string, counts: object }>}
 */
export async function planFormFields(fileBuffer) {
  const sources = [];

  const generic = await anchorFieldsGenerically(fileBuffer).catch((err) => {
    console.warn('Generic anchoring failed:', err.message);
    return null;
  });
  if (generic) sources.push('text-layer-generic');

  let canonical = await anchorFieldsFromTextLayer(fileBuffer).catch((err) => {
    console.warn('Canonical text anchoring failed:', err.message);
    return null;
  });
  if (canonical) sources.push('text-layer');

  // No text layer at all: the page is a picture of a form. Geometry still
  // comes from code (the printed cells are visible in the bitmap); only the
  // canonical keys' MEANING needs vision, and only if a key is configured.
  let rasterFields = null;
  if (!generic) {
    try {
      const cellsByPage = await detectRasterCellRects(fileBuffer);
      const pageSizes = await getPageSizes(fileBuffer);
      rasterFields = rasterCellRunsAsSuggestions(cellsByPage, pageSizes);
      if (rasterFields && Object.keys(rasterFields).length > 0) sources.push('raster-cells');
      else rasterFields = null;
    } catch (err) {
      console.warn('Raster cell detection failed:', err.message);
    }
  }
  if (!canonical && process.env.GEMINI_API_KEY) {
    canonical = await calibrateFormFields(fileBuffer).catch((err) => {
      console.warn('Vision calibration failed:', err.message);
      return null;
    });
    if (canonical) sources.push('vision');
  }

  const discovered = { ...(generic?.fields || {}), ...(rasterFields || {}) };
  const canonicalFields = canonical?.fields || {};

  if (Object.keys(discovered).length === 0 && Object.keys(canonicalFields).length === 0) {
    throw new Error(
      'Could not find any fillable areas on this form. If it is a flat scan, set GEMINI_API_KEY on the server, or draw the fields by hand with "Draw Fields".'
    );
  }

  // Canonical fields win wherever the two passes describe the same printed
  // box: they carry the key the portal auto-fills from the lead record.
  const fields = {};
  const canonicalBoxes = Object.values(canonicalFields).filter(hasBox);
  let dropped = 0;
  for (const [key, pos] of Object.entries(discovered)) {
    if (hasBox(pos) && canonicalBoxes.some((c) => overlapFraction(pos, c) >= SAME_BOX_OVERLAP)) {
      dropped++;
      continue;
    }
    fields[key] = { ...pos, role: 'discovered' };
  }

  for (const [key, pos] of Object.entries(canonicalFields)) {
    // A canonical key may collide by NAME with a discovered slug that happens
    // to match ("mobile"); the canonical one is the authoritative version.
    const baseKey = key.split('__')[0];
    fields[key] = {
      ...pos,
      role: 'canonical',
      label: FORM_FIELD_LABELS[baseKey] || pos.label || baseKey,
    };
  }

  // Bind discovered fields to canonical keys where their printed label says
  // what they are, so the portal can auto-fill them from the lead record.
  let aliased = 0;
  let merged = 0;
  for (const [key, pos] of Object.entries(fields)) {
    if (pos.role !== 'discovered') continue;
    if (pos.fieldType === 'image' || pos.fieldType === 'checkbox') continue;
    const canonicalKey = canonicalKeyForLabel(pos.label || key);
    if (!canonicalKey) continue;

    const taken = fields[canonicalKey];
    if (!taken) {
      delete fields[key];
      fields[canonicalKey] = { ...pos, role: 'canonical', label: FORM_FIELD_LABELS[canonicalKey] || pos.label };
      aliased++;
    } else if (taken.role === 'canonical' && hasBox(taken) && hasBox(pos) && isAdjacentContinuation(taken, pos)) {
      fields[canonicalKey] = unionBox(taken, pos);
      delete fields[key];
      merged++;
    }
  }
  if (aliased || merged) {
    console.log(`Field plan: ${aliased} discovered field(s) bound to canonical keys, ${merged} stub(s) merged`);
  }

  const { clipped, dropped: droppedIntoImage } = clipTextBoxesAgainstImages(fields);
  if (clipped || droppedIntoImage) {
    console.log(`Field plan: ${clipped} box(es) clipped off a photo/signature frame, ${droppedIntoImage} dropped inside one`);
  }

  // Trim the discovered tail if a detector ran away, keeping every canonical
  // field and every photo/signature box (those are the ones a human most
  // needs and can never be typed around).
  const keys = Object.keys(fields);
  if (keys.length > MAX_FIELDS) {
    const keep = new Set(
      keys.filter((k) => fields[k].role === 'canonical' || fields[k].fieldType === 'image')
    );
    for (const k of keys) {
      if (keep.size >= MAX_FIELDS) break;
      keep.add(k);
    }
    for (const k of keys) if (!keep.has(k)) delete fields[k];
  }

  const counts = { total: 0, text: 0, checkbox: 0, photo: 0, signature: 0, canonical: 0, discovered: 0, deduped: dropped, aliased, merged };
  for (const pos of Object.values(fields)) {
    counts.total++;
    counts[pos.role === 'canonical' ? 'canonical' : 'discovered']++;
    if (pos.fieldType === 'image') counts[pos.imageKind === 'signature' ? 'signature' : 'photo']++;
    else if (pos.fieldType === 'checkbox') counts.checkbox++;
    else counts.text++;
  }

  return {
    fields,
    calibrated_at: new Date().toISOString(),
    source: sources.join('+') || 'none',
    counts,
  };
}

export { FORM_FIELD_KEYS };
