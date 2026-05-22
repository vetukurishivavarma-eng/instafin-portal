import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { documentTypes, leadDocuments, leads } from '../data/store.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';

const router = express.Router();

// Ensure uploads directory exists
const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${uuidv4()}-${file.originalname}`;
    cb(null, uniqueName);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/jpg',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF, JPEG, PNG, and Word documents are allowed.'));
    }
  },
});

// Apply authenticate middleware to all routes
router.use(authenticate);

// GET /api/documents/checklist?loanType=<type> - Get required documents for a loan type
router.get('/checklist', authorize('admin', 'executive', 'dsa'), (req, res) => {
  try {
    const { loanType } = req.query;

    if (!loanType) {
      return res.status(400).json({ error: 'loanType parameter is required' });
    }

    const checklist = documentTypes[loanType];

    if (!checklist) {
      return res.status(404).json({
        error: 'Loan type not found',
        availableTypes: Object.keys(documentTypes),
      });
    }

    res.json(checklist);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/documents/upload - Upload document (leadId, documentName, file)
router.post('/upload', authorize('admin', 'executive', 'dsa'), upload.single('file'), (req, res) => {
  try {
    const { leadId, documentName } = req.body;

    if (!leadId) {
      return res.status(400).json({ error: 'leadId is required' });
    }

    if (!documentName) {
      return res.status(400).json({ error: 'documentName is required' });
    }

    // Check if lead exists
    const lead = leads.find(l => l.id === leadId);
    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'File is required' });
    }

    // Determine category based on document name
    let category = 'Other';
    const loanType = lead.loanType;
    const docTypes = documentTypes[loanType] || [];
    const docType = docTypes.find(d => d.name === documentName);
    if (docType) {
      category = docType.category;
    }

    const newDocument = {
      id: uuidv4(),
      leadId,
      documentName,
      category,
      fileName: req.file.originalname,
      filePath: req.file.filename,
      mimeType: req.file.mimetype,
      size: req.file.size,
      status: 'pending',
      uploadedBy: req.user.id,
      uploadedAt: new Date().toISOString(),
      verifiedAt: null,
      remarks: '',
    };

    leadDocuments.push(newDocument);
    res.status(201).json(newDocument);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/documents/lead/:leadId - Get all documents for a lead
router.get('/lead/:leadId', authorize('admin', 'executive', 'dsa'), (req, res) => {
  try {
    const { leadId } = req.params;

    // Check if lead exists
    const lead = leads.find(l => l.id === leadId);
    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    // Filter documents for this lead
    const documents = leadDocuments.filter(d => d.leadId === leadId);

    res.json(documents);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/documents/:id - Get single document
router.get('/:id', authorize('admin', 'executive', 'dsa'), (req, res) => {
  try {
    const document = leadDocuments.find(d => d.id === req.params.id);

    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    res.json(document);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/documents/:id - Delete document
router.delete('/:id', authorize('admin', 'executive'), (req, res) => {
  try {
    const index = leadDocuments.findIndex(d => d.id === req.params.id);

    if (index === -1) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const document = leadDocuments[index];

    // Delete the file from filesystem
    const filePath = path.join(uploadsDir, document.filePath);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    // Remove from array
    leadDocuments.splice(index, 1);

    res.json({ message: 'Document deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/documents/:id/status - Update document status
router.put('/:id/status', authorize('admin', 'executive'), (req, res) => {
  try {
    const index = leadDocuments.findIndex(d => d.id === req.params.id);

    if (index === -1) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const { status, remarks } = req.body;

    // Validate status
    const validStatuses = ['pending', 'submitted', 'verified', 'rejected'];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({
        error: 'Invalid status',
        validStatuses,
      });
    }

    leadDocuments[index].status = status;

    if (status === 'verified') {
      leadDocuments[index].verifiedAt = new Date().toISOString();
    }

    if (remarks !== undefined) {
      leadDocuments[index].remarks = remarks;
    }

    res.json(leadDocuments[index]);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/documents/download/:id - Download document file
router.get('/download/:id', authorize('admin', 'executive', 'dsa'), (req, res) => {
  try {
    const document = leadDocuments.find(d => d.id === req.params.id);

    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const filePath = path.join(uploadsDir, document.filePath);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found on server' });
    }

    res.download(filePath, document.fileName);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;