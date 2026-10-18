// Unpack an uploaded .zip into separate files (checklist uploads + AI Bot).
// Skips folders, macOS/Windows junk and file types we don't store; refuses
// zips that unpack too big (zip-bomb guard for the 512 MB free server).
import path from 'path';
import { unzipSync } from 'fflate';

const MAX_FILES = 200;
const MAX_TOTAL_BYTES = 150 * 1024 * 1024;

export const MIME_BY_EXT = {
  '.pdf': 'application/pdf',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

const ZIP_MIMES = ['application/zip', 'application/x-zip-compressed', 'application/x-zip', 'multipart/x-zip'];

export function isZip(file) {
  return ZIP_MIMES.includes(file.mimetype) || /\.zip$/i.test(file.originalname || '');
}

// -> { files: [{ name, buffer, mimetype }], skipped: [name] }
export function extractZip(buffer) {
  let total = 0;
  let count = 0;
  const skipped = [];
  const entries = unzipSync(new Uint8Array(buffer), {
    filter: (f) => {
      const base = path.posix.basename(f.name);
      if (f.name.endsWith('/') || f.name.startsWith('__MACOSX/') || base.startsWith('.') || /^thumbs\.db$/i.test(base)) return false;
      if (!MIME_BY_EXT[path.extname(base).toLowerCase()]) { skipped.push(base); return false; }
      total += f.originalSize;
      if (++count > MAX_FILES) throw new Error(`Zip has more than ${MAX_FILES} files`);
      if (total > MAX_TOTAL_BYTES) throw new Error('Zip is too large once unpacked (over 150 MB)');
      return true;
    },
  });
  const files = Object.entries(entries).map(([name, data]) => {
    const base = path.posix.basename(name);
    return { name: base, buffer: Buffer.from(data), mimetype: MIME_BY_EXT[path.extname(base).toLowerCase()] };
  });
  return { files, skipped };
}
