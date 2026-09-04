/**
 * Parses the "<LeadID>_<DocumentName>.<extension>" filename convention
 * customers are asked to use when sending documents over WhatsApp, e.g.
 * "L10001_Aadhaar.pdf" or "L10001_Address_Proof.pdf".
 *
 * The split is on the FIRST underscore only — everything between it and the
 * final "." is the document name, so multi-word document names
 * ("Address_Proof") still parse correctly.
 */

const LEAD_CODE_PATTERN = /^L\d+$/i;

/**
 * @typedef {Object} ParsedFilename
 * @property {boolean} valid
 * @property {string} [leadCode]        e.g. "L10001"
 * @property {string} [documentName]    raw, e.g. "Address_Proof"
 * @property {string} [extension]       lowercased, no dot, e.g. "pdf"
 * @property {string} [error]           human-readable reason when invalid
 * @property {string} [errorCode]       machine-readable reason when invalid
 */

/**
 * @param {string} originalFilename
 * @returns {ParsedFilename}
 */
export function parseInboundFilename(originalFilename) {
  if (!originalFilename || typeof originalFilename !== 'string') {
    return { valid: false, error: 'No filename provided', errorCode: 'INVALID_FILENAME' };
  }

  const trimmed = originalFilename.trim();
  const dotIndex = trimmed.lastIndexOf('.');
  const underscoreIndex = trimmed.indexOf('_');

  if (dotIndex <= 0 || dotIndex === trimmed.length - 1) {
    return {
      valid: false,
      error: `"${trimmed}" has no file extension`,
      errorCode: 'INVALID_FILENAME',
    };
  }

  if (underscoreIndex <= 0 || underscoreIndex >= dotIndex) {
    return {
      valid: false,
      error: `"${trimmed}" does not match the "<LeadID>_<DocumentName>.<extension>" format`,
      errorCode: 'INVALID_FILENAME',
    };
  }

  const leadCode = trimmed.slice(0, underscoreIndex).toUpperCase();
  const documentName = trimmed.slice(underscoreIndex + 1, dotIndex);
  const extension = trimmed.slice(dotIndex + 1).toLowerCase();

  if (!LEAD_CODE_PATTERN.test(leadCode)) {
    return {
      valid: false,
      error: `"${leadCode}" is not a valid Lead ID (expected a format like L10001)`,
      errorCode: 'INVALID_LEAD_CODE',
    };
  }

  if (!documentName.trim()) {
    return {
      valid: false,
      error: `"${trimmed}" is missing a document name`,
      errorCode: 'INVALID_FILENAME',
    };
  }

  return { valid: true, leadCode, documentName, extension };
}
