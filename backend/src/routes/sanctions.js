import express from 'express';
import { sanctions } from '../data/store.js';

const router = express.Router();

// GET all sanctions
router.get('/', (req, res) => {
  res.json(sanctions);
});

// GET single sanction
router.get('/:id', (req, res) => {
  const sanction = sanctions.find(s => s.id === req.params.id);
  if (!sanction) return res.status(404).json({ error: 'Sanction not found' });
  res.json(sanction);
});

// POST create sanction
router.post('/', (req, res) => {
  const { leadId, customerName, sanctionedAmount, interestRate, loanTenure, emiAmount, sanctionDate, processingFee, insuranceAmount } = req.body;

  const newSanction = {
    id: Date.now().toString(),
    leadId,
    customerName,
    sanctionedAmount,
    interestRate,
    loanTenure,
    emiAmount,
    sanctionDate: sanctionDate || new Date().toISOString(),
    processingFee,
    insuranceAmount,
    sanctionLetter: null,
    status: 'Sanctioned',
    createdAt: new Date().toISOString(),
  };

  sanctions.push(newSanction);
  res.status(201).json(newSanction);
});

// PUT update sanction
router.put('/:id', (req, res) => {
  const index = sanctions.findIndex(s => s.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'Sanction not found' });

  sanctions[index] = { ...sanctions[index], ...req.body };
  res.json(sanctions[index]);
});

// POST upload sanction letter
router.post('/:id/letter', (req, res) => {
  const index = sanctions.findIndex(s => s.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'Sanction not found' });

  const { fileName } = req.body;
  sanctions[index].sanctionLetter = fileName;
  res.json(sanctions[index]);
});

// PUT update status (for disbursement)
router.put('/:id/disburse', (req, res) => {
  const index = sanctions.findIndex(s => s.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'Sanction not found' });

  sanctions[index].status = 'Disbursed';
  sanctions[index].disbursedAt = new Date().toISOString();
  res.json(sanctions[index]);
});

// DELETE sanction
router.delete('/:id', (req, res) => {
  const index = sanctions.findIndex(s => s.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'Sanction not found' });

  sanctions.splice(index, 1);
  res.json({ message: 'Sanction deleted' });
});

export default router;
