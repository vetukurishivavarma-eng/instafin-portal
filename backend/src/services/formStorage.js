/**
 * Shared file-loading helpers for bank application forms.
 *
 * - Production (NODE_ENV=production): reads from Supabase Storage.
 * - Development: reads from uploads/, trying BOTH the server's cwd-based
 *   uploads dir (where the server writes files) and the project-root uploads
 *   dir (where the seed scripts dropped the form PDFs). Form PDFs also get a
 *   known-name fallback (see data/formFileMap.js).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { supabase } from '../lib/supabase.js';
import { resolveLocalFormPath } from '../data/formFileMap.js';

const isProduction = () => process.env.NODE_ENV === 'production';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
// backend/src/services/ → project root is 3 levels up
const projectRoot = path.resolve(moduleDir, '..', '..', '..');

const cwdUploads = path.join(process.cwd(), 'uploads');
const rootUploads = path.join(projectRoot, 'uploads');

/** Find a local file under uploads/, preferring cwd-based then project-root based. */
function findLocalFile(relativePath) {
  const candidates = [path.join(cwdUploads, relativePath), path.join(rootUploads, relativePath)];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

/**
 * Load any stored file (prod: Supabase Storage; dev: uploads/<filePath>).
 * @param {string} filePath - storage path (e.g. forms/foo.pdf or filled-forms/bar.pdf)
 * @returns {Promise<Buffer>}
 */
export async function loadStoredFile(filePath) {
  if (isProduction()) {
    const { data, error } = await supabase.storage
      .from('lead-documents')
      .download(filePath);
    if (error) throw new Error(`Storage download failed: ${error.message}`);
    if (typeof data.arrayBuffer === 'function') {
      const arrayBuffer = await data.arrayBuffer();
      return Buffer.from(arrayBuffer);
    }
    return Buffer.from(data);
  }
  const localPath = findLocalFile(filePath);
  if (!localPath) {
    throw new Error('File not found on server');
  }
  return fs.readFileSync(localPath);
}

/**
 * Load an application form's blank PDF (prod: storage; dev: local with name fallback).
 * @param {object} form - application_forms row (needs form_name + file_path)
 * @returns {Promise<Buffer>}
 */
export async function loadFormPdf(form) {
  if (isProduction()) {
    return loadStoredFile(form.file_path);
  }
  const candidateDirs = [
    path.join(cwdUploads, 'forms'),
    path.join(rootUploads, 'forms'),
  ];
  for (const dir of candidateDirs) {
    const localPath = resolveLocalFormPath(form.form_name, form.file_path, dir);
    if (localPath) {
      return fs.readFileSync(localPath);
    }
  }
  throw new Error('Form file not found on server');
}

/**
 * Overwrite an application form's stored PDF in place (e.g. after baking
 * AcroForm fields onto it during calibration). Writes to the same location
 * loadFormPdf would read from.
 */
export async function saveFormPdf(form, buffer) {
  if (isProduction()) {
    const { error } = await supabase.storage
      .from('lead-documents')
      .upload(form.file_path, buffer, { contentType: 'application/pdf', upsert: true });
    if (error) throw new Error(`Storage upload failed: ${error.message}`);
    return;
  }
  const candidateDirs = [
    path.join(cwdUploads, 'forms'),
    path.join(rootUploads, 'forms'),
  ];
  for (const dir of candidateDirs) {
    const localPath = resolveLocalFormPath(form.form_name, form.file_path, dir);
    if (localPath) {
      fs.writeFileSync(localPath, buffer);
      return;
    }
  }
  // No existing local file matched — write fresh under the primary uploads dir.
  const fallbackPath = path.join(cwdUploads, 'forms', path.basename(form.file_path));
  fs.writeFileSync(fallbackPath, buffer);
}
