import React, { useState, useEffect, useMemo } from 'react';
import { Selection, LoanType, LoanStatus, IncomeSource, ResidentType, BusinessType, ChecklistItem } from '../checklist-spec';
import DropdownStep from './DropdownStep';
import ChecklistDisplay from './ChecklistDisplay';
import ActionBar from './ActionBar';
import { getChecklist } from '../utils/resolver';

// Loan type options
const LOAN_TYPE_OPTIONS = [
  { value: 'home_loan', label: 'Home Loan' },
  { value: 'lap', label: 'LAP' },
  { value: 'mudra', label: 'Mudra Loan' },
  { value: 'msme', label: 'MSME Loan' },
  { value: 'business_loan', label: 'Business Loan' },
  { value: 'personal_loan', label: 'Personal Loan' },
  { value: 'education_loan', label: 'Education Loan' },
];

// Loan status options
const LOAN_STATUS_OPTIONS = [
  { value: 'new', label: 'New Loan' },
  { value: 'takeover', label: 'Takeover' },
  { value: 'construction', label: 'Construction' },
  { value: 'topup_equity', label: 'Top-up/Equity' },
];

// Income source options
const INCOME_SOURCE_OPTIONS = [
  { value: 'salaried', label: 'Salaried' },
  { value: 'non_salaried', label: 'Non-Salaried' },
];

// Resident type options
const RESIDENT_TYPE_OPTIONS = [
  { value: 'indian_resident', label: 'Indian Resident' },
  { value: 'nri', label: 'NRI' },
  { value: 'merchant_navy', label: 'Merchant Navy' },
];

// Business type options
const BUSINESS_TYPE_OPTIONS = [
  { value: 'proprietor', label: 'Proprietor' },
  { value: 'partnership', label: 'Partnership' },
  { value: 'pvt_ltd', label: 'Pvt Ltd' },
  { value: 'llp', label: 'LLP' },
];

const ChecklistPage: React.FC = () => {
  const [selection, setSelection] = useState<Selection>({
    loanType: 'home_loan',
    loanStatus: undefined,
    incomeSource: undefined,
    residentType: undefined,
    businessType: undefined,
  });

  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>([]);

  // Compute which steps should be visible based on current selection
  const visibleSteps = useMemo(() => {
    const steps: string[] = ['loanType'];

    if (selection.loanType) {
      steps.push('loanStatus');
    }

    if (selection.loanStatus) {
      steps.push('incomeSource');
    }

    if (selection.incomeSource) {
      steps.push('residentType');
    }

    // Business type is only for non_salaried + indian_resident
    if (
      selection.incomeSource === 'non_salaried' &&
      selection.residentType === 'indian_resident'
    ) {
      steps.push('businessType');
    }

    return steps;
  }, [selection.loanType, selection.loanStatus, selection.incomeSource, selection.residentType]);

  // Compute which steps should be disabled based on current selection
  const disabledSteps = useMemo(() => {
    const disabled: string[] = [];

    // loanStatus disabled if loanType not selected
    if (!selection.loanType) {
      disabled.push('loanStatus');
    }

    // incomeSource disabled if loanStatus not selected
    if (!selection.loanStatus) {
      disabled.push('incomeSource');
    }

    // residentType disabled if incomeSource not selected
    if (!selection.incomeSource) {
      disabled.push('residentType');
    }

    // businessType disabled if not non_salaried + indian_resident
    if (
      selection.incomeSource !== 'non_salaried' ||
      selection.residentType !== 'indian_resident'
    ) {
      disabled.push('businessType');
    }

    return disabled;
  }, [selection.loanType, selection.loanStatus, selection.incomeSource, selection.residentType]);

  // Update checklist when selection changes
  useEffect(() => {
    const items = getChecklist(selection);
    setChecklistItems(items);
  }, [selection]);

  const handleSelectionChange = (key: keyof Selection, value: string) => {
    const newSelection = { ...selection, [key]: value } as Selection;

    // Reset dependent fields when a selection changes
    if (key === 'loanType') {
      newSelection.loanStatus = undefined;
      newSelection.incomeSource = undefined;
      newSelection.residentType = undefined;
      newSelection.businessType = undefined;
    } else if (key === 'loanStatus') {
      newSelection.incomeSource = undefined;
      newSelection.residentType = undefined;
      newSelection.businessType = undefined;
    } else if (key === 'incomeSource') {
      newSelection.residentType = undefined;
      newSelection.businessType = undefined;
    } else if (key === 'residentType') {
      newSelection.businessType = undefined;
    }

    setSelection(newSelection);
  };

  const getStepVisibility = (stepKey: string) => {
    return visibleSteps.includes(stepKey);
  };

  const getStepDisabled = (stepKey: string) => {
    return disabledSteps.includes(stepKey);
  };

  const isChecklistVisible = visibleSteps.includes('businessType') ||
    (visibleSteps.includes('residentType') && selection.incomeSource === 'salaried');

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 sm:text-4xl">
            Loan Checklist
          </h1>
          <p className="mt-2 text-lg text-gray-600">
            Select your loan details to see the required documents
          </p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-8">
          <div className="space-y-6" role="form" aria-label="Loan selection form">
            <DropdownStep
              stepKey="loanType"
              label="Loan Type"
              options={LOAN_TYPE_OPTIONS}
              value={selection.loanType}
              onChange={(value) => handleSelectionChange('loanType', value)}
              isDisabled={false}
              stepNumber={1}
              isVisible={true}
            />

            <DropdownStep
              stepKey="loanStatus"
              label="Loan Status"
              options={LOAN_STATUS_OPTIONS}
              value={selection.loanStatus}
              onChange={(value) => handleSelectionChange('loanStatus', value)}
              isDisabled={getStepDisabled('loanStatus')}
              stepNumber={2}
              isVisible={getStepVisibility('loanStatus')}
            />

            <DropdownStep
              stepKey="incomeSource"
              label="Income Source"
              options={INCOME_SOURCE_OPTIONS}
              value={selection.incomeSource}
              onChange={(value) => handleSelectionChange('incomeSource', value)}
              isDisabled={getStepDisabled('incomeSource')}
              stepNumber={3}
              isVisible={getStepVisibility('incomeSource')}
            />

            <DropdownStep
              stepKey="residentType"
              label="Resident Type"
              options={RESIDENT_TYPE_OPTIONS}
              value={selection.residentType}
              onChange={(value) => handleSelectionChange('residentType', value)}
              isDisabled={getStepDisabled('residentType')}
              stepNumber={4}
              isVisible={getStepVisibility('residentType')}
            />

            <DropdownStep
              stepKey="businessType"
              label="Business Type"
              options={BUSINESS_TYPE_OPTIONS}
              value={selection.businessType}
              onChange={(value) => handleSelectionChange('businessType', value)}
              isDisabled={getStepDisabled('businessType')}
              stepNumber={5}
              isVisible={getStepVisibility('businessType')}
            />
          </div>
        </div>

        {isChecklistVisible && (
          <div
            className="animate-fade-in"
            style={{
              animation: 'fadeIn 200ms ease-out',
            }}
          >
            <h2 className="text-2xl font-semibold text-gray-900 mb-6">
              Required Documents
            </h2>
            <ChecklistDisplay items={checklistItems} />
            <ActionBar selection={selection} items={checklistItems} />
          </div>
        )}
      </div>

      <style>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fade-in {
          animation: fadeIn 200ms ease-out;
        }
      `}</style>
    </div>
  );
};

export default ChecklistPage;