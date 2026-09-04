/**
 * File-type, size, and basic corruption checks for inbound WhatsApp documents.
 * Mirrors the allow-list already used by the manual checklist upload
 * (src/routes/checklistStatus.js) so a document accepted via WhatsApp is
 * never something the rest of the portal would have rejected.
 */

export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

const EXTENSION_TO_MIME = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

// Magic-byte signatures used to sanity-check that a file's content actually
// matches its claimed extension (catches truncated/corrupted WhatsApp media
// and mislabeled files without needing a heavyweight file-type library).
const SIGNATURES = [
  { bytes: [0x25, 0x50, 0x44, 0x46], exts: ['pdf'] }, // %PDF
  { bytes: [0xff, 0xd8, 0xff], exts: ['jpg', 'jpeg'] },
  { bytes: [0x89, 0x50, 0x4e, 0x47], exts: ['png'] },
  { bytes: [0x50, 0x4b, 0x03, 0x04], exts: ['docx', 'xlsx'] }, // zip-based Office formats
  { bytes: [0xd0, 0xcf, 0x11, 0xe0], exts: ['doc', 'xls'] }, // legacy OLE Office formats
];

export function isSupportedExtension(extension) {
  return Object.prototype.hasOwnProperty.call(EXTENSION_TO_MIME, extension.toLowerCase());
}

export function mimeTypeForExtension(extension) {
  return EXTENSION_TO_MIME[extension.toLowerCase()] || 'application/octet-stream';
}

/**
 * @param {Buffer} buffer
 * @param {string} extension without the leading dot
 * @returns {boolean} true if the file looks intact for its claimed type
 */
export function looksIntact(buffer, extension) {
  if (!buffer || buffer.length === 0) return false;
  const ext = extension.toLowerCase();
  const signature = SIGNATURES.find((s) => s.exts.includes(ext));
  if (!signature) return true; // no known signature to check against — don't false-flag
  if (buffer.length < signature.bytes.length) return false;
  return signature.bytes.every((byte, i) => buffer[i] === byte);
}

/**
 * @param {{ buffer: Buffer, extension: string }} file
 * @returns {{ valid: boolean, error?: string, errorCode?: string }}
 */
export function validateInboundFile({ buffer, extension }) {
  if (!isSupportedExtension(extension)) {
    return {
      valid: false,
      error: `".${extension}" is not a supported document type`,
      errorCode: 'UNSUPPORTED_FILE_TYPE',
    };
  }

  if (!buffer || buffer.length === 0) {
    return { valid: false, error: 'File is empty', errorCode: 'CORRUPTED_FILE' };
  }

  if (buffer.length > MAX_FILE_SIZE_BYTES) {
    return {
      valid: false,
      error: `File is ${(buffer.length / (1024 * 1024)).toFixed(1)}MB, which exceeds the ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB limit`,
      errorCode: 'FILE_TOO_LARGE',
    };
  }

  if (!looksIntact(buffer, extension)) {
    return {
      valid: false,
      error: `File content does not match its ".${extension}" extension (possibly corrupted)`,
      errorCode: 'CORRUPTED_FILE',
    };
  }

  return { valid: true };
}
