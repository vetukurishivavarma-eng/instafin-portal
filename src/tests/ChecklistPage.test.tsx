import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ChecklistPage from '../components/ChecklistPage';

describe('ChecklistPage Component', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  describe('Integration: full flow salaried+NRI renders checklist section', () => {
    it('shows Required Documents section when all selections are complete (salaried + NRI)', async () => {
      render(<ChecklistPage />);

      // Complete the flow: default loanType -> loanStatus -> incomeSource -> residentType
      let button = screen.getByText(/select loan status/i);
      await userEvent.click(button);
      await userEvent.click(screen.getByText('New Loan'));

      button = screen.getByText(/select income source/i);
      await userEvent.click(button);
      await userEvent.click(screen.getByText('Salaried'));

      button = screen.getByText(/select resident type/i);
      await userEvent.click(button);
      await userEvent.click(screen.getByText('NRI'));

      // Checklist section should now be visible
      expect(screen.getByText('Required Documents')).toBeDefined();
    });

    it('shows Required Documents section when all selections complete (non-salaried + proprietor)', async () => {
      render(<ChecklistPage />);

      // Change loan type first
      let button = screen.getByText('Home Loan');
      await userEvent.click(button);
      await userEvent.click(screen.getByText('Business Loan'));

      // Complete the flow
      button = screen.getByText(/select loan status/i);
      await userEvent.click(button);
      await userEvent.click(screen.getByText('New Loan'));

      button = screen.getByText(/select income source/i);
      await userEvent.click(button);
      await userEvent.click(screen.getByText('Non-Salaried'));

      button = screen.getByText(/select resident type/i);
      await userEvent.click(button);
      await userEvent.click(screen.getByText('Indian Resident'));

      button = screen.getByText(/select business type/i);
      await userEvent.click(button);
      await userEvent.click(screen.getByText('Proprietor'));

      // Checklist section should be visible
      expect(screen.getByText('Required Documents')).toBeDefined();
    });
  });

  describe('Component rendering', () => {
    it('renders all DropdownStep components', () => {
      render(<ChecklistPage />);

      expect(screen.getByText('Loan Type')).toBeDefined();
      expect(screen.getByText('Loan Status')).toBeDefined();
      expect(screen.getByText('Income Source')).toBeDefined();
      expect(screen.getByText('Resident Type')).toBeDefined();
      expect(screen.getByText('Business Type')).toBeDefined();
    });

    it('renders loan type dropdown with Home Loan selected by default', () => {
      render(<ChecklistPage />);

      // Default selection is 'home_loan', so "Home Loan" should be shown
      expect(screen.getByText('Home Loan')).toBeDefined();
    });

    it('renders loan status dropdown with placeholder when not selected', () => {
      render(<ChecklistPage />);

      // loanStatus is not selected by default, so placeholder should show
      expect(screen.getByText('Select loan status')).toBeDefined();
    });
  });

  describe('Conditional rendering - each DropdownStep renders only when parent selected', () => {
    it('loanStatus dropdown is visible when loanType is already selected (default)', () => {
      render(<ChecklistPage />);

      // loanType is already set to home_loan by default, so loanStatus should be visible
      const loanStatusLabel = screen.getByText('Loan Status');
      expect(loanStatusLabel.parentElement).not.toHaveClass('opacity-0');
    });

    it('incomeSource becomes visible when loanStatus is selected', async () => {
      render(<ChecklistPage />);

      // Select loan status
      let button = screen.getByText(/select loan status/i);
      await userEvent.click(button);
      await userEvent.click(screen.getByText('New Loan'));

      // Now incomeSource should be visible
      const incomeSourceLabel = screen.getByText('Income Source');
      expect(incomeSourceLabel.parentElement).not.toHaveClass('opacity-0');
    });

    it('residentType becomes visible when incomeSource is selected', async () => {
      render(<ChecklistPage />);

      // Select loan status
      let button = screen.getByText(/select loan status/i);
      await userEvent.click(button);
      await userEvent.click(screen.getByText('New Loan'));

      // Select income source
      button = screen.getByText(/select income source/i);
      await userEvent.click(button);
      await userEvent.click(screen.getByText('Salaried'));

      // Now residentType should be visible
      const residentTypeLabel = screen.getByText('Resident Type');
      expect(residentTypeLabel.parentElement).not.toHaveClass('opacity-0');
    });

    it('businessType only visible for non_salaried + indian_resident', async () => {
      render(<ChecklistPage />);

      // Complete selections up to residentType with salaried
      let button = screen.getByText(/select loan status/i);
      await userEvent.click(button);
      await userEvent.click(screen.getByText('New Loan'));

      button = screen.getByText(/select income source/i);
      await userEvent.click(button);
      await userEvent.click(screen.getByText('Salaried'));

      button = screen.getByText(/select resident type/i);
      await userEvent.click(button);
      await userEvent.click(screen.getByText('Indian Resident'));

      // Business Type should NOT be visible for salaried
      const businessTypeLabel = screen.getByText('Business Type');
      expect(businessTypeLabel.parentElement).toHaveClass('opacity-0');
    });

    it('businessType visible when non_salaried + indian_resident selected', async () => {
      render(<ChecklistPage />);

      // Complete selections to non_salaried + indian_resident
      let button = screen.getByText(/select loan status/i);
      await userEvent.click(button);
      await userEvent.click(screen.getByText('New Loan'));

      button = screen.getByText(/select income source/i);
      await userEvent.click(button);
      await userEvent.click(screen.getByText('Non-Salaried'));

      button = screen.getByText(/select resident type/i);
      await userEvent.click(button);
      await userEvent.click(screen.getByText('Indian Resident'));

      // Business Type should be visible for non_salaried + indian_resident
      const businessTypeLabel = screen.getByText('Business Type');
      expect(businessTypeLabel.parentElement).not.toHaveClass('opacity-0');
    });
  });

  describe('Edge: incomplete selection → no checklist rendered', () => {
    it('shows no checklist when only loanType is selected (default)', () => {
      render(<ChecklistPage />);

      // With only loanType selected (default), checklist should not be visible
      // because loanStatus is not selected yet
      expect(screen.queryByText('Required Documents')).toBeNull();
    });

    it('shows no checklist when loanType and loanStatus selected but incomeSource missing', async () => {
      render(<ChecklistPage />);

      // Select loanStatus
      const button = screen.getByText(/select loan status/i);
      await userEvent.click(button);
      await userEvent.click(screen.getByText('New Loan'));

      // incomeSource is not selected yet
      expect(screen.queryByText('Required Documents')).toBeNull();
    });

    it('shows no checklist when selections are incomplete', async () => {
      render(<ChecklistPage />);

      // Don't make any selections - only loanType is default
      // Checklist should NOT show because loanStatus is not selected
      expect(screen.queryByText('Required Documents')).toBeNull();
    });
  });
});