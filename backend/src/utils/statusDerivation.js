/**
 * Status derivation utilities for bank-wise lead tracking.
 * Computes lead-level status from individual bank statuses.
 */

/**
 * Derive the lead-level status from an array of bank statuses.
 * @param {string[]} bankStatuses - Array of bank status strings
 * @returns {string} Derived lead status
 */
export function deriveLeadStatus(bankStatuses) {
  if (!bankStatuses || bankStatuses.length === 0) {
    return null; // No bank data — fall back to stored lead status
  }

  const total = bankStatuses.length;
  const rejected = bankStatuses.filter(s => s === 'Rejected').length;
  const sanctioned = bankStatuses.filter(s => s === 'Sanctioned').length;
  const partiallyDisbursed = bankStatuses.filter(s => s === 'Partially Disbursed').length;
  const disbursed = bankStatuses.filter(s => s === 'Disbursed').length;
  const processing = bankStatuses.filter(s => s === 'Processing').length;

  // All banks rejected
  if (rejected === total) return 'Rejected';

  // All banks fully disbursed
  if (disbursed === total) return 'Disbursed';

  // Any bank disbursed or partially disbursed, and no banks still processing
  const doneBanks = rejected + sanctioned + partiallyDisbursed + disbursed;
  if ((disbursed + partiallyDisbursed) > 0 && doneBanks === total) {
    if (partiallyDisbursed > 0 || (disbursed > 0 && disbursed < total - rejected)) {
      return 'Partially Disbursed';
    }
    return 'Disbursed';
  }

  // Some banks sanctioned, some still processing
  if (sanctioned > 0 && processing > 0) return 'Partially Sanctioned';

  // All non-rejected banks sanctioned (none processing, none disbursed yet)
  if (sanctioned > 0 && sanctioned === total - rejected) return 'Sanctioned';

  // Still processing
  return 'Processing';
}

/**
 * Compute aggregate sanctioned and disbursed amounts from bank records.
 * @param {Array} leadBanks - Array of lead_banks row objects
 * @returns {{ totalSanctioned: number, totalDisbursed: number }}
 */
export function computeLeadAggregates(leadBanks) {
  if (!leadBanks || leadBanks.length === 0) {
    return { totalSanctioned: 0, totalDisbursed: 0 };
  }

  let totalSanctioned = 0;
  let totalDisbursed = 0;

  for (const bank of leadBanks) {
    if (['Sanctioned', 'Partially Disbursed', 'Disbursed'].includes(bank.status)) {
      totalSanctioned += Number(bank.sanctioned_amount) || 0;
    }
    totalDisbursed += Number(bank.disbursed_amount) || 0;
  }

  return { totalSanctioned, totalDisbursed };
}
