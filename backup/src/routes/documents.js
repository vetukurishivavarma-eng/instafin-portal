import express from 'express';
import { dynamicChecklists } from '../data/store.js';

const router = express.Router();

// In-memory document store
const uploadedDocuments = {};
const creditQueries = [
  { id: '1', leadId: '1', query: 'IT Returns Required Again', status: 'Pending' }
];
const expiredDocuments = [
  { id: '1', leadId: '1', name: 'Bank Statement - Expired', expiryDate: '2026-03-01' }
];

// GET checklist for bank and loan type
router.get('/checklist', (req, res) => {
  const { bank, loanType } = req.query;
  const key = `${bank}-${loanType}`;
  const checklist = dynamicChecklists[key] || [];
  res.json(checklist);
});

// GET all checklists
router.get('/checklists', (req, res) => {
  res.json(dynamicChecklists);
});

// GET uploaded documents for a lead
router.get('/:leadId', (req, res) => {
  const docs = uploadedDocuments[req.params.leadId] || [];
  res.json(docs);
});

// POST upload document
router.post('/:leadId', (req, res) => {
  const { leadId } = req.params;
  const { documentName, fileName, uploadDate } = req.body;

  if (!uploadedDocuments[leadId]) {
    uploadedDocuments[leadId] = [];
  }

  const doc = {
    id: Date.now().toString(),
    documentName,
    fileName,
    uploadDate: uploadDate || new Date().toISOString(),
    status: 'Received',
  };

  uploadedDocuments[leadId].push(doc);
  res.status(201).json(doc);
});

// DELETE document
router.delete('/:leadId/:documentId', (req, res) => {
  const { leadId, documentId } = req.params;
  if (!uploadedDocuments[leadId]) {
    return res.status(404).json({ error: 'No documents found' });
  }

  const index = uploadedDocuments[leadId].findIndex(d => d.id === documentId);
  if (index === -1) return res.status(404).json({ error: 'Document not found' });

  uploadedDocuments[leadId].splice(index, 1);
  res.json({ message: 'Document deleted' });
});

// GET credit queries
router.get('/queries/:leadId', (req, res) => {
  const queries = creditQueries.filter(q => q.leadId === req.params.leadId);
  res.json(queries);
});

// POST add credit query
router.post('/queries/:leadId', (req, res) => {
  const { query } = req.body;
  const newQuery = {
    id: Date.now().toString(),
    leadId: req.params.leadId,
    query,
    status: 'Pending',
    createdAt: new Date().toISOString(),
  };
  creditQueries.push(newQuery);
  res.status(201).json(newQuery);
});

// PUT resolve query
router.put('/queries/:queryId/resolve', (req, res) => {
  const query = creditQueries.find(q => q.id === req.params.queryId);
  if (!query) return res.status(404).json({ error: 'Query not found' });

  query.status = 'Resolved';
  query.resolvedAt = new Date().toISOString();
  res.json(query);
});

// GET expired documents
router.get('/expired/:leadId', (req, res) => {
  const docs = expiredDocuments.filter(d => d.leadId === req.params.leadId);
  res.json(docs);
});

// GET pending documents for a lead
router.get('/pending/:leadId', (req, res) => {
  const { bank, loanType } = req.query;
  const key = `${bank}-${loanType}`;
  const requiredDocs = dynamicChecklists[key] || [];
  const uploaded = uploadedDocuments[req.params.leadId] || [];

  const pending = requiredDocs.filter(doc =>
    !uploaded.some(u => u.documentName === doc)
  );

  res.json(pending);
});

export default router;
