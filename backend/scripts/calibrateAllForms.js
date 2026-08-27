/**
 * Make every active bank application form fillable, in bulk.
 *
 * For each form this runs the same plan-and-bake the portal's Calibrate button
 * runs (services/formFieldPlan.js): find every writable area on the blank form
 * — text boxes, tick-box options, photo frames, signature strips — bake them
 * into the stored PDF as real AcroForm fields, and save the map on the row so
 * the portal can render an input per field and auto-fill the ones it knows.
 *
 * Usage:
 *   node scripts/calibrateAllForms.js
 *   node scripts/calibrateAllForms.js --force            # re-do every form
 *   node scripts/calibrateAllForms.js --bank="Axis Bank"
 *
 * GEMINI_API_KEY is only needed for forms that are flat scans with no text
 * layer; everything else is calibrated deterministically from the PDF itself.
 */
import { supabase } from '../src/lib/supabase.js';
import { planFormFields } from '../src/services/formFieldPlan.js';
import { bakeAcroFormFields } from '../src/services/formAcroBaker.js';
import { loadFormPdf, saveFormPdf } from '../src/services/formStorage.js';

// ── parse args ──
const args = process.argv.slice(2);
const force = args.includes('--force');
const bankArg = args.find(a => a.startsWith('--bank='));
const bankFilter = bankArg ? bankArg.split('=')[1] : null;

async function main() {
  // A form with a text layer is calibrated deterministically and needs no key
  // at all. Only a fully scanned form — a picture of a form, nothing on it
  // machine-readable — falls back to vision, so a missing key is a warning
  // about those forms rather than a reason to refuse the whole run.
  if (!process.env.GEMINI_API_KEY) {
    console.warn('⚠️  GEMINI_API_KEY is not set. Forms with a text layer will still be calibrated;');
    console.warn('   fully scanned forms may find fewer fields, or none.\n');
  }

  console.log('Fetching active application forms...\n');
  let query = supabase
    .from('application_forms')
    .select('*')
    .eq('is_active', true)
    .order('bank_name')
    .order('loan_type');

  if (bankFilter) {
    query = query.ilike('bank_name', `%${bankFilter}%`);
  }

  const { data: forms, error } = await query;
  if (error) {
    console.error('❌ Failed to fetch forms:', error.message);
    process.exit(1);
  }

  if (!forms || forms.length === 0) {
    console.log('No active forms found to calibrate.');
    process.exit(0);
  }

  console.log(`Found ${forms.length} form(s) to process (force=${force}).\n`);

  let calibrated = 0;
  let skipped = 0;
  let failed = 0;

  for (const form of forms) {
    const label = `${form.bank_name} | ${form.loan_type} | ${form.form_name}`;

    if (!force && form.field_map?.fields && Object.keys(form.field_map.fields).length > 0) {
      const n = Object.keys(form.field_map.fields).length;
      console.log(`⏭️  Skipped (already calibrated, ${n} fields): ${label}`);
      skipped++;
      continue;
    }

    try {
      console.log(`🤖 Calibrating: ${label} ...`);
      const fileBuffer = await loadFormPdf(form);
      const fieldMap = await planFormFields(fileBuffer);

      // Bake the plan into the stored PDF, exactly as POST /:id/calibrate
      // does. Without this the script left forms with a field map but a flat,
      // un-fillable file — filling still worked via the coordinate overlay,
      // but nobody could type into the form itself.
      const { buffer: bakedBuffer, createdCount } = await bakeAcroFormFields({
        fileBuffer,
        fieldMap: fieldMap.fields || {},
      });
      await saveFormPdf(form, bakedBuffer);

      const { error: updateError } = await supabase
        .from('application_forms')
        .update({ field_map: fieldMap, updated_at: new Date().toISOString() })
        .eq('id', form.id);

      if (updateError) throw updateError;

      const { text, checkbox, photo, signature } = fieldMap.counts;
      console.log(`   ✅ ${createdCount} fillable field(s) — ${text} text, ${checkbox} checkbox, ${photo} photo, ${signature} signature: ${form.form_name}`);
      calibrated++;
    } catch (err) {
      console.error(`   ❌ Failed: ${form.form_name} — ${err.message}`);
      failed++;
    }
  }

  console.log(`\n📊 Summary: ${calibrated} calibrated, ${skipped} skipped, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('❌ Calibration run failed:', err.message);
  process.exit(1);
});
