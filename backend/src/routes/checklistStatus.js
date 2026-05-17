import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { supabase } from '../lib/supabase.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';

const router = express.Router();

// Local uploads directory
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

// GET /api/checklist-status/:leadId - Get all checklist statuses for a lead
router.get('/:leadId', authorize('admin', 'executive', 'dsa'), async (req, res) => {
  try {
    const { leadId } = req.params;

    const { data: statuses, error } = await supabase
      .from('lead_checklist_status')
      .select('*')
      .eq('lead_id', leadId);

    if (error) throw error;

    // Return as a map: { documentId: { status, filePath, uploadedAt } }
    const statusMap = {};
    (statuses || []).forEach(s => {
      statusMap[s.document_id] = {
        status: s.status,
        filePath: s.file_path,
        uploadedAt: s.uploaded_at,
        documentName: s.document_name
      };
    });

    res.json(statusMap);
  } catch (error) {
    console.error('Error fetching checklist statuses:', error);
    res.status(500).json({ error: 'Failed to fetch checklist statuses' });
  }
});

// POST /api/checklist-status/upload - Upload a document for a checklist item
router.post('/upload', authorize('admin', 'executive', 'dsa'), upload.single('file'), async (req, res) => {
  try {
    const { leadId, documentId, documentName } = req.body;

    if (!leadId || !documentId || !documentName) {
      return res.status(400).json({ error: 'leadId, documentId, and documentName are required' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'File is required' });
    }

    // Verify lead exists
    const { data: lead } = await supabase
      .from('leads')
      .select('id, customer_name')
      .eq('id', leadId)
      .single();

    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    let filePath;

    if (process.env.NODE_ENV === 'production') {
      // Production: try Supabase Storage, fall back to local if it fails
      try {
        const fileBuffer = fs.readFileSync(req.file.path);
        const storagePath = `${leadId}/${uuidv4()}-${req.file.originalname}`;
        const { data, error } = await supabase.storage
          .from('lead-documents')
          .upload(storagePath, fileBuffer, { contentType: req.file.mimetype });

        if (error) throw error;
        filePath = storagePath;

        // Clean up local temp file
        fs.unlinkSync(req.file.path);
      } catch (storageErr) {
        console.warn('Supabase Storage upload failed, using local storage:', storageErr.message);
        filePath = req.file.filename;
      }
    } else {
      // Development: keep local file
      filePath = req.file.filename;
    }

    // Upsert checklist status
    const { data: statusRecord, error: upsertError } = await supabase
      .from('lead_checklist_status')
      .upsert({
        lead_id: leadId,
        document_id: documentId,
        document_name: documentName,
        status: 'uploaded',
        file_path: filePath,
        uploaded_at: new Date().toISOString()
      }, { onConflict: 'lead_id,document_id' })
      .select()
      .single();

    if (upsertError) throw upsertError;

    res.status(201).json({
      id: statusRecord.id,
      leadId: statusRecord.lead_id,
      documentId: statusRecord.document_id,
      documentName: statusRecord.document_name,
      status: statusRecord.status,
      uploadedAt: statusRecord.uploaded_at
    });
  } catch (error) {
    console.error('Checklist upload error:', error);
    res.status(500).json({ error: 'Failed to upload document' });
  }
});

// GET /api/checklist-status/file/:leadId/:documentId - Download an uploaded file
router.get('/file/:leadId/:documentId', authorize('admin', 'executive', 'dsa'), async (req, res) => {
  try {
    const { leadId, documentId } = req.params;

    const { data: record } = await supabase
      .from('lead_checklist_status')
      .select('file_path, document_name')
      .eq('lead_id', leadId)
      .eq('document_id', documentId)
      .single();

    if (!record || !record.file_path) {
      return res.status(404).json({ error: 'File not found' });
    }

    if (process.env.NODE_ENV === 'production') {
      // Production: get signed URL from Supabase Storage
      const { data, error } = await supabase.storage
        .from('lead-documents')
        .createSignedUrl(record.file_path, 3600); // 1 hour expiry

      if (error) throw error;
      return res.redirect(data.signedUrl);
    } else {
      // Development: serve local file
      const localPath = path.join(uploadsDir, record.file_path);
      if (!fs.existsSync(localPath)) {
        return res.status(404).json({ error: 'File not found on disk' });
      }
      return res.download(localPath, record.document_name);
    }
  } catch (error) {
    console.error('File download error:', error);
    res.status(500).json({ error: 'Failed to download file' });
  }
});

// GET /api/checklist-status/:leadId/pending - Get only pending documents
router.get('/:leadId/pending', authorize('admin', 'executive', 'dsa'), async (req, res) => {
  try {
    const { leadId } = req.params;

    const { data: statuses, error } = await supabase
      .from('lead_checklist_status')
      .select('document_id, document_name')
      .eq('lead_id', leadId)
      .eq('status', 'pending');

    if (error) throw error;

    res.json(statuses || []);
  } catch (error) {
    console.error('Error fetching pending documents:', error);
    res.status(500).json({ error: 'Failed to fetch pending documents' });
  }
});

export default router;
