/**
 * Seed script to populate application_forms table with real bank forms.
 * Run: node src/seedForms.js
 * 
 * This script reads the downloaded PDF files from uploads/forms/
 * and creates database records in the application_forms table.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { supabase } from './lib/supabase.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const formsDir = path.join(__dirname, '..', 'uploads', 'forms');

const FORMS = [
  {
    bank_name: 'State Bank of India',
    loan_type: 'Home Loan',
    form_name: 'SBI Home Loan Application Form',
    file_name: 'sbi_home_loan_form.pdf',
    file_type: 'pdf',
  },
  {
    bank_name: 'HDFC Bank',
    loan_type: 'Home Loan',
    form_name: 'HDFC Home Loan Application Form',
    file_name: 'hdfc_home_loan_form.pdf',
    file_type: 'pdf',
  },
  {
    bank_name: 'Axis Bank',
    loan_type: 'Personal Loan',
    form_name: 'Axis Bank Personal Loan Application Form',
    file_name: 'axis_personal_loan_form.pdf',
    file_type: 'pdf',
  },
  {
    bank_name: 'Axis Bank',
    loan_type: 'Home Loan',
    form_name: 'Axis Bank Home Loan Application Form',
    file_name: 'axis_home_loan_form.pdf',
    file_type: 'pdf',
  },
  {
    bank_name: 'Kotak Mahindra Bank',
    loan_type: 'Personal Loan',
    form_name: 'Kotak Personal Loan Application Form',
    file_name: 'kotak_pl_form.pdf',
    file_type: 'pdf',
  },
  {
    bank_name: 'Kotak Mahindra Bank',
    loan_type: 'Home Loan',
    form_name: 'Kotak Home Loan Application Form',
    file_name: 'kotak_hl_form.pdf',
    file_type: 'pdf',
  },
];

async function seedForms() {
  console.log('Starting form seeding...\n');

  // Check if forms already exist
  const { data: existing } = await supabase
    .from('application_forms')
    .select('id, bank_name, loan_type');

  const existingKeys = new Set(
    (existing || []).map(f => `${f.bank_name}|${f.loan_type}|${f.form_name}`)
  );

  let uploaded = 0;
  let skipped = 0;

  for (const form of FORMS) {
    const key = `${form.bank_name}|${form.loan_type}|${form.form_name}`;
    
    if (existingKeys.has(key)) {
      console.log(`⏭️  Skipping (already exists): ${form.form_name}`);
      skipped++;
      continue;
    }

    const filePath = path.join(formsDir, form.file_name);
    
    if (!fs.existsSync(filePath)) {
      console.log(`⚠️  File not found, skipping: ${filePath}`);
      skipped++;
      continue;
    }

    const fileBuffer = fs.readFileSync(filePath);
    const fileData = fileBuffer.toString('base64');

    // Check if NODE_ENV is production (use Supabase Storage)
    const isProduction = process.env.NODE_ENV === 'production';
    let filePathInDb;

    if (isProduction) {
      // Production: upload to Supabase Storage
      const storagePath = `forms/${form.file_name}`;
      const { error: uploadError } = await supabase.storage
        .from('lead-documents')
        .upload(storagePath, fileBuffer, {
          contentType: 'application/pdf',
          upsert: true,
        });

      if (uploadError) {
        console.error(`❌ Failed to upload ${form.form_name} to storage:`, uploadError.message);
        skipped++;
        continue;
      }
      filePathInDb = storagePath;
    } else {
      // Development: store relative file path
      filePathInDb = form.file_name;
    }

    // Insert record into application_forms table
    const { error: insertError } = await supabase
      .from('application_forms')
      .insert({
        bank_name: form.bank_name,
        loan_type: form.loan_type,
        form_name: form.form_name,
        file_path: filePathInDb,
        file_type: form.file_type,
        is_active: true,
      });

    if (insertError) {
      console.error(`❌ Failed to insert ${form.form_name}:`, insertError.message);
      skipped++;
    } else {
      console.log(`✅ Uploaded: ${form.form_name} (${(fileBuffer.length / 1024).toFixed(1)} KB)`);
      uploaded++;
    }
  }

  console.log(`\n📊 Summary: ${uploaded} uploaded, ${skipped} skipped`);
  process.exit(0);
}

seedForms().catch(err => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
