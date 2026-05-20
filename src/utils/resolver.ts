/**
 * Resolver utility for Loan Checklist
 * Returns checklist based on user selection using decision tree
 * Implements memoization for performance optimization
 */

import { Selection, ChecklistItem, ChecklistKey } from '../data/types';
import { DECISION_TREE, COMMON_CHECKLIST } from '../data/checklists';

// Memoization cache - singleton to persist across calls
const checklistCache: Map<string, ChecklistItem[]> = new Map();

/**
 * Converts Selection object to a lookup key
 * Format: "loanType|loanStatus|incomeSource|residentType|businessType?"
 * @param selection - User selection object
 * @returns ChecklistKey string or null if incomplete
 */
export function selectionToKey(selection: Selection): ChecklistKey | null {
  const { loanType, loanStatus, incomeSource, residentType, businessType } = selection;

  // loanType is always required
  if (!loanType) {
    return null;
  }

  // Build key parts - use 'undefined' as placeholder if not provided
  const parts: string[] = [loanType];

  if (loanStatus) {
    parts.push(loanStatus);
  } else {
    return null; // loanStatus is required for lookup
  }

  if (incomeSource) {
    parts.push(incomeSource);
  } else {
    return null; // incomeSource is required for lookup
  }

  if (residentType) {
    parts.push(residentType);
  } else {
    return null; // residentType is required for lookup
  }

  // businessType is optional - only for non_salaried
  if (businessType) {
    parts.push(businessType);
  } else if (incomeSource === 'non_salaried') {
    // For non-salaried, businessType is effectively required
    return null;
  }

  return parts.join('|') as ChecklistKey;
}

/**
 * Validates if the selection is complete for a valid lookup
 * @param selection - User selection object
 * @returns boolean indicating if selection is complete
 */
export function isSelectionComplete(selection: Selection): boolean {
  const key = selectionToKey(selection);
  return key !== null;
}

/**
 * Gets checklist items based on user selection
 * Uses memoization for performance - same selection returns cached result
 * @param selection - User selection object containing loanType, loanStatus, incomeSource, residentType, and optional businessType
 * @returns ChecklistItem[] - Array of checklist items, empty array if incomplete or not found
 *
 * @example
 * const selection: Selection = {
 *   loanType: 'home_loan',
 *   loanStatus: 'new',
 *   incomeSource: 'salaried',
 *   residentType: 'indian_resident'
 * };
 * const checklist = getChecklist(selection);
 *
 * @example
 * // For non-salaried with business type
 * const selection: Selection = {
 *   loanType: 'business_loan',
 *   loanStatus: 'new',
 *   incomeSource: 'non_salaried',
 *   residentType: 'indian_resident',
 *   businessType: 'proprietor'
 * };
 * const checklist = getChecklist(selection);
 */
export function getChecklist(selection: Selection): ChecklistItem[] {
  // Validate selection is complete
  const key = selectionToKey(selection);

  if (!key) {
    // Return empty array for incomplete selection
    return [];
  }

  // Check memoization cache first
  if (checklistCache.has(key)) {
    return checklistCache.get(key) as ChecklistItem[];
  }

  // Look up in decision tree with fallback chain
  let checklist = DECISION_TREE[key as ChecklistKey];

  // Fallback: try without businessType
  if (!checklist) {
    const parts = key.split('|');
    if (parts.length === 5) {
      checklist = DECISION_TREE[parts.slice(0, 4).join('|') as ChecklistKey];
    }
  }

  // Fallback: first matching loan type
  if (!checklist) {
    const loanType = key.split('|')[0];
    const fallback = Object.keys(DECISION_TREE).find(k => k.startsWith(loanType + '|'));
    if (fallback) checklist = DECISION_TREE[fallback as ChecklistKey];
  }

  // Final fallback: common checklist
  if (!checklist) {
    checklist = COMMON_CHECKLIST;
  }

  if (!checklist || checklist.length === 0) {
    // Return empty array if no matching checklist found
    return [];
  }

  // Filter out any undefined entries (defensive)
  const filtered = checklist.filter(Boolean);

  // Cache the result
  checklistCache.set(key, filtered);

  return filtered;
}

/**
 * Gets checklist by full key string (for direct lookup)
 * @param key - Full checklist key string
 * @returns ChecklistItem[] or undefined if not found
 */
export function getChecklistByKey(key: string): ChecklistItem[] | undefined {
  // Check memoization cache first
  if (checklistCache.has(key)) {
    return checklistCache.get(key);
  }

  // Look up in decision tree
  const checklist = DECISION_TREE[key as ChecklistKey];

  if (checklist) {
    checklistCache.set(key, checklist);
  }

  return checklist;
}

/**
 * Clears the memoization cache
 * Useful for testing or when data needs to be refreshed
 */
export function clearChecklistCache(): void {
  checklistCache.clear();
}

/**
 * Gets cache size (for monitoring/testing)
 * @returns number of cached entries
 */
export function getCacheSize(): number {
  return checklistCache.size;
}

/**
 * Gets all available keys in the decision tree
 * Useful for debugging or displaying available combinations
 * @returns Array of all checklist keys
 */
export function getAvailableKeys(): string[] {
  return Object.keys(DECISION_TREE);
}

/**
 * Validates a selection and returns detailed info about what's missing
 * @param selection - User selection object
 * @returns Object with isComplete boolean and missingFields array
 */
export function validateSelection(selection: Selection): {
  isComplete: boolean;
  missingFields: string[];
} {
  const missingFields: string[] = [];

  if (!selection.loanType) missingFields.push('loanType');
  if (!selection.loanStatus) missingFields.push('loanStatus');
  if (!selection.incomeSource) missingFields.push('incomeSource');
  if (!selection.residentType) missingFields.push('residentType');

  // businessType is only required for non_salaried
  if (selection.incomeSource === 'non_salaried' && !selection.businessType) {
    missingFields.push('businessType');
  }

  return {
    isComplete: missingFields.length === 0,
    missingFields,
  };
}

/**
 * Gets group of checklist items by category
 * @param checklist - Array of checklist items
 * @returns Object with category names as keys and arrays of items as values
 */
export function groupByCategory(checklist: ChecklistItem[]): Record<string, ChecklistItem[]> {
  return checklist.reduce((acc, item) => {
    const category = item.category;
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(item);
    return acc;
  }, {} as Record<string, ChecklistItem[]>);
}

/**
 * Gets count of required vs optional items
 * @param checklist - Array of checklist items
 * @returns Object with required and optional counts
 */
export function getRequiredCount(checklist: ChecklistItem[]): { required: number; optional: number } {
  return {
    required: checklist.filter(item => item.required).length,
    optional: checklist.filter(item => !item.required).length,
  };
}

// Default export for convenience
export default getChecklist;