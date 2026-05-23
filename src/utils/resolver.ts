/**
 * Resolver utility for Loan Checklist
 * Returns checklist based on user selection using decision tree
 * Implements memoization for performance optimization
 */

import { Selection, ChecklistItem, ChecklistKey } from '../data/types';
import { DECISION_TREE, COMMON_CHECKLIST } from '../data/checklists';

// Memoization cache - singleton to persist across calls
const checklistCache: Map<string, ChecklistItem[]> = new Map();

export interface ChecklistOverride {
  added: ChecklistItem[];
  deleted: string[];
}

export type ChecklistOverrides = Record<string, ChecklistOverride>;

export function getOverrides(): ChecklistOverrides {
  if (typeof window === 'undefined') return {};
  try {
    const data = localStorage.getItem('instafin_checklist_overrides');
    return data ? JSON.parse(data) : {};
  } catch (e) {
    console.error('Error loading checklist overrides from localStorage', e);
    return {};
  }
}

export function saveOverrides(overrides: ChecklistOverrides): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem('instafin_checklist_overrides', JSON.stringify(overrides));
    clearChecklistCache();
  } catch (e) {
    console.error('Error saving checklist overrides to localStorage', e);
  }
}

export function addChecklistItemToFlow(key: string, item: ChecklistItem): void {
  const overrides = getOverrides();
  if (!overrides[key]) {
    overrides[key] = { added: [], deleted: [] };
  }
  overrides[key].added = overrides[key].added.filter(i => i.id !== item.id);
  overrides[key].added.push(item);
  overrides[key].deleted = overrides[key].deleted.filter(id => id !== item.id);
  saveOverrides(overrides);
}

export function deleteChecklistItemFromFlow(key: string, itemId: string): void {
  const overrides = getOverrides();
  if (!overrides[key]) {
    overrides[key] = { added: [], deleted: [] };
  }
  overrides[key].added = overrides[key].added.filter(i => i.id !== itemId);
  if (!overrides[key].deleted.includes(itemId)) {
    overrides[key].deleted.push(itemId);
  }
  saveOverrides(overrides);
}

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
  let filtered = checklist.filter(Boolean);

  // Apply overrides from localStorage
  const overrides = getOverrides();
  const flowOverrides = overrides[key];
  if (flowOverrides) {
    if (flowOverrides.deleted && flowOverrides.deleted.length > 0) {
      filtered = filtered.filter(item => !flowOverrides.deleted.includes(item.id));
    }
    if (flowOverrides.added && flowOverrides.added.length > 0) {
      const addedMap = new Map(flowOverrides.added.map(item => [item.id, item]));
      filtered = filtered.map(item => {
        if (addedMap.has(item.id)) {
          const modifiedItem = addedMap.get(item.id);
          if (modifiedItem) {
            addedMap.delete(item.id);
            return modifiedItem;
          }
        }
        return item;
      });
      if (addedMap.size > 0) {
        filtered = [...filtered, ...Array.from(addedMap.values())];
      }
    }
  }

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

  if (!checklist) {
    return undefined;
  }

  let filtered = checklist.filter(Boolean);

  // Apply overrides from localStorage
  const overrides = getOverrides();
  const flowOverrides = overrides[key];
  if (flowOverrides) {
    if (flowOverrides.deleted && flowOverrides.deleted.length > 0) {
      filtered = filtered.filter(item => !flowOverrides.deleted.includes(item.id));
    }
    if (flowOverrides.added && flowOverrides.added.length > 0) {
      const addedMap = new Map(flowOverrides.added.map(item => [item.id, item]));
      filtered = filtered.map(item => {
        if (addedMap.has(item.id)) {
          const modifiedItem = addedMap.get(item.id);
          if (modifiedItem) {
            addedMap.delete(item.id);
            return modifiedItem;
          }
        }
        return item;
      });
      if (addedMap.size > 0) {
        filtered = [...filtered, ...Array.from(addedMap.values())];
      }
    }
  }

  checklistCache.set(key, filtered);
  return filtered;
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

/**
 * Gets checklist items based on user selection, with a highly robust fallback mechanism
 * for incomplete or partially filled selections (ideal for leads that are newly captured
 * and lack complete kyc/income profiles).
 * @param selection - User selection object
 * @returns ChecklistItem[]
 */
export function getChecklistWithFallback(selection: Selection): ChecklistItem[] {
  // If selection has a loanType, try standard lookup first
  const checklist = getChecklist(selection);
  if (checklist && checklist.length > 0) {
    return checklist;
  }

  // If no items found but we have a loanType, find first matching DECISION_TREE profile for that loanType
  if (selection.loanType) {
    const cleanLoanType = selection.loanType.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    const fallbackKey = Object.keys(DECISION_TREE).find(k => k.startsWith(cleanLoanType + '|')) ||
                        Object.keys(DECISION_TREE).find(k => k.startsWith(selection.loanType + '|'));
    if (fallbackKey) {
      const fbChecklist = DECISION_TREE[fallbackKey as ChecklistKey];
      if (fbChecklist && fbChecklist.length > 0) {
        let filtered = fbChecklist.filter(Boolean);
        // Apply overrides for the fallbackKey
        const overrides = getOverrides();
        const flowOverrides = overrides[fallbackKey];
        if (flowOverrides) {
          if (flowOverrides.deleted && flowOverrides.deleted.length > 0) {
            filtered = filtered.filter(item => !flowOverrides.deleted.includes(item.id));
          }
          if (flowOverrides.added && flowOverrides.added.length > 0) {
            const addedMap = new Map(flowOverrides.added.map(item => [item.id, item]));
            filtered = filtered.map(item => {
              if (addedMap.has(item.id)) {
                const modifiedItem = addedMap.get(item.id);
                if (modifiedItem) {
                  addedMap.delete(item.id);
                  return modifiedItem;
                }
              }
              return item;
            });
            if (addedMap.size > 0) {
              filtered = [...filtered, ...Array.from(addedMap.values())];
            }
          }
        }
        return filtered;
      }
    }
  }

  // Final absolute fallback: common checklist
  return COMMON_CHECKLIST || [];
}

// Default export for convenience
export default getChecklist;