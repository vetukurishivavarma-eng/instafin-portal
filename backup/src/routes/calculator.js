import express from 'express';

const router = express.Router();

// EMI Calculator
router.post('/emi', (req, res) => {
  const { principal, interestRate, tenure } = req.body;

  if (!principal || !interestRate || !tenure) {
    return res.status(400).json({ error: 'Principal, interestRate, and tenure are required' });
  }

  const monthlyRate = interestRate / (12 * 100);
  const months = tenure * 12;

  if (monthlyRate === 0) {
    return res.json({ emi: principal / months, totalInterest: 0, totalPayment: principal });
  }

  const emi = (principal * monthlyRate * Math.pow(1 + monthlyRate, months)) / (Math.pow(1 + monthlyRate, months) - 1);
  const totalPayment = emi * months;
  const totalInterest = totalPayment - principal;

  res.json({
    emi: Math.round(emi),
    totalInterest: Math.round(totalInterest),
    totalPayment: Math.round(totalPayment),
  });
});

// Eligibility Calculator - Salaried
router.post('/eligibility/salaried', (req, res) => {
  const { monthlyGrossSalary, otherIncome, existingEmi, loanTenure, interestRate, incomeTaxDeductions, emiNmiRatio, propertyValue, ltv } = req.body;

  const netMonthlyIncome = monthlyGrossSalary + (otherIncome || 0) - (incomeTaxDeductions || 0);
  const maxEmi = netMonthlyIncome * ((emiNmiRatio || 50) / 100);
  const availableEmiForNewLoan = maxEmi - (existingEmi || 0);

  const monthlyRate = (interestRate || 8.5) / (12 * 100);
  const months = (loanTenure || 20) * 12;

  let eligibleAmount = 0;
  if (monthlyRate > 0 && availableEmiForNewLoan > 0) {
    eligibleAmount = (availableEmiForNewLoan * (Math.pow(1 + monthlyRate, months) - 1)) / (monthlyRate * Math.pow(1 + monthlyRate, months));
  }

  // LTV based eligibility for property loan
  const ltvBasedAmount = (propertyValue || 0) * ((ltv || 80) / 100);
  const finalEligibleAmount = Math.min(eligibleAmount, ltvBasedAmount);

  res.json({
    eligibleAmount: Math.round(finalEligibleAmount),
    maxEmi: Math.round(availableEmiForNewLoan),
    netMonthlyIncome: Math.round(netMonthlyIncome),
    ltvBasedAmount: Math.round(ltvBasedAmount),
  });
});

// Eligibility Calculator - Non-Salaried
router.post('/eligibility/non-salaried', (req, res) => {
  const { yearlyIncome, avgMonthlyIncome, businessVintage, existingEmi, loanTenure, interestRate, incomeTaxDeductions, emiNmiRatio, propertyValue, ltv } = req.body;

  const netAnnualIncome = yearlyIncome - (incomeTaxDeductions || 0);
  const netMonthlyIncome = (avgMonthlyIncome || netAnnualIncome / 12);
  const maxEmi = netMonthlyIncome * ((emiNmiRatio || 50) / 100);
  const availableEmiForNewLoan = maxEmi - (existingEmi || 0);

  const monthlyRate = (interestRate || 10) / (12 * 100);
  const months = (loanTenure || 15) * 12;

  let eligibleAmount = 0;
  if (monthlyRate > 0 && availableEmiForNewLoan > 0) {
    eligibleAmount = (availableEmiForNewLoan * (Math.pow(1 + monthlyRate, months) - 1)) / (monthlyRate * Math.pow(1 + monthlyRate, months));
  }

  // Vintage multiplier (1.0 to 1.5 based on years)
  const vintageMultiplier = Math.min(1.5, 1.0 + (businessVintage || 1) * 0.1);
  eligibleAmount *= vintageMultiplier;

  // LTV based eligibility
  const ltvBasedAmount = (propertyValue || 0) * ((ltv || 75) / 100);
  const finalEligibleAmount = Math.min(eligibleAmount, ltvBasedAmount);

  res.json({
    eligibleAmount: Math.round(finalEligibleAmount),
    maxEmi: Math.round(availableEmiForNewLoan),
    vintageMultiplier,
    ltvBasedAmount: Math.round(ltvBasedAmount),
  });
});

// Compare loan products
router.post('/compare', (req, res) => {
  const { loanAmount, tenure } = req.body;

  const products = [
    { name: 'SBI Home Loan', rate: 8.4, minAmount: 500000, maxAmount: 30000000 },
    { name: 'HDFC Home Loan', rate: 8.5, minAmount: 300000, maxAmount: 35000000 },
    { name: 'ICICI Home Loan', rate: 8.6, minAmount: 500000, maxAmount: 30000000 },
    { name: 'PNB Home Loan', rate: 8.35, minAmount: 100000, maxAmount: 25000000 },
    { name: 'Bajaj Finserv LAP', rate: 10.5, minAmount: 500000, maxAmount: 50000000 },
    { name: 'Tata Capital LAP', rate: 10.75, minAmount: 100000, maxAmount: 45000000 },
  ];

  const comparison = products.map(product => {
    if (loanAmount < product.minAmount || loanAmount > product.maxAmount) {
      return { ...product, eligible: false };
    }

    const monthlyRate = product.rate / (12 * 100);
    const months = tenure * 12;
    const emi = (loanAmount * monthlyRate * Math.pow(1 + monthlyRate, months)) / (Math.pow(1 + monthlyRate, months) - 1);
    const totalPayment = emi * months;

    return {
      ...product,
      eligible: true,
      emi: Math.round(emi),
      totalInterest: Math.round(totalPayment - loanAmount),
      totalPayment: Math.round(totalPayment),
    };
  });

  res.json(comparison);
});

export default router;
