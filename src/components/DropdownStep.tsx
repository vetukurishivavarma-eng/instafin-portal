import React, { useState, useRef, useEffect } from 'react';
import { Selection, LoanType, LoanStatus, IncomeSource, ResidentType, BusinessType } from '../checklist-spec';

interface DropdownStepProps {
  stepKey: keyof Selection;
  label: string;
  options: { value: string; label: string }[];
  value: string | undefined;
  onChange: (value: string) => void;
  isDisabled: boolean;
  stepNumber: number;
  isVisible: boolean;
}

const DropdownStep: React.FC<DropdownStepProps> = ({
  stepKey,
  label,
  options,
  value,
  onChange,
  isDisabled,
  stepNumber,
  isVisible,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isAnimatingIn, setIsAnimatingIn] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isVisible && !isAnimatingIn) {
      setIsAnimatingIn(true);
    }
  }, [isVisible, isAnimatingIn]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsOpen(false);
      dropdownRef.current?.querySelector('button')?.focus();
    }
  };

  const selectedOption = options.find((opt) => opt.value === value);

  return (
    <div
      ref={dropdownRef}
      className={`transition-all duration-200 ease-out ${
        isVisible
          ? 'opacity-100 translate-y-0'
          : 'opacity-0 -translate-y-2 pointer-events-none absolute'
      }`}
      style={{
        transitionProperty: 'opacity, transform',
        transitionDuration: '200ms',
        transitionTimingFunction: 'ease-out',
      }}
      onKeyDown={handleKeyDown}
    >
      <label
        htmlFor={`step-${stepKey}`}
        className="block text-sm font-medium text-gray-700 mb-2"
      >
        <span className="inline-flex items-center justify-center w-6 h-6 mr-2 text-xs font-semibold text-white bg-blue-600 rounded-full">
          {stepNumber}
        </span>
        {label}
      </label>

      <div className="relative">
        <button
          id={`step-${stepKey}`}
          type="button"
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          aria-label={`${label}, current selection: ${selectedOption?.label || 'none'}`}
          disabled={isDisabled}
          onClick={() => !isDisabled && setIsOpen(!isOpen)}
          className={`w-full px-4 py-3 text-left bg-white border rounded-lg transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
            isDisabled
              ? 'border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed'
              : 'border-gray-300 hover:border-gray-400'
          } ${isOpen ? 'ring-2 ring-blue-500 border-blue-500' : ''}`}
        >
          <span className={selectedOption ? 'text-gray-900' : 'text-gray-400'}>
            {selectedOption?.label || `Select ${label.toLowerCase()}`}
          </span>
          <span className="absolute inset-y-0 right-0 flex items-center pr-4 pointer-events-none">
            <svg
              className={`w-5 h-5 text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </span>
        </button>

        {isOpen && !isDisabled && (
          <ul
            role="listbox"
            aria-label={`${label} options`}
            className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-auto"
          >
            {options.map((option) => (
              <li
                key={option.value}
                role="option"
                aria-selected={option.value === value}
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                }}
                className={`px-4 py-3 cursor-pointer transition-colors duration-150 ${
                  option.value === value
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-700 hover:bg-gray-50'
                } ${options.indexOf(option) === 0 ? 'rounded-t-lg' : ''} ${
                  options.indexOf(option) === options.length - 1 ? 'rounded-b-lg' : ''}`}
              >
                {option.label}
              </li>
            ))}
          </ul>
        )}
      </div>

      {isDisabled && (
        <p className="mt-1 text-xs text-gray-400">
          Complete previous steps to enable this option
        </p>
      )}
    </div>
  );
};

export default DropdownStep;