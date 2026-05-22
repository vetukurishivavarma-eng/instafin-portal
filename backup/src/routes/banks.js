import express from 'express';
import { bankProducts, privateBankProducts, nbfcProducts, dynamicChecklists } from '../data/store.js';

const router = express.Router();

// GET all PSB banks
router.get('/psb', (req, res) => {
  res.json(bankProducts);
});

// GET all private banks
router.get('/private', (req, res) => {
  res.json(privateBankProducts);
});

// GET all NBFCS
router.get('/nbfc', (req, res) => {
  res.json(nbfcProducts);
});

// GET all banks
router.get('/', (req, res) => {
  res.json({
    psb: bankProducts,
    private: privateBankProducts,
    nbfc: nbfcProducts,
  });
});

// GET single bank details
router.get('/:type/:bankName', (req, res) => {
  const { type, bankName } = req.params;
  const decodedName = decodeURIComponent(bankName);

  let banks;
  switch (type) {
    case 'psb':
      banks = bankProducts;
      break;
    case 'private':
      banks = privateBankProducts;
      break;
    case 'nbfc':
      banks = nbfcProducts;
      break;
    default:
      return res.status(400).json({ error: 'Invalid bank type' });
  }

  const bank = banks.find(b => b.bank === decodedName);
  if (!bank) return res.status(404).json({ error: 'Bank not found' });

  res.json(bank);
});

// GET checklist for bank
router.get('/:type/:bankName/checklist/:loanType', (req, res) => {
  const { bankName, loanType } = req.params;
  const decodedName = decodeURIComponent(bankName);
  const key = `${decodedName}-${loanType}`;

  const checklist = dynamicChecklists[key];
  if (!checklist) {
    return res.json({
      bank: decodedName,
      loanType,
      documents: [
        "Aadhaar Card",
        "PAN Card",
        "Bank Statements - 6 Months",
        "Income Proof",
      ],
    });
  }

  res.json({ bank: decodedName, loanType, documents: checklist });
});

// GET all checklists
router.get('/checklists/all', (req, res) => {
  res.json(dynamicChecklists);
});

// GET application form for bank and loan type
router.get('/:type/:bankName/form/:loanType', (req, res) => {
  const { type, bankName, loanType } = req.params;
  const decodedName = decodeURIComponent(bankName);

  let banks;
  switch (type) {
    case 'psb':
      banks = bankProducts;
      break;
    case 'private':
      banks = privateBankProducts;
      break;
    case 'nbfc':
      banks = nbfcProducts;
      break;
    default:
      return res.status(400).json({ error: 'Invalid bank type' });
  }

  const bank = banks.find(b => b.bank === decodedName);
  if (!bank) return res.status(404).json({ error: 'Bank not found' });

  const loanTypeMap = {
    'Home Loan': 0,
    'LAP': 1,
    'Business Loan': 2,
    'Personal Loan': 3,
    'Mudra Loan': 2,
    'MSME Loan': 2,
  };

  const formIndex = loanTypeMap[loanType];
  const form = bank.forms[formIndex] || bank.forms[0];

  res.json({
    bank: bank.bank,
    loanType,
    formName: form,
    downloadUrl: `/forms/${form}`,
  });
});

export default router;
