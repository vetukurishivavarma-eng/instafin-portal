/**
 * Known-name → local file mapping for application forms.
 *
 * The application_forms records may point at storage-style paths
 * (e.g. forms/axis_bank_home_loan_application_form_<ts>.pdf) whose
 * basenames don't exist in the local uploads/forms directory. This map lets
 * dev-mode code (downloads, calibration) fall back to the original PDFs.
 */
import fs from 'fs';
import path from 'path';

export const FORM_LOCAL_FILE_MAP = {
  'SBI Home Loan Application Form': 'sbi_home_loan_form.pdf',
  'HDFC Home Loan Application Form': 'hdfc_home_loan_form.pdf',
  'Axis Bank Personal Loan Application Form': 'axis_personal_loan_form.pdf',
  'Axis Bank Home Loan Application Form': 'axis_home_loan_form.pdf',
  'Kotak Personal Loan Application Form': 'kotak_pl_form.pdf',
  'Kotak Home Loan Application Form': 'kotak_hl_form.pdf',
  'BOI Star Home Loan Application Form': 'boi_star_home_loan_form.pdf',
  'BOI Star Personal Loan Application Form': 'boi_star_personal_loan_form.pdf',
};

/**
 * Resolve the local file path for a form's PDF in dev mode.
 * @param {string} formName - application_forms.form_name
 * @param {string} filePath - application_forms.file_path
 * @param {string} formsDir  - local uploads/forms directory
 * @returns {string|null} absolute local path, or null if not found
 */
export function resolveLocalFormPath(formName, filePath, formsDir) {
  const candidates = [];
  if (filePath) {
    // basename() strips any directory components; guard against '.'/'..' to
    // keep the resolved path inside formsDir.
    const base = path.basename(filePath);
    if (base && base !== '.' && base !== '..') {
      candidates.push(path.join(formsDir, base));
    }
  }
  const mapped = FORM_LOCAL_FILE_MAP[formName];
  if (mapped) candidates.push(path.join(formsDir, mapped));

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}
