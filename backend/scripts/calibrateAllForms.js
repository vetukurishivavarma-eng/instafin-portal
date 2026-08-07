/**
 * Calibrate AI field positions for every active bank application form.
 *
 * This is the one-time setup that enables auto-filling bank PDFs from
 * customer documents. It uses Gemini Vision to detect where each field
 * (name, DOB, PAN, Aadhaar, address, income, ...) sits on each blank form
 * and stores the coordinate map on the form row.
 *
 * Usage:
 *   GEMINI_API_KEY=... node scripts/calibrateAllForms.js
 *   GEMINI_API_KEY=... node scripts/calibrateAllForms.js --force   # re-calibrate everything
 *   GEMINI_API_KEY=... node scripts/calibrateAllForms.js --bank="Axis Bank"
 */
import { supabase } from '../src/lib/supabase.js';
import { calibrateFormFields } from '../src/services/formCalibrator.js';
import { loadFormPdf } from '../src/services/formStorage.js';

// ── parse args ──
const args = process.argv.slice(2);
const force = args.includes('--force');
const bankArg = args.find(a => a.startsWith('--bank='));
const bankFilter = bankArg ? bankArg.split('=')[1] : null;

async function main() {
  if (!process.env.GEMINI_API_KEY) {
    console.error('❌ GEMINI_API_KEY is not set.');
    console.error('   Set it and re-run, e.g.:');
    console.error('   GEMINI_API_KEY=your_key_here node scripts/calibrateAllForms.js');
    console.error('   (The key is the same one already used for document analysis.)');
    process.exit(1);
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
      const fieldMap = await calibrateFormFields(fileBuffer);
      const fieldCount = Object.keys(fieldMap.fields || {}).length;

      const { error: updateError } = await supabase
        .from('application_forms')
        .update({ field_map: fieldMap, updated_at: new Date().toISOString() })
        .eq('id', form.id);

      if (updateError) throw updateError;

      console.log(`   ✅ Calibrated — ${fieldCount} field(s): ${form.form_name}`);
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
