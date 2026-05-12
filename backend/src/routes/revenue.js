import express from 'express';
import { revenues } from '../data/store.js';

const router = express.Router();

// GET all revenue records
router.get('/', (req, res) => {
  res.json(revenues);
});

// GET revenue by sanction ID
router.get('/sanction/:sanctionId', (req, res) => {
  const revenue = revenues.find(r => r.sanctionId === req.params.sanctionId);
  if (!revenue) return res.status(404).json({ error: 'Revenue record not found' });
  res.json(revenue);
});

// POST calculate revenue
router.post('/calculate', (req, res) => {
  const { sanctionId, loanAmount, sanctionedAmount, bankPayoutPercent, executiveIncentive } = req.body;

  const grossRevenue = sanctionedAmount * (bankPayoutPercent / 100);
  const netProfit = grossRevenue - (executiveIncentive || 0);

  const revenue = {
    id: Date.now().toString(),
    sanctionId,
    loanAmount,
    sanctionedAmount,
    bankPayoutPercent,
    grossRevenue,
    executiveIncentive: executiveIncentive || 0,
    netProfit,
    createdAt: new Date().toISOString(),
  };

  revenues.push(revenue);
  res.status(201).json(revenue);
});

// GET total revenue stats
router.get('/stats/total', (req, res) => {
  const totalLoanAmount = revenues.reduce((sum, r) => sum + (r.sanctionedAmount || 0), 0);
  const totalGrossRevenue = revenues.reduce((sum, r) => sum + (r.grossRevenue || 0), 0);
  const totalNetProfit = revenues.reduce((sum, r) => sum + (r.netProfit || 0), 0);

  res.json({
    totalCases: revenues.length,
    totalLoanAmount,
    totalGrossRevenue,
    totalNetProfit,
  });
});

// GET revenue report
router.get('/report', (req, res) => {
  const report = revenues.map(r => ({
    sanctionId: r.sanctionId,
    loanAmount: r.loanAmount,
    sanctionedAmount: r.sanctionedAmount,
    grossRevenue: r.grossRevenue,
    executiveIncentive: r.executiveIncentive,
    netProfit: r.netProfit,
    createdAt: r.createdAt,
  }));

  const totals = {
    totalLoanAmount: revenues.reduce((sum, r) => sum + (r.sanctionedAmount || 0), 0),
    totalGrossRevenue: revenues.reduce((sum, r) => sum + (r.grossRevenue || 0), 0),
    totalExecutiveIncentives: revenues.reduce((sum, r) => sum + (r.executiveIncentive || 0), 0),
    totalNetProfit: revenues.reduce((sum, r) => sum + (r.netProfit || 0), 0),
  };

  res.json({ report, totals });
});

// PUT update revenue
router.put('/:id', (req, res) => {
  const index = revenues.findIndex(r => r.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'Revenue not found' });

  revenues[index] = { ...revenues[index], ...req.body };
  res.json(revenues[index]);
});

export default router;
