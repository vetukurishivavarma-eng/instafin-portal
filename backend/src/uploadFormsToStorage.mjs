/**
 * Upload local PDF files to Supabase Storage and update database records.
 * Run: node src/uploadFormsToStorage.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { supabase } from './lib/supabase.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const formsDir = path.join(__dirname, '..', '..', 'uploads', 'forms');

async function uploadForms() {
  console.log('Starting Supabase Storage upload...\n');

  // Fetch all active forms from the database
  const { data: forms, error } = await supabase
    .from('application_forms')
    .select('*')
    .eq('is_active', true);

  if (error) {
    console.error('Failed to fetch forms:', error.message);
    process.exit(1);
  }

  if (!forms || forms.length === 0) {
    console.log('No active forms found in database.');
    process.exit(0);
  }

  console.log(`Found ${forms.length} forms to process.\n`);

  let uploaded = 0;
  let failed = 0;

  for (const form of forms) {
    // Determine the local file name from the current file_path
    const fileName = path.basename(form.file_path);
    const localPath = path.join(formsDir, fileName);

    if (!fs.existsSync(localPath)) {
      console.log(`⚠️  Local file not found: ${localPath}`);
      // Try matching from known filenames
      const knownFiles = {
        'SBI Home Loan Application Form': 'sbi_home_loan_form.pdf',
        'HDFC Home Loan Application Form': 'hdfc_home_loan_form.pdf',
        'Axis Bank Personal Loan Application Form': 'axis_personal_loan_form.pdf',
        'Axis Bank Home Loan Application Form': 'axis_home_loan_form.pdf',
        'Kotak Personal Loan Application Form': 'kotak_pl_form.pdf',
        'Kotak Home Loan Application Form': 'kotak_hl_form.pdf',
      };

      const knownFile = knownFiles[form.form_name];
      if (knownFile) {
        const knownPath = path.join(formsDir, knownFile);
        if (fs.existsSync(knownPath)) {
          console.log(`  → Found by name mapping: ${knownFile}`);
          // Upload with the storage path as forms/{bank_sanitized}_{form_sanitized}.pdf
          const storagePath = `forms/${fileName}`;
          const fileBuffer = fs.readFileSync(knownPath);

          const { error: uploadError } = await supabase.storage
            .from('lead-documents')
            .upload(storagePath, fileBuffer, {
              contentType: 'application/pdf',
              upsert: true,
            });

          if (uploadError) {
            console.error(`❌ Upload failed for ${form.form_name}:`, uploadError.message);
            failed++;
          } else {
            // Update the database record with the storage path
            const { error: updateError } = await supabase
              .from('application_forms')
              .update({ file_path: storagePath, updated_at: new Date().toISOString() })
              .eq('id', form.id);

            if (updateError) {
              console.error(`❌ DB update failed for ${form.form_name}:`, updateError.message);
              failed++;
            } else {
              console.log(`✅ Uploaded & updated: ${form.form_name} → ${storagePath} (${(fileBuffer.length / 1024).toFixed(1)} KB)`);
              uploaded++;
            }
          }
        } else {
          console.log(`⚠️  Known file not found either: ${knownPath}`);
          failed++;
        }
      } else {
        failed++;
      }
      continue;
    }

    const storagePath = `forms/${fileName}`;
    const fileBuffer = fs.readFileSync(localPath);

    const { error: uploadError } = await supabase.storage
      .from('lead-documents')
      .upload(storagePath, fileBuffer, {
        contentType: 'application/pdf',
        upsert: true,
      });

    if (uploadError) {
      console.error(`❌ Upload failed for ${form.form_name}:`, uploadError.message);
      failed++;
      continue;
    }

    // Update the database record with the storage path
    const { error: updateError } = await supabase
      .from('application_forms')
      .update({ file_path: storagePath, updated_at: new Date().toISOString() })
      .eq('id', form.id);

    if (updateError) {
      console.error(`❌ DB update failed for ${form.form_name}:`, updateError.message);
      failed++;
    } else {
      console.log(`✅ Uploaded & updated: ${form.form_name} → ${storagePath} (${(fileBuffer.length / 1024).toFixed(1)} KB)`);
      uploaded++;
    }
  }

  console.log(`\n📊 Summary: ${uploaded} uploaded, ${failed} failed`);
  process.exit(0);
}

uploadForms().catch(err => {
  console.error('❌ Upload failed:', err);
  process.exit(1);
});
