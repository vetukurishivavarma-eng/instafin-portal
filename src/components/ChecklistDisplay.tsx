import React from 'react';
import { ChecklistItem } from '../checklist-spec';

interface ChecklistDisplayProps {
  items: ChecklistItem[];
}

interface CategoryGroup {
  category: string;
  items: ChecklistItem[];
}

const CATEGORY_LABELS: Record<string, string> = {
  kyc: 'KYC Documents',
  income_proof: 'Income Proof',
  business_documents: 'Business Documents',
  property_documents: 'Property Documents',
  financial_documents: 'FINANCIAL DOCUMENTS',
  legal_documents: 'LEGAL DOCUMENTS',
  others: 'OTHERS',
};

const CATEGORY_ORDER = [
  'kyc',
  'income_proof',
  'business_documents',
  'property_documents',
  'financial_documents',
  'legal_documents',
  'others',
];

const ChecklistDisplay: React.FC<ChecklistDisplayProps> = ({ items }) => {
  const groupedItems = React.useMemo(() => {
    const groups: CategoryGroup[] = [];

    CATEGORY_ORDER.forEach((category) => {
      const categoryItems = items.filter((item) => item.category === category);
      if (categoryItems.length > 0) {
        groups.push({
          category,
          items: categoryItems,
        });
      }
    });

    return groups;
  }, [items]);

  const requiredCount = items.filter((item) => item.required).length;
  const optionalCount = items.filter((item) => !item.required).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3">
        <div className="inline-flex items-center px-3 py-1.5 bg-red-50 text-red-700 rounded-full text-sm font-medium">
          <svg className="w-4 h-4 mr-1.5" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z"
              clipRule="evenodd"
            />
          </svg>
          {requiredCount} Required
        </div>
        {optionalCount > 0 && (
          <div className="inline-flex items-center px-3 py-1.5 bg-green-50 text-green-700 rounded-full text-sm font-medium">
            <svg className="w-4 h-4 mr-1.5" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clipRule="evenodd"
              />
            </svg>
            {optionalCount} Optional
          </div>
        )}
      </div>

      {groupedItems.map((group, groupIndex) => (
        <div
          key={group.category}
          className="bg-white rounded-xl border border-gray-200 overflow-hidden"
        >
          <div className="px-5 py-4 bg-gray-50 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">
              {CATEGORY_LABELS[group.category] || group.category}
            </h3>
            <p className="text-sm text-gray-500 mt-1">
              {group.items.filter((i) => i.required).length} required,{' '}
              {group.items.filter((i) => !i.required).length} optional
            </p>
          </div>

          <ul className="divide-y divide-gray-100">
            {group.items.map((item, itemIndex) => (
              <li
                key={item.id}
                className="px-5 py-4 flex items-start gap-3 transition-colors duration-150 hover:bg-gray-50"
              >
                <div className="flex-shrink-0 mt-0.5">
                  {item.required ? (
                    <svg
                      className="w-5 h-5 text-red-500"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z"
                        clipRule="evenodd"
                      />
                    </svg>
                  ) : (
                    <svg
                      className="w-5 h-5 text-green-500"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                        clipRule="evenodd"
                      />
                    </svg>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p
                    className={`text-sm font-medium ${
                      item.required ? 'text-gray-900' : 'text-gray-700'
                    }`}
                  >
                    {item.name}
                  </p>
                </div>
                <div className="flex-shrink-0">
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      item.required
                        ? 'bg-red-100 text-red-800'
                        : 'bg-green-100 text-green-800'
                    }`}
                  >
                    {item.required ? 'Required' : 'Optional'}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}

      {items.length === 0 && (
        <div className="text-center py-12 bg-gray-50 rounded-xl border border-dashed border-gray-300">
          <svg
            className="mx-auto h-12 w-12 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
            />
          </svg>
          <p className="mt-4 text-sm text-gray-500">
            No checklist items found for this selection
          </p>
        </div>
      )}
    </div>
  );
};

export default ChecklistDisplay;