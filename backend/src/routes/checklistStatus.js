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

/**
 * Helper: parse the document_name field which may be a JSON-encoded object
 * with name, description, and originalFile keys, or a plain string (legacy).
 */
function parseDocName(docName) {
  if (!docName) return { name: '', description: '', originalFile: '' };
  try {
    const parsed = JSON.parse(docName);
    return {
      name: parsed.name || '',
      description: parsed.description || '',
      originalFile: parsed.originalFile || parsed.file || '',
    };
  } catch {
    // Legacy: plain string
    return { name: docName, description: '', originalFile: '' };
  }
}

/**
 * Helper: build the document_name JSON string for storage
 */
function buildDocName(name, description, originalFile) {
  return JSON.stringify({ name, description, originalFile });
}

// GET /api/checklist-status/:leadId - Get all checklist statuses for a lead
// Returns files grouped by document_id, each file with id, description, filePath, fileName, uploadedAt
router.get('/:leadId', authorize('admin', 'executive', 'dsa'), async (req, res) => {
  try {
    const { leadId } = req.params;

    const { data: statuses, error } = await supabase
      .from('lead_checklist_status')
      .select('*')
      .eq('lead_id', leadId)
      .order('uploaded_at', { ascending: false });

    if (error) throw error;

    // Group files by document_id, return arrays
    const groupedMap = {};
    (statuses || []).forEach(s => {
      const docId = s.document_id;
      if (!groupedMap[docId]) {
        groupedMap[docId] = [];
      }
      const parsed = parseDocName(s.document_name);
      groupedMap[docId].push({
        id: s.id,
        status: s.status,
        filePath: s.file_path,
        uploadedAt: s.uploaded_at,
        documentId: s.document_id,
        documentName: parsed.name,
        description: parsed.description,
        originalFile: parsed.originalFile,
      });
    });

    // Also return a flat list
    const allFiles = Object.values(groupedMap).flat();

    res.json({
      grouped: groupedMap,
      files: allFiles,
    });
  } catch (error) {
    console.error('Error fetching checklist statuses:', error);
    res.status(500).json({ error: 'Failed to fetch checklist statuses' });
  }
});

// POST /api/checklist-status/upload - Upload a document for a checklist item
// Now accepts description and allows multiple files per document_id (INSERT, not upsert)
router.post('/upload', authorize('admin', 'executive', 'dsa'), upload.single('file'), async (req, res) => {
  try {
    const { leadId, documentId, documentName, description } = req.body;

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

    // Build the document_name JSON with description and original filename
    const storedDocName = buildDocName(documentName, description || '', req.file.originalname);

    // INSERT a new row (NOT upsert) to allow multiple files per document
    const { data: statusRecord, error: insertError } = await supabase
      .from('lead_checklist_status')
      .insert({
        lead_id: leadId,
        document_id: documentId,
        document_name: storedDocName,
        status: 'uploaded',
        file_path: filePath,
        uploaded_at: new Date().toISOString()
      })
      .select()
      .single();

    if (insertError) throw insertError;

    const parsed = parseDocName(statusRecord.document_name);

    res.status(201).json({
      id: statusRecord.id,
      leadId: statusRecord.lead_id,
      documentId: statusRecord.document_id,
      documentName: parsed.name,
      description: parsed.description,
      originalFile: parsed.originalFile,
      status: statusRecord.status,
      filePath: statusRecord.file_path,
      uploadedAt: statusRecord.uploaded_at
    });
  } catch (error) {
    console.error('Checklist upload error:', error);
    res.status(500).json({ error: 'Failed to upload document' });
  }
});

// GET /api/checklist-status/file/:fileId - Download an uploaded file by its record ID
router.get('/file/:fileId', authorize('admin', 'executive', 'dsa'), async (req, res) => {
  try {
    const { fileId } = req.params;

    const { data: record } = await supabase
      .from('lead_checklist_status')
      .select('file_path, document_name')
      .eq('id', fileId)
      .single();

    if (!record || !record.file_path) {
      return res.status(404).json({ error: 'File not found' });
    }

    const parsed = parseDocName(record.document_name);
    const downloadName = parsed.originalFile || parsed.name || 'document';

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
      return res.download(localPath, downloadName);
    }
  } catch (error) {
    console.error('File download error:', error);
    res.status(500).json({ error: 'Failed to download file' });
  }
});

// DELETE /api/checklist-status/file/:fileId - Delete an uploaded document by its record ID
router.delete('/file/:fileId', authorize('admin', 'executive', 'dsa'), async (req, res) => {
  try {
    const { fileId } = req.params;

    console.log(`DELETE checklist-status file: fileId=${fileId}`);

    // Get the record first to find the file path and lead_id
    const { data: record } = await supabase
      .from('lead_checklist_status')
      .select('file_path, lead_id')
      .eq('id', fileId)
      .single();

    if (!record) {
      return res.status(404).json({ error: 'Record not found' });
    }

    // Verify lead exists
    const { data: lead } = await supabase
      .from('leads')
      .select('id')
      .eq('id', record.lead_id)
      .single();

    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    // Delete file from storage
    if (record.file_path) {
      if (process.env.NODE_ENV === 'production') {
        try {
          await supabase.storage.from('lead-documents').remove([record.file_path]);
        } catch (e) {
          console.warn('Failed to delete file from storage:', e.message);
        }
      } else {
        const localPath = path.join(uploadsDir, record.file_path);
        if (fs.existsSync(localPath)) {
          fs.unlinkSync(localPath);
        }
      }
    }

    // Delete the specific file record by its ID
    const { error } = await supabase
      .from('lead_checklist_status')
      .delete()
      .eq('id', fileId);

    if (error) throw error;

    // Verify lead still exists after delete
    const { data: leadAfter } = await supabase
      .from('leads')
      .select('id')
      .eq('id', record.lead_id)
      .single();

    if (!leadAfter) {
      console.error('CRITICAL: Lead was deleted after checklist status delete! Possible cascade delete.');
      return res.status(500).json({ error: 'Lead was unexpectedly deleted - check DB cascade settings' });
    }

    console.log(`DELETE checklist-status file success: leadId=${record.lead_id} still exists`);
    res.json({ success: true, message: 'Document deleted' });
  } catch (error) {
    console.error('Delete document error:', error);
    res.status(500).json({ error: 'Failed to delete document' });
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
