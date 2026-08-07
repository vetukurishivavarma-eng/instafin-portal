/**
 * Fetch bank application forms from the internet (FORM_SOURCES catalog)
 * and register/update them in the application_forms table.
 */
import fs from 'fs';
import path from 'path';
import { supabase } from '../lib/supabase.js';
import { FORM_SOURCES } from '../data/formSources.js';

const formsDir = path.join(process.cwd(), 'uploads', 'forms');
if (!fs.existsSync(formsDir)) {
  fs.mkdirSync(formsDir, { recursive: true });
}

const isProduction = () => process.env.NODE_ENV === 'production';

// Full browser-like header set — bank CDNs (BOI uses a WAF on bankofindia.bank.in)
// fingerprint requests on the sec-ch-ua / Sec-Fetch-* headers and return 403 otherwise.
const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,application/pdf;q=0.8,*/*;q=0.7',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Connection': 'keep-alive',
  'Upgrade-Insecure-Requests': '1',
  'Referer': 'https://bankofindia.bank.in/retail-loan-application-form',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'same-origin',
  'sec-ch-ua': '"Not/A)Brand";v="8", "Chromium";v="126", "Google Chrome";v="126"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Windows"',
};

const sanitizeFileName = (fileName) =>
  fileName.replace(/[^a-zA-Z0-9._-]/g, '_').toLowerCase();

async function fetchPdf(url) {
  const response = await fetch(url, { headers: BROWSER_HEADERS, redirect: 'follow' });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());

  // Verify it actually is a PDF (some sites return HTML/JS error pages with 200)
  const header = buffer.slice(0, 1024).toString('latin1');
  if (!header.includes('%PDF')) {
    throw new Error('Response is not a PDF file (server returned HTML/JS content)');
  }

  return buffer;
}

/**
 * Sync all (or one bank's) forms from the catalog.
 * @param {string} [bankName] optional filter
 * @returns {Promise<Array<{bank_name, loan_type, form_name, status, reason?}>>}
 */
export async function syncFormsFromInternet(bankName = null) {
  const sources = FORM_SOURCES.filter(s => !bankName || s.bank_name.toLowerCase() === bankName.toLowerCase());

  if (sources.length === 0) {
    throw new Error(`No form sources configured for bank "${bankName || 'any'}" in the catalog (backend/src/data/formSources.js).`);
  }

  const results = [];

  for (const source of sources) {
    const key = `${source.bank_name}|${source.loan_type}|${source.form_name}`;
    try {
      console.log(`[form-sync] Downloading ${source.form_name} from ${source.url}`);
      const fileBuffer = await fetchPdf(source.url);

      const fileName = sanitizeFileName(source.form_name) + '_' + Date.now() + '.pdf';
      const filePath = `forms/${fileName}`;
      let dbFilePath = fileName;

      // Store the file
      if (isProduction()) {
        const { error: uploadError } = await supabase.storage
          .from('lead-documents')
          .upload(filePath, fileBuffer, { contentType: 'application/pdf', upsert: true });
        if (uploadError) throw uploadError;
        dbFilePath = filePath;
      } else {
        fs.writeFileSync(path.join(formsDir, fileName), fileBuffer);
      }

      // Upsert DB record
      const { data: existing } = await supabase
        .from('application_forms')
        .select('id, file_path')
        .eq('bank_name', source.bank_name)
        .eq('loan_type', source.loan_type)
        .eq('form_name', source.form_name)
        .maybeSingle();

      if (existing) {
        const { error: updateError } = await supabase
          .from('application_forms')
          .update({
            file_path: dbFilePath,
            file_type: 'pdf',
            source_url: source.url,
            is_active: true,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id);
        if (updateError) throw updateError;
        results.push({ ...keyFields(source), status: 'updated' });
      } else {
        const { error: insertError } = await supabase
          .from('application_forms')
          .insert({
            bank_name: source.bank_name,
            loan_type: source.loan_type,
            form_name: source.form_name,
            file_path: dbFilePath,
            file_type: 'pdf',
            source_url: source.url,
            is_active: true,
          });
        if (insertError) throw insertError;
        results.push({ ...keyFields(source), status: 'added' });
      }

      console.log(`[form-sync] ✅ ${source.form_name} (${(fileBuffer.length / 1024).toFixed(1)} KB)`);
    } catch (err) {
      console.error(`[form-sync] ❌ ${source.form_name}:`, err.message);
      results.push({
        ...keyFields(source),
        status: 'failed',
        reason: err.message,
      });
    }
  }

  return results;
}

function keyFields(source) {
  return {
    bank_name: source.bank_name,
    loan_type: source.loan_type,
    form_name: source.form_name,
  };
}
