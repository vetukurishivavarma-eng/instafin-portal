import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { supabase } from '../lib/supabase.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';

const router = express.Router();

const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

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
  limits: { fileSize: 10 * 1024 * 1024 },
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
      cb(new Error('Invalid file type'));
    }
  },
});

router.use(authenticate);

// GET /api/documents/checklist?loanType=<type>
router.get('/checklist', authorize('admin', 'executive', 'dsa'), async (req, res) => {
  try {
    const { loanType } = req.query;

    if (!loanType) {
      return res.status(400).json({ error: 'loanType parameter is required' });
    }

    console.log('Fetching checklist for loan type:', loanType);

    const { data: docTypes, error } = await supabase
      .from('document_types')
      .select('*')
      .eq('loan_type', loanType);

    console.log('Supabase response:', docTypes, 'error:', error);

    if (error) throw error;

    res.json(docTypes.map(d => ({
      name: d.name,
      category: d.category,
      required: d.required
    })));
  } catch (error) {
    console.error('Checklist error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/documents/upload
router.post('/upload', authorize('admin', 'executive', 'dsa'), upload.single('file'), async (req, res) => {
  try {
    const { leadId, documentType } = req.body;

    if (!leadId) {
      return res.status(400).json({ error: 'leadId is required' });
    }

    if (!documentType) {
      return res.status(400).json({ error: 'documentType is required' });
    }

    // Check if lead exists
    const { data: lead } = await supabase
      .from('leads')
      .select('id')
      .eq('id', leadId)
      .single();

    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    let fileName = null;
    let filePath = null;

    if (req.file) {
      fileName = req.file.originalname;
      filePath = req.file.filename;
    }

    const { data: newDoc, error } = await supabase
      .from('lead_documents')
      .insert({
        lead_id: leadId,
        document_type: documentType,
        file_name: fileName,
        file_path: filePath
      })
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({
      id: newDoc.id,
      leadId: newDoc.lead_id,
      documentType: newDoc.document_type,
      fileName: newDoc.file_name,
      uploadedAt: newDoc.uploaded_at
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Failed to upload document' });
  }
});

// GET /api/documents/lead/:leadId
router.get('/lead/:leadId', authorize('admin', 'executive', 'dsa'), async (req, res) => {
  try {
    const { leadId } = req.params;

    const { data: lead } = await supabase
      .from('leads')
      .select('id')
      .eq('id', leadId)
      .single();

    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    const { data: documents, error } = await supabase
      .from('lead_documents')
      .select('*')
      .eq('lead_id', leadId);

    if (error) throw error;

    res.json(documents.map(d => ({
      id: d.id,
      leadId: d.lead_id,
      documentType: d.document_type,
      fileName: d.file_name,
      uploadedAt: d.uploaded_at
    })));
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch documents' });
  }
});

// GET /api/documents/:id
router.get('/:id', authorize('admin', 'executive', 'dsa'), async (req, res) => {
  try {
    const { data: document, error } = await supabase
      .from('lead_documents')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (error || !document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    res.json({
      id: document.id,
      leadId: document.lead_id,
      documentType: document.document_type,
      fileName: document.file_name
    });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/documents/:id
router.delete('/:id', authorize('admin', 'executive'), async (req, res) => {
  try {
    const { data: doc } = await supabase
      .from('lead_documents')
      .select('file_path')
      .eq('id', req.params.id)
      .single();

    if (doc && doc.file_path) {
      const filePath = path.join(uploadsDir, doc.file_path);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    const { error } = await supabase
      .from('lead_documents')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;

    res.json({ message: 'Document deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete document' });
  }
});

export default router;