// Every download is named "<Lead name>_<document>_<DD-MM-YYYY>.<ext>" (or
// "<Lead name>_<DD-MM-YYYY>.zip"), dated the day it is downloaded (IST).
import path from 'path';

export function downloadDate(now = Date.now()) {
  const [y, m, d] = new Date(now + 5.5 * 3600 * 1000).toISOString().slice(0, 10).split('-');
  return `${d}-${m}-${y}`;
}

const clean = (s) => String(s || '').replace(/[\/:*?"<>|\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();

// file: the stored / original file name (its extension is kept). doc: optional
// document label; defaults to the file name without extension.
export function downloadName(lead, file, doc, now = Date.now()) {
  const ext = path.extname(file || '');
  const label = clean(doc || path.basename(file || 'document', ext));
  return [clean(lead) || 'Lead', label, downloadDate(now)].filter(Boolean).join('_') + ext;
}

export function zipName(lead, now = Date.now()) {
  return `${clean(lead) || 'Lead'}_${downloadDate(now)}.zip`;
}

// Header value that survives spaces and non-English names in every browser.
export function contentDisposition(name, attachment = true) {
  const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, '');
  return `${attachment ? 'attachment' : 'inline'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}
